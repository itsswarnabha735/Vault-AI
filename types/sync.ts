/**
 * Synchronization Types for Vault-AI
 *
 * Types related to the sync engine, conflict resolution,
 * and cloud synchronization state management.
 */

import type { TransactionId, CategoryId, BudgetId } from './database';

// ============================================
// Sync State
// ============================================

/**
 * Overall sync engine state.
 */
export type SyncEngineState =
  | 'idle'
  | 'syncing'
  | 'paused'
  | 'offline'
  | 'error';

/**
 * Current sync status of the engine.
 */
export interface SyncEngineStatus {
  /** Current engine state */
  state: SyncEngineState;

  /** Last successful sync timestamp */
  lastSyncAt: Date | null;

  /** Number of pending changes to upload */
  pendingChanges: number;

  /** Number of failed changes */
  failedChanges: number;

  /** Whether currently online */
  isOnline: boolean;

  /** Current sync progress (0-100) if syncing */
  syncProgress: number | null;

  /** Current sync operation description */
  currentOperation: string | null;
}

// ============================================
// Sync Result
// ============================================

/**
 * Result of a sync operation.
 */
export interface SyncResult {
  /** Whether sync completed successfully */
  success: boolean;

  /** Number of records uploaded */
  uploaded: number;

  /** Number of records downloaded */
  downloaded: number;

  /** Number of conflicts detected */
  conflicts: number;

  /** Number of conflicts auto-resolved */
  autoResolvedConflicts: number;

  /** Errors encountered */
  errors: SyncError[];

  /** Total sync duration in milliseconds */
  durationMs: number;

  /** Timestamp of sync completion */
  completedAt: Date;
}

/**
 * Sync error details.
 */
export interface SyncError {
  /** Error code */
  code: SyncErrorCode;

  /** Human-readable message */
  message: string;

  /** Affected record ID (if applicable) */
  recordId?: string;

  /** Record type */
  recordType?: 'transaction' | 'category' | 'budget';

  /** Whether error is recoverable with retry */
  recoverable: boolean;

  /** Retry count for this error */
  retryCount: number;

  /** Suggested action */
  suggestion?: string;
}

/**
 * Sync error codes.
 */
export type SyncErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'QUOTA_EXCEEDED'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

// ============================================
// Sync Conflict
// ============================================

/**
 * Conflict resolution strategies.
 */
export type ConflictResolution = 'local' | 'remote' | 'manual' | 'merge';

/**
 * Sync conflict requiring resolution.
 */
export interface SyncConflict {
  /** Unique conflict identifier */
  id: string;

  /** Record ID with conflict */
  recordId: TransactionId | CategoryId | BudgetId;

  /** Record type */
  recordType: 'transaction' | 'category' | 'budget';

  /** Local version of the record */
  localVersion: ConflictRecord;

  /** Remote (cloud) version of the record */
  remoteVersion: ConflictRecord;

  /** When conflict was detected */
  detectedAt: Date;

  /** Conflict resolution status */
  status: 'pending' | 'resolved' | 'ignored';

  /** How conflict was resolved (if resolved) */
  resolution?: ConflictResolution;

  /** Who/what resolved it */
  resolvedBy?: 'user' | 'auto';

  /** Resolution timestamp */
  resolvedAt?: Date;
}

/**
 * Record data for conflict comparison.
 */
export interface ConflictRecord {
  /** Key-value pairs of record fields */
  data: Record<string, unknown>;

  /** Last update timestamp */
  updatedAt: Date;

  /** Update source */
  source: 'local' | 'remote';
}

/**
 * Field-level diff for conflict visualization.
 */
export interface ConflictDiff {
  /** Field name */
  field: string;

  /** Local value */
  localValue: unknown;

  /** Remote value */
  remoteValue: unknown;

  /** Whether values differ */
  isDifferent: boolean;
}

// ============================================
// Sync Configuration
// ============================================

/**
 * Sync engine configuration.
 */
export interface SyncConfig {
  /** Whether sync is enabled */
  enabled: boolean;

  /** Sync interval in milliseconds (when idle) */
  syncIntervalMs: number;

  /** Maximum records per sync batch */
  batchSize: number;

  /** Maximum retry attempts per record */
  maxRetries: number;

  /** Retry delay base (for exponential backoff) */
  retryDelayBaseMs: number;

  /** Maximum retry delay */
  maxRetryDelayMs: number;

  /** Whether to auto-resolve conflicts */
  autoResolveConflicts: boolean;

  /** Default resolution strategy for auto-resolve */
  defaultResolution: ConflictResolution;

  /** Whether to sync over metered connections */
  syncOnMetered: boolean;

  /** Minimum battery level to sync (0-100) */
  minBatteryLevel: number;
}

