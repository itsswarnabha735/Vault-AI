/**
 * DocumentGrid Component
 *
 * Grid view for displaying documents/transactions in the vault.
 */

'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { DocumentCard } from './DocumentCard';
import type { LocalTransaction, TransactionId } from '@/types/database';

// ============================================
// Types
// ============================================

export interface DocumentGridProps {
  /** Transactions to display */
  transactions: LocalTransaction[];

  /** Currently selected transaction ID */
  selectedId?: TransactionId | null;

  /** Selection handler */
  onSelect?: (transaction: LocalTransaction) => void;

  /** Whether the grid is loading */
  isLoading?: boolean;

  /** Number of skeleton cards to show when loading */
  skeletonCount?: number;

  /** Custom class name */
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * Document grid view.
 *
 * @example
 * ```tsx
 * <DocumentGrid
 *   transactions={transactions}
 *   selectedId={selectedId}
 *   onSelect={(tx) => setSelectedId(tx.id)}
 * />
 * ```
 */
export function DocumentGrid({
  transactions,
  selectedId,
  onSelect,
  isLoading = false,
  skeletonCount = 8,
  className,
}: DocumentGridProps) {
  // Show skeleton loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          'grid grid-cols-2 gap-4 p-4 md:grid-cols-3 lg:grid-cols-4',
          className
        )}
      >
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <DocumentCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (transactions.length === 0) {
    return (
      <EmptyState
        title="No documents found"
        description="Try adjusting your filters or upload some documents to get started."
        className={className}
      />
    );
  }

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-4 p-4 md:grid-cols-3 lg:grid-cols-4',
        className
      )}
    >
      {transactions.map((tx) => (
        <DocumentCard
          key={tx.id}
          transaction={tx}
          isSelected={selectedId === tx.id}
          onClick={() => onSelect?.(tx)}
        />
      ))}
    </div>
  );
}

// ============================================
// Skeleton
// ============================================

/**
 * Skeleton loading card.
 */
export function DocumentCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="aspect-[3/4] animate-pulse bg-muted" />
      <div className="p-3">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-6 w-1/2 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

// ============================================
// Empty State
// ============================================

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center justify-center p-8 text-center',
        className
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <FolderIcon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-medium text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ============================================
// Virtualized Grid (for large datasets)
// ============================================

export interface VirtualizedDocumentGridProps extends DocumentGridProps {
  /** Height of the container */
  containerHeight?: number;
}

/**
 * Virtualized grid for large datasets.
 * Uses windowing to only render visible items.
 */
export function VirtualizedDocumentGrid({
  transactions,
  selectedId,
  onSelect,
  isLoading = false,
  containerHeight = 600,
  className,
}: VirtualizedDocumentGridProps) {
  // Calculate visible items based on scroll position
  // For a proper implementation, use react-virtual or similar library
  // This is a simplified version that just uses the regular grid

  const visibleTransactions = useMemo(() => {
    // In a real implementation, calculate which items are visible
    // based on scroll position and item heights
    return transactions;
  }, [transactions]);

  return (
    <div
      className={cn('overflow-y-auto', className)}
      style={{ height: containerHeight }}
    >
      <DocumentGrid
        transactions={visibleTransactions}
        selectedId={selectedId}
        onSelect={onSelect}
        isLoading={isLoading}
      />
    </div>
  );
}

// ============================================
// Icons
// ============================================

function FolderIcon({ className }: { className?: string }) {
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
        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
      />
    </svg>
  );
}

export default DocumentGrid;
