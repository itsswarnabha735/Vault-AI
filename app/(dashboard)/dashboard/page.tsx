/**
 * Dashboard Page
 *
 * Main dashboard displaying financial overview including:
 * - Budget status
 * - Spending trends
 * - Category breakdown
 * - Recent transactions
 *
 * PRIVACY: All data is loaded from local IndexedDB only.
 */

'use client';

import {
  DashboardHeader,
  BudgetStatusCard,
  SpendingThisMonthCard,
  SavingsRateCard,
  SpendingTrendChart,
  CategoryBreakdownChart,
  RecentTransactionsList,
  SmartCategorySuggestions,
  RecurringTransactionsCard,
} from '@/components/dashboard';
import { useEmbeddingBackfill } from '@/hooks/useEmbeddingBackfill';

export default function DashboardPage() {
  // Eager embedding backfill: generates real embeddings for transactions
  // that have zero-filled placeholders (from statement/CSV imports).
  // Runs silently in the background, once per session.
  const { progress: backfillProgress, isRunning: isBackfilling } =
    useEmbeddingBackfill();

  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-6">
        {/* Background embedding backfill indicator */}
        {isBackfilling && backfillProgress.total > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-50/50 px-3 py-1.5 text-xs text-blue-700 dark:bg-blue-950/10 dark:text-blue-300">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
            Generating embeddings for {backfillProgress.total} transactions...
            {backfillProgress.completed > 0 && (
              <span className="text-blue-500">
                ({backfillProgress.completed}/{backfillProgress.total})
              </span>
            )}
          </div>
        )}

        {/* Header with welcome message and quick actions */}
        <DashboardHeader />

        {/* Key metrics cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <BudgetStatusCard />
          <SpendingThisMonthCard />
          <SavingsRateCard />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SpendingTrendChart />
          <CategoryBreakdownChart />
        </div>

        {/* Action cards row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Smart category suggestions (hidden when no uncategorized txns) */}
          <SmartCategorySuggestions />
          {/* Recurring transactions (hidden when no patterns) */}
          <RecurringTransactionsCard />
        </div>

        {/* Recent transactions */}
        <RecentTransactionsList />
      </div>
    </div>
  );
}
