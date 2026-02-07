/**
 * TransactionMini Component
 *
 * A compact card displaying essential transaction information.
 * Used in duplicate detection alerts to show transaction comparisons.
 */

'use client';

import React from 'react';
import { FileText, Calendar, DollarSign, Store } from 'lucide-react';

import { cn } from '@/lib/utils/index';
import { formatCurrency } from '@/lib/anomaly/utils';
import type { LocalTransaction } from '@/types/database';

// ============================================
// Types
// ============================================

export interface TransactionMiniProps {
  /** The transaction to display */
  transaction: LocalTransaction;

  /** Label for this transaction (e.g., "Original", "New") */
  label?: string;

  /** Whether this is highlighted/selected */
  isHighlighted?: boolean;

  /** Additional CSS class names */
  className?: string;

  /** Click handler */
  onClick?: () => void;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Format a date string for display.
 */
function formatDisplayDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Truncate vendor name if too long.
 */
function truncateVendor(vendor: string, maxLength: number = 20): string {
  if (vendor.length <= maxLength) {
    return vendor;
  }
  return `${vendor.substring(0, maxLength - 3)}...`;
}

// ============================================
// Component
// ============================================

export function TransactionMini({
  transaction,
  label,
  isHighlighted = false,
  className,
  onClick,
}: TransactionMiniProps) {
  const formattedAmount = formatCurrency(
    transaction.amount,
    transaction.currency || 'USD'
  );
  const formattedDate = formatDisplayDate(transaction.date);
  const displayVendor = truncateVendor(transaction.vendor);

  return (
    <div
      className={cn(
        'relative rounded-lg border bg-card p-3 transition-colors',
        isHighlighted && 'border-primary bg-primary/5',
        onClick && 'cursor-pointer hover:bg-accent/50',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {/* Label Badge */}
      {label && (
        <span
          className={cn(
            'absolute -top-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium',
            isHighlighted
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {label}
        </span>
      )}

      {/* Transaction Details */}
      <div className="mt-1 space-y-2">
        {/* Vendor */}
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium" title={transaction.vendor}>
            {displayVendor}
          </span>
        </div>

        {/* Amount */}
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span
            className={cn(
              'text-sm font-semibold',
              transaction.amount < 0 ? 'text-green-600' : 'text-foreground'
            )}
          >
            {formattedAmount}
          </span>
        </div>

        {/* Date */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{formattedDate}</span>
        </div>

        {/* Category (if available) */}
        {transaction.category && (
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {typeof transaction.category === 'string'
                ? transaction.category
                : 'Categorized'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Skeleton Component
// ============================================

export function TransactionMiniSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-lg border bg-card p-3', className)}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-muted" />
          <div className="h-4 w-24 rounded bg-muted" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-muted" />
          <div className="h-4 w-16 rounded bg-muted" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-muted" />
          <div className="h-4 w-20 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

export default TransactionMini;
