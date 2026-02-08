/**
 * Conflict Resolver for Vault-AI
 *
 * Handles detection and resolution of sync conflicts when the same
 * transaction is modified on multiple devices.
 *
 * Conflict types:
 * - UPDATE conflict: Both local and remote versions were modified
 * - DELETE conflict: One version deleted, other modified
 *
 * Resolution strategies:
 * - 'local': Keep local version, overwrite remote
 * - 'remote': Keep remote version, overwrite local
 * - 'newest': Keep whichever version is newer
 * - 'ask': Prompt user for resolution (default)
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/storage/db';
import type {
  LocalTransaction,
  TransactionId,
  CategoryId,
} from '@/types/database';
import type { Transaction as TransactionRow } from '@/types/supabase';
import type { ConflictResolution } from '@/types/sync';

// ============================================
// Types
// ============================================

/** Version of a transaction for comparison */
export interface TransactionVersion {
  date: string;
  amount: number;
  vendor: string;
  category: string | null;
  note: string;
  currency: string;
  updatedAt: Date;
  source: 'local' | 'remote';
}

/** Conflict type */
export type ConflictType = 'update' | 'delete';

/** Extended conflict with detailed versions */
export interface DetailedConflict {
  id: string;
  transactionId: TransactionId;
  localVersion: TransactionVersion;
  remoteVersion: TransactionVersion;
  conflictType: ConflictType;
  detectedAt: Date;
  resolvedAt: Date | null;
  resolution: ConflictResolution | null;
  resolvedBy: 'user' | 'auto' | null;
  /** Fields that differ between versions */
  differingFields: string[];
}

/** Auto-resolve strategy */
export type AutoResolveStrategy = 'newest' | 'local' | 'remote' | 'ask';

/** Conflict resolver configuration */
export interface ConflictResolverConfig {
  /** Auto-resolve strategy */
  autoResolveStrategy: AutoResolveStrategy;
  /** Whether to notify on auto-resolve */
  notifyOnAutoResolve: boolean;
}

/** Conflict change listener */
export type ConflictChangeListener = (conflicts: DetailedConflict[]) => void;

/** Unsubscribe function */
export type Unsubscribe = () => void;

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_CONFLICT_CONFIG: ConflictResolverConfig = {
  autoResolveStrategy: 'ask',
  notifyOnAutoResolve: true,
};

// ============================================
// Conflict Resolver Interface
// ============================================

export interface ConflictResolver {
  /** Detect if there's a conflict between local and remote versions */
  detectConflict(
    local: LocalTransaction,
    remote: TransactionRow
  ): Promise<DetailedConflict | null>;

  /** Resolve a conflict with the specified strategy */
  resolveConflict(
    conflictId: string,
    resolution: 'local' | 'remote'
  ): Promise<void>;

  /** Auto-resolve a conflict based on strategy */
  autoResolve(
    conflict: DetailedConflict,
    strategy: AutoResolveStrategy
  ): Promise<'local' | 'remote' | 'ask'>;

  /** Get all unresolved conflicts */
  getUnresolvedConflicts(): Promise<DetailedConflict[]>;

  /** Get a specific conflict by ID */
  getConflict(conflictId: string): Promise<DetailedConflict | null>;

  /** Get conflicts for a specific transaction */
  getConflictsForTransaction(
    transactionId: TransactionId
  ): Promise<DetailedConflict[]>;

  /** Clear resolved conflicts */
  clearResolvedConflicts(): Promise<void>;

  /** Subscribe to conflict changes */
  onConflictChange(listener: ConflictChangeListener): Unsubscribe;

  /** Update configuration */
  updateConfig(config: Partial<ConflictResolverConfig>): void;

