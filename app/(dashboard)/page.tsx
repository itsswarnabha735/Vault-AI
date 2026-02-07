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
} from '@/components/dashboard';

export default function DashboardPage() {
  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-6">
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

        {/* Recent transactions */}
        <RecentTransactionsList />
      </div>
    </div>
  );
}
