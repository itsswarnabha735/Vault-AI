/**
 * Unit Tests for Test Factories
 *
 * Ensures factory functions create valid test data.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTransaction,
  createTransactions,
  createCategory,
  createBudget,
  createAnomalyAlert,
  createSearchQuery,
  createUserSettings,
  createSyncableTransaction,
  verifySyncPayloadIsSafe,
  resetIdCounter,
} from '../factories';

describe('Transaction Factory', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe('createTransaction', () => {
    it('should create a valid transaction with defaults', () => {
      const transaction = createTransaction();

      expect(transaction.id).toBeDefined();
      expect(transaction.rawText).toBeDefined();
      expect(transaction.embedding).toBeInstanceOf(Float32Array);
      expect(transaction.embedding.length).toBe(384);
      expect(transaction.filePath).toBeDefined();
      expect(transaction.amount).toBe(99.99);
      expect(transaction.vendor).toBe('Test Store');
      expect(transaction.syncStatus).toBe('synced');
    });

    it('should allow overriding default values', () => {
      const transaction = createTransaction({
        amount: 250.5,
        vendor: 'Custom Store',
        syncStatus: 'pending',
      });

      expect(transaction.amount).toBe(250.5);
      expect(transaction.vendor).toBe('Custom Store');
      expect(transaction.syncStatus).toBe('pending');
    });

    it('should create unique IDs for each transaction', () => {
      const tx1 = createTransaction();
      const tx2 = createTransaction();

      expect(tx1.id).not.toBe(tx2.id);
    });

    it('should create valid dates', () => {
      const transaction = createTransaction();

      // Date should be in YYYY-MM-DD format
      expect(transaction.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('createTransactions', () => {
    it('should create multiple transactions', () => {
      const transactions = createTransactions(5);

      expect(transactions.length).toBe(5);
      transactions.forEach((tx) => {
        expect(tx.id).toBeDefined();
        expect(tx.amount).toBeDefined();
      });
    });

    it('should create transactions with sequential data', () => {
      const transactions = createTransactions(3);

      // Amounts should be sequential
      expect(transactions[0].amount).toBe(50);
      expect(transactions[1].amount).toBe(60);
      expect(transactions[2].amount).toBe(70);

      // Vendors should be numbered
      expect(transactions[0].vendor).toBe('Vendor 1');
      expect(transactions[1].vendor).toBe('Vendor 2');
    });

    it('should apply base overrides to all transactions', () => {
      const transactions = createTransactions(3, { category: null });

      transactions.forEach((tx) => {
        expect(tx.category).toBeNull();
      });
    });
  });
});

describe('Category Factory', () => {
  it('should create a valid category', () => {
    const category = createCategory();

    expect(category.id).toBeDefined();
    expect(category.name).toBe('Test Category');
    expect(category.icon).toBe('📦');
    expect(category.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(category.isDefault).toBe(false);
  });

  it('should allow overriding category properties', () => {
    const category = createCategory({
      name: 'Food',
      icon: '🍔',
      color: '#ff0000',
      isDefault: true,
    });

    expect(category.name).toBe('Food');
    expect(category.icon).toBe('🍔');
    expect(category.color).toBe('#ff0000');
    expect(category.isDefault).toBe(true);
  });
});

describe('Budget Factory', () => {
  it('should create a valid budget', () => {
    const budget = createBudget();

    expect(budget.id).toBeDefined();
    expect(budget.amount).toBe(500);
    expect(budget.period).toBe('monthly');
    expect(budget.isActive).toBe(true);
  });

  it('should allow custom budget periods', () => {
    const weeklyBudget = createBudget({ period: 'weekly', amount: 100 });
    const yearlyBudget = createBudget({ period: 'yearly', amount: 6000 });

    expect(weeklyBudget.period).toBe('weekly');
    expect(yearlyBudget.period).toBe('yearly');
  });
});

describe('Anomaly Alert Factory', () => {
  it('should create a valid anomaly alert', () => {
    const alert = createAnomalyAlert();

    expect(alert.id).toBeDefined();
    expect(alert.transactionId).toBeDefined();
    expect(alert.type).toBe('duplicate');
    expect(alert.severity).toBe('medium');
    expect(alert.isResolved).toBe(false);
    expect(alert.userAction).toBeNull();
  });

  it('should create duplicate alerts with related transactions', () => {
    const alert = createAnomalyAlert({
      type: 'duplicate',
      relatedTransactionIds: ['tx-1', 'tx-2'] as unknown as [],
    });

    expect(alert.type).toBe('duplicate');
  });
});

describe('Search Query Factory', () => {
  it('should create a valid search query', () => {
    const query = createSearchQuery();

    expect(query.id).toBeDefined();
    expect(query.query).toBe('test search query');
    expect(query.queryEmbedding).toBeInstanceOf(Float32Array);
    expect(query.resultCount).toBe(10);
    expect(query.searchDurationMs).toBe(45);
  });
});

describe('User Settings Factory', () => {
  it('should create valid user settings', () => {
    const settings = createUserSettings();

    expect(settings.id).toBe('default');
    expect(settings.theme).toBe('system');
    expect(settings.defaultCurrency).toBe('USD');
    expect(settings.syncEnabled).toBe(true);
    expect(settings.anomalyDetectionEnabled).toBe(true);
  });
});

describe('Sync Payload Utilities', () => {
  describe('createSyncableTransaction', () => {
    it('should create a safe sync payload', () => {
      const transaction = createTransaction();
      const syncPayload = createSyncableTransaction(transaction);

      expect(syncPayload).toHaveProperty('id');
      expect(syncPayload).toHaveProperty('date');
      expect(syncPayload).toHaveProperty('amount');
      expect(syncPayload).toHaveProperty('vendor');

      expect(syncPayload).not.toHaveProperty('rawText');
      expect(syncPayload).not.toHaveProperty('embedding');
      expect(syncPayload).not.toHaveProperty('filePath');
    });
  });

  describe('verifySyncPayloadIsSafe', () => {
    it('should return true for safe payloads', () => {
      const safePayload = {
        id: 'test',
        date: '2024-01-15',
        amount: 100,
        vendor: 'Store',
      };

      expect(verifySyncPayloadIsSafe(safePayload)).toBe(true);
    });

    it('should return false for unsafe payloads', () => {
      const unsafePayloads = [
        { rawText: 'sensitive' },
        { embedding: [0.1, 0.2] },
        { filePath: '/path' },
      ];

      unsafePayloads.forEach((payload) => {
        expect(verifySyncPayloadIsSafe(payload)).toBe(false);
      });
    });
  });
});
