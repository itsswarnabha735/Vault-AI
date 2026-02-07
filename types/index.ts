/**
 * Vault-AI Type Definitions
 *
 * This module re-exports all type definitions for the Vault-AI application.
 *
 * Usage:
 * ```typescript
 * import type {
 *   LocalTransaction,
 *   TransactionId,
 *   Category,
 *   SyncStatus,
 * } from '@/types';
 * ```
 */

// ============================================
// Database Types
// ============================================

export type {
  // Branded Types
  TransactionId,
  CategoryId,
  BudgetId,
  DocumentId,
  UserId,
  SearchQueryId,
  AnomalyAlertId,
  // Sync Status
  SyncStatus,
  // Core Entities
  LocalTransaction,
  SyncableTransactionFields,
  Category,
  Budget,
  BudgetPeriod,
  BudgetStatus,
  SearchQuery,
  AnomalyAlert,
  AnomalyType,
  AnomalySeverity,
  AnomalyUserAction,
  AnomalyDetails,
  RawDocument,
  // Preferences
  Theme,
  UserPreferences,
  // Database Schema
  VaultDatabaseSchema,
} from './database';

export {
  // Helper Functions
  createTransactionId,
  createCategoryId,
  createBudgetId,
  createDocumentId,
  createUserId,
  // Constants
  NEVER_SYNC_FIELDS,
  DEFAULT_CATEGORIES,
  DATABASE_INDEXES,
} from './database';

// ============================================
// Supabase Types
// ============================================

export type {
  // Database Schema
  Database,
  // User Profiles
  UserProfileRow,
  UserProfileInsert,
  UserProfileUpdate,
  // Transactions
  TransactionRow,
  TransactionInsert,
  TransactionUpdate,
  // Categories
  CategoryRow,
  CategoryInsert,
  CategoryUpdate,
  // Budgets
  BudgetRow,
  BudgetInsert,
  BudgetUpdate,
  // Function Returns
  CategorySpending,
  MonthlyTotal,
  // Query Options
  TransactionQueryOptions,
  // Client Types
  TypedSupabaseClient,
  // Realtime
  RealtimeTransactionPayload,
  RealtimeCategoryPayload,
  RealtimeBudgetPayload,
} from './supabase';

// ============================================
// AI/ML Types
// ============================================

export type {
  // Model Types
  InferenceBackend,
  ModelStatus,
  ModelConfig,
  // Embedding Types
  EmbeddingResult,
  BatchEmbeddingResult,
  // Search Types
  SearchResult,
  SearchResultMetadata,
  EnrichedSearchResult,
  TextHighlight,
  VectorIndexStats,
  SearchFilter,
  // Document Processing
  ProcessingStage,
  ExtractedEntities,
  ExtractedField,
  ProcessedDocument,
  FileMetadata,
  ProcessingProgress,
  ProcessingError,
  // Chat Types
  MessageRole,
  QueryIntent,
  ChatMessage,
  Citation,
  ChatResponse,
  VerifiedFinancialData,
  ChatSession,
  ChatContext,
  QuickQuery,
} from './ai';

export { DEFAULT_MODEL_CONFIG, DEFAULT_QUICK_QUERIES } from './ai';

// ============================================
// Sync Types
// ============================================

export type {
  // State Types
  SyncEngineState,
  SyncEngineStatus,
  // Result Types
  SyncResult,
  SyncError,
  SyncErrorCode,
  // Conflict Types
  ConflictResolution,
  SyncConflict,
  ConflictRecord,
  ConflictDiff,
  // Configuration
  SyncConfig,
  // Event Types
  SyncEventType,
  SyncEventBase,
  SyncStartEvent,
  SyncProgressEvent,
  SyncCompleteEvent,
  SyncErrorEvent,
  ConflictDetectedEvent,
  ConflictResolvedEvent,
  ConnectivityEvent,
  RecordSyncEvent,
  SyncEvent,
  // Queue Types
  SyncQueueEntry,
  // Realtime Types
  RealtimeStatus,
  RealtimeChange,
  // Health Types
  SyncHealthCheck,
  SyncHealthCheckItem,
} from './sync';

export { DEFAULT_SYNC_CONFIG } from './sync';

// ============================================
// UI Types
// ============================================

export type {
  // Transaction Components
  TransactionCardProps,
  TransactionListProps,
  TransactionEditorProps,
  TransactionFormValues,
  // Document Components
  DocumentCardProps,
  DocumentPreviewProps,
  DocumentGridProps,
  // Chat Components
  ChatMessageProps,
  ChatInputProps,
  QuickQueryOption,
  CitationPanelProps,
  // Filter & Sort
  TransactionSortOption,
  SortDirection,
  DateRangePreset,
  FilterOptions,
  FilterPanelProps,
  CategoryOption,
  // Dashboard Components
  BudgetCardProps,
  SpendingChartProps,
  ChartDataPoint,
  RecentTransactionsProps,
  // Anomaly Components
  AnomalyAlertProps,
  // Common Components
  SyncIndicatorProps,
  PrivacyBadgeProps,
  LoadingSpinnerProps,
  EmptyStateProps,
  // Modal Components
  BaseModalProps,
  ImportModalProps,
  ExportModalProps,
} from './ui';

export { DEFAULT_FILTER_OPTIONS } from './ui';

// ============================================
// Type Guards
// ============================================

/**
 * Type guard for checking if a value is a TransactionId.
 */
export function isTransactionId(
  value: unknown
): value is import('./database').TransactionId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard for checking if a value is a CategoryId.
 */
export function isCategoryId(
  value: unknown
): value is import('./database').CategoryId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard for sync status values.
 */
export function isSyncStatus(
  value: unknown
): value is import('./database').SyncStatus {
  return (
    typeof value === 'string' &&
    ['synced', 'pending', 'error', 'local-only'].includes(value)
  );
}

/**
 * Type guard for anomaly types.
 */
export function isAnomalyType(
  value: unknown
): value is import('./database').AnomalyType {
  return (
    typeof value === 'string' &&
    [
      'duplicate',
      'unusual_amount',
      'new_vendor',
      'price_increase',
      'duplicate_subscription',
    ].includes(value)
  );
}

/**
 * Type guard for processing stages.
 */
export function isProcessingStage(
  value: unknown
): value is import('./ai').ProcessingStage {
  return (
    typeof value === 'string' &&
    [
      'validating',
      'extracting',
      'ocr',
      'embedding',
      'saving',
      'indexing',
      'complete',
      'error',
    ].includes(value)
  );
}

// ============================================
// Utility Types
// ============================================

/**
 * Make specified keys required.
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make specified keys optional.
 */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

/**
 * Extract only the keys that have a specific value type.
 */
export type KeysOfType<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

/**
 * Deep partial type.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Async function return type.
 */
export type AsyncReturnType<
  T extends (...args: unknown[]) => Promise<unknown>,
> = T extends (...args: unknown[]) => Promise<infer R> ? R : never;
