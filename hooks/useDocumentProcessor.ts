/**
 * useDocumentProcessor Hook for Vault-AI
 *
 * React hook for document processing operations.
 * Provides a clean API for processing single files, batches,
 * tracking progress, and handling errors.
 *
 * PRIVACY: All processing happens locally via Web Workers.
 * No document data is transmitted to external servers.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  processingWorkerClient,
  type WorkerProcessingProgress,
  type WorkerProcessingOptions,
  type ProcessedDocumentResult,
  type ValidationResult,
} from '@/lib/processing/processing-worker-client';

// ============================================
// Types
// ============================================

/**
 * Processing state for a single file.
 */
export interface FileProcessingState {
  fileId: string;
  fileName: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  stage: WorkerProcessingProgress['stage'];
  progress: number;
  currentPage?: number;
  totalPages?: number;
  error?: string;
  result?: ProcessedDocumentResult;
}

/**
 * Batch processing state.
 */
export interface BatchProcessingState {
  isProcessing: boolean;
  totalFiles: number;
  processedCount: number;
  successCount: number;
  errorCount: number;
  files: Map<string, FileProcessingState>;
}

/**
 * Hook options.
 */
export interface UseDocumentProcessorOptions {
  /** Auto-initialize the worker on mount */
  autoInitialize?: boolean;

  /** Options passed to the worker */
  processingOptions?: WorkerProcessingOptions;

  /** Callback when processing starts */
  onProcessingStart?: () => void;

  /** Callback when processing completes */
  onProcessingComplete?: (results: ProcessedDocumentResult[]) => void;

  /** Callback on error */
  onError?: (error: Error, fileName?: string) => void;
}

/**
 * Hook return type.
 */
export interface UseDocumentProcessorReturn {
  /** Whether the worker is ready */
  isReady: boolean;

  /** Whether the worker is initializing */
  isInitializing: boolean;

  /** Whether processing is in progress */
  isProcessing: boolean;

  /** Current processing state for all files */
  processingState: BatchProcessingState;

  /** Last error that occurred */
  error: Error | null;

  /** Initialize the worker */
  initialize: () => Promise<void>;

  /** Validate a file */
  validateFile: (file: File) => Promise<ValidationResult>;

  /** Process a single file */
  processFile: (
    file: File,
    options?: WorkerProcessingOptions
  ) => Promise<ProcessedDocumentResult>;

  /** Process multiple files */
  processFiles: (
    files: File[],
    options?: WorkerProcessingOptions
  ) => Promise<ProcessedDocumentResult[]>;

  /** Cancel processing of a specific file */
  cancelProcessing: (fileId: string) => void;

  /** Cancel all processing */
  cancelAll: () => void;

  /** Reset the processing state */
  reset: () => void;

  /** Terminate the worker */
  terminate: () => Promise<void>;
}

// ============================================
// Initial State
// ============================================

const initialBatchState: BatchProcessingState = {
  isProcessing: false,
  totalFiles: 0,
  processedCount: 0,
  successCount: 0,
  errorCount: 0,
  files: new Map(),
};

// ============================================
// useDocumentProcessor Hook
// ============================================

/**
 * Hook for document processing operations.
 */
