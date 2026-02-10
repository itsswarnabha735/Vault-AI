/**
 * Vault-AI Local Database
 *
 * Dexie.js database implementation for IndexedDB.
 *
 * PRIVACY BOUNDARY:
 * All data in this database contains sensitive information that
 * MUST NEVER be transmitted to any server. Only structured accounting
 * data (via sanitizeForSync) should ever leave the device.
 */

import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';

import type {
  LocalTransaction,
  Category,
  Budget,
  SearchQuery,
  AnomalyAlert,
  SyncStatus,
  CategoryId,
  TransactionId,
  BudgetId,
  SearchQueryId,
  AnomalyAlertId,
  UserId,
} from '@/types/database';
import type { VendorCategoryMapping } from '@/lib/processing/vendor-category-learning';
import type { StatementFingerprint } from '@/lib/anomaly/import-duplicate-checker';

// ============================================
// User Settings Interface
// ============================================

/**
 * User settings stored locally in IndexedDB.
 */
export interface UserSettings {
  /** Unique identifier (usually matches UserId or 'default') */
  id: string;

  /** User ID this settings belongs to */
  userId: UserId | null;

  /** UI theme preference */
  theme: 'light' | 'dark' | 'system';

  /** Default currency code (ISO 4217) */
  defaultCurrency: string;

  /** User's timezone (IANA timezone identifier) */
  timezone: string;

  /** Whether cloud sync is enabled */
  syncEnabled: boolean;

  /** Whether anomaly detection is enabled */
  anomalyDetectionEnabled: boolean;

  /** Anomaly threshold for unusual amounts (percentage) */
  anomalyThreshold: number;

  /** Date format preference */
  dateFormat: string;

  /** Number locale for formatting */
  numberLocale: string;

  /** Last updated timestamp */
  updatedAt: Date;
}

// ============================================
// Database Class
// ============================================

/**
 * VaultDatabase - Dexie.js database for Vault-AI.
 *
 * This class extends Dexie to provide typed access to IndexedDB tables
 * with comprehensive indexes for efficient querying.
 */
export class VaultDatabase extends Dexie {
  // Table declarations with strict typing
  transactions!: Table<LocalTransaction, TransactionId>;
  categories!: Table<Category, CategoryId>;
  budgets!: Table<Budget, BudgetId>;
  searchHistory!: Table<SearchQuery, SearchQueryId>;
  anomalies!: Table<AnomalyAlert, AnomalyAlertId>;
  settings!: Table<UserSettings, string>;
  vendorCategories!: Table<VendorCategoryMapping, string>;
  statementFingerprints!: Table<StatementFingerprint, string>;

