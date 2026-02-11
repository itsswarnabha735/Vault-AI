/**
 * Local Database Types for Vault-AI
 *
 * These types define the structure of data stored in IndexedDB via Dexie.js.
 * CRITICAL: Data in these structures contains sensitive information that
 * MUST NEVER be transmitted to any server.
 */

// ============================================
// Branded Types for Type Safety
// ============================================

/** Unique identifier for transactions */
export type TransactionId = string & { readonly __brand: 'TransactionId' };

/** Unique identifier for categories */
export type CategoryId = string & { readonly __brand: 'CategoryId' };

/** Unique identifier for budgets */
export type BudgetId = string & { readonly __brand: 'BudgetId' };

/** Unique identifier for documents */
export type DocumentId = string & { readonly __brand: 'DocumentId' };

/** Unique identifier for users */
export type UserId = string & { readonly __brand: 'UserId' };

/** Unique identifier for search queries */
export type SearchQueryId = string & { readonly __brand: 'SearchQueryId' };

/** Unique identifier for anomaly alerts */
export type AnomalyAlertId = string & { readonly __brand: 'AnomalyAlertId' };

// ============================================
// Helper Functions for Branded Types
// ============================================

export function createTransactionId(id: string): TransactionId {
  return id as TransactionId;
}

export function createCategoryId(id: string): CategoryId {
  return id as CategoryId;
}

export function createBudgetId(id: string): BudgetId {
  return id as BudgetId;
}

export function createDocumentId(id: string): DocumentId {
  return id as DocumentId;
}

export function createUserId(id: string): UserId {
  return id as UserId;
}

// ============================================
// Sync Status Types
// ============================================

/**
 * Synchronization status for local records
 */
export type SyncStatus = 'synced' | 'pending' | 'error' | 'local-only';

// ============================================
// Local Transaction
// ============================================

/**
 * Full local transaction with privacy-sensitive fields.
 *
 * PRIVACY BOUNDARY:
 * - rawText, embedding, filePath: NEVER transmitted to cloud
 * - Only structured fields (date, amount, vendor, category, note) sync to cloud
 */
export interface LocalTransaction {
  /** Unique identifier (UUID) */
  id: TransactionId;

  // ============================================
  // Privacy-Sensitive Fields (NEVER SYNC)
  // ============================================

  /** Full OCR/extracted text from document */
  rawText: string;

  /** 384-dimensional vector embedding for semantic search */
  embedding: Float32Array;

  /** OPFS file reference path */
  filePath: string;

  /** Original file size in bytes */
  fileSize: number;

  /** File MIME type (application/pdf, image/png, etc.) */
  mimeType: string;

  // ============================================
  // Structured Fields (Synced to Cloud)
  // ============================================

  /** Transaction date in ISO 8601 format (YYYY-MM-DD) */
  date: string;

  /** Transaction amount (positive for expenses, negative for income) */
  amount: number;

  /** Vendor/merchant name */
  vendor: string;

  /** Category ID reference */
  category: CategoryId | null;

  /** User-added notes */
  note: string;

  /** Currency code (ISO 4217) */
  currency: string;

  // ============================================
  // Metadata Fields
  // ============================================

  /**
   * Transaction type: debit (outgoing) or credit (incoming).
   *
   * This field is persisted so that income/expense classification
   * does not rely solely on the sign of `amount`. Older transactions
   * imported before this field existed may have `null`; in that case
   * the chat service falls back to the amount-sign convention
   * (positive = expense, negative = income).
   */
  transactionType: 'debit' | 'credit' | null;

  /** Extraction confidence score (0-1) */
  confidence: number;

  /** Whether user has manually edited the extraction */
  isManuallyEdited: boolean;

  /** Record creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;

  // ============================================
  // Sync State Fields
  // ============================================

  /** Current synchronization status */
  syncStatus: SyncStatus;

  /** Timestamp of last sync attempt */
  lastSyncAttempt: Date | null;

  /** Error message from last failed sync */
  syncError: string | null;
}

/**
 * Fields that are safe to sync to the cloud.
 * This is a strict whitelist - ONLY these fields should ever leave the device.
 */
