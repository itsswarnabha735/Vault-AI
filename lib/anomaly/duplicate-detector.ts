/**
 * Duplicate Transaction Detector for Vault-AI
 *
 * Detects potential duplicate transactions based on:
 * - Amount matching (exact or within tolerance)
 * - Date proximity (within configurable days)
 * - Vendor name similarity (using normalized Levenshtein distance)
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
} from '@/types/database';
import { v4 as uuidv4 } from 'uuid';

import {
  addDays,
  subtractDays,
  daysDifference,
  vendorSimilarity,
  amountsMatch,
  calculateDuplicateConfidence,
  formatCurrency,
  normalizeVendor,
} from './utils';

// ============================================
// Types and Interfaces
// ============================================

/**
 * Result of a duplicate check for a single transaction.
 */
export interface DuplicateResult {
  /** Whether the transaction is likely a duplicate */
  isDuplicate: boolean;

  /** Confidence score (0-1) of the duplicate detection */
  confidence: number;

  /** ID of the matching (original) transaction, if found */
  matchingTransactionId: TransactionId | null;

  /** Human-readable reason for the detection */
  reason: string;

  /** Additional details about the match */
  details?: DuplicateMatchDetails;
}

/**
 * Additional details about a duplicate match.
 */
export interface DuplicateMatchDetails {
  /** Vendor similarity score (0-1) */
  vendorSimilarity: number;

  /** Whether amounts match exactly */
  amountMatch: boolean;

  /** Days between transactions */
  daysDifference: number;

  /** The matching transaction's vendor name */
  matchingVendor: string;

  /** The matching transaction's amount */
  matchingAmount: number;

  /** The matching transaction's date */
  matchingDate: string;
}

/**
 * A pair of potentially duplicate transactions.
 */
export interface DuplicatePair {
  /** The original (earlier) transaction */
  original: LocalTransaction;

  /** The duplicate (later) transaction */
  duplicate: LocalTransaction;

  /** Confidence score of the match */
  confidence: number;

  /** Human-readable reason */
  reason: string;
}

/**
 * Configuration for duplicate detection sensitivity.
 */
export interface DuplicateConfig {
  /** Amount tolerance for matching (default: 0 for exact match) */
  amountTolerance: number;

  /** Number of days to look before/after for duplicates (default: 1) */
  daysTolerance: number;

  /** Minimum vendor similarity threshold (default: 0.9 = 90%) */
  vendorMatchThreshold: number;

  /** Minimum confidence to flag as duplicate (default: 0.8 = 80%) */
  confidenceThreshold: number;

  /** Whether to include already-resolved alerts in checks */
  includeResolved: boolean;
}

/**
 * Default configuration values.
 */
export const DEFAULT_DUPLICATE_CONFIG: DuplicateConfig = {
  amountTolerance: 0, // Exact match
  daysTolerance: 1, // Within 1 day
  vendorMatchThreshold: 0.9, // 90% similarity
  confidenceThreshold: 0.8, // 80% confidence to flag
  includeResolved: false,
};

/**
 * Interface for the duplicate detector service.
 */
export interface DuplicateDetector {
  /**
   * Check a single transaction for duplicates against existing transactions.
   */
  checkForDuplicates(transaction: LocalTransaction): Promise<DuplicateResult>;

  /**
   * Find all duplicate pairs in a list of transactions.
   */
  findDuplicates(transactions: LocalTransaction[]): DuplicatePair[];

  /**
   * Configure detection sensitivity.
   */
  configureSensitivity(config: Partial<DuplicateConfig>): void;

  /**
   * Get current configuration.
   */
  getConfig(): DuplicateConfig;

  /**
   * Create an anomaly alert for a duplicate detection.
   */
  createDuplicateAlert(
    transactionId: TransactionId,
    matchingTransactionId: TransactionId,
    result: DuplicateResult
  ): Promise<AnomalyAlertId>;

  /**
   * Check if a transaction already has an unresolved duplicate alert.
   */
  hasUnresolvedAlert(transactionId: TransactionId): Promise<boolean>;
}

// ============================================
// Implementation
// ============================================

