/**
 * useConflicts Hook for Vault-AI
 *
 * React hook for managing sync conflicts.
 * Provides conflict list, unresolved count, and resolution functions.
 */

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  getConflictResolver,
  type DetailedConflict,
  type AutoResolveStrategy,
  type ConflictResolverConfig,
  getFieldDisplayName,
  getDifferenceDescription,
} from '@/lib/sync/conflict-resolver';
import type { TransactionId } from '@/types/database';

// ============================================
// Types
// ============================================

export interface UseConflictsReturn {
  /** All conflicts (including resolved) */
  conflicts: DetailedConflict[];

  /** Only unresolved conflicts */
  unresolvedConflicts: DetailedConflict[];

  /** Number of unresolved conflicts */
  unresolvedCount: number;

  /** Whether there are any unresolved conflicts */
  hasUnresolvedConflicts: boolean;

  /** Currently selected conflict (for dialog) */
  selectedConflict: DetailedConflict | null;

  /** Whether the conflict dialog is open */
  isDialogOpen: boolean;

  /** Open the conflict dialog for a specific conflict */
  openDialog: (conflictId: string) => void;

  /** Close the conflict dialog */
  closeDialog: () => void;

  /** Open dialog for the first unresolved conflict */
  openFirstUnresolved: () => void;

  /** Resolve a conflict */
  resolveConflict: (
    conflictId: string,
    resolution: 'local' | 'remote'
  ) => Promise<void>;

  /** Resolve the currently selected conflict */
  resolveSelected: (resolution: 'local' | 'remote') => Promise<void>;

  /** Resolve with the newest version */
  resolveWithNewest: (conflictId: string) => Promise<void>;

  /** Dismiss/skip a conflict (keeps it unresolved) */
  dismissConflict: (conflictId: string) => void;

  /** Clear all resolved conflicts */
  clearResolved: () => Promise<void>;

  /** Get conflict details for a transaction */
  getConflictForTransaction: (
    transactionId: TransactionId
  ) => DetailedConflict | undefined;

  /** Current auto-resolve strategy */
  autoResolveStrategy: AutoResolveStrategy;

  /** Update auto-resolve strategy */
  setAutoResolveStrategy: (strategy: AutoResolveStrategy) => void;

  /** Loading state */
  isLoading: boolean;

  /** Error state */
  error: Error | null;
}

