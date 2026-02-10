/**
 * useSync Hook for Vault-AI
 *
 * React hook for interacting with the sync engine.
 * Provides reactive access to sync status, manual sync triggers,
 * and conflict management.
 */

'use client';

import { useEffect, useCallback, useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  useSyncStore,
  selectSyncStatus,
  selectPendingConflicts,
  selectConfig,
  formatTimeSinceSync,
  getSyncStateMessage,
  getSyncStateColor,
  calculateSyncStats,
} from '@/stores/syncStore';
import { getSyncEngine, type SyncEngine } from '@/lib/sync/sync-engine';
import type {
  SyncEngineStatus,
  SyncResult,
  SyncConflict,
  SyncConfig,
} from '@/types/sync';

// ============================================
// Hook Return Type
// ============================================

export interface UseSyncReturn {
  // Status
  status: SyncEngineStatus;
  isOnline: boolean;
  isSyncing: boolean;
  isPaused: boolean;
  isOffline: boolean;
  hasError: boolean;

  // Pending changes
  pendingCount: number;
  hasPendingChanges: boolean;

  // Last sync info
  lastSyncAt: Date | null;
  lastSyncResult: SyncResult | null;
  timeSinceSync: string;

  // Progress (when syncing)
  syncProgress: number | null;
  currentOperation: string | null;

  // Conflicts
  conflicts: SyncConflict[];
  hasConflicts: boolean;
  conflictCount: number;

  // Display helpers
  statusMessage: string;
  statusColor: 'green' | 'yellow' | 'red' | 'gray';

  // Statistics
  stats: {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    totalUploaded: number;
    totalDownloaded: number;
    averageDurationMs: number;
  };

  // Actions
  syncNow: () => Promise<SyncResult>;
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  resolveConflict: (
    id: string,
    resolution: 'local' | 'remote'
  ) => Promise<void>;
  updateConfig: (config: Partial<SyncConfig>) => void;

