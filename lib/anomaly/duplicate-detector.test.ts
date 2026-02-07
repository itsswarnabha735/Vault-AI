/**
 * Tests for Duplicate Detection
 *
 * Unit tests for the duplicate transaction detection system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  levenshteinDistance,
  stringSimilarity,
  normalizeVendor,
  vendorSimilarity,
  addDays,
  subtractDays,
  daysDifference,
  amountsMatch,
  calculateDuplicateConfidence,
  formatCurrency,
} from './utils';
import {
  duplicateDetector,
  findDuplicates,
  DEFAULT_DUPLICATE_CONFIG,
  type DuplicatePair,
} from './duplicate-detector';
import type {
  LocalTransaction,
  TransactionId,
  CategoryId,
} from '@/types/database';

// ============================================
// Test Utilities
// ============================================

function createMockTransaction(
  overrides: Partial<LocalTransaction> = {}
): LocalTransaction {
  return {
    id: `tx-${Math.random().toString(36).substring(7)}` as TransactionId,
    rawText: 'Test transaction',
    embedding: new Float32Array(384),
    filePath: '/test/path.pdf',
    fileSize: 1000,
    mimeType: 'application/pdf',
    date: '2024-01-15',
    amount: 50.0,
    vendor: 'Test Vendor',
    category: null as CategoryId | null,
    note: '',
    currency: 'USD',
    confidence: 0.95,
    isManuallyEdited: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    syncStatus: 'pending',
    lastSyncAttempt: null,
    syncError: null,
    ...overrides,
  };
}

// ============================================
// Levenshtein Distance Tests
// ============================================

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('should return correct distance for single character difference', () => {
    expect(levenshteinDistance('hello', 'hallo')).toBe(1);
    expect(levenshteinDistance('cat', 'hat')).toBe(1);
  });

  it('should handle empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', 'abc')).toBe(3);
  });

  it('should return correct distance for completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });

  it('should handle insertion and deletion', () => {
    expect(levenshteinDistance('hello', 'helloo')).toBe(1);
    expect(levenshteinDistance('hello', 'helo')).toBe(1);
  });
});

// ============================================
// String Similarity Tests
// ============================================

describe('stringSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(stringSimilarity('amazon', 'amazon')).toBe(1);
  });

  it('should return 0 for completely different strings', () => {
    expect(stringSimilarity('abc', 'xyz')).toBe(0);
  });

  it('should return high similarity for similar strings', () => {
    const similarity = stringSimilarity('amazon', 'amazn');
    expect(similarity).toBeGreaterThan(0.8);
  });

  it('should handle empty strings', () => {
    expect(stringSimilarity('', '')).toBe(1);
    expect(stringSimilarity('abc', '')).toBe(0);
  });
});

// ============================================
// Vendor Normalization Tests
// ============================================

describe('normalizeVendor', () => {
  it('should lowercase vendor names', () => {
    expect(normalizeVendor('AMAZON')).toBe('amazon');
    expect(normalizeVendor('Starbucks')).toBe('starbucks');
  });

  it('should remove common suffixes', () => {
    expect(normalizeVendor('Amazon Inc')).toBe('amazon');
    expect(normalizeVendor('Starbucks LLC')).toBe('starbucks');
    expect(normalizeVendor('Apple Corp.')).toBe('apple');
  });

  it('should normalize special characters', () => {
    expect(normalizeVendor('AT&T')).toBe('atandt');
  });

  it('should trim whitespace', () => {
    expect(normalizeVendor('  Amazon  ')).toBe('amazon');
  });

  it('should handle empty strings', () => {
    expect(normalizeVendor('')).toBe('');
  });
});

// ============================================
// Vendor Similarity Tests
// ============================================

describe('vendorSimilarity', () => {
  it('should return 1 for identical vendors after normalization', () => {
    expect(vendorSimilarity('Amazon', 'amazon')).toBe(1);
    expect(vendorSimilarity('STARBUCKS', 'starbucks')).toBe(1);
  });

  it('should return 1 for vendors that differ only by suffix', () => {
    expect(vendorSimilarity('Amazon Inc', 'Amazon')).toBe(1);
  });

  it('should return high similarity for typos', () => {
    const similarity = vendorSimilarity('Starbucks', 'Starbuck');
    expect(similarity).toBeGreaterThan(0.85);
  });
});

// ============================================
// Date Arithmetic Tests
// ============================================

describe('addDays', () => {
  it('should add days correctly', () => {
    expect(addDays('2024-01-15', 1)).toBe('2024-01-16');
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
  });

  it('should handle negative days (subtraction)', () => {
    expect(addDays('2024-01-15', -1)).toBe('2024-01-14');
  });

  it('should handle year boundaries', () => {
    expect(addDays('2023-12-31', 1)).toBe('2024-01-01');
  });
});

describe('subtractDays', () => {
  it('should subtract days correctly', () => {
    expect(subtractDays('2024-01-15', 1)).toBe('2024-01-14');
    expect(subtractDays('2024-02-01', 1)).toBe('2024-01-31');
  });

  it('should handle year boundaries', () => {
    expect(subtractDays('2024-01-01', 1)).toBe('2023-12-31');
  });
});

describe('daysDifference', () => {
  it('should return 0 for same day', () => {
    expect(daysDifference('2024-01-15', '2024-01-15')).toBe(0);
  });

  it('should return correct difference', () => {
    expect(daysDifference('2024-01-15', '2024-01-16')).toBe(1);
    expect(daysDifference('2024-01-15', '2024-01-20')).toBe(5);
  });

  it('should return absolute difference', () => {
    expect(daysDifference('2024-01-20', '2024-01-15')).toBe(5);
  });
});

// ============================================
// Amount Matching Tests
// ============================================

describe('amountsMatch', () => {
  it('should match exact amounts with 0 tolerance', () => {
    expect(amountsMatch(100, 100, 0)).toBe(true);
    expect(amountsMatch(100, 100.01, 0)).toBe(false);
  });

  it('should match amounts within tolerance', () => {
    expect(amountsMatch(100, 101, 1)).toBe(true);
    expect(amountsMatch(100, 102, 1)).toBe(false);
  });

  it('should handle decimal amounts', () => {
    // Difference is 0.01, tolerance is 0.02, should match
    expect(amountsMatch(99.99, 100, 0.02)).toBe(true);
    // Difference is 0.01, tolerance is 0.005, should not match
    expect(amountsMatch(99.99, 100, 0.005)).toBe(false);
  });
});

// ============================================
// Confidence Score Tests
// ============================================

describe('calculateDuplicateConfidence', () => {
  it('should return high confidence for perfect match', () => {
    const confidence = calculateDuplicateConfidence(1.0, true, 0, 1);
    expect(confidence).toBeGreaterThan(0.9);
  });

  it('should return lower confidence for partial matches', () => {
    const highMatch = calculateDuplicateConfidence(0.9, true, 0, 1);
    const lowMatch = calculateDuplicateConfidence(0.7, true, 1, 1);
    expect(highMatch).toBeGreaterThan(lowMatch);
  });

  it('should factor in date proximity', () => {
    const sameDay = calculateDuplicateConfidence(0.9, true, 0, 3);
    const threeDaysApart = calculateDuplicateConfidence(0.9, true, 3, 3);
    expect(sameDay).toBeGreaterThan(threeDaysApart);
  });
});

// ============================================
// Currency Formatting Tests
// ============================================

describe('formatCurrency', () => {
  it('should format USD correctly', () => {
    expect(formatCurrency(100, 'USD', 'en-US')).toBe('$100.00');
    expect(formatCurrency(1234.56, 'USD', 'en-US')).toBe('$1,234.56');
  });

  it('should handle negative amounts', () => {
    expect(formatCurrency(-50, 'USD', 'en-US')).toBe('-$50.00');
  });
});

// ============================================
// Duplicate Detection Integration Tests
// ============================================

describe('findDuplicates', () => {
  beforeEach(() => {
    // Reset detector to default config
    duplicateDetector.configureSensitivity(DEFAULT_DUPLICATE_CONFIG);
  });

  it('should find exact duplicates', () => {
    const tx1 = createMockTransaction({
      id: 'tx-1' as TransactionId,
      date: '2024-01-15',
      amount: 50.0,
      vendor: 'Starbucks',
    });

    const tx2 = createMockTransaction({
      id: 'tx-2' as TransactionId,
      date: '2024-01-15',
      amount: 50.0,
      vendor: 'Starbucks',
    });

    const pairs = findDuplicates([tx1, tx2]);
    expect(pairs.length).toBe(1);
    expect(pairs[0]?.confidence).toBeGreaterThan(0.8);
  });

  it('should find duplicates with slight vendor variation', () => {
    // Test with vendors that differ by case or common suffix
    const tx1 = createMockTransaction({
      id: 'tx-1' as TransactionId,
      date: '2024-01-15',
      amount: 50.0,
      vendor: 'STARBUCKS',
    });

    const tx2 = createMockTransaction({
      id: 'tx-2' as TransactionId,
      date: '2024-01-15',
      amount: 50.0,
      vendor: 'Starbucks Inc',
    });

    const pairs = findDuplicates([tx1, tx2]);
    // After normalization: "starbucks" vs "starbucks" (inc is removed)
    expect(pairs.length).toBe(1);
  });

  it('should find duplicates within date tolerance', () => {
    const tx1 = createMockTransaction({
      id: 'tx-1' as TransactionId,
      date: '2024-01-15',
      amount: 50.0,
      vendor: 'Amazon',
    });

    const tx2 = createMockTransaction({
      id: 'tx-2' as TransactionId,
      date: '2024-01-16', // Next day
      amount: 50.0,
      vendor: 'Amazon',
    });

    const pairs = findDuplicates([tx1, tx2]);
    expect(pairs.length).toBe(1);
  });

  it('should not flag transactions outside date tolerance', () => {
    const tx1 = createMockTransaction({
      id: 'tx-1' as TransactionId,
      date: '2024-01-15',
      amount: 50.0,
      vendor: 'Amazon',
    });

    const tx2 = createMockTransaction({
      id: 'tx-2' as TransactionId,
      date: '2024-01-20', // 5 days later
      amount: 50.0,
      vendor: 'Amazon',
    });

    const pairs = findDuplicates([tx1, tx2]);
    expect(pairs.length).toBe(0);
  });

  it('should not flag different amounts', () => {
    const tx1 = createMockTransaction({
      id: 'tx-1' as TransactionId,
      date: '2024-01-15',
      amount: 50.0,
      vendor: 'Amazon',
    });

    const tx2 = createMockTransaction({
      id: 'tx-2' as TransactionId,
      date: '2024-01-15',
      amount: 75.0, // Different amount
      vendor: 'Amazon',
    });

    const pairs = findDuplicates([tx1, tx2]);
    expect(pairs.length).toBe(0);
  });

  it('should not flag different vendors', () => {
    const tx1 = createMockTransaction({
      id: 'tx-1' as TransactionId,
      date: '2024-01-15',
      amount: 50.0,
      vendor: 'Amazon',
    });

    const tx2 = createMockTransaction({
      id: 'tx-2' as TransactionId,
      date: '2024-01-15',
      amount: 50.0,
      vendor: 'Walmart', // Different vendor
    });

    const pairs = findDuplicates([tx1, tx2]);
    expect(pairs.length).toBe(0);
  });

  it('should handle empty array', () => {
    const pairs = findDuplicates([]);
    expect(pairs.length).toBe(0);
  });

  it('should handle single transaction', () => {
    const tx = createMockTransaction();
    const pairs = findDuplicates([tx]);
    expect(pairs.length).toBe(0);
  });

  it('should find multiple duplicate pairs', () => {
    const transactions = [
      createMockTransaction({
        id: 'tx-1' as TransactionId,
        date: '2024-01-15',
        amount: 50.0,
        vendor: 'Starbucks',
      }),
      createMockTransaction({
        id: 'tx-2' as TransactionId,
        date: '2024-01-15',
        amount: 50.0,
        vendor: 'Starbucks',
      }),
      createMockTransaction({
        id: 'tx-3' as TransactionId,
        date: '2024-01-20',
        amount: 100.0,
        vendor: 'Amazon',
      }),
      createMockTransaction({
        id: 'tx-4' as TransactionId,
        date: '2024-01-20',
        amount: 100.0,
        vendor: 'Amazon',
      }),
    ];

    const pairs = findDuplicates(transactions);
    expect(pairs.length).toBe(2);
  });
});

// ============================================
// Configuration Tests
// ============================================

describe('DuplicateDetector Configuration', () => {
  beforeEach(() => {
    duplicateDetector.configureSensitivity(DEFAULT_DUPLICATE_CONFIG);
  });

  it('should allow configuring amount tolerance', () => {
    duplicateDetector.configureSensitivity({ amountTolerance: 1 });

    const tx1 = createMockTransaction({
      id: 'tx-1' as TransactionId,
      amount: 50.0,
      vendor: 'Amazon',
    });

    const tx2 = createMockTransaction({
      id: 'tx-2' as TransactionId,
      amount: 50.5, // Within $1 tolerance
      vendor: 'Amazon',
    });

    const pairs = findDuplicates([tx1, tx2]);
    expect(pairs.length).toBe(1);
  });

  it('should allow configuring days tolerance', () => {
    duplicateDetector.configureSensitivity({ daysTolerance: 7 });

    const tx1 = createMockTransaction({
      id: 'tx-1' as TransactionId,
      date: '2024-01-15',
      amount: 50.0,
      vendor: 'Amazon',
    });

    const tx2 = createMockTransaction({
      id: 'tx-2' as TransactionId,
      date: '2024-01-20', // 5 days later, within tolerance
      amount: 50.0,
      vendor: 'Amazon',
    });

    const pairs = findDuplicates([tx1, tx2]);
    expect(pairs.length).toBe(1);
  });

  it('should return current configuration', () => {
    duplicateDetector.configureSensitivity({
      amountTolerance: 5,
      daysTolerance: 3,
    });

    const config = duplicateDetector.getConfig();
    expect(config.amountTolerance).toBe(5);
    expect(config.daysTolerance).toBe(3);
  });
});
