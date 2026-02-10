/**
 * Category Breakdown Chart Component
 *
 * Displays spending by category as a donut chart with interactive legend.
 */

'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategorySpending } from '@/hooks/useDashboardData';
import { formatCurrency, cn } from '@/lib/utils';

/**
 * Category Breakdown Chart with donut chart and interactive legend.
 */
export function CategoryBreakdownChart() {
  const { data, isLoading } = useCategorySpending();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (isLoading) {
    return <CategoryBreakdownChartSkeleton />;
  }

  const hasData = data.length > 0;

  // Prepare chart data
  const chartData = data.map((item) => ({
    name: item.categoryName,
    value: item.amount,
    color: item.categoryColor,
    icon: item.categoryIcon,
    percentage: item.percentage,
    categoryId: item.categoryId,
    transactionCount: item.transactionCount,
  }));

  const totalSpending = data.reduce((sum, d) => sum + d.amount, 0);

  const onPieEnter = (_: unknown, index: number) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    setActiveIndex(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Spending by Category
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="flex flex-col gap-4 lg:flex-row">
            {/* Donut Chart */}
            <div className="flex-shrink-0">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    onMouseEnter={onPieEnter}
                    onMouseLeave={onPieLeave}
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        stroke="none"
                        className="transition-opacity hover:opacity-80"
                        style={{
                          opacity:
                            activeIndex === null || activeIndex === index
                              ? 1
                              : 0.6,
                          transform:
                            activeIndex === index ? 'scale(1.02)' : 'scale(1)',
                          transformOrigin: 'center',
                          transition: 'all 0.2s ease',
                        }}
                      />
                    ))}
                  </Pie>
                  {/* Center text */}
                  <text
                    x="50%"
                    y="50%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-vault-text-primary font-mono text-lg font-bold"
                  >
                    {formatCurrency(totalSpending)}
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-2">
              {chartData.slice(0, 6).map((item, index) => (
                <Link
                  key={item.categoryId ?? 'uncategorized'}
                  href={`/vault?category=${item.categoryId ?? ''}`}
                  className={cn(
                    'flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-vault-bg-hover',
                    activeIndex === index && 'bg-vault-bg-surface'
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm">{item.icon}</span>
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-medium">
                      {formatCurrency(item.value)}
                    </div>
                    <div className="text-xs text-vault-text-secondary">
                      {item.percentage.toFixed(1)}%
                    </div>
                  </div>
                </Link>
              ))}
              {chartData.length > 6 && (
                <Link
                  href="/vault"
                  className="block text-center text-xs text-vault-gold hover:text-vault-gold-secondary"
                >
                  +{chartData.length - 6} more categories
                </Link>
              )}
            </div>
          </div>
        ) : (
          <EmptyState />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Empty state component.
 */
function EmptyState() {
  return (
    <div className="flex h-[200px] flex-col items-center justify-center text-center">
      <svg
        className="h-12 w-12 text-vault-text-secondary/40"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
        />
      </svg>
      <p className="mt-3 text-sm font-medium text-vault-text-secondary">
        No category data yet
      </p>
      <p className="mt-1 text-xs text-vault-text-secondary/70">
        Categorize transactions to see breakdown
      </p>
    </div>
  );
}

/**
 * Skeleton loader for category breakdown chart.
 */
function CategoryBreakdownChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 lg:flex-row">
          <Skeleton className="h-[200px] w-[200px] rounded-full" />
          <div className="flex-1 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CategoryBreakdownChart;
