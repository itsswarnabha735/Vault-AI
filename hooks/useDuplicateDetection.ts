/**
 * useDuplicateDetection Hook for Vault-AI
 *
 * React hook for duplicate transaction detection.
 * Provides functionality to:
 * - Check transactions for duplicates on import
 * - Get pending duplicate alerts
 * - Resolve duplicate alerts
 *
 * PRIVACY: All detection runs locally on the device.
 * No transaction data is transmitted to external servers.
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/lib/storage/db';
import {
  duplicateDetector,
  checkForDuplicates,
  findDuplicates,
  resolveDuplicateAlert,
  deleteAndResolve,
  getUnresolvedDuplicateAlerts,
  getDuplicateAlertForTransaction,
  type DuplicateResult,
  type DuplicatePair,
  type DuplicateConfig,
} from '@/lib/anomaly';
import type {
  LocalTransaction,
  AnomalyAlert,
  AnomalyAlertId,
  TransactionId,
} from '@/types/database';
import type { DuplicateResolution } from '@/components/anomaly';

// ============================================
// Types
// ============================================

/**
 * Alert with associated transaction data.
 */
export interface DuplicateAlertWithTransactions {
  alert: AnomalyAlert;
  originalTransaction: LocalTransaction | null;
  newTransaction: LocalTransaction | null;
}

/**
 * Hook configuration options.
 */
export interface UseDuplicateDetectionOptions {
  /** Detection sensitivity configuration */
  config?: Partial<DuplicateConfig>;

  /** Callback when a duplicate is detected */
  onDuplicateDetected?: (result: DuplicateResult) => void;

  /** Callback when an alert is resolved */
  onAlertResolved?: (
    alertId: AnomalyAlertId,
    action: DuplicateResolution
  ) => void;

  /** Auto-refresh interval in ms (0 to disable) */
  refreshInterval?: number;
}

/**
 * Hook return type.
 */
export interface UseDuplicateDetectionReturn {
  /** Whether detection is currently running */
  isChecking: boolean;

  /** Whether alerts are loading */
  isLoading: boolean;

  /** Last error that occurred */
  error: Error | null;

  /** Pending duplicate alerts with transactions */
  pendingAlerts: DuplicateAlertWithTransactions[];

  /** Count of pending alerts */
  pendingCount: number;

  /** IDs of alerts currently being resolved */
  resolvingIds: Set<string>;

  /** Check a single transaction for duplicates */
  checkTransaction: (transaction: LocalTransaction) => Promise<DuplicateResult>;

  /** Check multiple transactions for duplicates (batch) */
  checkTransactions: (
    transactions: LocalTransaction[]
  ) => Promise<DuplicatePair[]>;

  /** Resolve a duplicate alert */
  resolveAlert: (
    alertId: AnomalyAlertId,
    resolution: DuplicateResolution
  ) => Promise<void>;

  /** Block sync for a transaction until alert is resolved */
  blockSync: (transactionId: TransactionId) => Promise<void>;

  /** Configure detection sensitivity */
  configure: (config: Partial<DuplicateConfig>) => void;

  /** Refresh pending alerts */
  refresh: () => Promise<void>;