  constructor() {
    super('VaultAI');

    // Version 1: Initial schema
    this.version(1).stores({
      // Transactions - primary store for financial records
      // Indexes: id (PK), date, vendor, category, syncStatus, createdAt
      transactions: 'id, date, vendor, category, syncStatus, createdAt',

      // Categories - user-defined and default categories
      // Indexes: id (PK), parentId, isDefault
      categories: 'id, parentId, isDefault',

      // Budgets - spending limits per category
      // Indexes: id (PK), categoryId, isActive
      budgets: 'id, categoryId, isActive',

      // Search History - for personalization and search improvement
      // Indexes: id (PK), timestamp
      searchHistory: 'id, timestamp',

      // Anomalies - detected issues with transactions
      // Indexes: id (PK), transactionId, isResolved
      anomalies: 'id, transactionId, isResolved',

      // Settings - user preferences
      // Indexes: id (PK)
      settings: 'id',
    });

    // Version 2: Add vendor-category learning table
    this.version(2).stores({
      // Existing tables remain unchanged (null = keep as-is)
      transactions: 'id, date, vendor, category, syncStatus, createdAt',
      categories: 'id, parentId, isDefault',
      budgets: 'id, categoryId, isActive',
      searchHistory: 'id, timestamp',
      anomalies: 'id, transactionId, isResolved',
      settings: 'id',

      // New: Vendor-category learning table
      // Stores user corrections for auto-categorization improvement
      // Indexes: id (PK), vendorPattern (unique), categoryId
      vendorCategories: 'id, &vendorPattern, categoryId',
    });

    // Version 3: Add statement fingerprints table for duplicate detection
    this.version(3).stores({
      transactions: 'id, date, vendor, category, syncStatus, createdAt',
      categories: 'id, parentId, isDefault',
      budgets: 'id, categoryId, isActive',
      searchHistory: 'id, timestamp',
      anomalies: 'id, transactionId, isResolved',
      settings: 'id',
      vendorCategories: 'id, &vendorPattern, categoryId',

      // New: Statement fingerprints for re-import detection
      // Indexes: id (PK), issuer, periodStart
      statementFingerprints: 'id, issuer, periodStart',
    });

    // Version 4: Migrate existing user settings from USD defaults to INR.
    // This fixes existing users who were created with the old hardcoded USD default.
    // Using toCollection().modify() which is the recommended Dexie upgrade pattern.
    this.version(4).stores({
      // No schema changes — same indexes as version 3
      transactions: 'id, date, vendor, category, syncStatus, createdAt',
      categories: 'id, parentId, isDefault',
      budgets: 'id, categoryId, isActive',
      searchHistory: 'id, timestamp',
      anomalies: 'id, transactionId, isResolved',
      settings: 'id',
      vendorCategories: 'id, &vendorPattern, categoryId',
      statementFingerprints: 'id, issuer, periodStart',
    }).upgrade((tx) => {
      // Migrate settings: USD → INR for existing users
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
      return tx.table('settings').toCollection().modify((setting: Record<string, unknown>) => {
        let changed = false;
        if (setting.defaultCurrency === 'USD') {
          setting.defaultCurrency = 'INR';
          changed = true;
        }
        if (setting.timezone === 'UTC') {
          setting.timezone = localTz;
          changed = true;
        }
        if (setting.numberLocale === 'en-US') {
          setting.numberLocale = 'en-IN';
          changed = true;
        }
        if (changed) {
          setting.updatedAt = new Date();
        }
      });
    });

    // Middleware to handle Date serialization
    this.transactions.hook('reading', (obj) => {
      if (obj) {
        if (obj.createdAt && !(obj.createdAt instanceof Date)) {
          obj.createdAt = new Date(obj.createdAt);
        }
        if (obj.updatedAt && !(obj.updatedAt instanceof Date)) {
          obj.updatedAt = new Date(obj.updatedAt);
        }
        if (obj.lastSyncAttempt && !(obj.lastSyncAttempt instanceof Date)) {
          obj.lastSyncAttempt = new Date(obj.lastSyncAttempt);
        }
      }
      return obj;
    });

    this.categories.hook('reading', (obj) => {
      if (obj) {
        if (obj.createdAt && !(obj.createdAt instanceof Date)) {
          obj.createdAt = new Date(obj.createdAt);
        }
        if (obj.updatedAt && !(obj.updatedAt instanceof Date)) {
          obj.updatedAt = new Date(obj.updatedAt);
        }
      }
      return obj;
    });

    this.budgets.hook('reading', (obj) => {
      if (obj) {
        if (obj.createdAt && !(obj.createdAt instanceof Date)) {
          obj.createdAt = new Date(obj.createdAt);
        }
        if (obj.updatedAt && !(obj.updatedAt instanceof Date)) {
          obj.updatedAt = new Date(obj.updatedAt);
        }
      }
      return obj;
    });

    this.anomalies.hook('reading', (obj) => {
      if (obj) {
        if (obj.createdAt && !(obj.createdAt instanceof Date)) {
          obj.createdAt = new Date(obj.createdAt);
        }
        if (obj.resolvedAt && !(obj.resolvedAt instanceof Date)) {
          obj.resolvedAt = new Date(obj.resolvedAt);
        }
      }
      return obj;
    });

    this.settings.hook('reading', (obj) => {
      if (obj) {
        if (obj.updatedAt && !(obj.updatedAt instanceof Date)) {
          obj.updatedAt = new Date(obj.updatedAt);
        }
      }
      return obj;
    });
  }

  // ============================================
  // Transaction Helper Methods
  // ============================================

