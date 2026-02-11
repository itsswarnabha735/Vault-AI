/**
 * Recurring Transaction Detector for Vault-AI
 *
 * Analyses transaction history to find recurring patterns such as
 * subscriptions, EMIs, rent, SIPs, and utility bills.
 *
 * Algorithm:
 * 1. Group transactions by normalised vendor
 * 2. For each vendor group (≥ 2 transactions), compute intervals between dates
 * 3. Detect periodicity: weekly (7±2d), biweekly (14±3d), monthly (28-33d),
 *    quarterly (85-100d), annual (350-380d)
 * 4. Score pattern strength based on interval consistency + amount consistency
 * 5. Predict next expected date and amount
 *
 * PRIVACY: All computation is local. No data leaves the device.
 */

import { db } from '@/lib/storage/db';
import type { LocalTransaction, CategoryId, TransactionId } from '@/types/database';

// ============================================
// Types
// ============================================

export type RecurrenceFrequency =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'semi-annual'
  | 'annual';

export interface RecurringPattern {
  /** Unique identifier */
  id: string;

  /** Normalised vendor name */
  vendor: string;

  /** Display-friendly vendor name (from the most recent transaction) */
  displayVendor: string;

  /** Detected frequency */
  frequency: RecurrenceFrequency;

  /** Average amount (absolute value) */
  averageAmount: number;

  /** Amount standard deviation (for detecting amount changes) */
  amountStdDev: number;

  /** Currency code */
  currency: string;

  /** Category ID from the most recent transaction */
  categoryId: CategoryId | null;

  /** Next expected transaction date (ISO string) */
  nextExpected: string;

  /** Date of the last observed transaction (ISO string) */
  lastSeen: string;

  /** Number of transactions in the pattern */
  transactionCount: number;

  /** Confidence score (0-1) based on interval + amount consistency */
  confidence: number;

  /** Transaction IDs that form this pattern */
  transactionIds: TransactionId[];

  /** Whether the pattern appears active (last seen within 1.5x expected interval) */
  isActive: boolean;

  /** Average interval in days */
  averageIntervalDays: number;
}

// ============================================
// Frequency Detection Config
// ============================================

interface FrequencyRange {
  frequency: RecurrenceFrequency;
  /** Ideal interval in days */
  idealDays: number;
  /** Minimum interval to consider */
  minDays: number;
  /** Maximum interval to consider */
  maxDays: number;
  /** Tolerance for interval consistency (fraction of idealDays) */
  tolerance: number;
}

const FREQUENCY_RANGES: FrequencyRange[] = [
  { frequency: 'weekly', idealDays: 7, minDays: 5, maxDays: 9, tolerance: 0.3 },
  { frequency: 'biweekly', idealDays: 14, minDays: 12, maxDays: 17, tolerance: 0.2 },
  { frequency: 'monthly', idealDays: 30, minDays: 26, maxDays: 35, tolerance: 0.15 },
  { frequency: 'quarterly', idealDays: 91, minDays: 80, maxDays: 100, tolerance: 0.1 },
  { frequency: 'semi-annual', idealDays: 182, minDays: 165, maxDays: 200, tolerance: 0.1 },
  { frequency: 'annual', idealDays: 365, minDays: 340, maxDays: 395, tolerance: 0.08 },
];

/** Minimum transactions required to detect a pattern */
const MIN_TRANSACTIONS = 2;

/** Minimum confidence to report a pattern */
const MIN_CONFIDENCE = 0.4;

// ============================================
// Helpers
// ============================================

/**
 * Parse a date string into a Date object.
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Calculate the number of days between two dates.
 */
function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Compute mean and standard deviation of an array.
 */
function meanStdDev(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (values.length === 1) return { mean, stdDev: 0 };
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return { mean, stdDev: Math.sqrt(variance) };
}

/**
 * Simple vendor normalisation for grouping (more aggressive than the learning normaliser).
 */
