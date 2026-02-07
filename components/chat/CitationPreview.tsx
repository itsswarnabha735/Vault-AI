/**
 * CitationPreview Component
 *
 * Expanded card preview of a citation, showing transaction details
 * and document thumbnail with option to view full document.
 */

'use client';

import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Citation } from '@/types/ai';
import { useCitation } from '@/hooks/useCitation';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DocumentThumbnail, ThumbnailPlaceholder } from './DocumentThumbnail';

// ============================================
// Types
// ============================================

export interface CitationPreviewProps {
  /** Citation to preview */
  citation: Citation;

  /** Handler for viewing full document */
  onViewDocument?: (transactionId: string) => void;

  /** Handler for closing preview */
  onClose?: () => void;

  /** Custom class name */
  className?: string;

  /** Whether to show as compact card */
  compact?: boolean;
}

// ============================================
// Component
// ============================================

/**
 * Expanded citation preview card.
 *
 * @example
 * ```tsx
 * <CitationPreview
 *   citation={citation}
 *   onViewDocument={(id) => router.push(`/transactions/${id}`)}
 * />
 * ```
 */
export function CitationPreview({
  citation,
  onViewDocument,
  onClose,
  className,
  compact = false,
}: CitationPreviewProps) {
  const { state, trackClick } = useCitation(citation, {
    autoLoad: true,
    autoLoadDocument: true,
  });

  const { transaction, isLoading, hasDocument } = state;

  // Format display values
  const formattedAmount = formatCurrency(citation.amount);
  const formattedDate = formatDate(new Date(citation.date), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Handle view document click
  const handleViewDocument = () => {
    trackClick();
    onViewDocument?.(citation.transactionId);
  };

  // Relevance badge color
  const relevanceBadgeColor =
    citation.relevanceScore >= 0.8
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : citation.relevanceScore >= 0.5
        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';

  if (compact) {
    return (
      <CompactCitationPreview
        citation={citation}
        transaction={transaction}
        onViewDocument={handleViewDocument}
        className={className}
      />
    );
  }

  return (
    <Card className={cn('w-80', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">
              {citation.vendor}
            </CardTitle>
            <CardDescription className="mt-1">
              {formattedDate} • {formattedAmount}
            </CardDescription>
          </div>

          {/* Close button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close preview"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Relevance badge */}
        <div className="mt-2 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              relevanceBadgeColor
            )}
          >
            {Math.round(citation.relevanceScore * 100)}% relevance
          </span>
          <span className="text-xs text-muted-foreground">
            {citation.label}
          </span>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        {/* Document thumbnail */}
        {isLoading ? (
          <div className="h-32 w-full animate-pulse rounded-lg bg-muted" />
        ) : hasDocument && transaction?.filePath ? (
          <DocumentThumbnail
            filePath={transaction.filePath}
            mimeType={transaction.mimeType}
            onClick={handleViewDocument}
            className="h-32 w-full"
            alt={`Document for ${citation.vendor}`}
          />
        ) : (
          <ThumbnailPlaceholder
            type="document"
            label="No document"
            className="h-32 w-full"
          />
        )}

        {/* Transaction note */}
        {transaction?.note && (
          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
            {transaction.note}
          </p>
        )}

        {/* Category badge */}
        {transaction?.category && (
          <div className="mt-3">
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {transaction.category}
            </span>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0">
        <Button
          variant="outline"
          size="sm"
          onClick={handleViewDocument}
          disabled={!hasDocument}
          className="w-full"
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
              d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          View Document
        </Button>
      </CardFooter>
    </Card>
  );
}

// ============================================
// Compact Variant
// ============================================

interface CompactCitationPreviewProps {
  citation: Citation;
  transaction: ReturnType<typeof useCitation>['state']['transaction'];
  onViewDocument: () => void;
  className?: string;
}

function CompactCitationPreview({
  citation,
  transaction,
  onViewDocument,
  className,
}: CompactCitationPreviewProps) {
  const hasDocument = !!transaction?.filePath;

  return (
    <button
      type="button"
      onClick={onViewDocument}
      disabled={!hasDocument}
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-background p-3 text-left',
        'transition-colors hover:bg-muted',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      {/* Thumbnail */}
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded">
        {hasDocument && transaction?.filePath ? (
          <DocumentThumbnail
            filePath={transaction.filePath}
            mimeType={transaction.mimeType}
            className="h-full w-full"
            showSkeleton={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <svg
              className="h-6 w-6 text-muted-foreground"
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
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {citation.vendor}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatCurrency(citation.amount)} •{' '}
          {formatDate(new Date(citation.date), {
            month: 'short',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* Arrow */}
      <svg
        className="h-4 w-4 shrink-0 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 4.5l7.5 7.5-7.5 7.5"
        />
      </svg>
    </button>
  );
}

// ============================================
// Citation Preview List
// ============================================

export interface CitationPreviewListProps {
  /** Citations to display */
  citations: Citation[];

  /** Handler for viewing document */
  onViewDocument?: (transactionId: string) => void;

  /** Maximum previews to show */
  maxPreviews?: number;

  /** Custom class name */
  className?: string;
}

/**
 * List of citation previews.
 */
export function CitationPreviewList({
  citations,
  onViewDocument,
  maxPreviews = 5,
  className,
}: CitationPreviewListProps) {
  const visibleCitations = citations.slice(0, maxPreviews);
  const hiddenCount = citations.length - maxPreviews;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {visibleCitations.map((citation) => (
        <CitationPreview
          key={citation.transactionId}
          citation={citation}
          onViewDocument={onViewDocument}
          compact
        />
      ))}

      {hiddenCount > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          +{hiddenCount} more transaction{hiddenCount > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

export default CitationPreview;
