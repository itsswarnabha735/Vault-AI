/**
 * Embedding-Based k-NN Category Classifier (4A/4B)
 *
 * Uses the existing 384-dim embeddings (all-MiniLM-L6-v2) stored on each
 * transaction to classify uncategorized transactions via k-nearest-neighbour
 * majority voting.
 *
 * How it works:
 * 1. Loads all categorised transactions with embeddings from IndexedDB.
 * 2. For a new / uncategorised transaction, computes cosine similarity
 *    against all labelled embeddings.
 * 3. Takes the K nearest neighbours and performs weighted majority voting
 *    on their categories.
 * 4. Returns a suggestion with confidence derived from the vote margin
 *    and average similarity of the winning category.
 *
 * Falls back gracefully when:
 * - There are fewer than MIN_LABELED_TRANSACTIONS labelled transactions.
 * - The winning category's average similarity is below MIN_SIMILARITY.
 *
 * PRIVACY: All computation is local. Embeddings never leave the device.
 */

import { db } from '@/lib/storage/db';
import { cosineSimilarity } from '@/lib/storage/vector-search';
import type { CategoryId } from '@/types/database';

// ============================================
// Types
// ============================================

export interface EmbeddingClassifierResult {
  /** Suggested category ID */
  categoryId: CategoryId;

  /** Confidence score (0-1) */
  confidence: number;

  /** Average cosine similarity of the K neighbours that voted for this category */
  averageSimilarity: number;

  /** Number of neighbours that voted for this category */
  voteCount: number;

  /** Total neighbours considered */
  k: number;

  /** Source: 'knn' */
  source: 'knn';
}

interface LabelledVector {
  id: string;
  embedding: Float32Array;
  categoryId: CategoryId;
}

// ============================================
// Configuration
// ============================================

/** Number of nearest neighbours to consider */
const DEFAULT_K = 7;

/** Minimum labelled transactions needed before the classifier activates */
const MIN_LABELED_TRANSACTIONS = 10;

/** Minimum average similarity for the winning category to be accepted */
const MIN_SIMILARITY = 0.35;

/** Cache TTL for the labelled vectors */
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ============================================
// Helpers
// ============================================

/**
 * Check whether an embedding is a real (non-zero) vector.
 *
 * Many transactions are stored with zero-filled Float32Array(384) as a
 * placeholder (statement imports, cloud sync, CSV imports).  These must
 * be excluded from classification / training to avoid polluting results.
 */
export function isRealEmbedding(
  embedding: Float32Array | number[] | null | undefined
): embedding is Float32Array | number[] {
  if (!embedding || embedding.length !== 384) {
    return false;
  }

  // Quick check: if the first, middle, and last values are all 0 do a full scan
  if (embedding[0] === 0 && embedding[191] === 0 && embedding[383] === 0) {
    // Full scan — reject if every element is 0
    for (let i = 0; i < embedding.length; i++) {
      if (embedding[i] !== 0) {
        return true;
      }
    }
    return false;
  }

  return true;
}

// ============================================
// Classifier Service
// ============================================

class EmbeddingClassifierService {
  private labelledVectors: LabelledVector[] = [];
  private lastCacheTime = 0;
  private isLoading = false;

  /**
   * Classify a single transaction by its embedding.
   *
   * @param embedding - The 384-dim embedding of the transaction
   * @param k - Number of nearest neighbours (default 7)
   * @returns Classification result or null if insufficient data
   */
  async classify(
    embedding: Float32Array | number[],
    k = DEFAULT_K
  ): Promise<EmbeddingClassifierResult | null> {
    await this.ensureLoaded();

    if (this.labelledVectors.length < MIN_LABELED_TRANSACTIONS) {
      return null;
    }

    // Reject zero-filled query embeddings
    if (!isRealEmbedding(embedding)) {
      return null;
    }

    const queryVec =
      embedding instanceof Float32Array
        ? embedding
        : new Float32Array(embedding);

    // Compute similarities
    const similarities: Array<{
      categoryId: CategoryId;
      similarity: number;
    }> = [];

    for (const lv of this.labelledVectors) {
      const sim = cosineSimilarity(queryVec, lv.embedding);
      similarities.push({ categoryId: lv.categoryId, similarity: sim });
    }

    // Sort by similarity descending
    similarities.sort((a, b) => b.similarity - a.similarity);

    // Take top K
    const topK = similarities.slice(0, k);

    // Weighted majority vote
    const votes = new Map<
      CategoryId,
      { totalWeight: number; count: number; totalSimilarity: number }
    >();

    for (const { categoryId, similarity } of topK) {
      // Weight = similarity^2 (emphasise closer neighbours)
      const weight = similarity * similarity;
      const existing = votes.get(categoryId);
      if (existing) {
        existing.totalWeight += weight;
        existing.count += 1;
        existing.totalSimilarity += similarity;
      } else {
        votes.set(categoryId, {
          totalWeight: weight,
          count: 1,
          totalSimilarity: similarity,
        });
      }
    }

    // Find winner
    let winner: {
      categoryId: CategoryId;
      totalWeight: number;
      count: number;
      totalSimilarity: number;
    } | null = null;

    for (const [categoryId, info] of votes) {
      if (!winner || info.totalWeight > winner.totalWeight) {
        winner = { categoryId, ...info };
      }
    }

    if (!winner) {
      return null;
    }

    const avgSimilarity = winner.totalSimilarity / winner.count;

    // Reject if similarity is too low
    if (avgSimilarity < MIN_SIMILARITY) {
      return null;
    }

    // Confidence = f(vote proportion, average similarity)
    const voteProportion = winner.count / topK.length;
    const confidence = Math.min(
      0.95,
      voteProportion * 0.5 + avgSimilarity * 0.5
    );

    return {
      categoryId: winner.categoryId,
      confidence,
      averageSimilarity: Math.round(avgSimilarity * 1000) / 1000,
      voteCount: winner.count,
      k: topK.length,
      source: 'knn',
    };
  }

