/**
 * FileProgress Component
 *
 * Displays processing progress for a single file.
 * Shows stage, progress bar, and status indicators.
 */

'use client';

import { cn, formatFileSize } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import type { FileProcessingState } from '@/hooks/useDocumentProcessor';

// ============================================
// Types
// ============================================

export interface FileProgressProps {
  /** File being processed */
  file: File;

  /** Processing state for this file */
  state?: FileProcessingState;

  /** Whether this is the currently processing file */
  isCurrent?: boolean;

  /** Custom class name */
  className?: string;
}

// ============================================
// Stage Labels
// ============================================

const stageLabels: Record<string, string> = {
  idle: 'Waiting...',
  loading: 'Loading file...',
  extracting: 'Extracting text...',
  ocr: 'Running OCR...',
  'ocr-page': 'Running OCR...',
  analyzing: 'Analyzing...',
  embedding: 'Generating embedding...',
  complete: 'Complete',
  error: 'Error',
};

// ============================================
// Component
// ============================================

/**
 * Single file processing progress.
 *
 * @example
 * ```tsx
 * <FileProgress
 *   file={file}
 *   state={processingState}
 *   isCurrent={true}
 * />
 * ```
 */
export function FileProgress({
  file,
  state,
  isCurrent = false,
  className,
}: FileProgressProps) {
  const status = state?.status || 'pending';
  const stage = state?.stage || 'idle';
  const progress = state?.progress || 0;
  const error = state?.error;

  // Get stage label with page info for multi-page PDFs
  const getStageLabel = () => {
    // Check for page-level progress during OCR
    if (stage === 'ocr' && state?.currentPage && state?.totalPages) {
      return `OCR page ${state.currentPage}/${state.totalPages}`;
    }
    return stageLabels[stage] || stage;
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border p-3 transition-colors',
        isCurrent && 'border-primary/50 bg-primary/5',
        status === 'complete' && 'border-green-500/50 bg-green-500/5',
        status === 'error' && 'border-red-500/50 bg-red-500/5',
        className
      )}
    >
      {/* File type icon */}
      <FileTypeIcon mimeType={file.type} className="h-8 w-8 shrink-0" />

      {/* File info and progress */}
      <div className="min-w-0 flex-1">
        {/* File name and size */}
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {file.name}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatFileSize(file.size)}
          </span>
        </div>

        {/* Progress bar */}
        {status === 'processing' && (
          <Progress value={progress} className="mt-2 h-1.5" />
        )}

        {/* Stage label or error */}
        <div className="mt-1 flex items-center gap-2">
          {status === 'processing' && (
            <>
              <LoadingSpinner className="h-3 w-3 text-primary" />
              <span className="text-xs text-muted-foreground">
                {getStageLabel()} - {Math.round(progress)}%
              </span>
            </>
          )}
          {status === 'complete' && (
            <>
              <CheckIcon className="h-3 w-3 text-green-500" />
              <span className="text-xs text-green-600 dark:text-green-400">
                Complete
              </span>
            </>
          )}
          {status === 'error' && (
            <>
              <ErrorIcon className="h-3 w-3 text-red-500" />
              <span className="text-xs text-red-600 dark:text-red-400">
                {error || 'Processing failed'}
              </span>
            </>
          )}
          {status === 'pending' && (
            <span className="text-xs text-muted-foreground">Waiting...</span>
          )}
        </div>
      </div>

      {/* Status indicator */}
      <div className="shrink-0">
        {status === 'processing' && (
          <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        )}
        {status === 'complete' && (
          <CheckCircleIcon className="h-5 w-5 text-green-500" />
        )}
        {status === 'error' && (
          <ErrorCircleIcon className="h-5 w-5 text-red-500" />
        )}
      </div>
    </div>
  );
}

// ============================================
// File List Progress
// ============================================

export interface FileListProgressProps {
  /** Files to display */
  files: File[];

  /** Processing states by file ID */
  states: Map<string, FileProcessingState>;

  /** Current file being processed */
  currentFileId?: string;

  /** Custom class name */
  className?: string;
}

/**
 * List of file progress items.
 */
export function FileListProgress({
  files,
  states,
  currentFileId,
  className,
}: FileListProgressProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {files.map((file) => {
        // Find state by file name match
        const state = Array.from(states.values()).find(
          (s) => s.fileName === file.name
        );
        const isCurrent = state?.fileId === currentFileId;

        return (
          <FileProgress
            key={file.name}
            file={file}
            state={state}
            isCurrent={isCurrent}
          />
        );
      })}
    </div>
  );
}

// ============================================
// File Type Icon
// ============================================

interface FileTypeIconProps {
  mimeType: string;
  className?: string;
}

function FileTypeIcon({ mimeType, className }: FileTypeIconProps) {
  const isPDF = mimeType.includes('pdf');
  const isImage = mimeType.startsWith('image/');

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-lg bg-muted',
        className
      )}
    >
      {isPDF ? (
        <svg
          className="h-4 w-4 text-red-500"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M8 16H10V14H8V16ZM8 12H10V10H8V12ZM14 16H16V14H14V16ZM14 12H16V10H14V12ZM6 20C5.45 20 4.97917 19.8042 4.5875 19.4125C4.19583 19.0208 4 18.55 4 18V6C4 5.45 4.19583 4.97917 4.5875 4.5875C4.97917 4.19583 5.45 4 6 4H14L20 10V18C20 18.55 19.8042 19.0208 19.4125 19.4125C19.0208 19.8042 18.55 20 18 20H6ZM13 11V6H6V18H18V11H13Z" />
        </svg>
      ) : isImage ? (
        <svg
          className="h-4 w-4 text-blue-500"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M5 21C4.45 21 3.97917 20.8042 3.5875 20.4125C3.19583 20.0208 3 19.55 3 19V5C3 4.45 3.19583 3.97917 3.5875 3.5875C3.97917 3.19583 4.45 3 5 3H19C19.55 3 20.0208 3.19583 20.4125 3.5875C20.8042 3.97917 21 4.45 21 5V19C21 19.55 20.8042 20.0208 20.4125 20.4125C20.0208 20.8042 19.55 21 19 21H5ZM5 19H19V5H5V19ZM6 17H18L14.25 12L11.25 16L9 13L6 17Z" />
        </svg>
      ) : (
        <svg
          className="h-4 w-4 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M6 20C5.45 20 4.97917 19.8042 4.5875 19.4125C4.19583 19.0208 4 18.55 4 18V6C4 5.45 4.19583 4.97917 4.5875 4.5875C4.97917 4.19583 5.45 4 6 4H14L20 10V18C20 18.55 19.8042 19.0208 19.4125 19.4125C19.0208 19.8042 18.55 20 18 20H6ZM13 11V6H6V18H18V11H13Z" />
        </svg>
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
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
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
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
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function ErrorCircleIcon({ className }: { className?: string }) {
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
        d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

export default FileProgress;