  /** Get current configuration */
  getConfig(): ConflictResolverConfig;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract a TransactionVersion from a LocalTransaction.
 */
function localToVersion(tx: LocalTransaction): TransactionVersion {
  return {
    date: tx.date,
    amount: tx.amount,
    vendor: tx.vendor,
    category: tx.category,
    note: tx.note,
    currency: tx.currency,
    updatedAt: tx.updatedAt,
    source: 'local',
  };
}

/**
 * Extract a TransactionVersion from a remote TransactionRow.
 */
function remoteToVersion(tx: TransactionRow): TransactionVersion {
  return {
    date: tx.date,
    amount: tx.amount,
    vendor: tx.vendor,
    category: tx.category_id,
    note: tx.note || '',
    currency: tx.currency,
    updatedAt: new Date(tx.server_updated_at),
    source: 'remote',
  };
}

/**
 * Find which fields differ between two versions.
 */
function findDifferingFields(
  local: TransactionVersion,
  remote: TransactionVersion
): string[] {
  const fields: string[] = [];

  if (local.date !== remote.date) {
    fields.push('date');
  }
  if (local.amount !== remote.amount) {
    fields.push('amount');
  }
  if (local.vendor !== remote.vendor) {
    fields.push('vendor');
  }
  if (local.category !== remote.category) {
    fields.push('category');
  }
  if (local.note !== remote.note) {
    fields.push('note');
  }
  if (local.currency !== remote.currency) {
    fields.push('currency');
  }

  return fields;
}

/**
 * Determine which version is newer.
 */
function getNewerVersion(
  local: TransactionVersion,
  remote: TransactionVersion
): 'local' | 'remote' {
  return local.updatedAt > remote.updatedAt ? 'local' : 'remote';
}

// ============================================
// Conflict Resolver Implementation
// ============================================

class ConflictResolverImpl implements ConflictResolver {
  private conflicts: Map<string, DetailedConflict> = new Map();
  private listeners: Set<ConflictChangeListener> = new Set();
  private config: ConflictResolverConfig = { ...DEFAULT_CONFLICT_CONFIG };

