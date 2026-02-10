/**
 * Savings Rate Card Component
 *
 * Displays income vs expenses and savings rate percentage.
 */

'use client';

import { PiggyBank, TrendingUp, TrendingDown, Minus } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSavingsRate } from '@/hooks/useDashboardData';
import { formatCurrency, cn } from '@/lib/utils';

/**
 * Savings Rate Card showing income, expenses, and savings rate.
 */
export function SavingsRateCard() {
  const { data, isLoading } = useSavingsRate();

  if (isLoading) {
    return <SavingsRateCardSkeleton />;
  }

  const { income, expenses, savings, savingsRate, trend } = data;
  const hasData = income > 0 || expenses > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-vault-text-secondary">
          Savings Rate
        </CardTitle>
        <PiggyBank className="h-4 w-4 text-vault-text-secondary" />
      </CardHeader>
      <CardContent>
        {hasData ? (
          <>
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  'font-display text-2xl font-bold',
                  savingsRate >= 20
                    ? 'text-vault-success-text'
                    : savingsRate >= 0
                      ? 'text-vault-warning-text'
                      : 'text-vault-danger-text'
                )}
              >
                {savingsRate.toFixed(1)}%
              </span>
              <TrendIndicator trend={trend} />
            </div>

            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-vault-text-secondary">Income</span>
                <span className="font-mono font-medium text-vault-success-text">
                  +{formatCurrency(income)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-vault-text-secondary">Expenses</span>
                <span className="font-mono font-medium text-vault-danger-text">
                  -{formatCurrency(expenses)}
                </span>
              </div>
              <div className="flex justify-between border-t border-[rgba(255,255,255,0.06)] pt-1.5">
                <span className="text-vault-text-secondary">Net Savings</span>
                <span
                  className={cn(
                    'font-mono font-semibold',
                    savings >= 0
                      ? 'text-vault-success-text'
                      : 'text-vault-danger-text'
                  )}
                >
                  {savings >= 0 ? '+' : ''}
                  {formatCurrency(savings)}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="py-2">
            <p className="text-sm text-vault-text-secondary">No data yet</p>
            <p className="mt-1 text-xs text-vault-text-secondary">
              Add transactions to see your savings rate
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Trend indicator component.
 */
interface TrendIndicatorProps {
  trend: 'up' | 'down' | 'stable';
}

function TrendIndicator({ trend }: TrendIndicatorProps) {
  if (trend === 'stable') {
    return (
      <span className="flex items-center gap-0.5 text-xs text-vault-text-secondary">
        <Minus className="h-3 w-3" />
        Stable
      </span>
    );
  }

  const isUp = trend === 'up';

  return (
    <span
      className={cn(
        'flex items-center gap-0.5 text-xs',
        isUp ? 'text-vault-success-text' : 'text-vault-danger-text'
      )}
    >
      {isUp ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {isUp ? 'Improving' : 'Declining'}
    </span>
  );
}

/**
 * Skeleton loader for savings rate card.
 */
function SavingsRateCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20" />
        <div className="mt-3 space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

export default SavingsRateCard;
