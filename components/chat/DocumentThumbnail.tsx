/**
 * DocumentThumbnail Component
 *
 * Displays a thumbnail preview of a document stored in OPFS.
 * Supports PDF preview (first page) and image thumbnails.
 *
 * PRIVACY: All document access is local via OPFS.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

export interface DocumentThumbnailProps {
  /** OPFS file path */
  filePath: string;

  /** File MIME type */
  mimeType?: string;

  /** Alt text for the image */
  alt?: string;

  /** Width of thumbnail */
  width?: number;

  /** Height of thumbnail */
  height?: number;

  /** Custom class name */
  className?: string;

  /** Click handler */
  onClick?: () => void;

  /** Whether to show loading skeleton */
  showSkeleton?: boolean;

  /** Fallback when image fails to load */
  fallback?: React.ReactNode;
}

// ============================================
// Component
// ============================================

/**
 * Document thumbnail with OPFS integration.
 *
 * @example
 * ```tsx
 * <DocumentThumbnail
 *   filePath="/documents/receipt-123.pdf"
 *   mimeType="application/pdf"
 *   onClick={() => openViewer()}
 * />
 * ```
 */
export function DocumentThumbnail({
  filePath,
  mimeType,
  alt = 'Document thumbnail',
  width,
  height,
  className,
  onClick,
  showSkeleton = true,
  fallback,
}: DocumentThumbnailProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Determine document type
  const isPDF = mimeType?.includes('pdf') || filePath.endsWith('.pdf');
  const isImage =
    mimeType?.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp)$/i.test(filePath);

  // Load thumbnail
  const loadThumbnail = useCallback(async () => {
    if (!filePath) {
      setIsLoading(false);
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

      if (isImage) {
        // For images, use directly
        const url = URL.createObjectURL(file);
        setThumbnailUrl(url);
      } else if (isPDF) {
        // For PDFs, create a placeholder or try to render first page
        // Using a placeholder for now since PDF.js rendering requires more setup
        setThumbnailUrl(null);
      } else {
        // Other file types - use placeholder
        setThumbnailUrl(null);
      }
    } catch (err) {
      console.error('Failed to load thumbnail:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [filePath, isImage, isPDF]);

  // Load on mount and when path changes
  useEffect(() => {
    loadThumbnail();

    return () => {
      if (thumbnailUrl) {
        URL.revokeObjectURL(thumbnailUrl);
      }
    };
  }, [loadThumbnail, thumbnailUrl]);

  // Cleanup URL on unmount
  useEffect(() => {
    return () => {
      if (thumbnailUrl) {
        URL.revokeObjectURL(thumbnailUrl);
      }
    };
  }, [thumbnailUrl]);

  // Loading state
  if (isLoading && showSkeleton) {
    return (
      <div
        className={cn('animate-pulse rounded-lg bg-muted', className)}
        style={{ width, height }}
      />
    );
  }

  // Error or no thumbnail - show placeholder
  if (error || !thumbnailUrl) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/50',
          'transition-colors hover:bg-muted',
          onClick && 'cursor-pointer',
          className
        )}
        style={{ width, height }}
        aria-label={alt}
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          {isPDF ? (
            <PDFIcon className="h-8 w-8" />
          ) : isImage ? (
            <ImageIcon className="h-8 w-8" />
          ) : (
            <FileIcon className="h-8 w-8" />
          )}
          <span className="text-xs font-medium">
            {isPDF ? 'PDF' : isImage ? 'Image' : 'Document'}
          </span>
        </div>
      </button>
    );
  }

  // Image thumbnail
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-lg',
        'transition-transform hover:scale-[1.02]',
        onClick && 'cursor-pointer',
        className
      )}
      style={{ width, height }}
    >
      <img
        src={thumbnailUrl}
        alt={alt}
        className="h-full w-full object-cover"
      />

      {/* Hover overlay */}
      {onClick && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
          <svg
            className="h-8 w-8 text-white opacity-0 transition-opacity group-hover:opacity-100"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6"
            />
          </svg>
        </div>
      )}
    </button>
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

// ============================================
// Thumbnail Placeholder
// ============================================

export interface ThumbnailPlaceholderProps {
  /** File type label */
  label?: string;

  /** Icon type */
  type?: 'pdf' | 'image' | 'document';

  /** Custom class name */
  className?: string;
}

/**
 * Static placeholder when no thumbnail is available.
 */
export function ThumbnailPlaceholder({
  label,
  type = 'document',
  className,
}: ThumbnailPlaceholderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/50',
        className
      )}
    >
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        {type === 'pdf' && <PDFIcon className="h-8 w-8" />}
        {type === 'image' && <ImageIcon className="h-8 w-8" />}
        {type === 'document' && <FileIcon className="h-8 w-8" />}
        {label && <span className="text-xs font-medium">{label}</span>}
      </div>
    </div>
  );
}

export default DocumentThumbnail;
