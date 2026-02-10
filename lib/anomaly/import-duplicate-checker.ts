/**
 * Import Duplicate Checker for Vault-AI
 *
 * Pre-import duplicate detection that works with incoming transactions
 * BEFORE they are saved to IndexedDB. This is different from the main
 * DuplicateDetector which works post-save.
 *
 * Used by:
 * - StatementReview: Check each parsed statement transaction against existing DB
 * - ExtractionReview: Check each receipt/invoice against existing DB
 * - ImportModal: Check if the same statement was already imported (fingerprint)
 *
 * PRIVACY: All detection runs locally in the browser.
 */

import { db } from '@/lib/storage/db';
import {
  vendorSimilarity,
  amountsMatch,
  daysDifference,
  subtractDays,
  addDays,
  calculateDuplicateConfidence,
} from './utils';
import type { LocalTransaction, TransactionId } from '@/types/database';
import type { ParsedStatementTransaction, StatementParseResult } from '@/types/statement';

// ============================================
// Types
// ============================================

/**
 * Result of a pre-import duplicate check for a single transaction.
 */
export interface ImportDuplicateResult {
  /** Whether this transaction likely already exists in the DB */
  isDuplicate: boolean;

  /** Confidence of the match (0-1) */
  confidence: number;

  /** ID of the matching existing transaction */
  matchingTransactionId: TransactionId | null;

  /** Brief description of the match */
  reason: string;

  /** The matching transaction's key details */
  matchDetails?: {
    existingVendor: string;
    existingAmount: number;
    existingDate: string;
  };
}

/**
 * Batch result for statement duplicate checking.
 */
export interface StatementDuplicateCheckResult {
  /** Per-transaction results keyed by ParsedStatementTransaction.id */
  transactionResults: Map<string, ImportDuplicateResult>;

  /** Number of transactions flagged as duplicates */
  duplicateCount: number;

  /** Total number of transactions checked */
  totalChecked: number;

  /** Time taken for the check */
  checkTimeMs: number;
}

/**
 * Statement fingerprint for detecting re-import of the same statement.
 */
export interface StatementFingerprint {
  /** Unique identifier */
  id: string;

  /** Issuer name (normalized) */
  issuer: string;

  /** Account last 4 digits */
  accountLast4: string | null;

  /** Statement period start */
  periodStart: string | null;

  /** Statement period end */
  periodEnd: string | null;

  /** Total debit amount (for matching) */
  totalDebits: number;

  /** Number of transactions in the statement */
  transactionCount: number;

  /** When this fingerprint was saved */
  importedAt: Date;

  /** File name of the imported statement */
  fileName: string;
}

/**
 * Result of a statement fingerprint check.
 */
export interface StatementFingerprintResult {
  /** Whether this statement was previously imported */
  isAlreadyImported: boolean;

  /** Confidence of the match */
  confidence: number;

  /** Details of the previous import, if found */
  previousImport?: {
    importedAt: Date;
    fileName: string;
    transactionCount: number;
  };
}

// ============================================
// Configuration
// ============================================

interface ImportDuplicateConfig {
  /** Days tolerance for date matching */
  daysTolerance: number;

  /** Amount tolerance (0 = exact match) */
  amountTolerance: number;

  /** Minimum vendor similarity threshold */
  vendorMatchThreshold: number;

  /** Minimum confidence to flag as duplicate */
  confidenceThreshold: number;
}

const DEFAULT_CONFIG: ImportDuplicateConfig = {
  daysTolerance: 1,
  amountTolerance: 0.01, // Allow 1 cent tolerance for rounding
  vendorMatchThreshold: 0.85, // Slightly lower than post-import (OCR can differ)
  confidenceThreshold: 0.75, // Slightly lower threshold to catch more potential dupes
};

// ============================================
// Import Duplicate Checker Service
// ============================================

class ImportDuplicateCheckerService {
  private config: ImportDuplicateConfig;

  constructor(config?: Partial<ImportDuplicateConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check a single incoming transaction against existing DB transactions.
   */
  async checkTransaction(
    date: string,
    vendor: string,
    amount: number
  ): Promise<ImportDuplicateResult> {
    if (!date || !vendor || amount === 0) {
      return { isDuplicate: false, confidence: 0, matchingTransactionId: null, reason: '' };
    }

    try {
      // Query existing transactions within the date window
      const startDate = subtractDays(date, this.config.daysTolerance);
      const endDate = addDays(date, this.config.daysTolerance);

      const candidates = await db.transactions
        .where('date')
        .between(startDate, endDate, true, true)
        .toArray();

      // Find the best matching candidate
      let bestMatch: ImportDuplicateResult | null = null;

      for (const candidate of candidates) {
        // Amount check
        if (!amountsMatch(candidate.amount, amount, this.config.amountTolerance)) {
          continue;
        }

        // Vendor similarity
        const similarity = vendorSimilarity(candidate.vendor, vendor);
        if (similarity < this.config.vendorMatchThreshold) {
          continue;
        }

        // Date proximity
        const dateDiff = daysDifference(candidate.date, date);

        // Calculate confidence
        const confidence = calculateDuplicateConfidence(
          similarity,
          true,
          dateDiff,
          this.config.daysTolerance
        );

        if (confidence >= this.config.confidenceThreshold) {
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = {
              isDuplicate: true,
              confidence,
              matchingTransactionId: candidate.id,
              reason: `Matches existing: ${candidate.vendor} - $${candidate.amount.toFixed(2)} on ${candidate.date}`,
              matchDetails: {
                existingVendor: candidate.vendor,
                existingAmount: candidate.amount,
                existingDate: candidate.date,
              },
            };
          }
        }
      }

      return bestMatch || {
        isDuplicate: false,
        confidence: 0,
        matchingTransactionId: null,
        reason: '',
      };
    } catch (error) {
      console.error('[ImportDuplicateChecker] Check failed:', error);
      return { isDuplicate: false, confidence: 0, matchingTransactionId: null, reason: '' };
    }
  }