  /**
   * Classify multiple transactions in batch.
   *
   * @param embeddings - Map of transaction ID → embedding
   * @param k - Number of nearest neighbours
   * @returns Map of transaction ID → result (only for those with a result)
   */
  async classifyBatch(
    embeddings: Map<string, Float32Array | number[]>,
    k = DEFAULT_K
  ): Promise<Map<string, EmbeddingClassifierResult>> {
    await this.ensureLoaded();

    const results = new Map<string, EmbeddingClassifierResult>();
    for (const [txId, emb] of embeddings) {
      const result = await this.classify(emb, k);
      if (result) {
        results.set(txId, result);
      }
    }
    return results;
  }

  /**
   * Compute category centroids (4A) for analytics/visualization.
   * Returns average embedding per category.
   */
  async computeCentroids(): Promise<
    Map<CategoryId, { centroid: Float32Array; count: number }>
  > {
    await this.ensureLoaded();

    const accumulator = new Map<
      CategoryId,
      { sum: Float32Array; count: number }
    >();

    for (const lv of this.labelledVectors) {
      const existing = accumulator.get(lv.categoryId);
      if (existing) {
        // Add element-wise
        for (let i = 0; i < 384; i++) {
          existing.sum[i]! += lv.embedding[i]!;
        }
        existing.count += 1;
      } else {
        accumulator.set(lv.categoryId, {
          sum: new Float32Array(lv.embedding),
          count: 1,
        });
      }
    }

    const centroids = new Map<
      CategoryId,
      { centroid: Float32Array; count: number }
    >();

    for (const [catId, { sum, count }] of accumulator) {
      const centroid = new Float32Array(384);
      for (let i = 0; i < 384; i++) {
        centroid[i] = sum[i]! / count;
      }
      centroids.set(catId, { centroid, count });
    }

    return centroids;
  }

  /**
   * Get the number of labelled vectors currently loaded.
   */
  getLabelledCount(): number {
    return this.labelledVectors.length;
  }

  /**
   * Force reload labelled vectors.
   */
  invalidateCache(): void {
    this.lastCacheTime = 0;
  }

  // ============================================
  // Private
  // ============================================

  private async ensureLoaded(): Promise<void> {
    if (
      this.labelledVectors.length > 0 &&
      Date.now() - this.lastCacheTime < CACHE_TTL_MS
    ) {
      return;
    }
    if (this.isLoading) {
      // Wait for in-flight load
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (!this.isLoading) {
            clearInterval(interval);
            resolve();
          }
        }, 50);
      });
      return;
    }

    this.isLoading = true;
    try {
      const transactions = await db.transactions.toArray();
      const vectors: LabelledVector[] = [];

      for (const tx of transactions) {
        // Only include transactions with a category AND a real (non-zero) embedding.
        // Zero-filled embeddings (from statement imports, cloud sync, etc.)
        // must be excluded to avoid polluting k-NN results.
        if (!tx.category || !isRealEmbedding(tx.embedding)) {
          continue;
        }
        vectors.push({
          id: tx.id,
          embedding: tx.embedding as Float32Array,
          categoryId: tx.category,
        });
      }

      this.labelledVectors = vectors;
      this.lastCacheTime = Date.now();
      console.log(
        `[EmbeddingClassifier] Loaded ${vectors.length} labelled vectors for k-NN`
      );
    } catch (error) {
      console.error('[EmbeddingClassifier] Failed to load vectors:', error);
    } finally {
      this.isLoading = false;
    }
  }
}

// ============================================
// Singleton Export
// ============================================

export const embeddingClassifier = new EmbeddingClassifierService();
