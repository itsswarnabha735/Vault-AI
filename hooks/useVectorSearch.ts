/**
 * React Hook for Vector Search
 *
 * Provides reactive access to the vector search service with
 * debouncing, loading states, and result caching.
 *
 * PRIVACY: All vector operations are performed locally.
 * Embeddings should NEVER be transmitted to external servers.
 */

'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

import {
  vectorSearchService,
  type SearchResult,
  type IndexStats,
  type VectorMetadata,
  type FilterFn,
  toFloat32Array,
} from '@/lib/storage/vector-search';

// ============================================
// Types
// ============================================

/**
 * Vector search initialization state.
 */
export interface UseVectorSearchInitResult {
  /** Whether the service is initialized */
  isInitialized: boolean;
  /** Whether currently initializing */
  isInitializing: boolean;
  /** Initialization error if any */
  error: Error | null;
  /** Manually trigger initialization */
  initialize: () => Promise<void>;
}

/**
 * Search options.
 */
export interface SearchOptions {
  /** Maximum number of results to return */
  k?: number;
  /** Filter function to apply to results */
  filter?: FilterFn;
  /** Minimum similarity score threshold (0-1) */
  minScore?: number;
  /** Debounce delay in milliseconds */
  debounceMs?: number;
}

/**
 * Search result with additional UI state.
 */
export interface EnhancedSearchResult extends SearchResult {
  /** Formatted score as percentage */
  scorePercent: number;
  /** Whether this result is above the minimum score threshold */
  isRelevant: boolean;
}

/**
 * Search state.
 */
export interface SearchState {
  /** Search results */
  results: EnhancedSearchResult[];
  /** Whether a search is in progress */
  isSearching: boolean;
  /** Error if search failed */
  error: Error | null;
  /** Time taken for the last search in ms */
  searchTimeMs: number | null;
  /** Total results found (before applying k limit) */
  totalFound: number;
}

// ============================================
// Debounce Utility
// ============================================

/**
 * Creates a debounced version of a function.
 */
function useDebouncedCallback<
  T extends (...args: Parameters<T>) => ReturnType<T>,
>(callback: T, delay: number): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Update callback ref on each render
  callbackRef.current = callback;

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
}

// ============================================
// useVectorSearchInit Hook
// ============================================

/**
 * Hook for vector search service initialization.
 *
 * @example
 * ```tsx
 * const { isInitialized, isInitializing, error, initialize } = useVectorSearchInit();
 *
 * useEffect(() => {
 *   if (!isInitialized && !isInitializing) {
 *     initialize();
 *   }
 * }, [isInitialized, isInitializing, initialize]);
 * ```
 */
export function useVectorSearchInit(): UseVectorSearchInitResult {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const initializingRef = useRef(false);

  const initialize = useCallback(async () => {
    if (initializingRef.current || vectorSearchService.isInitialized()) {
      setIsInitialized(vectorSearchService.isInitialized());
      return;
    }

    initializingRef.current = true;
    setIsInitializing(true);
    setError(null);

    try {
      await vectorSearchService.initialize();
      setIsInitialized(true);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsInitializing(false);
      initializingRef.current = false;
    }
  }, []);

  // Check initial state
  useEffect(() => {
    setIsInitialized(vectorSearchService.isInitialized());
  }, []);

  return {
    isInitialized,
    isInitializing,
    error,
    initialize,
  };
}

// ============================================
// useVectorSearch Hook
// ============================================

/**
 * Hook for performing vector searches with debouncing and loading states.
 *
 * @param options - Search options
 *
 * @example
 * ```tsx
 * const { search, results, isSearching, error } = useVectorSearch({ k: 10 });
 *
 * const handleSearch = async (query: string) => {
 *   const embedding = await generateEmbedding(query);
 *   search(embedding);
 * };
 * ```
 */
