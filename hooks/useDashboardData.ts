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
} from 'date-fns';

import { db } from '@/lib/storage/db';
import { useBudgets, useCategories } from './useLocalDB';
import type { LocalTransaction } from '@/types/database';

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
  /** Label for the previous month (e.g. "Oct 2025") */
  previousMonthLabel: string;
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

/**
 * Determine if a transaction is an expense (debit / money out).
 *
 * Uses the same logic as chat-service.ts:
 * - `transactionType === 'credit'` → always income, never expense
 * - `transactionType === 'debit'`  → always expense
 * - `transactionType === null`     → fall back to amount sign (positive = expense)
 *
 * This correctly handles the legacy sign-convention bug where some credit
 * transactions were stored with positive amounts.
 */
function isExpenseTransaction(tx: LocalTransaction): boolean {
  if (tx.transactionType === 'credit') return false;
  if (tx.transactionType === 'debit') return true;
  // Legacy: no transactionType — use sign convention
  return tx.amount > 0;
}

/**
 * Determine if a transaction is income (credit / money in).
 */
function isIncomeTransaction(tx: LocalTransaction): boolean {
  if (tx.transactionType === 'credit') return true;
  if (tx.transactionType === 'debit') return false;
  // Legacy: no transactionType — use sign convention
  return tx.amount < 0;
}

/**
 * Get the absolute expense amount from a transaction.
 * Handles both correct (positive) and wrong-sign (negative with debit type) cases.
 */
function getExpenseAmount(tx: LocalTransaction): number {
  return Math.abs(tx.amount);
}

/**
 * Get the absolute income amount from a transaction.
 * Handles both correct (negative) and wrong-sign (positive with credit type) cases.
 */
function getIncomeAmount(tx: LocalTransaction): number {
  return Math.abs(tx.amount);
}

/**
 * Query transactions for a specific month from IndexedDB.
 */
async function queryMonthTransactions(monthDate: Date): Promise<LocalTransaction[]> {
  const start = format(startOfMonth(monthDate), 'yyyy-MM-dd');
  const end = format(endOfMonth(monthDate), 'yyyy-MM-dd');

  return db.transactions
    .where('date')
    .between(start, end, true, true)
    .toArray();
}

/**
 * Query total expenses for a specific month from IndexedDB.
 * Correctly uses transactionType when available, falling back to amount sign.
 */
async function queryMonthlyExpenses(monthDate: Date): Promise<number> {
  const transactions = await queryMonthTransactions(monthDate);

  return transactions
    .filter(isExpenseTransaction)
    .reduce((sum, tx) => sum + getExpenseAmount(tx), 0);
}

/**
 * Query total income for a specific month from IndexedDB.
 * Correctly uses transactionType when available, falling back to amount sign.
 */
async function queryMonthlyIncome(monthDate: Date): Promise<number> {
  const transactions = await queryMonthTransactions(monthDate);

  return transactions
    .filter(isIncomeTransaction)
    .reduce((sum, tx) => sum + getIncomeAmount(tx), 0);
}

// ============================================
// useBudgetStatus Hook
// ============================================

/**
 * Hook to get aggregated budget status for the dashboard.
 *
 * @param selectedMonth - Optional month to compute budget status for (defaults to current month)
 */
