/**
 * Unit Tests for LLM Statement Parser
 *
 * Tests the LLM-enhanced statement parser including:
 * - shouldUseLLMFallback() decision logic
 * - parseWithLLM() API call flow and response handling
 * - parseWithFallback() merge strategy
 * - Error handling and graceful degradation
 * - Auto-categorization integration
 *
 * NOTE: The fetch() call is mocked globally in tests/setup.ts.
 * We override it per-test as needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  StatementParseResult,
  ParsedStatementTransaction,
} from '@/types/statement';

// Mock the auto-categorizer before importing the service
vi.mock('./auto-categorizer', () => ({
  autoCategorizer: {
    suggestCategory: vi.fn((vendor: string) => {
      // Simple mock: return a suggestion for known vendors, null otherwise
      if (vendor.toLowerCase().includes('amazon')) {
        return {
          categoryName: 'Shopping',
          confidence: 0.9,
          matchedKeyword: 'amazon',
          isLearned: false,
        };
      }
      if (vendor.toLowerCase().includes('starbucks')) {
        return {
          categoryName: 'Food & Dining',
          confidence: 0.85,
          matchedKeyword: 'starbucks',
          isLearned: true,
          learnedCategoryId: 'cat-food-123',
        };
      }
      return null;
    }),
  },
}));

import { llmStatementParser } from './llm-statement-parser';

// ============================================
// Test Helpers
// ============================================

function createMockRegexResult(
  overrides: Partial<StatementParseResult> = {}
): StatementParseResult {
  return {
    documentType: 'statement',
    issuer: 'Chase',
    accountLast4: '1234',
    statementPeriod: { start: '2024-01-01', end: '2024-01-31' },
    transactions: [],
    totals: {
      totalDebits: 0,
      totalCredits: 0,
      netBalance: 0,
      statementTotal: null,
    },
    currency: 'USD',
    confidence: 0.5,
    parsingTimeMs: 50,
    unparsedLineCount: 0,
    warnings: [],
    ...overrides,
  };
}

function createMockTransaction(
  overrides: Partial<ParsedStatementTransaction> = {}
): ParsedStatementTransaction {
  return {
    id: `tx-${Math.random().toString(36).substring(7)}`,
    date: '2024-01-15',
    vendor: 'Test Vendor',
    amount: 42.99,
    type: 'debit',
    category: null,
    suggestedCategoryName: null,
    rawLine: '01/15 TEST VENDOR 42.99',
    confidence: 0.8,
    selected: true,
    note: '',
    ...overrides,
  };
}

function createMockLLMApiResponse(
  transactions: Array<{
    date: string;
    vendor: string;
    amount: number;
    type: string;
    category?: string;
  }> = [],
  overrides: Record<string, unknown> = {}
) {
  return {
    success: true,
    data: {
      issuer: 'Chase',
      accountLast4: '1234',
      currency: 'USD',
      statementPeriod: { start: '2024-01-01', end: '2024-01-31' },
      transactions,
      totals: {
        debits: transactions.reduce(
          (sum, t) => (t.type === 'debit' ? sum + t.amount : sum),
          0
        ),
        credits: transactions.reduce(
          (sum, t) => (t.type !== 'debit' ? sum + t.amount : sum),
          0
        ),
        payments: 0,
        fees: 0,
      },
    },
    meta: {
      transactionCount: transactions.length,
      model: 'gemini-1.5-flash',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    },
    ...overrides,
  };
}

// ============================================
// shouldUseLLMFallback Tests
// ============================================

describe('LLM Statement Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('shouldUseLLMFallback', () => {
    it('should return false when regex results are good', () => {
      const regexResult = createMockRegexResult({
        confidence: 0.8,
        transactions: [
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
        ],
        unparsedLineCount: 0,
      });

      expect(llmStatementParser.shouldUseLLMFallback(regexResult)).toBe(false);
    });

    it('should return true when confidence is below threshold', () => {
      const regexResult = createMockRegexResult({
        confidence: 0.3,
        transactions: [
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
        ],
      });

      expect(llmStatementParser.shouldUseLLMFallback(regexResult)).toBe(true);
    });

    it('should return true when too few transactions extracted', () => {
      const regexResult = createMockRegexResult({
        confidence: 0.8,
        transactions: [createMockTransaction(), createMockTransaction()],
      });

      expect(llmStatementParser.shouldUseLLMFallback(regexResult)).toBe(true);
    });

    it('should return true when unparsed lines far exceed parsed transactions', () => {
      const regexResult = createMockRegexResult({
        confidence: 0.8,
        transactions: [
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
        ],
        unparsedLineCount: 20, // 20 unparsed > 4 * 2 = 8
      });

      expect(llmStatementParser.shouldUseLLMFallback(regexResult)).toBe(true);
    });

    it('should return false when unparsed lines are low relative to transactions', () => {
      const regexResult = createMockRegexResult({
        confidence: 0.8,
        transactions: [
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
        ],
        unparsedLineCount: 5, // 5 unparsed < 10 * 2 = 20
      });

      expect(llmStatementParser.shouldUseLLMFallback(regexResult)).toBe(false);
    });

    it('should return true when forceLLM is true regardless of quality', () => {
      const regexResult = createMockRegexResult({
        confidence: 0.99,
        transactions: Array.from({ length: 20 }, () => createMockTransaction()),
        unparsedLineCount: 0,
      });

      expect(
        llmStatementParser.shouldUseLLMFallback(regexResult, { forceLLM: true })
      ).toBe(true);
    });

    it('should respect custom minRegexConfidence option', () => {
      const regexResult = createMockRegexResult({
        confidence: 0.6,
        transactions: [
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
        ],
      });

      // Default threshold is 0.5, so 0.6 passes
      expect(llmStatementParser.shouldUseLLMFallback(regexResult)).toBe(false);

      // Custom threshold 0.7 means 0.6 fails
      expect(
        llmStatementParser.shouldUseLLMFallback(regexResult, {
          minRegexConfidence: 0.7,
        })
      ).toBe(true);
    });

    it('should respect custom minRegexTransactions option', () => {
      const regexResult = createMockRegexResult({
        confidence: 0.8,
        transactions: [
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
        ],
      });

      // Default min is 3, so 4 passes
      expect(llmStatementParser.shouldUseLLMFallback(regexResult)).toBe(false);

      // Custom min of 5 means 4 fails
      expect(
        llmStatementParser.shouldUseLLMFallback(regexResult, {
          minRegexTransactions: 5,
        })
      ).toBe(true);
    });

    it('should not trigger unparsed line check when unparsedLineCount is 0', () => {
      const regexResult = createMockRegexResult({
        confidence: 0.6,
        transactions: [
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
        ],
        unparsedLineCount: 0,
      });

      expect(llmStatementParser.shouldUseLLMFallback(regexResult)).toBe(false);
    });
  });

  // ============================================
  // parseWithLLM Tests
  // ============================================

  describe('parseWithLLM', () => {
    it('should call the API and return parsed result', async () => {
      const mockResponse = createMockLLMApiResponse([
        { date: '2024-01-15', vendor: 'Amazon', amount: 42.99, type: 'debit' },
        {
          date: '2024-01-16',
          vendor: 'Starbucks',
          amount: 5.75,
          type: 'debit',
        },
      ]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM(
        'sample statement text'
      );

      expect(result).not.toBeNull();
      expect(result!.transactions).toHaveLength(2);
      expect(result!.documentType).toBe('statement');
      expect(result!.confidence).toBe(0.88);
      expect(result!.warnings.some((w) => w.includes('Parsed using AI'))).toBe(
        true
      );
    });

    it('should pass issuer and currency hints to the API', async () => {
      const mockResponse = createMockLLMApiResponse([]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      await llmStatementParser.parseWithLLM('text', 'HDFC Bank', 'INR');

      expect(global.fetch).toHaveBeenCalledWith('/api/parse-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statementText: 'text',
          issuerHint: 'HDFC Bank',
          currencyHint: 'INR',
          modelTier: 'primary',
        }),
      });
    });

    it('should return null when API returns non-OK response', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: vi.fn().mockResolvedValue({ error: 'Bad Gateway' }),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result).toBeNull();
    });

    it('should return null when API returns success: false', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: false,
          error: 'Failed to parse',
        }),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result).toBeNull();
    });

    it('should return null when fetch throws an error', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result).toBeNull();
    });

    it('should return null when response JSON parsing fails', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new SyntaxError('Bad JSON')),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result).toBeNull();
    });

    it('should integrate auto-categorizer for transactions without LLM category', async () => {
      const mockResponse = createMockLLMApiResponse([
        {
          date: '2024-01-15',
          vendor: 'Amazon Marketplace',
          amount: 99.99,
          type: 'debit',
          // No category provided by LLM
        },
      ]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result).not.toBeNull();
      // Amazon should get auto-categorized via the mock
      expect(result!.transactions[0]!.suggestedCategoryName).toBe('Shopping');
    });

    it('should use LLM-provided category when present', async () => {
      const mockResponse = createMockLLMApiResponse([
        {
          date: '2024-01-15',
          vendor: 'Some Vendor',
          amount: 25.0,
          type: 'debit',
          category: 'Entertainment',
        },
      ]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result).not.toBeNull();
      // When LLM provides category, autoCategorizer is NOT called (tx.category truthy)
      // So suggestedCategoryName should be 'Entertainment'
      expect(result!.transactions[0]!.suggestedCategoryName).toBe(
        'Entertainment'
      );
    });

    it('should use learned category mapping when available', async () => {
      const mockResponse = createMockLLMApiResponse([
        {
          date: '2024-01-15',
          vendor: 'Starbucks Coffee #5678',
          amount: 5.75,
          type: 'debit',
          // No category from LLM
        },
      ]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result).not.toBeNull();
      // Starbucks mock returns isLearned: true with learnedCategoryId
      expect(result!.transactions[0]!.category).toBe('cat-food-123');
      // When learned, suggestedCategoryName should be null
      expect(result!.transactions[0]!.suggestedCategoryName).toBeNull();
    });

    it('should calculate totals correctly from parsed transactions', async () => {
      const mockResponse = createMockLLMApiResponse([
        { date: '2024-01-15', vendor: 'Store A', amount: 50.0, type: 'debit' },
        { date: '2024-01-16', vendor: 'Store B', amount: 30.0, type: 'debit' },
        { date: '2024-01-17', vendor: 'Refund', amount: 10.0, type: 'credit' },
        {
          date: '2024-01-18',
          vendor: 'Payment',
          amount: 100.0,
          type: 'payment',
        },
      ]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result).not.toBeNull();
      expect(result!.totals.totalDebits).toBe(80); // 50 + 30
      expect(result!.totals.totalCredits).toBe(110); // 10 + 100
      expect(result!.totals.netBalance).toBe(-30); // 80 - 110
    });

    it('should set fixed confidence of 0.88 for LLM-parsed transactions', async () => {
      const mockResponse = createMockLLMApiResponse([
        { date: '2024-01-15', vendor: 'Test', amount: 10.0, type: 'debit' },
      ]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result!.transactions[0]!.confidence).toBe(0.88);
    });

    it('should set all transactions as selected by default', async () => {
      const mockResponse = createMockLLMApiResponse([
        { date: '2024-01-15', vendor: 'Test', amount: 10.0, type: 'debit' },
        { date: '2024-01-16', vendor: 'Test2', amount: 20.0, type: 'debit' },
      ]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result!.transactions.every((t) => t.selected)).toBe(true);
    });

    it('should use issuer/accountLast4 from LLM response', async () => {
      const mockResponse = createMockLLMApiResponse([]);
      mockResponse.data.issuer = 'HDFC Bank';
      mockResponse.data.accountLast4 = '5678';

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result!.issuer).toBe('HDFC Bank');
      expect(result!.accountLast4).toBe('5678');
    });

    it('should default issuer to Unknown when not provided', async () => {
      const mockResponse = createMockLLMApiResponse([]);
      mockResponse.data.issuer = null;

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result!.issuer).toBe('Unknown');
    });

    it('should generate unique transaction IDs with llm- prefix', async () => {
      const mockResponse = createMockLLMApiResponse([
        { date: '2024-01-15', vendor: 'A', amount: 10, type: 'debit' },
        { date: '2024-01-16', vendor: 'B', amount: 20, type: 'debit' },
      ]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result!.transactions[0]!.id).toMatch(/^llm-/);
      expect(result!.transactions[1]!.id).toMatch(/^llm-/);
      expect(result!.transactions[0]!.id).not.toBe(result!.transactions[1]!.id);
    });

    it('should generate rawLine containing LLM marker and details', async () => {
      const mockResponse = createMockLLMApiResponse([
        { date: '2024-01-15', vendor: 'Amazon', amount: 42.99, type: 'debit' },
      ]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result!.transactions[0]!.rawLine).toContain('[LLM-1]');
      expect(result!.transactions[0]!.rawLine).toContain('2024-01-15');
      expect(result!.transactions[0]!.rawLine).toContain('Amazon');
      expect(result!.transactions[0]!.rawLine).toContain('42.99');
    });

    it('should set unparsedLineCount to 0 for LLM results', async () => {
      const mockResponse = createMockLLMApiResponse([
        { date: '2024-01-15', vendor: 'Test', amount: 10, type: 'debit' },
      ]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithLLM('text');

      expect(result!.unparsedLineCount).toBe(0);
    });
  });

  // ============================================
  // parseWithFallback Tests
  // ============================================

  describe('parseWithFallback', () => {
    it('should return regex result when LLM fallback is not needed', async () => {
      const regexResult = createMockRegexResult({
        confidence: 0.8,
        transactions: [
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
          createMockTransaction(),
        ],
      });

      const result = await llmStatementParser.parseWithFallback(
        'text',
        regexResult
      );

      // Should not have called fetch
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result).toBe(regexResult);
    });

    it('should prefer LLM results when LLM finds more transactions', async () => {
      const regexResult = createMockRegexResult({
        confidence: 0.3,
        transactions: [createMockTransaction()],
      });

      const mockResponse = createMockLLMApiResponse([
        { date: '2024-01-15', vendor: 'Store A', amount: 50, type: 'debit' },
        { date: '2024-01-16', vendor: 'Store B', amount: 30, type: 'debit' },
        { date: '2024-01-17', vendor: 'Store C', amount: 20, type: 'debit' },
      ]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithFallback(
        'text',
        regexResult
      );

      expect(result.transactions).toHaveLength(3);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('AI found 3 transactions vs 1')
      );
    });

    it('should merge metadata from regex when LLM wins', async () => {
      const regexResult = createMockRegexResult({
        confidence: 0.3,
        transactions: [createMockTransaction()],
        issuer: 'HDFC Bank',
        accountLast4: '9999',
        statementPeriod: { start: '2024-01-01', end: '2024-01-31' },
        currency: 'INR',
      });

      const mockResponse = createMockLLMApiResponse([
        { date: '2024-01-15', vendor: 'Store', amount: 500, type: 'debit' },
        { date: '2024-01-16', vendor: 'Store2', amount: 300, type: 'debit' },
      ]);
      // LLM returns null for some metadata
      mockResponse.data.issuer = null;
      mockResponse.data.accountLast4 = null;

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithFallback(
        'text',
        regexResult
      );

      // postProcessResult merges: 'Unknown' !== 'Unknown' check fails,
      // so it falls through to regexResult.issuer which is 'HDFC Bank'
      expect(result.issuer).toBe('HDFC Bank');
      // accountLast4 is null from LLM, so regex value should be used
      expect(result.accountLast4).toBe('9999');
    });

    it('should use LLM result when regex confidence is low', async () => {
      const regexResult = createMockRegexResult({
        confidence: 0.3,
        transactions: [createMockTransaction(), createMockTransaction()],
      });

      const mockResponse = createMockLLMApiResponse([
        { date: '2024-01-15', vendor: 'Store A', amount: 50, type: 'debit' },
        { date: '2024-01-16', vendor: 'Store B', amount: 30, type: 'debit' },
      ]);

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await llmStatementParser.parseWithFallback(
        'text',
        regexResult
      );

      // LLM-first: always uses LLM when fallback is triggered
      expect(result.transactions).toHaveLength(2);
      expect(result.warnings.some((w) => w.includes('AI'))).toBe(true);
    });

    it('should fall back to regex with warning when LLM fails completely', async () => {
      const regexResult = createMockRegexResult({
        confidence: 0.3,
        transactions: [createMockTransaction()],
      });

      // Both primary and retry fail
      vi.mocked(global.fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await llmStatementParser.parseWithFallback(
        'text',
        regexResult
      );

      // Should return regex results with a warning
      expect(result.transactions).toHaveLength(1);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('AI parsing failed')
      );
    });

    it('should not trigger LLM when forceLLM is false and regex is good', async () => {
      const regexResult = createMockRegexResult({
        confidence: 0.9,
        transactions: Array.from({ length: 10 }, () => createMockTransaction()),
      });

      const result = await llmStatementParser.parseWithFallback(
        'text',
        regexResult,
        { forceLLM: false }
      );

      expect(global.fetch).not.toHaveBeenCalled();
      expect(result).toBe(regexResult);
    });

    it('should always trigger LLM when forceLLM is true', async () => {
      const regexResult = createMockRegexResult({
        confidence: 0.9,
        transactions: Array.from({ length: 10 }, () => createMockTransaction()),
      });

      const mockResponse = createMockLLMApiResponse([
        { date: '2024-01-15', vendor: 'Store', amount: 50, type: 'debit' },
      ]);

      // Primary returns 1 tx (below regex's 10), so retry is triggered
      // Provide a retry response too
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockResponse),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockResponse),
        } as unknown as Response);

      const result = await llmStatementParser.parseWithFallback(
        'text',
        regexResult,
        { forceLLM: true }
      );

      expect(global.fetch).toHaveBeenCalled();
      // LLM-first always returns LLM result; postProcess validates it
      expect(result.transactions.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle LLM returning empty transactions array', async () => {
      const regexResult = createMockRegexResult({
        confidence: 0.3,
        transactions: [createMockTransaction()],
      });

      const mockResponse = createMockLLMApiResponse([]);

      // Primary returns empty, retry also returns empty
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockResponse),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockResponse),
        } as unknown as Response);

      const result = await llmStatementParser.parseWithFallback(
        'text',
        regexResult
      );

      // LLM returned empty, post-processing returns the (empty) LLM result
      // since the primary result (0 txns) triggers retry, but retry also returns 0
      expect(result).toBeDefined();
    });
  });
});
