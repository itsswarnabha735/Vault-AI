/**
 * Test Data Factories for Vault-AI
 *
 * Provides factory functions to create test data with sensible defaults.
 * Uses partial overrides pattern for flexible test data creation.
 */

import {
  LocalTransaction,
  Category,
  Budget,
  AnomalyAlert,
  SearchQuery,
  UserSettings,
  createTransactionId,
  createCategoryId,
  createBudgetId,
  TransactionId,
  CategoryId,
  BudgetId,
  AnomalyAlertId,
  SearchQueryId,
  UserId,
} from '@/types/database';

// ============================================
// Counter for unique IDs
// ============================================

let idCounter = 0;

function nextId(): string {
  return `test-id-${++idCounter}-${Date.now()}`;
}

/**
 * Resets the ID counter. Call this in beforeEach if needed.
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

// ============================================
// Transaction Factory
// ============================================

/**
 * Creates a LocalTransaction with default values.
 * Override any field by passing a partial object.
 */
export function createTransaction(
  overrides?: Partial<LocalTransaction>
): LocalTransaction {
  const id = createTransactionId(overrides?.id ?? nextId());
  const now = new Date();

  return {
    id,
    rawText: 'Sample receipt text for testing purposes',
    embedding: new Float32Array(384).fill(0.1),
    filePath: `/test/documents/${id}.pdf`,
    fileSize: 1024,
    mimeType: 'application/pdf',
    date: now.toISOString().split('T')[0] ?? now.toISOString().slice(0, 10),
    amount: 99.99,
    vendor: 'Test Store',
    category: null,
    note: '',
    currency: 'USD',
    confidence: 0.95,
    isManuallyEdited: false,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'synced',
    lastSyncAttempt: now,
    syncError: null,
    ...overrides,
  };
}

/**
 * Creates multiple transactions with sequential data.
 */
export function createTransactions(
  count: number,
  baseOverrides?: Partial<LocalTransaction>
): LocalTransaction[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);

    return createTransaction({
      amount: 50 + index * 10,
      vendor: `Vendor ${index + 1}`,
      date: date.toISOString().split('T')[0] ?? date.toISOString().slice(0, 10),
      ...baseOverrides,
    });
  });
}

/**
 * Creates a transaction that would be flagged as a duplicate.
 */
export function createDuplicateTransaction(
  originalTransaction: LocalTransaction
): LocalTransaction {
  return createTransaction({
    amount: originalTransaction.amount,
    vendor: originalTransaction.vendor,
    date: originalTransaction.date,
    rawText: originalTransaction.rawText,
  });
}

/**
 * Creates a transaction with unusual amount.
 */
export function createUnusualAmountTransaction(
  vendor: string,
  typicalAmount: number,
  unusualMultiplier: number = 2.5
): LocalTransaction {
  return createTransaction({
    vendor,
    amount: typicalAmount * unusualMultiplier,
  });
}

// ============================================
// Category Factory
// ============================================

/**
 * Creates a Category with default values.
 */
