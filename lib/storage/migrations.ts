/**
 * Vault-AI Database Migrations
 *
 * This module handles database schema versioning and migrations.
 * Dexie.js manages schema migrations automatically, but this file
 * provides additional utilities for data migrations and validation.
 *
 * IMPORTANT: When adding new versions, always create additive changes.
 * Never remove indexes or change primary keys without proper migration.
 */

import Dexie from 'dexie';

import type { VaultDatabase } from './db';
import type {
  LocalTransaction,
  Category,
  Budget,
  AnomalyAlert,
} from '@/types/database';

// ============================================
// Migration Types
// ============================================

/**
 * Migration version info.
 */
export interface MigrationVersion {
  version: number;
  description: string;
  appliedAt?: Date;
}

/**
 * Migration result.
 */
export interface MigrationResult {
  success: boolean;
  version: number;
  recordsAffected: number;
  errors: string[];
  duration: number;
}

/**
 * Data validation result.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  recordsChecked: number;
}

// ============================================
// Migration Definitions
// ============================================

/**
 * All migration versions with their descriptions.
 */
export const MIGRATIONS: readonly MigrationVersion[] = [
  {
    version: 1,
    description:
      'Initial schema with transactions, categories, budgets, searchHistory, anomalies, and settings',
  },
  // Future migrations will be added here:
  // {
  //   version: 2,
  //   description: 'Add tags support to transactions',
  // },
] as const;

/**
 * Current database version.
 */
export const CURRENT_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 1;

// ============================================
// Migration Helpers
// ============================================

/**
 * MigrationHelper - Utilities for database migrations.
 */
export class MigrationHelper {
  private db: VaultDatabase;

  constructor(db: VaultDatabase) {
    this.db = db;
  }

  /**
   * Get the current database version.
   */
  getCurrentVersion(): number {
    return this.db.verno;
  }

  /**
   * Check if migration is needed.
   */
  needsMigration(): boolean {
    return this.getCurrentVersion() < CURRENT_VERSION;
  }

  /**
   * Get list of pending migrations.
   */
  getPendingMigrations(): MigrationVersion[] {
    const currentVersion = this.getCurrentVersion();
    return MIGRATIONS.filter((m) => m.version > currentVersion);
  }

