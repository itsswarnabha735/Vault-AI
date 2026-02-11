/**
 * useBatchRecategorize Hook (5B)
 *
 * Auto-detects transactions stuck in "Other" or uncategorised,
 * and batch-sends them to the LLM categoriser on dashboard load.
 *
 * Behaviour:
 * - Only triggers when there are >= MIN_UNCATEGORISED uncategorised transactions
 * - Runs once per session (tracks via sessionStorage)
 * - Presents results for user approval (never auto-applies without consent)
 * - Includes k-NN classification as a first pass before LLM
 *
 * PRIVACY: Only structured data (vendor, amount, date) is sent to the LLM.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/lib/storage/db';
import {
  llmCategorizer,
  type LLMCategorySuggestion,
} from '@/lib/ai/llm-categorizer';
import {
  embeddingClassifier,
  isRealEmbedding,
} from '@/lib/ai/embedding-classifier';
import { autoCategorizer } from '@/lib/processing/auto-categorizer';
import type {
  LocalTransaction,
  CategoryId,
  TransactionId,
} from '@/types/database';

// ============================================
// Types
// ============================================

export interface RecategorizeSuggestion {
  transactionId: TransactionId;
  vendor: string;
  amount: number;
  date: string;
  currentCategory: CategoryId | null;
  suggestedCategory: string;
  confidence: number;
  reason?: string;
  source: 'knn' | 'llm';
}

export interface UseBatchRecategorizeReturn {
  /** Suggestions for uncategorised transactions */
  suggestions: RecategorizeSuggestion[];
  /** Whether the batch process is running */
  isProcessing: boolean;
  /** Number of uncategorised transactions found */
  uncategorizedCount: number;
  /** Apply a single suggestion */
  applySuggestion: (
    transactionId: TransactionId,
    categoryName: string
  ) => Promise<void>;
  /** Apply all suggestions at once */
  applyAll: () => Promise<number>;
  /** Dismiss a suggestion */
  dismiss: (transactionId: TransactionId) => void;
  /** Manually trigger re-categorisation */
  triggerRecategorize: () => Promise<void>;
  /** Whether the batch has been run this session */
  hasRunThisSession: boolean;
}

// ============================================
// Configuration
// ============================================

/** Minimum uncategorised transactions to trigger auto-batch */
const MIN_UNCATEGORISED = 3;

/** Maximum to process in one batch */
const MAX_BATCH = 50;

/** Session storage key to track if we've run this session */
const SESSION_KEY = 'vault-ai-batch-recat-done';

// ============================================
// Hook
// ============================================