function normaliseVendorForGrouping(vendor: string): string {
  let v = vendor.toLowerCase().trim();

  // Strip UPI prefix
  const upiMatch = v.match(/^upi\/([^/@]+)/);
  if (upiMatch?.[1]) {
    v = upiMatch[1].replace(/\.\w+$/, '').replace(/[._-]/g, ' ').trim();
  }

  // Strip NEFT/RTGS/IMPS
  v = v.replace(/^(?:neft|rtgs|imps|nach|ecs|ach|pos|ecom)[\s/-]+/i, '');

  // Remove reference numbers, store numbers, etc.
  v = v
    .replace(/[#*]\s*\d+/g, '')
    .replace(/\b\d{6,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Truncate to first 30 chars for grouping
  if (v.length > 30) v = v.slice(0, 30).trim();

  return v;
}

/**
 * Add days to a date and return ISO string.
 */
function addDays(date: Date, days: number): string {
  const result = new Date(date);
  result.setDate(result.getDate() + Math.round(days));
  return result.toISOString().split('T')[0] || '';
}

// ============================================
// Recurring Detector Service
// ============================================

class RecurringDetectorService {
  /** Cached patterns */
  private patterns: RecurringPattern[] | null = null;
  private lastScanTime = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Detect recurring patterns from all transactions.
   * Results are cached for 5 minutes.
   *
   * @param forceRefresh - Force re-scan even if cache is fresh
   * @returns Detected recurring patterns sorted by confidence
   */
  async detectPatterns(forceRefresh = false): Promise<RecurringPattern[]> {
    // Return cached if fresh
    if (
      !forceRefresh &&
      this.patterns &&
      Date.now() - this.lastScanTime < this.CACHE_TTL_MS
    ) {
      return this.patterns;
    }

    const transactions = await db.transactions.toArray();
    this.patterns = this.analyseTransactions(transactions);
    this.lastScanTime = Date.now();
    return this.patterns;
  }

  /**
   * Detect patterns from a given set of transactions (pure function).
   */
  analyseTransactions(transactions: LocalTransaction[]): RecurringPattern[] {
    if (transactions.length < MIN_TRANSACTIONS) return [];

    // 1. Group by normalised vendor
    const groups = new Map<string, LocalTransaction[]>();
    for (const tx of transactions) {
      if (!tx.vendor || tx.vendor.trim().length === 0) continue;
      const key = normaliseVendorForGrouping(tx.vendor);
      if (key.length < 2) continue;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(tx);
    }

    // 2. Analyse each group
    const patterns: RecurringPattern[] = [];

    for (const [vendorKey, txs] of groups) {
      if (txs.length < MIN_TRANSACTIONS) continue;

      // Sort by date ascending
      txs.sort(
        (a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()
      );

      // Compute intervals
      const intervals: number[] = [];
      for (let i = 1; i < txs.length; i++) {
        const days = daysBetween(
          parseDate(txs[i]!.date),
          parseDate(txs[i - 1]!.date)
        );
        if (days > 0) intervals.push(days);
      }

      if (intervals.length === 0) continue;

      // Detect best frequency match
      const pattern = this.detectFrequency(vendorKey, txs, intervals);
      if (pattern && pattern.confidence >= MIN_CONFIDENCE) {
        patterns.push(pattern);
      }
    }

    // Sort by confidence descending
    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get patterns that are currently active (not stale).
   */
  async getActivePatterns(): Promise<RecurringPattern[]> {
    const all = await this.detectPatterns();
    return all.filter((p) => p.isActive);
  }

  /**
   * Get upcoming expected transactions (within next N days).
   */
  async getUpcoming(withinDays = 30): Promise<RecurringPattern[]> {
    const active = await this.getActivePatterns();
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + withinDays);

    return active.filter((p) => {
      const next = parseDate(p.nextExpected);
      return next >= now && next <= cutoff;
    });
  }

  /**
   * Check if a specific vendor has a recurring pattern.
   */
  async getPatternForVendor(
    vendor: string
  ): Promise<RecurringPattern | null> {
    const patterns = await this.detectPatterns();
    const key = normaliseVendorForGrouping(vendor);
    return patterns.find((p) => p.vendor === key) || null;
  }

  /**
   * Invalidate the cache (call after importing new transactions).
   */
  invalidateCache(): void {
    this.patterns = null;
    this.lastScanTime = 0;
  }

  // ============================================
  // Private
  // ============================================

  private detectFrequency(
    vendorKey: string,
    txs: LocalTransaction[],
    intervals: number[]
  ): RecurringPattern | null {
    const { mean: avgInterval, stdDev: intervalStdDev } = meanStdDev(intervals);

    // Find the best matching frequency
    let bestMatch: {
      range: FrequencyRange;
      score: number;
    } | null = null;

    for (const range of FREQUENCY_RANGES) {
      // Check if average interval falls within this frequency's range
      if (avgInterval < range.minDays || avgInterval > range.maxDays) continue;

      // Score: how consistent are the intervals relative to the ideal?
      const deviation = Math.abs(avgInterval - range.idealDays) / range.idealDays;
      const consistency =
        intervalStdDev > 0
          ? 1 - Math.min(1, intervalStdDev / (range.idealDays * range.tolerance * 2))
          : 1;

      const score = (1 - deviation) * 0.4 + consistency * 0.6;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { range, score };
      }
    }

    if (!bestMatch || bestMatch.score < 0.3) return null;

    // Amount analysis
    const amounts = txs.map((tx) => Math.abs(tx.amount));
    const { mean: avgAmount, stdDev: amountStdDev } = meanStdDev(amounts);
    const amountConsistency =
      avgAmount > 0 ? 1 - Math.min(1, amountStdDev / avgAmount) : 0;

    // Overall confidence
    const frequencyScore = bestMatch.score;
    const countBoost = Math.min(0.15, (txs.length - MIN_TRANSACTIONS) * 0.03);
    const confidence = Math.min(
      0.99,
      frequencyScore * 0.5 + amountConsistency * 0.3 + countBoost + 0.05
    );

    // Most recent transaction
    const lastTx = txs[txs.length - 1]!;
    const lastDate = parseDate(lastTx.date);

    // Next expected date
    const nextExpected = addDays(lastDate, bestMatch.range.idealDays);

    // Is it active? (last seen within 1.5x the expected interval)
    const daysSinceLastSeen = daysBetween(new Date(), lastDate);
    const isActive = daysSinceLastSeen <= bestMatch.range.idealDays * 1.5;

    return {
      id: `rec-${vendorKey.replace(/\s+/g, '-').slice(0, 20)}-${bestMatch.range.frequency}`,
      vendor: vendorKey,
      displayVendor: lastTx.vendor,
      frequency: bestMatch.range.frequency,
      averageAmount: Math.round(avgAmount * 100) / 100,
      amountStdDev: Math.round(amountStdDev * 100) / 100,
      currency: lastTx.currency || 'INR',
      categoryId: lastTx.category,
      nextExpected,
      lastSeen: lastTx.date,
      transactionCount: txs.length,
      confidence,
      transactionIds: txs.map((tx) => tx.id),
      isActive,
      averageIntervalDays: Math.round(avgInterval * 10) / 10,
    };
  }
}

// ============================================
// Singleton Export
// ============================================

export const recurringDetector = new RecurringDetectorService();
