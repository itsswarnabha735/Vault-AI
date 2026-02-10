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
  private cache: Map<string, VendorCategoryMapping> = new Map();
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
      for (const mapping of mappings) {
        this.cache.set(mapping.vendorPattern, mapping);
      }
      this.initialized = true;
      console.log(
        `[VendorLearning] Loaded ${mappings.length} learned vendor-category mappings`
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
   * 1. Exact match on normalized name
   * 2. Prefix match (vendor starts with a known pattern)
   * 3. Contains match (vendor contains a known pattern)
   */
  lookup(vendor: string): LearnedCategorySuggestion | null {
    if (!vendor || vendor.trim().length === 0) {
      return null;
    }

    const normalized = this.normalizeVendor(vendor);

    // 1. Exact match (highest confidence)
    const exact = this.cache.get(normalized);
    if (exact) {
      return {
        categoryId: exact.categoryId,
        matchedPattern: exact.vendorPattern,
        usageCount: exact.usageCount,
        confidence: Math.min(0.99, 0.85 + exact.usageCount * 0.02),
      };
    }

    // 2. Prefix/contains match (lower confidence)
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
   * Learn a vendor-category mapping from a user correction.
   *
   * @param vendor - The vendor name
   * @param categoryId - The category the user selected
   */
  async learn(vendor: string, categoryId: CategoryId): Promise<void> {
    if (!vendor || vendor.trim().length === 0 || !categoryId) {
      return;
    }

    const normalized = this.normalizeVendor(vendor);
    const now = new Date();

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
        } else {
          // Different category - update the mapping
          const updated: VendorCategoryMapping = {
            ...existing,
            categoryId,
            usageCount: 1, // Reset count for new category
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
    } catch (error) {
      console.error('[VendorLearning] Failed to clear mappings:', error);
    }
  }

  /**
   * Get the number of learned mappings.
   */
  getMappingCount(): number {
    return this.cache.size;
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Normalize a vendor name for consistent matching.
   */
  private normalizeVendor(vendor: string): string {
    return vendor
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/[#*]+\d+$/g, '') // Remove store numbers
      .replace(/\s+$/, '') // Trim trailing spaces
      .replace(/[.,;:!]+$/, ''); // Remove trailing punctuation
  }
}

// ============================================
// Singleton Export
// ============================================

/**
 * Singleton instance of the vendor-category learning service.
 */
export const vendorCategoryLearning = new VendorCategoryLearningService();
