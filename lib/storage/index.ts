/**
 * Storage Module Exports
 *
 * Re-exports all storage-related services and types for easy importing.
 */

// Database
export { db, VaultDatabase, type UserSettings } from './db';

// Re-export types from database
export type {
  LocalTransaction,
  Category,
  Budget,
  SearchQuery,
  AnomalyAlert,
} from './db';

// Migrations
export {
  MigrationHelper,
  createMigrationHelper,
  deleteDatabase,
  databaseExists,
  MIGRATIONS,
  CURRENT_VERSION,
  dataMigrations,
  type MigrationVersion,
  type MigrationResult,
  type ValidationResult,
} from './migrations';

// OPFS (Origin Private File System)
export {
  opfsService,
  isOPFSSupported,
  formatBytes,
  getSupportedMimeTypes,
  isFileTypeSupported,
  OPFSError,
  type OPFSService,
  type OPFSStatus,
  type OPFSErrorCode,
  type StorageStats,
  type SavedFileInfo,
} from './opfs';

// Vector Search
export {
  // Service
  vectorSearchService,
  createVectorSearchService,
  // Core algorithms
  cosineSimilarity,
  normalizeVector,
  bruteForceSearch,
  // LSH Index
  LSHIndex,
  // LRU Cache
  LRUCache,
  // Utilities
  toFloat32Array,
  getEmbeddingDimension,
  // Types
  type VectorSearchService,
  type VectorSearchConfig,
  type VectorMetadata,
  type StoredVector,
  type SearchResult,
  type IndexStats,
  type FilterFn,
  DEFAULT_CONFIG as VECTOR_SEARCH_DEFAULT_CONFIG,
} from './vector-search';

// Vector Index Persistence
export {
  // Persistence functions
  saveVectorIndex,
  loadVectorIndex,
  clearVectorIndex,
  // Incremental updates
  saveVector,
  saveVectors,
  deleteVector,
  deleteVectors,
  getVector as getPersistedVector,
  vectorExists,
  // Statistics
  getIndexStats,
  // Maintenance
  compactIndex,
  initializeMetadata,
  updateDimension,
  // Database management
  databaseExists as vectorDatabaseExists,
  deleteDatabase as deleteVectorDatabase,
  closeDatabase as closeVectorDatabase,
  // Types
  type VectorIndexData,
} from './vector-index';