/**
 * Implementation of the DuplicateDetector interface.
 */
class DuplicateDetectorImpl implements DuplicateDetector {
  private config: DuplicateConfig;

  constructor(config?: Partial<DuplicateConfig>) {
    this.config = { ...DEFAULT_DUPLICATE_CONFIG, ...config };
  }

  /**
   * Configure detection sensitivity.
   */
  configureSensitivity(config: Partial<DuplicateConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): DuplicateConfig {
    return { ...this.config };
  }

  /**
   * Check a single transaction for duplicates.
   */
  async checkForDuplicates(
    transaction: LocalTransaction
  ): Promise<DuplicateResult> {
    // Get transactions within date tolerance
    const startDate = subtractDays(transaction.date, this.config.daysTolerance);
    const endDate = addDays(transaction.date, this.config.daysTolerance);

    const candidates = await db.transactions
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();

    // Check each candidate for potential match
    for (const candidate of candidates) {
      // Skip self-comparison
      if (candidate.id === transaction.id) {
        continue;
      }

      // Check amount match
      const amountMatches = amountsMatch(
        candidate.amount,
        transaction.amount,
        this.config.amountTolerance
      );

      // Skip if amounts don't match
      if (!amountMatches) {
        continue;
      }

      // Check vendor similarity
      const similarity = vendorSimilarity(candidate.vendor, transaction.vendor);

      // Check if vendor similarity meets threshold
      if (similarity >= this.config.vendorMatchThreshold) {
        const dateDiff = daysDifference(candidate.date, transaction.date);

        // Calculate overall confidence
        const confidence = calculateDuplicateConfidence(
          similarity,
          amountMatches,
          dateDiff,
          this.config.daysTolerance
        );

        // Only flag if confidence meets threshold
        if (confidence >= this.config.confidenceThreshold) {
          const matchingAmount = formatCurrency(candidate.amount);
          const reason =
            `Possible duplicate of transaction on ${candidate.date}: ` +
            `${candidate.vendor} - ${matchingAmount}`;

          return {
            isDuplicate: true,
            confidence,
            matchingTransactionId: candidate.id,
            reason,
            details: {
              vendorSimilarity: similarity,
              amountMatch: amountMatches,
              daysDifference: dateDiff,
              matchingVendor: candidate.vendor,
              matchingAmount: candidate.amount,
              matchingDate: candidate.date,
            },
          };
        }
      }
    }

    // No duplicate found
    return {
      isDuplicate: false,
      confidence: 0,
      matchingTransactionId: null,
      reason: '',
    };
  }

  /**
   * Find all duplicate pairs in a list of transactions.
   * Useful for batch analysis of imported transactions.
   */
  findDuplicates(transactions: LocalTransaction[]): DuplicatePair[] {
    const pairs: DuplicatePair[] = [];
    const checked = new Set<string>();

    // Sort by date to ensure we always mark the earlier one as "original"
    const sorted = [...transactions].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    for (let i = 0; i < sorted.length; i++) {
      const transaction = sorted[i]!;

      for (let j = i + 1; j < sorted.length; j++) {
        const candidate = sorted[j]!;

        // Create a unique key for this pair
        const pairKey = [transaction.id, candidate.id].sort().join(':');

        // Skip if already checked
        if (checked.has(pairKey)) {
          continue;
        }
        checked.add(pairKey);

        // Check date proximity
        const dateDiff = daysDifference(transaction.date, candidate.date);
        if (dateDiff > this.config.daysTolerance) {
          continue;
        }

        // Check amount match
        const amountMatches = amountsMatch(
          transaction.amount,
          candidate.amount,
          this.config.amountTolerance
        );
        if (!amountMatches) {
          continue;
        }

        // Check vendor similarity
        const similarity = vendorSimilarity(
          transaction.vendor,
          candidate.vendor
        );
        if (similarity < this.config.vendorMatchThreshold) {
          continue;
        }

        // Calculate confidence
        const confidence = calculateDuplicateConfidence(
          similarity,
          amountMatches,
          dateDiff,
          this.config.daysTolerance
        );

        if (confidence >= this.config.confidenceThreshold) {
          const matchingAmount = formatCurrency(candidate.amount);
          pairs.push({
            original: transaction,
            duplicate: candidate,
            confidence,
            reason:
              `Same vendor "${normalizeVendor(transaction.vendor)}" and amount ${matchingAmount} ` +
              `within ${dateDiff} day(s)`,
          });
        }
      }
    }

    return pairs;
  }

