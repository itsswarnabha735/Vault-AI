/**
 * useSubcategorySuggestions Hook (Phase B backward-compat fix)
 *
 * Identifies existing transactions that are assigned to a parent
 * category (e.g., "Food & Dining") and suggests a more specific
 * sub-category (e.g., "Restaurants", "Groceries") based on vendor
 * keyword matching.
 *
 * Only suggests for parent categories that actually have sub-categories
 * defined in the registry.
 *
 * PRIVACY: All processing is local.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/lib/storage/db';
import { useCategories } from '@/hooks/useLocalDB';
import type { CategoryId, TransactionId } from '@/types/database';

// ============================================
// Types
// ============================================

export interface SubcategorySuggestion {
  transactionId: TransactionId;
  vendor: string;
  amount: number;
  date: string;
  /** Current parent category ID */
  currentCategoryId: CategoryId;
  currentCategoryName: string;
  /** Suggested sub-category ID */
  suggestedSubcategoryId: CategoryId;
  suggestedSubcategoryName: string;
  suggestedSubcategoryIcon: string;
}

export interface UseSubcategorySuggestionsReturn {
  /** Suggested sub-category reassignments */
  suggestions: SubcategorySuggestion[];
  /** Total number of transactions at parent level that have sub-categories available */
  totalEligible: number;
  /** Loading state */
  isLoading: boolean;
  /** Apply a single suggestion */
  applySuggestion: (
    transactionId: TransactionId,
    subcategoryId: CategoryId
  ) => Promise<void>;
  /** Apply all suggestions */
  applyAll: () => Promise<number>;
  /** Dismiss a suggestion */
  dismiss: (transactionId: TransactionId) => void;
}

// ============================================
// Simple keyword → sub-category mapping
// ============================================

/**
 * Keywords that hint at a specific sub-category within a parent.
 * These are intentionally simple — they complement the main auto-categorizer
 * which handles the parent-level assignment.
 */
const SUBCATEGORY_KEYWORDS: Record<string, string[]> = {
  // Food & Dining sub-categories
  Restaurants: [
    'restaurant',
    'cafe',
    'diner',
    'bistro',
    'pizz',
    'burger',
    'sushi',
    'wok',
    'grill',
    'kitchen',
    'dhaba',
    'biryani',
    'dosa',
  ],
  Groceries: [
    'grocery',
    'grocer',
    'supermarket',
    'mart',
    'fresh',
    'organic',
    'bigbasket',
    'blinkit',
    'zepto',
    'instamart',
    'dmart',
    'reliance fresh',
    'more supermarket',
  ],
  'Food Delivery': [
    'swiggy',
    'zomato',
    'uber eats',
    'doordash',
    'grubhub',
    'food delivery',
    'dunzo',
  ],
  'Coffee & Drinks': [
    'starbucks',
    'coffee',
    'tea',
    'chai',
    'juice',
    'smoothie',
    'cafe coffee day',
    'ccd',
    'barista',
  ],

  // Shopping sub-categories
  'Online Shopping': [
    'amazon',
    'flipkart',
    'myntra',
    'ajio',
    'meesho',
    'nykaa',
    'ebay',
    'shopify',
  ],
  Clothing: [
    'clothing',
    'apparel',
    'fashion',
    'zara',
    'h&m',
    'uniqlo',
    'pantaloons',
    'lifestyle',
  ],
  Electronics: [
    'electronic',
    'croma',
    'reliance digital',
    'vijay sales',
    'apple store',
    'samsung',
  ],

  // Transportation sub-categories
  'Ride Sharing': ['uber', 'ola', 'lyft', 'rapido', 'grab'],
  'Public Transit': ['metro', 'bus', 'train', 'railway', 'irctc', 'transit'],
  Fuel: [
    'petrol',
    'diesel',
    'fuel',
    'gas station',
    'shell',
    'hp',
    'bharat petroleum',
    'indian oil',
  ],
  Parking: ['parking', 'park plus', 'parkwhiz'],

  // Entertainment sub-categories
  'Movies & Shows': [
    'movie',
    'cinema',
    'pvr',
    'inox',
    'bookmyshow',
    'theatre',
    'theater',
  ],
  'Streaming Services': [
    'netflix',
    'spotify',
    'hotstar',
    'prime video',
    'youtube premium',
    'apple tv',
    'jio cinema',
  ],
  Gaming: [
    'game',
    'gaming',
    'steam',
    'playstation',
    'xbox',
    'nintendo',
    'epic games',
  ],

  // Healthcare sub-categories
  Pharmacy: [
    'pharmacy',
    'pharma',
    'medical store',
    'medplus',
    'apollo pharmacy',
    'netmeds',
    'pharmeasy',
    '1mg',
  ],
  'Doctor Visits': [
    'doctor',
    'clinic',
    'hospital',
    'consultation',
    'practo',
    'apollo',
  ],
  Fitness: ['gym', 'fitness', 'yoga', 'cult.fit', 'crossfit', 'gold gym'],

  // Travel sub-categories
  Flights: [
    'flight',
    'airline',
    'airways',
    'indigo',
    'air india',
    'spicejet',
    'makemytrip',
    'cleartrip',
  ],
  Hotels: [
    'hotel',
    'resort',
    'lodge',
    'oyo',
    'airbnb',
    'booking.com',
    'trivago',
    'goibibo',
  ],
};

