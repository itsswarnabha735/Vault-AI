/**
 * React Hooks for Vault-AI Local Database
 *
 * These hooks provide reactive access to IndexedDB data using Dexie.js live queries.
 * Data updates automatically when the underlying database changes.
 *
 * PRIVACY: All data accessed through these hooks is stored locally and
 * should NEVER be transmitted to external servers without proper sanitization.
 */

'use client';

import { useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { db, type UserSettings } from '@/lib/storage/db';
import type {
  LocalTransaction,
  Category,
  Budget,
  SyncStatus,
  CategoryId,
  TransactionId,
  BudgetId,
  UserId,
} from '@/types/database';

// ============================================
// Types
// ============================================

/**
 * Transaction filter options.
 */
export interface TransactionFilters {
  /** Start date (inclusive) */
  startDate?: string | Date;
  /** End date (inclusive) */
  endDate?: string | Date;
  /** Category ID */
  categoryId?: CategoryId | null;
  /** Vendor name (exact match) */
  vendor?: string;
  /** Sync status */
  syncStatus?: SyncStatus;
  /** Minimum amount */
  minAmount?: number;
  /** Maximum amount */
  maxAmount?: number;
  /** Search query (searches vendor and note) */
  search?: string;
  /** Sort field */
  sortBy?: 'date' | 'amount' | 'vendor' | 'createdAt';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Budget status with spending information.
 */
export interface BudgetWithStatus {
  budget: Budget;
  spent: number;
  remaining: number;
  percentUsed: number;
  isExceeded: boolean;
}

/**
 * Database initialization status.
 */
export interface DatabaseStatus {
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
}

// ============================================
// useTransactions Hook
// ============================================

/**
 * Hook to get transactions with optional filters.
 * Uses live query - updates automatically when data changes.
 *
 * @param filters - Optional filters to apply
 * @returns Filtered and sorted transactions
 *
 * @example
 * ```tsx
 * // Get all transactions
 * const { data: transactions } = useTransactions();
 *
 * // Get transactions from this month
 * const { data: monthlyTransactions } = useTransactions({
 *   startDate: startOfMonth(new Date()),
 *   endDate: endOfMonth(new Date()),
 * });
 *
 * // Get transactions by category
 * const { data: diningTransactions } = useTransactions({
 *   categoryId: diningCategoryId,
 * });
 * ```
 */
export function useTransactions(filters?: TransactionFilters) {
  const transactions = useLiveQuery(async () => {
    let collection = db.transactions.toCollection();

    // Apply date range filter
    if (filters?.startDate || filters?.endDate) {
      const start =
        typeof filters?.startDate === 'string'
          ? filters.startDate
          : (filters?.startDate?.toISOString().split('T')[0] ?? '1970-01-01');
      const end =
        typeof filters?.endDate === 'string'
          ? filters.endDate
          : (filters?.endDate?.toISOString().split('T')[0] ?? '2100-01-01');

      collection = db.transactions
        .where('date')
        .between(start, end, true, true);
    }

    let results = await collection.toArray();

    // Apply category filter
    if (filters?.categoryId !== undefined) {
      results = results.filter((tx) => tx.category === filters.categoryId);
    }

    // Apply vendor filter
    if (filters?.vendor) {
      results = results.filter((tx) => tx.vendor === filters.vendor);
    }

    // Apply sync status filter
    if (filters?.syncStatus) {
      results = results.filter((tx) => tx.syncStatus === filters.syncStatus);
    }

    // Apply amount range filter
    if (filters?.minAmount !== undefined) {
      results = results.filter((tx) => tx.amount >= filters.minAmount!);
    }
    if (filters?.maxAmount !== undefined) {
      results = results.filter((tx) => tx.amount <= filters.maxAmount!);
    }

    // Apply search filter
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      results = results.filter(
        (tx) =>
          tx.vendor.toLowerCase().includes(searchLower) ||
          tx.note.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    const sortBy = filters?.sortBy ?? 'date';
    const sortOrder = filters?.sortOrder ?? 'desc';

    results.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          comparison = a.date.localeCompare(b.date);
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'vendor':
          comparison = a.vendor.localeCompare(b.vendor);
          break;
        case 'createdAt':
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Apply pagination
    if (filters?.offset !== undefined || filters?.limit !== undefined) {
      const offset = filters.offset ?? 0;
      const limit = filters.limit ?? results.length;
      results = results.slice(offset, offset + limit);
    }

    return results;
  }, [
    filters?.startDate,
    filters?.endDate,
    filters?.categoryId,
    filters?.vendor,
    filters?.syncStatus,
    filters?.minAmount,
    filters?.maxAmount,
    filters?.search,
    filters?.sortBy,
    filters?.sortOrder,
    filters?.limit,
    filters?.offset,
  ]);

  return {
    data: transactions ?? [],
    isLoading: transactions === undefined,
  };
}

// ============================================
// useTransaction Hook
// ============================================

/**
 * Hook to get a single transaction by ID.
 * Uses live query - updates automatically when data changes.
 *
 * @param id - Transaction ID
 * @returns Transaction or undefined if not found
 *
 * @example
 * ```tsx
 * const { data: transaction, isLoading } = useTransaction(transactionId);
 * ```
 */
export function useTransaction(id: TransactionId | undefined) {
  const transaction = useLiveQuery(async () => {
    if (!id) return undefined;
    return db.transactions.get(id);
  }, [id]);

  return {
    data: transaction,
    isLoading: id !== undefined && transaction === undefined,
  };
}

// ============================================
// useCategories Hook
// ============================================

/**
 * Hook to get all categories.
 * Uses live query - updates automatically when data changes.
 *
 * @returns All categories sorted by sortOrder
 *
 * @example
 * ```tsx
 * const { data: categories } = useCategories();
 * ```
 */
export function useCategories() {
  const categories = useLiveQuery(async () => {
    const cats = await db.categories.toArray();
    return cats.sort((a, b) => a.sortOrder - b.sortOrder);
  }, []);

  return {
    data: categories ?? [],
    isLoading: categories === undefined,
  };
}

/**
 * Hook to get a single category by ID.
 *
 * @param id - Category ID
 * @returns Category or undefined if not found
 */
export function useCategory(id: CategoryId | undefined) {
  const category = useLiveQuery(async () => {
    if (!id) return undefined;
    return db.categories.get(id);
  }, [id]);

  return {
    data: category,
    isLoading: id !== undefined && category === undefined,
  };
}

// ============================================
// useBudgets Hook
// ============================================

/**
 * Hook to get all active budgets with spending status.
 * Uses live query - updates automatically when data changes.
 *
 * @returns Active budgets with current spending information
 *
 * @example
 * ```tsx
 * const { data: budgets } = useBudgets();
 * budgets.forEach(({ budget, spent, remaining, percentUsed }) => {
 *   console.log(`${budget.categoryId}: ${spent}/${budget.amount} (${percentUsed}%)`);
 * });
 * ```
 */
export function useBudgets() {
  const budgetsWithStatus = useLiveQuery(async () => {
    const budgets = await db.budgets.where('isActive').equals(1).toArray();
    const results: BudgetWithStatus[] = [];

    for (const budget of budgets) {
      // Calculate period start date
      const now = new Date();
      let periodStart: Date;
      let periodEnd: Date;

      switch (budget.period) {
        case 'weekly':
          periodStart = new Date(now);
          periodStart.setDate(now.getDate() - now.getDay());
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart);
          periodEnd.setDate(periodStart.getDate() + 6);
          break;
        case 'monthly':
          periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
          periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          break;
        case 'yearly':
          periodStart = new Date(now.getFullYear(), 0, 1);
          periodEnd = new Date(now.getFullYear(), 11, 31);
          break;
      }

      // Get transactions for this period and category
      const startStr = periodStart.toISOString().split('T')[0];
      const endStr = periodEnd.toISOString().split('T')[0];

      let transactions = await db.transactions
        .where('date')
        .between(startStr, endStr, true, true)
        .toArray();

      if (budget.categoryId) {
        transactions = transactions.filter(
          (tx) => tx.category === budget.categoryId
        );
      }

      const spent = transactions.reduce(
        (sum, tx) => sum + Math.abs(tx.amount),
        0
      );
      const remaining = budget.amount - spent;
      const percentUsed = (spent / budget.amount) * 100;

      results.push({
        budget,
        spent,
        remaining,
        percentUsed,
        isExceeded: remaining < 0,
      });
    }

    return results;
  }, []);

  return {
    data: budgetsWithStatus ?? [],
    isLoading: budgetsWithStatus === undefined,
  };
}

/**
 * Hook to get a single budget by ID.
 *
 * @param id - Budget ID
 * @returns Budget or undefined if not found
 */
export function useBudget(id: BudgetId | undefined) {
  const budget = useLiveQuery(async () => {
    if (!id) return undefined;
    return db.budgets.get(id);
  }, [id]);

  return {
    data: budget,
    isLoading: id !== undefined && budget === undefined,
  };
}

// ============================================
// useAnomalies Hook
// ============================================

/**
 * Hook to get unresolved anomalies.
 * Uses live query - updates automatically when data changes.
 *
 * @returns Unresolved anomaly alerts
 *
 * @example
 * ```tsx
 * const { data: anomalies } = useAnomalies();
 * if (anomalies.length > 0) {
 *   // Show anomaly notification
 * }
 * ```
 */
export function useAnomalies() {
  const anomalies = useLiveQuery(async () => {
    return db.anomalies
      .where('isResolved')
      .equals(0)
      .reverse()
      .sortBy('createdAt');
  }, []);

  return {
    data: anomalies ?? [],
    isLoading: anomalies === undefined,
  };
}

/**
 * Hook to get anomalies for a specific transaction.
 *
 * @param transactionId - Transaction ID
 * @returns Anomalies for the transaction
 */
export function useTransactionAnomalies(
  transactionId: TransactionId | undefined
) {
  const anomalies = useLiveQuery(async () => {
    if (!transactionId) return [];
    return db.anomalies.where('transactionId').equals(transactionId).toArray();
  }, [transactionId]);

  return {
    data: anomalies ?? [],
    isLoading: transactionId !== undefined && anomalies === undefined,
  };
}

// ============================================
// useSearchHistory Hook
// ============================================

/**
 * Hook to get recent search history.
 * Uses live query - updates automatically when data changes.
 *
 * @param limit - Maximum number of results (default: 10)
 * @returns Recent searches
 */
export function useSearchHistory(limit: number = 10) {
  const searches = useLiveQuery(async () => {
    return db.searchHistory
      .orderBy('timestamp')
      .reverse()
      .limit(limit)
      .toArray();
  }, [limit]);

  return {
    data: searches ?? [],
    isLoading: searches === undefined,
  };
}

// ============================================
// useSettings Hook
// ============================================

/**
 * Hook to get and update user settings.
 * Uses live query - updates automatically when data changes.
 *
 * @param settingsId - Settings ID (default: 'default')
 * @returns Settings and update function
 *
 * @example
 * ```tsx
 * const { settings, updateSettings } = useSettings();
 *
 * // Update theme
 * await updateSettings({ theme: 'dark' });
 * ```
 */
export function useSettings(settingsId: string = 'default') {
  const settings = useLiveQuery(async () => {
    return db.settings.get(settingsId);
  }, [settingsId]);

  const updateSettings = useCallback(
    async (updates: Partial<Omit<UserSettings, 'id' | 'updatedAt'>>) => {
      await db.saveSettings(updates, settingsId);
    },
    [settingsId]
  );

  return {
    settings,
    isLoading: settings === undefined,
    updateSettings,
  };
}

// ============================================
// useDbStats Hook
// ============================================

/**
 * Hook to get database statistics.
 * Uses live query - updates automatically when data changes.
 *
 * @returns Database statistics
 */
export function useDbStats() {
  const stats = useLiveQuery(async () => {
    return db.getStats();
  }, []);

  return {
    data: stats,
    isLoading: stats === undefined,
  };
}

// ============================================
// usePendingSync Hook
// ============================================

/**
 * Hook to get count of pending sync items.
 * Uses live query - updates automatically when data changes.
 *
 * @returns Pending sync count and transactions
 */
export function usePendingSync() {
  const pending = useLiveQuery(async () => {
    const transactions = await db.transactions
      .where('syncStatus')
      .anyOf(['pending', 'error'])
      .toArray();

    return {
      count: transactions.length,
      pendingCount: transactions.filter((t) => t.syncStatus === 'pending')
        .length,
      errorCount: transactions.filter((t) => t.syncStatus === 'error').length,
      transactions,
    };
  }, []);

  return {
    data: pending ?? {
      count: 0,
      pendingCount: 0,
      errorCount: 0,
      transactions: [],
    },
    isLoading: pending === undefined,
  };
}

// ============================================
// useDbInitialization Hook
// ============================================

/**
 * Hook to handle database initialization.
 * Call this at app startup to ensure database is ready.
 *
 * @param userId - User ID to initialize with
 * @returns Initialization status and initialize function
 *
 * @example
 * ```tsx
 * const { isInitialized, isLoading, error, initialize } = useDbInitialization();
 *
 * useEffect(() => {
 *   if (user?.id && !isInitialized) {
 *     initialize(user.id as UserId);
 *   }
 * }, [user?.id, isInitialized]);
 * ```
 */
export function useDbInitialization() {
  const [status, setStatus] = useState<DatabaseStatus>({
    isInitialized: false,
    isLoading: false,
    error: null,
  });

  const initialize = useCallback(async (userId: UserId) => {
    setStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Check if database needs initialization
      const categoryCount = await db.categories.count();

      if (categoryCount === 0) {
        await db.initializeDefaults(userId);
      }

      setStatus({ isInitialized: true, isLoading: false, error: null });
    } catch (error) {
      setStatus({
        isInitialized: false,
        isLoading: false,
        error: error as Error,
      });
    }
  }, []);

  return {
    ...status,
    initialize,
  };
}

// ============================================
// Transaction Action Hooks
// ============================================

/**
 * Hook providing transaction CRUD operations.
 *
 * @returns Transaction action functions
 *
 * @example
 * ```tsx
 * const { addTransaction, updateTransaction, deleteTransaction } = useTransactionActions();
 *
 * // Add a new transaction
 * await addTransaction({
 *   date: '2024-01-15',
 *   amount: 42.50,
 *   vendor: 'Coffee Shop',
 *   category: categoryId,
 *   ...
 * });
 * ```
 */
export function useTransactionActions() {
  const addTransaction = useCallback(
    async (
      transaction: Omit<
        LocalTransaction,
        | 'id'
        | 'createdAt'
        | 'updatedAt'
        | 'syncStatus'
        | 'lastSyncAttempt'
        | 'syncError'
      > & { id?: TransactionId }
    ) => {
      const now = new Date();
      const id = (transaction.id ?? crypto.randomUUID()) as TransactionId;

      await db.transactions.add({
        ...transaction,
        id,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
        lastSyncAttempt: null,
        syncError: null,
      });

      return id;
    },
    []
  );

  const updateTransaction = useCallback(
    async (
      id: TransactionId,
      updates: Partial<Omit<LocalTransaction, 'id' | 'createdAt'>>
    ) => {
      await db.transactions.update(id, {
        ...updates,
        updatedAt: new Date(),
        syncStatus: 'pending',
      });
    },
    []
  );

  const deleteTransaction = useCallback(async (id: TransactionId) => {
    await db.transactions.delete(id);
  }, []);

  const markAsSynced = useCallback(async (ids: TransactionId[]) => {
    await db.updateSyncStatus(ids, 'synced');
  }, []);

  return {
    addTransaction,
    updateTransaction,
    deleteTransaction,
    markAsSynced,
  };
}

// ============================================
// Category Action Hooks
// ============================================

/**
 * Hook providing category CRUD operations.
 *
 * @returns Category action functions
 */
export function useCategoryActions() {
  const addCategory = useCallback(
    async (
      category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: CategoryId;
      }
    ) => {
      const now = new Date();
      const id = (category.id ?? crypto.randomUUID()) as CategoryId;

      await db.categories.add({
        ...category,
        id,
        createdAt: now,
        updatedAt: now,
      });

      return id;
    },
    []
  );

  const updateCategory = useCallback(
    async (
      id: CategoryId,
      updates: Partial<Omit<Category, 'id' | 'createdAt'>>
    ) => {
      await db.categories.update(id, {
        ...updates,
        updatedAt: new Date(),
      });
    },
    []
  );

  const deleteCategory = useCallback(async (id: CategoryId) => {
    // Check if category is in use
    const usedCount = await db.transactions
      .where('category')
      .equals(id)
      .count();
    if (usedCount > 0) {
      throw new Error(
        `Cannot delete category: ${usedCount} transactions are using this category`
      );
    }

    await db.categories.delete(id);
  }, []);

  return {
    addCategory,
    updateCategory,
    deleteCategory,
  };
}

