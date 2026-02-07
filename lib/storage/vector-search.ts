/**
 * Vault-AI Vector Search Service
 *
 * Provides local semantic search capabilities using vector embeddings.
 * All vectors are stored locally and NEVER transmitted to external servers.
 *
 * PRIVACY BOUNDARY:
 * Embeddings contain semantic information about user documents
 * and must NEVER be synced to the cloud.
 *
 * Performance Targets:
 * - <50ms search for 1000 vectors
 * - Efficient memory usage with LRU caching
 * - Web Worker offloading for large indices
 */

// ============================================
// Types
// ============================================

/**
 * Metadata that can be attached to vectors.
 */
export type VectorMetadata = Record<string, unknown>;

/**
 * A stored vector with its metadata.
 */
export interface StoredVector {
  /** Unique identifier for this vector */
  id: string;
  /** The embedding vector */
  vector: Float32Array;
  /** Optional metadata */
  metadata?: VectorMetadata;
  /** When the vector was added */
  createdAt: number;
  /** When the vector was last accessed (for LRU) */
  lastAccessedAt: number;
}

/**
 * Search result with relevance score.
 */
export interface SearchResult {
  /** Vector ID */
  id: string;
  /** Similarity score (0-1, higher is better) */
  score: number;
  /** Associated metadata */
  metadata?: VectorMetadata;
}

/**
 * Index statistics.
 */
export interface IndexStats {
  /** Total number of vectors */
  vectorCount: number;
  /** Dimension of vectors */
  dimension: number | null;
  /** Approximate memory usage in bytes */
  memoryBytes: number;
  /** Whether the index is initialized */
  isInitialized: boolean;
  /** Whether using approximate search */
  usingApproximateSearch: boolean;
  /** Number of vectors in memory cache */
  cachedVectors: number;
  /** Last index update timestamp */
  lastUpdatedAt: number | null;
}

/**
 * Filter function for search.
 */
export type FilterFn = (id: string, metadata?: VectorMetadata) => boolean;

/**
 * Configuration for the vector search service.
 */
export interface VectorSearchConfig {
  /** Threshold for switching to approximate search */
  approximateSearchThreshold: number;
  /** Maximum vectors to keep in memory cache */
  maxCachedVectors: number;
  /** Whether to use Web Workers for search */
  useWebWorker: boolean;
  /** Number of hash tables for LSH (approximate search) */
  lshTableCount: number;
  /** Number of hash functions per table */
  lshHashCount: number;
}

/**
 * Default configuration.
 */
export const DEFAULT_CONFIG: VectorSearchConfig = {
  approximateSearchThreshold: 500,
  maxCachedVectors: 1000,
  useWebWorker: true,
  lshTableCount: 10,
  lshHashCount: 8,
};

// ============================================
// Core Algorithms
// ============================================

/**
 * Calculate cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite).
 *
 * Performance: O(n) where n is vector dimension.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // Use a single loop for efficiency
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Normalize a vector to unit length.
 */
export function normalizeVector(vector: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    const val = vector[i] ?? 0;
    norm += val * val;
  }
  norm = Math.sqrt(norm);

  if (norm === 0) {
    return vector;
  }

  const normalized = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    normalized[i] = (vector[i] ?? 0) / norm;
  }
  return normalized;
}

/**
 * Brute force search - exact nearest neighbors.
 * Best for small datasets (<500 vectors).
 *
 * Performance: O(n * d) where n = vector count, d = dimension.
 */
export function bruteForceSearch(
  query: Float32Array,
  vectors: Map<string, StoredVector>,
  k: number,
  filter?: FilterFn
): SearchResult[] {
  const results: SearchResult[] = [];

  for (const [id, stored] of vectors) {
    // Apply filter if provided
    if (filter && !filter(id, stored.metadata)) {
      continue;
    }

    const score = cosineSimilarity(query, stored.vector);
    results.push({ id, score, metadata: stored.metadata });
  }

  // Sort by score descending and take top k
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, k);
}

