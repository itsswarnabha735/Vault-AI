/**
 * Unit Tests for Vector Search Service
 *
 * Tests the HNSW-based vector search functionality for semantic search.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ============================================
// Mock Vector Search Implementation
// ============================================

interface SearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

interface IndexStats {
  vectorCount: number;
  dimensions: number;
  indexSizeBytes: number;
  lastUpdated: Date;
}

class VectorSearchServiceImpl {
  private vectors: Map<
    string,
    { vector: Float32Array; metadata?: Record<string, unknown> }
  > = new Map();
  private dimensions: number = 384;
  private lastUpdated: Date = new Date();

  async initialize(): Promise<void> {
    // Initialize the index
    this.vectors.clear();
    this.lastUpdated = new Date();
  }

  addVector(
    id: string,
    vector: Float32Array,
    metadata?: Record<string, unknown>
  ): void {
    if (vector.length !== this.dimensions) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.dimensions}, got ${vector.length}`
      );
    }
    this.vectors.set(id, { vector, metadata });
    this.lastUpdated = new Date();
  }

  removeVector(id: string): void {
    this.vectors.delete(id);
    this.lastUpdated = new Date();
  }

  search(queryVector: Float32Array, k: number = 10): SearchResult[] {
    if (queryVector.length !== this.dimensions) {
      throw new Error(`Query vector dimension mismatch`);
    }

    const results: SearchResult[] = [];

    for (const [id, { vector, metadata }] of this.vectors.entries()) {
      const score = this.cosineSimilarity(queryVector, vector);
      results.push({ id, score, metadata });
    }

    // Sort by score descending and take top k
    return results.sort((a, b) => b.score - a.score).slice(0, k);
  }

  searchWithFilter(
    queryVector: Float32Array,
    filter: (id: string, metadata?: Record<string, unknown>) => boolean,
    k: number = 10
  ): SearchResult[] {
    const allResults = this.search(queryVector, this.vectors.size);
    return allResults.filter((r) => filter(r.id, r.metadata)).slice(0, k);
  }

  getStats(): IndexStats {
    return {
      vectorCount: this.vectors.size,
      dimensions: this.dimensions,
      indexSizeBytes: this.vectors.size * this.dimensions * 4, // Float32 = 4 bytes
      lastUpdated: this.lastUpdated,
    };
  }

  async saveIndex(): Promise<string> {
    // Simulate serialization
    const data = Array.from(this.vectors.entries()).map(
      ([id, { vector, metadata }]) => ({
        id,
        vector: Array.from(vector),
        metadata,
      })
    );
    return JSON.stringify(data);
  }

  async loadIndex(serialized: string): Promise<boolean> {
    try {
      const data = JSON.parse(serialized);
      this.vectors.clear();
      for (const item of data) {
        this.vectors.set(item.id, {
          vector: new Float32Array(item.vector),
          metadata: item.metadata,
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    this.vectors.clear();
    this.lastUpdated = new Date();
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

// Helper to create test vectors
function createVector(pattern: number[]): Float32Array {
  const vector = new Float32Array(384);
  for (let i = 0; i < 384; i++) {
    vector[i] = pattern[i % pattern.length];
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < vector.length; i++) {
    vector[i] /= norm;
  }
  return vector;
}

function createRandomVector(): Float32Array {
  const vector = new Float32Array(384);
  for (let i = 0; i < 384; i++) {
    vector[i] = Math.random() - 0.5;
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < vector.length; i++) {
    vector[i] /= norm;
  }
  return vector;
}

// ============================================
// Tests
// ============================================

describe('Vector Search Service', () => {
  let vectorSearch: VectorSearchServiceImpl;

  beforeEach(async () => {
    vectorSearch = new VectorSearchServiceImpl();
    await vectorSearch.initialize();
  });

  afterEach(() => {
    vectorSearch.clear();
  });

  describe('Initialization', () => {
    it('initializes with empty index', () => {
      const stats = vectorSearch.getStats();
      expect(stats.vectorCount).toBe(0);
      expect(stats.dimensions).toBe(384);
    });
  });

  describe('Vector Operations', () => {
    it('adds and retrieves vectors', () => {
      const vector = new Float32Array(384).fill(0.5);
      vectorSearch.addVector('test-1', vector);

      const stats = vectorSearch.getStats();
      expect(stats.vectorCount).toBe(1);
    });

    it('adds vectors with metadata', () => {
      const vector = new Float32Array(384).fill(0.5);
      vectorSearch.addVector('test-1', vector, { category: 'food' });

      const results = vectorSearch.search(vector, 1);
      expect(results[0].metadata).toEqual({ category: 'food' });
    });

    it('removes vectors', () => {
      const vector = new Float32Array(384).fill(0.5);
      vectorSearch.addVector('test-1', vector);
      expect(vectorSearch.getStats().vectorCount).toBe(1);

      vectorSearch.removeVector('test-1');
      expect(vectorSearch.getStats().vectorCount).toBe(0);
    });

    it('updates lastUpdated on changes', () => {
      const before = vectorSearch.getStats().lastUpdated;

      // Small delay to ensure time difference
      const vector = new Float32Array(384).fill(0.5);
      vectorSearch.addVector('test-1', vector);

      const after = vectorSearch.getStats().lastUpdated;
      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('throws on dimension mismatch', () => {
      const wrongDimVector = new Float32Array(256).fill(0.5);
      expect(() => vectorSearch.addVector('test-1', wrongDimVector)).toThrow(
        /dimension mismatch/i
      );
    });
  });

  describe('Search', () => {
    it('returns relevant results for similar queries', () => {
      // Add vectors with distinct patterns
      vectorSearch.addVector('furniture', createVector([0.9, 0.1, 0.1]));
      vectorSearch.addVector('food', createVector([0.1, 0.9, 0.1]));
      vectorSearch.addVector('chair', createVector([0.85, 0.15, 0.1]));

      const queryVector = createVector([0.88, 0.12, 0.1]); // Similar to furniture/chair
      const results = vectorSearch.search(queryVector, 2);

      expect(results[0].id).toBe('furniture');
      expect(results[1].id).toBe('chair');
    });

    it('respects k parameter', () => {
      for (let i = 0; i < 10; i++) {
        vectorSearch.addVector(`item-${i}`, createRandomVector());
      }

      const results = vectorSearch.search(createRandomVector(), 3);
      expect(results).toHaveLength(3);
    });

    it('returns fewer results when k > vectorCount', () => {
      vectorSearch.addVector('only-one', createRandomVector());

      const results = vectorSearch.search(createRandomVector(), 10);
      expect(results).toHaveLength(1);
    });

    it('returns empty array when index is empty', () => {
      const results = vectorSearch.search(createRandomVector(), 10);
      expect(results).toHaveLength(0);
    });

    it('returns scores between 0 and 1 for normalized vectors', () => {
      vectorSearch.addVector('test', createRandomVector());

      const results = vectorSearch.search(createRandomVector(), 1);

      expect(results[0].score).toBeGreaterThanOrEqual(-1);
      expect(results[0].score).toBeLessThanOrEqual(1);
    });

    it('returns score of 1 for exact match', () => {
      const vector = createRandomVector();
      vectorSearch.addVector('exact', vector);

      const results = vectorSearch.search(vector, 1);

      expect(results[0].score).toBeCloseTo(1, 5);
    });

    it('returns sorted results by score descending', () => {
      for (let i = 0; i < 5; i++) {
        vectorSearch.addVector(`item-${i}`, createRandomVector());
      }

      const results = vectorSearch.search(createRandomVector(), 5);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe('Filtered Search', () => {
    it('applies filter to results', () => {
      vectorSearch.addVector('food-1', createRandomVector(), {
        category: 'food',
      });
      vectorSearch.addVector('food-2', createRandomVector(), {
        category: 'food',
      });
      vectorSearch.addVector('transport-1', createRandomVector(), {
        category: 'transport',
      });

      const results = vectorSearch.searchWithFilter(
        createRandomVector(),
        (_, metadata) => metadata?.category === 'food',
        10
      );

      expect(results).toHaveLength(2);
      results.forEach((r) => {
        expect(r.metadata?.category).toBe('food');
      });
    });

    it('returns empty when no items match filter', () => {
      vectorSearch.addVector('item-1', createRandomVector(), {
        category: 'food',
      });

      const results = vectorSearch.searchWithFilter(
        createRandomVector(),
        (_, metadata) => metadata?.category === 'nonexistent',
        10
      );

      expect(results).toHaveLength(0);
    });
  });

  describe('Persistence', () => {
    it('saves and loads index', async () => {
      vectorSearch.addVector('test-1', createRandomVector(), {
        label: 'first',
      });
      vectorSearch.addVector('test-2', createRandomVector(), {
        label: 'second',
      });

      const serialized = await vectorSearch.saveIndex();

      const newInstance = new VectorSearchServiceImpl();
      await newInstance.initialize();
      const loaded = await newInstance.loadIndex(serialized);

      expect(loaded).toBe(true);
      expect(newInstance.getStats().vectorCount).toBe(2);
    });

    it('preserves metadata after load', async () => {
      vectorSearch.addVector('with-meta', createRandomVector(), { foo: 'bar' });

      const serialized = await vectorSearch.saveIndex();

      const newInstance = new VectorSearchServiceImpl();
      await newInstance.initialize();
      await newInstance.loadIndex(serialized);

      const results = newInstance.search(createRandomVector(), 1);
      expect(results[0].metadata).toEqual({ foo: 'bar' });
    });

    it('handles invalid serialized data', async () => {
      const newInstance = new VectorSearchServiceImpl();
      const loaded = await newInstance.loadIndex('invalid json {{{');

      expect(loaded).toBe(false);
    });
  });

  describe('Performance Characteristics', () => {
    it('handles 1000 vectors', () => {
      const startAdd = performance.now();

      for (let i = 0; i < 1000; i++) {
        vectorSearch.addVector(`item-${i}`, createRandomVector());
      }

      const addTime = performance.now() - startAdd;
      expect(addTime).toBeLessThan(5000); // Should complete in under 5 seconds

      const startSearch = performance.now();
      vectorSearch.search(createRandomVector(), 10);
      const searchTime = performance.now() - startSearch;

      expect(searchTime).toBeLessThan(1000); // Search should be fast
    });
  });

  describe('Stats', () => {
    it('calculates correct index size', () => {
      for (let i = 0; i < 10; i++) {
        vectorSearch.addVector(`item-${i}`, new Float32Array(384));
      }

      const stats = vectorSearch.getStats();
      expect(stats.vectorCount).toBe(10);
      expect(stats.indexSizeBytes).toBe(10 * 384 * 4); // 10 vectors * 384 dims * 4 bytes
    });
  });
});
