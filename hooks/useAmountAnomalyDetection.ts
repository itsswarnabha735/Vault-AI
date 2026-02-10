/**
 * Amount Anomaly Detection Hook for Vault-AI
 *
 * Provides React hooks for detecting and managing amount anomalies
 * including unusual amounts, price increases, and first-time vendors.
 *
 * PRIVACY: All detection runs locally on the device.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '@/lib/storage/db';
import {
  amountAnomalyDetector,
  checkAmountAnomaly,
  getVendorStats,
  resolveAmountAlert,
  type AmountAnomalyResult,
  type AmountAnomalyConfig,
  type VendorStats,
} from '@/lib/anomaly';
import type {
  LocalTransaction,
  AnomalyAlert,
  AnomalyAlertId,
} from '@/types/database';
import type { AmountAnomalyResolution } from '@/components/anomaly';

// ============================================
// Types
// ============================================

/**
 * An amount anomaly alert with its associated transaction.
 */
export interface AmountAlertWithTransaction {
  alert: AnomalyAlert;
  transaction: LocalTransaction | null;
  result?: AmountAnomalyResult;
}

/**
 * Options for the useAmountAnomalyDetection hook.
 */
export interface UseAmountAnomalyDetectionOptions {
  /** Auto-check new transactions as they're added (default: true) */
  autoCheck?: boolean;

  /** Custom configuration for detection sensitivity */
  config?: Partial<AmountAnomalyConfig>;

  /** Callback when an anomaly is detected */
  onAnomalyDetected?: (
    transaction: LocalTransaction,
    result: AmountAnomalyResult
  ) => void;
}

/**
 * Return type for the useAmountAnomalyDetection hook.
 */
export interface UseAmountAnomalyDetectionReturn {
  /** Unresolved amount anomaly alerts */
  alerts: AmountAlertWithTransaction[];

  /** Number of unresolved amount alerts */
  alertCount: number;

  /** Whether alerts are loading */
  isLoading: boolean;

  /** Error if loading failed */
  error: Error | null;

  /** Check a transaction for amount anomalies */
  checkTransaction: (
    transaction: LocalTransaction
  ) => Promise<AmountAnomalyResult>;

  /** Resolve an amount anomaly alert */
  resolveAlert: (
    alertId: AnomalyAlertId,
    resolution: AmountAnomalyResolution
  ) => Promise<void>;

  /** Set of alert IDs currently being resolved */
  resolvingIds: Set<string>;

  /** Refresh alerts */
  refresh: () => void;

  /** Get statistics for a vendor */
  getStats: (vendor: string) => Promise<VendorStats>;

  /** All vendor statistics */
  vendorStats: VendorStats[];

  /** Update detection configuration */
  updateConfig: (config: Partial<AmountAnomalyConfig>) => void;

  /** Current configuration */
  config: AmountAnomalyConfig;
}

// ============================================
// Main Hook
// ============================================

/**
 * Hook for managing amount anomaly detection.
 *
 * @param options - Configuration options
 * @returns Amount anomaly detection state and methods
 *
 * @example
 * ```tsx
 * const { alerts, checkTransaction, resolveAlert, resolvingIds } = useAmountAnomalyDetection();
 *
 * // Check a transaction
 * const result = await checkTransaction(transaction);
 * if (result.isAnomaly) {
 *   console.log('Anomaly detected:', result.message);
 * }
 *
 * // Resolve an alert
 * await resolveAlert(alertId, 'confirm');
 * ```
 */