export interface SyncableTransactionFields {
  id: TransactionId;
  date: string;
  amount: number;
  vendor: string;
  category: CategoryId | null;
  note: string;
  currency: string;
  clientCreatedAt: Date;
  clientUpdatedAt: Date;
}

/**
 * Fields that must NEVER be synced to the cloud.
 */
export const NEVER_SYNC_FIELDS = [
  'rawText',
  'embedding',
  'filePath',
  'fileSize',
  'mimeType',
  'confidence',
  'ocrOutput',
] as const;

export type NeverSyncField = (typeof NEVER_SYNC_FIELDS)[number];

// ============================================
// Category
// ============================================

/**
 * Category definition for transaction classification.
 */
export interface Category {
  /** Unique identifier */
  id: CategoryId;

  /** User who owns this category */
  userId: UserId;

  /** Category display name */
  name: string;

  /** Icon identifier (emoji or icon name) */
  icon: string;

  /** Color hex code for UI display */
  color: string;

  /** Parent category ID for nested categories */
  parentId: CategoryId | null;

  /** Sort order for display */
  sortOrder: number;

  /** Whether this is a system default category */
  isDefault: boolean;

  /** Record creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Default categories provided to new users.
 * Derived from the Category Registry (single source of truth).
 *
 * @see lib/categories/category-registry.ts
 */
import { getDefaultCategorySeeds } from '@/lib/categories/category-registry';

export const DEFAULT_CATEGORIES: ReadonlyArray<
  Omit<Category, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
> = getDefaultCategorySeeds();

// ============================================
// Budget
// ============================================

/**
 * Budget period types.
 */
export type BudgetPeriod = 'weekly' | 'monthly' | 'yearly';

/**
 * Budget configuration for spending limits.
 */
export interface Budget {
  /** Unique identifier */
  id: BudgetId;

  /** User who owns this budget */
  userId: UserId;

  /** Category this budget applies to (null for total budget) */
  categoryId: CategoryId | null;

  /** Budget limit amount */
  amount: number;

  /** Budget period */
  period: BudgetPeriod;

  /** Start date for this budget (ISO 8601) */
  startDate: string;

  /** Whether this budget is currently active */
  isActive: boolean;

  /** Record creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Calculated budget status with spending information.
 */
export interface BudgetStatus {
  /** The budget configuration */
  budget: Budget;

  /** Amount spent in current period */
  spent: number;

  /** Remaining amount in budget */
  remaining: number;

  /** Percentage of budget used (0-100+) */
  percentUsed: number;

  /** Whether budget is exceeded */
  isExceeded: boolean;

  /** Days remaining in current period */
  daysRemaining: number;

  /** Average daily spend to stay on budget */
  dailyAllowance: number;
}

// ============================================
// Search Query
// ============================================

/**
 * Search history entry for personalization and improvement.
 */
export interface SearchQuery {
  /** Unique identifier */
  id: SearchQueryId;

  /** User who performed the search */
  userId: UserId;

  /** Search query text */
  query: string;

  /** Query embedding vector */
  queryEmbedding: Float32Array | null;

  /** Number of results returned */
  resultCount: number;

  /** IDs of results shown to user */
  resultIds: TransactionId[];

  /** ID of result user clicked/selected (null if none) */
  selectedResultId: TransactionId | null;

  /** Search timestamp */
  timestamp: Date;

  /** Time taken for search in milliseconds */
  searchDurationMs: number;
}

// ============================================
// Anomaly Alert
// ============================================

/**
 * Types of anomalies the system can detect.
 */
export type AnomalyType =
  | 'duplicate'
  | 'unusual_amount'
  | 'new_vendor'
  | 'price_increase'
  | 'duplicate_subscription';

/**
 * Severity levels for anomaly alerts.
 */
export type AnomalySeverity = 'low' | 'medium' | 'high';

/**
 * User action on anomaly alert.
 */
export type AnomalyUserAction = 'confirmed' | 'dismissed' | null;

/**
 * Anomaly alert for potential issues with transactions.
 */
export interface AnomalyAlert {
  /** Unique identifier */
  id: AnomalyAlertId;

  /** Transaction that triggered the alert */
  transactionId: TransactionId;

  /** Related transaction IDs (e.g., the original in a duplicate) */
  relatedTransactionIds: TransactionId[];

