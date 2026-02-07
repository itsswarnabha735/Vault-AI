/**
 * AnomalyCenter Component
 *
 * Dashboard for viewing and managing all anomaly alerts including:
 * - Duplicate transactions
 * - Amount anomalies (unusual amounts, price increases)
 * - New vendor alerts
 *
 * Features:
 * - Filter by anomaly type
 * - Bulk actions for resolving multiple alerts
 * - Statistics overview
 */

'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  Copy,
  TrendingUp,
  Store,
  AlertTriangle,
  Check,
  X,
  Filter,
  CheckCircle2,
  Loader2 as _Loader2,
  RefreshCw,
  AlertCircle,
  BarChart3,
} from 'lucide-react';

import { cn } from '@/lib/utils/index';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

import { DuplicateAlert, type DuplicateResolution } from './DuplicateAlert';
import {
  AmountAnomalyAlert,
  type AmountAnomalyResolution,
} from './AmountAnomalyAlert';
import type {
  AnomalyAlert,
  AnomalyType,
  LocalTransaction,
} from '@/types/database';

// ============================================
// Types
// ============================================

/**
 * Filter options for anomaly types.
 */
export type AnomalyFilter = 'all' | AnomalyType;

/**
 * Anomaly statistics for the dashboard.
 */
export interface AnomalyStats {
  total: number;
  duplicates: number;
  unusualAmounts: number;
  priceIncreases: number;
  newVendors: number;
  resolved: number;
  pending: number;
}

/**
 * Props for the AnomalyCenter component.
 */
export interface AnomalyCenterProps {
  /** All anomaly alerts */
  alerts: AnomalyAlert[];

  /** Map of transactions by ID for displaying details */
  transactionsById: Map<string, LocalTransaction>;

  /** Handler for resolving duplicate alerts */
  onResolveDuplicate: (
    alertId: string,
    resolution: DuplicateResolution
  ) => void | Promise<void>;

  /** Handler for resolving amount anomaly alerts */
  onResolveAmountAnomaly: (
    alertId: string,
    resolution: AmountAnomalyResolution
  ) => void | Promise<void>;

  /** Whether data is loading */
  isLoading?: boolean;

  /** Set of alert IDs currently being resolved */
  resolvingIds?: Set<string>;

  /** Handler to refresh alerts */
  onRefresh?: () => void;

  /** Additional CSS class names */
  className?: string;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate anomaly statistics from alerts.
 */
function calculateStats(alerts: AnomalyAlert[]): AnomalyStats {
  const stats: AnomalyStats = {
    total: alerts.length,
    duplicates: 0,
    unusualAmounts: 0,
    priceIncreases: 0,
    newVendors: 0,
    resolved: 0,
    pending: 0,
  };

  for (const alert of alerts) {
    if (alert.isResolved) {
      stats.resolved++;
    } else {
      stats.pending++;
    }

    switch (alert.type) {
      case 'duplicate':
        stats.duplicates++;
        break;
      case 'unusual_amount':
        stats.unusualAmounts++;
        break;
      case 'price_increase':
        stats.priceIncreases++;
        break;
      case 'new_vendor':
        stats.newVendors++;
        break;
    }
  }

  return stats;
}

/**
 * Get icon for anomaly type.
 */
function _getAnomalyIcon(type: AnomalyType) {
  switch (type) {
    case 'duplicate':
      return Copy;
    case 'price_increase':
      return TrendingUp;
    case 'new_vendor':
      return Store;
    case 'unusual_amount':
    default:
      return AlertTriangle;
  }
}

/**
 * Get display name for anomaly type.
 */
function getAnomalyTypeName(type: AnomalyType): string {
  switch (type) {
    case 'duplicate':
      return 'Duplicate';
    case 'price_increase':
      return 'Price Increase';
    case 'new_vendor':
      return 'New Vendor';
    case 'unusual_amount':
      return 'Unusual Amount';
    default:
      return 'Unknown';
  }
}

// ============================================
// Sub-components
// ============================================

interface StatsCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  variant?: 'default' | 'warning' | 'success' | 'muted';
}

