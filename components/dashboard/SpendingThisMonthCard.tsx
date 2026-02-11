/**
 * Spending This Month Card Component
 *
 * Displays total spending this month with comparison to last month.
 */

'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format, isSameMonth } from 'date-fns';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useMonthlyComparison,
  useSpendingTrend,
} from '@/hooks/useDashboardData';
import { formatCurrency, cn } from '@/lib/utils';

interface SpendingThisMonthCardProps {
  /** Selected month to display spending for */
  selectedMonth?: Date;
}

/**
 * Spending This Month Card with comparison to previous month.
 */
export function SpendingThisMonthCard({
  selectedMonth,
}: SpendingThisMonthCardProps = {}) {
  const { data: comparison, isLoading: comparisonLoading } =
    useMonthlyComparison(selectedMonth);
  const { data: trend, isLoading: trendLoading } = useSpendingTrend(
    4,
    selectedMonth
  );

  const isLoading = comparisonLoading || trendLoading;

  if (isLoading) {
    return <SpendingThisMonthCardSkeleton />;
  }

  const {
    thisMonth,
    lastMonth,
    changePercent,
    isIncrease,
    previousMonthLabel,
  } = comparison;
  const hasChange = Math.abs(changePercent) > 0.1;
  const isCurrentMonth =
    !selectedMonth || isSameMonth(selectedMonth, new Date());
  const cardTitle = isCurrentMonth
    ? 'Spending This Month'
    : `Spending in ${format(selectedMonth!, 'MMM yyyy')}`;

  // Determine the comparison label
  const comparisonLabel = `vs ${previousMonthLabel}`;

  // Special case: previous month had no spending but current month does
  const isNewSpending = lastMonth === 0 && thisMonth > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-vault-text-secondary">
          {cardTitle}
        </CardTitle>
        {hasChange ? (
          isIncrease ? (
            <TrendingUp className="h-4 w-4 text-vault-danger" />
          ) : (
            <TrendingDown className="h-4 w-4 text-vault-success" />
          )
        ) : (
          <Minus className="h-4 w-4 text-vault-text-secondary" />
        )}
      </CardHeader>
      <CardContent>
        <div className="font-display font-mono text-2xl font-bold">
          {formatCurrency(thisMonth)}
        </div>

        {/* Comparison to previous month */}
        <div className="mt-2 flex items-center gap-2">
          {isNewSpending ? (
            <span className="flex items-center gap-1 text-xs font-medium text-vault-info-text">
              <TrendingUp className="h-3 w-3" />
              New
            </span>
          ) : hasChange ? (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                isIncrease
                  ? 'text-vault-danger-text'
                  : 'text-vault-success-text'
              )}
            >
              {isIncrease ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {Math.abs(changePercent).toFixed(1)}%
            </span>
          ) : (
            <span className="text-xs text-vault-text-secondary">No change</span>
          )}
          <span className="text-xs text-vault-text-secondary">
            {comparisonLabel}
          </span>
        </div>

        {/* Mini sparkline */}
        <div className="mt-3">
          <MiniSparkline data={trend.map((d) => d.amount)} />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Mini sparkline chart component.
 */
interface MiniSparklineProps {
  data: number[];
}

function MiniSparkline({ data }: MiniSparklineProps) {
  if (data.length === 0) {
    return null;
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const height = 24;
  const width = 100;
  const stepX = width / (data.length - 1 || 1);

  const points = data
    .map((value, i) => {
      const x = i * stepX;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      className="text-vault-gold"
      viewBox={`0 0 ${width} ${height}`}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

/**
 * Skeleton loader for spending this month card.
 */
function SpendingThisMonthCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-3 w-24" />
        <Skeleton className="mt-3 h-6 w-24" />
      </CardContent>
    </Card>
  );
}

export default SpendingThisMonthCard;