export function useVectorSearch(options: SearchOptions = {}) {
  const { k = 10, filter, minScore = 0, debounceMs = 150 } = options;

  const [state, setState] = useState<SearchState>({
    results: [],
    isSearching: false,
    error: null,
    searchTimeMs: null,
    totalFound: 0,
  });

  const performSearch = useCallback(
    async (queryVector: Float32Array | number[]) => {
      const vector =
        queryVector instanceof Float32Array
          ? queryVector
          : toFloat32Array(queryVector);

      setState((prev) => ({ ...prev, isSearching: true, error: null }));

      const startTime = performance.now();

      try {
        const results = vectorSearchService.search(vector, k, filter);
        const endTime = performance.now();

        // Enhance results with additional info
        const enhanced: EnhancedSearchResult[] = results
          .map((result) => ({
            ...result,
            scorePercent: Math.round(result.score * 100),
            isRelevant: result.score >= minScore,
          }))
          .filter((result) => result.isRelevant);

        setState({
          results: enhanced,
          isSearching: false,
          error: null,
          searchTimeMs: Math.round(endTime - startTime),
          totalFound: results.length,
        });

        return enhanced;
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isSearching: false,
          error: err as Error,
          results: [],
        }));
        return [];
      }
    },
    [k, filter, minScore]
  );

  // Create debounced search
  const debouncedSearch = useDebouncedCallback(performSearch, debounceMs);

  // Immediate search (no debounce)
  const searchImmediate = useCallback(
    (queryVector: Float32Array | number[]) => {
      return performSearch(queryVector);
    },
    [performSearch]
  );

  // Reset search state
  const reset = useCallback(() => {
    setState({
      results: [],
      isSearching: false,
      error: null,
      searchTimeMs: null,
      totalFound: 0,
    });
  }, []);

  return {
    search: debouncedSearch,
    searchImmediate,
    reset,
    ...state,
  };
}

// ============================================
// useVectorIndex Hook
// ============================================

/**
 * Hook for managing vectors in the index.
 *
 * @example
 * ```tsx
 * const { addVector, removeVector, hasVector, stats } = useVectorIndex();
 *
 * const handleAddDocument = async (id: string, text: string) => {
 *   const embedding = await generateEmbedding(text);
 *   addVector(id, embedding, { text, source: 'document' });
 * };
 * ```
 */
export function useVectorIndex() {
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refresh stats
  const refreshStats = useCallback(() => {
    try {
      setStats(vectorSearchService.getStats());
    } catch (err) {
      setError(err as Error);
    }
  }, []);

  // Add a vector
  const addVector = useCallback(
    (
      id: string,
      vector: Float32Array | number[],
      metadata?: VectorMetadata
    ) => {
      try {
        const vec =
          vector instanceof Float32Array ? vector : toFloat32Array(vector);
        vectorSearchService.addVector(id, vec, metadata);
        refreshStats();
      } catch (err) {
        setError(err as Error);
        throw err;
      }
    },
    [refreshStats]
  );

  // Add multiple vectors
  const addVectors = useCallback(
    (
      vectors: Array<{
        id: string;
        vector: Float32Array | number[];
        metadata?: VectorMetadata;
      }>
    ) => {
      try {
        const normalized = vectors.map(({ id, vector, metadata }) => ({
          id,
          vector:
            vector instanceof Float32Array ? vector : toFloat32Array(vector),
          metadata,
        }));
        vectorSearchService.addVectors(normalized);
        refreshStats();
      } catch (err) {
        setError(err as Error);
        throw err;
      }
    },
    [refreshStats]
  );

  // Remove a vector
  const removeVector = useCallback(
    (id: string) => {
      try {
        vectorSearchService.removeVector(id);
        refreshStats();
      } catch (err) {
        setError(err as Error);
        throw err;
      }
    },
    [refreshStats]
  );

  // Check if vector exists
  const hasVector = useCallback((id: string): boolean => {
    return vectorSearchService.hasVector(id);
  }, []);

  // Get a vector
  const getVector = useCallback((id: string) => {
    return vectorSearchService.getVector(id);
  }, []);

  // Rebuild index
  const rebuildIndex = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await vectorSearchService.rebuildIndex();
      refreshStats();
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [refreshStats]);

  // Save index
  const saveIndex = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await vectorSearchService.saveIndex();
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Clear all vectors
  const clearIndex = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await vectorSearchService.clear();
      refreshStats();
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [refreshStats]);

  // Initial stats fetch
  useEffect(() => {
    if (vectorSearchService.isInitialized()) {
      refreshStats();
    }
  }, [refreshStats]);

  return {
    // Stats
    stats,
    refreshStats,

    // Vector operations
    addVector,
    addVectors,
    removeVector,
    hasVector,
    getVector,

    // Index operations
    rebuildIndex,
    saveIndex,
    clearIndex,

    // State
    isLoading,
    error,
  };
}

// ============================================
// useSimilarDocuments Hook
// ============================================

