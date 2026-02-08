/**
 * Dashboard Data Hook for Vault-AI
 *
 * Aggregates all data needed for the dashboard view including:
 * - Budget status
 * - Spending trends
 * - Category breakdowns
 * - Recent transactions
 *
 * PRIVACY: All data is loaded from local IndexedDB only.
 */

'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  format,
  startOfYear,
  endOfYear,
} from 'date-fns';

import { db } from '@/lib/storage/db';
import { useTransactions, useBudgets, useCategories } from './useLocalDB';
import type { LocalTransaction, Category } from '@/types/database';

// ============================================
// Types
// ============================================

export interface SpendingTrendPoint {
  month: string;
  amount: number;
  label: string;
}

export interface CategorySpending {
  categoryId: string | null;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  amount: number;
  percentage: number;
  transactionCount: number;
}

export interface MonthlyComparison {
  thisMonth: number;
  lastMonth: number;
  change: number;
  changePercent: number;
  isIncrease: boolean;
}

export interface SavingsData {
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number;
  trend: 'up' | 'down' | 'stable';
}

export interface DashboardData {
  // Budget overview
  totalBudget: number;
  totalSpent: number;
  budgetPercentage: number;
  budgetStatus: 'under' | 'warning' | 'over';

  // Monthly spending
  monthlySpending: MonthlyComparison;

  // Savings rate
  savingsData: SavingsData;

  // Trends (last 6 months)
  spendingTrend: SpendingTrendPoint[];

  // Category breakdown (current month)
  categoryBreakdown: CategorySpending[];

  // Recent transactions
  recentTransactions: LocalTransaction[];

  // Loading states
  isLoading: boolean;
}

// ============================================
// Helper Functions
// ============================================

function calculateMonthlySpending(
  transactions: LocalTransaction[],
  startDate: Date,
  endDate: Date
): number {
  const start = format(startDate, 'yyyy-MM-dd');
  const end = format(endDate, 'yyyy-MM-dd');

  return transactions
    .filter((tx) => tx.date >= start && tx.date <= end && tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);
}

