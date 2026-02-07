/**
 * ProcessingProgress Component
 *
 * Displays overall processing progress for multiple files.
 * Shows individual file progress and overall status.
 */

'use client';

import { useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { FileListProgress } from './FileProgress';
import { useDocumentProcessor } from '@/hooks/useDocumentProcessor';
import type { ProcessedDocumentResult } from '@/lib/processing/processing-worker-client';

// ============================================
// Types
// ============================================

export interface ProcessingProgressProps {
  /** Files to process */
  files: File[];

  /** Callback when processing is complete */
  onComplete: (results: ProcessedDocumentResult[]) => void;

  /** Callback when processing is cancelled */
  onCancel?: () => void;

  /** Custom class name */
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * Processing progress display for multiple files.
 *
 * @example
 * ```tsx
 * <ProcessingProgress
 *   files={selectedFiles}
 *   onComplete={(results) => handleProcessed(results)}
 * />
 * ```
 */
export function ProcessingProgress({
  files,
  onComplete,
  onCancel,
  className,
}: ProcessingProgressProps) {
  const processor = useDocumentProcessor({
    autoInitialize: true,
    onProcessingComplete: onComplete,
  });

  const {
    isReady,
    isInitializing,
    isProcessing,
    processingState,
    processFiles,
    cancelAll,
    error,
  } = processor;

  // Start processing when ready
  useEffect(() => {
    if (isReady && files.length > 0 && !isProcessing) {
      processFiles(files);
    }
  }, [isReady, files, isProcessing, processFiles]);

  // Calculate overall progress
  const overallProgress = useMemo(() => {
    if (processingState.totalFiles === 0) {
      return 0;
    }
    const fileProgresses = Array.from(processingState.files.values());
    const totalProgress = fileProgresses.reduce(
      (sum, f) => sum + f.progress,
      0
    );
    return totalProgress / processingState.totalFiles;
  }, [processingState]);

  // Get current file being processed
  const currentFile = useMemo(() => {
    return Array.from(processingState.files.values()).find(
      (f) => f.status === 'processing'
    );
  }, [processingState.files]);

  // Handle cancel
  const handleCancel = () => {
    cancelAll();
    onCancel?.();
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <LoadingSpinner className="h-5 w-5 text-primary" />
        <span className="text-lg font-medium text-foreground">
          {isInitializing
            ? 'Initializing processor...'
            : isProcessing
              ? 'Processing documents locally...'
              : 'Preparing...'}
        </span>
      </div>

      {/* Overall progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {processingState.processedCount} of {processingState.totalFiles}{' '}
            files
          </span>
          <span className="font-medium text-foreground">
            {Math.round(overallProgress)}%
          </span>
        </div>
        <Progress value={overallProgress} className="h-2" />
      </div>

      {/* File list */}
      <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
        <FileListProgress
          files={files}
          states={processingState.files}
          currentFileId={currentFile?.fileId}
        />
      </div>

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          <ErrorIcon className="h-4 w-4 shrink-0" />
          <span>{error.message}</span>
        </div>
      )}

      {/* Privacy notice */}
      <div className="flex items-start gap-2 rounded-lg bg-muted p-3">
        <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
        <div className="text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Privacy Protected</p>
          <p className="mt-0.5">
            Your documents are processed entirely on your device. No files are
            uploaded to any server.
          </p>
        </div>
      </div>

      {/* Cancel button */}
      {isProcessing && onCancel && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Processing Summary
// ============================================

export interface ProcessingSummaryProps {
  /** Total files */
  totalFiles: number;

  /** Successfully processed */
  successCount: number;

  /** Failed count */
  errorCount: number;

  /** Custom class name */
  className?: string;
}

/**
 * Summary of processing results.
 */
export function ProcessingSummary({
  totalFiles,
  successCount,
  errorCount,
  className,
}: ProcessingSummaryProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-6 rounded-lg border border-border p-4',
        className
      )}
    >
      <div className="text-center">
        <p className="text-2xl font-bold text-foreground">{totalFiles}</p>
        <p className="text-xs text-muted-foreground">Total</p>
      </div>
      <div className="h-8 w-px bg-border" />
      <div className="text-center">
        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
          {successCount}
        </p>
        <p className="text-xs text-muted-foreground">Success</p>
      </div>
      {errorCount > 0 && (
        <>
          <div className="h-8 w-px bg-border" />
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {errorCount}
            </p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// Icons
// ============================================

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

export default ProcessingProgress;