  /**
   * Validate all data in the database.
   * Use this after migrations to ensure data integrity.
   */
  async validateData(): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      recordsChecked: 0,
    };

    const startTime = performance.now();

    try {
      // Validate transactions
      const transactions = await this.db.transactions.toArray();
      result.recordsChecked += transactions.length;

      for (const tx of transactions) {
        const txErrors = this.validateTransaction(tx);
        if (txErrors.length > 0) {
          result.valid = false;
          result.errors.push(
            ...txErrors.map((e) => `Transaction ${tx.id}: ${e}`)
          );
        }
      }

      // Validate categories
      const categories = await this.db.categories.toArray();
      result.recordsChecked += categories.length;

      for (const cat of categories) {
        const catErrors = this.validateCategory(cat);
        if (catErrors.length > 0) {
          result.valid = false;
          result.errors.push(
            ...catErrors.map((e) => `Category ${cat.id}: ${e}`)
          );
        }
      }

      // Validate budgets
      const budgets = await this.db.budgets.toArray();
      result.recordsChecked += budgets.length;

      for (const budget of budgets) {
        const budgetErrors = this.validateBudget(budget, categories);
        if (budgetErrors.length > 0) {
          result.valid = false;
          result.errors.push(
            ...budgetErrors.map((e) => `Budget ${budget.id}: ${e}`)
          );
        }
      }

      // Validate anomalies
      const anomalies = await this.db.anomalies.toArray();
      result.recordsChecked += anomalies.length;

      for (const anomaly of anomalies) {
        const anomalyErrors = this.validateAnomaly(anomaly, transactions);
        if (anomalyErrors.length > 0) {
          result.valid = false;
          result.errors.push(
            ...anomalyErrors.map((e) => `Anomaly ${anomaly.id}: ${e}`)
          );
        }
      }

      // Check referential integrity
      const integrityWarnings = await this.checkReferentialIntegrity();
      result.warnings.push(...integrityWarnings);
    } catch (error) {
      result.valid = false;
      result.errors.push(`Validation error: ${(error as Error).message}`);
    }

    const duration = performance.now() - startTime;
    console.log(`Data validation completed in ${duration.toFixed(2)}ms`);

    return result;
  }

  /**
   * Validate a single transaction record.
   */
  private validateTransaction(tx: LocalTransaction): string[] {
    const errors: string[] = [];

    if (!tx.id) {
      errors.push('Missing id');
    }

    if (!tx.date || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
      errors.push(`Invalid date format: ${tx.date}`);
    }

    if (typeof tx.amount !== 'number' || isNaN(tx.amount)) {
      errors.push(`Invalid amount: ${tx.amount}`);
    }

    if (!tx.vendor || typeof tx.vendor !== 'string') {
      errors.push(`Invalid vendor: ${tx.vendor}`);
    }

    if (!['synced', 'pending', 'error', 'local-only'].includes(tx.syncStatus)) {
      errors.push(`Invalid syncStatus: ${tx.syncStatus}`);
    }

    if (!(tx.createdAt instanceof Date) && typeof tx.createdAt !== 'string') {
      errors.push('Invalid createdAt');
    }

    if (!(tx.updatedAt instanceof Date) && typeof tx.updatedAt !== 'string') {
      errors.push('Invalid updatedAt');
    }

    return errors;
  }

  /**
   * Validate a single category record.
   */
  private validateCategory(cat: Category): string[] {
    const errors: string[] = [];

    if (!cat.id) {
      errors.push('Missing id');
    }

    if (
      !cat.name ||
      typeof cat.name !== 'string' ||
      cat.name.trim().length === 0
    ) {
      errors.push(`Invalid name: ${cat.name}`);
    }

    if (!cat.icon || typeof cat.icon !== 'string') {
      errors.push(`Invalid icon: ${cat.icon}`);
    }

    if (!cat.color || !/^#[0-9A-Fa-f]{6}$/.test(cat.color)) {
      errors.push(`Invalid color format: ${cat.color}`);
    }

    return errors;
  }

  /**
   * Validate a single budget record.
   */
  private validateBudget(budget: Budget, categories: Category[]): string[] {
    const errors: string[] = [];

    if (!budget.id) {
      errors.push('Missing id');
    }

    if (typeof budget.amount !== 'number' || budget.amount < 0) {
      errors.push(`Invalid amount: ${budget.amount}`);
    }

    if (!['weekly', 'monthly', 'yearly'].includes(budget.period)) {
      errors.push(`Invalid period: ${budget.period}`);
    }

    // Check category exists if specified
    if (budget.categoryId) {
      const categoryExists = categories.some((c) => c.id === budget.categoryId);
      if (!categoryExists) {
        errors.push(`Referenced category does not exist: ${budget.categoryId}`);
      }
    }

    return errors;
  }

  /**
   * Validate a single anomaly record.
   */
  private validateAnomaly(
    anomaly: AnomalyAlert,
    transactions: LocalTransaction[]
  ): string[] {
    const errors: string[] = [];

    if (!anomaly.id) {
      errors.push('Missing id');
    }

    if (!anomaly.transactionId) {
      errors.push('Missing transactionId');
    } else {
      const transactionExists = transactions.some(
        (t) => t.id === anomaly.transactionId
      );
      if (!transactionExists) {
        errors.push(
          `Referenced transaction does not exist: ${anomaly.transactionId}`
        );
      }
    }

    if (
      ![
        'duplicate',
        'unusual_amount',
        'new_vendor',
        'price_increase',
        'duplicate_subscription',
      ].includes(anomaly.type)
    ) {
      errors.push(`Invalid type: ${anomaly.type}`);
    }

    if (!['low', 'medium', 'high'].includes(anomaly.severity)) {
      errors.push(`Invalid severity: ${anomaly.severity}`);
    }

    return errors;
  }

  /**
   * Check referential integrity across tables.
   */
  private async checkReferentialIntegrity(): Promise<string[]> {
    const warnings: string[] = [];

    // Check that all transaction categories exist
    const transactions = await this.db.transactions.toArray();
    const categories = await this.db.categories.toArray();
    const categoryIds = new Set(categories.map((c) => c.id));

    for (const tx of transactions) {
      if (tx.category && !categoryIds.has(tx.category)) {
        warnings.push(
          `Transaction ${tx.id} references non-existent category ${tx.category}`
        );
      }
    }

    // Check parent categories exist
    for (const cat of categories) {
      if (cat.parentId && !categoryIds.has(cat.parentId)) {
        warnings.push(
          `Category ${cat.id} references non-existent parent ${cat.parentId}`
        );
      }
    }

    return warnings;
  }

  /**
   * Repair orphaned records.
   */
  async repairOrphanedRecords(): Promise<{ fixed: number; errors: string[] }> {
    let fixed = 0;
    const errors: string[] = [];

    try {
      const categories = await this.db.categories.toArray();
      const categoryIds = new Set(categories.map((c) => c.id));

      // Fix transactions with missing categories
      const transactions = await this.db.transactions.toArray();
      for (const tx of transactions) {
        if (tx.category && !categoryIds.has(tx.category)) {
          await this.db.transactions.update(tx.id, { category: null });
          fixed++;
        }
      }

      // Fix categories with missing parents
      for (const cat of categories) {
        if (cat.parentId && !categoryIds.has(cat.parentId)) {
          await this.db.categories.update(cat.id, { parentId: null });
          fixed++;
        }
      }
    } catch (error) {
      errors.push(`Repair error: ${(error as Error).message}`);
    }

    return { fixed, errors };
  }

  /**
   * Run a specific data migration.
   * Call this when you need to transform data after a schema change.
   *
   * @param version - The version to migrate to
   * @param migrationFn - The migration function to run
   */
  async runDataMigration(
    version: number,
    migrationFn: (db: VaultDatabase) => Promise<number>
  ): Promise<MigrationResult> {
    const startTime = performance.now();
    const result: MigrationResult = {
      success: false,
      version,
      recordsAffected: 0,
      errors: [],
      duration: 0,
    };

    try {
      result.recordsAffected = await migrationFn(this.db);
      result.success = true;
    } catch (error) {
      result.errors.push((error as Error).message);
    }

    result.duration = performance.now() - startTime;
    return result;
  }
}

