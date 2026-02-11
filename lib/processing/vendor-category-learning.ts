/**
 * Vendor-Category Learning Service for Vault-AI
 *
 * Persists user category corrections so future imports of the same
 * vendor are automatically categorized correctly.
 *
 * Learning happens when:
 * - User manually changes a category in ExtractionCard (receipt/invoice)
 * - User manually changes a category in StatementReview (statement)
 *
 * Learned mappings take priority over the default rule-based auto-categorizer.
 *
 * PRIVACY: All learned mappings are stored locally in IndexedDB.
 * Vendor names and category mappings NEVER leave the device.
 */

import { db } from '@/lib/storage/db';
import type { CategoryId } from '@/types/database';

// ============================================
// Types
// ============================================

/**
 * A learned vendor-to-category mapping.
 */
export interface VendorCategoryMapping {
  /** Unique identifier */
  id: string;

  /** Normalized vendor name (lowercase, trimmed) */
  vendorPattern: string;

  /** The category the user assigned */
  categoryId: CategoryId;

  /** Number of times this mapping was used/confirmed */
  usageCount: number;

  /**
   * Optional amount range for amount-aware disambiguation (6D).
   * When set, this mapping only activates when the transaction
   * amount falls within [amountMin, amountMax].
   *
   * A null range means "any amount" (the default behaviour).
   */
  amountMin?: number | null;
  amountMax?: number | null;

  /** When the mapping was first created */
  createdAt: Date;

  /** When the mapping was last used/updated */
  updatedAt: Date;
}

/**
 * Lookup result from learned categories.
 */
export interface LearnedCategorySuggestion {
  /** The matched category ID */
  categoryId: CategoryId;

  /** The vendor pattern that matched */
  matchedPattern: string;

  /** How many times this mapping was confirmed */
  usageCount: number;

  /** Confidence boost from learning (higher = more confirmed) */
  confidence: number;
}

// ============================================
// Vendor Category Learning Service
// ============================================

class VendorCategoryLearningService {
  /** General (non-ranged) vendor → mapping cache */
  private cache: Map<string, VendorCategoryMapping> = new Map();
  /** Amount-ranged mappings: id → mapping (keyed by mapping ID for dedup) */
  private amountRangedCache: Map<string, VendorCategoryMapping> = new Map();
  private initialized = false;

  /**
   * Initialize the service by loading all mappings into memory.
   * Call this once at app startup or first use.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const mappings = await db.vendorCategories.toArray();
      this.cache.clear();
      this.amountRangedCache.clear();

      for (const mapping of mappings) {
        if (mapping.amountMin != null || mapping.amountMax != null) {
          // Amount-ranged mapping
          this.amountRangedCache.set(mapping.id, mapping);
        } else {
          // General mapping (keyed by vendor pattern, last-write-wins)
          this.cache.set(mapping.vendorPattern, mapping);
        }
      }

      this.initialized = true;
      const totalCount = this.cache.size + this.amountRangedCache.size;
      console.log(
        `[VendorLearning] Loaded ${totalCount} mappings (${this.cache.size} general, ${this.amountRangedCache.size} amount-ranged)`
      );
    } catch (error) {
      console.error('[VendorLearning] Failed to load mappings:', error);
      // Graceful degradation - service works without cache
      this.initialized = true;
    }
  }

  /**
   * Look up a learned category for a vendor name.
   * Returns null if no learned mapping exists.
   *
   * Uses progressive matching:
   * 1. Exact match on normalized name (with amount-range check)
   * 2. Prefix match (vendor starts with a known pattern)
   * 3. Contains match (vendor contains a known pattern)
   *
   * @param vendor - Vendor name
   * @param amount - Optional transaction amount for amount-aware disambiguation
   */
  lookup(vendor: string, amount?: number): LearnedCategorySuggestion | null {
    if (!vendor || vendor.trim().length === 0) {
      return null;
    }

    const normalized = this.normalizeVendor(vendor);
    const absAmount = amount !== undefined ? Math.abs(amount) : undefined;

    // 1. Check amount-ranged mappings first (most specific)
    if (absAmount !== undefined) {
      for (const [, mapping] of this.amountRangedCache) {
        if (mapping.vendorPattern !== normalized) {
          continue;
        }
        if (this.amountInRange(absAmount, mapping)) {
          return {
            categoryId: mapping.categoryId,
            matchedPattern: mapping.vendorPattern,
            usageCount: mapping.usageCount,
            confidence: Math.min(0.99, 0.9 + mapping.usageCount * 0.02),
          };
        }
      }
    }

    // 2. Exact match (highest confidence for non-ranged)
    const exact = this.cache.get(normalized);
    if (exact) {
      return {
        categoryId: exact.categoryId,
        matchedPattern: exact.vendorPattern,
        usageCount: exact.usageCount,
        confidence: Math.min(0.99, 0.85 + exact.usageCount * 0.02),
      };
    }

    // 3. Prefix/contains match (lower confidence)
    let bestMatch: VendorCategoryMapping | null = null;
    let bestMatchLength = 0;

    for (const [pattern, mapping] of this.cache) {
      // Vendor contains the learned pattern (or pattern contains vendor)
      if (normalized.includes(pattern) || pattern.includes(normalized)) {
        // Prefer longer pattern matches (more specific)
        if (pattern.length > bestMatchLength) {
          bestMatch = mapping;
          bestMatchLength = pattern.length;
        }
      }
    }

    if (bestMatch) {
      const specificity = bestMatchLength / normalized.length;
      return {
        categoryId: bestMatch.categoryId,
        matchedPattern: bestMatch.vendorPattern,
        usageCount: bestMatch.usageCount,
        confidence: Math.min(
          0.9,
          0.65 + specificity * 0.2 + bestMatch.usageCount * 0.01
        ),
      };
    }

    return null;
  }