export function useBudgetStatus(selectedMonth?: Date) {
  const { data: budgets, isLoading: budgetsLoading } = useBudgets();

  // Compute spending for the selected month
  const monthStart = startOfMonth(selectedMonth ?? new Date());
  const monthEnd = endOfMonth(selectedMonth ?? new Date());
  const startStr = format(monthStart, 'yyyy-MM-dd');
  const endStr = format(monthEnd, 'yyyy-MM-dd');

  const monthlyTransactions = useLiveQuery(
    async () => {
      return db.transactions
        .where('date')
        .between(startStr, endStr, true, true)
        .toArray();
    },
    [startStr, endStr]
  );

  const status = useMemo(() => {
    if (budgetsLoading || !budgets.length || monthlyTransactions === undefined) {
      return {
        budgets: [],
        spending: [],
        totalBudget: 0,
        totalSpent: 0,
        percentage: 0,
        isLoading: budgetsLoading || monthlyTransactions === undefined,
      };
    }

    // Only count expenses — use transactionType-aware filter
    const expenseTransactions = monthlyTransactions.filter(isExpenseTransaction);

    const totalBudget = budgets.reduce((sum, b) => sum + b.budget.amount, 0);

    // Calculate spending per budget, avoiding double-counting.
    // If a budget has a categoryId, only count transactions in that category.
    // If a budget has no categoryId (overall budget), sum ALL expenses but only once.
    let totalSpent = 0;
    const spendingByBudget = budgets.map((b) => {
      let spent: number;
      if (b.budget.categoryId) {
        // Category-specific budget
        spent = expenseTransactions
          .filter((tx) => tx.category === b.budget.categoryId)
          .reduce((sum, tx) => sum + getExpenseAmount(tx), 0);
      } else {
        // Overall budget — total of all expenses
        spent = expenseTransactions.reduce((sum, tx) => sum + getExpenseAmount(tx), 0);
      }
      return { budgetId: b.budget.id, amount: spent };
    });

    // For totalSpent, use the sum of all expenses (not sum of budget-specific amounts)
    totalSpent = expenseTransactions.reduce((sum, tx) => sum + getExpenseAmount(tx), 0);

    const percentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    return {
      budgets: budgets.map((b) => b.budget),
      spending: spendingByBudget,
      totalBudget,
      totalSpent,
      percentage,
      isLoading: false,
    };
  }, [budgets, budgetsLoading, monthlyTransactions]);

  return status;
}

// ============================================
// useSpendingTrend Hook
// ============================================

/**
 * Hook to get spending trend data for the N months ending at the selected month.
 *
 * @param months - Number of months to include (default: 6)
 * @param selectedMonth - Optional anchor month (defaults to current month)
 */
export function useSpendingTrend(months: number = 6, selectedMonth?: Date) {
  const anchor = selectedMonth ?? new Date();
  const anchorKey = format(anchor, 'yyyy-MM');

  const data = useLiveQuery(async () => {
    const trendData: SpendingTrendPoint[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const monthDate = subMonths(anchor, i);
      const spending = await queryMonthlyExpenses(monthDate);

      trendData.push({
        month: format(monthDate, 'MMM'),
        label: format(monthDate, 'MMMM yyyy'),
        amount: spending,
      });
    }

    return trendData;
  }, [months, anchorKey]);

  return {
    data: data ?? [],
    isLoading: data === undefined,
  };
}

// ============================================
// useCategorySpending Hook
// ============================================

/**
 * Hook to get spending breakdown by category for the selected month.
 *
 * @param selectedMonth - Optional month to compute category spending for (defaults to current month)
 */