// ============================================
// Data Migration Functions
// ============================================

/**
 * Example data migration for future use.
 * Add new data migrations here as the schema evolves.
 */
export const dataMigrations = {
  /**
   * Migration v1 -> v2: Example migration (not currently used)
   * This is a template for future migrations.
   */
  async v1ToV2(_db: VaultDatabase): Promise<number> {
    // Example: Add default value to new field
    // const transactions = await _db.transactions.toArray();
    // let updated = 0;
    // for (const tx of transactions) {
    //   if (tx.newField === undefined) {
    //     await _db.transactions.update(tx.id, { newField: 'default' });
    //     updated++;
    //   }
    // }
    // return updated;
    return 0;
  },
};

// ============================================
// Upgrade Callbacks
// ============================================

/**
 * Apply schema upgrades to a Dexie database.
 * Call this in your database class to set up version upgrades.
 *
 * Example usage in db.ts:
 * ```typescript
 * this.version(2).stores({ ... }).upgrade(applyUpgradeV2);
 * ```
 */
export function applyUpgradeV1(): void {
  // Version 1 is the initial schema, no upgrade needed
  console.log('Database initialized at version 1');
}

/**
 * Template for future upgrade functions.
 */
export function applyUpgradeV2Template(): void {
  // Example upgrade logic would go here
  // Use db.transaction() for complex migrations
  console.log('Database upgraded to version 2');
}

// ============================================
// Export Factory
// ============================================

/**
 * Create a migration helper for a database instance.
 */
export function createMigrationHelper(db: VaultDatabase): MigrationHelper {
  return new MigrationHelper(db);
}

// ============================================
// Database Reset (Development Only)
// ============================================

/**
 * Delete the entire database.
 * USE WITH EXTREME CAUTION - this permanently deletes all data!
 *
 * @param dbName - Database name (default: 'VaultAI')
 */
export async function deleteDatabase(
  dbName: string = 'VaultAI'
): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('deleteDatabase can only be called in browser environment');
  }

  await Dexie.delete(dbName);
  console.log(`Database '${dbName}' deleted successfully`);
}

/**
 * Check if database exists.
 *
 * @param dbName - Database name (default: 'VaultAI')
 */
export async function databaseExists(
  dbName: string = 'VaultAI'
): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }

  const databases = await Dexie.getDatabaseNames();
  return databases.includes(dbName);
}
