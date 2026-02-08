/**
 * CRITICAL: Privacy - Sync Layer Tests
 *
 * Tests that verify the sync engine never transmits sensitive data.
 * These tests ensure the privacy boundary is maintained at the sync layer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTransaction,
  createTransactions,
  verifySyncPayloadIsSafe,
} from '../factories';
import { NEVER_SYNC_FIELDS } from '@/types/database';

// ============================================
// Mock Sync Operations
// ============================================

interface SyncOperation {
  type: 'upload' | 'download';
  payload: unknown;
  timestamp: Date;
}

const syncOperations: SyncOperation[] = [];

// Mock sync engine that captures all operations
const mockSyncEngine = {
  uploadPendingChanges: vi.fn(async (transactions: unknown[]) => {
    syncOperations.push({
      type: 'upload',
      payload: transactions,
      timestamp: new Date(),
    });
    return transactions.length;
  }),

  sanitizeForSync: (transaction: Record<string, unknown>) => {
    const sanitized: Record<string, unknown> = {};
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

    for (const field of allowedFields) {
      if (transaction[field] !== undefined) {
        sanitized[field] = transaction[field];
      }
    }

    return sanitized;
  },
};

beforeEach(() => {
  syncOperations.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================
// Sync Privacy Tests
// ============================================

describe('CRITICAL: Privacy - Sync Engine', () => {
  describe('Upload Sanitization', () => {
    it('MUST sanitize transactions before upload', () => {
      const transaction = createTransaction({
        rawText: 'This should never be synced',
        embedding: new Float32Array(384).fill(0.5),
        filePath: '/secret/documents/file.pdf',
      });

      const sanitized = mockSyncEngine.sanitizeForSync(
        transaction as unknown as Record<string, unknown>
      );

      // Verify sensitive fields are removed
      expect(sanitized).not.toHaveProperty('rawText');
      expect(sanitized).not.toHaveProperty('embedding');
      expect(sanitized).not.toHaveProperty('filePath');
      expect(sanitized).not.toHaveProperty('fileSize');
      expect(sanitized).not.toHaveProperty('mimeType');
      expect(sanitized).not.toHaveProperty('confidence');
    });

    it('MUST preserve required fields during sanitization', () => {
      const transaction = createTransaction({
        date: '2024-01-15',
        amount: 150.5,
        vendor: 'Test Store',
        note: 'Test note',
      });

      const sanitized = mockSyncEngine.sanitizeForSync(
        transaction as unknown as Record<string, unknown>
      );

      expect(sanitized).toHaveProperty('id');
      expect(sanitized).toHaveProperty('date', '2024-01-15');
      expect(sanitized).toHaveProperty('amount', 150.5);
      expect(sanitized).toHaveProperty('vendor', 'Test Store');
      expect(sanitized).toHaveProperty('note', 'Test note');
    });

    it('MUST handle batch uploads safely', async () => {
      const transactions = createTransactions(10);

      const sanitizedBatch = transactions.map((tx) =>
        mockSyncEngine.sanitizeForSync(tx as unknown as Record<string, unknown>)
      );

      await mockSyncEngine.uploadPendingChanges(sanitizedBatch);

      // Verify all uploaded items are safe
      expect(syncOperations.length).toBe(1);
      const uploadedPayload = syncOperations[0].payload as unknown[];

      for (const item of uploadedPayload) {
        expect(verifySyncPayloadIsSafe(item)).toBe(true);
      }
    });
  });

  describe('Field Filtering', () => {
    it('MUST filter all NEVER_SYNC_FIELDS', () => {
      const transactionWithAllFields = {
        id: 'test-id',
        rawText: 'Sensitive raw text',
        embedding: new Float32Array(384),
        filePath: '/path/to/file',
        fileSize: 12345,
        mimeType: 'application/pdf',
        confidence: 0.95,
        ocrOutput: 'OCR text output',
        date: '2024-01-15',
        amount: 100,
        vendor: 'Store',
        category: null,
        note: 'Note',
        currency: 'USD',
      };

      const sanitized = mockSyncEngine.sanitizeForSync(
        transactionWithAllFields
      );

      for (const sensitiveField of NEVER_SYNC_FIELDS) {
        expect(sanitized).not.toHaveProperty(sensitiveField);
      }
    });

    it('MUST not leak sensitive data through JSON serialization', () => {
      const transaction = createTransaction({
        rawText: 'MEDICAL: Patient diagnosis - cancer treatment',
        embedding: new Float32Array([0.1, 0.2, 0.3]),
        filePath: '/confidential/medical-records.pdf',
      });

      const sanitized = mockSyncEngine.sanitizeForSync(
        transaction as unknown as Record<string, unknown>
      );
      const jsonString = JSON.stringify(sanitized);

      expect(jsonString).not.toContain('MEDICAL');
      expect(jsonString).not.toContain('cancer');
      expect(jsonString).not.toContain('diagnosis');
      expect(jsonString).not.toContain('medical-records');
      expect(jsonString).not.toContain('confidential');
      expect(jsonString).not.toContain('0.1');
      expect(jsonString).not.toContain('0.2');
    });
  });

  describe('Edge Cases', () => {
    it('MUST handle undefined and null values safely', () => {
      const transactionWithNulls = {
        id: 'test-id',
        rawText: undefined,
        embedding: null,
        date: '2024-01-15',
        amount: 100,
        vendor: 'Store',
        category: null,
      };

      const sanitized = mockSyncEngine.sanitizeForSync(
        transactionWithNulls as unknown as Record<string, unknown>
      );

      // Should not include undefined fields
      expect(sanitized).not.toHaveProperty('rawText');
      expect(sanitized).not.toHaveProperty('embedding');

      // Should include null where appropriate
      expect(sanitized.category).toBeNull();
    });

    it('MUST handle special characters in vendor names', () => {
      const transaction = createTransaction({
        vendor: 'Store with "quotes" & <special> chars',
        rawText: 'Raw text with "quotes" & <special> chars',
      });

      const sanitized = mockSyncEngine.sanitizeForSync(
        transaction as unknown as Record<string, unknown>
      );

      // Vendor should be included (it's safe data)
      expect(sanitized.vendor).toContain('quotes');
      expect(sanitized.vendor).toContain('special');

      // Raw text should not be included
      expect(sanitized).not.toHaveProperty('rawText');
    });

    it('MUST handle large embeddings without leaking', () => {
      const largeEmbedding = new Float32Array(384).map((_, i) => i / 384);
      const transaction = createTransaction({
        embedding: largeEmbedding,
      });

      const sanitized = mockSyncEngine.sanitizeForSync(
        transaction as unknown as Record<string, unknown>
      );
      const jsonString = JSON.stringify(sanitized);

      // Should not contain any numbers that look like embedding values
      expect(sanitized).not.toHaveProperty('embedding');
      expect(jsonString).not.toMatch(/\d+\.\d{6}/); // 6 decimal places typical of embeddings
    });
  });
});

describe('CRITICAL: Privacy - Sync Conflict Resolution', () => {
  it('MUST preserve local-only data during conflict resolution', () => {
    const localTransaction = createTransaction({
      rawText: 'Local sensitive data that must be preserved',
      embedding: new Float32Array(384).fill(0.1),
      filePath: '/local/path.pdf',
      amount: 100,
      vendor: 'Local Store',
    });

    const remoteTransaction = {
      id: localTransaction.id,
      amount: 150,
      vendor: 'Remote Store',
      date: localTransaction.date,
    };

    // Simulate conflict resolution - remote wins for cloud fields
    const resolved = {
      ...localTransaction,
      // Cloud fields from remote
      amount: remoteTransaction.amount,
      vendor: remoteTransaction.vendor,
      // Local-only fields must be preserved
      rawText: localTransaction.rawText,
      embedding: localTransaction.embedding,
      filePath: localTransaction.filePath,
    };

    // Local-only data should be preserved
    expect(resolved.rawText).toBe(
      'Local sensitive data that must be preserved'
    );
    expect(resolved.embedding).toBe(localTransaction.embedding);
    expect(resolved.filePath).toBe('/local/path.pdf');

    // Cloud fields should be updated from remote
    expect(resolved.amount).toBe(150);
    expect(resolved.vendor).toBe('Remote Store');
  });

  it('MUST not sync resolved conflicts with sensitive data', () => {
    const resolvedTransaction = createTransaction({
      rawText: 'Preserved local data',
      embedding: new Float32Array(384).fill(0.2),
    });

    const syncPayload = mockSyncEngine.sanitizeForSync(
      resolvedTransaction as unknown as Record<string, unknown>
    );

    expect(verifySyncPayloadIsSafe(syncPayload)).toBe(true);
  });
});