/**
 * Default sync configuration.
 */
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enabled: true,
  syncIntervalMs: 30000, // 30 seconds
  batchSize: 100,
  maxRetries: 3,
  retryDelayBaseMs: 1000,
  maxRetryDelayMs: 30000,
  autoResolveConflicts: true,
  defaultResolution: 'local', // Last write wins, prefer local
  syncOnMetered: true,
  minBatteryLevel: 15,
} as const;

// ============================================
// Sync Events
// ============================================

/**
 * Sync event types.
 */
export type SyncEventType =
  | 'sync_start'
  | 'sync_progress'
  | 'sync_complete'
  | 'sync_error'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'online'
  | 'offline'
  | 'record_uploaded'
  | 'record_downloaded';

/**
 * Base sync event.
 */
export interface SyncEventBase {
  /** Event type */
  type: SyncEventType;

  /** Event timestamp */
  timestamp: Date;
}

/**
 * Sync start event.
 */
export interface SyncStartEvent extends SyncEventBase {
  type: 'sync_start';
  pendingCount: number;
}

/**
 * Sync progress event.
 */
export interface SyncProgressEvent extends SyncEventBase {
  type: 'sync_progress';
  progress: number;
  currentOperation: string;
  processedCount: number;
  totalCount: number;
}

/**
 * Sync complete event.
 */
export interface SyncCompleteEvent extends SyncEventBase {
  type: 'sync_complete';
  result: SyncResult;
}

/**
 * Sync error event.
 */
export interface SyncErrorEvent extends SyncEventBase {
  type: 'sync_error';
  error: SyncError;
}

/**
 * Conflict detected event.
 */
export interface ConflictDetectedEvent extends SyncEventBase {
  type: 'conflict_detected';
  conflict: SyncConflict;
}

/**
 * Conflict resolved event.
 */
export interface ConflictResolvedEvent extends SyncEventBase {
  type: 'conflict_resolved';
  conflictId: string;
  resolution: ConflictResolution;
}

/**
 * Online/offline status event.
 */
export interface ConnectivityEvent extends SyncEventBase {
  type: 'online' | 'offline';
}

/**
 * Record sync event.
 */
export interface RecordSyncEvent extends SyncEventBase {
  type: 'record_uploaded' | 'record_downloaded';
  recordId: string;
  recordType: 'transaction' | 'category' | 'budget';
}

/**
 * Union type for all sync events.
 */
export type SyncEvent =
  | SyncStartEvent
  | SyncProgressEvent
  | SyncCompleteEvent
  | SyncErrorEvent
  | ConflictDetectedEvent
  | ConflictResolvedEvent
  | ConnectivityEvent
  | RecordSyncEvent;

// ============================================
// Sync Queue
// ============================================

/**
 * Sync queue entry for pending operations.
 */
export interface SyncQueueEntry {
  /** Unique queue entry ID */
  id: string;

  /** Record ID to sync */
  recordId: string;

  /** Record type */
  recordType: 'transaction' | 'category' | 'budget';

  /** Operation type */
  operation: 'create' | 'update' | 'delete';

  /** Data to sync (for create/update) */
  data: Record<string, unknown> | null;

  /** Number of retry attempts */
  retryCount: number;

  /** Last error (if any) */
  lastError: SyncError | null;

  /** Entry created timestamp */
  createdAt: Date;

  /** Last attempt timestamp */
  lastAttemptAt: Date | null;

  /** Next scheduled attempt */
  nextAttemptAt: Date;
}

// ============================================
// Real-time Sync
// ============================================

/**
 * Real-time subscription status.
 */
export interface RealtimeStatus {
  /** Whether subscription is active */
  connected: boolean;

  /** Current channel name */
  channel: string | null;

  /** Last received event timestamp */
  lastEventAt: Date | null;

  /** Reconnection attempts */
  reconnectAttempts: number;

  /** Error message if disconnected */
  error: string | null;
}

/**
 * Real-time change payload.
 */
export interface RealtimeChange<T = unknown> {
  /** Change type */
  type: 'INSERT' | 'UPDATE' | 'DELETE';

  /** Table name */
  table: string;

  /** New record data (for INSERT/UPDATE) */
  new: T | null;

  /** Old record data (for UPDATE/DELETE) */
  old: T | null;

  /** Server timestamp */
  commitTimestamp: string;
}

// ============================================
// Sync Health
// ============================================

/**
 * Sync health check result.
 */
export interface SyncHealthCheck {
  /** Overall health status */
  healthy: boolean;

  /** Individual check results */
  checks: SyncHealthCheckItem[];

  /** Recommendations for issues */
  recommendations: string[];

  /** Check timestamp */
  checkedAt: Date;
}

/**
 * Individual health check item.
 */
export interface SyncHealthCheckItem {
  /** Check name */
  name: string;

  /** Check status */
  status: 'pass' | 'warn' | 'fail';

  /** Status message */
  message: string;

  /** Metric value (if applicable) */
  value?: number | string;

  /** Expected value (if applicable) */
  expected?: number | string;
}