  constructor(config?: Partial<ConflictResolverConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  // ============================================
  // Conflict Detection
  // ============================================

  async detectConflict(
    local: LocalTransaction,
    remote: TransactionRow
  ): Promise<DetailedConflict | null> {
    // Only detect conflict if local has pending changes
    if (local.syncStatus !== 'pending') {
      return null;
    }

    const localVersion = localToVersion(local);
    const remoteVersion = remoteToVersion(remote);

    // Check if remote was updated after our local changes
    const remoteUpdatedAt = new Date(remote.server_updated_at);
    const localUpdatedAt = local.updatedAt;

    // Both versions need to have changes for it to be a conflict
    // If remote hasn't changed since we last synced, no conflict
    if (remoteUpdatedAt <= localUpdatedAt) {
      return null;
    }

    // Find differing fields
    const differingFields = findDifferingFields(localVersion, remoteVersion);

    // If no fields differ, no conflict
    if (differingFields.length === 0) {
      return null;
    }

    // Create conflict record
    const conflict: DetailedConflict = {
      id: uuidv4(),
      transactionId: local.id,
      localVersion,
      remoteVersion,
      conflictType: 'update',
      detectedAt: new Date(),
      resolvedAt: null,
      resolution: null,
      resolvedBy: null,
      differingFields,
    };

    // Store conflict
    this.conflicts.set(conflict.id, conflict);
    this.notifyListeners();

    console.log('[ConflictResolver] Conflict detected:', {
      transactionId: local.id,
      differingFields,
      localUpdatedAt,
      remoteUpdatedAt,
    });

    // Auto-resolve if configured
    if (this.config.autoResolveStrategy !== 'ask') {
      const resolution = await this.autoResolve(
        conflict,
        this.config.autoResolveStrategy
      );
      if (resolution !== 'ask') {
        return null; // Conflict was auto-resolved
      }
    }

    return conflict;
  }

  // ============================================
  // Conflict Resolution
  // ============================================

  async resolveConflict(
    conflictId: string,
    resolution: 'local' | 'remote'
  ): Promise<void> {
    const conflict = this.conflicts.get(conflictId);

    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    console.log(
      '[ConflictResolver] Resolving conflict:',
      conflictId,
      'with',
      resolution
    );

    if (resolution === 'local') {
      await this.applyLocalResolution(conflict);
    } else {
      await this.applyRemoteResolution(conflict);
    }

    // Update conflict record
    conflict.resolution = resolution;
    conflict.resolvedAt = new Date();
    conflict.resolvedBy = 'user';
    this.conflicts.set(conflictId, conflict);
    this.notifyListeners();
  }

  async autoResolve(
    conflict: DetailedConflict,
    strategy: AutoResolveStrategy
  ): Promise<'local' | 'remote' | 'ask'> {
    if (strategy === 'ask') {
      return 'ask';
    }

    let resolution: 'local' | 'remote';

    switch (strategy) {
      case 'newest':
        resolution = getNewerVersion(
          conflict.localVersion,
          conflict.remoteVersion
        );
        break;
      case 'local':
        resolution = 'local';
        break;
      case 'remote':
        resolution = 'remote';
        break;
      default:
        return 'ask';
    }

    console.log(
      '[ConflictResolver] Auto-resolving conflict:',
      conflict.id,
      'with',
      resolution
    );

    if (resolution === 'local') {
      await this.applyLocalResolution(conflict);
    } else {
      await this.applyRemoteResolution(conflict);
    }

    // Update conflict record
    conflict.resolution = resolution;
    conflict.resolvedAt = new Date();
    conflict.resolvedBy = 'auto';
    this.conflicts.set(conflict.id, conflict);
    this.notifyListeners();

    return resolution;
  }

  // ============================================
  // Resolution Application
  // ============================================

  private async applyLocalResolution(
    conflict: DetailedConflict
  ): Promise<void> {
    // Keep local version - mark as pending to re-upload
    await db.transactions.update(conflict.transactionId, {
      syncStatus: 'pending',
      lastSyncAttempt: new Date(),
      syncError: null,
    });

    // The sync engine will upload local version on next sync
  }

  private async applyRemoteResolution(
    conflict: DetailedConflict
  ): Promise<void> {
    const remote = conflict.remoteVersion;

    // Update local with remote values (preserve local-only fields)
    await db.transactions.update(conflict.transactionId, {
      date: remote.date,
      amount: remote.amount,
      vendor: remote.vendor,
      category: remote.category as CategoryId | null,
      note: remote.note,
      currency: remote.currency,
      updatedAt: remote.updatedAt,
      syncStatus: 'synced',
      lastSyncAttempt: new Date(),
      syncError: null,
    });
  }

  // ============================================
  // Conflict Queries
  // ============================================

  async getUnresolvedConflicts(): Promise<DetailedConflict[]> {
    return Array.from(this.conflicts.values()).filter(
      (c) => c.resolution === null
    );
  }

  async getConflict(conflictId: string): Promise<DetailedConflict | null> {
    return this.conflicts.get(conflictId) || null;
  }

  async getConflictsForTransaction(
    transactionId: TransactionId
  ): Promise<DetailedConflict[]> {
    return Array.from(this.conflicts.values()).filter(
      (c) => c.transactionId === transactionId
    );
  }

  async clearResolvedConflicts(): Promise<void> {
    for (const [id, conflict] of this.conflicts.entries()) {
      if (conflict.resolution !== null) {
        this.conflicts.delete(id);
      }
    }
    this.notifyListeners();
  }

  // ============================================
  // Event Listeners
  // ============================================

  onConflictChange(listener: ConflictChangeListener): Unsubscribe {
    this.listeners.add(listener);
    // Immediately notify of current state
    listener(Array.from(this.conflicts.values()));
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const conflicts = Array.from(this.conflicts.values());
    this.listeners.forEach((listener) => {
      try {
        listener(conflicts);
      } catch (error) {
        console.error('[ConflictResolver] Error in listener:', error);
      }
    });
  }

  // ============================================
  // Configuration
  // ============================================

  updateConfig(config: Partial<ConflictResolverConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ConflictResolverConfig {
    return { ...this.config };
  }
}

// ============================================
// Singleton Instance
// ============================================

let conflictResolverInstance: ConflictResolver | null = null;

/**
 * Get the singleton ConflictResolver instance.
 */
export function getConflictResolver(): ConflictResolver {
  if (!conflictResolverInstance) {
    conflictResolverInstance = new ConflictResolverImpl();
  }
  return conflictResolverInstance;
}

/**
 * Create a new ConflictResolver instance (for testing).
 */
export function createConflictResolver(
  config?: Partial<ConflictResolverConfig>
): ConflictResolver {
  return new ConflictResolverImpl(config);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format a version for display.
 */
export function formatVersion(version: TransactionVersion): string {
  return `${version.date} | ${version.vendor} | $${version.amount.toFixed(2)}`;
}

/**
 * Get a human-readable field name.
 */
export function getFieldDisplayName(field: string): string {
  const displayNames: Record<string, string> = {
    date: 'Date',
    amount: 'Amount',
    vendor: 'Vendor',
    category: 'Category',
    note: 'Note',
    currency: 'Currency',
  };
  return displayNames[field] || field;
}

/**
 * Format a field value for display.
 */
export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined) {
    return '(none)';
  }

  switch (field) {
    case 'amount':
      return `$${(value as number).toFixed(2)}`;
    case 'date':
      return new Date(value as string).toLocaleDateString();
    default:
      return String(value);
  }
}

/**
 * Get the difference description between two versions.
 */
export function getDifferenceDescription(
  local: TransactionVersion,
  remote: TransactionVersion,
  field: string
): { localValue: string; remoteValue: string } {
  const localValue = formatFieldValue(
    field,
    local[field as keyof TransactionVersion]
  );
  const remoteValue = formatFieldValue(
    field,
    remote[field as keyof TransactionVersion]
  );

  return { localValue, remoteValue };
}

export { ConflictResolverImpl };
