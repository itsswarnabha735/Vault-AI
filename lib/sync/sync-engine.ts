/**
 * Vault-AI Sync Engine
 *
 * Core synchronization engine for syncing local data with Supabase cloud.
 *
 * CRITICAL PRIVACY RULES:
 * - NEVER sync rawText, embeddings, or filePath to the cloud
 * - ONLY sync sanitized accounting data (id, date, amount, vendor, category, note)
 * - All writes go to IndexedDB first (offline-first)
 * - Background sync every 30 seconds when online
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/storage/db';
import { getClient } from '@/lib/supabase/client';
import { SyncError } from '@/lib/errors';
import type {
  LocalTransaction,
  TransactionId,
  CategoryId,
} from '@/types/database';
import type {
  SyncEngineState,
  SyncEngineStatus,
  SyncResult,
  SyncConflict,
  SyncError as SyncErrorType,
  SyncConfig,
  DEFAULT_SYNC_CONFIG,
  SyncEventType,
  ConflictResolution,
} from '@/types/sync';
import type { TransactionInsert, TransactionRow } from '@/types/supabase';

// ============================================
// Types
// ============================================

/** Unsubscribe function for event listeners */
export type Unsubscribe = () => void;

/** Syncable transaction data - ONLY these fields leave the device */
export interface SyncableTransaction {
  id: string;
  user_id: string;
  date: string;
  amount: number;
  vendor: string;
  category_id: string | null;
  note: string | null;
  currency: string;
  client_created_at: string;
  client_updated_at: string;
}

/** Fields that must NEVER be synced to the cloud */
const NEVER_SYNC_FIELDS = [
  'rawText',
  'embedding',
  'filePath',
  'fileSize',
  'mimeType',
  'confidence',
  'ocrOutput',
  'syncStatus',
  'lastSyncAttempt',
  'syncError',
  'isManuallyEdited',
] as const;

// ============================================
// Sync Engine Interface
// ============================================

export interface SyncEngine {
  /** Start the sync engine (begins background sync) */
  start(): void;

  /** Stop the sync engine completely */
  stop(): void;

  /** Pause sync without stopping (can resume) */
  pause(): void;

  /** Resume paused sync */
  resume(): void;

  /** Trigger immediate sync */
  syncNow(): Promise<SyncResult>;

  /** Get current sync status */
  getSyncStatus(): SyncEngineStatus;

  /** Get count of pending changes */
  getPendingCount(): Promise<number>;

  /** Get all unresolved conflicts */
  getConflicts(): Promise<SyncConflict[]>;

  /** Resolve a conflict */
  resolveConflict(id: string, resolution: 'local' | 'remote'): Promise<void>;

  /** Subscribe to sync start events */
  onSyncStart(callback: () => void): Unsubscribe;

  /** Subscribe to sync complete events */
  onSyncComplete(callback: (result: SyncResult) => void): Unsubscribe;

  /** Subscribe to sync error events */
  onSyncError(callback: (error: Error) => void): Unsubscribe;

  /** Subscribe to conflict events */
  onConflict(callback: (conflict: SyncConflict) => void): Unsubscribe;

  /** Update sync configuration */
  updateConfig(config: Partial<SyncConfig>): void;

  /** Get current configuration */
  getConfig(): SyncConfig;

  /** Check if currently online */
  isOnline(): boolean;

  /** Dispose of the sync engine */
  dispose(): void;
}

// ============================================
// Privacy Filter (CRITICAL)
// ============================================

/**
 * Sanitize a local transaction for cloud sync.
 *
 * CRITICAL: This function ensures privacy-sensitive data NEVER leaves the device.
 * Only accounting data (amounts, vendors, dates) is included in the output.
 *
 * @param transaction - Local transaction with all fields
 * @param userId - User ID for the transaction
 * @returns Sanitized transaction safe for cloud sync
 */