  /**
   * Batch check all transactions from a parsed statement.
   * Returns results for each transaction, keyed by transaction ID.
   */
  async checkStatementTransactions(
    transactions: ParsedStatementTransaction[]
  ): Promise<StatementDuplicateCheckResult> {
    const startTime = performance.now();
    const results = new Map<string, ImportDuplicateResult>();
    let duplicateCount = 0;

    for (const tx of transactions) {
      const result = await this.checkTransaction(tx.date, tx.vendor, tx.amount);
      results.set(tx.id, result);
      if (result.isDuplicate) {
        duplicateCount++;
      }
    }

    const checkTimeMs = performance.now() - startTime;

    console.log(
      `[ImportDuplicateChecker] Checked ${transactions.length} transactions: ` +
        `${duplicateCount} potential duplicates found in ${checkTimeMs.toFixed(0)}ms`
    );

    return {
      transactionResults: results,
      duplicateCount,
      totalChecked: transactions.length,
      checkTimeMs,
    };
  }

  /**
   * Check a single receipt/invoice for duplicates.
   * Simpler version of checkTransaction for the ExtractionReview flow.
   */
  async checkReceipt(
    date: string,
    vendor: string,
    amount: number
  ): Promise<ImportDuplicateResult> {
    return this.checkTransaction(date, vendor, amount);
  }

  /**
   * Generate a fingerprint for a statement to detect re-imports.
   */
  generateFingerprint(
    result: StatementParseResult,
    fileName: string
  ): StatementFingerprint {
    return {
      id: `fp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      issuer: (result.issuer || 'unknown').toLowerCase().trim(),
      accountLast4: result.accountLast4,
      periodStart: result.statementPeriod.start,
      periodEnd: result.statementPeriod.end,
      totalDebits: result.totals.totalDebits,
      transactionCount: result.transactions.length,
      importedAt: new Date(),
      fileName,
    };
  }

  /**
   * Check if a statement has been previously imported by matching fingerprints.
   */
  async checkStatementFingerprint(
    result: StatementParseResult
  ): Promise<StatementFingerprintResult> {
    try {
      const existingFingerprints = await db.statementFingerprints.toArray();

      const issuer = (result.issuer || 'unknown').toLowerCase().trim();

      for (const fp of existingFingerprints) {
        let matchScore = 0;
        let maxScore = 0;

        // Issuer match (weighted 2)
        maxScore += 2;
        if (fp.issuer === issuer) {
          matchScore += 2;
        }

        // Account last 4 match (weighted 2)
        if (fp.accountLast4 && result.accountLast4) {
          maxScore += 2;
          if (fp.accountLast4 === result.accountLast4) {
            matchScore += 2;
          }
        }

        // Period match (weighted 3)
        if (fp.periodStart && fp.periodEnd &&
            result.statementPeriod.start && result.statementPeriod.end) {
          maxScore += 3;
          if (fp.periodStart === result.statementPeriod.start &&
              fp.periodEnd === result.statementPeriod.end) {
            matchScore += 3;
          }
        }

        // Total amount match (weighted 2, with 1% tolerance)
        maxScore += 2;
        const totalTolerance = Math.max(0.01, result.totals.totalDebits * 0.01);
        if (Math.abs(fp.totalDebits - result.totals.totalDebits) <= totalTolerance) {
          matchScore += 2;
        }

        // Transaction count match (weighted 1)
        maxScore += 1;
        if (fp.transactionCount === result.transactions.length) {
          matchScore += 1;
        }

        const confidence = maxScore > 0 ? matchScore / maxScore : 0;

        // If we have a strong match (>= 70%), flag it
        if (confidence >= 0.7) {
          return {
            isAlreadyImported: true,
            confidence,
            previousImport: {
              importedAt: fp.importedAt,
              fileName: fp.fileName,
              transactionCount: fp.transactionCount,
            },
          };
        }
      }

      return { isAlreadyImported: false, confidence: 0 };
    } catch (error) {
      console.error('[ImportDuplicateChecker] Fingerprint check failed:', error);
      return { isAlreadyImported: false, confidence: 0 };
    }
  }

  /**
   * Save a statement fingerprint after successful import.
   */
  async saveFingerprint(fingerprint: StatementFingerprint): Promise<void> {
    try {
      await db.statementFingerprints.add(fingerprint);
      console.log(
        `[ImportDuplicateChecker] Saved fingerprint: ${fingerprint.issuer} ` +
          `(${fingerprint.periodStart} - ${fingerprint.periodEnd})`
      );
    } catch (error) {
      console.error('[ImportDuplicateChecker] Failed to save fingerprint:', error);
    }
  }

  /**
   * Update configuration.
   */
  configure(config: Partial<ImportDuplicateConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================
// Singleton Export
// ============================================

export const importDuplicateChecker = new ImportDuplicateCheckerService();
