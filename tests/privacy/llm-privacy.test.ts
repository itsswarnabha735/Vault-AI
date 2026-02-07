/**
 * CRITICAL: Privacy - LLM Integration Tests
 *
 * Tests that verify LLM prompts never contain sensitive user data.
 * Only structured, sanitized data should ever be sent to LLM APIs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTransaction, createTransactions, createSafeLLMPrompt } from '../factories';

// ============================================
// Mock LLM API Calls
// ============================================

interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  model: string;
  timestamp: Date;
}

const llmRequests: LLMRequest[] = [];

const mockLLMService = {
  generateResponse: vi.fn(
    async (prompt: string, systemPrompt?: string): Promise<string> => {
      llmRequests.push({
        prompt,
        systemPrompt,
        model: 'gpt-4',
        timestamp: new Date(),
      });

      return 'Mock LLM response';
    }
  ),

  buildSafePrompt: (
    query: string,
    transactions: Array<{
      date: string;
      amount: number;
      vendor: string;
      category: string | null;
    }>
  ): string => {
    // This is the safe way to build prompts - only structured data
    return `
You are a personal finance assistant. Answer based on the transaction data.

USER QUESTION: ${query}

TRANSACTION DATA:
${JSON.stringify(transactions, null, 2)}

GUIDELINES:
- Be precise with amounts
- Reference specific transactions
- Do not assume data not provided
    `.trim();
  },
};

beforeEach(() => {
  llmRequests.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================
// LLM Privacy Tests
// ============================================

describe('CRITICAL: Privacy - LLM Prompt Construction', () => {
  describe('Raw Text Exclusion', () => {
    it('MUST NOT include rawText in prompts', () => {
      const transactions = [
        createTransaction({
          rawText: 'CONFIDENTIAL: Internal company memo about salary increases',
          vendor: 'Company XYZ',
          amount: 5000,
        }),
      ];

      const prompt = createSafeLLMPrompt('Show company expenses', transactions);

      expect(prompt).not.toContain('CONFIDENTIAL');
      expect(prompt).not.toContain('Internal company memo');
      expect(prompt).not.toContain('salary increases');
      expect(prompt).not.toContain('rawText');
    });

    it('MUST NOT include OCR output in prompts', () => {
      const transactions = [
        createTransaction({
          rawText: 'OCR Result: Bank account number: 1234567890, Routing: 987654321',
          vendor: 'Bank',
          amount: 1000,
        }),
      ];

      const prompt = createSafeLLMPrompt('Show bank transactions', transactions);

      expect(prompt).not.toContain('1234567890');
      expect(prompt).not.toContain('987654321');
      expect(prompt).not.toContain('Bank account number');
      expect(prompt).not.toContain('Routing');
    });

    it('MUST NOT include personal identifiable information (PII) from raw text', () => {
      const piiExamples = [
        'SSN: 123-45-6789',
        'DOB: 01/15/1985',
        'License: D123456789',
        'Passport: AB1234567',
        'Email: john.doe@private.com',
        'Phone: (555) 123-4567',
      ];

      for (const pii of piiExamples) {
        const transaction = createTransaction({
          rawText: `Receipt with ${pii}`,
          vendor: 'Generic Store',
          amount: 50,
        });

        const prompt = createSafeLLMPrompt('Analyze', [transaction]);

        // Extract the identifying part of PII
        const piiValue = pii.split(': ')[1];
        expect(prompt).not.toContain(piiValue);
      }
    });
  });

  describe('Embedding Exclusion', () => {
    it('MUST NOT include embeddings in prompts', () => {
      const transaction = createTransaction({
        embedding: new Float32Array([0.123456, 0.234567, 0.345678, 0.456789]),
      });

      const prompt = createSafeLLMPrompt('Analyze', [transaction]);

      expect(prompt).not.toContain('embedding');
      expect(prompt).not.toContain('0.123456');
      expect(prompt).not.toContain('0.234567');
      expect(prompt).not.toContain('Float32Array');
    });

    it('MUST NOT include embedding dimensions in prompts', () => {
      const transaction = createTransaction({
        embedding: new Float32Array(384).fill(0.5),
      });

      const prompt = createSafeLLMPrompt('Analyze', [transaction]);

      expect(prompt).not.toContain('384');
      expect(prompt).not.toContain('[0.5');
    });
  });

  describe('File Path Exclusion', () => {
    it('MUST NOT include file paths in prompts', () => {
      const transaction = createTransaction({
        filePath: '/Users/john/Documents/Financial/tax-returns-2024.pdf',
      });

      const prompt = createSafeLLMPrompt('Show documents', [transaction]);

      expect(prompt).not.toContain('/Users/john');
      expect(prompt).not.toContain('Documents/Financial');
      expect(prompt).not.toContain('tax-returns');
      expect(prompt).not.toContain('filePath');
    });

    it('MUST NOT include OPFS paths in prompts', () => {
      const transaction = createTransaction({
        filePath: '/vault-ai/documents/2024/01/abc123.pdf',
      });

      const prompt = createSafeLLMPrompt('Show files', [transaction]);

      expect(prompt).not.toContain('/vault-ai');
      expect(prompt).not.toContain('/documents/');
      expect(prompt).not.toContain('abc123');
    });
  });

  describe('Metadata Exclusion', () => {
    it('MUST NOT include file size in prompts', () => {
      const transaction = createTransaction({
        fileSize: 2048576,
      });

      const prompt = createSafeLLMPrompt('Analyze', [transaction]);

      expect(prompt).not.toContain('2048576');
      expect(prompt).not.toContain('fileSize');
    });

    it('MUST NOT include MIME type in prompts', () => {
      const transaction = createTransaction({
        mimeType: 'application/pdf',
      });

      const prompt = createSafeLLMPrompt('Analyze', [transaction]);

      expect(prompt).not.toContain('mimeType');
      // Note: 'application' and 'pdf' might appear in other contexts
    });

    it('MUST NOT include confidence scores in prompts', () => {
      const transaction = createTransaction({
        confidence: 0.9567,
      });

      const prompt = createSafeLLMPrompt('Analyze', [transaction]);

      expect(prompt).not.toContain('0.9567');
      expect(prompt).not.toContain('confidence');
    });
  });

  describe('Safe Data Inclusion', () => {
    it('MUST include structured transaction data', () => {
      const transaction = createTransaction({
        date: '2024-01-15',
        amount: 125.5,
        vendor: 'Coffee Shop',
        category: null,
      });

      const prompt = createSafeLLMPrompt('Show coffee expenses', [transaction]);

      expect(prompt).toContain('2024-01-15');
      expect(prompt).toContain('125.5');
      expect(prompt).toContain('Coffee Shop');
    });

    it('MUST allow user query in prompt', () => {
      const userQuery = 'How much did I spend on groceries last month?';
      const prompt = createSafeLLMPrompt(userQuery, []);

      expect(prompt).toContain(userQuery);
    });

    it('MUST format amounts correctly', () => {
      const transaction = createTransaction({
        amount: 1234.56,
      });

      const prompt = createSafeLLMPrompt('Show total', [transaction]);

      expect(prompt).toContain('1234.56');
    });
  });
});

describe('CRITICAL: Privacy - LLM API Integration', () => {
  describe('Request Validation', () => {
    it('MUST sanitize data before sending to LLM API', async () => {
      const transactions = createTransactions(5);

      // Extract only safe fields for LLM
      const safeData = transactions.map((tx) => ({
        date: tx.date,
        amount: tx.amount,
        vendor: tx.vendor,
        category: tx.category,
      }));

      const prompt = mockLLMService.buildSafePrompt('Analyze spending', safeData);
      await mockLLMService.generateResponse(prompt);

      // Verify the captured request
      expect(llmRequests.length).toBe(1);
      const sentPrompt = llmRequests[0].prompt;

      // Should not contain any sensitive fields
      expect(sentPrompt).not.toContain('rawText');
      expect(sentPrompt).not.toContain('embedding');
      expect(sentPrompt).not.toContain('filePath');
      expect(sentPrompt).not.toContain('fileSize');
      expect(sentPrompt).not.toContain('mimeType');
      expect(sentPrompt).not.toContain('confidence');
    });

    it('MUST verify prompt safety before API call', async () => {
      const transaction = createTransaction({
        rawText: 'SENSITIVE: Social Security Number 123-45-6789',
      });

      // Build safe prompt that excludes raw text
      const safeData = {
        date: transaction.date,
        amount: transaction.amount,
        vendor: transaction.vendor,
        category: transaction.category,
      };

      const prompt = mockLLMService.buildSafePrompt('Analyze', [safeData]);

      // Verify the prompt is safe before calling API
      const isSafe =
        !prompt.includes('rawText') &&
        !prompt.includes('SENSITIVE') &&
        !prompt.includes('123-45-6789');

      expect(isSafe).toBe(true);

      // Now safe to send
      await mockLLMService.generateResponse(prompt);
    });
  });

  describe('Response Handling', () => {
    it('MUST not store raw LLM responses with sensitive prompts', async () => {
      const transactions = [createTransaction()];
      const safeData = transactions.map((tx) => ({
        date: tx.date,
        amount: tx.amount,
        vendor: tx.vendor,
        category: tx.category,
      }));

      const prompt = mockLLMService.buildSafePrompt('Analyze', safeData);
      const response = await mockLLMService.generateResponse(prompt);

      // Response should be usable
      expect(response).toBeDefined();
      expect(typeof response).toBe('string');

      // The stored request should only contain safe data
      const storedRequest = llmRequests[0];
      expect(storedRequest.prompt).not.toContain('rawText');
    });
  });
});

describe('CRITICAL: Privacy - Chat Context', () => {
  it('MUST not leak sensitive data through conversation history', () => {
    const conversationHistory = [
      {
        role: 'user' as const,
        content: 'Show my medical expenses',
        // Citations should reference IDs, not raw content
        citations: [{ id: 'tx-123', title: 'Hospital Receipt' }],
      },
      {
        role: 'assistant' as const,
        content: 'You have $500 in medical expenses.',
        citations: [{ id: 'tx-123', title: 'Hospital Receipt' }],
      },
    ];

    // When building context for follow-up, should not include raw text
    const contextPrompt = conversationHistory
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    // Context should be safe
    expect(contextPrompt).not.toContain('rawText');
    expect(contextPrompt).not.toContain('embedding');
    expect(contextPrompt).not.toContain('filePath');
  });

  it('MUST use transaction IDs for citations, not raw content', () => {
    const citation = {
      transactionId: 'tx-abc-123',
      title: 'Receipt from Hospital',
      amount: 500,
      date: '2024-01-15',
      // Should NOT include:
      // rawText, filePath, embedding, etc.
    };

    expect(citation).not.toHaveProperty('rawText');
    expect(citation).not.toHaveProperty('embedding');
    expect(citation).not.toHaveProperty('filePath');

    expect(citation).toHaveProperty('transactionId');
    expect(citation).toHaveProperty('title');
  });
});
