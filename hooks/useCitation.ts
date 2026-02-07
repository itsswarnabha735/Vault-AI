/**
 * useCitation Hook for Vault-AI
 *
 * Hook for managing citation interactions, including:
 * - Getting transaction data for a citation
 * - Loading document previews
 * - Tracking citation clicks for analytics
 *
 * PRIVACY: All document access happens locally via OPFS.
 */

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/storage/db';
import type { Citation } from '@/types/ai';
import type { LocalTransaction, TransactionId } from '@/types/database';

// ============================================
// Types
// ============================================

/**
 * Citation state for a single citation.
 */
export interface CitationState {
  /** The citation data */
  citation: Citation;

  /** Associated transaction (if loaded) */
  transaction: LocalTransaction | null;

  /** Whether transaction is loading */
  isLoading: boolean;

  /** Whether document is available */
  hasDocument: boolean;

  /** Document blob URL (if loaded) */
  documentUrl: string | null;

  /** Document thumbnail URL (if available) */
  thumbnailUrl: string | null;

  /** Error if any */
  error: Error | null;
}

/**
 * Options for useCitation hook.
 */
export interface UseCitationOptions {
  /** Auto-load transaction on mount */
  autoLoad?: boolean;

  /** Auto-load document preview */
  autoLoadDocument?: boolean;

  /** Track click analytics */
  trackClicks?: boolean;
}

/**
 * Return type for useCitation hook.
 */
export interface UseCitationReturn {
  /** Current citation state */
  state: CitationState;

  /** Load transaction data */
  loadTransaction: () => Promise<LocalTransaction | null>;

  /** Load document for preview */
  loadDocument: () => Promise<string | null>;

  /** Load document thumbnail */
  loadThumbnail: () => Promise<string | null>;

  /** Track citation click */
  trackClick: () => void;

  /** Clear loaded resources */
  clear: () => void;
}

/**
 * Return type for useCitations hook (multiple).
 */
export interface UseCitationsReturn {
  /** Map of citation states by transaction ID */
  citations: Map<string, CitationState>;

  /** Currently selected citation */
  selectedCitation: Citation | null;

  /** Select a citation */
  selectCitation: (citation: Citation | null) => void;

  /** Get state for a specific citation */
  getCitationState: (transactionId: string) => CitationState | undefined;

  /** Load transaction for a citation */
  loadTransactionFor: (transactionId: string) => Promise<LocalTransaction | null>;

  /** Check if any citations have documents */
  hasAnyDocuments: boolean;
}

// ============================================
// Single Citation Hook
// ============================================

/**
 * Hook for managing a single citation.
 *
 * @param citation - The citation to manage
 * @param options - Hook options
 *
 * @example
 * ```tsx
 * const { state, loadDocument, trackClick } = useCitation(citation, {
 *   autoLoad: true,
 * });
 * ```
 */
