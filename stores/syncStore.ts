/**
 * Sync Store for Vault-AI
 *
 * Zustand store for managing synchronization state across the application.
 * Provides reactive access to sync status, pending changes, and conflicts.
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type {
  SyncEngineState,
  SyncEngineStatus,
  SyncResult,
  SyncConflict,
  SyncConfig,
} from '@/types/sync';

// ============================================
// Store Types
// ============================================

/** Sync history entry */
export interface SyncHistoryEntry {
  id: string;
  result: SyncResult;
  timestamp: Date;
}

/** Store state */
export interface SyncState {
  // Connection status
  isOnline: boolean;

  // Sync engine state
  syncState: SyncEngineState;

  // Pending changes count
  pendingCount: number;

  // Last sync information
  lastSyncAt: Date | null;
  lastSyncResult: SyncResult | null;

  // Sync progress (0-100 when syncing, null when idle)
  syncProgress: number | null;

  // Current operation description
  currentOperation: string | null;

  // Active conflicts
  conflicts: SyncConflict[];

  // Sync history (last N syncs)
  syncHistory: SyncHistoryEntry[];

  // Sync configuration
  config: SyncConfig;

  // Error state
  lastError: Error | null;
}

/** Store actions */
export interface SyncActions {
  // Status updates
  setOnline: (isOnline: boolean) => void;
  setSyncState: (state: SyncEngineState) => void;
  setPendingCount: (count: number) => void;
  setSyncProgress: (progress: number | null, operation?: string | null) => void;

  // Sync completion
  onSyncComplete: (result: SyncResult) => void;
  onSyncError: (error: Error) => void;

  // Conflict management
  addConflict: (conflict: SyncConflict) => void;
  removeConflict: (id: string) => void;
  clearConflicts: () => void;
  resolveConflict: (id: string, resolution: 'local' | 'remote') => void;

  // Configuration
  updateConfig: (config: Partial<SyncConfig>) => void;

  // History management
  clearHistory: () => void;

  // Reset
  reset: () => void;
}

/** Combined store type */
export type SyncStore = SyncState & SyncActions;

// ============================================
// Default Values
// ============================================

const DEFAULT_CONFIG: SyncConfig = {
  enabled: true,
  syncIntervalMs: 30000, // 30 seconds
  batchSize: 100,
  maxRetries: 3,
  retryDelayBaseMs: 1000,
  maxRetryDelayMs: 30000,
  autoResolveConflicts: true,
  defaultResolution: 'local',
  syncOnMetered: true,
  minBatteryLevel: 15,
};

const MAX_HISTORY_ENTRIES = 50;

const initialState: SyncState = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncState: 'idle',
  pendingCount: 0,
  lastSyncAt: null,
  lastSyncResult: null,
  syncProgress: null,
  currentOperation: null,
  conflicts: [],
  syncHistory: [],
  config: DEFAULT_CONFIG,
  lastError: null,
};

// ============================================
// Store Implementation
// ============================================

export const useSyncStore = create<SyncStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // Initial state
      ...initialState,

      // ============================================
      // Status Updates
      // ============================================

      setOnline: (isOnline) =>
        set(
          (state) => ({
            isOnline,
            // Transition to offline state if going offline
            syncState: !isOnline
              ? 'offline'
              : state.syncState === 'offline'
                ? 'idle'
                : state.syncState,
          }),
          false,
          'setOnline'
        ),

      setSyncState: (syncState) =>
        set(
          {
            syncState,
            // Clear progress when leaving syncing state
            syncProgress: syncState === 'syncing' ? 0 : null,
            currentOperation: syncState === 'syncing' ? 'Starting...' : null,
          },
          false,
          'setSyncState'
        ),

      setPendingCount: (pendingCount) =>
        set({ pendingCount }, false, 'setPendingCount'),

      setSyncProgress: (syncProgress, currentOperation = null) =>
        set({ syncProgress, currentOperation }, false, 'setSyncProgress'),

      // ============================================
      // Sync Completion
      // ============================================

      onSyncComplete: (result) =>
        set(
          (state) => {
            // Add to history
            const historyEntry: SyncHistoryEntry = {
              id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              result,
              timestamp: new Date(),
            };

            const newHistory = [historyEntry, ...state.syncHistory].slice(
              0,
              MAX_HISTORY_ENTRIES
            );

            return {
              syncState: result.success ? 'idle' : 'error',
              lastSyncAt: result.completedAt,
              lastSyncResult: result,
              syncProgress: null,
              currentOperation: null,
              syncHistory: newHistory,
              lastError: result.success ? null : state.lastError,
            };
          },
          false,
          'onSyncComplete'
        ),

      onSyncError: (error) =>
        set(
          {
            syncState: 'error',
            lastError: error,
            syncProgress: null,
            currentOperation: null,
          },
          false,
          'onSyncError'
        ),

      // ============================================
      // Conflict Management
      // ============================================

      addConflict: (conflict) =>
        set(
          (state) => {
            // Check if conflict already exists
            const exists = state.conflicts.some((c) => c.id === conflict.id);
            if (exists) {
              return state;
            }
            return { conflicts: [...state.conflicts, conflict] };
          },
          false,
          'addConflict'
        ),

      removeConflict: (id) =>
        set(
          (state) => ({
            conflicts: state.conflicts.filter((c) => c.id !== id),
          }),
          false,
          'removeConflict'
        ),

      clearConflicts: () => set({ conflicts: [] }, false, 'clearConflicts'),

      resolveConflict: (id, resolution) =>
        set(
          (state) => ({
            conflicts: state.conflicts.map((c) =>
              c.id === id
                ? {
                    ...c,
                    status: 'resolved' as const,
                    resolution,
                    resolvedBy: 'user' as const,
                    resolvedAt: new Date(),
                  }
                : c
            ),
          }),
          false,
          'resolveConflict'
        ),

      // ============================================
      // Configuration
      // ============================================

      updateConfig: (configUpdate) =>
        set(
          (state) => ({
            config: { ...state.config, ...configUpdate },
          }),
          false,
          'updateConfig'
        ),

      // ============================================
      // History Management
      // ============================================

      clearHistory: () => set({ syncHistory: [] }, false, 'clearHistory'),

      // ============================================
      // Reset
      // ============================================

      reset: () =>
        set(
          {
            ...initialState,
            isOnline:
              typeof navigator !== 'undefined' ? navigator.onLine : true,
          },
          false,
          'reset'
        ),
    })),
    { name: 'SyncStore' }
  )
);

