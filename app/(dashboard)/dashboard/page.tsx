/**
 * Dashboard Page
 *
 * Main dashboard displaying financial overview including:
 * - Month picker for filtering data by month
 * - Budget status
 * - Spending trends
 * - Category breakdown
 * - Recent transactions
 *
 * PRIVACY: All data is loaded from local IndexedDB only.
 */

'use client';

import { useState, useCallback } from 'react';

import {
  DashboardHeader,
  MonthPicker,
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
import { useAutoFixCategories } from '@/hooks/useAutoFixCategories';

export default function DashboardPage() {
  // Month filter state — defaults to current month
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());

  const handleMonthChange = useCallback((month: Date) => {
    setSelectedMonth(month);
  }, []);

  // Retroactive auto-categorization: assigns categories to uncategorized
  // transactions using auto-categorizer vendor patterns. Runs once per session.
  const categorizationProgress = useAutoFixCategories();

  // Eager embedding backfill: generates real embeddings for transactions
  // that have zero-filled placeholders (from statement/CSV imports).
  // Runs silently in the background, once per session.
  const { progress: backfillProgress, isRunning: isBackfilling } =
    useEmbeddingBackfill();

  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-6">
        {/* Background auto-categorization indicator */}
        {categorizationProgress.isRunning && categorizationProgress.total > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-50/50 px-3 py-1.5 text-xs text-amber-700 dark:bg-amber-950/10 dark:text-amber-300">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            Auto-categorizing {categorizationProgress.total} transactions...
            {categorizationProgress.fixed > 0 && (
              <span className="text-amber-500">
                ({categorizationProgress.fixed} done)
              </span>
            )}
          </div>
        )}

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

        {/* Month picker filter */}
        <div className="flex items-center justify-between">
          <MonthPicker
            selectedMonth={selectedMonth}
            onMonthChange={handleMonthChange}
          />
        </div>

        {/* Key metrics cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <BudgetStatusCard selectedMonth={selectedMonth} />
          <SpendingThisMonthCard selectedMonth={selectedMonth} />
          <SavingsRateCard selectedMonth={selectedMonth} />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SpendingTrendChart selectedMonth={selectedMonth} />
          <CategoryBreakdownChart selectedMonth={selectedMonth} />
        </div>

        {/* Action cards row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Smart category suggestions (hidden when no uncategorized txns) */}
          <SmartCategorySuggestions />
          {/* Recurring transactions (hidden when no patterns) */}
          <RecurringTransactionsCard />
        </div>

        {/* Recent transactions */}
        <RecentTransactionsList selectedMonth={selectedMonth} />
      </div>
    </div>
  );
}
