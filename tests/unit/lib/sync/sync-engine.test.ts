/**
 * Unit Tests for Sync Engine
 *
 * Tests bidirectional sync between IndexedDB and Supabase cloud.
 * Verifies conflict resolution and privacy-safe data transmission.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createTransaction,
  createTransactions,
  createSyncableTransaction,
  createTransactionId,
  LocalTransaction,
} from '../../../factories';

// ============================================
// Mock Types and Interfaces
// ============================================

type SyncStatus = 'local-only' | 'pending' | 'syncing' | 'synced' | 'error';

interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  conflicts: number;
  errors: string[];
}

interface ConflictResolution {
  transactionId: string;
  resolution: 'local' | 'remote' | 'merge';
  localData: LocalTransaction;
  remoteData: Record<string, unknown>;
}

// ============================================
// Mock Database Implementation
// ============================================

class MockDatabase {
  private transactions: Map<string, LocalTransaction> = new Map();

  async add(tx: LocalTransaction): Promise<string> {
    this.transactions.set(tx.id, tx);
    return tx.id;
  }

  async bulkAdd(txs: LocalTransaction[]): Promise<void> {
    for (const tx of txs) {
      this.transactions.set(tx.id, tx);
    }
  }

  async get(id: string): Promise<LocalTransaction | undefined> {
    return this.transactions.get(id);
  }

  async getAll(): Promise<LocalTransaction[]> {
    return Array.from(this.transactions.values());
  }

  async getPending(): Promise<LocalTransaction[]> {
    return Array.from(this.transactions.values()).filter(
      (tx) => tx.syncStatus === 'pending'
    );
  }

  async update(id: string, changes: Partial<LocalTransaction>): Promise<void> {
    const tx = this.transactions.get(id);
    if (tx) {
      this.transactions.set(id, { ...tx, ...changes });
    }
  }

  async delete(id: string): Promise<void> {
    this.transactions.delete(id);
  }

  clear(): void {
    this.transactions.clear();
  }
}

// ============================================
// Mock Supabase Response Helper
// ============================================

let mockSupabaseResponses: Record<string, unknown>[] = [];

function mockSupabaseResponse(data: Record<string, unknown>[]): void {
  mockSupabaseResponses = data;
}

// ============================================
// Sync Engine Implementation (Mock)
// ============================================

class MockSyncEngine {
  private db: MockDatabase;
  private isOnline: boolean = true;
  private conflicts: ConflictResolution[] = [];

  constructor(db: MockDatabase) {
    this.db = db;
  }

  setOnline(online: boolean): void {
    this.isOnline = online;
  }

  async syncNow(): Promise<SyncResult> {
    if (!this.isOnline) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        errors: ['Network offline'],
      };
    }

    const result: SyncResult = {
      success: true,
      uploaded: 0,
      downloaded: 0,
      conflicts: 0,
      errors: [],
    };

    try {
      // Upload pending transactions
      const pending = await this.db.getPending();

      for (const tx of pending) {
        // Mark as syncing
        await this.db.update(tx.id, { syncStatus: 'syncing' as SyncStatus });

        // Create sanitized payload (CRITICAL for privacy)
        const _payload = createSyncableTransaction(tx);

        // Simulate upload (check for conflicts)
        const remoteVersion = mockSupabaseResponses.find((r) => r.id === tx.id);

        if (remoteVersion) {
          // Check for conflicts
          const remoteUpdated = new Date(
            remoteVersion.server_updated_at as string
          );
          const localUpdated = tx.updatedAt;

          if (remoteUpdated > localUpdated) {
            result.conflicts++;
            this.conflicts.push({
              transactionId: tx.id,
              resolution: 'remote', // Default: remote wins
              localData: tx,
              remoteData: remoteVersion,
            });
            continue;
          }
        }

        // Successful upload
        await this.db.update(tx.id, {
          syncStatus: 'synced' as SyncStatus,
          lastSyncAttempt: new Date(),
        });
        result.uploaded++;
      }

      // Download new remote transactions
      for (const remote of mockSupabaseResponses) {
        const exists = await this.db.get(remote.id as string);
        if (!exists) {
          // New remote transaction - create local copy
          const localTx = createTransaction({
            id: createTransactionId(remote.id as string),
            amount: remote.amount as number,
            vendor: remote.vendor as string,
            date: remote.date as string,
            category: (remote.category as string) || null,
            syncStatus: 'synced' as SyncStatus,
          });
          await this.db.add(localTx);
          result.downloaded++;
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    return result;
  }

  getConflicts(): ConflictResolution[] {
    return this.conflicts;
  }

  async resolveConflict(
    transactionId: string,
    resolution: 'local' | 'remote' | 'merge'
  ): Promise<void> {
    const conflict = this.conflicts.find(
      (c) => c.transactionId === transactionId
    );
    if (!conflict) {
      return;
    }

    if (resolution === 'local') {
      // Keep local, force sync
      await this.db.update(transactionId, {
        syncStatus: 'pending' as SyncStatus,
      });
    } else if (resolution === 'remote') {
      // Accept remote (merge non-local fields)
      await this.db.update(transactionId, {
        amount: conflict.remoteData.amount as number,
        vendor: conflict.remoteData.vendor as string,
        syncStatus: 'synced' as SyncStatus,
      });
    }

    // Remove from conflicts
    const index = this.conflicts.indexOf(conflict);
    if (index > -1) {
      this.conflicts.splice(index, 1);
    }
  }

  async markForSync(id: string): Promise<void> {
    await this.db.update(id, { syncStatus: 'pending' as SyncStatus });
  }
}

// ============================================
// Tests
// ============================================

describe('Sync Engine', () => {
  let db: MockDatabase;
  let syncEngine: MockSyncEngine;

  beforeEach(() => {
    db = new MockDatabase();
    syncEngine = new MockSyncEngine(db);
    mockSupabaseResponses = [];
  });

  afterEach(() => {
    db.clear();
    vi.clearAllMocks();
  });

  describe('Upload Operations', () => {
    it('uploads only pending transactions', async () => {
      await db.bulkAdd([
        createTransaction({
          id: createTransactionId('1'),
          syncStatus: 'pending',
        }),
        createTransaction({
          id: createTransactionId('2'),
          syncStatus: 'synced',
        }),
        createTransaction({
          id: createTransactionId('3'),
          syncStatus: 'pending',
        }),
      ]);

      const result = await syncEngine.syncNow();

      expect(result.uploaded).toBe(2);
    });

    it('marks transactions as synced after successful upload', async () => {
      await db.add(
        createTransaction({
          id: createTransactionId('1'),
          syncStatus: 'pending',
        })
      );

      await syncEngine.syncNow();

      const tx = await db.get(createTransactionId('1'));
      expect(tx?.syncStatus).toBe('synced');
    });

    it('sets lastSyncAttempt after sync', async () => {
      const before = new Date();
      await db.add(
        createTransaction({
          id: createTransactionId('1'),
          syncStatus: 'pending',
        })
      );

      await syncEngine.syncNow();

      const tx = await db.get(createTransactionId('1'));
      expect(tx?.lastSyncAttempt).toBeDefined();
      expect(tx?.lastSyncAttempt!.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
    });
  });

  describe('Download Operations', () => {
    it('downloads new remote transactions', async () => {
      mockSupabaseResponse([
        {
          id: 'remote-1',
          amount: 100,
          vendor: 'Remote Store',
          date: '2024-01-15',
        },
        {
          id: 'remote-2',
          amount: 200,
          vendor: 'Another Store',
          date: '2024-01-16',
        },
      ]);

      const result = await syncEngine.syncNow();

      expect(result.downloaded).toBe(2);

      const all = await db.getAll();
      expect(all).toHaveLength(2);
    });

    it('does not duplicate existing transactions', async () => {
      await db.add(
        createTransaction({
          id: createTransactionId('existing-1'),
          syncStatus: 'synced',
        })
      );

      mockSupabaseResponse([
        { id: 'existing-1', amount: 100, vendor: 'Store', date: '2024-01-15' },
      ]);

      const result = await syncEngine.syncNow();

      expect(result.downloaded).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('handles offline state', async () => {
      syncEngine.setOnline(false);

      await db.add(
        createTransaction({
          id: createTransactionId('1'),
          syncStatus: 'pending',
        })
      );

      const result = await syncEngine.syncNow();

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Network offline');
    });

    it('reports errors in result', async () => {
      syncEngine.setOnline(false);

      const result = await syncEngine.syncNow();

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Conflict Detection', () => {
    it('detects conflicts when remote is newer', async () => {
      const localDate = new Date('2024-01-15');
      await db.add(
        createTransaction({
          id: createTransactionId('conflict-1'),
          amount: 100,
          updatedAt: localDate,
          syncStatus: 'pending',
        })
      );

      mockSupabaseResponse([
        {
          id: 'conflict-1',
          amount: 150,
          server_updated_at: '2024-01-16T00:00:00Z', // Newer than local
        },
      ]);

      const result = await syncEngine.syncNow();

      expect(result.conflicts).toBe(1);
    });

    it('no conflict when local is newer', async () => {
      const localDate = new Date('2024-01-20');
      await db.add(
        createTransaction({
          id: createTransactionId('no-conflict-1'),
          amount: 100,
          updatedAt: localDate,
          syncStatus: 'pending',
        })
      );

      mockSupabaseResponse([
        {
          id: 'no-conflict-1',
          amount: 150,
          server_updated_at: '2024-01-15T00:00:00Z', // Older than local
        },
      ]);

      const result = await syncEngine.syncNow();

      expect(result.conflicts).toBe(0);
    });

    it('stores conflict details for resolution', async () => {
      await db.add(
        createTransaction({
          id: createTransactionId('conflict-2'),
          amount: 100,
          updatedAt: new Date('2024-01-15'),
          syncStatus: 'pending',
        })
      );

      mockSupabaseResponse([
        {
          id: 'conflict-2',
          amount: 200,
          server_updated_at: '2024-01-20T00:00:00Z',
        },
      ]);

      await syncEngine.syncNow();

      const conflicts = syncEngine.getConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].localData.amount).toBe(100);
      expect(conflicts[0].remoteData.amount).toBe(200);
    });
  });

  describe('Conflict Resolution', () => {
    it('resolves conflict with local preference', async () => {
      await db.add(
        createTransaction({
          id: createTransactionId('resolve-local'),
          amount: 100,
          updatedAt: new Date('2024-01-15'),
          syncStatus: 'pending',
        })
      );

      mockSupabaseResponse([
        {
          id: 'resolve-local',
          amount: 200,
          server_updated_at: '2024-01-20T00:00:00Z',
        },
      ]);

      await syncEngine.syncNow();
      await syncEngine.resolveConflict(
        createTransactionId('resolve-local'),
        'local'
      );

      const tx = await db.get(createTransactionId('resolve-local'));
      expect(tx?.amount).toBe(100); // Local value preserved
      expect(tx?.syncStatus).toBe('pending'); // Re-marked for sync
    });

    it('resolves conflict with remote preference', async () => {
      await db.add(
        createTransaction({
          id: createTransactionId('resolve-remote'),
          amount: 100,
          updatedAt: new Date('2024-01-15'),
          syncStatus: 'pending',
        })
      );

      mockSupabaseResponse([
        {
          id: 'resolve-remote',
          amount: 200,
          vendor: 'Remote Vendor',
          server_updated_at: '2024-01-20T00:00:00Z',
        },
      ]);

      await syncEngine.syncNow();
      await syncEngine.resolveConflict(
        createTransactionId('resolve-remote'),
        'remote'
      );

      const tx = await db.get(createTransactionId('resolve-remote'));
      expect(tx?.amount).toBe(200); // Remote value applied
      expect(tx?.vendor).toBe('Remote Vendor');
      expect(tx?.syncStatus).toBe('synced');
    });

    it('removes conflict after resolution', async () => {
      await db.add(
        createTransaction({
          id: createTransactionId('remove-conflict'),
          updatedAt: new Date('2024-01-15'),
          syncStatus: 'pending',
        })
      );

      mockSupabaseResponse([
        {
          id: 'remove-conflict',
          amount: 200,
          server_updated_at: '2024-01-20T00:00:00Z',
        },
      ]);

      await syncEngine.syncNow();
      expect(syncEngine.getConflicts()).toHaveLength(1);

      await syncEngine.resolveConflict(
        createTransactionId('remove-conflict'),
        'local'
      );
      expect(syncEngine.getConflicts()).toHaveLength(0);
    });
  });

  describe('Privacy Compliance', () => {
    it('MUST only sync sanitized data', async () => {
      const tx = createTransaction({
        id: createTransactionId('privacy-test'),
        rawText: 'CONFIDENTIAL: Medical records',
        embedding: new Float32Array(384).fill(0.5),
        filePath: '/secret/path.pdf',
        syncStatus: 'pending',
      });

      await db.add(tx);

      // The sync engine should use createSyncableTransaction
      const syncableData = createSyncableTransaction(tx);

      expect(syncableData).not.toHaveProperty('rawText');
      expect(syncableData).not.toHaveProperty('embedding');
      expect(syncableData).not.toHaveProperty('filePath');
      expect(syncableData).toHaveProperty('id');
      expect(syncableData).toHaveProperty('amount');
    });

    it('MUST preserve local-only data during conflict resolution', async () => {
      const tx = createTransaction({
        id: createTransactionId('preserve-local'),
        rawText: 'Private document text',
        embedding: new Float32Array(384).fill(0.3),
        filePath: '/private/doc.pdf',
        amount: 100,
        updatedAt: new Date('2024-01-15'),
        syncStatus: 'pending',
      });

      await db.add(tx);

      mockSupabaseResponse([
        {
          id: 'preserve-local',
          amount: 200,
          server_updated_at: '2024-01-20T00:00:00Z',
        },
      ]);

      await syncEngine.syncNow();
      await syncEngine.resolveConflict(
        createTransactionId('preserve-local'),
        'remote'
      );

      const updated = await db.get(createTransactionId('preserve-local'));

      // Cloud-syncable fields updated
      expect(updated?.amount).toBe(200);

      // Local-only fields preserved
      expect(updated?.rawText).toBe('Private document text');
      expect(updated?.embedding).toBeInstanceOf(Float32Array);
      expect(updated?.filePath).toBe('/private/doc.pdf');
    });
  });

  describe('Batch Operations', () => {
    it('handles multiple transactions in single sync', async () => {
      const transactions = createTransactions(10).map((tx) => ({
        ...tx,
        syncStatus: 'pending' as SyncStatus,
      }));

      await db.bulkAdd(transactions);

      const result = await syncEngine.syncNow();

      expect(result.uploaded).toBe(10);
    });

    it('marks transactions for sync', async () => {
      await db.add(
        createTransaction({
          id: createTransactionId('mark-sync'),
          syncStatus: 'synced',
        })
      );

      await syncEngine.markForSync(createTransactionId('mark-sync'));

      const tx = await db.get(createTransactionId('mark-sync'));
      expect(tx?.syncStatus).toBe('pending');
    });
  });
});