export function sanitizeForSync(
  transaction: LocalTransaction,
  userId: string
): SyncableTransaction {
  // PRIVACY CHECK: Verify we're not accidentally including sensitive fields
  const sanitized: SyncableTransaction = {
    id: transaction.id,
    user_id: userId,
    date: transaction.date,
    amount: transaction.amount,
    vendor: transaction.vendor,
    category_id: transaction.category as string | null,
    note: transaction.note || null,
    currency: transaction.currency || 'USD',
    client_created_at: transaction.createdAt.toISOString(),
    client_updated_at: transaction.updatedAt.toISOString(),
  };

  // Double-check: ensure no sensitive fields leaked
  const sensitiveFields = Object.keys(sanitized).filter((key) =>
    NEVER_SYNC_FIELDS.includes(key as (typeof NEVER_SYNC_FIELDS)[number])
  );

  if (sensitiveFields.length > 0) {
    throw new SyncError(
      `PRIVACY VIOLATION: Attempted to sync sensitive fields: ${sensitiveFields.join(', ')}`,
      false
    );
  }

  return sanitized;
}

/**
 * Verify that a payload doesn't contain sensitive data.
 * This is a runtime safety check before any network transmission.
 *
 * @param payload - Data to verify
 * @throws SyncError if sensitive data is detected
 */