  /**
   * Get transactions within a date range.
   *
   * @param start - Start date (ISO 8601 string or Date)
   * @param end - End date (ISO 8601 string or Date)
   * @returns Promise<LocalTransaction[]>
   */
  async getTransactionsByDateRange(
    start: string | Date,
    end: string | Date
  ): Promise<LocalTransaction[]> {
    const startDate =
      typeof start === 'string' ? start : start.toISOString().split('T')[0];
    const endDate =
      typeof end === 'string' ? end : end.toISOString().split('T')[0];

    return this.transactions
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray();
  }

  /**
   * Get transactions by category ID.
   *
   * @param categoryId - Category ID to filter by
   * @returns Promise<LocalTransaction[]>
   */
  async getTransactionsByCategory(
    categoryId: CategoryId
  ): Promise<LocalTransaction[]> {
    return this.transactions.where('category').equals(categoryId).toArray();
  }

  /**
   * Get all transactions pending synchronization.
   *
   * @returns Promise<LocalTransaction[]>
   */
  async getPendingSyncTransactions(): Promise<LocalTransaction[]> {
    return this.transactions
      .where('syncStatus')
      .anyOf(['pending', 'error'] as SyncStatus[])
      .toArray();
  }

  /**
   * Get transactions by sync status.
   *
   * @param status - Sync status to filter by
   * @returns Promise<LocalTransaction[]>
   */
  async getTransactionsBySyncStatus(
    status: SyncStatus
  ): Promise<LocalTransaction[]> {
    return this.transactions.where('syncStatus').equals(status).toArray();
  }

  /**
   * Get transactions by vendor (exact match).
   *
   * @param vendor - Vendor name to filter by
   * @returns Promise<LocalTransaction[]>
   */
  async getTransactionsByVendor(vendor: string): Promise<LocalTransaction[]> {
    return this.transactions.where('vendor').equals(vendor).toArray();
  }

  /**
   * Update sync status for multiple transactions.
   *
   * @param ids - Transaction IDs to update
   * @param status - New sync status
   * @param error - Optional error message (for 'error' status)
   */
  async updateSyncStatus(
    ids: TransactionId[],
    status: SyncStatus,
    error?: string
  ): Promise<void> {
    const now = new Date();
    await this.transactions
      .where('id')
      .anyOf(ids)
      .modify({
        syncStatus: status,
        lastSyncAttempt: now,
        syncError: status === 'error' ? error || 'Unknown error' : null,
      });
  }

  // ============================================
  // Category Helper Methods
  // ============================================

  /**
   * Get all default categories.
   *
   * @returns Promise<Category[]>
   */
  async getDefaultCategories(): Promise<Category[]> {
    return this.categories.where('isDefault').equals(1).toArray();
  }

  /**
   * Get child categories of a parent.
   *
   * @param parentId - Parent category ID
   * @returns Promise<Category[]>
   */
  async getChildCategories(parentId: CategoryId): Promise<Category[]> {
    return this.categories.where('parentId').equals(parentId).toArray();
  }

  /**
   * Get all root categories (no parent).
   *
   * @returns Promise<Category[]>
   */
  async getRootCategories(): Promise<Category[]> {
    return this.categories.filter((cat) => cat.parentId === null).toArray();
  }

  // ============================================
  // Budget Helper Methods
  // ============================================

  /**
   * Get all active budgets.
   *
   * @returns Promise<Budget[]>
   */
  async getActiveBudgets(): Promise<Budget[]> {
    return this.budgets.where('isActive').equals(1).toArray();
  }

  /**
   * Get budget for a specific category.
   *
   * @param categoryId - Category ID
   * @returns Promise<Budget | undefined>
   */
  async getBudgetByCategory(
    categoryId: CategoryId
  ): Promise<Budget | undefined> {
    return this.budgets
      .where('categoryId')
      .equals(categoryId)
      .and((b) => b.isActive)
      .first();
  }

  // ============================================
  // Search History Helper Methods
  // ============================================

  /**
   * Get recent searches.
   *
   * @param limit - Maximum number of results (default: 10)
   * @returns Promise<SearchQuery[]>
   */
  async getRecentSearches(limit: number = 10): Promise<SearchQuery[]> {
    return this.searchHistory
      .orderBy('timestamp')
      .reverse()
      .limit(limit)
      .toArray();
  }

