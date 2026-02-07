/**
 * CitationChip Component
 *
 * Small clickable chip that displays a citation reference.
 * Used within assistant messages to show linked transactions.
 */

'use client';

import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import type { Citation } from '@/types/ai';

// ============================================
// Types
// ============================================

export interface CitationChipProps {
  /** Citation data */
  citation: Citation;

  /** Click handler */
  onClick?: () => void;

  /** Whether the chip is selected */
  isSelected?: boolean;

  /** Size variant */
  size?: 'sm' | 'md';

  /** Custom class name */
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * Clickable citation chip for referencing transactions.
 *
 * @example
 * ```tsx
 * <CitationChip
 *   citation={citation}
 *   onClick={() => showTransaction(citation.transactionId)}
 * />
 * ```
 */
export function CitationChip({
  citation,
  onClick,
  isSelected = false,
  size = 'sm',
  className,
}: CitationChipProps) {
  // Format display text
  const displayAmount = formatCurrency(citation.amount);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full transition-all',
        'border border-primary/20 bg-primary/5 text-primary',
        'hover:border-primary/40 hover:bg-primary/10',
        'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-1',
        isSelected && 'border-primary bg-primary/20 ring-2 ring-primary/30',
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-3 py-1 text-sm',
        className
      )}
      aria-label={`View transaction: ${citation.vendor} - ${displayAmount}`}
    >
      {/* Document icon */}
      <svg
        className={cn('shrink-0', size === 'sm' ? 'h-3 w-3' : 'h-4 w-4')}
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

      {/* Citation content */}
      <span className="truncate font-medium">{citation.vendor}</span>
      <span className="shrink-0 opacity-70">{displayAmount}</span>

      {/* Relevance indicator */}
      {citation.relevanceScore > 0.8 && (
        <span
          className={cn(
            'shrink-0 rounded-full bg-green-500',
            size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'
          )}
          title="High relevance"
        />
      )}
    </button>
  );
}

// ============================================
// Compact Citation Number
// ============================================

/**
 * Minimal citation reference as a number badge.
 */
export function CitationNumber({
  index,
  onClick,
  isSelected,
  className,
}: {
  index: number;
  onClick?: () => void;
  isSelected?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-4 min-w-[1rem] items-center justify-center',
        'rounded-sm bg-primary/10 px-1 text-[10px] font-semibold text-primary',
        'hover:bg-primary/20 focus:outline-none focus:ring-1 focus:ring-primary/30',
        isSelected && 'bg-primary text-primary-foreground',
        className
      )}
      aria-label={`Citation ${index + 1}`}
    >
      {index + 1}
    </button>
  );
}

// ============================================
// Citation List
// ============================================

export interface CitationListProps {
  /** Array of citations */
  citations: Citation[];

  /** Selected citation ID */
  selectedId?: string;

  /** Click handler */
  onSelect: (citation: Citation) => void;

  /** Maximum to show */
  maxVisible?: number;

  /** Custom class name */
  className?: string;
}

/**
 * List of citation chips with overflow handling.
 */
export function CitationList({
  citations,
  selectedId,
  onSelect,
  maxVisible = 5,
  className,
}: CitationListProps) {
  const visibleCitations = citations.slice(0, maxVisible);
  const hiddenCount = citations.length - maxVisible;

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {visibleCitations.map((citation) => (
        <CitationChip
          key={citation.transactionId}
          citation={citation}
          isSelected={selectedId === citation.transactionId}
          onClick={() => onSelect(citation)}
        />
      ))}

      {hiddenCount > 0 && (
        <span className="inline-flex items-center px-2 py-0.5 text-xs text-muted-foreground">
          +{hiddenCount} more
        </span>
      )}
    </div>
  );
}

export default CitationChip;