export function verifySafePayload(payload: unknown): void {
  const json = JSON.stringify(payload);

  for (const field of NEVER_SYNC_FIELDS) {
    // Check for field names in the JSON
    if (json.includes(`"${field}"`)) {
      throw new SyncError(
        `PRIVACY VIOLATION: Payload contains sensitive field '${field}'`,
        false
      );
    }
  }

  // Check for embedding-like patterns (Float32Array data)
  if (json.match(/\[0\.\d{5,},/)) {
    throw new SyncError(
      'PRIVACY VIOLATION: Payload appears to contain embedding data',
      false
    );
  }
}

// ============================================
// Sync Engine Implementation
// ============================================

class SyncEngineImpl implements SyncEngine {
  private status: SyncEngineStatus = {
    state: 'idle',
    lastSyncAt: null,
    pendingChanges: 0,
    failedChanges: 0,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    syncProgress: null,
    currentOperation: null,
  };

  private config: SyncConfig = {
    enabled: true,
    syncIntervalMs: 30000, // 30 seconds
    batchSize: 100,
    maxRetries: 3,
    retryDelayBaseMs: 1000,
    maxRetryDelayMs: 30000,
    autoResolveConflicts: true,
    defaultResolution: 'local', // Last write wins
    syncOnMetered: true,
    minBatteryLevel: 15,
  };

  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isDisposed = false;

  // Event listeners
  private syncStartListeners: Set<() => void> = new Set();
  private syncCompleteListeners: Set<(result: SyncResult) => void> = new Set();
  private syncErrorListeners: Set<(error: Error) => void> = new Set();
  private conflictListeners: Set<(conflict: SyncConflict) => void> = new Set();

  // Conflict storage
  private conflicts: Map<string, SyncConflict> = new Map();

  // Singleton supabase client getter
  private get supabase() {
    return getClient();
  }

  constructor() {
    // Set up online/offline listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
  }

  // ============================================
  // Lifecycle Methods
  // ============================================

  start(): void {
    if (this.isDisposed) {
      throw new SyncError('Cannot start disposed sync engine', false);
    }

    if (!this.config.enabled) {
      console.log('[SyncEngine] Sync is disabled');
      return;
    }

    if (this.syncInterval) {
      console.log('[SyncEngine] Already running');
      return;
    }

    console.log('[SyncEngine] Starting background sync');
    this.status.state = this.status.isOnline ? 'idle' : 'offline';

    // Start periodic sync
    this.syncInterval = setInterval(() => {
      if (this.status.isOnline && this.status.state === 'idle') {
        this.syncNow().catch((err) => {
          console.error('[SyncEngine] Background sync error:', err);
        });
      }
    }, this.config.syncIntervalMs);

    // Do an initial sync
    if (this.status.isOnline) {
      this.syncNow().catch((err) => {
        console.error('[SyncEngine] Initial sync error:', err);
      });
    }
  }

  stop(): void {
    console.log('[SyncEngine] Stopping');

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    this.status.state = 'idle';
  }

  pause(): void {
    console.log('[SyncEngine] Pausing');
    this.status.state = 'paused';
  }

  resume(): void {
    console.log('[SyncEngine] Resuming');

    if (this.status.state === 'paused') {
      this.status.state = this.status.isOnline ? 'idle' : 'offline';

      // Trigger immediate sync on resume
      if (this.status.isOnline) {
        this.syncNow().catch((err) => {
          console.error('[SyncEngine] Resume sync error:', err);
        });
      }
    }
  }

  dispose(): void {
    this.stop();
    this.isDisposed = true;

    // Remove event listeners
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }

    // Clear all listeners
    this.syncStartListeners.clear();
    this.syncCompleteListeners.clear();
    this.syncErrorListeners.clear();
    this.conflictListeners.clear();
  }

  // ============================================
  // Core Sync Methods
  // ============================================

  async syncNow(): Promise<SyncResult> {
    const startTime = performance.now();

    // Check if we can sync
    if (this.status.state === 'syncing') {
      console.log('[SyncEngine] Sync already in progress');
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        autoResolvedConflicts: 0,
        errors: [],
        durationMs: 0,
        completedAt: new Date(),
      };
    }

    if (this.status.state === 'paused') {
      console.log('[SyncEngine] Sync is paused');
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        autoResolvedConflicts: 0,
        errors: [
          {
            code: 'NETWORK_ERROR',
            message: 'Sync is paused',
            recoverable: true,
            retryCount: 0,
          },
        ],
        durationMs: 0,
        completedAt: new Date(),
      };
    }

    if (!this.status.isOnline) {
      console.log('[SyncEngine] Offline - cannot sync');
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        autoResolvedConflicts: 0,
        errors: [
          {
            code: 'NETWORK_ERROR',
            message: 'Device is offline',
            recoverable: true,
            retryCount: 0,
          },
        ],
        durationMs: 0,
        completedAt: new Date(),
      };
    }

    // Get current user
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) {
      console.log('[SyncEngine] No authenticated user');
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        autoResolvedConflicts: 0,
        errors: [
          {
            code: 'AUTH_ERROR',
            message: 'User not authenticated',
            recoverable: false,
            retryCount: 0,
          },
        ],
        durationMs: 0,
        completedAt: new Date(),
      };
    }

    // Start sync
    this.status.state = 'syncing';
    this.status.syncProgress = 0;
    this.status.currentOperation = 'Preparing sync...';
    this.emitSyncStart();

    const errors: SyncErrorType[] = [];
    let uploaded = 0;
    let downloaded = 0;
    let conflictCount = 0;
    let autoResolved = 0;

    try {
      // Phase 1: Upload pending local changes
      this.status.currentOperation = 'Uploading local changes...';
      this.status.syncProgress = 10;
      const uploadResult = await this.uploadPendingChanges(user.id);
      uploaded = uploadResult.uploaded;
      errors.push(...uploadResult.errors);

      // Phase 2: Download remote changes
      this.status.currentOperation = 'Downloading remote changes...';
      this.status.syncProgress = 50;
      const downloadResult = await this.downloadRemoteChanges(user.id);
      downloaded = downloadResult.downloaded;
      errors.push(...downloadResult.errors);

      // Phase 3: Detect and handle conflicts
      this.status.currentOperation = 'Resolving conflicts...';
      this.status.syncProgress = 80;
      const conflictResult = await this.detectConflicts();
      conflictCount = conflictResult.detected;
      autoResolved = conflictResult.autoResolved;

      // Update status
      this.status.syncProgress = 100;
      this.status.currentOperation = null;
      this.status.lastSyncAt = new Date();
      this.status.state = 'idle';
      this.status.pendingChanges = await this.getPendingCount();

      const result: SyncResult = {
        success: errors.length === 0,
        uploaded,
        downloaded,
        conflicts: conflictCount,
        autoResolvedConflicts: autoResolved,
        errors,
        durationMs: performance.now() - startTime,
        completedAt: new Date(),
      };

      this.emitSyncComplete(result);
      return result;
    } catch (error) {
      this.status.state = 'error';
      this.status.syncProgress = null;
      this.status.currentOperation = null;

      const syncError =
        error instanceof Error ? error : new Error(String(error));
      this.emitSyncError(syncError);

      return {
        success: false,
        uploaded,
        downloaded,
        conflicts: conflictCount,
        autoResolvedConflicts: autoResolved,
        errors: [
          ...errors,
          {
            code: 'UNKNOWN',
            message: syncError.message,
            recoverable: true,
            retryCount: 0,
          },
        ],
        durationMs: performance.now() - startTime,
        completedAt: new Date(),
      };
    }
  }

  // ============================================
  // Upload Methods
  // ============================================

  private async uploadPendingChanges(
    userId: string
  ): Promise<{ uploaded: number; errors: SyncErrorType[] }> {
    const errors: SyncErrorType[] = [];
    let uploaded = 0;

    // Get pending transactions
    const pending = await db.transactions
      .where('syncStatus')
      .equals('pending')
      .limit(this.config.batchSize)
      .toArray();

    if (pending.length === 0) {
      return { uploaded: 0, errors: [] };
    }

    console.log(
      `[SyncEngine] Uploading ${pending.length} pending transactions`
    );

    // Sanitize all transactions (PRIVACY CRITICAL)
    const sanitized: SyncableTransaction[] = [];
    for (const tx of pending) {
      try {
        const safe = sanitizeForSync(tx, userId);
        verifySafePayload(safe); // Double-check
        sanitized.push(safe);
      } catch (error) {
        console.error(
          `[SyncEngine] Failed to sanitize transaction ${tx.id}:`,
          error
        );
        errors.push({
          code: 'VALIDATION_ERROR',
          message:
            error instanceof Error ? error.message : 'Sanitization failed',
          recordId: tx.id,
          recordType: 'transaction',
          recoverable: false,
          retryCount: 0,
        });
      }
    }

    if (sanitized.length === 0) {
      return { uploaded: 0, errors };
    }

    // Final privacy verification before network call
    verifySafePayload(sanitized);

    // Upsert to Supabase
    const { error: upsertError } = await this.supabase
      .from('transactions')
      .upsert(sanitized as TransactionInsert[], { onConflict: 'id' });

    if (upsertError) {
      console.error('[SyncEngine] Upsert error:', upsertError);
      errors.push({
        code: 'SERVER_ERROR',
        message: upsertError.message,
        recoverable: true,
        retryCount: 0,
      });

      // Mark as error
      await db.updateSyncStatus(
        sanitized.map((t) => t.id as TransactionId),
        'error',
        upsertError.message
      );

      return { uploaded: 0, errors };
    }

    // Mark as synced
    await db.updateSyncStatus(
      sanitized.map((t) => t.id as TransactionId),
      'synced'
    );

    uploaded = sanitized.length;
    console.log(`[SyncEngine] Successfully uploaded ${uploaded} transactions`);

    return { uploaded, errors };
  }

  // ============================================
  // Download Methods
  // ============================================

  private async downloadRemoteChanges(
    userId: string
  ): Promise<{ downloaded: number; errors: SyncErrorType[] }> {
    const errors: SyncErrorType[] = [];
    let downloaded = 0;

    // Get last sync time
    const lastSync = this.status.lastSyncAt || new Date(0);

    // Fetch remote changes since last sync
    const { data, error } = await this.supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .gt('server_updated_at', lastSync.toISOString())
      .order('server_updated_at', { ascending: true });

    if (error) {
      console.error('[SyncEngine] Download error:', error);
      errors.push({
        code: 'SERVER_ERROR',
        message: error.message,
        recoverable: true,
        retryCount: 0,
      });
      return { downloaded: 0, errors };
    }

    if (!data || data.length === 0) {
      return { downloaded: 0, errors: [] };
    }

    console.log(`[SyncEngine] Downloaded ${data.length} remote changes`);

    // Merge into local database
    for (const remote of data as TransactionRow[]) {
      try {
        await this.mergeRemoteTransaction(remote);
        downloaded++;
      } catch (err) {
        console.error(
          `[SyncEngine] Failed to merge transaction ${remote.id}:`,
          err
        );
        errors.push({
          code: 'CONFLICT',
          message: err instanceof Error ? err.message : 'Merge failed',
          recordId: remote.id,
          recordType: 'transaction',
          recoverable: true,
          retryCount: 0,
        });
      }
    }

    return { downloaded, errors };
  }

  private async mergeRemoteTransaction(remote: TransactionRow): Promise<void> {
    const local = await db.transactions.get(remote.id as TransactionId);

    if (!local) {
      // New remote record - create locally
      // Note: We create a minimal local record since we don't have raw text/embedding
      await db.transactions.add({
        id: remote.id as TransactionId,
        rawText: '', // Not available from remote
        embedding: new Float32Array(384), // Empty embedding
        filePath: '', // Not available from remote
        fileSize: 0,
        mimeType: '',
        date: remote.date,
        amount: remote.amount,
        vendor: remote.vendor,
        category: remote.category_id as CategoryId | null,
        note: remote.note || '',
        currency: remote.currency || 'USD',
        confidence: 0,
        isManuallyEdited: false,
        createdAt: new Date(remote.client_created_at),
        updatedAt: new Date(remote.client_updated_at),
        syncStatus: 'synced',
        lastSyncAttempt: new Date(),
        syncError: null,
      });
      return;
    }

    // Check for conflict
    const remoteUpdatedAt = new Date(remote.server_updated_at);
    const localUpdatedAt = local.updatedAt;

    if (local.syncStatus === 'pending' && remoteUpdatedAt > localUpdatedAt) {
      // Conflict detected - local has pending changes but remote is newer
      const conflict = this.createConflict(local, remote);
      this.conflicts.set(conflict.id, conflict);
      this.emitConflict(conflict);

      if (this.config.autoResolveConflicts) {
        await this.resolveConflict(conflict.id, this.config.defaultResolution);
      }
      return;
    }

    // Remote is newer - update local (preserve local-only fields)
    if (remoteUpdatedAt > localUpdatedAt) {
      await db.transactions.update(remote.id as TransactionId, {
        date: remote.date,
        amount: remote.amount,
        vendor: remote.vendor,
        category: remote.category_id as CategoryId | null,
        note: remote.note || '',
        currency: remote.currency || 'USD',
        updatedAt: new Date(remote.client_updated_at),
        syncStatus: 'synced',
        lastSyncAttempt: new Date(),
        syncError: null,
      });
    }
  }

  // ============================================
  // Conflict Methods
  // ============================================

  private async detectConflicts(): Promise<{
    detected: number;
    autoResolved: number;
  }> {
    // Conflicts are detected during merge - this just returns counts
    return {
      detected: this.conflicts.size,
      autoResolved: 0,
    };
  }

  private createConflict(
    local: LocalTransaction,
    remote: TransactionRow
  ): SyncConflict {
    return {
      id: uuidv4(),
      recordId: local.id,
      recordType: 'transaction',
      localVersion: {
        data: {
          date: local.date,
          amount: local.amount,
          vendor: local.vendor,
          category: local.category,
          note: local.note,
        },
        updatedAt: local.updatedAt,
        source: 'local',
      },
      remoteVersion: {
        data: {
          date: remote.date,
          amount: remote.amount,
          vendor: remote.vendor,
          category: remote.category_id,
          note: remote.note,
        },
        updatedAt: new Date(remote.server_updated_at),
        source: 'remote',
      },
      detectedAt: new Date(),
      status: 'pending',
    };
  }

  async getConflicts(): Promise<SyncConflict[]> {
    return Array.from(this.conflicts.values()).filter(
      (c) => c.status === 'pending'
    );
  }

  async resolveConflict(
    id: string,
    resolution: 'local' | 'remote'
  ): Promise<void> {
    const conflict = this.conflicts.get(id);
    if (!conflict) {
      throw new SyncError(`Conflict ${id} not found`, false);
    }

    const transactionId = conflict.recordId as TransactionId;

    if (resolution === 'local') {
      // Keep local version - just mark as pending for re-upload
      await db.transactions.update(transactionId, {
        syncStatus: 'pending',
        lastSyncAttempt: new Date(),
      });
    } else {
      // Use remote version
      const remote = conflict.remoteVersion.data as Record<string, unknown>;
      await db.transactions.update(transactionId, {
        date: remote.date as string,
        amount: remote.amount as number,
        vendor: remote.vendor as string,
        category: remote.category as CategoryId | null,
        note: (remote.note as string) || '',
        updatedAt: conflict.remoteVersion.updatedAt,
        syncStatus: 'synced',
        lastSyncAttempt: new Date(),
        syncError: null,
      });
    }

    // Update conflict status
    conflict.status = 'resolved';
    conflict.resolution = resolution;
    conflict.resolvedBy = 'user';
    conflict.resolvedAt = new Date();
    this.conflicts.set(id, conflict);
  }

  // ============================================
  // Status & Configuration Methods
  // ============================================

  getSyncStatus(): SyncEngineStatus {
    return { ...this.status };
  }

  async getPendingCount(): Promise<number> {
    return db.transactions.where('syncStatus').equals('pending').count();
  }

  updateConfig(config: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart interval if running and interval changed
    if (this.syncInterval && config.syncIntervalMs !== undefined) {
      this.stop();
      this.start();
    }
  }

  getConfig(): SyncConfig {
    return { ...this.config };
  }

  isOnline(): boolean {
    return this.status.isOnline;
  }

  // ============================================
  // Event Handlers
  // ============================================

  private handleOnline = (): void => {
    console.log('[SyncEngine] Online');
    this.status.isOnline = true;

    if (this.status.state === 'offline') {
      this.status.state = 'idle';
      // Trigger sync when coming online
      this.syncNow().catch((err) => {
        console.error('[SyncEngine] Online sync error:', err);
      });
    }
  };

  private handleOffline = (): void => {
    console.log('[SyncEngine] Offline');
    this.status.isOnline = false;
    this.status.state = 'offline';
  };

  // ============================================
  // Event Emitters
  // ============================================

  onSyncStart(callback: () => void): Unsubscribe {
    this.syncStartListeners.add(callback);
    return () => this.syncStartListeners.delete(callback);
  }

  onSyncComplete(callback: (result: SyncResult) => void): Unsubscribe {
    this.syncCompleteListeners.add(callback);
    return () => this.syncCompleteListeners.delete(callback);
  }

  onSyncError(callback: (error: Error) => void): Unsubscribe {
    this.syncErrorListeners.add(callback);
    return () => this.syncErrorListeners.delete(callback);
  }

  onConflict(callback: (conflict: SyncConflict) => void): Unsubscribe {
    this.conflictListeners.add(callback);
    return () => this.conflictListeners.delete(callback);
  }

  private emitSyncStart(): void {
    this.syncStartListeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error('[SyncEngine] Error in sync start listener:', err);
      }
    });
  }

  private emitSyncComplete(result: SyncResult): void {
    this.syncCompleteListeners.forEach((cb) => {
      try {
        cb(result);
      } catch (err) {
        console.error('[SyncEngine] Error in sync complete listener:', err);
      }
    });
  }

  private emitSyncError(error: Error): void {
    this.syncErrorListeners.forEach((cb) => {
      try {
        cb(error);
      } catch (err) {
        console.error('[SyncEngine] Error in sync error listener:', err);
      }
    });
  }

  private emitConflict(conflict: SyncConflict): void {
    this.conflictListeners.forEach((cb) => {
      try {
        cb(conflict);
      } catch (err) {
        console.error('[SyncEngine] Error in conflict listener:', err);
      }
    });
  }
}

// ============================================
// Singleton Instance
// ============================================

let syncEngineInstance: SyncEngine | null = null;

/**
 * Get the singleton SyncEngine instance.
 * Creates the instance on first call.
 */
export function getSyncEngine(): SyncEngine {
  if (!syncEngineInstance) {
    syncEngineInstance = new SyncEngineImpl();
  }
  return syncEngineInstance;
}

/**
 * Create a new SyncEngine instance (for testing).
 */
export function createSyncEngine(): SyncEngine {
  return new SyncEngineImpl();
}

export { SyncEngineImpl };