export function useBatchRecategorize(): UseBatchRecategorizeReturn {
  const [suggestions, setSuggestions] = useState<RecategorizeSuggestion[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [hasRunThisSession, setHasRunThisSession] = useState(false);
  const runningRef = useRef(false);

  /**
   * Find uncategorised transactions.
   */
  const getUncategorized = useCallback(async (): Promise<
    LocalTransaction[]
  > => {
    const all = await db.transactions.toArray();
    return all.filter(
      (tx) => !tx.category || tx.category === ('other' as CategoryId)
    );
  }, []);

  /**
   * Run the batch re-categorisation pipeline:
   * 1. k-NN classification for transactions with embeddings
   * 2. LLM for remaining (low k-NN confidence or no embedding)
   */
  const runBatch = useCallback(async () => {
    if (runningRef.current) {
      return;
    }
    runningRef.current = true;
    setIsProcessing(true);

    try {
      const uncategorised = await getUncategorized();
      setUncategorizedCount(uncategorised.length);

      if (uncategorised.length < MIN_UNCATEGORISED) {
        return;
      }

      const batch = uncategorised.slice(0, MAX_BATCH);
      const results: RecategorizeSuggestion[] = [];
      const needsLLM: LocalTransaction[] = [];

      // Phase 1: k-NN classification (only for transactions with real embeddings)
      const knnEmbeddings = new Map<string, Float32Array | number[]>();
      for (const tx of batch) {
        if (isRealEmbedding(tx.embedding)) {
          knnEmbeddings.set(tx.id, tx.embedding);
        }
      }

      if (knnEmbeddings.size > 0) {
        const knnResults =
          await embeddingClassifier.classifyBatch(knnEmbeddings);
        for (const tx of batch) {
          const knnResult = knnResults.get(tx.id);
          if (knnResult && knnResult.confidence >= 0.6) {
            results.push({
              transactionId: tx.id,
              vendor: tx.vendor,
              amount: tx.amount,
              date: tx.date,
              currentCategory: tx.category,
              suggestedCategory: knnResult.categoryId as string,
              confidence: knnResult.confidence,
              reason: `k-NN: ${knnResult.voteCount}/${knnResult.k} votes (avg sim ${knnResult.averageSimilarity})`,
              source: 'knn',
            });
          } else {
            needsLLM.push(tx);
          }
        }
      } else {
        needsLLM.push(...batch);
      }

      // Phase 2: LLM for remaining
      if (needsLLM.length > 0) {
        const llmInputs = needsLLM.map((tx) => ({
          id: tx.id,
          vendor: tx.vendor,
          amount: Math.abs(tx.amount),
          date: tx.date,
          type: (tx.amount >= 0 ? 'debit' : 'credit') as 'debit' | 'credit',
        }));

        const llmResults = await llmCategorizer.suggestCategories(llmInputs);

        for (const tx of needsLLM) {
          const llmResult = llmResults.get(tx.id);
          if (llmResult && llmResult.confidence >= 0.5) {
            results.push({
              transactionId: tx.id,
              vendor: tx.vendor,
              amount: tx.amount,
              date: tx.date,
              currentCategory: tx.category,
              suggestedCategory: llmResult.categoryName,
              confidence: llmResult.confidence,
              reason: llmResult.reason,
              source: 'llm',
            });
          }
        }
      }

      setSuggestions(results);

      // Mark as run this session
      try {
        sessionStorage.setItem(SESSION_KEY, Date.now().toString());
      } catch {
        // sessionStorage may not be available
      }
      setHasRunThisSession(true);
    } catch (error) {
      console.error('[BatchRecategorize] Pipeline failed:', error);
    } finally {
      setIsProcessing(false);
      runningRef.current = false;
    }
  }, [getUncategorized]);

  // Auto-trigger on mount (once per session)
  useEffect(() => {
    let alreadyRun = false;
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) {
        alreadyRun = true;
        setHasRunThisSession(true);
      }
    } catch {
      // sessionStorage may not be available
    }

    if (!alreadyRun) {
      // Check if there are enough uncategorised transactions first
      void getUncategorized().then((txs) => {
        setUncategorizedCount(txs.length);
        if (txs.length >= MIN_UNCATEGORISED) {
          void runBatch();
        }
      });
    } else {
      // Still load the count for display
      void getUncategorized().then((txs) => {
        setUncategorizedCount(txs.length);
      });
    }
  }, [getUncategorized, runBatch]);

  /**
   * Apply a single suggestion: resolve category name → ID and update DB.
   */
  const applySuggestion = useCallback(
    async (transactionId: TransactionId, categoryName: string) => {
      const categories = await db.categories.toArray();
      const match = categories.find(
        (c) => (c.name as string).toLowerCase() === categoryName.toLowerCase()
      );
      const categoryId = (match?.id || categoryName) as CategoryId;

      await db.transactions.update(transactionId, {
        category: categoryId,
        updatedAt: new Date(),
      });

      // Learn from this
      const tx = await db.transactions.get(transactionId);
      if (tx?.vendor) {
        await autoCategorizer.learnCategory(tx.vendor, categoryId);
      }

      // Remove from suggestions
      setSuggestions((prev) =>
        prev.filter((s) => s.transactionId !== transactionId)
      );
      setUncategorizedCount((prev) => Math.max(0, prev - 1));
    },
    []
  );

  /**
   * Apply all suggestions at once.
   */
  const applyAll = useCallback(async (): Promise<number> => {
    let applied = 0;
    for (const s of suggestions) {
      try {
        await applySuggestion(s.transactionId, s.suggestedCategory);
        applied++;
      } catch (error) {
        console.error(
          '[BatchRecategorize] Failed to apply:',
          s.transactionId,
          error
        );
      }
    }
    return applied;
  }, [suggestions, applySuggestion]);

  /**
   * Dismiss a single suggestion.
   */
  const dismiss = useCallback((transactionId: TransactionId) => {
    setSuggestions((prev) =>
      prev.filter((s) => s.transactionId !== transactionId)
    );
  }, []);

  /**
   * Manually trigger re-categorisation.
   */
  const triggerRecategorize = useCallback(async () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    setHasRunThisSession(false);
    await runBatch();
  }, [runBatch]);

  return {
    suggestions,
    isProcessing,
    uncategorizedCount,
    applySuggestion,
    applyAll,
    dismiss,
    triggerRecategorize,
    hasRunThisSession,
  };
}
