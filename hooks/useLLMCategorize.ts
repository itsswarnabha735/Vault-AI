/**
 * useLLMCategorize Hook
 *
 * React hook that provides LLM-assisted categorization when the local
 * auto-categorizer has low confidence. Manages loading state and caching.
 *
 * Usage:
 * ```tsx
 * const { llmSuggestion, isLoading, requestLLM } = useLLMCategorize();
 *
 * // After auto-categorizer returns low confidence:
 * if (autoConfidence < 0.7) {
 *   requestLLM({ id: 'tx1', vendor: 'Shell Beach', amount: 15000, date: '2025-01-15' });
 * }
 * ```
 *
 * PRIVACY: Only structured data is sent to the LLM.
 */

import { useState, useCallback, useRef } from 'react';
import {
  llmCategorizer,
  LLM_CATEGORIZE_THRESHOLD,
  type LLMCategorySuggestion,
  type CategorizationInput,
} from '@/lib/ai/llm-categorizer';

export interface UseLLMCategorizeReturn {
  /** Current LLM suggestion (null if not yet requested or failed) */
  llmSuggestion: LLMCategorySuggestion | null;
  /** Whether an LLM request is in flight */
  isLoading: boolean;
  /** Request LLM categorization for a transaction */
  requestLLM: (
    input: CategorizationInput
  ) => Promise<LLMCategorySuggestion | null>;
  /** Clear the current suggestion */
  clearSuggestion: () => void;
  /** Confidence threshold that triggers LLM fallback */
  threshold: number;
}

export function useLLMCategorize(): UseLLMCategorizeReturn {
  const [llmSuggestion, setLlmSuggestion] =
    useState<LLMCategorySuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const lastRequestRef = useRef<string>('');

  const requestLLM = useCallback(
    async (
      input: CategorizationInput
    ): Promise<LLMCategorySuggestion | null> => {
      // Deduplicate by vendor
      const key = input.vendor.toLowerCase().trim();
      if (key === lastRequestRef.current && llmSuggestion) {
        return llmSuggestion;
      }
      lastRequestRef.current = key;

      setIsLoading(true);
      try {
        const result = await llmCategorizer.suggestCategory(input);
        setLlmSuggestion(result);
        return result;
      } catch (error) {
        console.error('[useLLMCategorize] Error:', error);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [llmSuggestion]
  );

  const clearSuggestion = useCallback(() => {
    setLlmSuggestion(null);
    lastRequestRef.current = '';
  }, []);

  return {
    llmSuggestion,
    isLoading,
    requestLLM,
    clearSuggestion,
    threshold: LLM_CATEGORIZE_THRESHOLD,
  };
}

/**
 * Batch hook for LLM categorization (used in StatementReview).
 */
export interface UseBatchLLMCategorizeReturn {
  /** Map of transaction id → LLM suggestion */
  suggestions: Map<string, LLMCategorySuggestion>;
  /** Whether any request is in flight */
  isLoading: boolean;
  /** Request batch LLM categorization */
  requestBatch: (inputs: CategorizationInput[]) => Promise<void>;
}

export function useBatchLLMCategorize(): UseBatchLLMCategorizeReturn {
  const [suggestions, setSuggestions] = useState<
    Map<string, LLMCategorySuggestion>
  >(() => new Map());
  const [isLoading, setIsLoading] = useState(false);

  const requestBatch = useCallback(async (inputs: CategorizationInput[]) => {
    if (inputs.length === 0) {
      return;
    }

    setIsLoading(true);
    try {
      const results = await llmCategorizer.suggestCategories(inputs);
      setSuggestions((prev) => {
        const merged = new Map(prev);
        for (const [id, suggestion] of results) {
          merged.set(id, suggestion);
        }
        return merged;
      });
    } catch (error) {
      console.error('[useBatchLLMCategorize] Error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { suggestions, isLoading, requestBatch };
}