export interface ConflictFieldDiff {
  field: string;
  displayName: string;
  localValue: string;
  remoteValue: string;
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for managing sync conflicts.
 *
 * @example
 * ```tsx
 * function ConflictManager() {
 *   const {
 *     unresolvedConflicts,
 *     hasUnresolvedConflicts,
 *     resolveConflict,
 *     openFirstUnresolved,
 *   } = useConflicts();
 *
 *   if (!hasUnresolvedConflicts) {
 *     return null;
 *   }
 *
 *   return (
 *     <div>
 *       <p>{unresolvedConflicts.length} conflicts need resolution</p>
 *       <button onClick={openFirstUnresolved}>Resolve</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useConflicts(): UseConflictsReturn {
  // State
  const [conflicts, setConflicts] = useState<DetailedConflict[]>([]);
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(
    null
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [config, setConfig] = useState<ConflictResolverConfig>({
    autoResolveStrategy: 'ask',
    notifyOnAutoResolve: true,
  });

  // Get resolver instance
  const resolver = useMemo(() => getConflictResolver(), []);

  // ============================================
  // Effects
  // ============================================

  // Subscribe to conflict changes
  useEffect(() => {
    setConfig(resolver.getConfig());

    const unsubscribe = resolver.onConflictChange((newConflicts) => {
      setConflicts(newConflicts);
    });

    return () => {
      unsubscribe();
    };
  }, [resolver]);

  // ============================================
  // Derived State
  // ============================================

  const unresolvedConflicts = useMemo(
    () => conflicts.filter((c) => c.resolution === null),
    [conflicts]
  );

  const unresolvedCount = unresolvedConflicts.length;
  const hasUnresolvedConflicts = unresolvedCount > 0;

  const selectedConflict = useMemo(
    () => conflicts.find((c) => c.id === selectedConflictId) || null,
    [conflicts, selectedConflictId]
  );

  // ============================================
  // Dialog Management
  // ============================================

  const openDialog = useCallback((conflictId: string) => {
    setSelectedConflictId(conflictId);
    setIsDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
    // Keep selectedConflictId for animation purposes, clear after close
    setTimeout(() => setSelectedConflictId(null), 300);
  }, []);

  const openFirstUnresolved = useCallback(() => {
    const firstConflict = unresolvedConflicts[0];
    if (firstConflict) {
      openDialog(firstConflict.id);
    }
  }, [unresolvedConflicts, openDialog]);

  // ============================================
  // Resolution Actions
  // ============================================

  const resolveConflict = useCallback(
    async (conflictId: string, resolution: 'local' | 'remote') => {
      setIsLoading(true);
      setError(null);

      try {
        await resolver.resolveConflict(conflictId, resolution);

        // If this was the selected conflict, move to next or close
        if (conflictId === selectedConflictId) {
          const remaining = unresolvedConflicts.filter(
            (c) => c.id !== conflictId
          );
          const nextConflict = remaining[0];
          if (nextConflict) {
            setSelectedConflictId(nextConflict.id);
          } else {
            closeDialog();
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to resolve conflict')
        );
        console.error('[useConflicts] Resolution error:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [resolver, selectedConflictId, unresolvedConflicts, closeDialog]
  );

  const resolveSelected = useCallback(
    async (resolution: 'local' | 'remote') => {
      if (selectedConflictId) {
        await resolveConflict(selectedConflictId, resolution);
      }
    },
    [selectedConflictId, resolveConflict]
  );

  const resolveWithNewest = useCallback(
    async (conflictId: string) => {
      const conflict = conflicts.find((c) => c.id === conflictId);
      if (!conflict) {
        return;
      }

      const isLocalNewer =
        conflict.localVersion.updatedAt > conflict.remoteVersion.updatedAt;
      await resolveConflict(conflictId, isLocalNewer ? 'local' : 'remote');
    },
    [conflicts, resolveConflict]
  );

  const dismissConflict = useCallback(
    (conflictId: string) => {
      // Just close the dialog without resolving
      if (conflictId === selectedConflictId) {
        closeDialog();
      }
    },
    [selectedConflictId, closeDialog]
  );

  const clearResolved = useCallback(async () => {
    await resolver.clearResolvedConflicts();
  }, [resolver]);

  // ============================================
  // Query Functions
  // ============================================

  const getConflictForTransaction = useCallback(
    (transactionId: TransactionId): DetailedConflict | undefined => {
      return conflicts.find(
        (c) => c.transactionId === transactionId && c.resolution === null
      );
    },
    [conflicts]
  );

  // ============================================
  // Configuration
  // ============================================

  const setAutoResolveStrategy = useCallback(
    (strategy: AutoResolveStrategy) => {
      resolver.updateConfig({ autoResolveStrategy: strategy });
      setConfig((prev) => ({ ...prev, autoResolveStrategy: strategy }));
    },
    [resolver]
  );

  // ============================================
  // Return
  // ============================================

  return {
    conflicts,
    unresolvedConflicts,
    unresolvedCount,
    hasUnresolvedConflicts,
    selectedConflict,
    isDialogOpen,
    openDialog,
    closeDialog,
    openFirstUnresolved,
    resolveConflict,
    resolveSelected,
    resolveWithNewest,
    dismissConflict,
    clearResolved,
    getConflictForTransaction,
    autoResolveStrategy: config.autoResolveStrategy,
    setAutoResolveStrategy,
    isLoading,
    error,
  };
}

// ============================================
// Helper Hooks
// ============================================

/**
 * Hook for just the conflict count (lightweight).
 */
export function useConflictCount(): {
  count: number;
  hasConflicts: boolean;
} {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const resolver = getConflictResolver();

    const unsubscribe = resolver.onConflictChange((conflicts) => {
      const unresolved = conflicts.filter((c) => c.resolution === null);
      setCount(unresolved.length);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    count,
    hasConflicts: count > 0,
  };
}

/**
 * Hook for getting field differences for a conflict.
 */
export function useConflictDiffs(
  conflict: DetailedConflict | null
): ConflictFieldDiff[] {
  return useMemo(() => {
    if (!conflict) {
      return [];
    }

    return conflict.differingFields.map((field) => {
      const { localValue, remoteValue } = getDifferenceDescription(
        conflict.localVersion,
        conflict.remoteVersion,
        field
      );

      return {
        field,
        displayName: getFieldDisplayName(field),
        localValue,
        remoteValue,
      };
    });
  }, [conflict]);
}

/**
 * Hook for determining which version is newer.
 */
export function useNewerVersion(
  conflict: DetailedConflict | null
): 'local' | 'remote' | null {
  return useMemo(() => {
    if (!conflict) {
      return null;
    }

    return conflict.localVersion.updatedAt > conflict.remoteVersion.updatedAt
      ? 'local'
      : 'remote';
  }, [conflict]);
}

// Default export
export default useConflicts;
