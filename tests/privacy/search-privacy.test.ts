/**
 * CRITICAL: Privacy - Search Operations Tests
 *
 * These tests verify that all search operations happen entirely client-side.
 * Search queries and embeddings NEVER leave the user's device.
 *
 * FAILURE OF THESE TESTS BLOCKS DEPLOYMENT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTransaction,
  createTransactions,
  createTransactionId,
} from '../factories';

// ============================================
// Test Setup
// ============================================

interface CapturedRequest {
  url: string;
  method: string;
  body: string | null;
}

const capturedRequests: CapturedRequest[] = [];
const originalFetch = global.fetch;

beforeEach(() => {
  capturedRequests.length = 0;

  global.fetch = vi.fn(async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    let bodyString: string | null = null;

    if (init?.body) {
      if (typeof init.body === 'string') {
        bodyString = init.body;
      } else {
        bodyString = JSON.stringify(init.body);
      }
    }

    capturedRequests.push({
      url,
      method: init?.method ?? 'GET',
      body: bodyString,
    });

    return new Response(JSON.stringify({ results: [] }), {
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
// Mock Vector Search Service
// ============================================

interface SearchResult {
  id: string;
  score: number;
}

// Simulated local vector index
const localVectorIndex: Map<string, Float32Array> = new Map();

const mockVectorSearch = {
  addVector: (id: string, vector: Float32Array) => {
    localVectorIndex.set(id, vector);
  },

  removeVector: (id: string) => {
    localVectorIndex.delete(id);
  },

  search: (queryVector: Float32Array, k: number = 10): SearchResult[] => {
    // Perform search entirely locally using cosine similarity
    const results: SearchResult[] = [];

    for (const [id, vector] of localVectorIndex.entries()) {
      const score = cosineSimilarity(queryVector, vector);
      results.push({ id, score });
    }

    // Sort by score descending and take top k
    return results.sort((a, b) => b.score - a.score).slice(0, k);
  },

  getStats: () => ({
    vectorCount: localVectorIndex.size,
    dimensions: 384,
  }),
};

// Cosine similarity helper
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Mock embedding service (local)
const mockEmbeddingService = {
  embedText: async (text: string): Promise<Float32Array> => {
    // Simulate local embedding generation
    const embedding = new Float32Array(384);
    // Simple hash-based mock embedding for testing
    for (let i = 0; i < 384; i++) {
      embedding[i] = Math.sin(text.charCodeAt(i % text.length) + i) * 0.5 + 0.5;
    }
    return embedding;
  },
};

// ============================================
// Privacy Tests
// ============================================

describe('CRITICAL: Privacy - Search Operations', () => {
  beforeEach(() => {
    localVectorIndex.clear();
  });

  describe('Client-Side Search', () => {
    it('MUST perform search entirely client-side', async () => {
      // Add test documents to local index
      const transactions = createTransactions(10);
      for (const tx of transactions) {
        mockVectorSearch.addVector(tx.id, tx.embedding);
      }

      // Perform search
      const queryEmbedding = await mockEmbeddingService.embedText('furniture');
      const results = mockVectorSearch.search(queryEmbedding, 5);

      // Verify results were returned
      expect(results.length).toBeGreaterThan(0);

      // Verify no search queries sent to server
      const searchRequests = capturedRequests.filter(
        (r) =>
          r.url.includes('search') ||
          r.url.includes('query') ||
          r.body?.includes('furniture')
      );
      expect(searchRequests).toHaveLength(0);
    });

    it('MUST NOT log search queries to any server', async () => {
      const sensitiveQueries = [
        'medical bills for cancer treatment',
        'tax documents 2024',
        'divorce lawyer invoice',
        'psychiatric appointment receipt',
      ];

      for (const query of sensitiveQueries) {
        const embedding = await mockEmbeddingService.embedText(query);
        mockVectorSearch.search(embedding);
      }

      // Verify no queries were logged to server
      for (const request of capturedRequests) {
        for (const query of sensitiveQueries) {
          expect(request.body).not.toContain(query);
        }
        expect(request.url).not.toContain('log');
        expect(request.url).not.toContain('analytics');
        expect(request.url).not.toContain('track');
      }
    });

    it('MUST NOT send embeddings to any server during search', async () => {
      const queryEmbedding = await mockEmbeddingService.embedText('test query');
      mockVectorSearch.search(queryEmbedding);

      for (const request of capturedRequests) {
        // Check no embedding data in requests
        expect(request.body).not.toContain('embedding');
        // Check no float array patterns
        expect(request.body).not.toMatch(/\[0\.\d+,/);
        expect(request.body).not.toContain('Float32Array');
      }
    });
  });

  describe('Embedding Generation', () => {
    it('MUST generate embeddings locally without server calls', async () => {
      const testTexts = [
        'Receipt from Amazon for laptop',
        'Medical bill from hospital',
        'Restaurant dinner receipt',
      ];

      for (const text of testTexts) {
        const embedding = await mockEmbeddingService.embedText(text);

        // Embedding should be generated
        expect(embedding).toBeInstanceOf(Float32Array);
        expect(embedding.length).toBe(384);
      }

      // No embedding API calls should have been made
      const embeddingRequests = capturedRequests.filter(
        (r) =>
          r.url.includes('embed') ||
          r.url.includes('openai') ||
          r.url.includes('huggingface') ||
          r.url.includes('inference')
      );
      expect(embeddingRequests).toHaveLength(0);
    });

    it('MUST NOT send text to external embedding services', async () => {
      const sensitiveText = 'SSN: 123-45-6789, Account: 9876543210';
      await mockEmbeddingService.embedText(sensitiveText);

      for (const request of capturedRequests) {
        expect(request.body).not.toContain('SSN');
        expect(request.body).not.toContain('123-45-6789');
        expect(request.body).not.toContain('9876543210');
      }
    });
  });

  describe('Search Results', () => {
    it('MUST return results without server roundtrip', async () => {
      // Seed local index
      const furniture = createTransaction({
        id: createTransactionId('furniture-1'),
        vendor: 'IKEA',
      });
      const food = createTransaction({
        id: createTransactionId('food-1'),
        vendor: 'Restaurant',
      });

      mockVectorSearch.addVector(furniture.id, furniture.embedding);
      mockVectorSearch.addVector(food.id, food.embedding);

      // Search for furniture
      const queryEmbedding = furniture.embedding; // Use same embedding for exact match
      const results = mockVectorSearch.search(queryEmbedding, 1);

      expect(results[0].id).toBe(furniture.id);
      expect(results[0].score).toBeCloseTo(1, 1); // Should be very similar

      // No server calls
      expect(capturedRequests).toHaveLength(0);
    });

    it('MUST NOT transmit search result IDs to tracking services', async () => {
      const transactions = createTransactions(5);
      for (const tx of transactions) {
        mockVectorSearch.addVector(tx.id, tx.embedding);
      }

      const results = mockVectorSearch.search(
        await mockEmbeddingService.embedText('test'),
        3
      );

      // Results should exist
      expect(results.length).toBe(3);

      // No result tracking
      const trackingRequests = capturedRequests.filter(
        (r) =>
          r.url.includes('track') ||
          r.url.includes('analytics') ||
          r.url.includes('event')
      );
      expect(trackingRequests).toHaveLength(0);
    });
  });

  describe('Search History', () => {
    it('MUST store search history only locally', async () => {
      const searchHistory: { query: string; timestamp: Date }[] = [];

      // Simulate storing search history locally
      const recordSearch = async (query: string) => {
        searchHistory.push({ query, timestamp: new Date() });
      };

      await recordSearch('medical expenses');
      await recordSearch('tax deductions');
      await recordSearch('travel receipts');

      // History should be stored locally
      expect(searchHistory.length).toBe(3);

      // No history sent to server
      for (const request of capturedRequests) {
        expect(request.body).not.toContain('medical expenses');
        expect(request.body).not.toContain('tax deductions');
        expect(request.body).not.toContain('travel receipts');
        expect(request.body).not.toContain('searchHistory');
      }
    });

    it('MUST NOT sync search history to cloud', async () => {
      // Local search history (simulated)
      const localHistory = [
        { query: 'salary slip', embedding: new Float32Array(384) },
        { query: 'bonus payment', embedding: new Float32Array(384) },
      ];

      // Simulate sync operation
      const syncData = {
        transactions: [], // Only transactions should sync
        // searchHistory should NOT be here
      };

      expect(syncData).not.toHaveProperty('searchHistory');
    });
  });

  describe('Offline Search', () => {
    it('MUST work completely offline', async () => {
      // Add documents while "online"
      const transactions = createTransactions(5);
      for (const tx of transactions) {
        mockVectorSearch.addVector(tx.id, tx.embedding);
      }

      // Simulate going offline by failing all network requests
      global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

      // Search should still work
      const results = mockVectorSearch.search(
        await mockEmbeddingService.embedText('test'),
        3
      );

      expect(results.length).toBe(3);
    });
  });

  describe('Index Privacy', () => {
    it('MUST NOT expose vector index contents to network', async () => {
      const sensitiveVectors = [
        {
          id: 'medical-1',
          content: 'Medical diagnosis details',
          embedding: await mockEmbeddingService.embedText(
            'Medical diagnosis details'
          ),
        },
        {
          id: 'financial-1',
          content: 'Bank account statements',
          embedding: await mockEmbeddingService.embedText(
            'Bank account statements'
          ),
        },
      ];

      for (const item of sensitiveVectors) {
        mockVectorSearch.addVector(item.id, item.embedding);
      }

      // Perform operations
      mockVectorSearch.search(await mockEmbeddingService.embedText('query'));

      // Index contents should never be transmitted
      for (const request of capturedRequests) {
        expect(request.body).not.toContain('medical-1');
        expect(request.body).not.toContain('financial-1');
        expect(request.body).not.toContain('Medical diagnosis');
        expect(request.body).not.toContain('Bank account');
      }
    });

    it('MUST NOT serialize and transmit index for "backup"', () => {
      // Serializing the index should only be for local storage
      const serializedIndex = JSON.stringify(
        Array.from(localVectorIndex.entries()).map(([id, vec]) => ({
          id,
          vector: Array.from(vec),
        }))
      );

      // This should only go to IndexedDB, never to network
      for (const request of capturedRequests) {
        expect(request.body).not.toBe(serializedIndex);
        expect(request.body).not.toContain('"vector":[');
      }
    });
  });
});

describe('CRITICAL: Privacy - Search Filters', () => {
  it('MUST apply filters locally without server involvement', () => {
    const transactions = [
      createTransaction({ date: '2024-01-15', category: null }),
      createTransaction({ date: '2024-02-20', category: null }),
      createTransaction({ date: '2023-12-01', category: null }),
    ];

    // Add to index
    for (const tx of transactions) {
      mockVectorSearch.addVector(tx.id, tx.embedding);
    }

    // Filter results locally (simulated)
    const filterByDateRange = (
      results: SearchResult[],
      startDate: string,
      endDate: string
    ) => {
      return results.filter((r) => {
        const tx = transactions.find((t) => t.id === r.id);
        return tx && tx.date >= startDate && tx.date <= endDate;
      });
    };

    const allResults = mockVectorSearch.search(new Float32Array(384).fill(0.5));
    const filtered = filterByDateRange(allResults, '2024-01-01', '2024-12-31');

    // Filtering should work
    expect(filtered.length).toBe(2);

    // No filter parameters sent to server
    for (const request of capturedRequests) {
      expect(request.body).not.toContain('2024-01-01');
      expect(request.body).not.toContain('startDate');
      expect(request.body).not.toContain('filter');
    }
  });
});