/**
 * Hook for finding documents similar to a given document.
 *
 * @param documentId - ID of the document to find similar documents for
 * @param k - Number of similar documents to find
 *
 * @example
 * ```tsx
 * const { similar, isLoading, findSimilar } = useSimilarDocuments('doc-123', 5);
 *
 * return (
 *   <div>
 *     <h3>Similar Documents</h3>
 *     {similar.map(doc => (
 *       <div key={doc.id}>{doc.metadata?.title} - {doc.scorePercent}%</div>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useSimilarDocuments(
  documentId: string | undefined,
  k: number = 5
) {
  const [similar, setSimilar] = useState<EnhancedSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const findSimilar = useCallback(async () => {
    if (!documentId) {
      setSimilar([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const stored = vectorSearchService.getVector(documentId);
      if (!stored) {
        setSimilar([]);
        return;
      }

      // Search for similar, excluding the document itself
      const results = vectorSearchService.search(
        stored.vector,
        k + 1, // Get one extra to account for self-match
        (id) => id !== documentId
      );

      const enhanced: EnhancedSearchResult[] = results
        .slice(0, k)
        .map((result) => ({
          ...result,
          scorePercent: Math.round(result.score * 100),
          isRelevant: result.score >= 0.5,
        }));

      setSimilar(enhanced);
    } catch (err) {
      setError(err as Error);
      setSimilar([]);
    } finally {
      setIsLoading(false);
    }
  }, [documentId, k]);

  // Auto-fetch when documentId changes
  useEffect(() => {
    if (documentId && vectorSearchService.isInitialized()) {
      findSimilar();
    }
  }, [documentId, findSimilar]);

  return {
    similar,
    isLoading,
    error,
    findSimilar,
  };
}

// ============================================
// useSemanticSearch Hook
// ============================================

/**
 * Combined hook for semantic search with embedding generation.
 *
 * @param embeddingFn - Function to generate embeddings from text
 *
 * @example
 * ```tsx
 * const { search, results, isSearching, query } = useSemanticSearch(
 *   async (text) => {
 *     const model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
 *     return model(text, { pooling: 'mean', normalize: true });
 *   }
 * );
 *
 * <input
 *   value={query}
 *   onChange={(e) => search(e.target.value)}
 *   placeholder="Search..."
 * />
 * ```
 */
export function useSemanticSearch(
  embeddingFn: (text: string) => Promise<Float32Array | number[]>,
  options: SearchOptions = {}
) {
  const [query, setQuery] = useState('');
  const [isGeneratingEmbedding, setIsGeneratingEmbedding] = useState(false);
  const {
    search: vectorSearch,
    searchImmediate,
    reset,
    ...searchState
  } = useVectorSearch(options);

  const search = useCallback(
    async (text: string) => {
      setQuery(text);

      if (!text.trim()) {
        reset();
        return;
      }

      setIsGeneratingEmbedding(true);

      try {
        const embedding = await embeddingFn(text);
        const vector =
          embedding instanceof Float32Array
            ? embedding
            : toFloat32Array(embedding);

        await searchImmediate(vector);
      } catch (err) {
        // Error is handled in searchState
        console.error('Failed to generate embedding:', err);
      } finally {
        setIsGeneratingEmbedding(false);
      }
    },
    [embeddingFn, searchImmediate, reset]
  );

  // Debounced version
  const searchDebounced = useDebouncedCallback(
    search,
    options.debounceMs ?? 300
  );

  return {
    search: searchDebounced,
    searchImmediate: search,
    reset: useCallback(() => {
      setQuery('');
      reset();
    }, [reset]),
    query,
    isGeneratingEmbedding,
    // Spread searchState but override isSearching
    results: searchState.results,
    error: searchState.error,
    searchTimeMs: searchState.searchTimeMs,
    totalFound: searchState.totalFound,
    isSearching: searchState.isSearching || isGeneratingEmbedding,
  };
}

// ============================================
// useVectorSearchStats Hook
// ============================================

/**
 * Hook for monitoring vector search statistics.
 *
 * @param refreshInterval - Auto-refresh interval in ms (0 to disable)
 */
export function useVectorSearchStats(refreshInterval: number = 0) {
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(() => {
    setIsLoading(true);
    try {
      setStats(vectorSearchService.getStats());
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and interval
  useEffect(() => {
    if (vectorSearchService.isInitialized()) {
      refresh();
    }

    if (refreshInterval > 0 && vectorSearchService.isInitialized()) {
      const interval = setInterval(refresh, refreshInterval);
      return () => clearInterval(interval);
    }

    return undefined;
  }, [refresh, refreshInterval]);

  // Formatted stats
  const formattedStats = useMemo(() => {
    if (!stats) {
      return null;
    }

    return {
      ...stats,
      memoryFormatted: formatBytes(stats.memoryBytes),
      lastUpdatedFormatted: stats.lastUpdatedAt
        ? new Date(stats.lastUpdatedAt).toLocaleString()
        : 'Never',
    };
  }, [stats]);

  return {
    stats,
    formattedStats,
    isLoading,
    refresh,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
