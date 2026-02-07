/**
 * Amount Anomaly Detector for Vault-AI
 *
 * Detects unusual transaction amounts including:
 * - Unusually high or low amounts compared to vendor average
 * - Price increases for recurring/subscription charges
 * - First-time vendor transactions
 *
 * PRIVACY: All detection runs locally on the device.
 * No transaction data is transmitted to external servers.
 */

import { db } from '@/lib/storage/db';
import type {
  LocalTransaction,
  TransactionId,
  AnomalyAlert,
  AnomalyAlertId,
  AnomalyType,
} from '@/types/database';
import { v4 as uuidv4 } from 'uuid';

import { normalizeVendor, formatCurrency } from './utils';

// ============================================
// Types and Interfaces
// ============================================

/**
 * Type of amount anomaly detected.
 */
export type AmountAnomalyType =
  | 'unusually_high'
  | 'unusually_low'
  | 'price_increase'
  | 'first_time'
  | null;

/**
 * Result of an amount anomaly check.
 */
export interface AmountAnomalyResult {
  /** Whether an anomaly was detected */
  isAnomaly: boolean;

  /** Type of anomaly detected */
  type: AmountAnomalyType;

  /** Confidence score (0-1) */
  confidence: number;

  /** Human-readable message */
  message: string;

  /** Comparison data for UI display */
  comparison: AmountComparison | null;
}

/**
 * Amount comparison data for anomaly alerts.
 */
export interface AmountComparison {
  /** Current transaction amount */
  current: number;

  /** Historical average for this vendor */
  average: number;

  /** Percentage change from average */
  percentChange: number;

  /** Previous transaction amount (for price increase detection) */
  previousAmount?: number;

  /** Standard deviation of historical amounts */
  standardDeviation?: number;
}

/**
 * Statistics for a specific vendor.
 */
export interface VendorStats {
  /** Normalized vendor name */
  vendor: string;

  /** Number of historical transactions */
  transactionCount: number;

  /** Average transaction amount */
  averageAmount: number;

  /** Minimum historical amount */
  minAmount: number;

  /** Maximum historical amount */
  maxAmount: number;

  /** Standard deviation of amounts */
  stdDeviation: number;

  /** Most recent transaction amount */
  lastAmount: number;

  /** Date of most recent transaction */
  lastDate: string;

  /** Amount consistency score (0-1, higher = more consistent) */
  consistencyScore: number;
}

/**
 * Configuration for amount anomaly detection.
 */
export interface AmountAnomalyConfig {
  /** Threshold for unusual amount (percentage, default: 0.2 = 20%) */
  unusualThreshold: number;

  /** Threshold for price increase detection (percentage, default: 0.15 = 15%) */
  priceIncreaseThreshold: number;

  /** Minimum transactions needed to establish a baseline (default: 2) */
  minTransactionsForBaseline: number;

  /** Minimum transactions for price increase detection (default: 3) */
  minTransactionsForPriceIncrease: number;

  /** Maximum amount variance to consider "consistent" (default: 1.0) */
  consistencyTolerance: number;

  /** Whether to flag first-time vendors (default: false) */
  flagFirstTimeVendors: boolean;

  /** Minimum confidence to create an alert (default: 0.5) */
  confidenceThreshold: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_AMOUNT_ANOMALY_CONFIG: AmountAnomalyConfig = {
  unusualThreshold: 0.2, // 20% deviation
  priceIncreaseThreshold: 0.15, // 15% increase
  minTransactionsForBaseline: 2,
  minTransactionsForPriceIncrease: 3,
  consistencyTolerance: 1.0, // $1.00 variance
  flagFirstTimeVendors: false,
  confidenceThreshold: 0.5,
};

/**
 * Interface for the amount anomaly detector service.
 */
export interface AmountAnomalyDetector {
  /**
   * Check a transaction amount for anomalies.
   */
  checkAmount(transaction: LocalTransaction): Promise<AmountAnomalyResult>;

  /**
   * Get statistics for a specific vendor.
   */
  getVendorStats(vendor: string): Promise<VendorStats>;

