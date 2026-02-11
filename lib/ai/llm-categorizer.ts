/**
 * LLM-Assisted Transaction Categorizer (Client-Side Service)
 *
 * Calls the /api/categorize-transaction endpoint when the local
 * auto-categorizer returns low confidence (< threshold).
 *
 * Features:
 * - Single and batch categorization
 * - Request deduplication (won't re-request the same vendor)
 * - Result caching (in-memory, session-lifetime)
 * - Graceful degradation (returns null on failure, never throws)
 *
 * PRIVACY: Only structured data (vendor, amount, date, type) is sent.
 * No raw text, embeddings, or documents.
 */

import type { CategoryId } from '@/types/database';

// ============================================
// Types
// ============================================

export interface LLMCategorySuggestion {
  /** Suggested category name from the canonical list */
  categoryName: string;
  /** LLM confidence (0-1) */
  confidence: number;
  /** Brief reason from the LLM */
  reason?: string;
  /** Source marker */
  source: 'llm';
}

export interface CategorizationInput {
  /** Client-side unique id */
  id: string;
  /** Vendor / merchant name */
  vendor: string;
  /** Amount (absolute value) */
  amount: number;
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Transaction type */
  type?: 'debit' | 'credit' | 'fee' | 'refund' | 'payment' | 'interest';
}

interface APIResult {
  id: string;
  category: string;
  confidence: number;
  reason?: string;
}

interface APIResponse {
  results: APIResult[];
  model: string;
  processingTimeMs: number;
}

// ============================================
// Configuration
// ============================================

/** Confidence threshold below which we call the LLM */
export const LLM_CATEGORIZE_THRESHOLD = 0.7;

/** Maximum transactions per batch request */
const MAX_BATCH_SIZE = 50;

/** Cache TTL in ms (30 minutes) */
const CACHE_TTL_MS = 30 * 60 * 1000;

// ============================================
// Service
// ============================================

class LLMCategorizerService {
  /** In-memory cache: vendor (lowercase) → suggestion */
  private cache = new Map<string, { result: LLMCategorySuggestion; timestamp: number }>();

  /** In-flight request deduplication */
  private inflight = new Map<string, Promise<LLMCategorySuggestion | null>>();

  /**
   * Get a category suggestion from the LLM for a single transaction.
   * Returns cached result if available.
   */
  async suggestCategory(
    input: CategorizationInput
  ): Promise<LLMCategorySuggestion | null> {
    const cacheKey = input.vendor.toLowerCase().trim();

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.result;
    }

    // Check in-flight
    const existing = this.inflight.get(cacheKey);
    if (existing) {
      return existing;
    }

    // Make request
    const promise = this.fetchSuggestion(input).then((result) => {
      this.inflight.delete(cacheKey);
      if (result) {
        this.cache.set(cacheKey, { result, timestamp: Date.now() });
      }
      return result;
    });

    this.inflight.set(cacheKey, promise);
    return promise;
  }

  /**
   * Batch-categorize multiple transactions.
   * Returns a Map of input id → suggestion.
   */
  async suggestCategories(
    inputs: CategorizationInput[]
  ): Promise<Map<string, LLMCategorySuggestion>> {
    const results = new Map<string, LLMCategorySuggestion>();

    // Separate cached from uncached
    const uncached: CategorizationInput[] = [];
    for (const input of inputs) {
      const cacheKey = input.vendor.toLowerCase().trim();
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        results.set(input.id, cached.result);
      } else {
        uncached.push(input);
      }
    }

    if (uncached.length === 0) {
      return results;
    }

    // Batch into chunks of MAX_BATCH_SIZE
    for (let i = 0; i < uncached.length; i += MAX_BATCH_SIZE) {
      const batch = uncached.slice(i, i + MAX_BATCH_SIZE);
      try {
        const batchResults = await this.fetchBatch(batch);
        for (const [id, suggestion] of batchResults) {
          results.set(id, suggestion);
          // Also cache by vendor
          const input = batch.find((b) => b.id === id);
          if (input) {
            const cacheKey = input.vendor.toLowerCase().trim();
            this.cache.set(cacheKey, { result: suggestion, timestamp: Date.now() });
          }
        }
      } catch (error) {
        console.error('[LLMCategorizer] Batch request failed:', error);
        // Graceful degradation: uncached items just don't get results
      }
    }

    return results;
  }

  /**
   * Check if the auto-categorizer confidence is below the LLM threshold.
   */
  shouldCallLLM(autoCategorizerConfidence: number): boolean {
    return autoCategorizerConfidence < LLM_CATEGORIZE_THRESHOLD;
  }

  /**
   * Clear the in-memory cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats for debugging.
   */
  getCacheStats(): { size: number; inflightCount: number } {
    return {
      size: this.cache.size,
      inflightCount: this.inflight.size,
    };
  }

  // ============================================
  // Private
  // ============================================

  private async fetchSuggestion(
    input: CategorizationInput
  ): Promise<LLMCategorySuggestion | null> {
    try {
      const response = await fetch('/api/categorize-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: [
            {
              id: input.id,
              vendor: input.vendor,
              amount: input.amount,
              date: input.date,
              type: input.type || 'debit',
            },
          ],
        }),
      });

      if (!response.ok) {
        console.error(
          '[LLMCategorizer] API error:',
          response.status,
          await response.text()
        );
        return null;
      }

      const data = (await response.json()) as APIResponse;
      const result = data.results[0];
      if (!result) return null;

      return {
        categoryName: result.category,
        confidence: result.confidence,
        reason: result.reason,
        source: 'llm',
      };
    } catch (error) {
      console.error('[LLMCategorizer] Fetch error:', error);
      return null;
    }
  }

  private async fetchBatch(
    inputs: CategorizationInput[]
  ): Promise<Map<string, LLMCategorySuggestion>> {
    const results = new Map<string, LLMCategorySuggestion>();

    const response = await fetch('/api/categorize-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions: inputs.map((input) => ({
          id: input.id,
          vendor: input.vendor,
          amount: input.amount,
          date: input.date,
          type: input.type || 'debit',
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = (await response.json()) as APIResponse;
    for (const result of data.results) {
      results.set(result.id, {
        categoryName: result.category,
        confidence: result.confidence,
        reason: result.reason,
        source: 'llm',
      });
    }

    return results;
  }
}

// ============================================
// Singleton Export
// ============================================

export const llmCategorizer = new LLMCategorizerService();
