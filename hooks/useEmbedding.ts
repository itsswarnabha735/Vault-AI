/**
 * React Hook for Embedding Generation
 *
 * Provides reactive access to the embedding service with:
 * - Model loading state with progress
 * - Embed functions for single and batch text
 * - Error handling
 * - Auto-initialization option
 *
 * PRIVACY: All embedding operations run locally in a Web Worker.
 * Embeddings are NEVER transmitted to external servers.
 */

'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  getEmbeddingWorkerClient,
  initializeEmbeddingWorker,
  terminateEmbeddingWorker,
  type ProgressCallback,
} from '@/lib/ai/embedding-worker-client';
import type {
  WorkerModelStatus,
  WorkerEmbeddingResult,
  WorkerBatchResult,
} from '@/workers/embedding.worker';

// ============================================
// Types
// ============================================

/**
 * Model loading status.
 */
export type ModelLoadingStatus =
  | 'idle'
  | 'initiating'
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'error';

/**
 * Progress information during model loading.
 */
export interface EmbeddingProgress {
  /** Current status */
  status: ModelLoadingStatus;

  /** Progress percentage (0-100) */
  progress: number;

  /** Currently downloading file */
  file?: string;

  /** Total bytes to download */
  totalBytes?: number;

  /** Bytes downloaded so far */
  loadedBytes?: number;

  /** Error message if status is 'error' */
  error?: string;
}

/**
 * Options for the useEmbedding hook.
 */
export interface UseEmbeddingOptions {
  /** Whether to initialize the model automatically on mount */
  autoInitialize?: boolean;

  /** Callback when model is ready */
  onReady?: () => void;

  /** Callback when an error occurs */
  onError?: (error: Error) => void;

  /** Callback for progress updates */
  onProgress?: (progress: EmbeddingProgress) => void;
}

/**
 * Return type for the useEmbedding hook.
 */
export interface UseEmbeddingReturn {
  // State
  /** Whether the model is ready for inference */
  isReady: boolean;

  /** Whether the model is currently loading */
  isLoading: boolean;

  /** Whether an embedding operation is in progress */
  isEmbedding: boolean;

  /** Current loading status */
  status: ModelLoadingStatus;

  /** Loading progress (0-100) */
  progress: number;

  /** Detailed progress information */
  progressDetails: EmbeddingProgress;

  /** Model status information */
  modelStatus: WorkerModelStatus | null;

  /** Error if any operation failed */
  error: Error | null;

  // Actions
  /** Initialize the model */
  initialize: () => Promise<void>;

  /** Generate embedding for a single text */
  embedText: (text: string) => Promise<Float32Array>;

  /** Generate embedding with detailed result */
  embedTextWithDetails: (text: string) => Promise<WorkerEmbeddingResult>;

  /** Generate embeddings for multiple texts */
  embedBatch: (texts: string[]) => Promise<Float32Array[]>;

  /** Generate batch embeddings with detailed result */
  embedBatchWithDetails: (texts: string[]) => Promise<WorkerBatchResult>;

  /** Warm up the model */
  warmup: () => Promise<void>;

  /** Reset error state */
  resetError: () => void;
}

// ============================================
// Default Progress State
// ============================================

const DEFAULT_PROGRESS: EmbeddingProgress = {
  status: 'idle',
  progress: 0,
};

// ============================================
// useEmbedding Hook
// ============================================

/**
 * Hook for embedding generation with the Web Worker.
 *
 * @param options - Hook options
 * @returns Embedding state and functions
 *
 * @example
 * ```tsx
 * function SearchBar() {
 *   const {
 *     isReady,
 *     isLoading,
 *     progress,
 *     embedText,
 *     initialize,
 *     error
 *   } = useEmbedding({ autoInitialize: true });
 *
 *   const handleSearch = async (query: string) => {
 *     if (!isReady) return;
 *     const embedding = await embedText(query);
 *     // Use embedding for search...
 *   };
 *
 *   if (isLoading) {
 *     return <ProgressBar value={progress} />;
 *   }
 *
 *   return <input onChange={(e) => handleSearch(e.target.value)} />;
 * }
 * ```
 */