function StatsCard({
  title,
  value,
  icon: Icon,
  variant = 'default',
}: StatsCardProps) {
  return (
    <Card
      className={cn(
        'transition-colors',
        variant === 'warning' &&
          value > 0 &&
          'border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950',
        variant === 'success' &&
          'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950'
      )}
    >
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            variant === 'warning' &&
              'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-400',
            variant === 'success' &&
              'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400',
            variant === 'muted' && 'bg-muted text-muted-foreground',
            variant === 'default' && 'bg-primary/10 text-primary'
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface EmptyStateProps {
  filter: AnomalyFilter;
}

function EmptyState({ filter }: EmptyStateProps) {
  const message =
    filter === 'all'
      ? 'No anomalies detected'
      : `No ${getAnomalyTypeName(filter).toLowerCase()} anomalies`;

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <CheckCircle2 className="mb-4 h-12 w-12 text-green-500" />
      <h3 className="text-lg font-semibold">{message}</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Your transactions look good! We&apos;ll alert you if we detect anything
        unusual.
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function AnomalyCenter({
  alerts,
  transactionsById,
  onResolveDuplicate,
  onResolveAmountAnomaly,
  isLoading = false,
  resolvingIds = new Set(),
  onRefresh,
  className,
}: AnomalyCenterProps) {
  const [filter, setFilter] = useState<AnomalyFilter>('all');
  const [showResolved, setShowResolved] = useState(false);
  const [bulkSelecting, setBulkSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Calculate statistics
  const stats = useMemo(() => calculateStats(alerts), [alerts]);

  // Filter alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      // Filter by resolved status
      if (!showResolved && alert.isResolved) {
        return false;
      }

      // Filter by type
      if (filter !== 'all' && alert.type !== filter) {
        return false;
      }

      return true;
    });
  }, [alerts, filter, showResolved]);

  // Group alerts by type for tabbed view
  const _alertsByType = useMemo(() => {
    const grouped: Record<string, AnomalyAlert[]> = {
      all: filteredAlerts,
      duplicate: [],
      unusual_amount: [],
      price_increase: [],
      new_vendor: [],
    };

    for (const alert of filteredAlerts) {
      if (grouped[alert.type]) {
        grouped[alert.type]!.push(alert);
      }
    }

    return grouped;
  }, [filteredAlerts]);

  /**
   * Toggle bulk selection mode.
   */
  const toggleBulkSelect = useCallback(() => {
    setBulkSelecting((prev) => !prev);
    setSelectedIds(new Set());
  }, []);

  /**
   * Toggle selection of an alert.
   */
  const toggleSelection = useCallback((alertId: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(alertId)) {
        newSet.delete(alertId);
      } else {
        newSet.add(alertId);
      }
      return newSet;
    });
  }, []);

  /**
   * Select all visible alerts.
   */
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredAlerts.map((a) => a.id)));
  }, [filteredAlerts]);

  /**
   * Render an alert based on its type.
   */
  const renderAlert = useCallback(
    (alert: AnomalyAlert) => {
      const isResolving = resolvingIds.has(alert.id);

      if (alert.type === 'duplicate') {
        // Get the original and new transactions for duplicate alerts
        const originalTx = transactionsById.get(alert.transactionId);
        const newTx = alert.relatedTransactionIds?.[0]
          ? transactionsById.get(alert.relatedTransactionIds[0])
          : undefined;

        return (
          <DuplicateAlert
            key={alert.id}
            alert={alert}
            originalTransaction={originalTx || null}
            newTransaction={newTx || null}
            onResolve={(resolution) => onResolveDuplicate(alert.id, resolution)}
            isResolving={isResolving}
          />
        );
      }

      // Amount anomaly (unusual_amount, price_increase, new_vendor)
      return (
        <AmountAnomalyAlert
          key={alert.id}
          alert={alert}
          onResolve={(resolution) =>
            onResolveAmountAnomaly(alert.id, resolution)
          }
          isResolving={isResolving}
        />
      );
    },
    [transactionsById, onResolveDuplicate, onResolveAmountAnomaly, resolvingIds]
  );

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Anomaly Center</h2>
          <p className="text-sm text-muted-foreground">
            Review and resolve detected anomalies in your transactions
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw
                className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')}
              />
              Refresh
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" />
                Options
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Display Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowResolved(!showResolved)}>
                {showResolved ? (
                  <X className="mr-2 h-4 w-4" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {showResolved ? 'Hide Resolved' : 'Show Resolved'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleBulkSelect}>
                {bulkSelecting ? (
                  <X className="mr-2 h-4 w-4" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {bulkSelecting ? 'Cancel Selection' : 'Bulk Select'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Pending Anomalies"
          value={stats.pending}
          icon={AlertCircle}
          variant={stats.pending > 0 ? 'warning' : 'success'}
        />
        <StatsCard
          title="Duplicates"
          value={stats.duplicates}
          icon={Copy}
          variant="default"
        />
        <StatsCard
          title="Price Increases"
          value={stats.priceIncreases}
          icon={TrendingUp}
          variant="default"
        />
        <StatsCard
          title="Resolved"
          value={stats.resolved}
          icon={CheckCircle2}
          variant="muted"
        />
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Anomaly Alerts
              </CardTitle>
              <CardDescription>
                {filteredAlerts.length} alert
                {filteredAlerts.length !== 1 && 's'}{' '}
                {filter !== 'all' && `(${getAnomalyTypeName(filter)})`}
              </CardDescription>
            </div>

            {/* Bulk Actions */}
            {bulkSelecting && selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{selectedIds.size} selected</Badge>
                <Button size="sm" variant="outline" onClick={selectAll}>
                  Select All
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {/* Tabs for filtering */}
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as AnomalyFilter)}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="all" className="gap-1">
                All
                {stats.pending > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1.5 text-xs">
                    {stats.pending}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="duplicate" className="gap-1">
                <Copy className="h-3 w-3" />
                Duplicates
              </TabsTrigger>
              <TabsTrigger value="price_increase" className="gap-1">
                <TrendingUp className="h-3 w-3" />
                Price Changes
              </TabsTrigger>
              <TabsTrigger value="unusual_amount" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Unusual
              </TabsTrigger>
            </TabsList>

            {/* Alert List */}
            <TabsContent value={filter} className="mt-4 space-y-4">
              {isLoading ? (
                <LoadingSkeleton />
              ) : filteredAlerts.length === 0 ? (
                <EmptyState filter={filter} />
              ) : (
                <div className="space-y-4">
                  {filteredAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={cn(
                        'relative',
                        bulkSelecting && 'pl-8',
                        alert.isResolved && 'opacity-60'
                      )}
                    >
                      {bulkSelecting && (
                        <button
                          type="button"
                          className={cn(
                            'absolute left-0 top-4 h-5 w-5 rounded border transition-colors',
                            selectedIds.has(alert.id)
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/30'
                          )}
                          onClick={() => toggleSelection(alert.id)}
                        >
                          {selectedIds.has(alert.id) && (
                            <Check className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      {renderAlert(alert)}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// Compact Widget Version
// ============================================

export interface AnomalyWidgetProps {
  /** Number of unresolved anomalies */
  count: number;

  /** Handler to navigate to AnomalyCenter */
  onClick: () => void;

  /** Additional CSS class names */
  className?: string;
}

export function AnomalyWidget({
  count,
  onClick,
  className,
}: AnomalyWidgetProps) {
  if (count === 0) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn(
        'gap-2 border-orange-300 bg-orange-50 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950 dark:hover:bg-orange-900',
        className
      )}
    >
      <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
      <span className="font-medium text-orange-700 dark:text-orange-300">
        {count} Anomal{count === 1 ? 'y' : 'ies'}
      </span>
    </Button>
  );
}

export default AnomalyCenter;
