/**
 * Recurring Transactions Card
 *
 * Dashboard widget showing detected recurring patterns
 * (subscriptions, EMIs, rent, SIPs) and upcoming payments.
 *
 * PRIVACY: All data stays local.
 */

'use client';

import { RefreshCw, CalendarClock, TrendingUp, ArrowRight } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecurringPatterns } from '@/hooks/useRecurringPatterns';
import { useCategories } from '@/hooks/useLocalDB';
import { formatCurrency, cn } from '@/lib/utils';
import type { RecurrenceFrequency } from '@/lib/processing/recurring-detector';

// ============================================
// Helpers
// ============================================

const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'semi-annual': 'Semi-annual',
  annual: 'Annual',
};

const FREQUENCY_COLORS: Record<RecurrenceFrequency, string> = {
  weekly: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  biweekly: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  monthly: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  quarterly: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  'semi-annual': 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  annual: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil(
    (target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function formatRelativeDate(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `In ${days} days`;
  if (days <= 14) return 'Next week';
  return `In ${Math.ceil(days / 7)} weeks`;
}

// ============================================
// Component
// ============================================

export function RecurringTransactionsCard() {
  const {
    activePatterns,
    upcoming,
    monthlyRecurringTotal,
    isLoading,
    refresh,
  } = useRecurringPatterns();
  const { data: categories } = useCategories();

  if (isLoading) {
    return <RecurringCardSkeleton />;
  }

  // Don't render if no patterns detected
  if (activePatterns.length === 0) {
    return null;
  }

  // Build category lookup
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-vault-text-secondary">
          <RefreshCw className="h-4 w-4" />
          Recurring Transactions
          <Badge variant="outline" className="ml-1 font-mono text-[10px]">
            {activePatterns.length}
          </Badge>
        </CardTitle>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-xs text-muted-foreground hover:text-foreground"
          title="Refresh detection"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Monthly total */}
        <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Est. monthly recurring
          </div>
          <span className="font-mono text-sm font-semibold">
            {formatCurrency(monthlyRecurringTotal)}
          </span>
        </div>

        {/* Upcoming section */}
        {upcoming.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <CalendarClock className="h-3 w-3" />
              Upcoming (next 30 days)
            </p>
            <div className="space-y-1">
              {upcoming.slice(0, 4).map((pattern) => {
                const cat = pattern.categoryId
                  ? categoryMap.get(pattern.categoryId)
                  : null;
                const days = daysUntil(pattern.nextExpected);

                return (
                  <div
                    key={pattern.id}
                    className={cn(
                      'flex items-center justify-between rounded-md border px-2.5 py-1.5',
                      days <= 3
                        ? 'border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10'
                        : 'border-border bg-background'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-medium">
                          {cat?.icon || ''} {pattern.displayVendor}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            'shrink-0 px-1 py-0 text-[9px]',
                            FREQUENCY_COLORS[pattern.frequency]
                          )}
                        >
                          {FREQUENCY_LABELS[pattern.frequency]}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {formatRelativeDate(pattern.nextExpected)}
                        {' · '}
                        {pattern.transactionCount} occurrences
                      </p>
                    </div>
                    <span className="ml-2 shrink-0 font-mono text-xs font-medium">
                      {formatCurrency(pattern.averageAmount, pattern.currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All recurring patterns */}
        {activePatterns.length > upcoming.length && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              All Detected Patterns
            </p>
            <div className="space-y-1">
              {activePatterns
                .filter(
                  (p) => !upcoming.some((u) => u.id === p.id)
                )
                .slice(0, 3)
                .map((pattern) => {
                  const cat = pattern.categoryId
                    ? categoryMap.get(pattern.categoryId)
                    : null;

                  return (
                    <div
                      key={pattern.id}
                      className="flex items-center justify-between rounded-md px-2.5 py-1"
                    >
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{cat?.icon || '📦'}</span>
                        <span className="truncate">{pattern.displayVendor}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'px-1 py-0 text-[9px]',
                            FREQUENCY_COLORS[pattern.frequency]
                          )}
                        >
                          {FREQUENCY_LABELS[pattern.frequency]}
                        </Badge>
                      </div>
                      <span className="ml-2 shrink-0 font-mono text-[11px]">
                        {formatCurrency(pattern.averageAmount, pattern.currency)}
                      </span>
                    </div>
                  );
                })}
              {activePatterns.length > upcoming.length + 3 && (
                <p className="text-center text-[10px] text-muted-foreground">
                  +{activePatterns.length - upcoming.length - 3} more
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Skeleton
// ============================================

function RecurringCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </CardContent>
    </Card>
  );
}
