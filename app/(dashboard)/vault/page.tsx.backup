/**
 * Vault Page
 *
 * Document browser interface for viewing and managing all uploaded documents.
 * Supports grid and list views, semantic search, and filtering.
 *
 * PRIVACY: All documents are stored and processed locally in OPFS.
 */

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  SearchBar,
  SearchResultsSummary,
  FilterSidebar,
  DocumentGrid,
  DocumentList,
  DocumentPreviewPanel,
  defaultFilters,
  type FilterState,
  type SortField,
  type SortOrder,
} from '@/components/vault';
import {
  useTransactions,
  useTransactionActions,
  type TransactionFilters,
} from '@/hooks/useLocalDB';
import { useSemanticSearch } from '@/hooks/useVectorSearch';
import { useEmbedding } from '@/hooks/useEmbedding';
import type { LocalTransaction, TransactionId } from '@/types/database';

// ============================================
// Types
// ============================================

type ViewMode = 'grid' | 'list';

// ============================================
// Page Component
// ============================================

export default function VaultPage() {
  // View state
  const [view, setView] = useState<ViewMode>('grid');
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TransactionId[]>([]);
  const [isUsingSearch, setIsUsingSearch] = useState(false);

  // Sort state
  const [uiSortField, setUiSortField] = useState<SortField>('date');
  const [uiSortOrder, setUiSortOrder] = useState<SortOrder>('desc');

  // Selection state
  const [selectedTransaction, setSelectedTransaction] =
    useState<LocalTransaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<TransactionId>>(new Set());

  // Embedding and search
  const { embedText, isReady: isModelLoaded } = useEmbedding();
  const semanticSearch = useSemanticSearch(
    async (text: string) => {
      const result = await embedText(text);
      return result;
    },
    { k: 50, debounceMs: 300 }
  );

  // Map UI sort field to transaction filters sort field
  const internalSortField = useMemo((): TransactionFilters['sortBy'] => {
    const fieldMap: Record<SortField, TransactionFilters['sortBy']> = {
      date: 'date',
      amount: 'amount',
      vendor: 'vendor',
      category: 'date', // Fall back to date for category
    };
    return fieldMap[uiSortField];
  }, [uiSortField]);

  // Transaction data
  const transactionFilters = useMemo((): TransactionFilters => {
    const f: TransactionFilters = {
      sortBy: internalSortField,
      sortOrder: uiSortOrder,
    };

    if (filters.startDate) {
      f.startDate = filters.startDate;
    }
    if (filters.endDate) {
      f.endDate = filters.endDate;
    }
    if (filters.categories.length > 0) {
      f.categoryId = filters.categories[0]; // Simplified - would need multi-category support
    }
    if (filters.minAmount !== null) {
      f.minAmount = filters.minAmount;
    }
    if (filters.maxAmount !== null) {
      f.maxAmount = filters.maxAmount;
    }
    if (filters.vendor) {
      f.vendor = filters.vendor;
    }
    if (filters.syncStatus !== 'all') {
      f.syncStatus = filters.syncStatus;
    }

    return f;
  }, [filters, internalSortField, uiSortOrder]);

  const { data: allTransactions, isLoading } =
    useTransactions(transactionFilters);
  const { deleteTransaction, updateTransaction } = useTransactionActions();

  // Filter transactions based on search results and document filter
  const transactions = useMemo(() => {
    let result = allTransactions || [];

    // Apply search filter
    if (isUsingSearch && searchResults.length > 0) {
      const searchSet = new Set(searchResults);
      result = result.filter((tx) => searchSet.has(tx.id));
    } else if (isUsingSearch && searchQuery && searchResults.length === 0) {
      result = [];
    }

    // Apply document filter
    if (filters.hasDocument === true) {
      result = result.filter((tx) => tx.filePath);
    } else if (filters.hasDocument === false) {
      result = result.filter((tx) => !tx.filePath);
    }

    return result;
  }, [
    allTransactions,
    isUsingSearch,
    searchResults,
    searchQuery,
    filters.hasDocument,
  ]);

  // Handle search
  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);

      if (!query.trim()) {
        setIsUsingSearch(false);
        setSearchResults([]);
        return;
      }

      if (!isModelLoaded) {
        // Fall back to simple text search if model not loaded
        setIsUsingSearch(true);
        const lowerQuery = query.toLowerCase();
        const matches = (allTransactions || [])
          .filter(
            (tx) =>
              tx.vendor.toLowerCase().includes(lowerQuery) ||
              tx.note?.toLowerCase().includes(lowerQuery)
          )
          .map((tx) => tx.id);
        setSearchResults(matches);
        return;
      }

      // Semantic search
      setIsUsingSearch(true);
      await semanticSearch.search(query);
    },
    [isModelLoaded, allTransactions, semanticSearch]
  );

  // Update search results from semantic search
  useEffect(() => {
    if (semanticSearch.results.length > 0) {
      setSearchResults(
        semanticSearch.results.map((r) => r.id as TransactionId)
      );
    }
  }, [semanticSearch.results]);

  // Handle sort change
  const handleSortChange = useCallback((field: SortField, order: SortOrder) => {
    setUiSortField(field);
    setUiSortOrder(order);
  }, []);

  // Handle transaction selection
  const handleSelect = useCallback((tx: LocalTransaction) => {
    setSelectedTransaction(tx);
  }, []);

  // Handle bulk selection
  const handleBulkSelect = useCallback((ids: TransactionId[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  // Handle delete
  const handleDelete = useCallback(
    async (id: TransactionId) => {
      await deleteTransaction(id);
      if (selectedTransaction?.id === id) {
        setSelectedTransaction(null);
      }
    },
    [deleteTransaction, selectedTransaction]
  );

  // Handle edit
  const handleEdit = useCallback(
    async (id: TransactionId, updates: Partial<LocalTransaction>) => {
      await updateTransaction(id, updates);
    },
    [updateTransaction]
  );

  // Calculate stats
  const stats = useMemo(() => {
    const total = transactions.length;
    const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const withDocs = transactions.filter((tx) => tx.filePath).length;
    return { total, totalAmount, withDocs };
  }, [transactions]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Document Vault
            </h1>
            <p className="text-sm text-muted-foreground">
              {stats.total} documents • {stats.withDocs} with attachments
            </p>
          </div>

          {/* Privacy badge */}
          <Badge variant="secondary" className="gap-1">
            <ShieldIcon className="h-3 w-3 text-green-500" />
            <span>Local Storage</span>
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border p-1">
            <button
              type="button"
              onClick={() => setView('grid')}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                view === 'grid'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="Grid view"
            >
              <GridIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                view === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="List view"
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Upload button */}
          <Button>
            <UploadIcon className="mr-2 h-4 w-4" />
            Upload
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Filter sidebar */}
        <FilterSidebar
          filters={filters}
          onChange={setFilters}
          isCollapsed={isFilterCollapsed}
          onToggleCollapse={() => setIsFilterCollapsed(!isFilterCollapsed)}
        />

        {/* Content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Search bar */}
          <div className="border-b border-border bg-background p-4">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              onSearch={handleSearch}
              isSearching={
                semanticSearch.isSearching ||
                semanticSearch.isGeneratingEmbedding
              }
              placeholder={
                isModelLoaded
                  ? "Search by concept (e.g., 'furniture', 'medical expenses')"
                  : 'Search by vendor or note...'
              }
            />

            {/* Search results summary */}
            {isUsingSearch && searchQuery && (
              <SearchResultsSummary
                count={searchResults.length}
                query={searchQuery}
                searchTimeMs={semanticSearch.searchTimeMs || undefined}
                className="mt-2"
              />
            )}

            {/* Model loading indicator */}
            {!isModelLoaded && (
              <p className="mt-2 text-xs text-muted-foreground">
                Semantic search will be available once the AI model loads...
              </p>
            )}
          </div>

          {/* Document collection */}
          <div className="flex-1 overflow-auto">
            {view === 'grid' ? (
              <DocumentGrid
                transactions={transactions}
                selectedId={selectedTransaction?.id}
                onSelect={handleSelect}
                isLoading={isLoading}
              />
            ) : (
              <DocumentList
                transactions={transactions}
                selectedIds={selectedIds}
                onSelect={handleSelect}
                onBulkSelect={handleBulkSelect}
                sortField={uiSortField}
                sortOrder={uiSortOrder}
                onSortChange={handleSortChange}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>

        {/* Preview panel */}
        {selectedTransaction && (
          <div className="hidden w-96 border-l border-border lg:block">
            <DocumentPreviewPanel
              transaction={selectedTransaction}
              onClose={() => setSelectedTransaction(null)}
              onDelete={handleDelete}
              onEdit={handleEdit}
            />
          </div>
        )}
      </div>

      {/* Mobile preview panel */}
      {selectedTransaction && (
        <div className="lg:hidden">
          <DocumentPreviewPanel
            transaction={selectedTransaction}
            onClose={() => setSelectedTransaction(null)}
            onDelete={handleDelete}
            onEdit={handleEdit}
          />
        </div>
      )}
    </div>
  );
}

// ============================================
// Icons
// ============================================

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
      />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}
