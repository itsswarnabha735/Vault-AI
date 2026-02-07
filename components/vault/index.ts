/**
 * Vault Components Index
 *
 * Exports all vault-related components for Vault-AI.
 */

// Search
export { SearchBar, SearchHints, SearchResultsSummary } from './SearchBar';
export type {
  SearchBarProps,
  SearchHintsProps,
  SearchResultsSummaryProps,
} from './SearchBar';

// Filters
export { FilterSidebar, defaultFilters } from './FilterSidebar';
export type { FilterSidebarProps, FilterState } from './FilterSidebar';

// Document display
export { DocumentCard, SyncStatusBadge } from './DocumentCard';
export type { DocumentCardProps, SyncStatusBadgeProps } from './DocumentCard';

export {
  DocumentGrid,
  DocumentCardSkeleton,
  VirtualizedDocumentGrid,
} from './DocumentGrid';
export type {
  DocumentGridProps,
  VirtualizedDocumentGridProps,
} from './DocumentGrid';

export { DocumentList } from './DocumentList';
export type { DocumentListProps, SortField, SortOrder } from './DocumentList';

// Preview
export { DocumentPreviewPanel } from './DocumentPreviewPanel';
export type { DocumentPreviewPanelProps } from './DocumentPreviewPanel';
