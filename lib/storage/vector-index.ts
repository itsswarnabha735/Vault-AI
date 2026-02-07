/**
 * Vault-AI Vector Index Persistence
 *
 * Handles serialization and persistence of the vector index to IndexedDB.
 * Supports incremental updates and efficient loading.
 *
 * PRIVACY BOUNDARY:
 * The vector index contains embeddings that represent semantic content
 * of user documents. This data must NEVER be synced to the cloud.
 */

import Dexie, { type Table } from 'dexie';

import type { StoredVector, VectorMetadata } from './vector-search';

// ============================================
// Types
// ============================================

/**
 * Serialized vector for storage.
 */
interface SerializedVector {
  /** Unique identifier */
  id: string;
  /** Vector data as array (Float32Array not directly storable in IndexedDB) */
  vector: number[];
  /** Optional metadata */
  metadata?: VectorMetadata;
  /** Creation timestamp */
  createdAt: number;
  /** Last accessed timestamp */
  lastAccessedAt: number;
}

/**
 * Index metadata stored in IndexedDB.
 */
interface IndexMetadata {
  /** Fixed key for singleton metadata */
  id: 'metadata';
  /** Vector dimension */
  dimension: number | null;
  /** Last update timestamp */
  lastUpdatedAt: number | null;
  /** Version for migrations */
  version: number;
  /** Total vector count */
  vectorCount: number;
}

/**
 * Data structure for saving/loading the index.
 */
export interface VectorIndexData {
  vectors: Map<string, StoredVector>;
  dimension: number | null;
  lastUpdatedAt: number | null;
}

// ============================================
// IndexedDB Schema
// ============================================

/**
 * Dexie database for vector index storage.
 */
class VectorIndexDatabase extends Dexie {
  vectors!: Table<SerializedVector, string>;
  metadata!: Table<IndexMetadata, string>;

  constructor() {
    super('VaultAI_VectorIndex');

    this.version(1).stores({
      vectors: 'id, createdAt, lastAccessedAt',
      metadata: 'id',
    });
  }
}

// Singleton database instance
let db: VectorIndexDatabase | null = null;

/**
 * Get or create the database instance.
 */
function getDatabase(): VectorIndexDatabase {
  if (!db) {
    db = new VectorIndexDatabase();
  }
  return db;
}

// ============================================
// Serialization Helpers
// ============================================

/**
 * Serialize a StoredVector for IndexedDB storage.
 */
function serializeVector(stored: StoredVector): SerializedVector {
  return {
    id: stored.id,
    vector: Array.from(stored.vector),
    metadata: stored.metadata,
    createdAt: stored.createdAt,
    lastAccessedAt: stored.lastAccessedAt,
  };
}

/**
 * Deserialize a vector from IndexedDB.
 */
function deserializeVector(serialized: SerializedVector): StoredVector {
  return {
    id: serialized.id,
    vector: new Float32Array(serialized.vector),
    metadata: serialized.metadata,
    createdAt: serialized.createdAt,
    lastAccessedAt: serialized.lastAccessedAt,
  };
}

// ============================================
// Persistence Functions
// ============================================

/**
 * Save the entire vector index to IndexedDB.
 */
export async function saveVectorIndex(data: VectorIndexData): Promise<void> {
  const database = getDatabase();

  try {
    await database.transaction(
      'rw',
      [database.vectors, database.metadata],
      async () => {
        // Clear existing vectors
        await database.vectors.clear();

        // Serialize and save all vectors
        const serializedVectors: SerializedVector[] = [];
        for (const stored of data.vectors.values()) {
          serializedVectors.push(serializeVector(stored));
        }

        // Bulk add for efficiency
        if (serializedVectors.length > 0) {
          await database.vectors.bulkAdd(serializedVectors);
        }

        // Save metadata
        const metadata: IndexMetadata = {
          id: 'metadata',
          dimension: data.dimension,
          lastUpdatedAt: data.lastUpdatedAt,
          version: 1,
          vectorCount: data.vectors.size,
        };
        await database.metadata.put(metadata);
      }
    );
  } catch (error) {
    console.error('Failed to save vector index:', error);
    throw error;
  }
}