export function useDocumentProcessor(
  options: UseDocumentProcessorOptions = {}
): UseDocumentProcessorReturn {
  const {
    autoInitialize = true,
    processingOptions,
    onProcessingStart,
    onProcessingComplete,
    onError,
  } = options;

  // State
  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [processingState, setProcessingState] =
    useState<BatchProcessingState>(initialBatchState);

  // Refs
  const cancelledFileIds = useRef<Set<string>>(new Set());
  const resultsRef = useRef<ProcessedDocumentResult[]>([]);
  const processingGuardRef = useRef(false); // Prevents concurrent processFiles calls

  /**
   * Initialize the worker.
   */
  const initialize = useCallback(async () => {
    if (isReady || isInitializing) {
      return;
    }

    setIsInitializing(true);
    setError(null);

    try {
      await processingWorkerClient.initialize();
      setIsReady(true);
    } catch (err) {
      const initError =
        err instanceof Error ? err : new Error('Failed to initialize worker');
      setError(initError);
      onError?.(initError);
    } finally {
      setIsInitializing(false);
    }
  }, [isReady, isInitializing, onError]);

  /**
   * Auto-initialize on mount.
   */
  useEffect(() => {
    if (autoInitialize) {
      void initialize();
    }

    return () => {
      // Clean up cancelled file IDs on unmount
      cancelledFileIds.current.clear();
    };
  }, [autoInitialize, initialize]);

  /**
   * Handle progress updates from the worker.
   */
  const handleProgress = useCallback((progress: WorkerProcessingProgress) => {
    setProcessingState((prev) => {
      const newFiles = new Map(prev.files);
      const existing = newFiles.get(progress.fileId);

      const newState: FileProcessingState = {
        fileId: progress.fileId,
        fileName: progress.fileName,
        status:
          progress.stage === 'complete'
            ? 'complete'
            : progress.stage === 'error'
              ? 'error'
              : 'processing',
        stage: progress.stage,
        progress: progress.progress,
        currentPage: progress.currentPage,
        totalPages: progress.totalPages,
        error: progress.error?.message,
        result: existing?.result,
      };

      newFiles.set(progress.fileId, newState);

      // Update counts
      let processedCount = 0;
      let successCount = 0;
      let errorCount = 0;

      newFiles.forEach((file) => {
        if (file.status === 'complete') {
          processedCount++;
          successCount++;
        } else if (file.status === 'error') {
          processedCount++;
          errorCount++;
        }
      });

      return {
        ...prev,
        files: newFiles,
        processedCount,
        successCount,
        errorCount,
      };
    });
  }, []);

  /**
   * Validate a file.
   */
  const validateFile = useCallback(
    async (file: File): Promise<ValidationResult> => {
      await initialize();
      return processingWorkerClient.validateFile(file);
    },
    [initialize]
  );

  /**
   * Process a single file.
   */
  const processFile = useCallback(
    async (
      file: File,
      opts?: WorkerProcessingOptions
    ): Promise<ProcessedDocumentResult> => {
      await initialize();

      setIsProcessing(true);
      setError(null);
      onProcessingStart?.();

      // Set up progress callback
      processingWorkerClient.setProgressCallback(handleProgress);

      // Initialize state for this file
      const tempFileId = `temp-${Date.now()}`;
      setProcessingState((prev) => ({
        ...prev,
        isProcessing: true,
        totalFiles: 1,
        processedCount: 0,
        successCount: 0,
        errorCount: 0,
        files: new Map([
          [
            tempFileId,
            {
              fileId: tempFileId,
              fileName: file.name,
              status: 'pending',
              stage: 'validating',
              progress: 0,
            },
          ],
        ]),
      }));

      try {
        const result = await processingWorkerClient.processDocument(
          file,
          opts || processingOptions
        );

        // Update state with result
        setProcessingState((prev) => {
          const newFiles = new Map(prev.files);
          const fileState = newFiles.get(tempFileId);

          if (fileState) {
            newFiles.set(result.id, {
              ...fileState,
              fileId: result.id,
              status: 'complete',
              stage: 'complete',
              progress: 100,
              result,
            });
            newFiles.delete(tempFileId);
          }

          return {
            ...prev,
            isProcessing: false,
            processedCount: 1,
            successCount: 1,
            files: newFiles,
          };
        });

        onProcessingComplete?.([result]);
        return result;
      } catch (err) {
        const processError =
          err instanceof Error ? err : new Error('Processing failed');
        setError(processError);
        onError?.(processError, file.name);

        setProcessingState((prev) => ({
          ...prev,
          isProcessing: false,
          processedCount: 1,
          errorCount: 1,
        }));

        throw processError;
      } finally {
        setIsProcessing(false);
        processingWorkerClient.setProgressCallback(null);
      }
    },
    [
      initialize,
      handleProgress,
      processingOptions,
      onProcessingStart,
      onProcessingComplete,
      onError,
    ]
  );

  /**
   * Process multiple files.
   */
  const processFiles = useCallback(
    async (
      files: File[],
      opts?: WorkerProcessingOptions
    ): Promise<ProcessedDocumentResult[]> => {
      if (files.length === 0) {
        return [];
      }

      // Prevent concurrent calls (e.g., from React re-renders during async onComplete)
      if (processingGuardRef.current) {
        console.log(
          '[useDocumentProcessor] Skipping duplicate processFiles call'
        );
        return [];
      }
      processingGuardRef.current = true;

      await initialize();

      setIsProcessing(true);
      setError(null);
      resultsRef.current = [];
      cancelledFileIds.current.clear();
      onProcessingStart?.();

      // Set up progress callback
      processingWorkerClient.setProgressCallback(handleProgress);

      // Initialize state for all files
      const initialFiles = new Map<string, FileProcessingState>();
      files.forEach((file, index) => {
        const tempId = `pending-${index}`;
        initialFiles.set(tempId, {
          fileId: tempId,
          fileName: file.name,
          status: 'pending',
          stage: 'validating',
          progress: 0,
        });
      });

      setProcessingState({
        isProcessing: true,
        totalFiles: files.length,
        processedCount: 0,
        successCount: 0,
        errorCount: 0,
        files: initialFiles,
      });

      const results: ProcessedDocumentResult[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) {
          continue;
        }

        // Check if cancelled
        if (cancelledFileIds.current.has(`pending-${i}`)) {
          continue;
        }

        try {
          const result = await processingWorkerClient.processDocument(
            file,
            opts || processingOptions
          );

          results.push(result);
          resultsRef.current.push(result);

          // Update state
          setProcessingState((prev) => {
            const newFiles = new Map(prev.files);
            newFiles.set(result.id, {
              fileId: result.id,
              fileName: file.name,
              status: 'complete',
              stage: 'complete',
              progress: 100,
              result,
            });
            newFiles.delete(`pending-${i}`);

            return {
              ...prev,
              files: newFiles,
              processedCount: prev.processedCount + 1,
              successCount: prev.successCount + 1,
            };
          });
        } catch (err) {
          const processError =
            err instanceof Error ? err : new Error('Processing failed');
          onError?.(processError, file.name);

          setProcessingState((prev) => ({
            ...prev,
            processedCount: prev.processedCount + 1,
            errorCount: prev.errorCount + 1,
          }));
        }
      }

      setIsProcessing(false);
      setProcessingState((prev) => ({
        ...prev,
        isProcessing: false,
      }));

      processingWorkerClient.setProgressCallback(null);

      // Call onComplete and wait for it (it may be async, e.g., LLM parsing)
      try {
        await onProcessingComplete?.(results);
      } catch (e) {
        console.error('[useDocumentProcessor] onProcessingComplete error:', e);
      }

      processingGuardRef.current = false;
      return results;
    },
    [
      initialize,
      handleProgress,
      processingOptions,
      onProcessingStart,
      onProcessingComplete,
      onError,
    ]
  );

  /**
   * Cancel processing of a specific file.
   */
  const cancelProcessing = useCallback((fileId: string) => {
    cancelledFileIds.current.add(fileId);
    void processingWorkerClient.cancelProcessing(fileId);

    setProcessingState((prev) => {
      const newFiles = new Map(prev.files);
      const file = newFiles.get(fileId);

      if (file && file.status === 'processing') {
        newFiles.set(fileId, {
          ...file,
          status: 'error',
          error: 'Cancelled',
        });

        return {
          ...prev,
          files: newFiles,
          processedCount: prev.processedCount + 1,
          errorCount: prev.errorCount + 1,
        };
      }

      return prev;
    });
  }, []);

  /**
   * Cancel all processing.
   */
  const cancelAll = useCallback(() => {
    processingState.files.forEach((file) => {
      if (file.status === 'processing' || file.status === 'pending') {
        cancelledFileIds.current.add(file.fileId);
        void processingWorkerClient.cancelProcessing(file.fileId);
      }
    });

    setIsProcessing(false);
    setProcessingState((prev) => ({
      ...prev,
      isProcessing: false,
    }));
  }, [processingState.files]);

  /**
   * Reset the processing state.
   */
  const reset = useCallback(() => {
    cancelledFileIds.current.clear();
    resultsRef.current = [];
    processingGuardRef.current = false;
    setIsProcessing(false);
    setError(null);
    setProcessingState(initialBatchState);
  }, []);

  /**
   * Terminate the worker.
   */
  const terminate = useCallback(async () => {
    await processingWorkerClient.terminate();
    setIsReady(false);
    reset();
  }, [reset]);

  return {
    isReady,
    isInitializing,
    isProcessing,
    processingState,
    error,
    initialize,
    validateFile,
    processFile,
    processFiles,
    cancelProcessing,
    cancelAll,
    reset,
    terminate,
  };
}

// ============================================
// Additional Convenience Hooks
// ============================================

/**
 * Hook for just validating files.
 */
export function useFileValidator() {
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);

  const validate = useCallback(
    async (file: File): Promise<ValidationResult> => {
      setIsValidating(true);
      try {
        await processingWorkerClient.initialize();
        const result = await processingWorkerClient.validateFile(file);
        setValidationResult(result);
        return result;
      } finally {
        setIsValidating(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setValidationResult(null);
  }, []);

  return {
    isValidating,
    validationResult,
    validate,
    reset,
  };
}

/**
 * Hook for processing state only (for display components).
 */
export function useProcessingStatus() {
  const [status, setStatus] = useState({
    isReady: processingWorkerClient.isReady(),
    isProcessing: false,
  });

  useEffect(() => {
    const checkStatus = () => {
      setStatus({
        isReady: processingWorkerClient.isReady(),
        isProcessing: false, // Would need more tracking
      });
    };

    // Check periodically
    const interval = setInterval(checkStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  return status;
}
