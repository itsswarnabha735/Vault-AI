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
  kvStore!: Table<{ key: string; value: unknown }, string>;

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
    this.version(4)
      .stores({
        // No schema changes — same indexes as version 3
        transactions: 'id, date, vendor, category, syncStatus, createdAt',
        categories: 'id, parentId, isDefault',
        budgets: 'id, categoryId, isActive',
        searchHistory: 'id, timestamp',
        anomalies: 'id, transactionId, isResolved',
        settings: 'id',
        vendorCategories: 'id, &vendorPattern, categoryId',
        statementFingerprints: 'id, issuer, periodStart',
      })
      .upgrade((tx) => {
        // Migrate settings: USD → INR for existing users
        const localTz =
          Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
        return tx
          .table('settings')
          .toCollection()
          .modify((setting: Record<string, unknown>) => {
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

    // Version 5: Unify category names with the Category Registry.
    // Renames "Dining" → "Food & Dining", "Transport" → "Transportation",
    // "Rent" → "Rent & Housing" and adds missing default categories
    // (Gas & Fuel, Personal Care, Fees & Charges).
    this.version(5)
      .stores({
        // No schema changes — same indexes as version 4
        transactions: 'id, date, vendor, category, syncStatus, createdAt',
        categories: 'id, parentId, isDefault',
        budgets: 'id, categoryId, isActive',
        searchHistory: 'id, timestamp',
        anomalies: 'id, transactionId, isResolved',
        settings: 'id',
        vendorCategories: 'id, &vendorPattern, categoryId',
        statementFingerprints: 'id, issuer, periodStart',
      })
      .upgrade(async (tx) => {
        const { CATEGORY_RENAME_MAP, NEW_DEFAULT_CATEGORIES } = await import(
          '@/lib/categories/category-registry'
        );

        // 1. Rename existing categories to match canonical names
        const cats = tx.table('categories');
        await cats.toCollection().modify(
          (cat: Record<string, unknown>) => {
            const newName =
              CATEGORY_RENAME_MAP[cat.name as string];
            if (newName) {
              cat.name = newName;
              cat.updatedAt = new Date();
            }
          }
        );

        // 2. Add missing default categories
        // First check which categories already exist
        const allCats = await cats.toArray();
        const existingNames = new Set(
          allCats.map((c: Record<string, unknown>) =>
            (c.name as string).toLowerCase()
          )
        );

        // Get the userId from any existing category
        const sampleCat = allCats[0] as Record<string, unknown> | undefined;
        const userId = sampleCat?.userId;

        if (userId) {
          const now = new Date();
          const { v4: uuidv4 } = await import('uuid');

          for (const newCat of NEW_DEFAULT_CATEGORIES) {
            if (!existingNames.has(newCat.name.toLowerCase())) {
              await cats.add({
                id: uuidv4(),
                userId,
                name: newCat.name,
                icon: newCat.icon,
                color: newCat.color,
                parentId: null,
                sortOrder: newCat.sortOrder,
                isDefault: true,
                createdAt: now,
                updatedAt: now,
              });
            }
          }
        }
      });

    // Version 6: Add sub-categories for two-level hierarchy (Phase B).
    // Seeds sub-categories (e.g., "Restaurants" under "Food & Dining")
    // for existing users. Sub-categories have parentId set to their parent.
    this.version(6)
      .stores({
        // No schema changes — same indexes as version 5
        transactions: 'id, date, vendor, category, syncStatus, createdAt',
        categories: 'id, parentId, isDefault',
        budgets: 'id, categoryId, isActive',
        searchHistory: 'id, timestamp',
        anomalies: 'id, transactionId, isResolved',
        settings: 'id',
        vendorCategories: 'id, &vendorPattern, categoryId',
        statementFingerprints: 'id, issuer, periodStart',
      })
      .upgrade(async (tx) => {
        const { getSubcategorySeeds } = await import(
          '@/lib/categories/category-registry'
        );

        const cats = tx.table('categories');
        const allCats = await cats.toArray();

        // Build a name → id lookup for parent categories
        const nameToId = new Map<string, string>();
        for (const cat of allCats) {
          nameToId.set(
            (cat.name as string).toLowerCase(),
            cat.id as string
          );
        }

        // Get userId from existing categories
        const sampleCat = allCats[0] as Record<string, unknown> | undefined;
        const userId = sampleCat?.userId;

        if (!userId) return; // No categories yet — initializeDefaults will handle it

        // Check which sub-categories already exist
        const existingNames = new Set(
          allCats.map((c: Record<string, unknown>) =>
            (c.name as string).toLowerCase()
          )
        );

        const now = new Date();
        const { v4: uuidv4 } = await import('uuid');
        const seeds = getSubcategorySeeds();

        for (const seed of seeds) {
          // Skip if already exists
          if (existingNames.has(seed.name.toLowerCase())) continue;

          // Find parent ID
          const parentId = nameToId.get(seed.parentName.toLowerCase());
          if (!parentId) continue; // Parent doesn't exist yet

          await cats.add({
            id: uuidv4(),
            userId,
            name: seed.name,
            icon: seed.icon,
            color: seed.color,
            parentId,
            sortOrder: seed.sortOrder,
            isDefault: true,
            createdAt: now,
            updatedAt: now,
          });
        }
      });

    // Version 7: Phase C changes:
    // 1. Remove unique constraint on vendorCategories.vendorPattern
    //    to allow amount-ranged duplicate vendor mappings (6D).
    // 2. Add a kvStore table for persisting ML model weights (4C)
    //    and other key-value data.
    this.version(7).stores({
      transactions: 'id, date, vendor, category, syncStatus, createdAt',
      categories: 'id, parentId, isDefault',
      budgets: 'id, categoryId, isActive',
      searchHistory: 'id, timestamp',
      anomalies: 'id, transactionId, isResolved',
      settings: 'id',
      // Changed: removed & (unique) from vendorPattern to allow amount-ranged dupes
      vendorCategories: 'id, vendorPattern, categoryId',
      statementFingerprints: 'id, issuer, periodStart',
      // New: general key-value store for ML weights, etc.
      kvStore: 'key',
    });

    // Version 8: Backward compatibility fixes:
    // Re-normalize all vendorPattern keys in vendorCategories using
    // the current (enhanced) normalizeVendor() logic.
    // Phase A introduced aggressive normalization (UPI/NEFT parsing,
    // Amazon/Uber abbreviation handling), but existing learned mappings
    // stored with the old normalization may not match new lookups.
    this.version(8)
      .stores({
        // No schema changes
        transactions: 'id, date, vendor, category, syncStatus, createdAt',
        categories: 'id, parentId, isDefault',
        budgets: 'id, categoryId, isActive',
        searchHistory: 'id, timestamp',
        anomalies: 'id, transactionId, isResolved',
        settings: 'id',
        vendorCategories: 'id, vendorPattern, categoryId',
        statementFingerprints: 'id, issuer, periodStart',
        kvStore: 'key',
      })
      .upgrade(async (tx) => {
        const { normalizeVendor } = await import(
          '@/lib/processing/vendor-category-learning'
        );

        const vcTable = tx.table('vendorCategories');
        const allMappings = await vcTable.toArray();

        // Re-normalize each vendor pattern
        // If the new normalization produces a different key, update the row.
        // If two rows end up with the same key, keep the one with higher usageCount.
        const seen = new Map<string, { id: string; usageCount: number; categoryId: unknown }>();

        for (const mapping of allMappings) {
          const oldPattern = mapping.vendorPattern as string;
          const newPattern = normalizeVendor(oldPattern);

          if (newPattern === oldPattern) {
            // No change needed, but track for dedup
            const existing = seen.get(newPattern);
            if (!existing || (mapping.usageCount as number) > existing.usageCount) {
              seen.set(newPattern, {
                id: mapping.id as string,
                usageCount: mapping.usageCount as number,
                categoryId: mapping.categoryId,
              });
            }
            continue;
          }

          // Pattern changed — check for conflicts
          const existing = seen.get(newPattern);
          if (existing) {
            // Conflict: same normalized key. Keep higher usageCount.
            if ((mapping.usageCount as number) > existing.usageCount) {
              // This mapping wins: update it, delete the other
              await vcTable.delete(existing.id);
              await vcTable.update(mapping.id as string, {
                vendorPattern: newPattern,
                updatedAt: new Date(),
              });
              seen.set(newPattern, {
                id: mapping.id as string,
                usageCount: mapping.usageCount as number,
                categoryId: mapping.categoryId,
              });
            } else {
              // Existing wins: delete this mapping
              await vcTable.delete(mapping.id as string);
            }
          } else {
            // No conflict: just update the pattern
            await vcTable.update(mapping.id as string, {
              vendorPattern: newPattern,
              updatedAt: new Date(),
            });
            seen.set(newPattern, {
              id: mapping.id as string,
              usageCount: mapping.usageCount as number,
              categoryId: mapping.categoryId,
            });
          }
        }
      });

    // Version 9: Fix sign convention for income/credit transactions
    // ──────────────────────────────────────────────────────────────
    // BUG: The LLM statement parser returned all amounts as positive
    // numbers, using a `type` field to distinguish credits from debits.
    // But ImportModal saved `amount` directly, so credit transactions
    // (income, refunds, payments) were stored with POSITIVE amounts.
    // The chat service's income filter (`amount < 0`) then failed to
    // find any income. This migration retroactively negates amounts for
    // transactions that are clearly income (category = "income") but
    // were stored with positive amounts.
    this.version(9)
      .stores({
        // No schema changes
        transactions: 'id, date, vendor, category, syncStatus, createdAt',
        categories: 'id, parentId, isDefault',
        budgets: 'id, categoryId, isActive',
        searchHistory: 'id, timestamp',
        anomalies: 'id, transactionId, isResolved',
        settings: 'id',
        vendorCategories: 'id, vendorPattern, categoryId',
        statementFingerprints: 'id, issuer, periodStart',
        kvStore: 'key',
      })
      .upgrade(async (tx) => {
        const txTable = tx.table('transactions');
        const catTable = tx.table('categories');

        // Find income-related category IDs
        const allCategories = await catTable.toArray();
        const incomeCategoryIds = new Set<string>();

        for (const cat of allCategories) {
          const name = (cat.name as string || '').toLowerCase();
          // "Income" is the primary income category.
          // Also include any sub-categories of Income (parentId matches).
          if (name === 'income' || name === 'salary') {
            incomeCategoryIds.add(cat.id as string);
          }
        }

        // Also find children of income categories
        for (const cat of allCategories) {
          if (cat.parentId && incomeCategoryIds.has(cat.parentId as string)) {
            incomeCategoryIds.add(cat.id as string);
          }
        }

        if (incomeCategoryIds.size === 0) {
          console.log('[DB v9] No income categories found — skipping migration');
          return;
        }

        console.log('[DB v9] Income category IDs:', [...incomeCategoryIds]);

        // Find all transactions with income categories AND positive amounts
        // These were incorrectly stored without the negative sign.
        const allTransactions = await txTable.toArray();
        let fixedCount = 0;

        for (const transaction of allTransactions) {
          const category = transaction.category as string;
          const amount = transaction.amount as number;

          if (incomeCategoryIds.has(category) && amount > 0) {
            // This is an income transaction stored with a positive amount — negate it
            await txTable.update(transaction.id as string, {
              amount: -amount,
            });
            fixedCount++;
          }
        }

        console.log(
          `[DB v9] Fixed sign convention for ${fixedCount} income transaction(s)`
        );
      });

    // Version 10: Add transactionType field and infer type from amount sign
    // ──────────────────────────────────────────────────────────────────────
    // Previous imports lost the credit/debit type information because
    // ParsedStatementTransaction.type was never persisted into LocalTransaction.
    // This migration:
    // 1. Adds `transactionType` field to all existing transactions
    // 2. Infers type from the amount sign (positive → debit, negative → credit)
    // 3. For future imports, the type is explicitly set from the parser output
    this.version(10)
      .stores({
        // No schema index changes — transactionType is not indexed
        transactions: 'id, date, vendor, category, syncStatus, createdAt',
        categories: 'id, parentId, isDefault',
        budgets: 'id, categoryId, isActive',
        searchHistory: 'id, timestamp',
        anomalies: 'id, transactionId, isResolved',
        settings: 'id',
        vendorCategories: 'id, vendorPattern, categoryId',
        statementFingerprints: 'id, issuer, periodStart',
        kvStore: 'key',
      })
      .upgrade(async (tx) => {
        const txTable = tx.table('transactions');
        const allTransactions = await txTable.toArray();
        let setCount = 0;

        for (const transaction of allTransactions) {
          const amount = transaction.amount as number;
          // For transactions with negative amounts, we KNOW they are credits
          // (the sign was correctly applied at import time).
          // For positive amounts, we can't be sure — they could be debits
          // OR credits with a broken sign (the old LLM parser bug).
          // Set null for ambiguous cases; new imports will always have an
          // explicit type from the parser.
          const inferredType = amount < 0 ? 'credit' : null;
          await txTable.update(transaction.id as string, {
            transactionType: inferredType,
          });
          if (inferredType) setCount++;
        }

        console.log(
          `[DB v10] Added transactionType field. Identified ${setCount} definite credit(s) out of ${allTransactions.length} transactions.`
        );
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
   * Find transactions whose vendor name matches a pattern (case-insensitive).
   * Used for retroactive re-categorization when a user corrects a category.
   *
   * @param vendorPattern - Vendor name or substring to match
   * @param excludeIds - Optional transaction IDs to exclude from results
   * @returns Promise<LocalTransaction[]>
   */
  async findTransactionsByVendor(
    vendorPattern: string,
    excludeIds?: Set<TransactionId>
  ): Promise<LocalTransaction[]> {
    const pattern = vendorPattern.toLowerCase().trim();
    if (!pattern) {
      return [];
    }

    return this.transactions
      .filter((tx) => {
        if (excludeIds?.has(tx.id)) {
          return false;
        }
        return tx.vendor.toLowerCase().includes(pattern);
      })
      .toArray();
  }

  /**
   * Batch-update the category of multiple transactions.
   * Marks them as modified for sync.
   *
   * @param transactionIds - IDs of transactions to update
   * @param categoryId - New category ID to assign
   * @returns Number of transactions updated
   */
  async batchUpdateCategory(
    transactionIds: TransactionId[],
    categoryId: CategoryId
  ): Promise<number> {
    const now = new Date();
    let updated = 0;

    await this.transaction('rw', this.transactions, async () => {
      for (const id of transactionIds) {
        const count = await this.transactions.where('id').equals(id).modify({
          category: categoryId,
          updatedAt: now,
          syncStatus: 'pending',
        });
        updated += count;
      }
    });

    return updated;
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

      // Derive default categories from the Category Registry (single source of truth)
      const { getDefaultCategorySeeds, getSubcategorySeeds } = await import(
        '@/lib/categories/category-registry'
      );
      const seeds = getDefaultCategorySeeds();

      const defaultCategories: Category[] = seeds.map((seed) => ({
        id: uuidv4() as CategoryId,
        userId,
        name: seed.name,
        icon: seed.icon,
        color: seed.color,
        parentId: seed.parentId as CategoryId | null,
        sortOrder: seed.sortOrder,
        isDefault: seed.isDefault,
        createdAt: now,
        updatedAt: now,
      }));

      await this.categories.bulkAdd(defaultCategories);

      // Seed sub-categories with parentId references
      const parentNameToId = new Map<string, CategoryId>();
      for (const cat of defaultCategories) {
        parentNameToId.set(cat.name.toLowerCase(), cat.id);
      }

      const subSeeds = getSubcategorySeeds();
      const subCategories: Category[] = [];

      for (const sub of subSeeds) {
        const parentId = parentNameToId.get(sub.parentName.toLowerCase());
        if (!parentId) continue;

        subCategories.push({
          id: uuidv4() as CategoryId,
          userId,
          name: sub.name,
          icon: sub.icon,
          color: sub.color,
          parentId,
          sortOrder: sub.sortOrder,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (subCategories.length > 0) {
        await this.categories.bulkAdd(subCategories);
      }
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