export function useCitation(
  citation: Citation,
  options: UseCitationOptions = {}
): UseCitationReturn {
  const { autoLoad = true, autoLoadDocument = false, trackClicks = true } = options;

  // State
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Get transaction from database using live query
  const transaction = useLiveQuery(
    async () => {
      if (!autoLoad) return null;
      return db.transactions.get(citation.transactionId);
    },
    [citation.transactionId, autoLoad]
  );

  // Derived state
  const hasDocument = !!transaction?.filePath;

  // Load transaction manually
  const loadTransaction = useCallback(async (): Promise<LocalTransaction | null> => {
    try {
      setIsLoading(true);
      setError(null);
      const tx = await db.transactions.get(citation.transactionId);
      return tx || null;
    } catch (err) {
      setError(err as Error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [citation.transactionId]);

  // Load document for preview
  const loadDocument = useCallback(async (): Promise<string | null> => {
    if (!transaction?.filePath) return null;

    try {
      setIsLoading(true);
      setError(null);

      // Get file from OPFS
      const root = await navigator.storage.getDirectory();
      const parts = transaction.filePath.split('/').filter(Boolean);

      let current: FileSystemDirectoryHandle = root;
      for (let i = 0; i < parts.length - 1; i++) {
        current = await current.getDirectoryHandle(parts[i]!);
      }

      const fileName = parts[parts.length - 1]!;
      const fileHandle = await current.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);

      setDocumentUrl(url);
      return url;
    } catch (err) {
      setError(err as Error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [transaction?.filePath]);

  // Load thumbnail
  const loadThumbnail = useCallback(async (): Promise<string | null> => {
    if (!transaction?.filePath) return null;

    try {
      // Check for cached thumbnail
      const root = await navigator.storage.getDirectory();

      try {
        const thumbDir = await root.getDirectoryHandle('thumbnails');
        const thumbHandle = await thumbDir.getFileHandle(`${citation.transactionId}.jpg`);
        const file = await thumbHandle.getFile();
        const url = URL.createObjectURL(file);
        setThumbnailUrl(url);
        return url;
      } catch {
        // No cached thumbnail, would need to generate
        return null;
      }
    } catch (err) {
      console.warn('Failed to load thumbnail:', err);
      return null;
    }
  }, [citation.transactionId, transaction?.filePath]);

  // Track citation click
  const trackClick = useCallback(() => {
    if (!trackClicks) return;

    // Log citation click for analytics (can be enhanced to use proper analytics table)
    console.debug('[Citation Analytics]', {
      transactionId: citation.transactionId,
      vendor: citation.vendor,
      amount: citation.amount,
      timestamp: new Date().toISOString(),
    });
  }, [citation.transactionId, citation.vendor, citation.amount, trackClicks]);

  // Clear loaded resources
  const clear = useCallback(() => {
    if (documentUrl) {
      URL.revokeObjectURL(documentUrl);
      setDocumentUrl(null);
    }
    if (thumbnailUrl) {
      URL.revokeObjectURL(thumbnailUrl);
      setThumbnailUrl(null);
    }
    setError(null);
  }, [documentUrl, thumbnailUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (documentUrl) URL.revokeObjectURL(documentUrl);
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
    };
  }, [documentUrl, thumbnailUrl]);

  // Auto-load document if requested
  useEffect(() => {
    if (autoLoadDocument && hasDocument) {
      loadThumbnail();
    }
  }, [autoLoadDocument, hasDocument, loadThumbnail]);

  // Build state object
  const state: CitationState = useMemo(
    () => ({
      citation,
      transaction: transaction ?? null,
      isLoading,
      hasDocument,
      documentUrl,
      thumbnailUrl,
      error,
    }),
    [citation, transaction, isLoading, hasDocument, documentUrl, thumbnailUrl, error]
  );

  return {
    state,
    loadTransaction,
    loadDocument,
    loadThumbnail,
    trackClick,
    clear,
  };
}

// ============================================
// Multiple Citations Hook
// ============================================

/**
 * Hook for managing multiple citations.
 *
 * @param citations - Array of citations to manage
 *
 * @example
 * ```tsx
 * const { selectedCitation, selectCitation, hasAnyDocuments } = useCitations(citations);
 * ```
 */
export function useCitations(citations: Citation[]): UseCitationsReturn {
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  // Get all transactions for citations
  const transactionIds = useMemo(
    () => citations.map((c) => c.transactionId),
    [citations]
  );

  const transactions = useLiveQuery(async () => {
    if (transactionIds.length === 0) return [];
    return db.transactions.where('id').anyOf(transactionIds).toArray();
  }, [transactionIds]);

  // Build citation states map
  const citationStates = useMemo(() => {
    const map = new Map<string, CitationState>();

    for (const citation of citations) {
      const transaction = transactions?.find(
        (t) => t.id === citation.transactionId
      );

      map.set(citation.transactionId, {
        citation,
        transaction: transaction ?? null,
        isLoading: !transactions,
        hasDocument: !!transaction?.filePath,
        documentUrl: null,
        thumbnailUrl: null,
        error: null,
      });
    }

    return map;
  }, [citations, transactions]);

  // Check if any citations have documents
  const hasAnyDocuments = useMemo(() => {
    return Array.from(citationStates.values()).some((s) => s.hasDocument);
  }, [citationStates]);

  // Select citation handler
  const selectCitation = useCallback((citation: Citation | null) => {
    setSelectedCitation(citation);
  }, []);

  // Get state for specific citation
  const getCitationState = useCallback(
    (transactionId: string) => {
      return citationStates.get(transactionId);
    },
    [citationStates]
  );

  // Load transaction for a citation
  const loadTransactionFor = useCallback(
    async (transactionId: string): Promise<LocalTransaction | null> => {
      const tx = await db.transactions.get(transactionId as TransactionId);
      return tx || null;
    },
    []
  );

  return {
    citations: citationStates,
    selectedCitation,
    selectCitation,
    getCitationState,
    loadTransactionFor,
    hasAnyDocuments,
  };
}

// ============================================
// Transaction Hook for Citation
// ============================================

/**
 * Simple hook to get transaction for a citation.
 *
 * @param transactionId - Transaction ID from citation
 */
export function useTransactionForCitation(
  transactionId: TransactionId | string | null
) {
  const transaction = useLiveQuery(
    async () => {
      if (!transactionId) return null;
      return db.transactions.get(transactionId as TransactionId);
    },
    [transactionId]
  );

  const isLoading = transaction === undefined;

  return {
    transaction: transaction ?? null,
    isLoading,
    hasDocument: !!transaction?.filePath,
  };
}

// ============================================
// Analytics Hook
// ============================================

/**
 * Hook for citation click analytics.
 * 
 * Note: Currently returns placeholder data. 
 * Implement with proper analytics table for production use.
 */
export function useCitationAnalytics() {
  // Placeholder implementation - returns empty analytics
  // In production, this would use a dedicated analytics table or service
  const clickCounts = useMemo(() => new Map<string, number>(), []);

  const mostClicked = useMemo(
    () => [] as Array<[string, number]>,
    []
  );

  return {
    clickCounts,
    mostClicked,
    totalClicks: 0,
  };
}

// ============================================
// Exports
// ============================================

export default useCitation;
