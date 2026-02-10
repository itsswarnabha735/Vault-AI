/**
 * Spending This Month Card Component
 *
 * Displays total spending this month with comparison to last month.
 */

'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useMonthlyComparison,
  useSpendingTrend,
} from '@/hooks/useDashboardData';
import { formatCurrency, cn } from '@/lib/utils';

/**
 * Spending This Month Card with comparison to last month.
 */
export function SpendingThisMonthCard() {
  const { data: comparison, isLoading: comparisonLoading } =
    useMonthlyComparison();
  const { data: trend, isLoading: trendLoading } = useSpendingTrend(4);

  const isLoading = comparisonLoading || trendLoading;

  if (isLoading) {
    return <SpendingThisMonthCardSkeleton />;
  }

  const { thisMonth, changePercent, isIncrease } = comparison;
  const hasChange = Math.abs(changePercent) > 0.1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-vault-text-secondary">
          Spending This Month
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
        <div className="font-display text-2xl font-bold font-mono">
          {formatCurrency(thisMonth)}
        </div>

        {/* Comparison to last month */}
        <div className="mt-2 flex items-center gap-2">
          {hasChange ? (
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
          <span className="text-xs text-vault-text-secondary">vs last month</span>
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