// ============================================
// Budget Action Hooks
// ============================================

/**
 * Hook providing budget CRUD operations.
 *
 * @returns Budget action functions
 */
export function useBudgetActions() {
  const addBudget = useCallback(
    async (
      budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'> & { id?: BudgetId }
    ) => {
      const now = new Date();
      const id = (budget.id ?? crypto.randomUUID()) as BudgetId;

      await db.budgets.add({
        ...budget,
        id,
        createdAt: now,
        updatedAt: now,
      });

      return id;
    },
    []
  );

  const updateBudget = useCallback(
    async (
      id: BudgetId,
      updates: Partial<Omit<Budget, 'id' | 'createdAt'>>
    ) => {
      await db.budgets.update(id, {
        ...updates,
        updatedAt: new Date(),
      });
    },
    []
  );

  const deleteBudget = useCallback(async (id: BudgetId) => {
    await db.budgets.delete(id);
  }, []);

  const deactivateBudget = useCallback(async (id: BudgetId) => {
    await db.budgets.update(id, {
      isActive: false,
      updatedAt: new Date(),
    });
  }, []);

  return {
    addBudget,
    updateBudget,
    deleteBudget,
    deactivateBudget,
  };
}

// ============================================
// Anomaly Action Hooks
// ============================================

/**
 * Hook providing anomaly resolution operations.
 *
 * @returns Anomaly action functions
 */
export function useAnomalyActions() {
  const resolveAnomaly = useCallback(
    async (id: string, action: 'confirmed' | 'dismissed') => {
      await db.resolveAnomaly(id as any, action);
    },
    []
  );

  const resolveAllForTransaction = useCallback(
    async (transactionId: TransactionId, action: 'confirmed' | 'dismissed') => {
      const anomalies = await db.anomalies
        .where('transactionId')
        .equals(transactionId)
        .toArray();

      for (const anomaly of anomalies) {
        await db.resolveAnomaly(anomaly.id, action);
      }
    },
    []
  );

  return {
    resolveAnomaly,
    resolveAllForTransaction,
  };
}