  /**
   * Add a search query to history.
   *
   * @param query - Search query text
   * @param resultCount - Number of results
   * @param resultIds - IDs of returned results
   * @param searchDurationMs - Search duration in milliseconds
   * @returns Promise<SearchQueryId>
   */
  async addSearchQuery(
    userId: UserId,
    query: string,
    resultCount: number,
    resultIds: TransactionId[],
    searchDurationMs: number
  ): Promise<SearchQueryId> {
    const id = uuidv4() as SearchQueryId;
    await this.searchHistory.add({
      id,
      userId,
      query,
      queryEmbedding: null,
      resultCount,
      resultIds,
      selectedResultId: null,
      timestamp: new Date(),
      searchDurationMs,
    });
    return id;
  }

  /**
   * Clear all search history.
   */
  async clearSearchHistory(): Promise<void> {
    await this.searchHistory.clear();
  }

  // ============================================
  // Anomaly Helper Methods
  // ============================================

  /**
   * Get all unresolved anomalies.
   *
   * @returns Promise<AnomalyAlert[]>
   */
  async getUnresolvedAnomalies(): Promise<AnomalyAlert[]> {
    return this.anomalies.where('isResolved').equals(0).toArray();
  }

  /**
   * Get anomalies for a specific transaction.
   *
   * @param transactionId - Transaction ID
   * @returns Promise<AnomalyAlert[]>
   */
  async getAnomaliesForTransaction(
    transactionId: TransactionId
  ): Promise<AnomalyAlert[]> {
    return this.anomalies
      .where('transactionId')
      .equals(transactionId)
      .toArray();
  }

  /**
   * Resolve an anomaly.
   *
   * @param id - Anomaly ID
   * @param action - User action ('confirmed' or 'dismissed')
   */
  async resolveAnomaly(
    id: AnomalyAlertId,
    action: 'confirmed' | 'dismissed'
  ): Promise<void> {
    await this.anomalies.update(id, {
      isResolved: true,
      userAction: action,
      resolvedAt: new Date(),
    });
  }

  // ============================================
  // Settings Helper Methods
  // ============================================

  /**
   * Get user settings.
   *
   * @param id - Settings ID (usually 'default' or user ID)
   * @returns Promise<UserSettings | undefined>
   */
  async getSettings(id: string = 'default'): Promise<UserSettings | undefined> {
    return this.settings.get(id);
  }

  /**
   * Save or update user settings.
   *
   * @param settings - Partial settings to update
   * @param id - Settings ID (usually 'default' or user ID)
   */
  async saveSettings(
    settingsUpdate: Partial<Omit<UserSettings, 'id' | 'updatedAt'>>,
    id: string = 'default'
  ): Promise<void> {
    const existing = await this.settings.get(id);

    if (existing) {
      await this.settings.update(id, {
        ...settingsUpdate,
        updatedAt: new Date(),
      });
    } else {
      const defaultSettings: UserSettings = {
        id,
        userId: null,
        theme: 'system',
        defaultCurrency: 'INR',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        syncEnabled: true,
        anomalyDetectionEnabled: true,
        anomalyThreshold: 20,
        dateFormat: 'yyyy-MM-dd',
        numberLocale: navigator.language || 'en-IN',
        updatedAt: new Date(),
        ...settingsUpdate,
      };
      await this.settings.add(defaultSettings);
    }
  }

  // ============================================
  // Initialization & Utilities
  // ============================================

