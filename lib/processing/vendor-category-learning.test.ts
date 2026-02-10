/**
 * Unit Tests for Vendor-Category Learning Service
 *
 * Tests the vendor-category learning system's ability to:
 * - Initialize by loading mappings from IndexedDB
 * - Look up learned categories with exact, prefix, and contains matching
 * - Learn new vendor-category mappings
 * - Update existing mappings (same or different category)
 * - Batch learn from statement imports
 * - Delete and clear learned mappings
 * - Normalize vendor names consistently
 * - Calculate confidence scores based on usage and specificity
 *
 * PRIVACY: All tests verify that data stays in IndexedDB (local only).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CategoryId } from '@/types/database';

// Internal data store for the mock
const _mockData: Array<{
  id: string;
  vendorPattern: string;
  categoryId: string;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}> = [];

// We need to mock the database before importing the service
vi.mock('@/lib/storage/db', () => {
  return {
    db: {
      vendorCategories: {
        toArray: vi.fn(() => Promise.resolve([..._mockData])),
        add: vi.fn((item: (typeof _mockData)[0]) => {
          _mockData.push(item);
          return Promise.resolve();
        }),
        put: vi.fn((item: (typeof _mockData)[0]) => {
          const idx = _mockData.findIndex((d) => d.id === item.id);
          if (idx >= 0) {
            _mockData[idx] = item;
          } else {
            _mockData.push(item);
          }
          return Promise.resolve();
        }),
        get: vi.fn((id: string) => {
          return Promise.resolve(
            _mockData.find((d) => d.id === id) || undefined
          );
        }),
        delete: vi.fn((id: string) => {
          const idx = _mockData.findIndex((d) => d.id === id);
          if (idx >= 0) {
            _mockData.splice(idx, 1);
          }
          return Promise.resolve();
        }),
        clear: vi.fn(() => {
          _mockData.length = 0;
          return Promise.resolve();
        }),
      },
    },
  };
});

// Import after mock setup
import { vendorCategoryLearning } from './vendor-category-learning';
import { db } from '@/lib/storage/db';

// Helper to create a CategoryId
const catId = (id: string) => id as CategoryId;

// ============================================
// Test Setup
// ============================================

describe('Vendor-Category Learning Service', () => {
  beforeEach(async () => {
    // Reset mock data store
    _mockData.length = 0;

    // Force re-initialization by resetting internal state
    const service = vendorCategoryLearning as unknown as {
      cache: Map<string, unknown>;
      initialized: boolean;
    };
    service.cache.clear();
    service.initialized = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // Initialization Tests
  // ============================================

  describe('initialize', () => {
    it('should load mappings from database into cache', async () => {
      // Pre-populate the mock DB
      _mockData.push(
        {
          id: 'vcm-1',
          vendorPattern: 'starbucks',
          categoryId: catId('cat-food'),
          usageCount: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'vcm-2',
          vendorPattern: 'amazon',
          categoryId: catId('cat-shopping'),
          usageCount: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      await vendorCategoryLearning.initialize();

      expect(vendorCategoryLearning.getMappingCount()).toBe(2);
    });

    it('should only initialize once (idempotent)', async () => {
      await vendorCategoryLearning.initialize();
      const callCountAfterFirst = vi.mocked(db.vendorCategories.toArray).mock
        .calls.length;

      await vendorCategoryLearning.initialize();
      const callCountAfterSecond = vi.mocked(db.vendorCategories.toArray).mock
        .calls.length;

      // Second init should not call toArray again
      expect(callCountAfterSecond).toBe(callCountAfterFirst);
    });

    it('should handle database errors gracefully', async () => {
      // Override the mock to fail once
      const originalImpl = db.vendorCategories.toArray;
      (db.vendorCategories as Record<string, unknown>).toArray = vi
        .fn()
        .mockRejectedValueOnce(new Error('DB error'));

      // Reset initialized state
      const service = vendorCategoryLearning as unknown as {
        initialized: boolean;
      };
      service.initialized = false;

      // Should not throw
      await expect(vendorCategoryLearning.initialize()).resolves.not.toThrow();

      // Restore
      (db.vendorCategories as Record<string, unknown>).toArray = originalImpl;
    });
  });

  // ============================================
  // Lookup Tests
  // ============================================

  describe('lookup', () => {
    beforeEach(async () => {
      // Pre-populate cache via learn
      await vendorCategoryLearning.initialize();
      await vendorCategoryLearning.learn('Starbucks Coffee', catId('cat-food'));
      await vendorCategoryLearning.learn('Amazon.com', catId('cat-shopping'));
      await vendorCategoryLearning.learn('Netflix', catId('cat-entertainment'));
    });

    it('should return exact match with high confidence', () => {
      const result = vendorCategoryLearning.lookup('starbucks coffee');

      expect(result).not.toBeNull();
      expect(result!.categoryId).toBe(catId('cat-food'));
      expect(result!.matchedPattern).toBe('starbucks coffee');
      expect(result!.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should be case-insensitive for exact matches', () => {
      const result = vendorCategoryLearning.lookup('STARBUCKS COFFEE');

      expect(result).not.toBeNull();
      expect(result!.categoryId).toBe(catId('cat-food'));
    });

    it('should find prefix/contains matches', () => {
      const result = vendorCategoryLearning.lookup('Starbucks Coffee #12345');

      expect(result).not.toBeNull();
      expect(result!.categoryId).toBe(catId('cat-food'));
      // Contains match should have lower confidence than exact
      expect(result!.confidence).toBeLessThan(0.99);
    });

    it('should return null for unknown vendors', () => {
      const result = vendorCategoryLearning.lookup('Some Random Store');

      expect(result).toBeNull();
    });

    it('should return null for empty vendor string', () => {
      expect(vendorCategoryLearning.lookup('')).toBeNull();
      expect(vendorCategoryLearning.lookup('   ')).toBeNull();
    });

    it('should prefer longer (more specific) pattern matches', async () => {
      // Add a more specific pattern
      await vendorCategoryLearning.learn(
        'Amazon Fresh',
        catId('cat-groceries')
      );

      // "Amazon Fresh Delivery" should match "amazon fresh" over "amazon.com"
      const result = vendorCategoryLearning.lookup('Amazon Fresh Delivery');

      expect(result).not.toBeNull();
      expect(result!.categoryId).toBe(catId('cat-groceries'));
    });

    it('should increase confidence with higher usage count', async () => {
      // Learn the same mapping multiple times to increase usage count
      await vendorCategoryLearning.learn('Uber Eats', catId('cat-food'));
      const result1 = vendorCategoryLearning.lookup('Uber Eats');

      await vendorCategoryLearning.learn('Uber Eats', catId('cat-food'));
      const result2 = vendorCategoryLearning.lookup('Uber Eats');

      await vendorCategoryLearning.learn('Uber Eats', catId('cat-food'));
      const result3 = vendorCategoryLearning.lookup('Uber Eats');

      expect(result1!.confidence).toBeLessThan(result3!.confidence);
      expect(result2!.confidence).toBeLessThanOrEqual(result3!.confidence);
    });

    it('should handle vendors with special characters', async () => {
      await vendorCategoryLearning.learn("McDonald's", catId('cat-food'));

      const result = vendorCategoryLearning.lookup("McDonald's");

      expect(result).not.toBeNull();
      expect(result!.categoryId).toBe(catId('cat-food'));
    });

    it('should normalize whitespace when looking up', async () => {
      await vendorCategoryLearning.learn(
        'Whole  Foods  Market',
        catId('cat-groceries')
      );

      // Extra whitespace should be collapsed
      const result = vendorCategoryLearning.lookup('Whole Foods Market');

      expect(result).not.toBeNull();
      expect(result!.categoryId).toBe(catId('cat-groceries'));
    });
  });

  // ============================================
  // Learn Tests
  // ============================================

  describe('learn', () => {
    beforeEach(async () => {
      await vendorCategoryLearning.initialize();
    });

    it('should create a new mapping for unknown vendor', async () => {
      await vendorCategoryLearning.learn('Target', catId('cat-shopping'));

      const result = vendorCategoryLearning.lookup('Target');
      expect(result).not.toBeNull();
      expect(result!.categoryId).toBe(catId('cat-shopping'));
      expect(result!.usageCount).toBe(1);
    });

    it('should increment usage count for same vendor and category', async () => {
      await vendorCategoryLearning.learn('Walmart', catId('cat-groceries'));
      await vendorCategoryLearning.learn('Walmart', catId('cat-groceries'));
      await vendorCategoryLearning.learn('Walmart', catId('cat-groceries'));

      const result = vendorCategoryLearning.lookup('Walmart');
      expect(result!.usageCount).toBe(3);
    });

    it('should reset usage count when category changes', async () => {
      await vendorCategoryLearning.learn('Best Buy', catId('cat-shopping'));
      await vendorCategoryLearning.learn('Best Buy', catId('cat-shopping'));
      await vendorCategoryLearning.learn('Best Buy', catId('cat-shopping'));

      // Change category
      await vendorCategoryLearning.learn('Best Buy', catId('cat-electronics'));

      const result = vendorCategoryLearning.lookup('Best Buy');
      expect(result!.categoryId).toBe(catId('cat-electronics'));
      expect(result!.usageCount).toBe(1); // Reset
    });

    it('should not learn empty vendor names', async () => {
      const countBefore = vendorCategoryLearning.getMappingCount();
      await vendorCategoryLearning.learn('', catId('cat-food'));
      await vendorCategoryLearning.learn('   ', catId('cat-food'));
      expect(vendorCategoryLearning.getMappingCount()).toBe(countBefore);
    });

    it('should not learn with empty category ID', async () => {
      const countBefore = vendorCategoryLearning.getMappingCount();
      await vendorCategoryLearning.learn('Some Store', '' as CategoryId);
      expect(vendorCategoryLearning.getMappingCount()).toBe(countBefore);
    });

    it('should persist mappings to IndexedDB', async () => {
      const addCallsBefore = vi.mocked(db.vendorCategories.add).mock.calls
        .length;

      await vendorCategoryLearning.learn('Costco', catId('cat-groceries'));

      // Verify the database was called
      expect(vi.mocked(db.vendorCategories.add).mock.calls.length).toBe(
        addCallsBefore + 1
      );
    });

    it('should update existing mappings via put', async () => {
      const addCallsBefore = vi.mocked(db.vendorCategories.add).mock.calls
        .length;
      const putCallsBefore = vi.mocked(db.vendorCategories.put).mock.calls
        .length;

      await vendorCategoryLearning.learn('Costco', catId('cat-groceries'));
      await vendorCategoryLearning.learn('Costco', catId('cat-groceries'));

      // First call uses add, second uses put
      expect(vi.mocked(db.vendorCategories.add).mock.calls.length).toBe(
        addCallsBefore + 1
      );
      expect(vi.mocked(db.vendorCategories.put).mock.calls.length).toBe(
        putCallsBefore + 1
      );
    });

    it('should handle database errors gracefully during learn', async () => {
      // Override add to fail once
      const originalAdd = db.vendorCategories.add;
      (db.vendorCategories as Record<string, unknown>).add = vi
        .fn()
        .mockRejectedValueOnce(new Error('DB write failed'));

      // Should not throw
      await expect(
        vendorCategoryLearning.learn('Test', catId('cat-test'))
      ).resolves.not.toThrow();

      // Restore
      (db.vendorCategories as Record<string, unknown>).add = originalAdd;
    });

    it('should remove trailing store numbers from vendor patterns', async () => {
      await vendorCategoryLearning.learn('Starbucks #1234', catId('cat-food'));

      // The normalized pattern should not include the store number
      const result = vendorCategoryLearning.lookup('Starbucks #5678');

      expect(result).not.toBeNull();
      expect(result!.categoryId).toBe(catId('cat-food'));
    });

    it('should remove trailing punctuation from vendor patterns', async () => {
      await vendorCategoryLearning.learn(
        'Some Vendor, Inc.',
        catId('cat-other')
      );

      const result = vendorCategoryLearning.lookup('Some Vendor, Inc');

      expect(result).not.toBeNull();
    });
  });

  // ============================================
  // Batch Learn Tests
  // ============================================

  describe('learnBatch', () => {
    beforeEach(async () => {
      await vendorCategoryLearning.initialize();
    });

    it('should learn multiple mappings at once', async () => {
      await vendorCategoryLearning.learnBatch([
        { vendor: 'Store A', categoryId: catId('cat-1') },
        { vendor: 'Store B', categoryId: catId('cat-2') },
        { vendor: 'Store C', categoryId: catId('cat-3') },
      ]);

      expect(vendorCategoryLearning.lookup('Store A')).not.toBeNull();
      expect(vendorCategoryLearning.lookup('Store B')).not.toBeNull();
      expect(vendorCategoryLearning.lookup('Store C')).not.toBeNull();
    });

    it('should handle empty batch', async () => {
      await expect(
        vendorCategoryLearning.learnBatch([])
      ).resolves.not.toThrow();
    });

    it('should handle duplicate vendors in batch (last write wins)', async () => {
      await vendorCategoryLearning.learnBatch([
        { vendor: 'Store X', categoryId: catId('cat-1') },
        { vendor: 'Store X', categoryId: catId('cat-2') },
      ]);

      const result = vendorCategoryLearning.lookup('Store X');
      // Second learn with different category resets usage
      expect(result!.categoryId).toBe(catId('cat-2'));
    });
  });

  // ============================================
  // Get All Mappings Tests
  // ============================================

  describe('getAllMappings', () => {
    beforeEach(async () => {
      await vendorCategoryLearning.initialize();
    });

    it('should return all mappings from database', async () => {
      await vendorCategoryLearning.learn('A', catId('cat-1'));
      await vendorCategoryLearning.learn('B', catId('cat-2'));

      const mappings = await vendorCategoryLearning.getAllMappings();

      expect(mappings).toHaveLength(2);
    });

    it('should return empty array when no mappings exist', async () => {
      const mappings = await vendorCategoryLearning.getAllMappings();

      expect(mappings).toHaveLength(0);
    });

    it('should fall back to cache when database fails', async () => {
      await vendorCategoryLearning.learn('Cached', catId('cat-1'));

      // Override toArray to fail once
      const originalToArray = db.vendorCategories.toArray;
      (db.vendorCategories as Record<string, unknown>).toArray = vi
        .fn()
        .mockRejectedValueOnce(new Error('DB read error'));

      const mappings = await vendorCategoryLearning.getAllMappings();

      // Should return from cache
      expect(mappings.length).toBeGreaterThanOrEqual(1);

      // Restore
      (db.vendorCategories as Record<string, unknown>).toArray =
        originalToArray;
    });
  });

  // ============================================
  // Delete Mapping Tests
  // ============================================

  describe('deleteMapping', () => {
    beforeEach(async () => {
      await vendorCategoryLearning.initialize();
    });

    it('should delete a mapping by ID', async () => {
      await vendorCategoryLearning.learn('To Delete', catId('cat-1'));

      // Get the mapping to find its ID
      const mappings = await vendorCategoryLearning.getAllMappings();
      const mapping = mappings.find((m) => m.vendorPattern === 'to delete');

      expect(mapping).toBeDefined();

      await vendorCategoryLearning.deleteMapping(mapping!.id);

      // Should no longer be in cache
      expect(vendorCategoryLearning.lookup('To Delete')).toBeNull();
    });

    it('should handle deleting non-existent mapping gracefully', async () => {
      await expect(
        vendorCategoryLearning.deleteMapping('non-existent-id')
      ).resolves.not.toThrow();
    });

    it('should handle database errors during delete', async () => {
      const originalGet = db.vendorCategories.get;
      (db.vendorCategories as Record<string, unknown>).get = vi
        .fn()
        .mockRejectedValueOnce(new Error('DB error'));

      await expect(
        vendorCategoryLearning.deleteMapping('some-id')
      ).resolves.not.toThrow();

      // Restore
      (db.vendorCategories as Record<string, unknown>).get = originalGet;
    });
  });

  // ============================================
  // Clear All Tests
  // ============================================

  describe('clearAll', () => {
    beforeEach(async () => {
      await vendorCategoryLearning.initialize();
    });

    it('should clear all mappings from DB and cache', async () => {
      await vendorCategoryLearning.learn('A', catId('cat-1'));
      await vendorCategoryLearning.learn('B', catId('cat-2'));

      expect(vendorCategoryLearning.getMappingCount()).toBe(2);

      await vendorCategoryLearning.clearAll();

      expect(vendorCategoryLearning.getMappingCount()).toBe(0);
      expect(vendorCategoryLearning.lookup('A')).toBeNull();
      expect(vendorCategoryLearning.lookup('B')).toBeNull();
    });

    it('should handle database errors during clear', async () => {
      const originalClear = db.vendorCategories.clear;
      (db.vendorCategories as Record<string, unknown>).clear = vi
        .fn()
        .mockRejectedValueOnce(new Error('DB error'));

      await expect(vendorCategoryLearning.clearAll()).resolves.not.toThrow();

      // Restore
      (db.vendorCategories as Record<string, unknown>).clear = originalClear;
    });
  });

  // ============================================
  // getMappingCount Tests
  // ============================================

  describe('getMappingCount', () => {
    beforeEach(async () => {
      await vendorCategoryLearning.initialize();
    });

    it('should return 0 for empty cache', () => {
      expect(vendorCategoryLearning.getMappingCount()).toBe(0);
    });

    it('should return correct count after learning', async () => {
      await vendorCategoryLearning.learn('A', catId('cat-1'));
      expect(vendorCategoryLearning.getMappingCount()).toBe(1);

      await vendorCategoryLearning.learn('B', catId('cat-2'));
      expect(vendorCategoryLearning.getMappingCount()).toBe(2);
    });

    it('should not increment count for same vendor (update)', async () => {
      await vendorCategoryLearning.learn('A', catId('cat-1'));
      await vendorCategoryLearning.learn('A', catId('cat-1'));
      expect(vendorCategoryLearning.getMappingCount()).toBe(1);
    });
  });

  // ============================================
  // Vendor Normalization Tests
  // ============================================

  describe('Vendor Normalization', () => {
    beforeEach(async () => {
      await vendorCategoryLearning.initialize();
    });

    it('should normalize case', async () => {
      await vendorCategoryLearning.learn('STARBUCKS', catId('cat-food'));

      expect(vendorCategoryLearning.lookup('starbucks')).not.toBeNull();
      expect(vendorCategoryLearning.lookup('Starbucks')).not.toBeNull();
      expect(vendorCategoryLearning.lookup('STARBUCKS')).not.toBeNull();
    });

    it('should collapse whitespace', async () => {
      await vendorCategoryLearning.learn(
        'Whole   Foods   Market',
        catId('cat-food')
      );

      expect(
        vendorCategoryLearning.lookup('Whole Foods Market')
      ).not.toBeNull();
    });

    it('should trim leading/trailing whitespace', async () => {
      await vendorCategoryLearning.learn('  Costco  ', catId('cat-groceries'));

      expect(vendorCategoryLearning.lookup('Costco')).not.toBeNull();
    });

    it('should strip trailing store numbers', async () => {
      await vendorCategoryLearning.learn('Target #1234', catId('cat-shopping'));

      // Without store number should still match via contains
      const result = vendorCategoryLearning.lookup('Target');
      expect(result).not.toBeNull();
    });

    it('should strip trailing punctuation', async () => {
      await vendorCategoryLearning.learn('Store Corp.', catId('cat-other'));

      const result = vendorCategoryLearning.lookup('Store Corp');
      expect(result).not.toBeNull();
    });
  });

  // ============================================
  // Confidence Scoring Tests
  // ============================================

  describe('Confidence Scoring', () => {
    beforeEach(async () => {
      await vendorCategoryLearning.initialize();
    });

    it('should give exact matches higher confidence than partial matches', async () => {
      await vendorCategoryLearning.learn('Netflix', catId('cat-ent'));

      const exact = vendorCategoryLearning.lookup('Netflix');
      const partial = vendorCategoryLearning.lookup('Netflix Premium Plan');

      expect(exact).not.toBeNull();
      expect(partial).not.toBeNull();
      expect(exact!.confidence).toBeGreaterThan(partial!.confidence);
    });

    it('should cap confidence at 0.99 for exact matches', async () => {
      // Learn same vendor many times to boost confidence
      for (let i = 0; i < 20; i++) {
        await vendorCategoryLearning.learn('Frequent Vendor', catId('cat-1'));
      }

      const result = vendorCategoryLearning.lookup('Frequent Vendor');
      expect(result!.confidence).toBeLessThanOrEqual(0.99);
    });

    it('should cap confidence at 0.90 for partial matches', async () => {
      for (let i = 0; i < 20; i++) {
        await vendorCategoryLearning.learn('Partial', catId('cat-1'));
      }

      const result = vendorCategoryLearning.lookup(
        'Partial Vendor Very Long Name'
      );
      expect(result!.confidence).toBeLessThanOrEqual(0.9);
    });
  });
});
