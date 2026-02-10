/**
 * Integration Tests for Document Ingestion
 *
 * Tests the complete document processing pipeline:
 * 1. File upload -> OCR/Text extraction
 * 2. Entity extraction (date, amount, vendor)
 * 3. Embedding generation
 * 4. Local storage (IndexedDB + OPFS)
 * 5. Vector index update
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createTransaction,
  createMockFile,
} from '../factories';

// ============================================
// Mock Services
// ============================================

// Mock OCR Service
const mockOCRService = {
  extractText: vi.fn(async (file: File): Promise<string> => {
    // Simulate OCR processing
    if (file.type === 'application/pdf') {
      return `
        ACME STORE
        123 Main Street
        Date: 01/15/2024
        
        Item 1: Widget           $25.99
        Item 2: Gadget           $49.99
        
        Subtotal:                $75.98
        Tax (8%):                 $6.08
        Total:                   $82.06
        
        Thank you for your purchase!
      `.trim();
    }
    if (file.type.startsWith('image/')) {
      return 'Receipt from Test Store\nDate: January 20, 2024\nTotal: $45.00';
    }
    return 'Unknown document content';
  }),
};

// Mock Entity Extractor
const mockEntityExtractor = {
  extract: vi.fn(
    async (
      text: string
    ): Promise<{
      date: { value: string; confidence: number } | null;
      amount: { value: number; confidence: number } | null;
      vendor: { value: string; confidence: number } | null;
    }> => {
      // Simplified extraction for testing
      const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      // Match only standalone "Total:" - not "Subtotal:"
      const amountMatch = text.match(/(?:^|\s)Total:\s*\$?([\d,]+\.?\d*)/im);
      const vendorMatch = text.match(/^\s*([A-Z][A-Z\s]+)$/m);

      return {
        date: dateMatch
          ? {
              value: `${dateMatch[3]}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`,
              confidence: 0.9,
            }
          : null,
        amount: amountMatch
          ? {
              value: parseFloat(amountMatch[1].replace(',', '')),
              confidence: 0.95,
            }
          : null,
        vendor: vendorMatch
          ? { value: vendorMatch[1].trim(), confidence: 0.85 }
          : null,
      };
    }
  ),
};

// Mock Embedding Service
const mockEmbeddingService = {
  embed: vi.fn(async (text: string): Promise<Float32Array> => {
    // Return deterministic embedding based on text hash
    const embedding = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      embedding[i] = Math.sin(text.charCodeAt(i % text.length) + i) * 0.5 + 0.5;
    }
    return embedding;
  }),
};

// Mock OPFS Service
const mockOPFSService = {
  savedFiles: new Map<string, Blob>(),

  saveFile: vi.fn(
    async (file: File, transactionId: string): Promise<string> => {
      const path = `/vault-ai/documents/${transactionId}/${file.name}`;
      mockOPFSService.savedFiles.set(path, file);
      return path;
    }
  ),

  getFile: vi.fn(async (path: string): Promise<Blob | null> => {
    return mockOPFSService.savedFiles.get(path) || null;
  }),

  deleteFile: vi.fn(async (path: string): Promise<void> => {
    mockOPFSService.savedFiles.delete(path);
  }),

  clear: () => mockOPFSService.savedFiles.clear(),
};

// Mock Database
const mockDatabase = {
  transactions: new Map<string, ReturnType<typeof createTransaction>>(),

  add: vi.fn(
    async (tx: ReturnType<typeof createTransaction>): Promise<string> => {
      mockDatabase.transactions.set(tx.id, tx);
      return tx.id;
    }
  ),

  get: vi.fn(async (id: string) => mockDatabase.transactions.get(id)),

  update: vi.fn(
    async (
      id: string,
      changes: Partial<ReturnType<typeof createTransaction>>
    ) => {
      const tx = mockDatabase.transactions.get(id);
      if (tx) {
        mockDatabase.transactions.set(id, { ...tx, ...changes });
      }
    }
  ),

  clear: () => mockDatabase.transactions.clear(),
};

// Mock Vector Search
const mockVectorSearch = {
  vectors: new Map<string, Float32Array>(),

  addVector: vi.fn((id: string, vector: Float32Array) => {
    mockVectorSearch.vectors.set(id, vector);
  }),

  search: vi.fn((queryVector: Float32Array, k: number = 10) => {
    const results: { id: string; score: number }[] = [];
    for (const [id, vector] of mockVectorSearch.vectors.entries()) {
      // Simple dot product for similarity
      let score = 0;
      for (let i = 0; i < Math.min(queryVector.length, vector.length); i++) {
        score += queryVector[i] * vector[i];
      }
      results.push({ id, score });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, k);
  }),

  clear: () => mockVectorSearch.vectors.clear(),
};

// ============================================
// Document Processor (Integration Target)
// ============================================

interface ProcessingResult {
  id: string;
  rawText: string;
  embedding: Float32Array;
  filePath: string;
  entities: {
    date: { value: string; confidence: number } | null;
    amount: { value: number; confidence: number } | null;
    vendor: { value: string; confidence: number } | null;
  };
}

async function processDocument(file: File): Promise<ProcessingResult> {
  const id = crypto.randomUUID();

  // Step 1: Extract text (OCR for images, parse for PDFs)
  const rawText = await mockOCRService.extractText(file);

  // Step 2: Extract entities
  const entities = await mockEntityExtractor.extract(rawText);

  // Step 3: Generate embedding
  const embedding = await mockEmbeddingService.embed(rawText);

  // Step 4: Save file to OPFS
  const filePath = await mockOPFSService.saveFile(file, id);

  // Step 5: Create transaction record
  const transaction = createTransaction({
    id: id as unknown as ReturnType<typeof createTransaction>['id'],
    rawText,
    embedding,
    filePath,
    date: entities.date?.value || new Date().toISOString().split('T')[0],
    amount: entities.amount?.value || 0,
    vendor: entities.vendor?.value || 'Unknown',
    confidence: Math.min(
      entities.date?.confidence || 0,
      entities.amount?.confidence || 0,
      entities.vendor?.confidence || 0
    ),
    syncStatus: 'local-only',
  });

  // Step 6: Save to database
  await mockDatabase.add(transaction);

  // Step 7: Add to vector index
  mockVectorSearch.addVector(id, embedding);

  return {
    id,
    rawText,
    embedding,
    filePath,
    entities,
  };
}

// ============================================
// Test Fixtures
// ============================================

async function loadTestFile(filename: string): Promise<File> {
  // Create mock test files
  const testFiles: Record<string, { content: string; type: string }> = {
    'sample-receipt.pdf': {
      content: 'PDF receipt content',
      type: 'application/pdf',
    },
    'receipt-image.png': {
      content: 'PNG image content',
      type: 'image/png',
    },
    'bank-statement.pdf': {
      content: 'Bank statement PDF',
      type: 'application/pdf',
    },
  };

  const fileData = testFiles[filename];
  if (!fileData) {
    throw new Error(`Test file not found: ${filename}`);
  }

  return createMockFile(filename, fileData.type, fileData.content);
}

function seedTestTransactions(count: number = 10): void {
  for (let i = 0; i < count; i++) {
    const tx = createTransaction({
      vendor: `Test Vendor ${i}`,
    });
    mockDatabase.add(tx);
    mockVectorSearch.addVector(tx.id, tx.embedding);
  }
}

// ============================================
// Tests
// ============================================

describe('Document Ingestion Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOPFSService.clear();
    mockDatabase.clear();
    mockVectorSearch.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Pipeline', () => {
    it('processes PDF and extracts all data', async () => {
      const pdfFile = await loadTestFile('sample-receipt.pdf');

      const result = await processDocument(pdfFile);

      expect(result.rawText).toBeTruthy();
      expect(result.rawText.length).toBeGreaterThan(0);
      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding.length).toBe(384);
      expect(result.entities.date).toBeTruthy();
      expect(result.entities.amount).toBeTruthy();
      expect(result.entities.vendor).toBeTruthy();
      expect(result.filePath).toBeTruthy();
    });

    it('saves to local database and OPFS', async () => {
      const file = await loadTestFile('sample-receipt.pdf');
      const result = await processDocument(file);

      // Check IndexedDB
      const tx = await mockDatabase.get(result.id);
      expect(tx).toBeTruthy();
      expect(tx?.rawText).toBe(result.rawText);

      // Check OPFS
      const savedFile = await mockOPFSService.getFile(result.filePath);
      expect(savedFile).toBeTruthy();
    });

    it('updates vector index for search', async () => {
      const file = await loadTestFile('sample-receipt.pdf');
      const result = await processDocument(file);

      // Vector should be in index
      expect(mockVectorSearch.vectors.has(result.id)).toBe(true);

      // Search should find the document
      const searchResults = mockVectorSearch.search(result.embedding, 1);
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].id).toBe(result.id);
    });
  });

  describe('Text Extraction', () => {
    it('extracts text from PDF files', async () => {
      const pdfFile = await loadTestFile('sample-receipt.pdf');
      const result = await processDocument(pdfFile);

      expect(mockOCRService.extractText).toHaveBeenCalledWith(pdfFile);
      expect(result.rawText).toContain('ACME STORE');
    });

    it('extracts text from image files', async () => {
      const imageFile = await loadTestFile('receipt-image.png');
      const result = await processDocument(imageFile);

      expect(mockOCRService.extractText).toHaveBeenCalledWith(imageFile);
      expect(result.rawText).toContain('Test Store');
    });
  });

  describe('Entity Extraction', () => {
    it('extracts date from document', async () => {
      const file = await loadTestFile('sample-receipt.pdf');
      const result = await processDocument(file);

      expect(result.entities.date).toBeTruthy();
      expect(result.entities.date?.value).toBe('2024-01-15');
      expect(result.entities.date?.confidence).toBeGreaterThan(0.8);
    });

    it('extracts amount from document', async () => {
      const file = await loadTestFile('sample-receipt.pdf');
      const result = await processDocument(file);

      expect(result.entities.amount).toBeTruthy();
      expect(result.entities.amount?.value).toBe(82.06);
      expect(result.entities.amount?.confidence).toBeGreaterThan(0.9);
    });

    it('extracts vendor from document', async () => {
      const file = await loadTestFile('sample-receipt.pdf');
      const result = await processDocument(file);

      expect(result.entities.vendor).toBeTruthy();
      expect(result.entities.vendor?.value).toBe('ACME STORE');
    });
  });

  describe('Embedding Generation', () => {
    it('generates 384-dimensional embedding', async () => {
      const file = await loadTestFile('sample-receipt.pdf');
      const result = await processDocument(file);

      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding.length).toBe(384);
    });

    it('calls embedding service with extracted text', async () => {
      const file = await loadTestFile('sample-receipt.pdf');
      await processDocument(file);

      expect(mockEmbeddingService.embed).toHaveBeenCalled();
      const callArg = mockEmbeddingService.embed.mock.calls[0][0];
      expect(callArg).toContain('ACME STORE');
    });
  });

  describe('Storage', () => {
    it('creates transaction with correct fields', async () => {
      const file = await loadTestFile('sample-receipt.pdf');
      const result = await processDocument(file);

      const tx = await mockDatabase.get(result.id);

      expect(tx).toMatchObject({
        id: result.id,
        rawText: expect.any(String),
        embedding: expect.any(Float32Array),
        filePath: expect.stringContaining('/vault-ai/documents/'),
        date: '2024-01-15',
        amount: 82.06,
        vendor: 'ACME STORE',
        syncStatus: 'local-only',
      });
    });

    it('stores file in OPFS with correct path', async () => {
      const file = await loadTestFile('sample-receipt.pdf');
      const result = await processDocument(file);

      expect(result.filePath).toMatch(/^\/vault-ai\/documents\//);
      expect(mockOPFSService.saveFile).toHaveBeenCalledWith(file, result.id);
    });
  });

  describe('Search Integration', () => {
    it('makes document searchable after processing', async () => {
      // Process multiple documents
      await processDocument(await loadTestFile('sample-receipt.pdf'));
      seedTestTransactions(5);

      // Search for the specific document
      const queryEmbedding =
        await mockEmbeddingService.embed('ACME STORE receipt');
      const results = mockVectorSearch.search(queryEmbedding, 3);

      expect(results.length).toBe(3);
    });

    it('ranks similar documents higher', async () => {
      // Add some background documents
      seedTestTransactions(5);

      // Process our target document
      const result = await processDocument(
        await loadTestFile('sample-receipt.pdf')
      );

      // Search with exact embedding should return our document first
      const searchResults = mockVectorSearch.search(result.embedding, 1);

      expect(searchResults[0].id).toBe(result.id);
      expect(searchResults[0].score).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('handles OCR failure gracefully', async () => {
      mockOCRService.extractText.mockRejectedValueOnce(new Error('OCR failed'));

      const file = await loadTestFile('sample-receipt.pdf');

      await expect(processDocument(file)).rejects.toThrow('OCR failed');
    });

    it('handles embedding service failure', async () => {
      mockEmbeddingService.embed.mockRejectedValueOnce(
        new Error('Embedding failed')
      );

      const file = await loadTestFile('sample-receipt.pdf');

      await expect(processDocument(file)).rejects.toThrow('Embedding failed');
    });

    it('handles OPFS storage failure', async () => {
      mockOPFSService.saveFile.mockRejectedValueOnce(new Error('Storage full'));

      const file = await loadTestFile('sample-receipt.pdf');

      await expect(processDocument(file)).rejects.toThrow('Storage full');
    });
  });

  describe('Multiple Documents', () => {
    it('processes multiple documents sequentially', async () => {
      const files = [
        await loadTestFile('sample-receipt.pdf'),
        await loadTestFile('receipt-image.png'),
        await loadTestFile('bank-statement.pdf'),
      ];

      const results = [];
      for (const file of files) {
        results.push(await processDocument(file));
      }

      expect(results).toHaveLength(3);
      expect(mockDatabase.transactions.size).toBe(3);
      expect(mockVectorSearch.vectors.size).toBe(3);
    });

    it('generates unique IDs for each document', async () => {
      const file1 = await loadTestFile('sample-receipt.pdf');
      const file2 = await loadTestFile('sample-receipt.pdf');

      const result1 = await processDocument(file1);
      const result2 = await processDocument(file2);

      expect(result1.id).not.toBe(result2.id);
    });
  });
});
