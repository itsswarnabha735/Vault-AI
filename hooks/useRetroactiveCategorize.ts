/**
 * Hook: useRetroactiveCategorize
 *
 * When a user manually corrects a transaction's category, this hook
 * finds other transactions from the same vendor that could be re-categorized
 * and offers to update them in bulk.
 *
 * Example flow:
 * 1. User changes "Swiggy" from "Other" to "Food & Dining"
 * 2. Hook finds 23 other "Swiggy" transactions still in "Other"
 * 3. UI shows: "Found 23 other Swiggy transactions. Re-categorize all?"
 * 4. User confirms → all 23 are updated
 *
 * PRIVACY: All operations are local (IndexedDB only).
 */

'use client';

import { useState, useCallback } from 'react';
import { db } from '@/lib/storage/db';
import type {
  CategoryId,
  TransactionId,
  LocalTransaction,
} from '@/types/database';

// ============================================
// Types
// ============================================

export interface RetroactiveSuggestion {
  /** Vendor name that was corrected */
  vendor: string;

  /** New category ID (the one the user chose) */
  categoryId: CategoryId;

  /** Transactions that could be re-categorized */
  matchingTransactions: LocalTransaction[];

  /** Number of matching transactions */
  count: number;
}

interface UseRetroactiveCategorizeReturn {
  /** Current suggestion (null if none pending) */
  suggestion: RetroactiveSuggestion | null;

  /** Whether a search is in progress */
  isSearching: boolean;

  /**
   * Check if there are other transactions from the same vendor
   * that should be re-categorized. Call this when a user changes
   * a transaction's category.
   *
   * @param vendor - The vendor name
   * @param newCategoryId - The category the user selected
   * @param currentTransactionId - The ID of the transaction being edited (excluded from results)
   */
  checkForRetroactive: (
    vendor: string,
    newCategoryId: CategoryId,
    currentTransactionId?: TransactionId
  ) => Promise<void>;

  /**
   * Apply the re-categorization to all matching transactions.
   * @returns Number of transactions updated
   */
  applyRetroactive: () => Promise<number>;

  /** Dismiss the suggestion without applying */
  dismissSuggestion: () => void;
}

// ============================================
// Hook
// ============================================

/**
 * Hook for retroactive re-categorization of transactions.
 *
 * @param minMatches - Minimum number of matching transactions to show suggestion (default: 1)
 */
export function useRetroactiveCategorize(
  minMatches: number = 1
): UseRetroactiveCategorizeReturn {
  const [suggestion, setSuggestion] = useState<RetroactiveSuggestion | null>(
    null
  );
  const [isSearching, setIsSearching] = useState(false);

  const checkForRetroactive = useCallback(
    async (
      vendor: string,
      newCategoryId: CategoryId,
      currentTransactionId?: TransactionId
    ) => {
      if (!vendor || !newCategoryId) {
        setSuggestion(null);
        return;
      }

      setIsSearching(true);
      try {
        // Find other transactions with the same vendor
        const excludeIds = currentTransactionId
          ? new Set([currentTransactionId])
          : undefined;
        const matches = await db.findTransactionsByVendor(vendor, excludeIds);

        // Filter to transactions that are NOT already in the target category
        const toRecategorize = matches.filter(
          (tx) => tx.category !== newCategoryId
        );

        if (toRecategorize.length >= minMatches) {
          setSuggestion({
            vendor,
            categoryId: newCategoryId,
            matchingTransactions: toRecategorize,
            count: toRecategorize.length,
          });
        } else {
          setSuggestion(null);
        }
      } catch (error) {
        console.error('[RetroactiveCategorize] Search failed:', error);
        setSuggestion(null);
      } finally {
        setIsSearching(false);
      }
    },
    [minMatches]
  );

  const applyRetroactive = useCallback(async () => {
    if (!suggestion) {
      return 0;
    }

    try {
      const ids = suggestion.matchingTransactions.map((tx) => tx.id);
      const updated = await db.batchUpdateCategory(ids, suggestion.categoryId);

      console.log(
        `[RetroactiveCategorize] Updated ${updated} "${suggestion.vendor}" transactions`
      );

      setSuggestion(null);
      return updated;
    } catch (error) {
      console.error('[RetroactiveCategorize] Batch update failed:', error);
      return 0;
    }
  }, [suggestion]);

  const dismissSuggestion = useCallback(() => {
    setSuggestion(null);
  }, []);

  return {
    suggestion,
    isSearching,
    checkForRetroactive,
    applyRetroactive,
    dismissSuggestion,
  };
}