  /** Type of anomaly detected */
  type: AnomalyType;

  /** Severity level */
  severity: AnomalySeverity;

  /** Human-readable description of the anomaly */
  message: string;

  /** Additional details about the anomaly */
  details: AnomalyDetails;

  /** Whether this alert has been resolved */
  isResolved: boolean;

  /** User's action on this alert */
  userAction: AnomalyUserAction;

  /** Alert creation timestamp */
  createdAt: Date;

  /** Resolution timestamp */
  resolvedAt: Date | null;
}

/**
 * Additional details for different anomaly types.
 */
export interface AnomalyDetails {
  /** For duplicate: similarity score */
  similarityScore?: number;

  /** For unusual_amount: expected amount range */
  expectedRange?: { min: number; max: number };

  /** For unusual_amount: actual amount */
  actualAmount?: number;

  /** For price_increase: percentage increase */
  percentageIncrease?: number;

  /** For price_increase: previous amount */
  previousAmount?: number;

  /** For new_vendor: is this truly new or similar to existing */
  similarVendors?: string[];
}

// ============================================
// Raw Document Storage
// ============================================

/**
 * Raw document metadata stored alongside OPFS file.
 */
export interface RawDocument {
  /** Unique identifier (matches TransactionId) */
  id: DocumentId;

  /** Associated transaction ID */
  transactionId: TransactionId;

  /** OPFS file path */
  filePath: string;

  /** Original filename */
  originalFileName: string;

  /** MIME type */
  mimeType: string;

  /** File size in bytes */
  fileSize: number;

  /** Number of pages (for PDFs) */
  pageCount: number | null;

  /** Whether OCR was performed */
  ocrPerformed: boolean;

  /** Document import timestamp */
  importedAt: Date;
}

// ============================================
// User Preferences
// ============================================

/**
 * Theme options.
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * User preferences stored locally.
 */
export interface UserPreferences {
  /** User ID */
  userId: UserId;

  /** UI theme */
  theme: Theme;

  /** Default currency code */
  defaultCurrency: string;

  /** User's timezone */
  timezone: string;

  /** Whether cloud sync is enabled */
  syncEnabled: boolean;

  /** Whether analytics are enabled */
  analyticsEnabled: boolean;

  /** Date format preference */
  dateFormat: string;

  /** Number format locale */
  numberLocale: string;

  /** Last updated timestamp */
  updatedAt: Date;
}

// ============================================
// Database Schema Definition
// ============================================

/**
 * IndexedDB schema definition for Dexie.js.
 * This maps to the stores() configuration.
 */
export interface VaultDatabaseSchema {
  transactions: LocalTransaction;
  categories: Category;
  budgets: Budget;
  searchHistory: SearchQuery;
  anomalies: AnomalyAlert;
  documents: RawDocument;
  preferences: UserPreferences;
}

/**
 * Index definitions for each table.
 */
export const DATABASE_INDEXES = {
  transactions: 'id, date, vendor, category, syncStatus, createdAt',
  categories: 'id, userId, parentId, isDefault',
  budgets: 'id, userId, categoryId, isActive',
  searchHistory: 'id, userId, timestamp',
  anomalies: 'id, transactionId, isResolved, createdAt',
  documents: 'id, transactionId',
  preferences: 'userId',
  settings: 'id',
} as const;

// ============================================
// User Settings
// ============================================

/**
 * User settings stored locally in IndexedDB.
 * These are user preferences that control app behavior.
 */
export interface UserSettings {
  /** Unique identifier (usually 'default' or user ID) */
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

  /** Date format preference (date-fns format) */
  dateFormat: string;

  /** Number locale for formatting */
  numberLocale: string;

  /** Last updated timestamp */
  updatedAt: Date;
}

/**
 * Default user settings.
 */
export const DEFAULT_USER_SETTINGS: Omit<UserSettings, 'id' | 'updatedAt'> = {
  userId: null,
  theme: 'system',
  defaultCurrency: 'INR',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
  syncEnabled: true,
  anomalyDetectionEnabled: true,
  anomalyThreshold: 20,
  dateFormat: 'yyyy-MM-dd',
  numberLocale: 'en-IN',
};