  /**
   * Initialize database with default categories.
   * Call this on first app launch.
   *
   * @param userId - User ID to associate with categories
   */
  async initializeDefaults(userId: UserId): Promise<void> {
    const existingCategories = await this.categories.count();

    if (existingCategories === 0) {
      const now = new Date();
      const defaultCategories: Category[] = [
        {
          id: uuidv4() as CategoryId,
          userId,
          name: 'Groceries',
          icon: '🛒',
          color: '#22c55e',
          parentId: null,
          sortOrder: 1,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4() as CategoryId,
          userId,
          name: 'Dining',
          icon: '🍽️',
          color: '#f59e0b',
          parentId: null,
          sortOrder: 2,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4() as CategoryId,
          userId,
          name: 'Transport',
          icon: '🚗',
          color: '#3b82f6',
          parentId: null,
          sortOrder: 3,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4() as CategoryId,
          userId,
          name: 'Entertainment',
          icon: '🎬',
          color: '#8b5cf6',
          parentId: null,
          sortOrder: 4,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4() as CategoryId,
          userId,
          name: 'Shopping',
          icon: '🛍️',
          color: '#ec4899',
          parentId: null,
          sortOrder: 5,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4() as CategoryId,
          userId,
          name: 'Healthcare',
          icon: '🏥',
          color: '#ef4444',
          parentId: null,
          sortOrder: 6,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4() as CategoryId,
          userId,
          name: 'Utilities',
          icon: '💡',
          color: '#06b6d4',
          parentId: null,
          sortOrder: 7,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4() as CategoryId,
          userId,
          name: 'Travel',
          icon: '✈️',
          color: '#14b8a6',
          parentId: null,
          sortOrder: 8,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4() as CategoryId,
          userId,
          name: 'Income',
          icon: '💰',
          color: '#10b981',
          parentId: null,
          sortOrder: 9,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4() as CategoryId,
          userId,
          name: 'Other',
          icon: '📦',
          color: '#6b7280',
          parentId: null,
          sortOrder: 99,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
      ];

      await this.categories.bulkAdd(defaultCategories);
    }

    // Initialize default settings if not present
    const existingSettings = await this.settings.get('default');
    if (!existingSettings) {
      await this.saveSettings({ userId });
    }
  }

  /**
   * Get database statistics.
   *
   * @returns Promise<DatabaseStats>
   */
  async getStats(): Promise<{
    transactionCount: number;
    categoryCount: number;
    budgetCount: number;
    anomalyCount: number;
    pendingSyncCount: number;
    searchHistoryCount: number;
  }> {
    const [
      transactionCount,
      categoryCount,
      budgetCount,
      anomalyCount,
      pendingSyncCount,
      searchHistoryCount,
    ] = await Promise.all([
      this.transactions.count(),
      this.categories.count(),
      this.budgets.count(),
      this.anomalies.where('isResolved').equals(0).count(),
      this.transactions.where('syncStatus').equals('pending').count(),
      this.searchHistory.count(),
    ]);

    return {
      transactionCount,
      categoryCount,
      budgetCount,
      anomalyCount,
      pendingSyncCount,
      searchHistoryCount,
    };
  }

  /**
   * Clear all data from the database.
   * USE WITH CAUTION - this is destructive!
   */
  async clearAllData(): Promise<void> {
    await this.transaction(
      'rw',
      [
        this.transactions,
        this.categories,
        this.budgets,
        this.searchHistory,
        this.anomalies,
        this.settings,
      ],
      async () => {
        await this.transactions.clear();
        await this.categories.clear();
        await this.budgets.clear();
        await this.searchHistory.clear();
        await this.anomalies.clear();
        await this.settings.clear();
      }
    );
  }

  /**
   * Export all data for backup purposes.
   *
   * @returns Promise<object> - All database data
   */
  async exportAllData(): Promise<{
    transactions: LocalTransaction[];
    categories: Category[];
    budgets: Budget[];
    searchHistory: SearchQuery[];
    anomalies: AnomalyAlert[];
    settings: UserSettings[];
    exportedAt: string;
    version: number;
  }> {
    const [
      transactions,
      categories,
      budgets,
      searchHistory,
      anomalies,
      settings,
    ] = await Promise.all([
      this.transactions.toArray(),
      this.categories.toArray(),
      this.budgets.toArray(),
      this.searchHistory.toArray(),
      this.anomalies.toArray(),
      this.settings.toArray(),
    ]);

    return {
      transactions,
      categories,
      budgets,
      searchHistory,
      anomalies,
      settings,
      exportedAt: new Date().toISOString(),
      version: 1,
    };
  }
}

// ============================================
// Singleton Database Instance
// ============================================

/**
 * Singleton database instance.
 * Use this throughout the application.
 */
export const db = new VaultDatabase();

// ============================================
// Type Exports
// ============================================

export type { LocalTransaction, Category, Budget, SearchQuery, AnomalyAlert };