  // Configuration
  config: SyncConfig;
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for managing synchronization with the cloud.
 *
 * Provides reactive access to sync status, manual sync triggers,
 * and conflict management. Automatically starts the sync engine
 * on mount and integrates with the Zustand store for state management.
 *
 * @param options - Optional configuration
 * @param options.autoStart - Whether to auto-start sync on mount (default: true)
 *
 * @example
 * ```tsx
 * function SyncStatus() {
 *   const { status, syncNow, isSyncing, pendingCount } = useSync();
 *
 *   return (
 *     <div>
 *       <p>Status: {status.state}</p>
 *       <p>Pending: {pendingCount}</p>
 *       <button onClick={syncNow} disabled={isSyncing}>
 *         Sync Now
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useSync(options?: { autoStart?: boolean }): UseSyncReturn {
  const { autoStart = true } = options ?? {};

  // Get sync engine (singleton)
  const engineRef = useRef<SyncEngine | null>(null);

  // Get state from store
  const {
    isOnline,
    syncState,
    pendingCount,
    lastSyncAt,
    lastSyncResult,
    syncProgress,
    currentOperation,
    syncHistory,
    config,
    lastError,
    // Actions
    setOnline,
    setSyncState,
    setPendingCount,
    setSyncProgress,
    onSyncComplete,
    onSyncError,
    addConflict,
    updateConfig: storeUpdateConfig,
    resolveConflict: storeResolveConflict,
  } = useSyncStore(
    useShallow((state) => ({
      isOnline: state.isOnline,
      syncState: state.syncState,
      pendingCount: state.pendingCount,
      lastSyncAt: state.lastSyncAt,
      lastSyncResult: state.lastSyncResult,
      syncProgress: state.syncProgress,
      currentOperation: state.currentOperation,
      syncHistory: state.syncHistory,
      config: state.config,
      lastError: state.lastError,
      setOnline: state.setOnline,
      setSyncState: state.setSyncState,
      setPendingCount: state.setPendingCount,
      setSyncProgress: state.setSyncProgress,
      onSyncComplete: state.onSyncComplete,
      onSyncError: state.onSyncError,
      addConflict: state.addConflict,
      updateConfig: state.updateConfig,
      resolveConflict: state.resolveConflict,
    }))
  );

  // Get conflicts from store (useShallow prevents infinite re-renders
  // since .filter() creates a new array reference on every call)
  const conflicts = useSyncStore(useShallow(selectPendingConflicts));

  // ============================================
  // Engine Setup & Cleanup
  // ============================================

  useEffect(() => {
    // Get engine instance
    const engine = getSyncEngine();
    engineRef.current = engine;

    // Subscribe to engine events
    const unsubStart = engine.onSyncStart(() => {
      setSyncState('syncing');
    });

    const unsubComplete = engine.onSyncComplete((result) => {
      onSyncComplete(result);
      // Update pending count after sync
      engine.getPendingCount().then(setPendingCount);
    });

    const unsubError = engine.onSyncError((error) => {
      onSyncError(error);
      setSyncState('error');
    });

    const unsubConflict = engine.onConflict((conflict) => {
      addConflict(conflict);
    });

    // Start engine if autoStart is enabled
    if (autoStart) {
      engine.start();
    }

    // Update initial pending count
    engine.getPendingCount().then(setPendingCount);

    // Set up online/offline listeners for store
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    // Cleanup
    return () => {
      unsubStart();
      unsubComplete();
      unsubError();
      unsubConflict();

      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, [
    autoStart,
    setSyncState,
    onSyncComplete,
    onSyncError,
    addConflict,
    setPendingCount,
    setOnline,
  ]);

  // ============================================
  // Actions
  // ============================================

  const syncNow = useCallback(async (): Promise<SyncResult> => {
    const engine = engineRef.current ?? getSyncEngine();
    return engine.syncNow();
  }, []);

  const start = useCallback(() => {
    const engine = engineRef.current ?? getSyncEngine();
    engine.start();
  }, []);

  const stop = useCallback(() => {
    const engine = engineRef.current ?? getSyncEngine();
    engine.stop();
  }, []);

  const pause = useCallback(() => {
    const engine = engineRef.current ?? getSyncEngine();
    engine.pause();
    setSyncState('paused');
  }, [setSyncState]);

  const resume = useCallback(() => {
    const engine = engineRef.current ?? getSyncEngine();
    engine.resume();
    setSyncState('idle');
  }, [setSyncState]);

  const resolveConflict = useCallback(
    async (id: string, resolution: 'local' | 'remote') => {
      const engine = engineRef.current ?? getSyncEngine();
      await engine.resolveConflict(id, resolution);
      storeResolveConflict(id, resolution);
    },
    [storeResolveConflict]
  );

  const updateConfig = useCallback(
    (newConfig: Partial<SyncConfig>) => {
      const engine = engineRef.current ?? getSyncEngine();
      engine.updateConfig(newConfig);
      storeUpdateConfig(newConfig);
    },
    [storeUpdateConfig]
  );

  // ============================================
  // Derived Values
  // ============================================

  const status = useMemo(
    (): SyncEngineStatus => ({
      state: syncState,
      lastSyncAt,
      pendingChanges: pendingCount,
      failedChanges: lastSyncResult?.errors?.length ?? 0,
      isOnline,
      syncProgress,
      currentOperation,
    }),
    [
      syncState,
      lastSyncAt,
      pendingCount,
      lastSyncResult,
      isOnline,
      syncProgress,
      currentOperation,
    ]
  );

  const stats = useMemo(() => calculateSyncStats(syncHistory), [syncHistory]);

  const timeSinceSync = useMemo(
    () => formatTimeSinceSync(lastSyncAt),
    [lastSyncAt]
  );

  const statusMessage = useMemo(
    () => getSyncStateMessage(syncState),
    [syncState]
  );

  const statusColor = useMemo(() => getSyncStateColor(syncState), [syncState]);

  // ============================================
  // Return Value
  // ============================================

  return {
    // Status
    status,
    isOnline,
    isSyncing: syncState === 'syncing',
    isPaused: syncState === 'paused',
    isOffline: syncState === 'offline',
    hasError: syncState === 'error' || lastError !== null,

    // Pending changes
    pendingCount,
    hasPendingChanges: pendingCount > 0,

    // Last sync info
    lastSyncAt,
    lastSyncResult,
    timeSinceSync,

    // Progress
    syncProgress,
    currentOperation,

    // Conflicts
    conflicts,
    hasConflicts: conflicts.length > 0,
    conflictCount: conflicts.length,

    // Display helpers
    statusMessage,
    statusColor,

    // Statistics
    stats,

    // Actions
    syncNow,
    start,
    stop,
    pause,
    resume,
    resolveConflict,
    updateConfig,

    // Configuration
    config,
  };
}

// ============================================
// Additional Hooks
// ============================================

/**
 * Hook for just the sync status (lightweight).
 * Use this when you only need to display sync status without actions.
 */
export function useSyncStatus(): {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  statusMessage: string;
  statusColor: 'green' | 'yellow' | 'red' | 'gray';
  timeSinceSync: string;
} {
  const { syncState, isOnline, pendingCount, lastSyncAt } = useSyncStore(
    useShallow((state) => ({
      syncState: state.syncState,
      isOnline: state.isOnline,
      pendingCount: state.pendingCount,
      lastSyncAt: state.lastSyncAt,
    }))
  );

  return {
    isOnline,
    isSyncing: syncState === 'syncing',
    pendingCount,
    statusMessage: getSyncStateMessage(syncState),
    statusColor: getSyncStateColor(syncState),
    timeSinceSync: formatTimeSinceSync(lastSyncAt),
  };
}

/**
 * Hook for conflict management only.
 */
export function useSyncConflicts(): {
  conflicts: SyncConflict[];
  hasConflicts: boolean;
  count: number;
  resolveConflict: (
    id: string,
    resolution: 'local' | 'remote'
  ) => Promise<void>;
} {
  const conflicts = useSyncStore(useShallow(selectPendingConflicts));
  const storeResolveConflict = useSyncStore((s) => s.resolveConflict);

  const resolveConflict = useCallback(
    async (id: string, resolution: 'local' | 'remote') => {
      const engine = getSyncEngine();
      await engine.resolveConflict(id, resolution);
      storeResolveConflict(id, resolution);
    },
    [storeResolveConflict]
  );

  return {
    conflicts,
    hasConflicts: conflicts.length > 0,
    count: conflicts.length,
    resolveConflict,
  };
}

/**
 * Hook to trigger manual sync.
 * Returns a stable sync function.
 */
export function useSyncNow(): () => Promise<SyncResult> {
  return useCallback(async () => {
    const engine = getSyncEngine();
    return engine.syncNow();
  }, []);
}

// Default export
export default useSync;