  /** Get current configuration */
  getConfig: () => DuplicateConfig;
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for duplicate transaction detection.
 */
export function useDuplicateDetection(
  options: UseDuplicateDetectionOptions = {}
): UseDuplicateDetectionReturn {
  const {
    config,
    onDuplicateDetected,
    onAlertResolved,
    refreshInterval = 0,
  } = options;

  // State
  const [isChecking, setIsChecking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [alertTransactions, setAlertTransactions] = useState<
    Map<
      string,
      { original: LocalTransaction | null; new: LocalTransaction | null }
    >
  >(new Map());

  // Configure detector on mount or config change
  useEffect(() => {
    if (config) {
      duplicateDetector.configureSensitivity(config);
    }
  }, [config]);

  // Live query for unresolved duplicate alerts
  const unresolvedAlerts = useLiveQuery(
    () =>
      db.anomalies
        .where('isResolved')
        .equals(0)
        .filter((alert) => alert.type === 'duplicate')
        .toArray(),
    [],
    []
  );

  // Load transaction data for alerts
  useEffect(() => {
    async function loadTransactions() {
      if (!unresolvedAlerts || unresolvedAlerts.length === 0) {
        setAlertTransactions(new Map());
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const transactionMap = new Map<
          string,
          { original: LocalTransaction | null; new: LocalTransaction | null }
        >();

        for (const alert of unresolvedAlerts) {
          // Get the new transaction (the one that triggered the alert)
          const newTx = await db.transactions.get(alert.transactionId);

          // Get the original transaction (the one it duplicates)
          const originalId = alert.relatedTransactionIds[0];
          const originalTx = originalId
            ? await db.transactions.get(originalId)
            : null;

          transactionMap.set(alert.id, {
            original: originalTx || null,
            new: newTx || null,
          });
        }

        setAlertTransactions(transactionMap);
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to load transactions')
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadTransactions();
  }, [unresolvedAlerts]);

  // Combine alerts with transaction data
  const pendingAlerts = useMemo<DuplicateAlertWithTransactions[]>(() => {
    if (!unresolvedAlerts) {
      return [];
    }

    return unresolvedAlerts.map((alert) => {
      const transactions = alertTransactions.get(alert.id);
      return {
        alert,
        originalTransaction: transactions?.original || null,
        newTransaction: transactions?.new || null,
      };
    });
  }, [unresolvedAlerts, alertTransactions]);

  // Pending count
  const pendingCount = pendingAlerts.length;

  /**
   * Check a single transaction for duplicates.
   */
  const checkTransaction = useCallback(
    async (transaction: LocalTransaction): Promise<DuplicateResult> => {
      setIsChecking(true);
      setError(null);

      try {
        const result = await checkForDuplicates(transaction);

        if (result.isDuplicate && onDuplicateDetected) {
          onDuplicateDetected(result);
        }

        // Create alert if duplicate found
        if (result.isDuplicate && result.matchingTransactionId) {
          // Check if alert already exists
          const existingAlert = await getDuplicateAlertForTransaction(
            transaction.id
          );

          if (!existingAlert) {
            await duplicateDetector.createDuplicateAlert(
              transaction.id,
              result.matchingTransactionId,
              result
            );
          }
        }

        return result;
      } catch (err) {
        const checkError =
          err instanceof Error
            ? err
            : new Error('Failed to check for duplicates');
        setError(checkError);
        throw checkError;
      } finally {
        setIsChecking(false);
      }
    },
    [onDuplicateDetected]
  );

  /**
   * Check multiple transactions for duplicates.
   */
  const checkTransactions = useCallback(
    async (transactions: LocalTransaction[]): Promise<DuplicatePair[]> => {
      setIsChecking(true);
      setError(null);

      try {
        const pairs = findDuplicates(transactions);

        // Create alerts for each duplicate pair
        for (const pair of pairs) {
          const existingAlert = await getDuplicateAlertForTransaction(
            pair.duplicate.id
          );

          if (!existingAlert) {
            await duplicateDetector.createDuplicateAlert(
              pair.duplicate.id,
              pair.original.id,
              {
                isDuplicate: true,
                confidence: pair.confidence,
                matchingTransactionId: pair.original.id,
                reason: pair.reason,
              }
            );
          }

          if (onDuplicateDetected) {
            onDuplicateDetected({
              isDuplicate: true,
              confidence: pair.confidence,
              matchingTransactionId: pair.original.id,
              reason: pair.reason,
            });
          }
        }

        return pairs;
      } catch (err) {
        const checkError =
          err instanceof Error
            ? err
            : new Error('Failed to check for duplicates');
        setError(checkError);
        throw checkError;
      } finally {
        setIsChecking(false);
      }
    },
    [onDuplicateDetected]
  );

  /**
   * Resolve a duplicate alert.
   */
  const resolveAlert = useCallback(
    async (
      alertId: AnomalyAlertId,
      resolution: DuplicateResolution
    ): Promise<void> => {
      setResolvingIds((prev) => new Set(prev).add(alertId));
      setError(null);

      try {
        // Get the alert to find the transaction ID
        const alert = await db.anomalies.get(alertId);

        if (!alert) {
          throw new Error('Alert not found');
        }

        switch (resolution) {
          case 'keep-both':
            // Mark alert as dismissed (user confirmed they are different)
            await resolveDuplicateAlert(alertId, 'dismissed');
            break;

          case 'skip-new':
            // Delete the new transaction and resolve the alert
            await deleteAndResolve(alert.transactionId, alertId);
            break;

          case 'merge':
            // For merge, we keep the original and delete the new one
            // In a more complex implementation, you might merge notes, etc.
            await deleteAndResolve(alert.transactionId, alertId);
            break;
        }

        if (onAlertResolved) {
          onAlertResolved(alertId, resolution);
        }
      } catch (err) {
        const resolveError =
          err instanceof Error ? err : new Error('Failed to resolve alert');
        setError(resolveError);
        throw resolveError;
      } finally {
        setResolvingIds((prev) => {
          const next = new Set(prev);
          next.delete(alertId);
          return next;
        });
      }
    },
    [onAlertResolved]
  );

  /**
   * Block sync for a transaction until alert is resolved.
   */
  const blockSync = useCallback(
    async (transactionId: TransactionId): Promise<void> => {
      await db.transactions.update(transactionId, {
        syncStatus: 'local-only',
      });
    },
    []
  );

  /**
   * Configure detection sensitivity.
   */
  const configure = useCallback((newConfig: Partial<DuplicateConfig>): void => {
    duplicateDetector.configureSensitivity(newConfig);
  }, []);

  /**
   * Refresh pending alerts manually.
   */
  const refresh = useCallback(async (): Promise<void> => {
    // The live query will auto-refresh, but this triggers a manual refresh
    setIsLoading(true);
    try {
      await getUnresolvedDuplicateAlerts();
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get current configuration.
   */
  const getConfig = useCallback((): DuplicateConfig => {
    return duplicateDetector.getConfig();
  }, []);

  // Auto-refresh interval
  useEffect(() => {
    if (refreshInterval <= 0) {
      return;
    }

    const interval = setInterval(() => {
      void refresh();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, refresh]);

  return {
    isChecking,
    isLoading,
    error,
    pendingAlerts,
    pendingCount,
    resolvingIds,
    checkTransaction,
    checkTransactions,
    resolveAlert,
    blockSync,
    configure,
    refresh,
    getConfig,
  };
}

// ============================================
// Convenience Hooks
// ============================================

/**
 * Hook for just the pending duplicate count.
 * Useful for badges and indicators.
 */
export function useDuplicateCount(): number {
  const count = useLiveQuery(
    () =>
      db.anomalies
        .where('isResolved')
        .equals(0)
        .filter((alert) => alert.type === 'duplicate')
        .count(),
    [],
    0
  );

  return count ?? 0;
}

/**
 * Hook to check if a specific transaction has a duplicate alert.
 */
export function useHasDuplicateAlert(
  transactionId: TransactionId | null
): boolean {
  const hasAlert = useLiveQuery(
    async () => {
      if (!transactionId) {
        return false;
      }

      const count = await db.anomalies
        .where('transactionId')
        .equals(transactionId)
        .filter((alert) => alert.type === 'duplicate' && !alert.isResolved)
        .count();

      return count > 0;
    },
    [transactionId],
    false
  );

  return hasAlert ?? false;
}

/**
 * Hook to check if any transactions have unresolved duplicates.
 * Useful for blocking sync.
 */
export function useHasUnresolvedDuplicates(): boolean {
  const count = useDuplicateCount();
  return count > 0;
}

export default useDuplicateDetection;