// ============================================
// Hook
// ============================================

export function useSubcategorySuggestions(): UseSubcategorySuggestionsReturn {
  const { data: categories, isLoading: catsLoading } = useCategories();
  const [suggestions, setSuggestions] = useState<SubcategorySuggestion[]>([]);
  const [totalEligible, setTotalEligible] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Build lookups
  const { parentIdsWithChildren, subcatByName, catNameById } = useMemo(() => {
    const parentIds = new Set<string>();
    const subcatMap = new Map<
      string,
      { id: CategoryId; name: string; icon: string; parentId: string }
    >();
    const nameMap = new Map<CategoryId, string>();

    for (const cat of categories) {
      nameMap.set(cat.id, cat.name as string);
      if (cat.parentId) {
        parentIds.add(cat.parentId as string);
        subcatMap.set((cat.name as string).toLowerCase(), {
          id: cat.id,
          name: cat.name as string,
          icon: cat.icon as string,
          parentId: cat.parentId as string,
        });
      }
    }

    return {
      parentIdsWithChildren: parentIds,
      subcatByName: subcatMap,
      catNameById: nameMap,
    };
  }, [categories]);

  // Scan transactions
  useEffect(() => {
    if (catsLoading || categories.length === 0) {
      return;
    }

    void (async () => {
      setIsLoading(true);
      try {
        const transactions = await db.transactions.toArray();

        // Find transactions at parent level where sub-categories exist
        const eligible = transactions.filter(
          (tx) =>
            tx.category && parentIdsWithChildren.has(tx.category as string)
        );

        setTotalEligible(eligible.length);

        // Try to suggest sub-categories based on vendor keywords
        const results: SubcategorySuggestion[] = [];

        for (const tx of eligible) {
          if (!tx.vendor || results.length >= 50) {
            break;
          }

          const vendorLower = tx.vendor.toLowerCase();
          const parentName = catNameById.get(tx.category!) || '';

          // Search keyword map for a matching sub-category
          for (const [subcatName, keywords] of Object.entries(
            SUBCATEGORY_KEYWORDS
          )) {
            const matched = keywords.some((kw) => vendorLower.includes(kw));
            if (!matched) {
              continue;
            }

            // Find the actual sub-category in the DB
            const subcat = subcatByName.get(subcatName.toLowerCase());
            if (!subcat) {
              continue;
            }

            // Verify this sub-category belongs to the current parent
            if (subcat.parentId !== (tx.category as string)) {
              continue;
            }

            results.push({
              transactionId: tx.id,
              vendor: tx.vendor,
              amount: tx.amount,
              date: tx.date,
              currentCategoryId: tx.category!,
              currentCategoryName: parentName,
              suggestedSubcategoryId: subcat.id,
              suggestedSubcategoryName: subcat.name,
              suggestedSubcategoryIcon: subcat.icon,
            });
            break; // One suggestion per transaction
          }
        }

        setSuggestions(results);
      } catch (error) {
        console.error('[SubcategorySuggestions] Scan failed:', error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [
    categories,
    catsLoading,
    parentIdsWithChildren,
    subcatByName,
    catNameById,
  ]);

  const applySuggestion = useCallback(
    async (transactionId: TransactionId, subcategoryId: CategoryId) => {
      await db.transactions.update(transactionId, {
        category: subcategoryId,
        updatedAt: new Date(),
      });
      setSuggestions((prev) =>
        prev.filter((s) => s.transactionId !== transactionId)
      );
      setTotalEligible((prev) => Math.max(0, prev - 1));
    },
    []
  );

  const applyAll = useCallback(async (): Promise<number> => {
    let applied = 0;
    for (const s of suggestions) {
      try {
        await applySuggestion(s.transactionId, s.suggestedSubcategoryId);
        applied++;
      } catch (error) {
        console.error(
          '[SubcategorySuggestions] Apply failed:',
          s.transactionId,
          error
        );
      }
    }
    return applied;
  }, [suggestions, applySuggestion]);

  const dismiss = useCallback((transactionId: TransactionId) => {
    setSuggestions((prev) =>
      prev.filter((s) => s.transactionId !== transactionId)
    );
  }, []);

  return {
    suggestions,
    totalEligible,
    isLoading: isLoading || catsLoading,
    applySuggestion,
    applyAll,
    dismiss,
  };
}
