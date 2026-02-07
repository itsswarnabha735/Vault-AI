/**
 * CitationPanel Component
 *
 * Slide-in panel showing transaction details when a citation is clicked.
 * Displays document preview, transaction info, and navigation.
 */

'use client';

import { useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Citation } from '@/types/ai';
import { Button } from '@/components/ui/button';

// ============================================
// Types
// ============================================

export interface CitationPanelProps {
  /** Currently selected citation */
  citation: Citation | null;

  /** Close handler */
  onClose: () => void;

  /** Handler for viewing full document */
  onViewDocument?: (transactionId: string) => void;

  /** Handler for navigating to next/previous citation */
  onNavigate?: (direction: 'prev' | 'next') => void;

  /** Whether navigation is available */
  hasNavigation?: boolean;

  /** Current citation index */
  currentIndex?: number;

  /** Total citations count */
  totalCount?: number;

  /** Custom class name */
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * Slide-in panel for citation details.
 *
 * @example
 * ```tsx
 * <CitationPanel
 *   citation={selectedCitation}
 *   onClose={() => setSelectedCitation(null)}
 *   onViewDocument={(id) => router.push(`/transactions/${id}`)}
 * />
 * ```
 */
export function CitationPanel({
  citation,
  onClose,
  onViewDocument,
  onNavigate,
  hasNavigation = false,
  currentIndex = 0,
  totalCount = 0,
  className,
}: CitationPanelProps) {
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
      if (hasNavigation && onNavigate) {
        if (e.key === 'ArrowLeft') {
          onNavigate('prev');
        }
        if (e.key === 'ArrowRight') {
          onNavigate('next');
        }
      }
    };

    if (citation) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
    return undefined;
  }, [citation, onClose, hasNavigation, onNavigate]);

  // Handle view document click
  const handleViewDocument = useCallback(() => {
    if (citation && onViewDocument) {
      onViewDocument(citation.transactionId);
    }
  }, [citation, onViewDocument]);

  if (!citation) {
    return null;
  }

  // Format data for display
  const formattedAmount = formatCurrency(citation.amount);
  const formattedDate = formatDateDisplay(citation.date);
  const relevancePercent = Math.round(citation.relevanceScore * 100);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed bottom-0 right-0 top-0 z-50 w-full max-w-md',
          'bg-background shadow-xl',
          'duration-300 animate-in slide-in-from-right',
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Citation details"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <svg
                className="h-4 w-4 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Transaction Details
              </h2>
              {hasNavigation && totalCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {currentIndex + 1} of {totalCount}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Navigation buttons */}
            {hasNavigation && onNavigate && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('prev')}
                  disabled={currentIndex === 0}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  aria-label="Previous citation"
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
                      d="M15.75 19.5L8.25 12l7.5-7.5"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('next')}
                  disabled={currentIndex >= totalCount - 1}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  aria-label="Next citation"
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
                      d="M8.25 4.5l7.5 7.5-7.5 7.5"
                    />
                  </svg>
                </button>
              </>
            )}

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close panel"
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
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          {/* Document preview placeholder */}
          <div className="border-b border-border bg-muted/30 p-6">
            <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-border bg-background">
              <div className="text-center">
                <svg
                  className="mx-auto h-12 w-12 text-muted-foreground/50"
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
                <p className="mt-2 text-sm text-muted-foreground">
                  Document preview
                </p>
              </div>
            </div>
          </div>

          {/* Transaction details */}
          <div className="p-6">
            {/* Vendor */}
            <h3 className="text-xl font-semibold text-foreground">
              {citation.vendor}
            </h3>

            {/* Amount */}
            <p className="mt-1 text-2xl font-bold text-primary">
              {formattedAmount}
            </p>

            {/* Date */}
            <p className="mt-1 text-sm text-muted-foreground">
              {formattedDate}
            </p>

            {/* Relevance score */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Relevance</span>
                <span className="font-medium text-foreground">
                  {relevancePercent}%
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    relevancePercent >= 80
                      ? 'bg-green-500'
                      : relevancePercent >= 60
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                  )}
                  style={{ width: `${relevancePercent}%` }}
                />
              </div>
            </div>

            {/* Label/Category */}
            <div className="mt-4 flex items-center gap-2">
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                {citation.label}
              </span>
            </div>

            {/* Snippet */}
            {citation.snippet && (
              <div className="mt-4 rounded-lg bg-muted/50 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Matched text
                </p>
                <p className="mt-1 text-sm text-foreground">
                  &ldquo;{citation.snippet}&rdquo;
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <Button
            onClick={handleViewDocument}
            className="w-full"
            disabled={!onViewDocument}
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
                d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
            View Full Document
          </Button>

          {/* Local storage indicator */}
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <svg
              className="h-3.5 w-3.5 text-green-600"
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
            <span className="text-xs text-muted-foreground">
              Stored locally on your device
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================
// Helpers
// ============================================

/**
 * Format date for display.
 */
function formatDateDisplay(dateString: string): string {
  try {
    const date = new Date(dateString);
    return formatDate(date, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

// ============================================
// Inline Citation Preview
// ============================================

export interface InlineCitationPreviewProps {
  /** Citation to preview */
  citation: Citation;

  /** Click handler */
  onClick?: () => void;

  /** Custom class name */
  className?: string;
}

/**
 * Compact inline preview of a citation.
 */
export function InlineCitationPreview({
  citation,
  onClick,
  className,
}: InlineCitationPreviewProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-muted',
        className
      )}
    >
      {/* Icon */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <svg
          className="h-5 w-5 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{citation.vendor}</p>
        <p className="text-xs text-muted-foreground">
          {formatCurrency(citation.amount)} • {formatShortDate(citation.date)}
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

/**
 * Format date as short string.
 */
function formatShortDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export default CitationPanel;