export function createCategory(overrides?: Partial<Category>): Category {
  const id = createCategoryId(overrides?.id ?? nextId());
  const now = new Date();

  return {
    id,
    userId: 'test-user-id' as UserId,
    name: 'Test Category',
    icon: '📦',
    color: '#6b7280',
    parentId: null,
    sortOrder: 0,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Creates default categories for testing.
 */
export function createDefaultCategories(): Category[] {
  return [
    createCategory({
      name: 'Food & Dining',
      icon: '🍽️',
      color: '#f59e0b',
      sortOrder: 1,
      isDefault: true,
    }),
    createCategory({
      name: 'Transportation',
      icon: '🚗',
      color: '#3b82f6',
      sortOrder: 2,
      isDefault: true,
    }),
    createCategory({
      name: 'Shopping',
      icon: '🛍️',
      color: '#ec4899',
      sortOrder: 3,
      isDefault: true,
    }),
    createCategory({
      name: 'Entertainment',
      icon: '🎬',
      color: '#8b5cf6',
      sortOrder: 4,
      isDefault: true,
    }),
    createCategory({
      name: 'Healthcare',
      icon: '🏥',
      color: '#ef4444',
      sortOrder: 5,
      isDefault: true,
    }),
  ];
}

// ============================================
// Budget Factory
// ============================================

/**
 * Creates a Budget with default values.
 */
export function createBudget(overrides?: Partial<Budget>): Budget {
  const id = createBudgetId(overrides?.id ?? nextId());
  const now = new Date();

  return {
    id,
    userId: 'test-user-id' as UserId,
    categoryId: null,
    amount: 500,
    period: 'monthly',
    startDate:
      now.toISOString().split('T')[0] ?? now.toISOString().slice(0, 10),
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ============================================
// Anomaly Alert Factory
// ============================================

/**
 * Creates an AnomalyAlert with default values.
 */
export function createAnomalyAlert(
  overrides?: Partial<AnomalyAlert>
): AnomalyAlert {
  const id = (overrides?.id ?? nextId()) as AnomalyAlertId;
  const transactionId = createTransactionId(
    overrides?.transactionId ?? nextId()
  );
  const now = new Date();

  return {
    id,
    transactionId,
    relatedTransactionIds: [],
    type: 'duplicate',
    severity: 'medium',
    message: 'Potential duplicate transaction detected',
    details: {
      similarityScore: 0.95,
    },
    isResolved: false,
    userAction: null,
    createdAt: now,
    resolvedAt: null,
    ...overrides,
  };
}

/**
 * Creates a duplicate anomaly alert.
 */
export function createDuplicateAlert(
  transactionId: TransactionId,
  originalTransactionId: TransactionId
): AnomalyAlert {
  return createAnomalyAlert({
    transactionId,
    relatedTransactionIds: [originalTransactionId],
    type: 'duplicate',
    severity: 'high',
    message: 'Duplicate transaction detected',
    details: {
      similarityScore: 0.98,
    },
  });
}

/**
 * Creates an unusual amount anomaly alert.
 */
export function createUnusualAmountAlert(
  transactionId: TransactionId,
  expectedMin: number,
  expectedMax: number,
  actualAmount: number
): AnomalyAlert {
  return createAnomalyAlert({
    transactionId,
    type: 'unusual_amount',
    severity: 'medium',
    message: `Amount $${actualAmount} is outside expected range ($${expectedMin} - $${expectedMax})`,
    details: {
      expectedRange: { min: expectedMin, max: expectedMax },
      actualAmount,
      percentageIncrease: ((actualAmount - expectedMax) / expectedMax) * 100,
    },
  });
}

// ============================================
// Search Query Factory
// ============================================

/**
 * Creates a SearchQuery with default values.
 */
export function createSearchQuery(
  overrides?: Partial<SearchQuery>
): SearchQuery {
  const id = (overrides?.id ?? nextId()) as SearchQueryId;
  const now = new Date();

  return {
    id,
    userId: 'test-user-id' as UserId,
    query: 'test search query',
    queryEmbedding: new Float32Array(384).fill(0.1),
    resultCount: 10,
    resultIds: [],
    selectedResultId: null,
    timestamp: now,
    searchDurationMs: 45,
    ...overrides,
  };
}

// ============================================
// User Settings Factory
// ============================================

/**
 * Creates UserSettings with default values.
 */
export function createUserSettings(
  overrides?: Partial<UserSettings>
): UserSettings {
  const now = new Date();

  return {
    id: 'default',
    userId: null,
    theme: 'system',
    defaultCurrency: 'USD',
    timezone: 'UTC',
    syncEnabled: true,
    anomalyDetectionEnabled: true,
    anomalyThreshold: 20,
    dateFormat: 'yyyy-MM-dd',
    numberLocale: 'en-US',
    updatedAt: now,
    ...overrides,
  };
}

// ============================================
// Sync Test Data Factory
// ============================================

/**
 * Creates a sanitized transaction object as it would be synced to the cloud.
 * This should NEVER contain rawText, embedding, or filePath.
 */
export function createSyncableTransaction(
  transaction: LocalTransaction
): Record<string, unknown> {
  return {
    id: transaction.id,
    date: transaction.date,
    amount: transaction.amount,
    vendor: transaction.vendor,
    category: transaction.category,
    note: transaction.note,
    currency: transaction.currency,
    client_created_at: transaction.createdAt.toISOString(),
    client_updated_at: transaction.updatedAt.toISOString(),
  };
}

/**
 * Verifies that a sync payload doesn't contain sensitive fields.
 */
export function verifySyncPayloadIsSafe(payload: unknown): boolean {
  const sensitiveFields = [
    'rawText',
    'embedding',
    'filePath',
    'fileSize',
    'mimeType',
    'confidence',
    'ocrOutput',
  ];

  const jsonString = JSON.stringify(payload);

  for (const field of sensitiveFields) {
    if (jsonString.includes(`"${field}"`)) {
      return false;
    }
  }

  return true;
}

// ============================================
// Chat Test Data Factory
// ============================================

/**
 * Creates a mock chat message for testing.
 */
export function createChatMessage(overrides?: {
  role?: 'user' | 'assistant';
  content?: string;
  citations?: Array<{ id: string; title: string }>;
}): {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Array<{ id: string; title: string }>;
  timestamp: Date;
} {
  return {
    id: nextId(),
    role: overrides?.role ?? 'user',
    content: overrides?.content ?? 'Test message content',
    citations: overrides?.citations ?? [],
    timestamp: new Date(),
  };
}

/**
 * Creates a mock LLM prompt and verifies it doesn't contain sensitive data.
 */
export function createSafeLLMPrompt(
  query: string,
  transactions: LocalTransaction[]
): string {
  // Only include safe, structured data
  const safeTransactionData = transactions.map((tx) => ({
    date: tx.date,
    amount: tx.amount,
    vendor: tx.vendor,
    category: tx.category,
    // NOTE: rawText and embedding are intentionally excluded
  }));

  return `
    You are a personal finance assistant.
    
    USER QUESTION: ${query}
    
    TRANSACTION DATA:
    ${JSON.stringify(safeTransactionData, null, 2)}
  `;
}

// ============================================
// Mock File Factory
// ============================================

/**
 * Creates a mock File object for testing.
 */
export function createMockFile(
  filename: string,
  mimeType: string,
  content: string = 'Mock file content'
): File {
  const blob = new Blob([content], { type: mimeType });
  return new File([blob], filename, { type: mimeType });
}

/**
 * Creates a mock embedding for testing.
 */
export function createMockEmbedding(dimension: number = 384): Float32Array {
  const embedding = new Float32Array(dimension);
  for (let i = 0; i < dimension; i++) {
    embedding[i] = Math.random();
  }
  return embedding;
}

// ============================================
// Re-export ID creators from types
// ============================================

export {
  createTransactionId,
  createCategoryId,
  createBudgetId,
} from '@/types/database';

// ============================================
// Export Type Helpers
// ============================================

export type {
  LocalTransaction,
  Category,
  Budget,
  AnomalyAlert,
  SearchQuery,
  UserSettings,
  TransactionId,
  CategoryId,
  BudgetId,
  AnomalyAlertId,
  SearchQueryId,
  UserId,
};
