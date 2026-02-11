/**
 * Auto-Categorizer for Vault-AI
 *
 * Maps vendor/merchant names to spending categories using
 * the Category Registry as the single source of truth.
 *
 * Matching strategy (in priority order):
 * 1. User-learned mappings (highest confidence, from IndexedDB)
 * 2. Registry-based rules with advanced matching:
 *    - Plain keyword: case-insensitive `.includes()` (most keywords)
 *    - Word-boundary: only matches whole words (e.g., "shell" won't match "seashell")
 *    - Exclusions: rejects match if exclude patterns are found (e.g., "shell" + "hotel")
 *
 * PRIVACY: All categorization happens locally in the browser.
 * No vendor data is transmitted to external servers.
 */

import { vendorCategoryLearning } from './vendor-category-learning';
import {
  getVendorRulesMap,
  getAmountHintMap,
  getPreferredTypeMap,
} from '@/lib/categories/category-registry';
import type {
  VendorKeyword,
  VendorPattern,
  AmountHint,
} from '@/lib/categories/category-registry';
import type { CategoryId } from '@/types/database';

// ============================================
// Types
// ============================================

/**
 * Category suggestion result.
 */
export interface CategorySuggestion {
  /** Suggested category name (matches registry canonical name) */
  categoryName: string;

  /** Confidence in the suggestion (0-1) */
  confidence: number;

  /** Matched keyword that triggered the suggestion */
  matchedKeyword: string;

  /** If the suggestion came from user-learned mappings, the direct CategoryId */
  learnedCategoryId?: CategoryId;

  /** Whether this suggestion was from user learning vs default rules */
  isLearned?: boolean;

  /** Signals that contributed to the score (for debugging/UI) */
  signals?: {
    vendorMatch: boolean;
    amountInRange: boolean | null; // null = no hint available
    typeMatch: boolean | null; // null = no hint available
  };
}

/**
 * Optional transaction context for multi-signal scoring.
 * When provided, the auto-categorizer uses amount and type as
 * secondary signals to boost or penalise confidence.
 */
export interface TransactionContext {
  /** Transaction amount (absolute value, in the transaction's currency) */
  amount?: number;
  /** Transaction type */
  type?: 'debit' | 'credit' | 'fee' | 'refund' | 'payment' | 'interest';
  /** Transaction embedding (384-dim) for k-NN fallback */
  embedding?: Float32Array | number[];
}

// ============================================
// Vendor Pattern Matching
// ============================================

/**
 * Test whether a vendor name matches a single VendorKeyword.
 *
 * @param vendorLower - Lowercased, trimmed vendor name
 * @param keyword - The keyword to test (string or VendorPattern)
 * @returns true if the vendor matches the keyword (and no exclusion triggers)
 */
