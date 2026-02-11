/**
 * useUncategorizedTransactions Hook
 *
 * Finds transactions that are uncategorized (null category)
 * or assigned to "Other", and provides auto-categorizer suggestions
 * for them. Used by the Smart Suggestions dashboard card.
 *
 * PRIVACY: All data stays local. Only structured data is used.
 */

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/storage/db';
import { autoCategorizer, type CategorySuggestion } from '@/lib/processing/auto-categorizer';
import { useCategories } from '@/hooks/useLocalDB';
import type { LocalTransaction, CategoryId, TransactionId } from '@/types/database';

export interface UncategorizedSuggestion {
  /** Transaction */
  transaction: LocalTransaction;
  /** Auto-categorizer suggestion (null if no match) */
  suggestion: CategorySuggestion | null;
  /** Resolved category ID from the suggestion */
  suggestedCategoryId: CategoryId | null;
  /** Resolved category name from the suggestion */
  suggestedCategoryName: string | null;
}

export interface UseUncategorizedTransactionsReturn {
  /** Uncategorized transactions with suggestions */
  items: UncategorizedSuggestion[];
  /** Total count of uncategorized transactions */
  totalCount: number;
  /** Count of transactions with viable suggestions */
  suggestableCount: number;
  /** Whether the data is still loading */
  isLoading: boolean;
  /** Apply a suggestion (update transaction category in DB) */
  applySuggestion: (transactionId: TransactionId, categoryId: CategoryId) => Promise<void>;
  /** Apply all suggestions at once */
  applyAll: () => Promise<number>;
  /** Dismiss a transaction (assign to "Other" so it's no longer flagged) */
  dismiss: (transactionId: TransactionId) => Promise<void>;
}

/** Max items to show in the dashboard card */
const MAX_DISPLAY = 10;

export function useUncategorizedTransactions(): UseUncategorizedTransactionsReturn {
  const { data: categories, isLoading: categoriesLoading } = useCategories();

  // Find the "Other" category ID
  const otherCategoryId = useMemo(() => {
    const other = categories.find((c) => c.name === 'Other');
    return other?.id || null;
  }, [categories]);

  // Build category name → ID lookup
  const categoryNameToId = useMemo(() => {
    const map = new Map<string, CategoryId>();
    for (const cat of categories) {
      map.set(cat.name.toLowerCase(), cat.id);
    }
    return map;
  }, [categories]);

  // Query transactions that are uncategorized or "Other"
  const rawTransactions = useLiveQuery(async () => {
    // Get transactions with null category
    const nullCat = await db.transactions
      .where('category')
      .equals('')
      .toArray();

    // Also get transactions with "Other" category
    let otherCat: LocalTransaction[] = [];
    if (otherCategoryId) {
      otherCat = await db.transactions
        .where('category')
        .equals(otherCategoryId as string)
        .toArray();
    }

    // Combine and sort by date (newest first)
    const all = [...nullCat, ...otherCat];

    // Also include transactions where category is actually null (not empty string)
    const nullCatToo = await db.transactions.toArray();
    const withoutCat = nullCatToo.filter(
      (tx) => tx.category === null && !all.some((a) => a.id === tx.id)
    );

    return [...all, ...withoutCat]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 100); // Cap at 100 for performance
  }, [otherCategoryId]);

  // Generate suggestions for each uncategorized transaction
  const items = useMemo<UncategorizedSuggestion[]>(() => {
    if (!rawTransactions || rawTransactions.length === 0) return [];

    return rawTransactions.slice(0, MAX_DISPLAY).map((tx) => {
      const suggestion = tx.vendor
        ? autoCategorizer.suggestCategory(tx.vendor, {
            amount: tx.amount ? Math.abs(tx.amount) : undefined,
          })
        : null;

      let suggestedCategoryId: CategoryId | null = null;
      let suggestedCategoryName: string | null = null;

      if (suggestion) {
        if (suggestion.isLearned && suggestion.learnedCategoryId) {
          suggestedCategoryId = suggestion.learnedCategoryId;
          const cat = categories.find((c) => c.id === suggestion.learnedCategoryId);
          suggestedCategoryName = cat?.name || null;
        } else {
          suggestedCategoryId =
            categoryNameToId.get(suggestion.categoryName.toLowerCase()) || null;
          suggestedCategoryName = suggestion.categoryName;
        }
      }

      return {
        transaction: tx,
        suggestion,
        suggestedCategoryId,
        suggestedCategoryName,
      };
    });
  }, [rawTransactions, categories, categoryNameToId]);

  const totalCount = rawTransactions?.length || 0;
  const suggestableCount = items.filter((i) => i.suggestedCategoryId !== null).length;

  // Apply a single suggestion
  const applySuggestion = async (
    transactionId: TransactionId,
    categoryId: CategoryId
  ) => {
    await db.transactions.update(transactionId, {
      category: categoryId,
      updatedAt: new Date(),
    });
  };

  // Apply all suggestions at once
  const applyAll = async (): Promise<number> => {
    const applicable = items.filter((i) => i.suggestedCategoryId !== null);
    if (applicable.length === 0) return 0;

    await db.transaction('rw', db.transactions, async () => {
      for (const item of applicable) {
        await db.transactions.update(item.transaction.id, {
          category: item.suggestedCategoryId,
          updatedAt: new Date(),
        });
      }
    });

    // Learn the vendor → category mappings
    const mappings = applicable
      .filter((i) => i.transaction.vendor && i.suggestedCategoryId)
      .map((i) => ({
        vendor: i.transaction.vendor,
        categoryId: i.suggestedCategoryId!,
      }));

    if (mappings.length > 0) {
      await autoCategorizer.learnCategories(mappings);
    }

    return applicable.length;
  };

  // Dismiss a transaction (assign "Other" explicitly)
  const dismiss = async (transactionId: TransactionId) => {
    if (otherCategoryId) {
      await db.transactions.update(transactionId, {
        category: otherCategoryId,
        updatedAt: new Date(),
      });
    }
  };

  return {
    items,
    totalCount,
    suggestableCount,
    isLoading: categoriesLoading || rawTransactions === undefined,
    applySuggestion,
    applyAll,
    dismiss,
  };
}