/**
 * Load the vector index from IndexedDB.
 */
export async function loadVectorIndex(): Promise<VectorIndexData | null> {
  const database = getDatabase();

  try {
    // Check if metadata exists
    const metadata = await database.metadata.get('metadata');
    if (!metadata) {
      return null;
    }

    // Load all vectors
    const serializedVectors = await database.vectors.toArray();

    // Deserialize vectors
    const vectors = new Map<string, StoredVector>();
    for (const serialized of serializedVectors) {
      vectors.set(serialized.id, deserializeVector(serialized));
    }

    return {
      vectors,
      dimension: metadata.dimension,
      lastUpdatedAt: metadata.lastUpdatedAt,
    };
  } catch (error) {
    console.error('Failed to load vector index:', error);
    return null;
  }
}

/**
 * Clear the entire vector index from IndexedDB.
 */
export async function clearVectorIndex(): Promise<void> {
  const database = getDatabase();

  try {
    await database.transaction(
      'rw',
      [database.vectors, database.metadata],
      async () => {
        await database.vectors.clear();
        await database.metadata.clear();
      }
    );
  } catch (error) {
    console.error('Failed to clear vector index:', error);
    throw error;
  }
}

// ============================================
// Incremental Updates
// ============================================

/**
 * Add or update a single vector.
 */
export async function saveVector(stored: StoredVector): Promise<void> {
  const database = getDatabase();

  try {
    await database.vectors.put(serializeVector(stored));

    // Update metadata
    const metadata = await database.metadata.get('metadata');
    if (metadata) {
      metadata.lastUpdatedAt = Date.now();
      metadata.vectorCount = await database.vectors.count();
      await database.metadata.put(metadata);
    }
  } catch (error) {
    console.error('Failed to save vector:', error);
    throw error;
  }
}

/**
 * Add multiple vectors in batch.
 */
export async function saveVectors(vectors: StoredVector[]): Promise<void> {
  const database = getDatabase();

  try {
    const serialized = vectors.map(serializeVector);
    await database.vectors.bulkPut(serialized);

    // Update metadata
    const metadata = await database.metadata.get('metadata');
    if (metadata) {
      metadata.lastUpdatedAt = Date.now();
      metadata.vectorCount = await database.vectors.count();
      await database.metadata.put(metadata);
    }
  } catch (error) {
    console.error('Failed to save vectors:', error);
    throw error;
  }
}

/**
 * Remove a vector by ID.
 */
export async function deleteVector(id: string): Promise<void> {
  const database = getDatabase();

  try {
    await database.vectors.delete(id);

    // Update metadata
    const metadata = await database.metadata.get('metadata');
    if (metadata) {
      metadata.lastUpdatedAt = Date.now();
      metadata.vectorCount = await database.vectors.count();
      await database.metadata.put(metadata);
    }
  } catch (error) {
    console.error('Failed to delete vector:', error);
    throw error;
  }
}

/**
 * Remove multiple vectors by ID.
 */
export async function deleteVectors(ids: string[]): Promise<void> {
  const database = getDatabase();

  try {
    await database.vectors.bulkDelete(ids);

    // Update metadata
    const metadata = await database.metadata.get('metadata');
    if (metadata) {
      metadata.lastUpdatedAt = Date.now();
      metadata.vectorCount = await database.vectors.count();
      await database.metadata.put(metadata);
    }
  } catch (error) {
    console.error('Failed to delete vectors:', error);
    throw error;
  }
}

/**
 * Get a single vector by ID.
 */
export async function getVector(id: string): Promise<StoredVector | null> {
  const database = getDatabase();

  try {
    const serialized = await database.vectors.get(id);
    if (!serialized) {
      return null;
    }
    return deserializeVector(serialized);
  } catch (error) {
    console.error('Failed to get vector:', error);
    return null;
  }
}

/**
 * Check if a vector exists.
 */
