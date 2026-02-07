/**
 * Sync Module for Vault-AI
 *
 * This module provides synchronization functionality between
 * the local IndexedDB database and the Supabase cloud backend.
 *
 * PRIVACY CRITICAL:
 * - Only sanitized accounting data (id, date, amount, vendor, category, note) syncs to cloud
 * - Raw text, embeddings, and file paths NEVER leave the device
 * - Use sanitizeForSync() before any network transmission
 *
 * @module lib/sync
 */

// ============================================
// Sync Engine
// ============================================

export {
  // Main engine functions
  getSyncEngine,
  createSyncEngine,

  // Privacy filter functions
  sanitizeForSync,
  verifySafePayload,

  // Types
  type SyncEngine,
  type SyncableTransaction,
  type Unsubscribe,
} from './sync-engine';

// ============================================
// Sync State Machine
// ============================================

export {
  // State machine class
  SyncStateMachine,
  createSyncStateMachine,

  // Utility functions
  isValidTransition,
  getNextState,
  getValidTriggers,

  // Types
  type StateTransition,
  type SyncTrigger,
  type SyncStateContext,
  type StateChangeListener,
} from './sync-state';

// ============================================
// Re-export Types from types/sync.ts
// ============================================

export type {
  // State types
  SyncEngineState,
  SyncEngineStatus,

  // Result types
  SyncResult,
  SyncError,
  SyncErrorCode,

  // Conflict types
  SyncConflict,
  ConflictResolution,
  ConflictRecord,
  ConflictDiff,

  // Configuration
  SyncConfig,

  // Events
  SyncEvent,
  SyncEventType,
  SyncStartEvent,
  SyncProgressEvent,
  SyncCompleteEvent,
  SyncErrorEvent,
  ConflictDetectedEvent,
  ConflictResolvedEvent,
  ConnectivityEvent,
  RecordSyncEvent,

  // Queue
  SyncQueueEntry,

  // Real-time
  RealtimeStatus,
  RealtimeChange,

  // Health check
  SyncHealthCheck,
  SyncHealthCheckItem,
} from '@/types/sync';

// ============================================
// Real-time Subscriptions
// ============================================

export {
  // Main manager functions
  getRealtimeManager,
  createRealtimeManager,

  // Classes
  RealtimeManagerImpl,

  // Types
  type RealtimeManager,
  type ConnectionState,
  type RealtimeEventType,
  type ChangeHandler,
  type ConnectionChangeHandler,
} from './realtime';

// ============================================
// Conflict Resolution
// ============================================

export {
  // Main resolver functions
  getConflictResolver,
  createConflictResolver,

  // Utility functions
  formatVersion,
  getFieldDisplayName,
  formatFieldValue,
  getDifferenceDescription,

  // Classes
  ConflictResolverImpl,

  // Constants
  DEFAULT_CONFLICT_CONFIG,

  // Types
  type ConflictResolver,
  type TransactionVersion,
  type ConflictType,
  type DetailedConflict,
  type AutoResolveStrategy,
  type ConflictResolverConfig,
  type ConflictChangeListener,
} from './conflict-resolver';

// ============================================
// Default Configuration
// ============================================

export { DEFAULT_SYNC_CONFIG } from '@/types/sync';