function matchesKeyword(vendorLower: string, keyword: VendorKeyword): boolean {
  if (typeof keyword === 'string') {
    // Simple case-insensitive substring match
    return vendorLower.includes(keyword.toLowerCase());
  }

  // Advanced VendorPattern matching
  const pattern: VendorPattern = keyword;
  const kw = pattern.keyword.toLowerCase();

  if (pattern.wordBoundary) {
    // Match only at word boundaries
    // Build a regex: \bkeyword\b (escape special regex chars in keyword)
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `(?:^|[\\s\\-/,.()])${escaped}(?:$|[\\s\\-/,.()])`,
      'i'
    );
    // Also match if the keyword IS the entire string
    if (vendorLower === kw) {
      // exact match, proceed to exclusion check
    } else if (!regex.test(vendorLower)) {
      return false;
    }
  } else {
    // Standard substring match
    if (!vendorLower.includes(kw)) {
      return false;
    }
  }

  // Check exclusions
  if (pattern.exclude && pattern.exclude.length > 0) {
    for (const excludeStr of pattern.exclude) {
      if (vendorLower.includes(excludeStr.toLowerCase())) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Get the effective keyword string (for confidence calculation and reporting).
 */
function getKeywordString(keyword: VendorKeyword): string {
  return typeof keyword === 'string' ? keyword : keyword.keyword;
}

// ============================================
// Auto-Categorizer Service
// ============================================

/**
 * Auto-categorization service using registry-based vendor matching,
 * enhanced with user-learned corrections.
 */
class AutoCategorizerService {
  /** Cached vendor rules from the category registry */
  private vendorRules: Record<string, VendorKeyword[]> | null = null;
  /** Cached amount hints from the category registry */
  private amountHints: Record<string, AmountHint> | null = null;
  /** Cached preferred types from the category registry */
  private preferredTypes: Record<string, string[]> | null = null;

  /**
   * Initialize the learning subsystem.
   * Should be called once on app startup.
   */
  async initializeLearning(): Promise<void> {
    await vendorCategoryLearning.initialize();
  }

  /**
   * Get vendor rules (lazy-loaded from registry).
   */
  private getRules(): Record<string, VendorKeyword[]> {
    if (!this.vendorRules) {
      this.vendorRules = getVendorRulesMap();
    }
    return this.vendorRules;
  }

  /**
   * Get amount hints (lazy-loaded from registry).
   */
  private getAmountHints(): Record<string, AmountHint> {
    if (!this.amountHints) {
      this.amountHints = getAmountHintMap();
    }
    return this.amountHints;
  }

  /**
   * Get preferred types (lazy-loaded from registry).
   */
  private getPreferredTypes(): Record<string, string[]> {
    if (!this.preferredTypes) {
      this.preferredTypes = getPreferredTypeMap();
    }
    return this.preferredTypes;
  }

  /**
   * Check whether an amount falls within a category's typical range.
   * Returns: true = in range (boost), false = out of range (penalise), null = no hint.
   */
  private checkAmountRange(
    categoryName: string,
    amount: number
  ): boolean | null {
    const hints = this.getAmountHints();
    const hint = hints[categoryName];
    if (!hint) {
      return null;
    }

    const absAmount = Math.abs(amount);
    const inRange =
      (hint.typicalMin === undefined || absAmount >= hint.typicalMin) &&
      (hint.typicalMax === undefined || absAmount <= hint.typicalMax);
    return inRange;
  }

  /**
   * Check whether a transaction type matches a category's preferred types.
   * Returns: true = match (boost), false = mismatch (no change), null = no hint.
   */
  private checkTypeMatch(categoryName: string, txType: string): boolean | null {
    const types = this.getPreferredTypes();
    const preferred = types[categoryName];
    if (!preferred || preferred.length === 0) {
      return null;
    }
    return preferred.includes(txType);
  }

  /**
   * Suggest a category for a vendor name, optionally using multi-signal scoring.
   *
   * Priority order:
   * 1. User-learned mappings (highest confidence)
   * 2. Registry keyword rules with multi-signal scoring (fallback)
   *
   * @param vendor - The vendor/merchant name to categorize
   * @param context - Optional transaction context (amount, type) for multi-signal scoring
   * @returns CategorySuggestion or null if no match
   */
  suggestCategory(
    vendor: string,
    context?: TransactionContext
  ): CategorySuggestion | null {
    if (!vendor || vendor.trim().length === 0) {
      return null;
    }

    // 1. Check learned mappings first (highest priority)
    // Pass amount for amount-aware disambiguation (6D)
    const learned = vendorCategoryLearning.lookup(vendor, context?.amount);
    if (learned) {
      return {
        categoryName: `__learned__`, // Placeholder - resolved by caller via categoryId
        confidence: learned.confidence,
        matchedKeyword: learned.matchedPattern,
        learnedCategoryId: learned.categoryId,
        isLearned: true,
      };
    }

    // 2. Fall back to rule-based matching with multi-signal scoring
    return this.suggestCategoryFromRules(vendor, context);
  }

  /**
   * Suggest a category using only the registry keyword rules (no learning).
   * Optionally applies multi-signal scoring when context is provided.
   */
  suggestCategoryFromRules(
    vendor: string,
    context?: TransactionContext
  ): CategorySuggestion | null {
    if (!vendor || vendor.trim().length === 0) {
      return null;
    }

    const vendorLower = vendor.toLowerCase().trim();
    let bestMatch: CategorySuggestion | null = null;
    const rules = this.getRules();

    for (const [categoryName, keywords] of Object.entries(rules)) {
      for (const keyword of keywords) {
        if (matchesKeyword(vendorLower, keyword)) {
          // Calculate base confidence based on keyword specificity
          const kwStr = getKeywordString(keyword).toLowerCase();
          const specificity = kwStr.length / vendorLower.length;
          let confidence = Math.min(0.95, 0.6 + specificity * 0.35);

          // === Multi-signal scoring ===
          let amountInRange: boolean | null = null;
          let typeMatch: boolean | null = null;

          // Amount-range signal
          if (context?.amount !== undefined) {
            amountInRange = this.checkAmountRange(categoryName, context.amount);
            if (amountInRange === true) {
              // Amount is in typical range → boost confidence
              confidence = Math.min(0.98, confidence + 0.08);
            } else if (amountInRange === false) {
              // Amount is outside typical range → penalise
              confidence = Math.max(0.3, confidence - 0.12);
            }
          }

          // Transaction-type signal
          if (context?.type) {
            typeMatch = this.checkTypeMatch(categoryName, context.type);
            if (typeMatch === true) {
              // Type matches → small boost
              confidence = Math.min(0.98, confidence + 0.04);
            }
            // No penalty for type mismatch — many categories handle both
          }

          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = {
              categoryName,
              confidence,
              matchedKeyword: getKeywordString(keyword),
              isLearned: false,
              signals: {
                vendorMatch: true,
                amountInRange,
                typeMatch,
              },
            };
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Suggest a category with full pipeline including async ML fallbacks.
   *
   * Priority:
   * 1. Learned mappings (sync, highest confidence)
   * 2. Registry keyword rules with multi-signal scoring (sync)
   * 3. Local linear classifier (async, when above are low-confidence)
   * 4. Embedding k-NN classification (async fallback)
   *
   * Use this method when you have an embedding available and can afford
   * the async call. Falls back to `suggestCategory` for the sync portion.
   */
  async suggestCategoryAsync(
    vendor: string,
    context?: TransactionContext
  ): Promise<CategorySuggestion | null> {
    // 1+2: Try sync methods first
    const syncResult = this.suggestCategory(vendor, context);

    // If high confidence or no embedding, return sync result
    if (syncResult && syncResult.confidence >= 0.7) {
      return syncResult;
    }
    if (!context?.embedding) {
      return syncResult;
    }

    // 3: Local linear classifier (fast, trained on user's data)
    try {
      const { localClassifier } = await import('@/lib/ai/local-classifier');
      const classifierResult = await localClassifier.predict(context.embedding);

      if (classifierResult && classifierResult.confidence >= 0.6) {
        // If we had a low-confidence sync result, pick the higher confidence one
        if (
          syncResult &&
          syncResult.confidence >= classifierResult.confidence
        ) {
          return syncResult;
        }

        return {
          categoryName: '__local-classifier__',
          confidence: classifierResult.confidence,
          matchedKeyword: `local-classifier (top: ${classifierResult.confidence.toFixed(2)})`,
          learnedCategoryId: classifierResult.categoryId,
          isLearned: false,
          signals: {
            vendorMatch: false,
            amountInRange: null,
            typeMatch: null,
          },
        };
      }
    } catch (error) {
      console.warn(
        '[AutoCategorizer] Local classifier fallback failed:',
        error
      );
    }

    // 4: k-NN fallback (broader, slower)
    try {
      const { embeddingClassifier } =
        await import('@/lib/ai/embedding-classifier');
      const knnResult = await embeddingClassifier.classify(context.embedding);

      if (knnResult) {
        // If we had a low-confidence sync result, pick the higher confidence one
        if (syncResult && syncResult.confidence >= knnResult.confidence) {
          return syncResult;
        }

        return {
          categoryName: '__knn__', // Resolved by caller via categoryId
          confidence: knnResult.confidence,
          matchedKeyword: `k-NN (${knnResult.voteCount}/${knnResult.k} votes, sim=${knnResult.averageSimilarity})`,
          learnedCategoryId: knnResult.categoryId,
          isLearned: false,
          signals: {
            vendorMatch: false,
            amountInRange: null,
            typeMatch: null,
          },
        };
      }
    } catch (error) {
      console.warn('[AutoCategorizer] k-NN fallback failed:', error);
    }

    return syncResult;
  }

  /**
   * Learn a vendor-category mapping from a user correction.
   * Delegates to the vendor-category learning service.
   */
  async learnCategory(vendor: string, categoryId: CategoryId): Promise<void> {
    await vendorCategoryLearning.learn(vendor, categoryId);
  }

  /**
   * Learn multiple vendor-category mappings at once (batch from statement confirmation).
   */
  async learnCategories(
    mappings: Array<{ vendor: string; categoryId: CategoryId }>
  ): Promise<void> {
    await vendorCategoryLearning.learnBatch(mappings);
  }

  /**
   * Get the number of learned vendor mappings.
   */
  getLearnedCount(): number {
    return vendorCategoryLearning.getMappingCount();
  }

  /**
   * Suggest categories for multiple vendors at once, optionally with per-vendor context.
   *
   * @param vendors - Array of vendor names
   * @param contexts - Optional map of vendor name to transaction context
   * @returns Map of vendor name to category suggestion
   */
  suggestCategories(
    vendors: string[],
    contexts?: Map<string, TransactionContext>
  ): Map<string, CategorySuggestion | null> {
    const results = new Map<string, CategorySuggestion | null>();

    for (const vendor of vendors) {
      const ctx = contexts?.get(vendor);
      results.set(vendor, this.suggestCategory(vendor, ctx));
    }

    return results;
  }

  /**
   * Get all available category names from the registry rules.
   */
  getAvailableCategories(): string[] {
    return Object.keys(this.getRules());
  }
}

// ============================================
// Singleton Export
// ============================================

/**
 * Singleton instance of the auto-categorizer.
 */
export const autoCategorizer = new AutoCategorizerService();

/**
 * Convenience function to suggest a category for a vendor.
 */
export function suggestCategory(vendor: string): CategorySuggestion | null {
  return autoCategorizer.suggestCategory(vendor);
}