export async function vectorExists(id: string): Promise<boolean> {
  const database = getDatabase();

  try {
    const count = await database.vectors.where('id').equals(id).count();
    return count > 0;
  } catch (error) {
    console.error('Failed to check vector existence:', error);
    return false;
  }
}

// ============================================
// Index Statistics
// ============================================

/**
 * Get index statistics.
 */
export async function getIndexStats(): Promise<{
  vectorCount: number;
  dimension: number | null;
  lastUpdatedAt: number | null;
  storageSizeBytes: number;
} | null> {
  const database = getDatabase();

  try {
    const metadata = await database.metadata.get('metadata');
    if (!metadata) {
      return null;
    }

    // Estimate storage size
    const vectorCount = await database.vectors.count();
    const dimension = metadata.dimension ?? 0;
    const estimatedSize = vectorCount * dimension * 4 + vectorCount * 200;

    return {
      vectorCount,
      dimension: metadata.dimension,
      lastUpdatedAt: metadata.lastUpdatedAt,
      storageSizeBytes: estimatedSize,
    };
  } catch (error) {
    console.error('Failed to get index stats:', error);
    return null;
  }
}

// ============================================
// Maintenance Functions
// ============================================

/**
 * Compact the index by removing old/unused vectors.
 */
export async function compactIndex(
  maxAge?: number,
  maxVectors?: number
): Promise<number> {
  const database = getDatabase();
  let deleted = 0;

  try {
    // Delete by age if specified
    if (maxAge) {
      const cutoff = Date.now() - maxAge;
      const oldVectors = await database.vectors
        .where('lastAccessedAt')
        .below(cutoff)
        .primaryKeys();

      if (oldVectors.length > 0) {
        await database.vectors.bulkDelete(oldVectors);
        deleted += oldVectors.length;
      }
    }

    // Delete excess vectors if specified (keep most recently accessed)
    if (maxVectors) {
      const count = await database.vectors.count();
      if (count > maxVectors) {
        const excess = count - maxVectors;
        const oldestVectors = await database.vectors
          .orderBy('lastAccessedAt')
          .limit(excess)
          .primaryKeys();

        if (oldestVectors.length > 0) {
          await database.vectors.bulkDelete(oldestVectors);
          deleted += oldestVectors.length;
        }
      }
    }

    // Update metadata
    if (deleted > 0) {
      const metadata = await database.metadata.get('metadata');
      if (metadata) {
        metadata.lastUpdatedAt = Date.now();
        metadata.vectorCount = await database.vectors.count();
        await database.metadata.put(metadata);
      }
    }

    return deleted;
  } catch (error) {
    console.error('Failed to compact index:', error);
    return 0;
  }
}

/**
 * Initialize metadata if it doesn't exist.
 */
export async function initializeMetadata(dimension: number): Promise<void> {
  const database = getDatabase();

  try {
    const existing = await database.metadata.get('metadata');
    if (!existing) {
      await database.metadata.add({
        id: 'metadata',
        dimension,
        lastUpdatedAt: Date.now(),
        version: 1,
        vectorCount: 0,
      });
    }
  } catch (error) {
    console.error('Failed to initialize metadata:', error);
    throw error;
  }
}

/**
 * Update the dimension in metadata.
 */
export async function updateDimension(dimension: number): Promise<void> {
  const database = getDatabase();

  try {
    const metadata = await database.metadata.get('metadata');
    if (metadata) {
      metadata.dimension = dimension;
      await database.metadata.put(metadata);
    } else {
      await initializeMetadata(dimension);
    }
  } catch (error) {
    console.error('Failed to update dimension:', error);
    throw error;
  }
}

// ============================================
// Database Management
// ============================================

/**
 * Check if the vector index database exists.
 */
export async function databaseExists(): Promise<boolean> {
  try {
    const databases = await indexedDB.databases?.();
    if (databases) {
      return databases.some((db) => db.name === 'VaultAI_VectorIndex');
    }
    // Fallback for browsers without databases() support
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete the entire vector index database.
 */
export async function deleteDatabase(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('VaultAI_VectorIndex');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn('Database deletion blocked - other tabs may have it open');
      resolve();
    };
  });
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
