/**
 * useAutoFixCategories Hook
 *
 * Retroactively assigns categories to uncategorized transactions using
 * the auto-categorizer's vendor pattern rules and the category registry.
 *
 * Runs once per session on mount. For high-confidence matches (>= 0.6),
 * categories are assigned directly. Uses the robust resolveCategoryName()
 * function from the registry to handle name mismatches.
 *
 * PRIVACY: All categorization happens locally in the browser.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/storage/db';
import { autoCategorizer } from '@/lib/processing/auto-categorizer';
import { resolveCategoryName } from '@/lib/categories/category-registry';
import type { CategoryId, LocalTransaction } from '@/types/database';

// ============================================
// Types
// ============================================

export interface AutoFixProgress {
  /** Total uncategorized transactions found */
  total: number;
  /** Transactions successfully categorized */
  fixed: number;
  /** Transactions that couldn't be categorized */
  skipped: number;
  /** Whether the fix is currently running */
  isRunning: boolean;
  /** Whether the fix has completed this session */
  hasRun: boolean;
}

// ============================================
// Configuration
// ============================================

/** Minimum confidence to auto-assign without user review */
const AUTO_ASSIGN_THRESHOLD = 0.5;

/** Session storage key to prevent re-running */
const SESSION_KEY = 'vault-ai-autofix-categories-done';

/** Max batch size per iteration (to avoid blocking UI) */
const BATCH_SIZE = 50;

// ============================================
// Hook
// ============================================

export function useAutoFixCategories(): AutoFixProgress {
  const [progress, setProgress] = useState<AutoFixProgress>({
    total: 0,
    fixed: 0,
    skipped: 0,
    isRunning: false,
    hasRun: false,
  });
  const runningRef = useRef(false);

  const runFix = useCallback(async () => {
    if (runningRef.current) {
      return;
    }
    runningRef.current = true;
    setProgress((p) => ({ ...p, isRunning: true }));

    try {
      // 1. Load all categories from DB for name → ID resolution
      const dbCategories = await db.categories.toArray();
      const categoryNameToId = new Map<string, CategoryId>();
      for (const cat of dbCategories) {
        categoryNameToId.set(cat.name.toLowerCase(), cat.id);
      }

      // 2. Find all uncategorized transactions
      const allTransactions = await db.transactions.toArray();
      const uncategorized = allTransactions.filter(
        (tx) => !tx.category || tx.category === ('' as CategoryId)
      );

      setProgress((p) => ({ ...p, total: uncategorized.length }));

      if (uncategorized.length === 0) {
        setProgress((p) => ({
          ...p,
          isRunning: false,
          hasRun: true,
        }));
        return;
      }

      let fixedCount = 0;
      let skippedCount = 0;

      // 3. Process in batches to avoid blocking the UI thread
      for (let i = 0; i < uncategorized.length; i += BATCH_SIZE) {
        const batch = uncategorized.slice(i, i + BATCH_SIZE);
        const updates: Array<{
          id: string;
          categoryId: CategoryId;
        }> = [];

        for (const tx of batch) {
          const categoryId = resolveCategory(tx, categoryNameToId);

          if (categoryId) {
            updates.push({ id: tx.id, categoryId });
            fixedCount++;
          } else {
            skippedCount++;
          }
        }

        // Apply updates in a single transaction for efficiency
        if (updates.length > 0) {
          await db.transaction('rw', db.transactions, async () => {
            for (const { id, categoryId } of updates) {
              await db.transactions.update(id, {
                category: categoryId,
                updatedAt: new Date(),
              });
            }
          });
        }

        // Update progress after each batch
        setProgress((p) => ({
          ...p,
          fixed: fixedCount,
          skipped: skippedCount,
        }));

        // Yield to the event loop between batches
        if (i + BATCH_SIZE < uncategorized.length) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      console.log(
        `[AutoFixCategories] Done: ${fixedCount} fixed, ${skippedCount} skipped out of ${uncategorized.length}`
      );

      // Mark as done this session
      try {
        sessionStorage.setItem(SESSION_KEY, Date.now().toString());
      } catch {
        // sessionStorage may not be available in SSR
      }
    } catch (error) {
      console.error('[AutoFixCategories] Failed:', error);
    } finally {
      runningRef.current = false;
      setProgress((p) => ({ ...p, isRunning: false, hasRun: true }));
    }
  }, []);

  // Run once on mount (once per session)
  useEffect(() => {
    let shouldRun = true;
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) {
        shouldRun = false;
        setProgress((p) => ({ ...p, hasRun: true }));
      }
    } catch {
      // SSR or restricted — default to running
    }

    if (shouldRun) {
      void runFix();
    }
  }, [runFix]);

  return progress;
}

// ============================================
// Internal Helpers
// ============================================

/**
 * Attempt to resolve a category for a transaction using multiple strategies:
 * 1. Auto-categorizer vendor pattern rules (with multi-signal scoring)
 * 2. Registry name resolver (handles aliases, fuzzy matching)
 */
function resolveCategory(
  tx: LocalTransaction,
  categoryNameToId: Map<string, CategoryId>
): CategoryId | null {
  if (!tx.vendor || tx.vendor.trim().length === 0) {
    return null;
  }

  // Try the auto-categorizer (uses vendor patterns from the registry)
  const suggestion = autoCategorizer.suggestCategory(tx.vendor, {
    amount: tx.amount ? Math.abs(tx.amount) : undefined,
    type: (tx.transactionType as 'debit' | 'credit' | undefined) ?? undefined,
  });

  if (!suggestion || suggestion.confidence < AUTO_ASSIGN_THRESHOLD) {
    return null;
  }

  // If the suggestion comes from a learned mapping, use it directly
  if (suggestion.learnedCategoryId) {
    return suggestion.learnedCategoryId;
  }

  // Resolve the suggested category name → canonical name → CategoryId
  const canonicalName = resolveCategoryName(suggestion.categoryName);
  if (canonicalName) {
    const id = categoryNameToId.get(canonicalName.toLowerCase());
    if (id) {
      return id;
    }
  }

  // Try direct name match as fallback
  const directId = categoryNameToId.get(suggestion.categoryName.toLowerCase());
  if (directId) {
    return directId;
  }

  return null;
}

export default useAutoFixCategories;
