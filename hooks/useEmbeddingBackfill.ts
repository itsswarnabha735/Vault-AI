/**
 * useEmbeddingBackfill Hook
 *
 * Triggers eager embedding generation for transactions that have
 * zero-filled placeholder embeddings. Runs once per session on
 * dashboard load.
 *
 * PRIVACY: All embedding generation happens locally.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  embeddingBackfill,
  type BackfillProgress,
} from '@/lib/ai/embedding-backfill';

export interface UseEmbeddingBackfillReturn {
  /** Current progress */
  progress: BackfillProgress;
  /** Whether backfill is running */
  isRunning: boolean;
  /** Manually trigger a backfill */
  runBackfill: () => Promise<void>;
}

export function useEmbeddingBackfill(): UseEmbeddingBackfillReturn {
  const [progress, setProgress] = useState<BackfillProgress>({
    total: 0,
    completed: 0,
    status: 'idle',
  });
  const startedRef = useRef(false);

  // Auto-trigger once per session on mount
  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    void embeddingBackfill.runOncePerSession(setProgress);
  }, []);

  const runBackfill = useCallback(async () => {
    await embeddingBackfill.run(setProgress);
  }, []);

  return {
    progress,
    isRunning:
      progress.status === 'running' || progress.status === 'initializing',
    runBackfill,
  };
}
