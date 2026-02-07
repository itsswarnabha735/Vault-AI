/**
 * AmountAnomalyAlert Component
 *
 * Displays alerts for unusual transaction amounts including:
 * - Price increases for subscriptions/recurring charges
 * - Unusually high or low amounts
 * - First-time vendor transactions
 */

'use client';

import React, { useCallback, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ArrowRight,
  Check,
  X,
  Loader2,
  Store,
} from 'lucide-react';

import { cn } from '@/lib/utils/index';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/anomaly/utils';
import type { AnomalyAlert } from '@/types/database';
import type { AmountAnomalyResult, AmountComparison } from '@/lib/anomaly';

// ============================================
// Types
// ============================================

/**
 * Resolution action for amount anomaly alerts.
 */
export type AmountAnomalyResolution = 'confirm' | 'dismiss';

/**
 * Props for the AmountAnomalyAlert component.
 */
export interface AmountAnomalyAlertProps {
  /** The anomaly alert data */
  alert: AnomalyAlert;

  /** Optional amount anomaly result for additional data */
  result?: AmountAnomalyResult;

  /** Handler when user resolves the alert */
  onResolve: (resolution: AmountAnomalyResolution) => void | Promise<void>;

  /** Whether resolution is in progress */
  isResolving?: boolean;

  /** Additional CSS class names */
  className?: string;

  /** Show compact version */
  compact?: boolean;
}

// ============================================
// Helper Components
// ============================================

interface AmountComparisonDisplayProps {
  comparison: AmountComparison;
  type:
    | 'price_increase'
    | 'unusually_high'
    | 'unusually_low'
    | 'first_time'
    | null;
}

