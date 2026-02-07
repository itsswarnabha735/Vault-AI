/**
 * Spending Trend Chart Component
 *
 * Displays spending trend over the last 6 months using Recharts.
 */

'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSpendingTrend } from '@/hooks/useDashboardData';
import { formatCurrency } from '@/lib/utils';

/**
 * Spending Trend Chart showing last 6 months of spending.
 */
export function SpendingTrendChart() {
  const { data, isLoading } = useSpendingTrend(6);

  if (isLoading) {
    return <SpendingTrendChartSkeleton />;
  }

  const hasData = data.some((d) => d.amount > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Spending Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="spendingGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e5e7eb"
                className="dark:stroke-gray-700"
              />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#6b7280' }}
                className="dark:fill-gray-400"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                width={50}
                className="dark:fill-gray-400"
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{
                  stroke: '#3b82f6',
                  strokeWidth: 1,
                  strokeDasharray: '4 4',
                }}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#spendingGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Custom tooltip component for the chart.
 */
interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { label: string } }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const firstPayload = payload[0];
  if (!firstPayload) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-md dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-medium text-muted-foreground">
        {firstPayload.payload.label}
      </p>
      <p className="text-sm font-semibold text-foreground">
        {formatCurrency(firstPayload.value)}
      </p>
    </div>
  );
}

/**
 * Empty state component.
 */
function EmptyState() {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center text-center">
      <svg
        className="h-12 w-12 text-gray-300 dark:text-gray-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
      <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">
        No spending data yet
      </p>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
        Add transactions to see your spending trend
      </p>
    </div>
  );
}

/**
 * Skeleton loader for spending trend chart.
 */
function SpendingTrendChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <Skeleton className="h-full w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

export default SpendingTrendChart;