// ============================================
// LSH (Locality Sensitive Hashing) for Approximate Search
// ============================================

/**
 * Random hyperplane for LSH.
 */
interface LSHHyperplane {
  normal: Float32Array;
}

/**
 * LSH hash table.
 */
interface LSHTable {
  hyperplanes: LSHHyperplane[];
  buckets: Map<string, Set<string>>;
}

/**
 * Generate a random unit vector of given dimension.
 */
function randomUnitVector(dimension: number): Float32Array {
  const vector = new Float32Array(dimension);
  let norm = 0;

  for (let i = 0; i < dimension; i++) {
    // Box-Muller transform for Gaussian random numbers
    const u1 = Math.random();
    const u2 = Math.random();
    const val = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    vector[i] = val;
    norm += val * val;
  }

  norm = Math.sqrt(norm);
  for (let i = 0; i < dimension; i++) {
    const val = vector[i];
    if (val !== undefined) {
      vector[i] = val / norm;
    }
  }

  return vector;
}

/**
 * Compute LSH hash for a vector using a set of hyperplanes.
 */
function computeLSHHash(
  vector: Float32Array,
  hyperplanes: LSHHyperplane[]
): string {
  let hash = '';
  for (const plane of hyperplanes) {
    let dotProduct = 0;
    for (let i = 0; i < vector.length; i++) {
      const vi = vector[i] ?? 0;
      const pi = plane.normal[i] ?? 0;
      dotProduct += vi * pi;
    }
    hash += dotProduct >= 0 ? '1' : '0';
  }
  return hash;
}

/**
 * Create an LSH index for approximate nearest neighbor search.
 */
export class LSHIndex {
  private tables: LSHTable[] = [];
  private dimension: number;
  private tableCount: number;
  private hashCount: number;
  private vectors: Map<string, StoredVector>;

  constructor(
    dimension: number,
    tableCount: number = 10,
    hashCount: number = 8
  ) {
    this.dimension = dimension;
    this.tableCount = tableCount;
    this.hashCount = hashCount;
    this.vectors = new Map();
    this.initializeTables();
  }

  private initializeTables(): void {
    this.tables = [];
    for (let t = 0; t < this.tableCount; t++) {
      const hyperplanes: LSHHyperplane[] = [];
      for (let h = 0; h < this.hashCount; h++) {
        hyperplanes.push({ normal: randomUnitVector(this.dimension) });
      }
      this.tables.push({
        hyperplanes,
        buckets: new Map(),
      });
    }
  }

  /**
   * Add a vector to the LSH index.
   */
  add(stored: StoredVector): void {
    this.vectors.set(stored.id, stored);

    for (const table of this.tables) {
      const hash = computeLSHHash(stored.vector, table.hyperplanes);
      if (!table.buckets.has(hash)) {
        table.buckets.set(hash, new Set());
      }
      table.buckets.get(hash)!.add(stored.id);
    }
  }

  /**
   * Remove a vector from the LSH index.
   */
  remove(id: string): void {
    const stored = this.vectors.get(id);
    if (!stored) {
      return;
    }

    for (const table of this.tables) {
      const hash = computeLSHHash(stored.vector, table.hyperplanes);
      const bucket = table.buckets.get(hash);
      if (bucket) {
        bucket.delete(id);
        if (bucket.size === 0) {
          table.buckets.delete(hash);
        }
      }
    }

    this.vectors.delete(id);
  }