// ============================================
// Selectors
// ============================================

/** Select online status */
export const selectIsOnline = (state: SyncStore) => state.isOnline;

/** Select sync state */
export const selectSyncState = (state: SyncStore) => state.syncState;

/** Select if currently syncing */
export const selectIsSyncing = (state: SyncStore) =>
  state.syncState === 'syncing';

/** Select pending count */
export const selectPendingCount = (state: SyncStore) => state.pendingCount;

/** Select if has pending changes */
export const selectHasPendingChanges = (state: SyncStore) =>
  state.pendingCount > 0;

/** Select last sync date */
export const selectLastSyncAt = (state: SyncStore) => state.lastSyncAt;

/** Select last sync result */
export const selectLastSyncResult = (state: SyncStore) => state.lastSyncResult;

/** Select sync progress */
export const selectSyncProgress = (state: SyncStore) => state.syncProgress;

/** Select current operation */
export const selectCurrentOperation = (state: SyncStore) =>
  state.currentOperation;

/** Select conflicts */
export const selectConflicts = (state: SyncStore) => state.conflicts;

/** Select pending conflicts only */
export const selectPendingConflicts = (state: SyncStore) =>
  state.conflicts.filter((c) => c.status === 'pending');

/** Select if has conflicts */
export const selectHasConflicts = (state: SyncStore) =>
  state.conflicts.some((c) => c.status === 'pending');

/** Select conflict count */
export const selectConflictCount = (state: SyncStore) =>
  state.conflicts.filter((c) => c.status === 'pending').length;

/** Select sync history */
export const selectSyncHistory = (state: SyncStore) => state.syncHistory;

/** Select last N sync entries */
export const selectRecentSyncs = (count: number) => (state: SyncStore) =>
  state.syncHistory.slice(0, count);

/** Select sync config */
export const selectConfig = (state: SyncStore) => state.config;

/** Select if sync is enabled */
export const selectIsSyncEnabled = (state: SyncStore) => state.config.enabled;

/** Select last error */
export const selectLastError = (state: SyncStore) => state.lastError;

/** Select if has error */
export const selectHasError = (state: SyncStore) => state.lastError !== null;

/** Select combined status for UI display */
export const selectSyncStatus = (state: SyncStore): SyncEngineStatus => ({
  state: state.syncState,
  lastSyncAt: state.lastSyncAt,
  pendingChanges: state.pendingCount,
  failedChanges: state.lastSyncResult?.errors?.length ?? 0,
  isOnline: state.isOnline,
  syncProgress: state.syncProgress,
  currentOperation: state.currentOperation,
});

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate sync statistics from history.
 */
export function calculateSyncStats(history: SyncHistoryEntry[]): {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  totalUploaded: number;
  totalDownloaded: number;
  totalConflicts: number;
  averageDurationMs: number;
} {
  const stats = {
    totalSyncs: history.length,
    successfulSyncs: 0,
    failedSyncs: 0,
    totalUploaded: 0,
    totalDownloaded: 0,
    totalConflicts: 0,
    averageDurationMs: 0,
  };

  if (history.length === 0) {
    return stats;
  }

  let totalDuration = 0;

  for (const entry of history) {
    if (entry.result.success) {
      stats.successfulSyncs++;
    } else {
      stats.failedSyncs++;
    }
    stats.totalUploaded += entry.result.uploaded;
    stats.totalDownloaded += entry.result.downloaded;
    stats.totalConflicts += entry.result.conflicts;
    totalDuration += entry.result.durationMs;
  }

  stats.averageDurationMs = Math.round(totalDuration / history.length);

  return stats;
}

/**
 * Format time since last sync for display.
 */
export function formatTimeSinceSync(lastSyncAt: Date | null): string {
  if (!lastSyncAt) {
    return 'Never synced';
  }

  const now = new Date();
  const diffMs = now.getTime() - lastSyncAt.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'Just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
}

/**
 * Get status message based on sync state.
 */
export function getSyncStateMessage(state: SyncEngineState): string {
  switch (state) {
    case 'idle':
      return 'Synced';
    case 'syncing':
      return 'Syncing...';
    case 'paused':
      return 'Sync paused';
    case 'offline':
      return 'Offline';
    case 'error':
      return 'Sync error';
    default:
      return 'Unknown';
  }
}

/**
 * Get status color based on sync state.
 */
export function getSyncStateColor(
  state: SyncEngineState
): 'green' | 'yellow' | 'red' | 'gray' {
  switch (state) {
    case 'idle':
      return 'green';
    case 'syncing':
      return 'yellow';
    case 'paused':
      return 'gray';
    case 'offline':
      return 'gray';
    case 'error':
      return 'red';
    default:
      return 'gray';
  }
}