  /**
   * Create an anomaly alert for a duplicate detection.
   */
  async createDuplicateAlert(
    transactionId: TransactionId,
    matchingTransactionId: TransactionId,
    result: DuplicateResult
  ): Promise<AnomalyAlertId> {
    const id = uuidv4() as AnomalyAlertId;

    const alert: AnomalyAlert = {
      id,
      transactionId,
      relatedTransactionIds: [matchingTransactionId],
      type: 'duplicate',
      severity: result.confidence >= 0.95 ? 'high' : 'medium',
      message: result.reason,
      details: {
        similarityScore: result.confidence,
        ...(result.details && {
          expectedRange: {
            min: result.details.matchingAmount,
            max: result.details.matchingAmount,
          },
          actualAmount: result.details.matchingAmount,
        }),
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
   * Check if a transaction already has an unresolved duplicate alert.
   */
  async hasUnresolvedAlert(transactionId: TransactionId): Promise<boolean> {
    const alerts = await db.anomalies
      .where('transactionId')
      .equals(transactionId)
      .and((alert) => !alert.isResolved && alert.type === 'duplicate')
      .count();

    return alerts > 0;
  }
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Singleton instance of the duplicate detector.
 * Use this throughout the application.
 */
export const duplicateDetector = new DuplicateDetectorImpl();

// ============================================
// Convenience Functions
// ============================================

/**
 * Quick check for duplicates with default settings.
 *
 * @param transaction - Transaction to check
 * @returns DuplicateResult
 */
export async function checkForDuplicates(
  transaction: LocalTransaction
): Promise<DuplicateResult> {
  return duplicateDetector.checkForDuplicates(transaction);
}

/**
 * Find all duplicates in a batch of transactions.
 *
 * @param transactions - Transactions to analyze
 * @returns Array of duplicate pairs
 */
export function findDuplicates(
  transactions: LocalTransaction[]
): DuplicatePair[] {
  return duplicateDetector.findDuplicates(transactions);
}

/**
 * Resolve a duplicate alert with a user action.
 *
 * @param alertId - Alert ID to resolve
 * @param action - User action ('confirmed' keeps both, 'dismissed' ignores alert)
 */
export async function resolveDuplicateAlert(
  alertId: AnomalyAlertId,
  action: 'confirmed' | 'dismissed'
): Promise<void> {
  await db.resolveAnomaly(alertId, action);
}

/**
 * Delete a transaction and resolve its associated duplicate alert.
 *
 * @param transactionId - Transaction to delete
 * @param alertId - Associated alert to resolve
 */
export async function deleteAndResolve(
  transactionId: TransactionId,
  alertId: AnomalyAlertId
): Promise<void> {
  await db.transaction('rw', [db.transactions, db.anomalies], async () => {
    await db.transactions.delete(transactionId);
    await db.resolveAnomaly(alertId, 'confirmed');
  });
}

/**
 * Get all unresolved duplicate alerts.
 *
 * @returns Array of unresolved duplicate alerts
 */
export async function getUnresolvedDuplicateAlerts(): Promise<AnomalyAlert[]> {
  return db.anomalies
    .where('isResolved')
    .equals(0)
    .and((alert) => alert.type === 'duplicate')
    .toArray();
}

/**
 * Get duplicate alert for a specific transaction.
 *
 * @param transactionId - Transaction ID
 * @returns Duplicate alert if exists, null otherwise
 */
export async function getDuplicateAlertForTransaction(
  transactionId: TransactionId
): Promise<AnomalyAlert | null> {
  const alerts = await db.anomalies
    .where('transactionId')
    .equals(transactionId)
    .and((alert) => alert.type === 'duplicate')
    .toArray();

  return alerts[0] ?? null;
}