  /**
   * Update the baseline with a new transaction.
   * Call this after a transaction is confirmed/saved.
   */
  updateBaseline(transaction: LocalTransaction): void;

  /**
   * Configure detection sensitivity.
   */
  configureSensitivity(config: Partial<AmountAnomalyConfig>): void;

  /**
   * Get current configuration.
   */
  getConfig(): AmountAnomalyConfig;

  /**
   * Create an anomaly alert for an amount anomaly.
   */
  createAmountAlert(
    transactionId: TransactionId,
    result: AmountAnomalyResult
  ): Promise<AnomalyAlertId>;

  /**
   * Get all vendor statistics for the user.
   */
  getAllVendorStats(): Promise<VendorStats[]>;
}

// ============================================
// Implementation
// ============================================

/**
 * Calculate the standard deviation of an array of numbers.
 */
function calculateStdDeviation(values: number[], mean: number): number {
  if (values.length < 2) {
    return 0;
  }

  const squaredDiffs = values.map((value) => Math.pow(value - mean, 2));
  const avgSquaredDiff =
    squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;

  return Math.sqrt(avgSquaredDiff);
}

/**
 * Calculate consistency score based on variance.
 * Higher score means more consistent amounts.
 */
function calculateConsistencyScore(stdDeviation: number, mean: number): number {
  if (mean === 0) {
    return 1;
  }

  // Coefficient of variation (normalized std deviation)
  const cv = stdDeviation / Math.abs(mean);

  // Convert to a 0-1 score (lower CV = higher consistency)
  return Math.max(0, Math.min(1, 1 - cv));
}

/**
 * Implementation of the AmountAnomalyDetector interface.
 */
class AmountAnomalyDetectorImpl implements AmountAnomalyDetector {
  private config: AmountAnomalyConfig;

  // In-memory cache for vendor stats (cleared on page refresh)
  private vendorStatsCache: Map<string, VendorStats> = new Map();
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  constructor(config?: Partial<AmountAnomalyConfig>) {
    this.config = { ...DEFAULT_AMOUNT_ANOMALY_CONFIG, ...config };
  }

  /**
   * Configure detection sensitivity.
   */
  configureSensitivity(config: Partial<AmountAnomalyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): AmountAnomalyConfig {
    return { ...this.config };
  }

  /**
   * Get statistics for a specific vendor.
   */
  async getVendorStats(vendor: string): Promise<VendorStats> {
    const normalizedVendor = normalizeVendor(vendor);

    // Check cache
    if (
      this.vendorStatsCache.has(normalizedVendor) &&
      Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS
    ) {
      return this.vendorStatsCache.get(normalizedVendor)!;
    }

    // Query all transactions for this vendor
    const transactions = await db.transactions
      .filter((tx) => normalizeVendor(tx.vendor) === normalizedVendor)
      .toArray();

    if (transactions.length === 0) {
      const emptyStats: VendorStats = {
        vendor: normalizedVendor,
        transactionCount: 0,
        averageAmount: 0,
        minAmount: 0,
        maxAmount: 0,
        stdDeviation: 0,
        lastAmount: 0,
        lastDate: '',
        consistencyScore: 0,
      };
      return emptyStats;
    }

    // Calculate statistics
    const amounts = transactions.map((tx) => tx.amount);
    const sum = amounts.reduce((acc, val) => acc + val, 0);
    const averageAmount = sum / amounts.length;
    const minAmount = Math.min(...amounts);
    const maxAmount = Math.max(...amounts);
    const stdDeviation = calculateStdDeviation(amounts, averageAmount);
    const consistencyScore = calculateConsistencyScore(
      stdDeviation,
      averageAmount
    );

    // Sort by date to get latest
    const sortedByDate = [...transactions].sort((a, b) =>
      b.date.localeCompare(a.date)
    );
    const latest = sortedByDate[0]!;

    const stats: VendorStats = {
      vendor: normalizedVendor,
      transactionCount: transactions.length,
      averageAmount,
      minAmount,
      maxAmount,
      stdDeviation,
      lastAmount: latest.amount,
      lastDate: latest.date,
      consistencyScore,
    };

    // Update cache
    this.vendorStatsCache.set(normalizedVendor, stats);
    this.cacheTimestamp = Date.now();

    return stats;
  }

