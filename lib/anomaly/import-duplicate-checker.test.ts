/**
 * Unit Tests for Import Duplicate Checker
 *
 * Tests the pre-import duplicate detection system including:
 * - Single transaction duplicate checking against existing DB
 * - Batch statement transaction checking
 * - Statement fingerprint generation and matching
 * - Configurable thresholds
 * - Edge cases and error handling
 *
 * PRIVACY: All duplicate detection runs locally in the browser.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  LocalTransaction,
  TransactionId,
  CategoryId,
} from '@/types/database';
import type {
  ParsedStatementTransaction,
  StatementParseResult,
} from '@/types/statement';

// ============================================
// Mock Database
// ============================================

const mockTransactionsData: LocalTransaction[] = [];
const mockFingerprintsData: Array<{
  id: string;
  issuer: string;
  accountLast4: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  totalDebits: number;
  transactionCount: number;
  importedAt: Date;
  fileName: string;
}> = [];

vi.mock('@/lib/storage/db', () => ({
  db: {
    transactions: {
      where: vi.fn().mockReturnValue({
        between: vi.fn().mockReturnValue({
          toArray: vi.fn(() => Promise.resolve([...mockTransactionsData])),
        }),
      }),
    },
    statementFingerprints: {
      toArray: vi.fn(() => Promise.resolve([...mockFingerprintsData])),
      add: vi.fn(() => Promise.resolve()),
    },
  },
}));

import { importDuplicateChecker } from './import-duplicate-checker';
import { db } from '@/lib/storage/db';

// ============================================
// Test Helpers
// ============================================

function createMockLocalTransaction(
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

function createMockParsedTransaction(
  overrides: Partial<ParsedStatementTransaction> = {}
): ParsedStatementTransaction {
  return {
    id: `parsed-${Math.random().toString(36).substring(7)}`,
    date: '2024-01-15',
    vendor: 'Test Vendor',
    amount: 50.0,
    type: 'debit',
    category: null,
    suggestedCategoryName: null,
    rawLine: '01/15 Test Vendor 50.00',
    confidence: 0.8,
    selected: true,
    note: '',
    ...overrides,
  };
}

function createMockStatementResult(
  overrides: Partial<StatementParseResult> = {}
): StatementParseResult {
  return {
    documentType: 'statement',
    issuer: 'Chase',
    accountLast4: '1234',
    statementPeriod: { start: '2024-01-01', end: '2024-01-31' },
    transactions: [],
    totals: {
      totalDebits: 500,
      totalCredits: 100,
      netBalance: 400,
      statementTotal: null,
    },
    currency: 'USD',
    confidence: 0.8,
    parsingTimeMs: 50,
    unparsedLineCount: 0,
    warnings: [],
    ...overrides,
  };
}

// ============================================
// Tests
// ============================================

describe('Import Duplicate Checker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionsData.length = 0;
    mockFingerprintsData.length = 0;
  });

  // ============================================
  // checkTransaction Tests
  // ============================================

  describe('checkTransaction', () => {
    it('should return no duplicate when DB is empty', async () => {
      const result = await importDuplicateChecker.checkTransaction(
        '2024-01-15',
        'Starbucks',
        5.75
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.matchingTransactionId).toBeNull();
    });

    it('should detect an exact duplicate', async () => {
      mockTransactionsData.push(
        createMockLocalTransaction({
          date: '2024-01-15',
          vendor: 'Starbucks Coffee',
          amount: 5.75,
        })
      );

      const result = await importDuplicateChecker.checkTransaction(
        '2024-01-15',
        'Starbucks Coffee',
        5.75
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.75);
      expect(result.matchingTransactionId).not.toBeNull();
    });

    it('should detect a duplicate with slightly different date', async () => {
      mockTransactionsData.push(
        createMockLocalTransaction({
          date: '2024-01-16', // 1 day off
          vendor: 'Starbucks Coffee',
          amount: 5.75,
        })
      );

      const result = await importDuplicateChecker.checkTransaction(
        '2024-01-15',
        'Starbucks Coffee',
        5.75
      );

      expect(result.isDuplicate).toBe(true);
    });

    it('should NOT flag non-matching amounts as duplicates', async () => {
      mockTransactionsData.push(
        createMockLocalTransaction({
          date: '2024-01-15',
          vendor: 'Starbucks Coffee',
          amount: 10.5, // Different amount
        })
      );

      const result = await importDuplicateChecker.checkTransaction(
        '2024-01-15',
        'Starbucks Coffee',
        5.75
      );

      expect(result.isDuplicate).toBe(false);
    });

    it('should NOT flag different vendors as duplicates', async () => {
      mockTransactionsData.push(
        createMockLocalTransaction({
          date: '2024-01-15',
          vendor: 'Walmart Supercenter',
          amount: 5.75,
        })
      );

      const result = await importDuplicateChecker.checkTransaction(
        '2024-01-15',
        'Starbucks Coffee',
        5.75
      );

      expect(result.isDuplicate).toBe(false);
    });

    it('should return best match when multiple candidates exist', async () => {
      mockTransactionsData.push(
        createMockLocalTransaction({
          date: '2024-01-15',
          vendor: 'Starbucks Coffee Shop',
          amount: 5.75,
        }),
        createMockLocalTransaction({
          date: '2024-01-15',
          vendor: 'Starbucks Coffee',
          amount: 5.75,
        })
      );

      const result = await importDuplicateChecker.checkTransaction(
        '2024-01-15',
        'Starbucks Coffee',
        5.75
      );

      expect(result.isDuplicate).toBe(true);
      // Should pick the better match (exact match)
      expect(result.confidence).toBeGreaterThan(0.75);
    });

    it('should return non-duplicate for empty/zero input', async () => {
      const result1 = await importDuplicateChecker.checkTransaction(
        '',
        'Vendor',
        50
      );
      expect(result1.isDuplicate).toBe(false);

      const result2 = await importDuplicateChecker.checkTransaction(
        '2024-01-15',
        '',
        50
      );
      expect(result2.isDuplicate).toBe(false);

      const result3 = await importDuplicateChecker.checkTransaction(
        '2024-01-15',
        'Vendor',
        0
      );
      expect(result3.isDuplicate).toBe(false);
    });

    it('should include match details when duplicate is found', async () => {
      mockTransactionsData.push(
        createMockLocalTransaction({
          date: '2024-01-15',
          vendor: 'Amazon.com',
          amount: 42.99,
        })
      );

      const result = await importDuplicateChecker.checkTransaction(
        '2024-01-15',
        'Amazon.com',
        42.99
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.matchDetails).toBeDefined();
      expect(result.matchDetails!.existingVendor).toBe('Amazon.com');
      expect(result.matchDetails!.existingAmount).toBe(42.99);
      expect(result.matchDetails!.existingDate).toBe('2024-01-15');
    });

    it('should include reason string for duplicates', async () => {
      mockTransactionsData.push(
        createMockLocalTransaction({
          date: '2024-01-15',
          vendor: 'Amazon.com',
          amount: 42.99,
        })
      );

      const result = await importDuplicateChecker.checkTransaction(
        '2024-01-15',
        'Amazon.com',
        42.99
      );

      expect(result.reason).toContain('Matches existing');
      expect(result.reason).toContain('Amazon.com');
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(db.transactions.where).mockReturnValueOnce({
        between: vi.fn().mockReturnValue({
          toArray: vi.fn().mockRejectedValue(new Error('DB error')),
        }),
      } as unknown as ReturnType<typeof db.transactions.where>);

      const result = await importDuplicateChecker.checkTransaction(
        '2024-01-15',
        'Vendor',
        50
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should allow 1 cent tolerance for amount matching', async () => {
      mockTransactionsData.push(
        createMockLocalTransaction({
          date: '2024-01-15',
          vendor: 'Store',
          amount: 50.0,
        })
      );

      const result = await importDuplicateChecker.checkTransaction(
        '2024-01-15',
        'Store',
        50.01 // 1 cent off
      );

      expect(result.isDuplicate).toBe(true);
    });
  });

  // ============================================
  // checkReceipt Tests
  // ============================================

  describe('checkReceipt', () => {
    it('should delegate to checkTransaction', async () => {
      mockTransactionsData.push(
        createMockLocalTransaction({
          date: '2024-01-15',
          vendor: 'Receipt Vendor',
          amount: 25.99,
        })
      );

      const result = await importDuplicateChecker.checkReceipt(
        '2024-01-15',
        'Receipt Vendor',
        25.99
      );

      expect(result.isDuplicate).toBe(true);
    });
  });

  // ============================================
  // checkStatementTransactions Tests
  // ============================================

  describe('checkStatementTransactions', () => {
    it('should check all transactions in a batch', async () => {
      mockTransactionsData.push(
        createMockLocalTransaction({
          date: '2024-01-15',
          vendor: 'Existing Store',
          amount: 50.0,
        })
      );

      const transactions = [
        createMockParsedTransaction({
          id: 'tx-1',
          date: '2024-01-15',
          vendor: 'Existing Store',
          amount: 50.0,
        }),
        createMockParsedTransaction({
          id: 'tx-2',
          date: '2024-01-20',
          vendor: 'New Store',
          amount: 30.0,
        }),
      ];

      const result =
        await importDuplicateChecker.checkStatementTransactions(transactions);

      expect(result.totalChecked).toBe(2);
      expect(result.duplicateCount).toBe(1);
      expect(result.transactionResults.get('tx-1')?.isDuplicate).toBe(true);
      expect(result.transactionResults.get('tx-2')?.isDuplicate).toBe(false);
    });

    it('should return checkTimeMs', async () => {
      const result = await importDuplicateChecker.checkStatementTransactions(
        []
      );

      expect(result.checkTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty transaction array', async () => {
      const result = await importDuplicateChecker.checkStatementTransactions(
        []
      );

      expect(result.totalChecked).toBe(0);
      expect(result.duplicateCount).toBe(0);
      expect(result.transactionResults.size).toBe(0);
    });

    it('should detect multiple duplicates', async () => {
      mockTransactionsData.push(
        createMockLocalTransaction({
          date: '2024-01-15',
          vendor: 'Store A',
          amount: 50.0,
        }),
        createMockLocalTransaction({
          date: '2024-01-16',
          vendor: 'Store B',
          amount: 30.0,
        })
      );

      const transactions = [
        createMockParsedTransaction({
          id: 'tx-1',
          date: '2024-01-15',
          vendor: 'Store A',
          amount: 50.0,
        }),
        createMockParsedTransaction({
          id: 'tx-2',
          date: '2024-01-16',
          vendor: 'Store B',
          amount: 30.0,
        }),
        createMockParsedTransaction({
          id: 'tx-3',
          date: '2024-01-20',
          vendor: 'Store C',
          amount: 20.0,
        }),
      ];

      const result =
        await importDuplicateChecker.checkStatementTransactions(transactions);

      expect(result.duplicateCount).toBe(2);
    });
  });

  // ============================================
  // generateFingerprint Tests
  // ============================================

  describe('generateFingerprint', () => {
    it('should generate a fingerprint from a statement result', () => {
      const statementResult = createMockStatementResult({
        issuer: 'Chase',
        accountLast4: '1234',
        statementPeriod: { start: '2024-01-01', end: '2024-01-31' },
        transactions: [
          createMockParsedTransaction(),
          createMockParsedTransaction(),
          createMockParsedTransaction(),
        ],
        totals: {
          totalDebits: 500,
          totalCredits: 100,
          netBalance: 400,
          statementTotal: null,
        },
      });

      const fingerprint = importDuplicateChecker.generateFingerprint(
        statementResult,
        'statement.pdf'
      );

      expect(fingerprint.id).toMatch(/^fp-/);
      expect(fingerprint.issuer).toBe('chase');
      expect(fingerprint.accountLast4).toBe('1234');
      expect(fingerprint.periodStart).toBe('2024-01-01');
      expect(fingerprint.periodEnd).toBe('2024-01-31');
      expect(fingerprint.totalDebits).toBe(500);
      expect(fingerprint.transactionCount).toBe(3);
      expect(fingerprint.fileName).toBe('statement.pdf');
      expect(fingerprint.importedAt).toBeInstanceOf(Date);
    });

    it('should handle missing issuer', () => {
      const statementResult = createMockStatementResult({
        issuer: '',
      });

      const fingerprint = importDuplicateChecker.generateFingerprint(
        statementResult,
        'test.pdf'
      );

      // Empty string is falsy, so `(result.issuer || 'unknown')` gives 'unknown'
      expect(fingerprint.issuer).toBe('unknown');
    });

    it('should normalize issuer name', () => {
      const statementResult = createMockStatementResult({
        issuer: '  Chase Bank  ',
      });

      const fingerprint = importDuplicateChecker.generateFingerprint(
        statementResult,
        'test.pdf'
      );

      expect(fingerprint.issuer).toBe('chase bank');
    });
  });

  // ============================================
  // checkStatementFingerprint Tests
  // ============================================

  describe('checkStatementFingerprint', () => {
    it('should return not imported when no fingerprints exist', async () => {
      const statementResult = createMockStatementResult();

      const result =
        await importDuplicateChecker.checkStatementFingerprint(statementResult);

      expect(result.isAlreadyImported).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should detect a previously imported statement', async () => {
      mockFingerprintsData.push({
        id: 'fp-1',
        issuer: 'chase',
        accountLast4: '1234',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        totalDebits: 500,
        transactionCount: 10,
        importedAt: new Date('2024-02-01'),
        fileName: 'january-statement.pdf',
      });

      const statementResult = createMockStatementResult({
        issuer: 'Chase',
        accountLast4: '1234',
        statementPeriod: { start: '2024-01-01', end: '2024-01-31' },
        transactions: Array.from({ length: 10 }, () =>
          createMockParsedTransaction()
        ),
        totals: {
          totalDebits: 500,
          totalCredits: 100,
          netBalance: 400,
          statementTotal: null,
        },
      });

      const result =
        await importDuplicateChecker.checkStatementFingerprint(statementResult);

      expect(result.isAlreadyImported).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.previousImport).toBeDefined();
      expect(result.previousImport!.fileName).toBe('january-statement.pdf');
      expect(result.previousImport!.transactionCount).toBe(10);
    });

    it('should not flag different statement periods', async () => {
      mockFingerprintsData.push({
        id: 'fp-1',
        issuer: 'chase',
        accountLast4: '1234',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        totalDebits: 500,
        transactionCount: 10,
        importedAt: new Date('2024-02-01'),
        fileName: 'january-statement.pdf',
      });

      const statementResult = createMockStatementResult({
        issuer: 'Chase',
        accountLast4: '1234',
        statementPeriod: { start: '2024-02-01', end: '2024-02-28' }, // Different period
        transactions: Array.from({ length: 10 }, () =>
          createMockParsedTransaction()
        ),
        totals: {
          totalDebits: 600, // Different total
          totalCredits: 100,
          netBalance: 500,
          statementTotal: null,
        },
      });

      const result =
        await importDuplicateChecker.checkStatementFingerprint(statementResult);

      // Should not be flagged - different period and totals
      expect(result.isAlreadyImported).toBe(false);
    });

    it('should match by issuer and totals even without account number', async () => {
      mockFingerprintsData.push({
        id: 'fp-1',
        issuer: 'hdfc bank',
        accountLast4: null,
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        totalDebits: 50000,
        transactionCount: 15,
        importedAt: new Date(),
        fileName: 'hdfc-jan.pdf',
      });

      const statementResult = createMockStatementResult({
        issuer: 'HDFC Bank',
        accountLast4: null,
        statementPeriod: { start: '2024-01-01', end: '2024-01-31' },
        transactions: Array.from({ length: 15 }, () =>
          createMockParsedTransaction()
        ),
        totals: {
          totalDebits: 50000,
          totalCredits: 10000,
          netBalance: 40000,
          statementTotal: null,
        },
      });

      const result =
        await importDuplicateChecker.checkStatementFingerprint(statementResult);

      expect(result.isAlreadyImported).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(db.statementFingerprints.toArray).mockRejectedValueOnce(
        new Error('DB error')
      );

      const statementResult = createMockStatementResult();

      const result =
        await importDuplicateChecker.checkStatementFingerprint(statementResult);

      expect(result.isAlreadyImported).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should allow 1% tolerance on total debits', async () => {
      mockFingerprintsData.push({
        id: 'fp-1',
        issuer: 'chase',
        accountLast4: '1234',
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        totalDebits: 1000,
        transactionCount: 10,
        importedAt: new Date(),
        fileName: 'statement.pdf',
      });

      const statementResult = createMockStatementResult({
        issuer: 'Chase',
        accountLast4: '1234',
        statementPeriod: { start: '2024-01-01', end: '2024-01-31' },
        transactions: Array.from({ length: 10 }, () =>
          createMockParsedTransaction()
        ),
        totals: {
          totalDebits: 1005, // 0.5% off - within 1% tolerance
          totalCredits: 100,
          netBalance: 905,
          statementTotal: null,
        },
      });

      const result =
        await importDuplicateChecker.checkStatementFingerprint(statementResult);

      expect(result.isAlreadyImported).toBe(true);
    });
  });

  // ============================================
  // saveFingerprint Tests
  // ============================================

  describe('saveFingerprint', () => {
    it('should save a fingerprint to the database', async () => {
      const statementResult = createMockStatementResult();
      const fingerprint = importDuplicateChecker.generateFingerprint(
        statementResult,
        'test.pdf'
      );

      await importDuplicateChecker.saveFingerprint(fingerprint);

      expect(db.statementFingerprints.add).toHaveBeenCalledWith(fingerprint);
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(db.statementFingerprints.add).mockRejectedValueOnce(
        new Error('DB error')
      );

      const statementResult = createMockStatementResult();
      const fingerprint = importDuplicateChecker.generateFingerprint(
        statementResult,
        'test.pdf'
      );

      await expect(
        importDuplicateChecker.saveFingerprint(fingerprint)
      ).resolves.not.toThrow();
    });
  });

  // ============================================
  // configure Tests
  // ============================================

  describe('configure', () => {
    it('should allow updating configuration', () => {
      // Should not throw
      importDuplicateChecker.configure({
        daysTolerance: 3,
        amountTolerance: 0.05,
      });
    });

    it('should merge with existing configuration', () => {
      importDuplicateChecker.configure({
        daysTolerance: 5,
      });

      // Reset to defaults for other tests
      importDuplicateChecker.configure({
        daysTolerance: 1,
        amountTolerance: 0.01,
        vendorMatchThreshold: 0.85,
        confidenceThreshold: 0.75,
      });
    });
  });
});
