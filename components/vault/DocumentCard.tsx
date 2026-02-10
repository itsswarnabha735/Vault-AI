/**
 * DocumentCard Component
 *
 * Card component for displaying a document/transaction in the vault grid.
 * Shows thumbnail, vendor, amount, date, and sync status.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { LocalTransaction, SyncStatus } from '@/types/database';

// ============================================
// Types
// ============================================

export interface DocumentCardProps {
  /** Transaction to display */
  transaction: LocalTransaction;

  /** Click handler */
  onClick?: () => void;

  /** Whether the card is selected */
  isSelected?: boolean;

  /** Custom class name */
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * Document card for vault grid view.
 *
 * @example
 * ```tsx
 * <DocumentCard
 *   transaction={tx}
 *   onClick={() => selectTransaction(tx.id)}
 *   isSelected={selectedId === tx.id}
 * />
 * ```
 */
export function DocumentCard({
  transaction,
  onClick,
  isSelected = false,
  className,
}: DocumentCardProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load thumbnail from OPFS
  const loadThumbnail = useCallback(async () => {
    if (!transaction.filePath) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const root = await navigator.storage.getDirectory();
      const parts = transaction.filePath.split('/').filter(Boolean);

      // Navigate to file
      let current: FileSystemDirectoryHandle = root;
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i]!);
      }

      const fileName = parts[parts.length - 1]!;
      const fileHandle = await current.getFileHandle(fileName);
      const file = await fileHandle.getFile();

      // For images, create thumbnail URL
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setThumbnail(url);
      }
      // For PDFs, we'd need PDF.js - using placeholder for now
    } catch (err) {
      console.warn('Failed to load thumbnail:', err);
    } finally {
      setIsLoading(false);
    }
  }, [transaction.filePath]);

  // Load thumbnail on mount
  useEffect(() => {
    loadThumbnail();

    return () => {
      if (thumbnail) {
        URL.revokeObjectURL(thumbnail);
      }
    };
  }, [loadThumbnail]);

  // Format display values
  const formattedAmount = formatCurrency(
    transaction.amount,
    transaction.currency
  );
  const formattedDate = formatDate(new Date(transaction.date), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Determine file type
  const isPDF =
    transaction.mimeType?.includes('pdf') ||
    transaction.filePath?.endsWith('.pdf');
  const isImage = transaction.mimeType?.startsWith('image/');

  return (
    <Card
      className={cn(
        'group cursor-pointer overflow-hidden transition-all',
        'hover:shadow-lg hover:ring-2 hover:ring-primary/20',
        isSelected && 'shadow-lg ring-2 ring-primary',
        className
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      aria-selected={isSelected}
    >
      {/* Thumbnail area */}
      <div className="relative aspect-[3/2] overflow-hidden bg-muted">
        {isLoading ? (
          <div className="absolute inset-0 animate-pulse bg-muted" />
        ) : thumbnail ? (
          <img
            src={thumbnail}
            alt={`Document from ${transaction.vendor}`}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {isPDF ? (
              <PDFIcon className="h-12 w-12 text-muted-foreground" />
            ) : isImage ? (
              <ImageIcon className="h-12 w-12 text-muted-foreground" />
            ) : (
              <FileIcon className="h-12 w-12 text-muted-foreground" />
            )}
          </div>
        )}

        {/* Sync status badge */}
        <SyncStatusBadge
          status={transaction.syncStatus}
          className="absolute right-2 top-2"
        />

        {/* Category badge */}
        {transaction.category && (
          <CategoryBadge
            categoryId={transaction.category}
            className="absolute left-2 top-2"
          />
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
      </div>

      {/* Content */}
      <CardContent className="p-3">
        <p className="truncate font-medium text-foreground">
          {transaction.vendor}
        </p>
        <p className="text-lg font-bold text-foreground">{formattedAmount}</p>
        <p className="text-sm text-muted-foreground">{formattedDate}</p>

        {/* Confidence indicator */}
        {transaction.confidence < 0.7 && (
          <div className="mt-2 flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
            <WarningIcon className="h-3 w-3" />
            <span>Low confidence extraction</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Sync Status Badge
// ============================================

export interface SyncStatusBadgeProps {
  /** Sync status */
  status: SyncStatus;

  /** Custom class name */
  className?: string;
}

/**
 * Badge showing sync status.
 */
export function SyncStatusBadge({ status, className }: SyncStatusBadgeProps) {
  const config = syncStatusConfig[status];

  return (
    <Badge
      variant="secondary"
      className={cn(
        'gap-1 px-1.5 py-0.5 text-[10px] font-medium',
        config.className,
        className
      )}
    >
      {config.icon}
      <span className="sr-only sm:not-sr-only">{config.label}</span>
    </Badge>
  );
}

const syncStatusConfig: Record<
  SyncStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  synced: {
    label: 'Synced',
    className:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    icon: <CheckIcon className="h-2.5 w-2.5" />,
  },
  pending: {
    label: 'Pending',
    className:
      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: <ClockIcon className="h-2.5 w-2.5" />,
  },
  error: {
    label: 'Error',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: <ErrorIcon className="h-2.5 w-2.5" />,
  },
  'local-only': {
    label: 'Local',
    className:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    icon: <ShieldIcon className="h-2.5 w-2.5" />,
  },
};

// ============================================
// Category Badge
// ============================================

interface CategoryBadgeProps {
  categoryId: string;
  className?: string;
}

function CategoryBadge({ categoryId, className }: CategoryBadgeProps) {
  // In a real implementation, this would look up the category from a context or hook
  // For now, we just show a placeholder
  return (
    <Badge
      variant="secondary"
      className={cn('bg-background/80 text-[10px] backdrop-blur-sm', className)}
    >
      {categoryId.slice(0, 8)}...
    </Badge>
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

function ClockIcon({ className }: { className?: string }) {
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
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
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

function WarningIcon({ className }: { className?: string }) {
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

export default DocumentCard;
