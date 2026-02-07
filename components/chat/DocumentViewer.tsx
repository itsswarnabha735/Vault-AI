/**
 * DocumentViewer Component
 *
 * Full-screen document viewer for PDFs and images stored in OPFS.
 * Features zoom controls, download, and navigation.
 *
 * PRIVACY: All documents are loaded from local OPFS storage.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { TransactionId } from '@/types/database';

// ============================================
// Types
// ============================================

export interface DocumentViewerProps {
  /** Transaction ID to load document for */
  transactionId: TransactionId;

  /** OPFS file path */
  filePath: string;

  /** File MIME type */
  mimeType: string;

  /** Whether viewer is open */
  isOpen: boolean;

  /** Close handler */
  onClose: () => void;

  /** Custom class name */
  className?: string;
}

/**
 * Zoom levels available.
 */
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;
const DEFAULT_ZOOM_INDEX = 2; // 100%

// ============================================
// Component
// ============================================

/**
 * Full document viewer with zoom and download.
 *
 * @example
 * ```tsx
 * <DocumentViewer
 *   transactionId={tx.id}
 *   filePath={tx.filePath}
 *   mimeType={tx.mimeType}
 *   isOpen={isViewerOpen}
 *   onClose={() => setIsViewerOpen(false)}
 * />
 * ```
 */
export function DocumentViewer({
  transactionId: _transactionId,
  filePath,
  mimeType,
  isOpen,
  onClose,
  className,
}: DocumentViewerProps) {
  // Note: transactionId is available for future use (e.g., analytics, linking)
  void _transactionId;
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const containerRef = useRef<HTMLDivElement>(null);

  // Document type detection
  const isPDF = mimeType?.includes('pdf') || filePath.endsWith('.pdf');
  const isImage = mimeType?.startsWith('image/');

  // Current zoom level
  const zoom = ZOOM_LEVELS[zoomIndex] || 1;

  // Load document from OPFS
  const loadDocument = useCallback(async () => {
    if (!filePath || !isOpen) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const root = await navigator.storage.getDirectory();
      const parts = filePath.split('/').filter(Boolean);

      // Navigate to file
      let current: FileSystemDirectoryHandle = root;
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i]!);
      }

      const fileName = parts[parts.length - 1]!;
      const fileHandle = await current.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);

      setDocumentUrl(url);
    } catch (err) {
      console.error('Failed to load document:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [filePath, isOpen]);

  // Load document when opened
  useEffect(() => {
    if (isOpen) {
      loadDocument();
    }

    return () => {
      if (documentUrl) {
        URL.revokeObjectURL(documentUrl);
        setDocumentUrl(null);
      }
    };
  }, [isOpen, loadDocument]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleZoomReset();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Zoom handlers
  const handleZoomIn = () => {
    setZoomIndex((prev) => Math.min(prev + 1, ZOOM_LEVELS.length - 1));
  };

  const handleZoomOut = () => {
    setZoomIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleZoomReset = () => {
    setZoomIndex(DEFAULT_ZOOM_INDEX);
  };

  // Download handler
  const handleDownload = useCallback(async () => {
    if (!documentUrl) {
      return;
    }

    try {
      const response = await fetch(documentUrl);
      const blob = await response.blob();
      const fileName = filePath.split('/').pop() || 'document';

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download:', err);
    }
  }, [documentUrl, filePath]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={cn('fixed inset-0 z-50 flex flex-col bg-black/95', className)}
      role="dialog"
      aria-modal="true"
      aria-label="Document viewer"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Document icon and name */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
              {isPDF ? (
                <PDFIcon className="h-4 w-4 text-white" />
              ) : (
                <ImageIcon className="h-4 w-4 text-white" />
              )}
            </div>
            <span className="text-sm font-medium text-white">
              {filePath.split('/').pop()}
            </span>
          </div>

          {/* Privacy indicator */}
          <div className="hidden items-center gap-1.5 rounded-full bg-green-500/20 px-3 py-1 sm:flex">
            <svg
              className="h-3.5 w-3.5 text-green-400"
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
            <span className="text-xs font-medium text-green-400">
              Local file
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomIndex === 0}
              className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
              aria-label="Zoom out"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20 12H4"
                />
              </svg>
            </button>

            <button
              type="button"
              onClick={handleZoomReset}
              className="min-w-[4rem] px-2 py-1 text-xs font-medium text-white/70 hover:text-white"
            >
              {Math.round(zoom * 100)}%
            </button>

            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomIndex === ZOOM_LEVELS.length - 1}
              className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
              aria-label="Zoom in"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>

          {/* Download button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            disabled={!documentUrl}
            className="text-white/70 hover:bg-white/10 hover:text-white"
          >
            <svg
              className="mr-2 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download
          </Button>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Close viewer"
          >
            <svg
              className="h-5 w-5"
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
          </button>
        </div>
      </header>

      {/* Document content */}
      <div ref={containerRef} className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <svg
                className="h-8 w-8 animate-spin text-white/50"
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
              <span className="text-sm text-white/50">Loading document...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
                <svg
                  className="h-6 w-6 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
              </div>
              <p className="text-sm text-white/70">Failed to load document</p>
              <p className="text-xs text-white/50">{error.message}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={loadDocument}
                className="mt-2"
              >
                Retry
              </Button>
            </div>
          </div>
        ) : documentUrl ? (
          <div
            className="flex min-h-full items-center justify-center"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            {isPDF ? (
              <iframe
                src={`${documentUrl}#toolbar=0`}
                className="h-[80vh] w-full max-w-4xl rounded-lg bg-white"
                title="PDF Document"
              />
            ) : isImage ? (
              <img
                src={documentUrl}
                alt="Document"
                className="max-h-[80vh] max-w-full rounded-lg object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                  <FileIcon className="h-6 w-6 text-white/70" />
                </div>
                <p className="text-sm text-white/70">
                  Preview not available for this file type
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="mt-2"
                >
                  Download to view
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Footer with keyboard shortcuts */}
      <footer className="border-t border-white/10 px-4 py-2">
        <div className="flex items-center justify-center gap-4 text-xs text-white/40">
          <span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">
              Esc
            </kbd>{' '}
            Close
          </span>
          <span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">+</kbd>
            /
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">-</kbd>{' '}
            Zoom
          </span>
          <span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">0</kbd>{' '}
            Reset zoom
          </span>
        </div>
      </footer>
    </div>
  );
}

// ============================================
// Icons
// ============================================

function PDFIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  );
}

export default DocumentViewer;