  /**
   * Check a transaction amount for anomalies.
   */
  async checkAmount(
    transaction: LocalTransaction
  ): Promise<AmountAnomalyResult> {
    const stats = await this.getVendorStats(transaction.vendor);

    // First time vendor
    if (stats.transactionCount === 0) {
      return {
        isAnomaly: this.config.flagFirstTimeVendors,
        type: 'first_time',
        confidence: 0,
        message: `First transaction with ${transaction.vendor}`,
        comparison: null,
      };
    }

    // Not enough data for baseline
    if (stats.transactionCount < this.config.minTransactionsForBaseline) {
      return {
        isAnomaly: false,
        type: null,
        confidence: 0,
        message: '',
        comparison: null,
      };
    }

    const percentChange =
      (transaction.amount - stats.averageAmount) / stats.averageAmount;

    // Check for price increase (subscription/recurring charges)
    if (
      stats.transactionCount >= this.config.minTransactionsForPriceIncrease &&
      stats.consistencyScore > 0.8 && // Was consistent historically
      percentChange > this.config.priceIncreaseThreshold
    ) {
      const formattedCurrent = formatCurrency(transaction.amount);
      const formattedPrevious = formatCurrency(stats.lastAmount);
      const changePercent = (percentChange * 100).toFixed(0);

      return {
        isAnomaly: true,
        type: 'price_increase',
        confidence: Math.min(0.9, 0.5 + stats.consistencyScore * 0.4),
        message: `${transaction.vendor} increased from ${formattedPrevious} to ${formattedCurrent} (+${changePercent}%)`,
        comparison: {
          current: transaction.amount,
          average: stats.averageAmount,
          percentChange: percentChange * 100,
          previousAmount: stats.lastAmount,
          standardDeviation: stats.stdDeviation,
        },
      };
    }

    // Check for unusually high or low amount
    if (Math.abs(percentChange) > this.config.unusualThreshold) {
      const type: AmountAnomalyType =
        percentChange > 0 ? 'unusually_high' : 'unusually_low';
      const direction = type === 'unusually_high' ? 'higher' : 'lower';

      const formattedCurrent = formatCurrency(transaction.amount);
      const formattedAverage = formatCurrency(stats.averageAmount);

      // Calculate confidence based on how far from normal
      const confidence = Math.min(
        1,
        Math.abs(percentChange) / (this.config.unusualThreshold * 3)
      );

      // Only flag if confidence meets threshold
      if (confidence < this.config.confidenceThreshold) {
        return {
          isAnomaly: false,
          type: null,
          confidence: 0,
          message: '',
          comparison: null,
        };
      }

      return {
        isAnomaly: true,
        type,
        confidence,
        message: `${transaction.vendor} amount (${formattedCurrent}) is ${direction} than usual (avg: ${formattedAverage})`,
        comparison: {
          current: transaction.amount,
          average: stats.averageAmount,
          percentChange: percentChange * 100,
          standardDeviation: stats.stdDeviation,
        },
      };
    }

    // No anomaly detected
    return {
      isAnomaly: false,
      type: null,
      confidence: 0,
      message: '',
      comparison: null,
    };
  }

  /**
   * Update the baseline with a new transaction.
   * Invalidates the cache for the vendor.
   */
  updateBaseline(transaction: LocalTransaction): void {
    const normalizedVendor = normalizeVendor(transaction.vendor);
    this.vendorStatsCache.delete(normalizedVendor);
  }