export function useAmountAnomalyDetection(
  options: UseAmountAnomalyDetectionOptions = {}
): UseAmountAnomalyDetectionReturn {
  const {
    autoCheck: _autoCheck = true,
    config: initialConfig,
    onAnomalyDetected,
  } = options;

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [vendorStats, setVendorStats] = useState<VendorStats[]>([]);

  // Apply initial config
  useEffect(() => {
    if (initialConfig) {
      amountAnomalyDetector.configureSensitivity(initialConfig);
    }
  }, [initialConfig]);

  // Live query for unresolved amount anomaly alerts
  const rawAlerts = useLiveQuery(
    async () => {
      try {
        return await db.anomalies
          .where('isResolved')
          .equals(0)
          .and(
            (alert) =>
              alert.type === 'unusual_amount' ||
              alert.type === 'price_increase' ||
              alert.type === 'new_vendor'
          )
          .toArray();
      } catch (err) {
        console.error('Failed to load amount anomaly alerts:', err);
        return [];
      }
    },
    [],
    []
  );

  // Load transactions for alerts
  const alerts = useLiveQuery(
    async () => {
      if (!rawAlerts || rawAlerts.length === 0) {
        return [];
      }

      const alertsWithTransactions: AmountAlertWithTransaction[] = [];

      for (const alert of rawAlerts) {
        const transaction = await db.transactions.get(alert.transactionId);
        alertsWithTransactions.push({
          alert,
          transaction: transaction || null,
        });
      }

      return alertsWithTransactions;
    },
    [rawAlerts],
    []
  );

  // Load vendor stats on mount
  useEffect(() => {
    const loadVendorStats = async () => {
      try {
        const stats = await amountAnomalyDetector.getAllVendorStats();
        setVendorStats(stats);
      } catch (err) {
        console.error('Failed to load vendor stats:', err);
      }
    };

    loadVendorStats();
  }, []);

  /**
   * Check a transaction for amount anomalies.
   */
  const checkTransaction = useCallback(
    async (transaction: LocalTransaction): Promise<AmountAnomalyResult> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await checkAmountAnomaly(transaction);

        if (result.isAnomaly) {
          // Create an alert
          await amountAnomalyDetector.createAmountAlert(transaction.id, result);

          // Notify callback
          if (onAnomalyDetected) {
            onAnomalyDetected(transaction, result);
          }
        }

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [onAnomalyDetected]
  );

  /**
   * Resolve an amount anomaly alert.
   */
  const resolveAlert = useCallback(
    async (
      alertId: AnomalyAlertId,
      resolution: AmountAnomalyResolution
    ): Promise<void> => {
      // Track resolving state
      setResolvingIds((prev) => new Set(prev).add(alertId));

      try {
        // Map resolution to action
        const action = resolution === 'confirm' ? 'confirmed' : 'dismissed';
        await resolveAmountAlert(alertId, action);
      } catch (err) {
        console.error('Failed to resolve amount alert:', err);
        throw err;
      } finally {
        setResolvingIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(alertId);
          return newSet;
        });
      }
    },
    []
  );

  /**
   * Refresh the alerts and vendor stats.
   */
  const refresh = useCallback(() => {
    // Clear cache
    amountAnomalyDetector.clearCache();

    // Reload vendor stats
    amountAnomalyDetector.getAllVendorStats().then(setVendorStats);
  }, []);

  /**
   * Get statistics for a specific vendor.
   */
  const getStats = useCallback(async (vendor: string): Promise<VendorStats> => {
    return getVendorStats(vendor);
  }, []);

  /**
   * Update detection configuration.
   */
  const updateConfig = useCallback(
    (config: Partial<AmountAnomalyConfig>): void => {
      amountAnomalyDetector.configureSensitivity(config);
    },
    []
  );

  // Get current config
  const config = useMemo(
    () => amountAnomalyDetector.getConfig(),
    // Re-compute when config changes (though this won't trigger reactively)
    []
  );

  return {
    alerts: alerts || [],
    alertCount: alerts?.length || 0,
    isLoading,
    error,
    checkTransaction,
    resolveAlert,
    resolvingIds,
    refresh,
    getStats,
    vendorStats,
    updateConfig,
    config,
  };
}

// ============================================
// Convenience Hooks
// ============================================

/**
 * Get the count of unresolved amount anomaly alerts.
 */
export function useAmountAnomalyCount(): number {
  const count = useLiveQuery(
    async () => {
      try {
        return await db.anomalies
          .where('isResolved')
          .equals(0)
          .and(
            (alert) =>
              alert.type === 'unusual_amount' ||
              alert.type === 'price_increase' ||
              alert.type === 'new_vendor'
          )
          .count();
      } catch {
        return 0;
      }
    },
    [],
    0
  );

  return count;
}

/**
 * Check if there are any unresolved amount anomalies.
 */
export function useHasAmountAnomalies(): boolean {
  const count = useAmountAnomalyCount();
  return count > 0;
}

/**
 * Get vendor statistics for a specific vendor.
 */
export function useVendorStats(vendor: string | null): VendorStats | null {
  const [stats, setStats] = useState<VendorStats | null>(null);

  useEffect(() => {
    if (!vendor) {
      setStats(null);
      return;
    }

    getVendorStats(vendor).then(setStats);
  }, [vendor]);

  return stats;
}

/**
 * Hook to get all unresolved anomaly alerts (both duplicates and amount anomalies).
 * Useful for the AnomalyCenter dashboard.
 */
export function useAllAnomalies() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [transactionsById, setTransactionsById] = useState<
    Map<string, LocalTransaction>
  >(new Map());

  // Live query for all unresolved anomaly alerts
  const alerts = useLiveQuery(
    async () => {
      try {
        setIsLoading(true);
        return await db.anomalies.where('isResolved').equals(0).toArray();
      } catch (err) {
        console.error('Failed to load anomaly alerts:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [],
    []
  );

  // Load related transactions
  useEffect(() => {
    const loadTransactions = async () => {
      if (!alerts || alerts.length === 0) {
        setTransactionsById(new Map());
        return;
      }

      // Collect all transaction IDs
      const transactionIds = new Set<string>();
      for (const alert of alerts) {
        transactionIds.add(alert.transactionId);
        if (alert.relatedTransactionIds) {
          for (const id of alert.relatedTransactionIds) {
            transactionIds.add(id);
          }
        }
      }

      // Load transactions
      const transactions = await db.transactions
        .where('id')
        .anyOf([...transactionIds])
        .toArray();

      const byId = new Map<string, LocalTransaction>();
      for (const tx of transactions) {
        byId.set(tx.id, tx);
      }

      setTransactionsById(byId);
    };

    loadTransactions();
  }, [alerts]);

  // Count by type
  const stats = useMemo(() => {
    const counts = {
      total: alerts?.length || 0,
      duplicates: 0,
      amountAnomalies: 0,
      priceIncreases: 0,
      newVendors: 0,
    };

    if (!alerts) {
      return counts;
    }

    for (const alert of alerts) {
      switch (alert.type) {
        case 'duplicate':
          counts.duplicates++;
          break;
        case 'unusual_amount':
          counts.amountAnomalies++;
          break;
        case 'price_increase':
          counts.priceIncreases++;
          break;
        case 'new_vendor':
          counts.newVendors++;
          break;
      }
    }

    return counts;
  }, [alerts]);

  return {
    alerts: alerts || [],
    transactionsById,
    stats,
    isLoading,
    error,
  };
}
