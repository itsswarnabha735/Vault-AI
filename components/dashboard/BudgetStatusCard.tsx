/**
 * Budget Status Card Component
 *
 * Displays overall budget status with progress indicator.
 */

'use client';

import { Wallet } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useBudgetStatus } from '@/hooks/useDashboardData';
import { formatCurrency, cn } from '@/lib/utils';

interface BudgetStatusCardProps {
  /** Selected month to display budget status for */
  selectedMonth?: Date;
}

/**
 * Budget Status Card showing total budget usage.
 */
export function BudgetStatusCard({
  selectedMonth,
}: BudgetStatusCardProps = {}) {
  const { totalBudget, totalSpent, percentage, isLoading } =
    useBudgetStatus(selectedMonth);

  if (isLoading) {
    return <BudgetStatusCardSkeleton />;
  }

  const remaining = totalBudget - totalSpent;
  const isOver = percentage >= 100;
  const isWarning = percentage >= 80 && percentage < 100;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-vault-text-secondary">
          Budget Status
        </CardTitle>
        <Wallet className="h-4 w-4 text-vault-text-secondary" />
      </CardHeader>
      <CardContent>
        {totalBudget > 0 ? (
          <>
            <div className="font-display font-mono text-2xl font-bold">
              {formatCurrency(totalSpent)} / {formatCurrency(totalBudget)}
            </div>
            <Progress
              value={Math.min(percentage, 100)}
              className={cn(
                'mt-3',
                isOver && '[&>div]:bg-vault-danger',
                isWarning && '[&>div]:bg-vault-warning',
                !isOver && !isWarning && '[&>div]:bg-vault-success'
              )}
            />
            <p
              className={cn(
                'mt-2 text-xs',
                isOver && 'text-vault-danger-text',
                isWarning && 'text-vault-warning-text',
                !isOver && !isWarning && 'text-vault-text-secondary'
              )}
            >
              {isOver ? (
                <>Over budget by {formatCurrency(Math.abs(remaining))}</>
              ) : (
                <>{percentage.toFixed(0)}% of monthly budget used</>
              )}
            </p>
          </>
        ) : (
          <div className="py-2">
            <p className="text-sm text-vault-text-secondary">
              No budget set yet
            </p>
            <p className="mt-1 text-xs text-vault-text-secondary">
              Set up a budget in Settings to track your spending
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton loader for budget status card.
 */
function BudgetStatusCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-3 h-2 w-full" />
        <Skeleton className="mt-2 h-3 w-36" />
      </CardContent>
    </Card>
  );
}

export default BudgetStatusCard;
