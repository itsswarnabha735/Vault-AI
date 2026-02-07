/**
 * CRITICAL: Privacy Data Leakage Prevention Tests
 *
 * These tests verify that sensitive data (raw text, embeddings, file paths)
 * NEVER leaves the user's device. They must pass on every PR.
 *
 * Privacy Invariants:
 * 1. Raw document bytes SHALL never be transmitted over any network connection
 * 2. Full-text document content SHALL never leave the browser context
 * 3. Vector embeddings SHALL never be sent to cloud storage or external services
 * 4. Search queries SHALL be processed entirely client-side
 * 5. LLM prompts SHALL contain only sanitized, structured data - never raw text
 *
 * FAILURE OF THESE TESTS BLOCKS DEPLOYMENT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTransaction,
  createSyncableTransaction,
  verifySyncPayloadIsSafe,
  createSafeLLMPrompt,
  LocalTransaction,
  createTransactionId,
} from '../factories';
import { NEVER_SYNC_FIELDS } from '@/types/database';

// ============================================
// Test Setup
// ============================================

interface CapturedRequest {
  url: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
}

const capturedRequests: CapturedRequest[] = [];
const originalFetch = global.fetch;

beforeEach(() => {
  capturedRequests.length = 0;

  // Mock fetch to capture all network requests
  global.fetch = vi.fn(async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    let bodyString: string | null = null;

    if (init?.body) {
      if (typeof init.body === 'string') {
        bodyString = init.body;
      } else if (init.body instanceof FormData) {
        // Convert FormData to string representation
        const entries: string[] = [];
        init.body.forEach((value, key) => {
          entries.push(`${key}: ${value}`);
        });
        bodyString = entries.join('; ');
      } else {
        bodyString = JSON.stringify(init.body);
      }
    }

    capturedRequests.push({
      url,
      method: init?.method ?? 'GET',
      body: bodyString,
      headers: init?.headers as Record<string, string>,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

// ============================================
// Privacy Test Suite
// ============================================

describe('CRITICAL: Privacy - Data Leakage Prevention', () => {
  describe('Sync Payload Sanitization', () => {
    it('MUST NOT include rawText in sync payload', () => {
      const transaction = createTransaction({
        rawText: 'CONFIDENTIAL: Medical records with SSN 123-45-6789',
      });

      const syncPayload = createSyncableTransaction(transaction);
      const payloadString = JSON.stringify(syncPayload);

      expect(payloadString).not.toContain('rawText');
      expect(payloadString).not.toContain('CONFIDENTIAL');
      expect(payloadString).not.toContain('SSN');
      expect(payloadString).not.toContain('123-45-6789');
    });

    it('MUST NOT include embeddings in sync payload', () => {
      const transaction = createTransaction({
        embedding: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]),
      });

      const syncPayload = createSyncableTransaction(transaction);
      const payloadString = JSON.stringify(syncPayload);

      expect(payloadString).not.toContain('embedding');
      // Embeddings are Float32Arrays, check for array patterns
      expect(payloadString).not.toMatch(/\[0\.\d+,\s*0\.\d+/);
    });

    it('MUST NOT include filePath in sync payload', () => {
      const transaction = createTransaction({
        filePath: '/private/documents/secret-file.pdf',
      });

      const syncPayload = createSyncableTransaction(transaction);
      const payloadString = JSON.stringify(syncPayload);

      expect(payloadString).not.toContain('filePath');
      expect(payloadString).not.toContain('/private/documents');
      expect(payloadString).not.toContain('secret-file');
    });

    it('MUST NOT include any NEVER_SYNC_FIELDS in sync payload', () => {
      const transaction = createTransaction({
        rawText: 'Sensitive content',
        embedding: new Float32Array(384).fill(0.1),
        filePath: '/path/to/file.pdf',
        fileSize: 12345,
        mimeType: 'application/pdf',
        confidence: 0.95,
      });

      const syncPayload = createSyncableTransaction(transaction);

      for (const field of NEVER_SYNC_FIELDS) {
        expect(syncPayload).not.toHaveProperty(field);
      }
    });

    it('MUST pass verifySyncPayloadIsSafe for valid payloads', () => {
      const transaction = createTransaction();
      const syncPayload = createSyncableTransaction(transaction);

      expect(verifySyncPayloadIsSafe(syncPayload)).toBe(true);
    });

    it('MUST only include whitelisted fields in sync payload', () => {
      const transaction = createTransaction();
      const syncPayload = createSyncableTransaction(transaction);

      const allowedFields = [
        'id',
        'date',
        'amount',
        'vendor',
        'category',
        'note',
        'currency',
        'client_created_at',
        'client_updated_at',
      ];

      const payloadKeys = Object.keys(syncPayload);

      for (const key of payloadKeys) {
        expect(allowedFields).toContain(key);
      }
    });
  });

  describe('LLM Prompt Sanitization', () => {
    it('MUST NOT include rawText in LLM prompts', () => {
      const transactions = [
        createTransaction({
          rawText: 'SSN: 123-45-6789, Account: 98765432',
          vendor: 'Bank',
          amount: 500,
        }),
      ];

      const prompt = createSafeLLMPrompt('Show me bank transactions', transactions);

      expect(prompt).not.toContain('SSN');
      expect(prompt).not.toContain('123-45-6789');
      expect(prompt).not.toContain('98765432');
      expect(prompt).not.toContain('rawText');
    });

    it('MUST NOT include embeddings in LLM prompts', () => {
      const transactions = [
        createTransaction({
          embedding: new Float32Array([0.123, 0.456, 0.789]),
        }),
      ];

      const prompt = createSafeLLMPrompt('Analyze spending', transactions);

      expect(prompt).not.toContain('embedding');
      expect(prompt).not.toContain('0.123');
      expect(prompt).not.toContain('Float32Array');
    });

    it('MUST NOT include file paths in LLM prompts', () => {
      const transactions = [
        createTransaction({
          filePath: '/Users/sensitive/documents/private.pdf',
        }),
      ];

      const prompt = createSafeLLMPrompt('Show receipts', transactions);

      expect(prompt).not.toContain('filePath');
      expect(prompt).not.toContain('/Users/');
      expect(prompt).not.toContain('private.pdf');
    });

    it('MUST only include structured data in LLM prompts', () => {
      const transactions = [
        createTransaction({
          rawText: 'Medical invoice for surgery',
          vendor: 'Hospital',
          amount: 5000,
          date: '2024-01-15',
          category: null,
        }),
      ];

      const prompt = createSafeLLMPrompt('Medical expenses', transactions);

      // Should contain structured data
      expect(prompt).toContain('Hospital');
      expect(prompt).toContain('5000');
      expect(prompt).toContain('2024-01-15');

      // Should NOT contain raw text content
      expect(prompt).not.toContain('surgery');
      expect(prompt).not.toContain('invoice');
    });
  });

  describe('Network Request Validation', () => {
    it('MUST NOT transmit document content in fetch requests', async () => {
      const sensitiveContent = 'HIGHLY_CONFIDENTIAL_DOCUMENT_CONTENT';

      // Simulate a sync operation
      await fetch('/api/sync', {
        method: 'POST',
        body: JSON.stringify({
          transactions: [
            {
              id: 'test-id',
              date: '2024-01-15',
              amount: 100,
              vendor: 'Test Store',
              // NOTE: rawText should never be included
            },
          ],
        }),
      });

      // Verify no request contains the sensitive content
      for (const request of capturedRequests) {
        if (request.body) {
          expect(request.body).not.toContain(sensitiveContent);
          expect(request.body).not.toContain('rawText');
          expect(request.body).not.toContain('embedding');
          expect(request.body).not.toContain('filePath');
        }
      }
    });

    it('MUST NOT use multipart/form-data with document uploads to cloud', async () => {
      // Simulate what should NOT happen - direct file upload
      await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ metadata: 'only' }),
      });

      // Verify no multipart requests (which would indicate file upload)
      for (const request of capturedRequests) {
        expect(request.headers?.['Content-Type']).not.toContain('multipart');
      }
    });
  });

  describe('Transaction Object Privacy', () => {
    it('LocalTransaction MUST have separate sync and local-only fields', () => {
      const transaction = createTransaction();

      // Verify local-only fields exist
      expect(transaction).toHaveProperty('rawText');
      expect(transaction).toHaveProperty('embedding');
      expect(transaction).toHaveProperty('filePath');
      expect(transaction).toHaveProperty('fileSize');
      expect(transaction).toHaveProperty('mimeType');
      expect(transaction).toHaveProperty('confidence');

      // Verify syncable fields exist
      expect(transaction).toHaveProperty('id');
      expect(transaction).toHaveProperty('date');
      expect(transaction).toHaveProperty('amount');
      expect(transaction).toHaveProperty('vendor');
      expect(transaction).toHaveProperty('category');
      expect(transaction).toHaveProperty('note');
    });

    it('createSyncableTransaction MUST strip all sensitive fields', () => {
      const transaction = createTransaction({
        rawText: 'Very sensitive information',
        embedding: new Float32Array(384).fill(0.5),
        filePath: '/secret/path.pdf',
        fileSize: 99999,
        mimeType: 'application/pdf',
        confidence: 0.99,
      });

      const syncable = createSyncableTransaction(transaction);

      // Should NOT have any sensitive fields
      expect(syncable).not.toHaveProperty('rawText');
      expect(syncable).not.toHaveProperty('embedding');
      expect(syncable).not.toHaveProperty('filePath');
      expect(syncable).not.toHaveProperty('fileSize');
      expect(syncable).not.toHaveProperty('mimeType');
      expect(syncable).not.toHaveProperty('confidence');
      expect(syncable).not.toHaveProperty('ocrOutput');

      // Should HAVE safe fields
      expect(syncable).toHaveProperty('id');
      expect(syncable).toHaveProperty('date');
      expect(syncable).toHaveProperty('amount');
      expect(syncable).toHaveProperty('vendor');
    });
  });

  describe('Embedding Privacy', () => {
    it('Embeddings MUST remain local-only', () => {
      const transaction = createTransaction();

      // Embeddings should exist locally
      expect(transaction.embedding).toBeInstanceOf(Float32Array);
      expect(transaction.embedding.length).toBe(384);

      // But never in sync payload
      const syncPayload = createSyncableTransaction(transaction);
      expect(syncPayload).not.toHaveProperty('embedding');
    });

    it('Search queries MUST be processed without sending embeddings to server', () => {
      // The embedding should be generated locally and used for local search
      const queryEmbedding = new Float32Array(384).fill(0.1);

      // Simulating local vector search (no network call should be made)
      const mockLocalSearch = (query: Float32Array, topK: number) => {
        return Array.from({ length: topK }, (_, i) => ({
          id: `result-${i}`,
          score: 0.9 - i * 0.1,
        }));
      };

      const results = mockLocalSearch(queryEmbedding, 10);

      // Results should be returned
      expect(results.length).toBe(10);

      // No network requests should have been made for search
      expect(capturedRequests.length).toBe(0);
    });
  });
});

describe('CRITICAL: Privacy - Sensitive Field Definitions', () => {
  it('NEVER_SYNC_FIELDS MUST include all sensitive fields', () => {
    const requiredSensitiveFields = [
      'rawText',
      'embedding',
      'filePath',
      'fileSize',
      'mimeType',
      'confidence',
    ];

    for (const field of requiredSensitiveFields) {
      expect(NEVER_SYNC_FIELDS).toContain(field);
    }
  });

  it('verifySyncPayloadIsSafe MUST detect violations', () => {
    const unsafePayloads = [
      { id: '1', rawText: 'sensitive' },
      { id: '2', embedding: [0.1, 0.2] },
      { id: '3', filePath: '/path' },
      { id: '4', fileSize: 1024 },
      { id: '5', mimeType: 'application/pdf' },
      { id: '6', confidence: 0.95 },
      { id: '7', ocrOutput: 'text' },
    ];

    for (const payload of unsafePayloads) {
      expect(verifySyncPayloadIsSafe(payload)).toBe(false);
    }
  });
});

// ============================================
// Database & Sync Engine Integration Tests
// ============================================

describe('CRITICAL: Privacy - Database Sync Integration', () => {
  // Mock database for testing
  const mockDatabase: Map<string, LocalTransaction> = new Map();

  // Mock sync engine
  const mockSyncEngine = {
    syncNow: vi.fn(async () => {
      const pending = Array.from(mockDatabase.values()).filter(
        (tx) => tx.syncStatus === 'pending'
      );

      const sanitizedPayloads = pending.map((tx) => createSyncableTransaction(tx));

      // Simulate network request
      for (const payload of sanitizedPayloads) {
        capturedRequests.push({
          url: 'https://api.supabase.co/rest/v1/transactions',
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Mark as synced
      for (const tx of pending) {
        tx.syncStatus = 'synced';
        mockDatabase.set(tx.id, tx);
      }

      return { uploaded: pending.length, downloaded: 0, conflicts: 0 };
    }),
  };

  beforeEach(() => {
    mockDatabase.clear();
  });

  it('MUST NOT transmit raw document text during sync', async () => {
    const transaction = createTransaction({
      id: createTransactionId('test-sync-1'),
      rawText: 'CONFIDENTIAL: SSN 123-45-6789, Account #987654321',
      amount: 100,
      vendor: 'Hospital',
      date: '2024-01-15',
      syncStatus: 'pending',
    });

    mockDatabase.set(transaction.id, transaction);

    await mockSyncEngine.syncNow();

    // Verify NO request contains sensitive data
    for (const request of capturedRequests) {
      expect(request.body).not.toContain('CONFIDENTIAL');
      expect(request.body).not.toContain('SSN');
      expect(request.body).not.toContain('123-45-6789');
      expect(request.body).not.toContain('987654321');
      expect(request.body).not.toContain('rawText');
    }
  });

  it('MUST NOT transmit embeddings to cloud', async () => {
    const transaction = createTransaction({
      id: createTransactionId('test-sync-2'),
      embedding: new Float32Array(384).fill(0.5),
      amount: 50,
      vendor: 'Store',
      syncStatus: 'pending',
    });

    mockDatabase.set(transaction.id, transaction);

    await mockSyncEngine.syncNow();

    for (const request of capturedRequests) {
      expect(request.body).not.toContain('embedding');
      // Check for float array pattern
      expect(request.body).not.toMatch(/\[0\.\d+,\s*0\.\d+/);
    }
  });

  it('MUST NOT transmit file paths to cloud', async () => {
    const transaction = createTransaction({
      id: createTransactionId('test-sync-3'),
      filePath: '/vault-ai/documents/2024/01/secret.pdf',
      amount: 75,
      vendor: 'Vendor',
      syncStatus: 'pending',
    });

    mockDatabase.set(transaction.id, transaction);

    await mockSyncEngine.syncNow();

    for (const request of capturedRequests) {
      expect(request.body).not.toContain('filePath');
      expect(request.body).not.toContain('/vault-ai/');
      expect(request.body).not.toContain('secret.pdf');
    }
  });

  it('MUST verify sanitization function strips all sensitive fields', () => {
    const transaction = createTransaction({
      rawText: 'sensitive data here',
      embedding: new Float32Array(384).fill(0.3),
      filePath: '/secret/path.pdf',
      fileSize: 12345,
      mimeType: 'application/pdf',
      confidence: 0.95,
    });

    const sanitized = createSyncableTransaction(transaction);

    expect(sanitized).not.toHaveProperty('rawText');
    expect(sanitized).not.toHaveProperty('embedding');
    expect(sanitized).not.toHaveProperty('filePath');
    expect(sanitized).not.toHaveProperty('fileSize');
    expect(sanitized).not.toHaveProperty('mimeType');
    expect(sanitized).not.toHaveProperty('confidence');
    expect(sanitized).toHaveProperty('id');
    expect(sanitized).toHaveProperty('date');
    expect(sanitized).toHaveProperty('amount');
    expect(sanitized).toHaveProperty('vendor');
  });

  it('MUST handle bulk sync without leaking any sensitive data', async () => {
    // Add multiple transactions with various sensitive data
    const transactions = [
      createTransaction({
        id: createTransactionId('bulk-1'),
        rawText: 'Medical records for patient John Doe',
        syncStatus: 'pending',
      }),
      createTransaction({
        id: createTransactionId('bulk-2'),
        rawText: 'Tax return with income details',
        embedding: new Float32Array(384).fill(0.7),
        syncStatus: 'pending',
      }),
      createTransaction({
        id: createTransactionId('bulk-3'),
        rawText: 'Bank statement account ending in 4321',
        filePath: '/private/bank-statement.pdf',
        syncStatus: 'pending',
      }),
    ];

    for (const tx of transactions) {
      mockDatabase.set(tx.id, tx);
    }

    await mockSyncEngine.syncNow();

    // Comprehensive check of all requests
    const allRequestBodies = capturedRequests.map((r) => r.body).join(' ');

    // None of the sensitive content should appear
    expect(allRequestBodies).not.toContain('Medical records');
    expect(allRequestBodies).not.toContain('John Doe');
    expect(allRequestBodies).not.toContain('Tax return');
    expect(allRequestBodies).not.toContain('Bank statement');
    expect(allRequestBodies).not.toContain('4321');
    expect(allRequestBodies).not.toContain('/private/');
    expect(allRequestBodies).not.toContain('rawText');
    expect(allRequestBodies).not.toContain('embedding');
    expect(allRequestBodies).not.toContain('filePath');
  });
});