  /**
   * Search for approximate nearest neighbors.
   */
  search(query: Float32Array, k: number, filter?: FilterFn): SearchResult[] {
    // Collect candidate IDs from all matching buckets
    const candidates = new Set<string>();

    for (const table of this.tables) {
      const hash = computeLSHHash(query, table.hyperplanes);
      const bucket = table.buckets.get(hash);
      if (bucket) {
        for (const id of bucket) {
          candidates.add(id);
        }
      }
    }

    // If we didn't find enough candidates, fall back to brute force
    if (candidates.size < k) {
      return bruteForceSearch(query, this.vectors, k, filter);
    }

    // Compute exact similarities for candidates
    const results: SearchResult[] = [];
    for (const id of candidates) {
      const stored = this.vectors.get(id);
      if (!stored) {
        continue;
      }

      if (filter && !filter(id, stored.metadata)) {
        continue;
      }

      const score = cosineSimilarity(query, stored.vector);
      results.push({ id, score, metadata: stored.metadata });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  /**
   * Rebuild the entire index (useful after loading from storage).
   */
  rebuild(vectors: Map<string, StoredVector>): void {
    this.vectors = new Map(vectors);
    this.initializeTables();

    for (const stored of this.vectors.values()) {
      for (const table of this.tables) {
        const hash = computeLSHHash(stored.vector, table.hyperplanes);
        if (!table.buckets.has(hash)) {
          table.buckets.set(hash, new Set());
        }
        table.buckets.get(hash)!.add(stored.id);
      }
    }
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.vectors.clear();
    for (const table of this.tables) {
      table.buckets.clear();
    }
  }

  /**
   * Get all vectors (for persistence).
   */
  getVectors(): Map<string, StoredVector> {
    return new Map(this.vectors);
  }
}

// ============================================
// LRU Cache for Recent Searches
// ============================================

/**
 * Simple LRU cache for search results.
 */
export class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Delete first if exists to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================
// Vector Search Service Interface
// ============================================

/**
 * Vector Search Service interface.
 */
export interface VectorSearchService {
  /** Initialize the service and load any persisted index */
  initialize(): Promise<void>;

  /** Add a vector to the index */
  addVector(id: string, vector: Float32Array, metadata?: VectorMetadata): void;

  /** Add multiple vectors in batch */
  addVectors(
    vectors: Array<{
      id: string;
      vector: Float32Array;
      metadata?: VectorMetadata;
    }>
  ): void;

  /** Remove a vector from the index */
  removeVector(id: string): void;

  /** Check if a vector exists */
  hasVector(id: string): boolean;

  /** Get a vector by ID */
  getVector(id: string): StoredVector | undefined;

  /** Search for similar vectors */
  search(
    queryVector: Float32Array,
    k?: number,
    filter?: FilterFn
  ): SearchResult[];

  /** Rebuild the index from scratch */
  rebuildIndex(): Promise<void>;

  /** Save the index to persistent storage */
  saveIndex(): Promise<void>;

  /** Load the index from persistent storage */
  loadIndex(): Promise<boolean>;

  /** Get index statistics */
  getStats(): IndexStats;

  /** Clear all vectors */
  clear(): Promise<void>;

  /** Check if initialized */
  isInitialized(): boolean;
}

// ============================================
// Vector Search Service Implementation
// ============================================

/**
 * Implementation of the Vector Search Service.
 */
class VectorSearchServiceImpl implements VectorSearchService {
  private config: VectorSearchConfig;
  private vectors: Map<string, StoredVector> = new Map();
  private lshIndex: LSHIndex | null = null;
  private searchCache: LRUCache<string, SearchResult[]>;
  private dimension: number | null = null;
  private initialized = false;
  private lastUpdatedAt: number | null = null;

  // Import the index persistence module lazily
  private indexPersistence: typeof import('./vector-index') | null = null;

  constructor(config: Partial<VectorSearchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.searchCache = new LRUCache(100); // Cache last 100 searches
  }

  /**
   * Initialize the service.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Lazy load the persistence module
      this.indexPersistence = await import('./vector-index');

      // Try to load existing index
      const loaded = await this.loadIndex();
      if (!loaded) {
        // No existing index, start fresh
        this.vectors = new Map();
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize vector search:', error);
      // Still mark as initialized but with empty index
      this.initialized = true;
    }
  }

  /**
   * Check if initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Add a vector to the index.
   */
  addVector(id: string, vector: Float32Array, metadata?: VectorMetadata): void {
    this.ensureInitialized();

    // Validate dimension
    if (this.dimension === null) {
      this.dimension = vector.length;
    } else if (vector.length !== this.dimension) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.dimension}, got ${vector.length}`
      );
    }

    const now = Date.now();
    const stored: StoredVector = {
      id,
      vector: normalizeVector(vector), // Normalize for consistent similarity
      metadata,
      createdAt: now,
      lastAccessedAt: now,
    };

    // Remove from existing index if updating
    if (this.vectors.has(id)) {
      this.removeVector(id);
    }

    this.vectors.set(id, stored);

    // Add to LSH index if using approximate search
    if (this.shouldUseApproximateSearch()) {
      this.ensureLSHIndex();
      this.lshIndex!.add(stored);
    }

    // Invalidate search cache
    this.searchCache.clear();
    this.lastUpdatedAt = now;
  }

  /**
   * Add multiple vectors in batch.
   */
  addVectors(
    vectors: Array<{
      id: string;
      vector: Float32Array;
      metadata?: VectorMetadata;
    }>
  ): void {
    for (const { id, vector, metadata } of vectors) {
      this.addVector(id, vector, metadata);
    }
  }

  /**
   * Remove a vector from the index.
   */
  removeVector(id: string): void {
    this.ensureInitialized();

    const stored = this.vectors.get(id);
    if (!stored) {
      return;
    }

    this.vectors.delete(id);

    // Remove from LSH index
    if (this.lshIndex) {
      this.lshIndex.remove(id);
    }

    // Invalidate search cache
    this.searchCache.clear();
    this.lastUpdatedAt = Date.now();
  }

  /**
   * Check if a vector exists.
   */
  hasVector(id: string): boolean {
    return this.vectors.has(id);
  }

  /**
   * Get a vector by ID.
   */
  getVector(id: string): StoredVector | undefined {
    const stored = this.vectors.get(id);
    if (stored) {
      stored.lastAccessedAt = Date.now();
    }
    return stored;
  }

  /**
   * Search for similar vectors.
   */
  search(
    queryVector: Float32Array,
    k: number = 10,
    filter?: FilterFn
  ): SearchResult[] {
    this.ensureInitialized();

    if (this.vectors.size === 0) {
      return [];
    }

    // Validate dimension
    if (this.dimension !== null && queryVector.length !== this.dimension) {
      throw new Error(
        `Query vector dimension mismatch: expected ${this.dimension}, got ${queryVector.length}`
      );
    }

    // Normalize query vector
    const normalizedQuery = normalizeVector(queryVector);

    // Check cache (only for unfiltered queries)
    if (!filter) {
      const cacheKey = this.getCacheKey(normalizedQuery, k);
      const cached = this.searchCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Perform search
    let results: SearchResult[];

    if (this.shouldUseApproximateSearch() && this.lshIndex) {
      // Use LSH approximate search
      results = this.lshIndex.search(normalizedQuery, k, filter);
    } else {
      // Use brute force exact search
      results = bruteForceSearch(normalizedQuery, this.vectors, k, filter);
    }

    // Cache results (only for unfiltered queries)
    if (!filter) {
      const cacheKey = this.getCacheKey(normalizedQuery, k);
      this.searchCache.set(cacheKey, results);
    }

    return results;
  }

  /**
   * Rebuild the index from scratch.
   */
  async rebuildIndex(): Promise<void> {
    this.ensureInitialized();

    if (this.shouldUseApproximateSearch()) {
      this.ensureLSHIndex();
      this.lshIndex!.rebuild(this.vectors);
    }

    this.searchCache.clear();
    this.lastUpdatedAt = Date.now();

    // Save after rebuild
    await this.saveIndex();
  }

  /**
   * Save the index to persistent storage.
   */
  async saveIndex(): Promise<void> {
    if (!this.indexPersistence) {
      return;
    }

    try {
      await this.indexPersistence.saveVectorIndex({
        vectors: this.vectors,
        dimension: this.dimension,
        lastUpdatedAt: this.lastUpdatedAt,
      });
    } catch (error) {
      console.error('Failed to save vector index:', error);
    }
  }

  /**
   * Load the index from persistent storage.
   */
  async loadIndex(): Promise<boolean> {
    if (!this.indexPersistence) {
      return false;
    }

    try {
      const data = await this.indexPersistence.loadVectorIndex();
      if (!data) {
        return false;
      }

      this.vectors = data.vectors;
      this.dimension = data.dimension;
      this.lastUpdatedAt = data.lastUpdatedAt;

      // Rebuild LSH index if needed
      if (this.shouldUseApproximateSearch()) {
        this.ensureLSHIndex();
        this.lshIndex!.rebuild(this.vectors);
      }

      return true;
    } catch (error) {
      console.error('Failed to load vector index:', error);
      return false;
    }
  }

  /**
   * Get index statistics.
   */
  getStats(): IndexStats {
    const bytesPerFloat = 4;
    const dimension = this.dimension ?? 0;
    const vectorMemory = this.vectors.size * dimension * bytesPerFloat;
    const overheadPerVector = 200; // Approximate overhead for metadata, etc.
    const totalMemory = vectorMemory + this.vectors.size * overheadPerVector;

    return {
      vectorCount: this.vectors.size,
      dimension: this.dimension,
      memoryBytes: totalMemory,
      isInitialized: this.initialized,
      usingApproximateSearch: this.shouldUseApproximateSearch(),
      cachedVectors: this.vectors.size,
      lastUpdatedAt: this.lastUpdatedAt,
    };
  }

  /**
   * Clear all vectors.
   */
  async clear(): Promise<void> {
    this.vectors.clear();
    this.lshIndex?.clear();
    this.searchCache.clear();
    this.dimension = null;
    this.lastUpdatedAt = null;

    // Clear persisted index
    if (this.indexPersistence) {
      await this.indexPersistence.clearVectorIndex();
    }
  }

  // ============================================
  // Private Helpers
  // ============================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'Vector search service not initialized. Call initialize() first.'
      );
    }
  }

  private shouldUseApproximateSearch(): boolean {
    return this.vectors.size >= this.config.approximateSearchThreshold;
  }

  private ensureLSHIndex(): void {
    if (!this.lshIndex && this.dimension) {
      this.lshIndex = new LSHIndex(
        this.dimension,
        this.config.lshTableCount,
        this.config.lshHashCount
      );
    }
  }

  private getCacheKey(vector: Float32Array, k: number): string {
    // Create a simple hash of the vector for caching
    // Take first few values for speed
    const sample = Array.from(vector.slice(0, 10))
      .map((v) => v.toFixed(4))
      .join(',');
    return `${sample}:${k}`;
  }
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Singleton vector search service instance.
 */
export const vectorSearchService: VectorSearchService =
  new VectorSearchServiceImpl();

// ============================================
// Utility Functions
// ============================================

/**
 * Create a new vector search service with custom configuration.
 */
export function createVectorSearchService(
  config?: Partial<VectorSearchConfig>
): VectorSearchService {
  return new VectorSearchServiceImpl(config);
}

/**
 * Convert an array of numbers to Float32Array.
 */
export function toFloat32Array(arr: number[]): Float32Array {
  return new Float32Array(arr);
}

/**
 * Calculate the dimension of an embedding model.
 */
export function getEmbeddingDimension(modelName: string): number {
  const dimensions: Record<string, number> = {
    'all-MiniLM-L6-v2': 384,
    'all-mpnet-base-v2': 768,
    'multi-qa-MiniLM-L6-cos-v1': 384,
    'paraphrase-MiniLM-L6-v2': 384,
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536,
  };

  return dimensions[modelName] ?? 384;
}