export function useEmbedding(
  options: UseEmbeddingOptions = {}
): UseEmbeddingReturn {
  const { autoInitialize = false, onReady, onError, onProgress } = options;

  // State
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [progressDetails, setProgressDetails] =
    useState<EmbeddingProgress>(DEFAULT_PROGRESS);
  const [modelStatus, setModelStatus] = useState<WorkerModelStatus | null>(
    null
  );
  const [error, setError] = useState<Error | null>(null);

  // Refs for callbacks to avoid stale closures
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onProgressRef = useRef(onProgress);
  const initializingRef = useRef(false);

  // Update refs
  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
    onProgressRef.current = onProgress;
  }, [onReady, onError, onProgress]);

  // Progress callback for initialization
  const handleProgress: ProgressCallback = useCallback((progress) => {
    const embeddingProgress: EmbeddingProgress = {
      status: progress.status as ModelLoadingStatus,
      progress: progress.progress,
      file: progress.file,
      totalBytes: progress.totalBytes,
      loadedBytes: progress.loadedBytes,
      error: progress.error,
    };

    setProgressDetails(embeddingProgress);

    // Call external progress callback
    onProgressRef.current?.(embeddingProgress);
  }, []);

  // Initialize the model
  const initialize = useCallback(async () => {
    // Prevent multiple simultaneous initializations
    if (initializingRef.current || isReady) {
      return;
    }

    initializingRef.current = true;
    setIsLoading(true);
    setError(null);
    setProgressDetails({ ...DEFAULT_PROGRESS, status: 'initiating' });

    try {
      const client = await initializeEmbeddingWorker(handleProgress);

      // Get model status
      const status = await client.getStatusAsync();
      setModelStatus(status);
      setIsReady(true);
      setProgressDetails({ status: 'ready', progress: 100 });

      // Notify ready callback
      onReadyRef.current?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setProgressDetails({
        status: 'error',
        progress: 0,
        error: error.message,
      });

      // Notify error callback
      onErrorRef.current?.(error);
    } finally {
      setIsLoading(false);
      initializingRef.current = false;
    }
  }, [isReady, handleProgress]);

  // Embed single text
  const embedText = useCallback(
    async (text: string): Promise<Float32Array> => {
      if (!isReady) {
        throw new Error('Model not initialized. Call initialize() first.');
      }

      setIsEmbedding(true);
      setError(null);

      try {
        const client = getEmbeddingWorkerClient();
        const embedding = await client.embedText(text);
        return embedding;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onErrorRef.current?.(error);
        throw error;
      } finally {
        setIsEmbedding(false);
      }
    },
    [isReady]
  );

  // Embed single text with details
  const embedTextWithDetails = useCallback(
    async (text: string): Promise<WorkerEmbeddingResult> => {
      if (!isReady) {
        throw new Error('Model not initialized. Call initialize() first.');
      }

      setIsEmbedding(true);
      setError(null);

      try {
        const client = getEmbeddingWorkerClient();
        const result = await client.embedTextWithDetails(text);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onErrorRef.current?.(error);
        throw error;
      } finally {
        setIsEmbedding(false);
      }
    },
    [isReady]
  );

  // Embed batch of texts
  const embedBatch = useCallback(
    async (texts: string[]): Promise<Float32Array[]> => {
      if (!isReady) {
        throw new Error('Model not initialized. Call initialize() first.');
      }

      setIsEmbedding(true);
      setError(null);

      try {
        const client = getEmbeddingWorkerClient();
        const embeddings = await client.embedBatch(texts);
        return embeddings;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onErrorRef.current?.(error);
        throw error;
      } finally {
        setIsEmbedding(false);
      }
    },
    [isReady]
  );

  // Embed batch with details
  const embedBatchWithDetails = useCallback(
    async (texts: string[]): Promise<WorkerBatchResult> => {
      if (!isReady) {
        throw new Error('Model not initialized. Call initialize() first.');
      }

      setIsEmbedding(true);
      setError(null);

      try {
        const client = getEmbeddingWorkerClient();
        const result = await client.embedBatchWithDetails(texts);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        onErrorRef.current?.(error);
        throw error;
      } finally {
        setIsEmbedding(false);
      }
    },
    [isReady]
  );

  // Warm up the model
  const warmup = useCallback(async () => {
    if (!isReady) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    try {
      const client = getEmbeddingWorkerClient();
      await client.warmup();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, [isReady]);

  // Reset error state
  const resetError = useCallback(() => {
    setError(null);
  }, []);

  // Auto-initialize on mount if option is enabled
  useEffect(() => {
    if (autoInitialize && !isReady && !isLoading && !initializingRef.current) {
      initialize();
    }
  }, [autoInitialize, isReady, isLoading, initialize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Note: We don't terminate the worker on unmount to allow
      // other components to continue using it. Use terminateEmbeddingWorker()
      // explicitly if you need to clean up.
    };
  }, []);

  // Derived state
  const status = progressDetails.status;
  const progress = progressDetails.progress;

  return {
    // State
    isReady,
    isLoading,
    isEmbedding,
    status,
    progress,
    progressDetails,
    modelStatus,
    error,

    // Actions
    initialize,
    embedText,
    embedTextWithDetails,
    embedBatch,
    embedBatchWithDetails,
    warmup,
    resetError,
  };
}