export function useCategorySpending(selectedMonth?: Date) {
  const { data: categories, isLoading: categoriesLoading } = useCategories();

  const anchor = selectedMonth ?? new Date();
  const anchorKey = format(anchor, 'yyyy-MM');

  const data = useLiveQuery(
    async () => {
      const start = format(startOfMonth(anchor), 'yyyy-MM-dd');
      const end = format(endOfMonth(anchor), 'yyyy-MM-dd');

      const transactions = await db.transactions
        .where('date')
        .between(start, end, true, true)
        .toArray();

      // Filter expenses only — use transactionType-aware filter
      const expenses = transactions.filter(isExpenseTransaction);

      // Group by category
      const categoryMap = new Map<string | null, number>();
      const categoryCountMap = new Map<string | null, number>();

      for (const tx of expenses) {
        const key = tx.category;
        categoryMap.set(key, (categoryMap.get(key) ?? 0) + getExpenseAmount(tx));
        categoryCountMap.set(key, (categoryCountMap.get(key) ?? 0) + 1);
      }

      const totalSpending = expenses.reduce((sum, tx) => sum + getExpenseAmount(tx), 0);

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
    [categories, anchorKey],
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
 * Hook to compare the selected month's spending with the previous month.
 * Uses targeted indexed queries (not full table scan).
 *
 * @param selectedMonth - Optional month to compare (defaults to current month)
 */
export function useMonthlyComparison(selectedMonth?: Date) {
  const anchor = selectedMonth ?? new Date();
  const anchorKey = format(anchor, 'yyyy-MM');

  const data = useLiveQuery(async () => {
    // Query expenses for the selected month
    const thisMonthTotal = await queryMonthlyExpenses(anchor);

    // Query expenses for the previous month
    const lastMonthDate = subMonths(anchor, 1);
    const lastMonthTotal = await queryMonthlyExpenses(lastMonthDate);

    const change = thisMonthTotal - lastMonthTotal;

    // Calculate percentage change correctly:
    // - If both months are 0: no change (0%)
    // - If previous month is 0 but current has spending: 100% increase
    // - Otherwise: normal percentage change
    let changePercent: number;
    if (lastMonthTotal === 0 && thisMonthTotal === 0) {
      changePercent = 0;
    } else if (lastMonthTotal === 0) {
      changePercent = 100; // New spending — treat as 100% increase
    } else {
      changePercent = (change / lastMonthTotal) * 100;
    }

    return {
      thisMonth: thisMonthTotal,
      lastMonth: lastMonthTotal,
      change,
      changePercent,
      isIncrease: change > 0,
      previousMonthLabel: format(lastMonthDate, 'MMM yyyy'),
    };
  }, [anchorKey]);

  return {
    data: data ?? {
      thisMonth: 0,
      lastMonth: 0,
      change: 0,
      changePercent: 0,
      isIncrease: false,
      previousMonthLabel: format(subMonths(anchor, 1), 'MMM yyyy'),
    },
    isLoading: data === undefined,
  };
}

// ============================================
// useSavingsRate Hook
// ============================================

/**
 * Hook to calculate savings rate (income vs expenses) for the selected month.
 * Uses targeted indexed queries (not full table scan).
 *
 * @param selectedMonth - Optional month to calculate for (defaults to current month)
 */
export function useSavingsRate(selectedMonth?: Date) {
  const anchor = selectedMonth ?? new Date();
  const anchorKey = format(anchor, 'yyyy-MM');

  const data = useLiveQuery(async () => {
    // Selected month
    const income = await queryMonthlyIncome(anchor);
    const expenses = await queryMonthlyExpenses(anchor);
    const savings = income - expenses;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;

    // Previous month for trend comparison
    const lastMonthDate = subMonths(anchor, 1);
    const lastMonthIncome = await queryMonthlyIncome(lastMonthDate);
    const lastMonthExpenses = await queryMonthlyExpenses(lastMonthDate);
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
  }, [anchorKey]);

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
 * Hook to get recent transactions with category info, filtered to a month.
 *
 * @param limit - Maximum number of transactions (default: 10)
 * @param selectedMonth - Optional month to filter transactions to
 */
export function useRecentTransactions(limit: number = 10, selectedMonth?: Date) {
  const { data: categories, isLoading: categoriesLoading } = useCategories();

  const anchorKey = selectedMonth ? format(selectedMonth, 'yyyy-MM') : 'all';

  const transactions = useLiveQuery(async () => {
    if (selectedMonth) {
      const start = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');

      // Fetch all transactions for the month, then sort and limit in JS
      // (Dexie's .sortBy() is terminal and ignores .reverse()/.limit())
      const allForMonth = await db.transactions
        .where('date')
        .between(start, end, true, true)
        .toArray();

      // Sort by date descending (most recent first), then limit
      return allForMonth
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit);
    }

    // No month filter — get the most recent transactions overall
    return db.transactions
      .orderBy('date')
      .reverse()
      .limit(limit)
      .toArray();
  }, [limit, anchorKey]);

  const transactionsWithCategory = useMemo(() => {
    if (!transactions) {
      return [];
    }
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
 *
 * @param selectedMonth - Optional month to filter all data to (defaults to current month)
 */
export function useDashboardData(selectedMonth?: Date): DashboardData {
  const budgetStatus = useBudgetStatus(selectedMonth);
  const monthlyComparison = useMonthlyComparison(selectedMonth);
  const savingsRate = useSavingsRate(selectedMonth);
  const spendingTrend = useSpendingTrend(6, selectedMonth);
  const categorySpending = useCategorySpending(selectedMonth);
  const recentTransactions = useRecentTransactions(10, selectedMonth);

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