  /**
   * Check if an amount falls within a mapping's range.
   */
  private amountInRange(
    amount: number,
    mapping: VendorCategoryMapping
  ): boolean {
    if (mapping.amountMin != null && amount < mapping.amountMin) {
      return false;
    }
    if (mapping.amountMax != null && amount > mapping.amountMax) {
      return false;
    }
    return true;
  }

  /**
   * Learn a vendor-category mapping from a user correction.
   *
   * When the same vendor is assigned different categories at different
   * amounts, amount-ranged mappings are automatically created (6D).
   *
   * @param vendor - The vendor name
   * @param categoryId - The category the user selected
   * @param amount - Optional transaction amount (for amount-aware learning)
   */
  async learn(
    vendor: string,
    categoryId: CategoryId,
    amount?: number
  ): Promise<void> {
    if (!vendor || vendor.trim().length === 0 || !categoryId) {
      return;
    }

    const normalized = this.normalizeVendor(vendor);
    const now = new Date();
    const absAmount = amount !== undefined ? Math.abs(amount) : undefined;

    try {
      const existing = this.cache.get(normalized);

      if (existing) {
        if (existing.categoryId === categoryId) {
          // Same category - just increment usage count
          const updated: VendorCategoryMapping = {
            ...existing,
            usageCount: existing.usageCount + 1,
            updatedAt: now,
          };
          await db.vendorCategories.put(updated);
          this.cache.set(normalized, updated);
        } else if (absAmount !== undefined) {
          // DIFFERENT category for the same vendor + we have an amount:
          // Create an amount-ranged mapping (6D).
          // The old mapping stays as the "general" fallback; the new one
          // is range-specific.
          const rangedMapping: VendorCategoryMapping = {
            id: `vcm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            vendorPattern: normalized,
            categoryId,
            usageCount: 1,
            amountMin: Math.max(0, absAmount * 0.5), // ±50% tolerance
            amountMax: absAmount * 1.5,
            createdAt: now,
            updatedAt: now,
          };
          await db.vendorCategories.add(rangedMapping);
          this.amountRangedCache.set(rangedMapping.id, rangedMapping);
        } else {
          // Different category, no amount → overwrite the general mapping
          const updated: VendorCategoryMapping = {
            ...existing,
            categoryId,
            usageCount: 1,
            updatedAt: now,
          };
          await db.vendorCategories.put(updated);
          this.cache.set(normalized, updated);
        }
      } else {
        // New mapping
        const mapping: VendorCategoryMapping = {
          id: `vcm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          vendorPattern: normalized,
          categoryId,
          usageCount: 1,
          createdAt: now,
          updatedAt: now,
        };
        await db.vendorCategories.add(mapping);
        this.cache.set(normalized, mapping);
      }
    } catch (error) {
      console.error('[VendorLearning] Failed to save mapping:', error);
    }
  }

  /**
   * Learn multiple vendor-category mappings at once (batch save from statements).
   */
  async learnBatch(
    mappings: Array<{ vendor: string; categoryId: CategoryId }>
  ): Promise<void> {
    for (const { vendor, categoryId } of mappings) {
      await this.learn(vendor, categoryId);
    }
  }

  /**
   * Get all learned mappings (for settings/debug UI).
   */
  async getAllMappings(): Promise<VendorCategoryMapping[]> {
    try {
      return await db.vendorCategories.toArray();
    } catch {
      return Array.from(this.cache.values());
    }
  }

  /**
   * Delete a specific learned mapping.
   */
  async deleteMapping(id: string): Promise<void> {
    try {
      const mapping = await db.vendorCategories.get(id);
      if (mapping) {
        await db.vendorCategories.delete(id);
        this.cache.delete(mapping.vendorPattern);
      }
    } catch (error) {
      console.error('[VendorLearning] Failed to delete mapping:', error);
    }
  }

  /**
   * Clear all learned mappings.
   */
  async clearAll(): Promise<void> {
    try {
      await db.vendorCategories.clear();
      this.cache.clear();
      this.amountRangedCache.clear();
    } catch (error) {
      console.error('[VendorLearning] Failed to clear mappings:', error);
    }
  }

  /**
   * Get the number of learned mappings (general + amount-ranged).
   */
  getMappingCount(): number {
    return this.cache.size + this.amountRangedCache.size;
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Normalize a vendor name. Delegates to the exported standalone
   * normalizeVendor() function so the same logic can be used in
   * DB migrations.
   */
  private normalizeVendor(vendor: string): string {
    return normalizeVendor(vendor);
  }
}

// ============================================
// Standalone Vendor Normalization
// ============================================

/**
 * Normalize a vendor name for consistent matching.
 *
 * Exported so it can be used in DB migrations to re-normalize
 * existing vendor patterns when the normalization logic changes.
 *
 * Performs aggressive normalization to ensure that the same merchant
 * maps to the same key regardless of how the bank/card formats it.
 * Examples:
 *   "STARBUCKS COFFEE #1234"    → "starbucks coffee"
 *   "UPI/swiggy@yespay/..."     → "swiggy"
 *   "AMZN MKTP IN*AB1234"       → "amazon"
 *   "UBER *TRIP HELP.UBER.COM"  → "uber"
 *   "NEFT-HDFCN...-JIO PLAT..."→ "jio platforms"
 */
export function normalizeVendor(vendor: string): string {
  let v = vendor.toLowerCase().trim();

  // ---- Strip structured transaction prefixes ----

  // UPI format: UPI/merchant@bank/... → extract merchant
  const upiMatch = v.match(/^upi\/([^/@]+)/);
  if (upiMatch?.[1]) {
    v = upiMatch[1]
      .replace(/\.\w+$/, '') // Remove trailing .razorpay etc.
      .replace(/[._-]/g, ' ') // Convert separators to spaces
      .replace(/\d{5,}/g, '') // Remove long number sequences
      .trim();
  }

  // NEFT dash format: NEFT-REF-COMPANY NAME123-... → extract company
  if (v.startsWith('neft-') || v.startsWith('rtgs-')) {
    const parts = v.split('-');
    for (let i = 2; i < parts.length; i++) {
      const part = (parts[i] || '').trim();
      if (/^[a-z]/i.test(part) && part.length > 2) {
        v = part.replace(/\d{3,}.*$/, '').trim();
        break;
      }
    }
  }

  // NEFT/IMPS/ACH slash format: PREFIX/entity/ref → extract entity
  if (/^(?:neft|imps|ach|rtgs)\//.test(v)) {
    const parts = v.split('/');
    v = (parts[1] || '').trim() || v;
  }

  // Strip remaining prefix markers
  v = v.replace(
    /^(?:pos|ecom|imps|neft|rtgs|upi|nach|ecs|ach|atm|bil|onl)\s*[-/]?\s*/i,
    ''
  );

  // ---- Handle known abbreviation patterns ----

  // Amazon variants: "AMZN MKTP", "AMZN.COM", "AMZ*"
  if (/\bamzn\b|amazon/i.test(v)) {
    v = v
      .replace(/\bamzn\s*mktp\b/gi, 'amazon')
      .replace(/\bamzn\.?com?\b/gi, 'amazon')
      .replace(/\bamzn\b/gi, 'amazon');
  }

  // Uber variants: "UBER *TRIP", "UBER   EATS", "UBER.COM"
  if (/\buber\b/i.test(v)) {
    v = v.replace(/\buber\s*\*\s*/gi, 'uber ');
  }

  // ---- General cleanup ----

  v = v
    // Remove UPI VPA patterns (name@bank)
    .replace(/\S+@\S+/g, '')
    // Remove store/location numbers: #1234, *5678, T-2341
    .replace(/[#*]\s*\d+/g, '')
    .replace(/\bT-?\d{3,}/g, '')
    // Remove card references: XXXX1234, Card 5678
    .replace(/(?:xxxx|card)\s*\d{4}/gi, '')
    // Remove reference/auth codes
    .replace(/\s+(?:ref|auth|conf|txn|id|arn)[\s#:]*[\w-]+$/i, '')
    // Remove long alphanumeric strings (12+ chars, likely IDs)
    .replace(/\b[a-z0-9]{12,}\b/gi, '')
    // Remove trailing numeric sequences (9+ digits)
    .replace(/\b\d{9,}\b/g, '')
    // Remove trailing country/state codes (2 uppercase letters at end)
    .replace(/\s+[a-z]{2}\s*$/i, '')
    // Remove city/zip at end
    .replace(/\s+[a-z]{2}\s+\d{5}(-\d{4})?\s*$/i, '')
    // Remove trailing asterisks, hashes, slashes
    .replace(/[*#/\-.,;:!]+$/g, '')
    .replace(/^[*#/\-.,;:!]+/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();

  return v;
}

// ============================================
// Singleton Export
// ============================================

/**
 * Singleton instance of the vendor-category learning service.
 */
export const vendorCategoryLearning = new VendorCategoryLearningService();