// ============================================
// useEmbeddingModel Hook (Simple)
// ============================================

/**
 * Simplified hook for just the model loading state.
 *
 * Use this when you only need to know if the model is ready
 * and don't need embedding functions.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { isReady, isLoading, progress } = useEmbeddingModel();
 *
 *   if (!isReady) {
 *     return <ModelLoadingIndicator progress={progress} />;
 *   }
 *
 *   return <MainContent />;
 * }
 * ```
 */
export function useEmbeddingModel() {
  const {
    isReady,
    isLoading,
    status,
    progress,
    progressDetails,
    error,
    initialize,
  } = useEmbedding();

  return {
    isReady,
    isLoading,
    status,
    progress,
    progressDetails,
    error,
    initialize,
  };
}

// ============================================
// useEmbeddingStatus Hook
// ============================================

/**
 * Hook to get the current model status.
 *
 * @param refreshInterval - Interval to refresh status (0 to disable)
 *
 * @example
 * ```tsx
 * function StatusPanel() {
 *   const { status, backend, memoryUsage } = useEmbeddingStatus(5000);
 *
 *   return (
 *     <div>
 *       <p>Backend: {backend}</p>
 *       <p>Memory: {formatBytes(memoryUsage)}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useEmbeddingStatus(refreshInterval: number = 0) {
  const [status, setStatus] = useState<WorkerModelStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const client = getEmbeddingWorkerClient();
      if (await client.isReadyAsync()) {
        setIsRefreshing(true);
        const newStatus = await client.getStatusAsync();
        setStatus(newStatus);
      }
    } catch {
      // Ignore errors during status refresh
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Periodic refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(refresh, refreshInterval);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [refresh, refreshInterval]);

  // Formatted values
  const formattedStatus = useMemo(() => {
    if (!status) {
      return null;
    }

    return {
      ...status,
      memoryFormatted: formatBytes(status.memoryUsage),
      lastInferenceFormatted: status.lastInferenceTime
        ? `${status.lastInferenceTime.toFixed(2)}ms`
        : 'N/A',
    };
  }, [status]);

  return {
    status,
    formattedStatus,
    isRefreshing,
    refresh,

    // Convenience accessors
    isReady: status?.loaded ?? false,
    backend: status?.backend ?? 'cpu',
    memoryUsage: status?.memoryUsage ?? 0,
    lastInferenceTime: status?.lastInferenceTime ?? 0,
    isInferring: status?.isInferring ?? false,
    error: status?.error ?? null,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Export the termination function for cleanup
export { terminateEmbeddingWorker };