function calculateMonthlyIncome(
  transactions: LocalTransaction[],
  startDate: Date,
  endDate: Date
): number {
  const start = format(startDate, 'yyyy-MM-dd');
  const end = format(endDate, 'yyyy-MM-dd');

  return transactions
    .filter((tx) => tx.date >= start && tx.date <= end && tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
}

// ============================================
// useBudgetStatus Hook
// ============================================

/**
 * Hook to get aggregated budget status for the dashboard.
 */
export function useBudgetStatus() {
  const { data: budgets, isLoading: budgetsLoading } = useBudgets();

  const status = useMemo(() => {
    if (budgetsLoading || !budgets.length) {
      return {
        budgets: [],
        spending: [],
        totalBudget: 0,
        totalSpent: 0,
        percentage: 0,
        isLoading: budgetsLoading,
      };
    }

    const totalBudget = budgets.reduce((sum, b) => sum + b.budget.amount, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
    const percentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    return {
      budgets: budgets.map((b) => b.budget),
      spending: budgets.map((b) => ({
        budgetId: b.budget.id,
        amount: b.spent,
      })),
      totalBudget,
      totalSpent,
      percentage,
      isLoading: false,
    };
  }, [budgets, budgetsLoading]);

  return status;
}

// ============================================
// useSpendingTrend Hook
// ============================================

/**
 * Hook to get spending trend data for the last N months.
 *
 * @param months - Number of months to include (default: 6)
 */
export function useSpendingTrend(months: number = 6) {
  const data = useLiveQuery(async () => {
    const now = new Date();
    const trendData: SpendingTrendPoint[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const start = format(startOfMonth(monthDate), 'yyyy-MM-dd');
      const end = format(endOfMonth(monthDate), 'yyyy-MM-dd');

      const transactions = await db.transactions
        .where('date')
        .between(start, end, true, true)
        .toArray();

      const spending = transactions
        .filter((tx) => tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0);

      trendData.push({
        month: format(monthDate, 'MMM'),
        label: format(monthDate, 'MMMM yyyy'),
        amount: spending,
      });
    }

    return trendData;
  }, [months]);

  return {
    data: data ?? [],
    isLoading: data === undefined,
  };
}

// ============================================
// useCategorySpending Hook
// ============================================

/**
 * Hook to get spending breakdown by category for the current month.
 */
export function useCategorySpending() {
  const { data: categories, isLoading: categoriesLoading } = useCategories();

  const data = useLiveQuery(
    async () => {
      const now = new Date();
      const start = format(startOfMonth(now), 'yyyy-MM-dd');
      const end = format(endOfMonth(now), 'yyyy-MM-dd');

      const transactions = await db.transactions
        .where('date')
        .between(start, end, true, true)
        .toArray();

      // Filter expenses only (positive amounts)
      const expenses = transactions.filter((tx) => tx.amount > 0);

      // Group by category
      const categoryMap = new Map<string | null, number>();
      const categoryCountMap = new Map<string | null, number>();

      for (const tx of expenses) {
        const key = tx.category;
        categoryMap.set(key, (categoryMap.get(key) ?? 0) + tx.amount);
        categoryCountMap.set(key, (categoryCountMap.get(key) ?? 0) + 1);
      }

      const totalSpending = expenses.reduce((sum, tx) => sum + tx.amount, 0);

      // Build category spending array
      const categorySpending: CategorySpending[] = [];

      categoryMap.forEach((amount, categoryId) => {
        const category = categories.find((c) => c.id === categoryId);
        categorySpending.push({
          categoryId,
          categoryName: category?.name ?? 'Uncategorized',
          categoryIcon: category?.icon ?? '📦',
          categoryColor: category?.color ?? '#6b7280',
          amount,
          percentage: totalSpending > 0 ? (amount / totalSpending) * 100 : 0,
          transactionCount: categoryCountMap.get(categoryId) ?? 0,
        });
      });

      // Sort by amount descending
      return categorySpending.sort((a, b) => b.amount - a.amount);
    },
    [categories],
    []
  );

  return {
    data: data ?? [],
    isLoading: categoriesLoading || data === undefined,
  };
}

// ============================================
// useMonthlyComparison Hook
// ============================================

/**
 * Hook to compare this month's spending with last month.
 */
export function useMonthlyComparison() {
  const data = useLiveQuery(async () => {
    const now = new Date();

    // This month
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);

    // Last month
    const lastMonthDate = subMonths(now, 1);
    const lastMonthStart = startOfMonth(lastMonthDate);
    const lastMonthEnd = endOfMonth(lastMonthDate);

    // Get all transactions for both months
    const allTransactions = await db.transactions.toArray();

    const thisMonth = calculateMonthlySpending(
      allTransactions,
      thisMonthStart,
      thisMonthEnd
    );
    const lastMonth = calculateMonthlySpending(
      allTransactions,
      lastMonthStart,
      lastMonthEnd
    );

    const change = thisMonth - lastMonth;
    const changePercent = lastMonth > 0 ? (change / lastMonth) * 100 : 0;

    return {
      thisMonth,
      lastMonth,
      change,
      changePercent,
      isIncrease: change > 0,
    };
  }, []);

  return {
    data: data ?? {
      thisMonth: 0,
      lastMonth: 0,
      change: 0,
      changePercent: 0,
      isIncrease: false,
    },
    isLoading: data === undefined,
  };
}

// ============================================
// useSavingsRate Hook
// ============================================

/**
 * Hook to calculate savings rate (income vs expenses).
 */
export function useSavingsRate() {
  const data = useLiveQuery(async () => {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthDate = subMonths(now, 1);
    const lastMonthStart = startOfMonth(lastMonthDate);
    const lastMonthEnd = endOfMonth(lastMonthDate);

    const allTransactions = await db.transactions.toArray();

    // This month
    const income = calculateMonthlyIncome(
      allTransactions,
      thisMonthStart,
      thisMonthEnd
    );
    const expenses = calculateMonthlySpending(
      allTransactions,
      thisMonthStart,
      thisMonthEnd
    );
    const savings = income - expenses;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;

    // Last month for trend
    const lastMonthIncome = calculateMonthlyIncome(
      allTransactions,
      lastMonthStart,
      lastMonthEnd
    );
    const lastMonthExpenses = calculateMonthlySpending(
      allTransactions,
      lastMonthStart,
      lastMonthEnd
    );
    const lastMonthSavingsRate =
      lastMonthIncome > 0
        ? ((lastMonthIncome - lastMonthExpenses) / lastMonthIncome) * 100
        : 0;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (savingsRate > lastMonthSavingsRate + 1) {
      trend = 'up';
    } else if (savingsRate < lastMonthSavingsRate - 1) {
      trend = 'down';
    }

    return {
      income,
      expenses,
      savings,
      savingsRate,
      trend,
    };
  }, []);

  return {
    data: data ?? {
      income: 0,
      expenses: 0,
      savings: 0,
      savingsRate: 0,
      trend: 'stable' as const,
    },
    isLoading: data === undefined,
  };
}

// ============================================
// useRecentTransactions Hook
// ============================================

/**
 * Hook to get recent transactions with category info.
 *
 * @param limit - Maximum number of transactions (default: 10)
 */
export function useRecentTransactions(limit: number = 10) {
  const { data: categories, isLoading: categoriesLoading } = useCategories();

  const transactions = useLiveQuery(async () => {
    return db.transactions.orderBy('date').reverse().limit(limit).toArray();
  }, [limit]);

  const transactionsWithCategory = useMemo(() => {
    if (!transactions) return [];
    return transactions.map((tx) => ({
      ...tx,
      categoryData: categories.find((c) => c.id === tx.category),
    }));
  }, [transactions, categories]);

  return {
    data: transactionsWithCategory,
    isLoading: categoriesLoading || transactions === undefined,
  };
}

// ============================================
// useDashboardData Hook (Aggregated)
// ============================================

/**
 * Main hook to get all dashboard data.
 * Combines all individual hooks for convenience.
 */
export function useDashboardData(): DashboardData {
  const budgetStatus = useBudgetStatus();
  const monthlyComparison = useMonthlyComparison();
  const savingsRate = useSavingsRate();
  const spendingTrend = useSpendingTrend(6);
  const categorySpending = useCategorySpending();
  const recentTransactions = useRecentTransactions(10);

  const isLoading =
    budgetStatus.isLoading ||
    monthlyComparison.isLoading ||
    savingsRate.isLoading ||
    spendingTrend.isLoading ||
    categorySpending.isLoading ||
    recentTransactions.isLoading;

  // Determine budget status
  let budgetStatusLabel: 'under' | 'warning' | 'over' = 'under';
  if (budgetStatus.percentage >= 100) {
    budgetStatusLabel = 'over';
  } else if (budgetStatus.percentage >= 80) {
    budgetStatusLabel = 'warning';
  }

  return {
    totalBudget: budgetStatus.totalBudget,
    totalSpent: budgetStatus.totalSpent,
    budgetPercentage: budgetStatus.percentage,
    budgetStatus: budgetStatusLabel,
    monthlySpending: monthlyComparison.data,
    savingsData: savingsRate.data,
    spendingTrend: spendingTrend.data,
    categoryBreakdown: categorySpending.data,
    recentTransactions: recentTransactions.data as LocalTransaction[],
    isLoading,
  };
}

export default useDashboardData;
