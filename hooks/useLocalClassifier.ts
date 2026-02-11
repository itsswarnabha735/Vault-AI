/**
 * useLocalClassifier Hook (4C)
 *
 * Manages the local linear classifier lifecycle:
 * - Auto-trains on first load if enough labelled data exists
 * - Provides incremental update function for when user categorises new transactions
 * - Exposes classifier stats and training controls
 *
 * PRIVACY: All training runs locally in the browser.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { localClassifier } from '@/lib/ai/local-classifier';

export interface UseLocalClassifierReturn {
  /** Whether the classifier is trained and ready for inference */
  isReady: boolean;
  /** Whether training is in progress */
  isTraining: boolean;
  /** Number of classes the classifier knows */
  numClasses: number;
  /** Number of training samples used */
  trainingSamples: number;
  /** When the classifier was last trained */
  lastTrained: Date | null;
  /** Trigger a full retrain */
  retrain: () => Promise<void>;
  /** Predict a category from an embedding */
  predict: (embedding: Float32Array | number[]) => Promise<{
    categoryId: string;
    confidence: number;
  } | null>;
}

/** Session key to avoid redundant auto-train */
const AUTO_TRAIN_KEY = 'vault-ai-classifier-trained';

export function useLocalClassifier(): UseLocalClassifierReturn {
  const [isReady, setIsReady] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [numClasses, setNumClasses] = useState(0);
  const [trainingSamples, setTrainingSamples] = useState(0);
  const [lastTrained, setLastTrained] = useState<Date | null>(null);
  const initRef = useRef(false);

  // Load stats and auto-train on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    void (async () => {
      // Try to load existing weights
      const loaded = await localClassifier.loadWeights();
      if (loaded) {
        const stats = await localClassifier.getStats();
        setIsReady(stats.isTrained);
        setNumClasses(stats.numClasses);
        setTrainingSamples(stats.trainingSamples);
        setLastTrained(stats.lastTrained);
        return;
      }

      // Auto-train if we haven't this session
      let alreadyTrained = false;
      try {
        alreadyTrained = !!sessionStorage.getItem(AUTO_TRAIN_KEY);
      } catch {
        // ignore
      }

      if (!alreadyTrained) {
        setIsTraining(true);
        try {
          const result = await localClassifier.train();
          if (result) {
            setIsReady(true);
            setNumClasses(result.numClasses);
            setTrainingSamples(result.numSamples);
            setLastTrained(new Date());
            try {
              sessionStorage.setItem(AUTO_TRAIN_KEY, Date.now().toString());
            } catch {
              // ignore
            }
          }
        } catch (error) {
          console.error('[useLocalClassifier] Auto-train failed:', error);
        } finally {
          setIsTraining(false);
        }
      }
    })();
  }, []);

  const retrain = useCallback(async () => {
    setIsTraining(true);
    try {
      const result = await localClassifier.train();
      if (result) {
        setIsReady(true);
        setNumClasses(result.numClasses);
        setTrainingSamples(result.numSamples);
        setLastTrained(new Date());
      }
    } catch (error) {
      console.error('[useLocalClassifier] Retrain failed:', error);
    } finally {
      setIsTraining(false);
    }
  }, []);

  const predict = useCallback(
    async (
      embedding: Float32Array | number[]
    ): Promise<{ categoryId: string; confidence: number } | null> => {
      const result = await localClassifier.predict(embedding);
      if (!result) return null;
      return {
        categoryId: result.categoryId as string,
        confidence: result.confidence,
      };
    },
    []
  );

  return {
    isReady,
    isTraining,
    numClasses,
    trainingSamples,
    lastTrained,
    retrain,
    predict,
  };
}