function AmountComparisonDisplay({
  comparison,
  type: _type,
}: AmountComparisonDisplayProps) {
  const isIncrease = comparison.percentChange > 0;
  const formattedCurrent = formatCurrency(comparison.current);
  const formattedAverage = formatCurrency(comparison.average);
  const percentText = `${isIncrease ? '+' : ''}${comparison.percentChange.toFixed(0)}%`;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 rounded-md bg-muted/50 p-3">
      {/* Current Amount */}
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Current</span>
        <p
          className={cn(
            'text-lg font-bold',
            isIncrease ? 'text-destructive' : 'text-green-600'
          )}
        >
          {formattedCurrent}
        </p>
      </div>

      {/* Arrow */}
      <ArrowRight className="h-4 w-4 text-muted-foreground" />

      {/* Average Amount */}
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Average</span>
        <p className="text-lg font-bold text-foreground">{formattedAverage}</p>
      </div>

      {/* Percentage Badge */}
      <Badge
        variant={isIncrease ? 'destructive' : 'default'}
        className={cn(
          'ml-auto text-sm',
          !isIncrease &&
            'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
        )}
      >
        {isIncrease ? (
          <TrendingUp className="mr-1 h-3 w-3" />
        ) : (
          <TrendingDown className="mr-1 h-3 w-3" />
        )}
        {percentText}
      </Badge>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function AmountAnomalyAlert({
  alert,
  result,
  onResolve,
  isResolving = false,
  className,
  compact = false,
}: AmountAnomalyAlertProps) {
  const [selectedAction, setSelectedAction] =
    useState<AmountAnomalyResolution | null>(null);

  // Determine alert type and variant
  const isPriceIncrease = alert.type === 'price_increase';
  const isNewVendor = alert.type === 'new_vendor';
  const alertVariant = isPriceIncrease ? 'warning' : 'default';

  // Get comparison data from alert details or result
  const comparison: AmountComparison | null = result?.comparison || {
    current: alert.details.actualAmount || 0,
    average:
      alert.details.expectedRange?.min && alert.details.expectedRange?.max
        ? (alert.details.expectedRange.min + alert.details.expectedRange.max) /
          2
        : 0,
    percentChange: alert.details.percentageIncrease || 0,
    previousAmount: alert.details.previousAmount,
  };

  // Determine icon
  const Icon = isPriceIncrease ? TrendingUp : isNewVendor ? Store : AlertCircle;

  // Get title
  const title = isPriceIncrease
    ? 'Price Increase Detected'
    : isNewVendor
      ? 'New Vendor'
      : 'Unusual Amount';

  /**
   * Handle resolution action.
   */
  const handleResolve = useCallback(
    async (resolution: AmountAnomalyResolution) => {
      setSelectedAction(resolution);
      await onResolve(resolution);
    },
    [onResolve]
  );

  return (
    <Alert variant={alertVariant} className={cn('relative', className)}>
      <Icon className="h-4 w-4" />

      <AlertTitle className="flex items-center gap-2">
        {title}
        {alert.severity === 'high' && (
          <Badge variant="destructive" className="text-xs">
            High Priority
          </Badge>
        )}
      </AlertTitle>

      <AlertDescription>
        <p className="text-sm">{alert.message}</p>

        {/* Amount Comparison */}
        {!compact && comparison && comparison.average > 0 && (
          <AmountComparisonDisplay
            comparison={comparison}
            type={result?.type || null}
          />
        )}

        {/* Action Buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleResolve('confirm')}
            disabled={isResolving}
            className="gap-1"
          >
            {isResolving && selectedAction === 'confirm' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            {isPriceIncrease ? 'Acknowledge' : 'Looks Correct'}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleResolve('dismiss')}
            disabled={isResolving}
            className="gap-1 text-muted-foreground"
          >
            {isResolving && selectedAction === 'dismiss' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" />
            )}
            Dismiss
          </Button>
        </div>

        {/* Help Text */}
        {!compact && (
          <p className="mt-3 text-xs text-muted-foreground">
            {isPriceIncrease
              ? "Acknowledge to track this new price, or dismiss if it's a one-time charge."
              : "Confirm if the amount is correct, or dismiss if it's expected."}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

// ============================================
// Compact Badge Version
// ============================================

export interface AmountAnomalyBadgeProps {
  /** The anomaly alert */
  alert: AnomalyAlert;

  /** Click handler */
  onClick?: () => void;

  /** Additional CSS class names */
  className?: string;
}

export function AmountAnomalyBadge({
  alert,
  onClick,
  className,
}: AmountAnomalyBadgeProps) {
  const isPriceIncrease = alert.type === 'price_increase';
  const percentChange = alert.details.percentageIncrease;

  return (
    <Badge
      variant={isPriceIncrease ? 'destructive' : 'secondary'}
      className={cn('cursor-pointer gap-1', className)}
      onClick={onClick}
    >
      {isPriceIncrease ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <AlertCircle className="h-3 w-3" />
      )}
      {isPriceIncrease ? `+${percentChange?.toFixed(0) || '?'}%` : 'Unusual'}
    </Badge>
  );
}

// ============================================
// List Version
// ============================================

export interface AmountAnomalyAlertListProps {
  /** Array of amount anomaly alerts */
  alerts: AnomalyAlert[];

  /** Handler when user resolves an alert */
  onResolve: (
    alertId: string,
    resolution: AmountAnomalyResolution
  ) => void | Promise<void>;

  /** Set of alert IDs currently being resolved */
  resolvingIds?: Set<string>;

  /** Additional CSS class names */
  className?: string;
}

export function AmountAnomalyAlertList({
  alerts,
  onResolve,
  resolvingIds = new Set(),
  className,
}: AmountAnomalyAlertListProps) {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {alerts.map((alert) => (
        <AmountAnomalyAlert
          key={alert.id}
          alert={alert}
          onResolve={(resolution) => onResolve(alert.id, resolution)}
          isResolving={resolvingIds.has(alert.id)}
        />
      ))}
    </div>
  );
}

export default AmountAnomalyAlert;
