/**
 * Model Loading Indicator Component
 *
 * Displays the loading progress for the embedding model with:
 * - Download progress bar
 * - Model size information
 * - Backend detection (WebGL/WASM/CPU)
 * - Error state handling
 *
 * PRIVACY: This component displays progress for a model that runs
 * entirely locally - no data is ever transmitted to external servers.
 */

'use client';

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { EmbeddingProgress } from '@/hooks/useEmbedding';

// ============================================
// Types
// ============================================

/**
 * Props for the ModelLoadingIndicator component.
 */
export interface ModelLoadingIndicatorProps {
  /** Loading progress information */
  progress: EmbeddingProgress;

  /** Whether to show in compact mode */
  compact?: boolean;

  /** Additional CSS classes */
  className?: string;

  /** Model size in MB (default: 23MB for all-MiniLM-L6-v2) */
  modelSizeMB?: number;

  /** Backend being used */
  backend?: 'webgpu' | 'webgl' | 'wasm' | 'cpu';

  /** Callback when retry is clicked (only shown on error) */
  onRetry?: () => void;
}

// ============================================
// Status Icons
// ============================================

const statusIcons: Record<EmbeddingProgress['status'], React.ReactNode> = {
  idle: (
    <svg
      className="h-5 w-5 text-muted-foreground"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  initiating: (
    <svg
      className="h-5 w-5 animate-spin text-blue-500"
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
  ),
  downloading: (
    <svg
      className="h-5 w-5 animate-pulse text-blue-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
      />
    </svg>
  ),
  loading: (
    <svg
      className="h-5 w-5 animate-spin text-blue-500"
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
  ),
  ready: (
    <svg
      className="h-5 w-5 text-green-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  ),
  error: (
    <svg
      className="h-5 w-5 text-red-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

// ============================================
// Status Labels
// ============================================

const statusLabels: Record<EmbeddingProgress['status'], string> = {
  idle: 'Ready to load',
  initiating: 'Initializing...',
  downloading: 'Downloading model...',
  loading: 'Loading model...',
  ready: 'Model ready',
  error: 'Error loading model',
};

// ============================================
// Backend Labels
// ============================================

const backendLabels: Record<string, { label: string; color: string }> = {
  webgpu: { label: 'WebGPU', color: 'text-purple-500' },
  webgl: { label: 'WebGL', color: 'text-green-500' },
  wasm: { label: 'WebAssembly', color: 'text-blue-500' },
  cpu: { label: 'CPU', color: 'text-orange-500' },
};

// ============================================
// Component
// ============================================

/**
 * Displays the loading progress for the embedding model.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { progressDetails, initialize } = useEmbedding();
 *
 *   return (
 *     <ModelLoadingIndicator
 *       progress={progressDetails}
 *       backend="wasm"
 *       onRetry={initialize}
 *     />
 *   );
 * }
 * ```
 */
export function ModelLoadingIndicator({
  progress,
  compact = false,
  className,
  modelSizeMB = 23,
  backend = 'wasm',
  onRetry,
}: ModelLoadingIndicatorProps) {
  const {
    status,
    progress: progressValue,
    file,
    loadedBytes,
    totalBytes,
    error,
  } = progress;

  const icon = statusIcons[status];
  const label = statusLabels[status];
  const backendInfo = backendLabels[backend] ??
    backendLabels.cpu ?? { label: 'CPU', color: 'text-orange-500' };

  // Calculate download progress text
  const getDownloadText = (): string | null => {
    if (loadedBytes !== undefined && totalBytes !== undefined) {
      return `${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`;
    }
    if (file) {
      return `Downloading ${file}...`;
    }
    return null;
  };
  const downloadText = getDownloadText();

  // Compact mode: Just the icon and progress bar
  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {icon}
        <Progress value={progressValue} className="h-2 w-24" />
        <span className="text-xs text-muted-foreground">
          {progressValue.toFixed(0)}%
        </span>
      </div>
    );
  }

  // Full mode
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 shadow-sm',
        status === 'error' &&
          'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <h4 className="font-medium">{label}</h4>
            <p className="text-sm text-muted-foreground">
              Local AI Model (~{modelSizeMB}MB)
            </p>
          </div>
        </div>

        {/* Backend Badge */}
        <div
          className={cn(
            'rounded-full bg-muted px-2 py-1 text-xs font-medium',
            backendInfo.color
          )}
        >
          {backendInfo.label}
        </div>
      </div>

      {/* Progress Bar - only show when downloading or loading */}
      {(status === 'downloading' ||
        status === 'loading' ||
        status === 'initiating') && (
        <div className="mt-4 space-y-2">
          <Progress value={progressValue} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{downloadText || 'Preparing...'}</span>
            <span>{progressValue.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* Success State */}
      {status === 'ready' && (
        <div className="mt-4">
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>Model loaded and ready for local inference</span>
          </div>

          {/* Privacy Notice */}
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <svg
              className="h-4 w-4 text-blue-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            <span>
              All processing happens locally - your data stays private
            </span>
          </div>
        </div>
      )}

      {/* Error State */}
      {status === 'error' && error && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>

          {/* Retry Button */}
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-md bg-red-100 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Retry
            </button>
          )}

          {/* Troubleshooting Tips */}
          <div className="rounded-md bg-red-100 p-3 dark:bg-red-900/50">
            <h5 className="text-sm font-medium text-red-800 dark:text-red-200">
              Troubleshooting Tips
            </h5>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-red-700 dark:text-red-300">
              <li>Check your internet connection</li>
              <li>Try refreshing the page</li>
              <li>Ensure your browser supports WebAssembly</li>
              <li>Clear browser cache if issues persist</li>
            </ul>
          </div>
        </div>
      )}

      {/* Model Info Footer */}
      {status !== 'error' && status !== 'idle' && (
        <div className="mt-4 border-t pt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>all-MiniLM-L6-v2 (384 dimensions)</span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              Quantized (INT8)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Compact Inline Indicator
// ============================================

/**
 * Compact inline version for use in toolbars or status bars.
 */
export function ModelStatusBadge({
  status,
  className,
}: {
  status: EmbeddingProgress['status'];
  className?: string;
}) {
  const icon = statusIcons[status];
  const label = statusLabels[status];

  const statusColors: Record<EmbeddingProgress['status'], string> = {
    idle: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    initiating: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    downloading:
      'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    loading: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    ready: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium',
        statusColors[status],
        className
      )}
    >
      <span className="h-3.5 w-3.5">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

// ============================================
// Minimal Progress Bar
// ============================================

/**
 * Minimal progress bar for use during loading.
 */
export function ModelLoadingBar({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Loading AI model...</span>
        <span>{progress.toFixed(0)}%</span>
      </div>
      <Progress value={progress} className="h-1" />
    </div>
  );
}

// ============================================
// Utilities
// ============================================

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const sizeLabel = sizes[i] ?? 'B';

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizeLabel}`;
}

export default ModelLoadingIndicator;