  /**
   * Create an anomaly alert for an amount anomaly.
   */
  async createAmountAlert(
    transactionId: TransactionId,
    result: AmountAnomalyResult
  ): Promise<AnomalyAlertId> {
    const id = uuidv4() as AnomalyAlertId;

    // Map AmountAnomalyType to AnomalyType
    let anomalyType: AnomalyType = 'unusual_amount';
    if (result.type === 'price_increase') {
      anomalyType = 'price_increase';
    } else if (result.type === 'first_time') {
      anomalyType = 'new_vendor';
    }

    const alert: AnomalyAlert = {
      id,
      transactionId,
      relatedTransactionIds: [],
      type: anomalyType,
      severity:
        result.confidence >= 0.8
          ? 'high'
          : result.confidence >= 0.5
            ? 'medium'
            : 'low',
      message: result.message,
      details: {
        actualAmount: result.comparison?.current,
        expectedRange: result.comparison
          ? {
              min:
                result.comparison.average -
                (result.comparison.standardDeviation || 0),
              max:
                result.comparison.average +
                (result.comparison.standardDeviation || 0),
            }
          : undefined,
        percentageIncrease:
          result.type === 'price_increase'
            ? result.comparison?.percentChange
            : undefined,
        previousAmount: result.comparison?.previousAmount,
      },
      isResolved: false,
      userAction: null,
      createdAt: new Date(),
      resolvedAt: null,
    };

    await db.anomalies.add(alert);

    return id;
  }

  /**
   * Get all vendor statistics for the user.
   */
  async getAllVendorStats(): Promise<VendorStats[]> {
    // Get all unique vendors
    const transactions = await db.transactions.toArray();
    const vendorSet = new Set<string>();

    for (const tx of transactions) {
      vendorSet.add(normalizeVendor(tx.vendor));
    }

    // Get stats for each vendor
    const statsPromises = Array.from(vendorSet).map((vendor) =>
      this.getVendorStats(vendor)
    );

    return Promise.all(statsPromises);
  }

  /**
   * Clear the vendor stats cache.
   */
  clearCache(): void {
    this.vendorStatsCache.clear();
    this.cacheTimestamp = 0;
  }
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Singleton instance of the amount anomaly detector.
 * Use this throughout the application.
 */
export const amountAnomalyDetector = new AmountAnomalyDetectorImpl();

// ============================================
// Convenience Functions
// ============================================

/**
 * Quick check for amount anomalies with default settings.
 *
 * @param transaction - Transaction to check
 * @returns AmountAnomalyResult
 */
export async function checkAmountAnomaly(
  transaction: LocalTransaction
): Promise<AmountAnomalyResult> {
  return amountAnomalyDetector.checkAmount(transaction);
}

/**
 * Get vendor statistics.
 *
 * @param vendor - Vendor name
 * @returns VendorStats
 */
export async function getVendorStats(vendor: string): Promise<VendorStats> {
  return amountAnomalyDetector.getVendorStats(vendor);
}

/**
 * Get all unresolved amount anomaly alerts.
 *
 * @returns Array of unresolved amount anomaly alerts
 */
export async function getUnresolvedAmountAlerts(): Promise<AnomalyAlert[]> {
  return db.anomalies
    .where('isResolved')
    .equals(0)
    .and(
      (alert) =>
        alert.type === 'unusual_amount' || alert.type === 'price_increase'
    )
    .toArray();
}

/**
 * Resolve an amount anomaly alert.
 *
 * @param alertId - Alert ID to resolve
 * @param action - User action ('confirmed' = legitimate, 'dismissed' = ignore)
 */
export async function resolveAmountAlert(
  alertId: AnomalyAlertId,
  action: 'confirmed' | 'dismissed'
): Promise<void> {
  await db.resolveAnomaly(alertId, action);
}

/**
 * Check multiple transactions for amount anomalies.
 *
 * @param transactions - Transactions to check
 * @returns Array of anomaly results with transaction IDs
 */
export async function checkMultipleAmounts(
  transactions: LocalTransaction[]
): Promise<
  Array<{ transactionId: TransactionId; result: AmountAnomalyResult }>
> {
  const results: Array<{
    transactionId: TransactionId;
    result: AmountAnomalyResult;
  }> = [];

  for (const transaction of transactions) {
    const result = await amountAnomalyDetector.checkAmount(transaction);
    if (result.isAnomaly) {
      results.push({ transactionId: transaction.id, result });
    }
  }

  return results;
}
