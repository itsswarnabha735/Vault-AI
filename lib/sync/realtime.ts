/**
 * Real-time Subscription Manager for Vault-AI
 *
 * Manages Supabase real-time subscriptions for instant multi-device sync.
 * When changes occur on any device, they're immediately pushed to all
 * connected clients.
 *
 * PRIVACY NOTES:
 * - Real-time updates only contain sanitized accounting data
 * - Local-only fields (rawText, embedding, filePath) are preserved during updates
 * - No sensitive data is transmitted through the real-time channel
 */

import {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { getClient } from '@/lib/supabase/client';
import { db } from '@/lib/storage/db';
import type { TransactionId, CategoryId } from '@/types/database';
import type { Transaction as TransactionRow } from '@/types/supabase';
import type { RealtimeStatus } from '@/types/sync';

// ============================================
// Types
// ============================================

/** Unsubscribe function */
export type Unsubscribe = () => void;

/** Connection state */
export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

/** Real-time event types */
export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

/** Real-time change handler */
export type ChangeHandler = (
  eventType: RealtimeEventType,
  record: TransactionRow | null,
  oldRecord: TransactionRow | null
) => void;

/** Connection change handler */
export type ConnectionChangeHandler = (
  connected: boolean,
  state: ConnectionState
) => void;

/** Real-time manager interface */
export interface RealtimeManager {
  /** Subscribe to real-time updates for a user */
  subscribe(userId: string): Promise<void>;

  /** Unsubscribe from real-time updates */
  unsubscribe(): Promise<void>;

  /** Check if currently connected */
  isConnected(): boolean;

  /** Get current connection state */
  getConnectionState(): ConnectionState;

  /** Get detailed status */
  getStatus(): RealtimeStatus;

  /** Subscribe to connection state changes */
  onConnectionChange(callback: ConnectionChangeHandler): Unsubscribe;

  /** Subscribe to record changes */
  onChange(callback: ChangeHandler): Unsubscribe;

  /** Force reconnection */
  reconnect(): Promise<void>;

  /** Dispose of the manager */
  dispose(): void;
}

// ============================================
// Tab Coordination (avoid duplicate subscriptions)
// ============================================

const LEADER_CHANNEL = 'vault-ai-realtime-leader';
const LEADER_HEARTBEAT_INTERVAL = 5000; // 5 seconds
const LEADER_TIMEOUT = 10000; // 10 seconds

/**
 * Simple leader election for multi-tab coordination.
 * Only one tab should maintain the real-time subscription.
 */
class TabLeaderElection {
  private isLeader = false;
  private channel: BroadcastChannel | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastLeaderHeartbeat = 0;
  private tabId: string;
  private leadershipListeners: Set<(isLeader: boolean) => void> = new Set();

  constructor() {
    this.tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(LEADER_CHANNEL);
      this.channel.onmessage = this.handleMessage.bind(this);
      this.attemptLeadership();
    } else {
      // No BroadcastChannel support - assume leader
      this.isLeader = true;
    }
  }

  private handleMessage(event: MessageEvent) {
    const { type, tabId, timestamp } = event.data;

    switch (type) {
      case 'heartbeat':
        if (tabId !== this.tabId) {
          this.lastLeaderHeartbeat = timestamp;
          if (this.isLeader) {
            // Another leader exists - step down
            this.isLeader = false;
            this.notifyListeners();
            this.stopHeartbeat();
          }
        }
        break;
      case 'claim':
        if (tabId !== this.tabId && this.isLeader) {
          // Respond with heartbeat to assert leadership
          this.sendHeartbeat();
        }
        break;
    }
  }

  private attemptLeadership() {
    // Claim leadership
    this.channel?.postMessage({
      type: 'claim',
      tabId: this.tabId,
      timestamp: Date.now(),
    });

    // Wait a bit and check if we're the leader
    setTimeout(() => {
      const timeSinceHeartbeat = Date.now() - this.lastLeaderHeartbeat;
      if (
        timeSinceHeartbeat > LEADER_TIMEOUT ||
        this.lastLeaderHeartbeat === 0
      ) {
        this.becomeLeader();
      }
    }, 500);
  }

  private becomeLeader() {
    if (!this.isLeader) {
      console.log('[TabLeader] Becoming leader:', this.tabId);
      this.isLeader = true;
      this.startHeartbeat();
      this.notifyListeners();
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.sendHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, LEADER_HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendHeartbeat() {
    this.channel?.postMessage({
      type: 'heartbeat',
      tabId: this.tabId,
      timestamp: Date.now(),
    });
  }

  private notifyListeners() {
    this.leadershipListeners.forEach((listener) => {
      try {
        listener(this.isLeader);
      } catch (error) {
        console.error('[TabLeader] Error in listener:', error);
      }
    });
  }

  isCurrentLeader(): boolean {
    return this.isLeader;
  }

  onLeadershipChange(callback: (isLeader: boolean) => void): Unsubscribe {
    this.leadershipListeners.add(callback);
    // Immediately notify of current state
    callback(this.isLeader);
    return () => this.leadershipListeners.delete(callback);
  }

  dispose() {
    this.stopHeartbeat();
    this.channel?.close();
    this.channel = null;
    this.leadershipListeners.clear();
  }
}

// ============================================
// Real-time Manager Implementation
// ============================================

class RealtimeManagerImpl implements RealtimeManager {
  private channel: RealtimeChannel | null = null;
  private userId: string | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private lastEventAt: Date | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isDisposed = false;

  // Tab coordination
  private tabLeader: TabLeaderElection;
  private leaderUnsubscribe: Unsubscribe | null = null;

  // Event listeners
  private connectionListeners: Set<ConnectionChangeHandler> = new Set();
  private changeListeners: Set<ChangeHandler> = new Set();

  // Visibility handling
  private wasHidden = false;

  constructor() {
    this.tabLeader = new TabLeaderElection();

    // Set up visibility change handler for sleep/wake
    if (typeof document !== 'undefined') {
      document.addEventListener(
        'visibilitychange',
        this.handleVisibilityChange
      );
    }

    // Set up online/offline handlers
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
  }

  // ============================================
  // Public API
  // ============================================

  async subscribe(userId: string): Promise<void> {
    if (this.isDisposed) {
      throw new Error('RealtimeManager is disposed');
    }

    // Store userId for reconnection
    this.userId = userId;

    // Set up leader change handler
    if (!this.leaderUnsubscribe) {
      this.leaderUnsubscribe = this.tabLeader.onLeadershipChange((isLeader) => {
        if (isLeader && this.userId) {
          this.doSubscribe();
        } else {
          this.doUnsubscribe();
        }
      });
    }

    // Only subscribe if we're the leader
    if (this.tabLeader.isCurrentLeader()) {
      await this.doSubscribe();
    } else {
      console.log('[Realtime] Not leader - skipping subscription');
      this.setConnectionState('connected'); // Still mark as connected via leader
    }
  }

  async unsubscribe(): Promise<void> {
    this.userId = null;
    await this.doUnsubscribe();
  }

  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getStatus(): RealtimeStatus {
    return {
      connected: this.connectionState === 'connected',
      channel: this.channel ? `transactions:${this.userId}` : null,
      lastEventAt: this.lastEventAt,
      reconnectAttempts: this.reconnectAttempts,
      error: this.connectionState === 'error' ? 'Connection failed' : null,
    };
  }

  onConnectionChange(callback: ConnectionChangeHandler): Unsubscribe {
    this.connectionListeners.add(callback);
    // Immediately notify of current state
    callback(this.isConnected(), this.connectionState);
    return () => this.connectionListeners.delete(callback);
  }

  onChange(callback: ChangeHandler): Unsubscribe {
    this.changeListeners.add(callback);
    return () => this.changeListeners.delete(callback);
  }

  async reconnect(): Promise<void> {
    if (this.userId && this.tabLeader.isCurrentLeader()) {
      await this.doUnsubscribe();
      this.reconnectAttempts = 0;
      await this.doSubscribe();
    }
  }

  dispose(): void {
    this.isDisposed = true;
    this.doUnsubscribe();
    this.clearReconnectTimeout();
    this.tabLeader.dispose();
    this.leaderUnsubscribe?.();
    this.connectionListeners.clear();
    this.changeListeners.clear();

    if (typeof document !== 'undefined') {
      document.removeEventListener(
        'visibilitychange',
        this.handleVisibilityChange
      );
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
  }

  // ============================================
  // Internal Subscription Management
  // ============================================

  private async doSubscribe(): Promise<void> {
    if (this.channel || !this.userId) {
      return;
    }

    console.log('[Realtime] Subscribing to changes for user:', this.userId);
    this.setConnectionState('connecting');

    const supabase = getClient();

    this.channel = supabase
      .channel(`transactions:${this.userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${this.userId}`,
        },
        (payload) =>
          this.handleChange(
            payload as RealtimePostgresChangesPayload<TransactionRow>
          )
      )
      .on('system', { event: '*' }, (status) => {
        console.log('[Realtime] System event:', status);
      })
      .subscribe((status, error) => {
        console.log('[Realtime] Subscription status:', status, error);

        switch (status) {
          case 'SUBSCRIBED':
            this.setConnectionState('connected');
            this.reconnectAttempts = 0;
            break;
          case 'CHANNEL_ERROR':
          case 'TIMED_OUT':
            this.setConnectionState('error');
            this.scheduleReconnect();
            break;
          case 'CLOSED':
            this.setConnectionState('disconnected');
            break;
        }
      });
  }

  private async doUnsubscribe(): Promise<void> {
    if (this.channel) {
      console.log('[Realtime] Unsubscribing');
      const supabase = getClient();
      await supabase.removeChannel(this.channel);
      this.channel = null;
      this.setConnectionState('disconnected');
    }
  }

  // ============================================
  // Change Handlers
  // ============================================

  private async handleChange(
    payload: RealtimePostgresChangesPayload<TransactionRow>
  ): Promise<void> {
    this.lastEventAt = new Date();
    console.log('[Realtime] Change received:', payload.eventType);

    try {
      switch (payload.eventType) {
        case 'INSERT':
          await this.handleInsert(payload.new as TransactionRow);
          break;
        case 'UPDATE':
          await this.handleUpdate(
            payload.new as TransactionRow,
            payload.old as TransactionRow
          );
          break;
        case 'DELETE':
          await this.handleDelete(payload.old as TransactionRow);
          break;
      }

      // Notify change listeners
      this.emitChange(
        payload.eventType,
        payload.new as TransactionRow | null,
        payload.old as TransactionRow | null
      );
    } catch (error) {
      console.error('[Realtime] Error handling change:', error);
    }
  }

  /**
   * Handle INSERT events from real-time subscription.
   * Creates a new local record if it doesn't exist.
   */
  private async handleInsert(record: TransactionRow): Promise<void> {
    if (!record) {
      return;
    }

    // Check if transaction already exists locally
    const existing = await db.transactions.get(record.id as TransactionId);

    if (existing) {
      console.log(
        '[Realtime] INSERT - Record already exists locally:',
        record.id
      );
      return;
    }

    console.log('[Realtime] INSERT - Creating new local record:', record.id);

    // Create new local record (without embedding/rawText - these are local-only)
    await db.transactions.add({
      id: record.id as TransactionId,
      // Local-only fields - empty since this came from remote
      rawText: '',
      embedding: new Float32Array(384),
      filePath: '',
      fileSize: 0,
      mimeType: '',
      // Synced fields from remote
      date: record.date,
      amount: record.amount,
      vendor: record.vendor,
      category: record.category_id as CategoryId | null,
      note: record.note || '',
      currency: record.currency || 'INR',
      // Metadata
      confidence: 0,
      isManuallyEdited: false,
      createdAt: new Date(record.client_created_at),
      updatedAt: new Date(record.client_updated_at),
      // Sync state - already synced since it came from server
      syncStatus: 'synced',
      lastSyncAttempt: new Date(),
      syncError: null,
    });
  }

  /**
   * Handle UPDATE events from real-time subscription.
   * Updates local record if remote is newer, preserving local-only fields.
   */
  private async handleUpdate(
    newRecord: TransactionRow,
    _oldRecord: TransactionRow
  ): Promise<void> {
    if (!newRecord) {
      return;
    }

    const local = await db.transactions.get(newRecord.id as TransactionId);

    if (!local) {
      // Record doesn't exist locally - treat as insert
      console.log(
        '[Realtime] UPDATE - Record not found locally, treating as INSERT:',
        newRecord.id
      );
      await this.handleInsert(newRecord);
      return;
    }

    // Compare timestamps
    const remoteUpdatedAt = new Date(newRecord.server_updated_at);
    const localUpdatedAt = local.updatedAt;

    // Check for conflict - local has pending changes
    if (local.syncStatus === 'pending') {
      console.log('[Realtime] UPDATE - Conflict detected for:', newRecord.id);
      // Don't overwrite pending local changes - let sync engine handle conflict
      // The sync engine will detect this during next sync
      return;
    }

    // Only update if remote is newer
    if (remoteUpdatedAt > localUpdatedAt) {
      console.log('[Realtime] UPDATE - Applying remote changes:', newRecord.id);

      // Update ONLY synced fields, preserve local-only fields
      await db.transactions.update(newRecord.id as TransactionId, {
        date: newRecord.date,
        amount: newRecord.amount,
        vendor: newRecord.vendor,
        category: newRecord.category_id as CategoryId | null,
        note: newRecord.note || '',
        currency: newRecord.currency || 'INR',
        updatedAt: new Date(newRecord.client_updated_at),
        syncStatus: 'synced',
        lastSyncAttempt: new Date(),
        syncError: null,
        // PRESERVE local-only fields:
        // - rawText (kept)
        // - embedding (kept)
        // - filePath (kept)
        // - fileSize (kept)
        // - mimeType (kept)
        // - confidence (kept)
        // - isManuallyEdited (kept)
      });
    } else {
      console.log(
        '[Realtime] UPDATE - Local is newer, ignoring remote:',
        newRecord.id
      );
    }
  }

  /**
   * Handle DELETE events from real-time subscription.
   * Soft-deletes the local record but preserves the file if it exists.
   */
  private async handleDelete(record: TransactionRow): Promise<void> {
    if (!record) {
      return;
    }

    const local = await db.transactions.get(record.id as TransactionId);

    if (!local) {
      console.log('[Realtime] DELETE - Record not found locally:', record.id);
      return;
    }

    console.log('[Realtime] DELETE - Removing local record:', record.id);

    // Check if local file exists - we'll keep it but remove the transaction
    // This allows users to recover the document if needed
    if (local.filePath) {
      console.log('[Realtime] DELETE - Keeping local file:', local.filePath);
      // Could optionally move to a "deleted" folder or mark for cleanup
    }

    // Delete the local transaction record
    await db.transactions.delete(record.id as TransactionId);
  }

  // ============================================
  // Reconnection Logic
  // ============================================

  private scheduleReconnect(): void {
    if (this.isDisposed || !this.userId) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Realtime] Max reconnect attempts reached');
      this.setConnectionState('error');
      return;
    }

    this.clearReconnectTimeout();

    // Exponential backoff with jitter
    const baseDelay = 1000;
    const maxDelay = 30000;
    const delay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
      maxDelay
    );

    console.log(
      `[Realtime] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`
    );

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectAttempts++;
      await this.doUnsubscribe();
      await this.doSubscribe();
    }, delay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // ============================================
  // Event Handlers
  // ============================================

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.wasHidden = true;
    } else if (this.wasHidden) {
      // Tab became visible after being hidden - reconnect to catch up
      this.wasHidden = false;
      console.log('[Realtime] Tab became visible - checking connection');

      if (this.userId && this.tabLeader.isCurrentLeader()) {
        // Force reconnection to ensure we have latest data
        this.reconnect().catch((error) => {
          console.error(
            '[Realtime] Reconnect after visibility change failed:',
            error
          );
        });
      }
    }
  };

  private handleOnline = (): void => {
    console.log('[Realtime] Network online - reconnecting');
    if (this.userId && this.tabLeader.isCurrentLeader()) {
      this.reconnectAttempts = 0;
      this.doSubscribe().catch((error) => {
        console.error('[Realtime] Reconnect after online failed:', error);
      });
    }
  };

  private handleOffline = (): void => {
    console.log('[Realtime] Network offline');
    this.setConnectionState('disconnected');
    this.clearReconnectTimeout();
  };

  // ============================================
  // State Management
  // ============================================

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      const _wasConnected = this.connectionState === 'connected';
      this.connectionState = state;
      const isConnected = state === 'connected';

      // Notify listeners
      this.connectionListeners.forEach((listener) => {
        try {
          listener(isConnected, state);
        } catch (error) {
          console.error('[Realtime] Error in connection listener:', error);
        }
      });
    }
  }

  private emitChange(
    eventType: RealtimeEventType,
    record: TransactionRow | null,
    oldRecord: TransactionRow | null
  ): void {
    this.changeListeners.forEach((listener) => {
      try {
        listener(eventType, record, oldRecord);
      } catch (error) {
        console.error('[Realtime] Error in change listener:', error);
      }
    });
  }
}

// ============================================
// Singleton Instance
// ============================================

let realtimeManagerInstance: RealtimeManager | null = null;

/**
 * Get the singleton RealtimeManager instance.
 */
export function getRealtimeManager(): RealtimeManager {
  if (!realtimeManagerInstance) {
    realtimeManagerInstance = new RealtimeManagerImpl();
  }
  return realtimeManagerInstance;
}

/**
 * Create a new RealtimeManager instance (for testing).
 */
export function createRealtimeManager(): RealtimeManager {
  return new RealtimeManagerImpl();
}

export { RealtimeManagerImpl };
