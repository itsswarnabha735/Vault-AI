/**
 * DuplicateAlert Component
 *
 * Displays an alert for potential duplicate transactions.
 * Shows both transactions side-by-side for comparison
 * and provides actions for resolution.
 */

'use client';

import React, { useState, useCallback } from 'react';
import { AlertTriangle, Merge, X, Check, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils/index';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TransactionMini, TransactionMiniSkeleton } from './TransactionMini';
import type { LocalTransaction, AnomalyAlert } from '@/types/database';

// ============================================
// Types
// ============================================

/**
 * Resolution action for duplicate alerts.
 */
export type DuplicateResolution = 'keep-both' | 'skip-new' | 'merge';

/**
 * Props for the DuplicateAlert component.
 */
export interface DuplicateAlertProps {
  /** The anomaly alert data */
  alert: AnomalyAlert;

  /** The original (earlier) transaction */
  originalTransaction: LocalTransaction | null;

  /** The new (potential duplicate) transaction */
  newTransaction: LocalTransaction | null;

  /** Handler when user resolves the alert */
  onResolve: (resolution: DuplicateResolution) => void | Promise<void>;

  /** Whether the component is in a loading state */
  isLoading?: boolean;

  /** Whether resolution is in progress */
  isResolving?: boolean;

  /** Additional CSS class names */
  className?: string;

  /** Show compact version */
  compact?: boolean;
}

// ============================================
// Component
// ============================================

export function DuplicateAlert({
  alert,
  originalTransaction,
  newTransaction,
  onResolve,
  isLoading = false,
  isResolving = false,
  className,
  compact = false,
}: DuplicateAlertProps) {
  const [selectedResolution, setSelectedResolution] =
    useState<DuplicateResolution | null>(null);

  /**
   * Handle resolution button click.
   */
  const handleResolve = useCallback(
    async (resolution: DuplicateResolution) => {
      setSelectedResolution(resolution);
      await onResolve(resolution);
    },
    [onResolve]
  );

  // Loading skeleton
  if (isLoading) {
    return (
      <Alert variant="warning" className={cn('animate-pulse', className)}>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Loading...</AlertTitle>
        <AlertDescription>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <TransactionMiniSkeleton />
            <TransactionMiniSkeleton />
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Calculate confidence percentage for display
  const confidencePercent = alert.details?.similarityScore
    ? Math.round(alert.details.similarityScore * 100)
    : null;

  return (
    <Alert variant="warning" className={cn('relative', className)}>
      <AlertTriangle className="h-4 w-4" />

      <AlertTitle className="flex items-center gap-2">
        Possible Duplicate Detected
        {confidencePercent !== null && (
          <span className="text-xs font-normal text-muted-foreground">
            ({confidencePercent}% confidence)
          </span>
        )}
      </AlertTitle>

      <AlertDescription>
        <p className="text-sm">{alert.message}</p>

        {/* Transaction Comparison */}
        {!compact && (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {originalTransaction ? (
              <TransactionMini
                transaction={originalTransaction}
                label="Original"
              />
            ) : (
              <TransactionMiniSkeleton />
            )}

            {newTransaction ? (
              <TransactionMini
                transaction={newTransaction}
                label="New"
                isHighlighted
              />
            ) : (
              <TransactionMiniSkeleton />
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleResolve('keep-both')}
            disabled={isResolving}
            className="gap-1"
          >
            {isResolving && selectedResolution === 'keep-both' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Keep Both
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleResolve('skip-new')}
            disabled={isResolving}
            className="gap-1"
          >
            {isResolving && selectedResolution === 'skip-new' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" />
            )}
            Skip New
          </Button>

          <Button
            size="sm"
            onClick={() => handleResolve('merge')}
            disabled={isResolving}
            className="gap-1"
          >
            {isResolving && selectedResolution === 'merge' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Merge className="h-3 w-3" />
            )}
            Merge
          </Button>
        </div>

        {/* Help Text */}
        <p className="mt-3 text-xs text-muted-foreground">
          <strong>Keep Both:</strong> Save both transactions.{' '}
          <strong>Skip New:</strong> Discard the new transaction.{' '}
          <strong>Merge:</strong> Combine into a single entry.
        </p>
      </AlertDescription>
    </Alert>
  );
}

// ============================================
// Compact Version
// ============================================

export interface DuplicateAlertCompactProps {
  /** Number of duplicate alerts */
  count: number;

  /** Handler to view all duplicates */
  onViewAll: () => void;

  /** Additional CSS class names */
  className?: string;
}

export function DuplicateAlertCompact({
  count,
  onViewAll,
  className,
}: DuplicateAlertCompactProps) {
  if (count === 0) {
    return null;
  }

  return (
    <Alert
      variant="warning"
      className={cn('cursor-pointer', className)}
      onClick={onViewAll}
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>
          {count} Possible Duplicate{count > 1 ? 's' : ''} Detected
        </span>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
          Review
        </Button>
      </AlertTitle>
    </Alert>
  );
}

// ============================================
// List Version
// ============================================

export interface DuplicateAlertListProps {
  /** Array of alerts with associated transactions */
  alerts: Array<{
    alert: AnomalyAlert;
    original: LocalTransaction | null;
    new: LocalTransaction | null;
  }>;

  /** Handler when user resolves an alert */
  onResolve: (
    alertId: string,
    resolution: DuplicateResolution
  ) => void | Promise<void>;

  /** Set of alert IDs currently being resolved */
  resolvingIds?: Set<string>;

  /** Additional CSS class names */
  className?: string;
}

export function DuplicateAlertList({
  alerts,
  onResolve,
  resolvingIds = new Set(),
  className,
}: DuplicateAlertListProps) {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {alerts.map(({ alert, original, new: newTx }) => (
        <DuplicateAlert
          key={alert.id}
          alert={alert}
          originalTransaction={original}
          newTransaction={newTx}
          onResolve={(resolution) => onResolve(alert.id, resolution)}
          isResolving={resolvingIds.has(alert.id)}
        />
      ))}
    </div>
  );
}

export default DuplicateAlert;
