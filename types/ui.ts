/**
 * UI Component Types for Vault-AI
 *
 * Props and types for UI components including transaction cards,
 * document previews, chat messages, filters, and sorting options.
 */

import type {
  TransactionId,
  CategoryId,
  SyncStatus,
  AnomalyType,
  AnomalySeverity,
} from './database';
import type { Citation, ProcessingStage } from './ai';

// ============================================
// Transaction Components
// ============================================

/**
 * Props for TransactionCard component.
 */
export interface TransactionCardProps {
  /** Transaction ID */
  id: TransactionId;

  /** Transaction date (ISO string) */
  date: string;

  /** Transaction amount */
  amount: number;

  /** Currency code */
  currency: string;

  /** Vendor/merchant name */
  vendor: string;

  /** Category name (resolved) */
  categoryName: string | null;

  /** Category color */
  categoryColor: string | null;

  /** Category icon */
  categoryIcon: string | null;

  /** User notes */
  note: string | null;

  /** Sync status */
  syncStatus: SyncStatus;

  /** Whether document is attached */
  hasDocument: boolean;

  /** Extraction confidence (0-1) */
  confidence: number;

  /** Search relevance score (if from search) */
  relevanceScore?: number;

  /** Whether this card is selected */
  isSelected?: boolean;

  /** Click handler */
  onClick?: (id: TransactionId) => void;

  /** Edit handler */
  onEdit?: (id: TransactionId) => void;

  /** Delete handler */
  onDelete?: (id: TransactionId) => void;

  /** View document handler */
  onViewDocument?: (id: TransactionId) => void;
}

/**
 * Props for TransactionList component.
 */
export interface TransactionListProps {
  /** Array of transactions to display */
  transactions: TransactionCardProps[];

  /** Loading state */
  isLoading: boolean;

  /** Empty state message */
  emptyMessage?: string;

  /** Sort configuration */
  sortBy: TransactionSortOption;

  /** Sort direction */
  sortDirection: SortDirection;

  /** Sort change handler */
  onSortChange?: (
    sort: TransactionSortOption,
    direction: SortDirection
  ) => void;

  /** Selection mode */
  selectionMode?: 'none' | 'single' | 'multiple';

  /** Selected transaction IDs */
  selectedIds?: TransactionId[];

  /** Selection change handler */
  onSelectionChange?: (ids: TransactionId[]) => void;

  /** Infinite scroll: has more items */
  hasMore?: boolean;

  /** Infinite scroll: load more handler */
  onLoadMore?: () => void;
}

/**
 * Props for TransactionEditor component.
 */
export interface TransactionEditorProps {
  /** Transaction ID (null for new transaction) */
  transactionId: TransactionId | null;

  /** Initial values for form */
  initialValues?: TransactionFormValues;

  /** Submit handler */
  onSubmit: (values: TransactionFormValues) => Promise<void>;

  /** Cancel handler */
  onCancel: () => void;

  /** Delete handler */
  onDelete?: (id: TransactionId) => Promise<void>;

  /** Whether submitting */
  isSubmitting: boolean;

  /** Available categories */
  categories: CategoryOption[];
}

/**
 * Form values for transaction editing.
 */
export interface TransactionFormValues {
  date: string;
  amount: number;
  vendor: string;
  categoryId: CategoryId | null;
  note: string;
  currency: string;
}

// ============================================
// Document Components
// ============================================

/**
 * Props for DocumentCard component.
 */
export interface DocumentCardProps {
  /** Document/Transaction ID */
  id: TransactionId;

  /** Original filename */
  fileName: string;

  /** File type */
  mimeType: string;

  /** File size in bytes */
  fileSize: number;

  /** Thumbnail URL (blob URL) */
  thumbnailUrl: string | null;

  /** Number of pages (for PDFs) */
  pageCount: number | null;

  /** Import date */
  importedAt: Date;

  /** Associated transaction date */
  transactionDate: string | null;

  /** Associated vendor */
  vendor: string | null;

  /** Whether document is processing */
  isProcessing?: boolean;

  /** Processing stage (if processing) */
  processingStage?: ProcessingStage;

  /** Processing progress (0-100) */
  processingProgress?: number;

  /** Click handler */
  onClick?: (id: TransactionId) => void;

  /** Delete handler */
  onDelete?: (id: TransactionId) => void;
}

/**
 * Props for DocumentPreview component.
 */
export interface DocumentPreviewProps {
  /** Document ID */
  documentId: TransactionId;

  /** File blob or URL */
  fileSource: Blob | string | null;

  /** File type */
  mimeType: string;

  /** Current page (for PDFs) */
  currentPage?: number;

  /** Total pages */
  totalPages?: number;

  /** Zoom level (percentage) */
  zoomLevel?: number;

  /** Page change handler */
  onPageChange?: (page: number) => void;

  /** Zoom change handler */
  onZoomChange?: (zoom: number) => void;

  /** Close handler */
  onClose?: () => void;

  /** Loading state */
  isLoading?: boolean;

  /** Error message */
  error?: string;
}

/**
 * Props for DocumentGrid component.
 */
export interface DocumentGridProps {
  /** Documents to display */
  documents: DocumentCardProps[];

  /** View mode */
  viewMode: 'grid' | 'list';

  /** Loading state */
  isLoading: boolean;

  /** Empty state message */
  emptyMessage?: string;

  /** Selection mode */
  selectionMode?: 'none' | 'single' | 'multiple';

  /** Selected IDs */
  selectedIds?: TransactionId[];

  /** Selection change handler */
  onSelectionChange?: (ids: TransactionId[]) => void;
}

// ============================================
// Chat Components
// ============================================

/**
 * Props for ChatMessage component.
 */
export interface ChatMessageProps {
  /** Message ID */
  id: string;

  /** Message role */
  role: 'user' | 'assistant';

  /** Message content */
  content: string;

  /** Message timestamp */
  timestamp: Date;

  /** Whether message is streaming */
  isStreaming?: boolean;

  /** Citations (for assistant messages) */
  citations?: Citation[];

  /** Suggested follow-ups (for assistant messages) */
  suggestedFollowups?: string[];

  /** Citation click handler */
  onCitationClick?: (transactionId: TransactionId) => void;

  /** Follow-up click handler */
  onFollowupClick?: (query: string) => void;

  /** Copy handler */
  onCopy?: (content: string) => void;
}

/**
 * Props for ChatInput component.
 */
export interface ChatInputProps {
  /** Current input value */
  value: string;

  /** Value change handler */
  onChange: (value: string) => void;

  /** Submit handler */
  onSubmit: (query: string) => void;

  /** Whether submitting */
  isSubmitting: boolean;

  /** Placeholder text */
  placeholder?: string;

  /** Whether input is disabled */
  disabled?: boolean;

  /** Quick query suggestions */
  quickQueries?: QuickQueryOption[];

  /** Quick query click handler */
  onQuickQueryClick?: (query: string) => void;
}

/**
 * Quick query option for suggestions.
 */
export interface QuickQueryOption {
  id: string;
  label: string;
  query: string;
  icon?: string;
}

/**
 * Props for CitationPanel component.
 */
export interface CitationPanelProps {
  /** Citations to display */
  citations: Citation[];

  /** Selected citation ID */
  selectedCitationId?: TransactionId;

  /** Citation click handler */
  onCitationClick: (transactionId: TransactionId) => void;

  /** View document handler */
  onViewDocument: (transactionId: TransactionId) => void;

  /** Whether panel is expanded */
  isExpanded?: boolean;

  /** Toggle expand handler */
  onToggleExpand?: () => void;
}

// ============================================
// Filter & Sort Components
// ============================================

/**
 * Transaction sort options.
 */
export type TransactionSortOption = 'date' | 'amount' | 'vendor' | 'category';

/**
 * Sort direction.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Date range presets.
 */
export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'custom';

/**
 * Filter options for transactions.
 */
export interface FilterOptions {
  /** Date range filter */
  dateRange: {
    preset: DateRangePreset;
    start: string | null;
    end: string | null;
  };

  /** Category filter */
  categories: CategoryId[];

  /** Amount range filter */
  amountRange: {
    min: number | null;
    max: number | null;
  };

  /** Vendor filter (text search) */
  vendor: string;

  /** Sync status filter */
  syncStatus: SyncStatus[];

  /** Has document filter */
  hasDocument: boolean | null;
}

/**
 * Default filter options.
 */
export const DEFAULT_FILTER_OPTIONS: FilterOptions = {
  dateRange: {
    preset: 'this_month',
    start: null,
    end: null,
  },
  categories: [],
  amountRange: {
    min: null,
    max: null,
  },
  vendor: '',
  syncStatus: [],
  hasDocument: null,
};

/**
 * Props for FilterPanel component.
 */
export interface FilterPanelProps {
  /** Current filter options */
  filters: FilterOptions;

  /** Filter change handler */
  onFiltersChange: (filters: FilterOptions) => void;

  /** Available categories */
  categories: CategoryOption[];

  /** Clear all filters handler */
  onClearFilters: () => void;

  /** Number of active filters */
  activeFilterCount: number;

  /** Whether panel is collapsed */
  isCollapsed?: boolean;

  /** Toggle collapse handler */
  onToggleCollapse?: () => void;
}

/**
 * Category option for selects and filters.
 */
export interface CategoryOption {
  id: CategoryId;
  name: string;
  icon: string;
  color: string;
  parentId: CategoryId | null;
  transactionCount?: number;
}

// ============================================
// Dashboard Components
// ============================================

/**
 * Props for BudgetCard component.
 */
export interface BudgetCardProps {
  /** Category name (or "Total" for overall) */
  categoryName: string;

  /** Category icon */
  categoryIcon: string | null;

  /** Category color */
  categoryColor: string;

  /** Budget limit */
  budgetLimit: number;

  /** Amount spent */
  spent: number;

  /** Remaining amount */
  remaining: number;

  /** Percentage used */
  percentUsed: number;

  /** Currency */
  currency: string;

  /** Days remaining in period */
  daysRemaining: number;

  /** Whether budget is exceeded */
  isExceeded: boolean;

  /** Click handler */
  onClick?: () => void;
}

/**
 * Props for SpendingChart component.
 */
export interface SpendingChartProps {
  /** Chart data points */
  data: ChartDataPoint[];

  /** Chart type */
  chartType: 'line' | 'bar' | 'area';

  /** Time period */
  period: 'daily' | 'weekly' | 'monthly';

  /** Currency for formatting */
  currency: string;

  /** Whether loading */
  isLoading: boolean;

  /** Chart height */
  height?: number;

  /** Show comparison line */
  showComparison?: boolean;

  /** Comparison data */
  comparisonData?: ChartDataPoint[];
}

/**
 * Chart data point.
 */
export interface ChartDataPoint {
  /** Date/period label */
  label: string;

  /** Primary value */
  value: number;

  /** Comparison value (if applicable) */
  comparisonValue?: number;

  /** Category breakdown (if applicable) */
  breakdown?: Record<string, number>;
}

/**
 * Props for RecentTransactions component.
 */
export interface RecentTransactionsProps {
  /** Transactions to display */
  transactions: TransactionCardProps[];

  /** Maximum items to show */
  limit?: number;

  /** Loading state */
  isLoading: boolean;

  /** View all handler */
  onViewAll?: () => void;
}

// ============================================
// Anomaly Components
// ============================================

/**
 * Props for AnomalyAlert component.
 */
export interface AnomalyAlertProps {
  /** Alert ID */
  id: string;

  /** Anomaly type */
  type: AnomalyType;

  /** Severity level */
  severity: AnomalySeverity;

  /** Alert message */
  message: string;

  /** Transaction details */
  transaction: {
    date: string;
    amount: number;
    vendor: string;
    currency: string;
  };

  /** Related transaction (for duplicates) */
  relatedTransaction?: {
    date: string;
    amount: number;
    vendor: string;
  };

  /** Confirm handler */
  onConfirm: (id: string) => void;

  /** Dismiss handler */
  onDismiss: (id: string) => void;

  /** View details handler */
  onViewDetails?: (id: string) => void;
}

// ============================================
// Common Components
// ============================================

/**
 * Props for SyncIndicator component.
 */
export interface SyncIndicatorProps {
  /** Current sync status */
  status: SyncStatus | 'syncing' | 'offline';

  /** Pending change count */
  pendingCount?: number;

  /** Last sync timestamp */
  lastSyncAt?: Date;

  /** Click handler */
  onClick?: () => void;

  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Props for PrivacyBadge component.
 */
export interface PrivacyBadgeProps {
  /** Badge type */
  type: 'local-only' | 'synced' | 'processing';

  /** Optional tooltip text */
  tooltip?: string;

  /** Size variant */
  size?: 'sm' | 'md';
}

/**
 * Props for LoadingSpinner component.
 */
export interface LoadingSpinnerProps {
  /** Size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl';

  /** Optional label */
  label?: string;

  /** Whether to center in container */
  centered?: boolean;
}

/**
 * Props for EmptyState component.
 */
export interface EmptyStateProps {
  /** Icon component or emoji */
  icon?: React.ReactNode | string;

  /** Title text */
  title: string;

  /** Description text */
  description?: string;

  /** Action button label */
  actionLabel?: string;

  /** Action handler */
  onAction?: () => void;
}

// ============================================
// Modal Components
// ============================================

/**
 * Base modal props.
 */
export interface BaseModalProps {
  /** Whether modal is open */
  isOpen: boolean;

  /** Close handler */
  onClose: () => void;

  /** Modal title */
  title?: string;

  /** Size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

/**
 * Props for ImportModal component.
 */
export interface ImportModalProps extends BaseModalProps {
  /** Files selected for import */
  files: File[];

  /** Add files handler */
  onAddFiles: (files: File[]) => void;

  /** Remove file handler */
  onRemoveFile: (index: number) => void;

  /** Start import handler */
  onStartImport: () => void;

  /** Import progress (0-100) */
  importProgress: number | null;

  /** Whether importing */
  isImporting: boolean;

  /** Import errors */
  errors: Array<{ fileName: string; error: string }>;
}

/**
 * Props for ExportModal component.
 */
export interface ExportModalProps extends BaseModalProps {
  /** Export format options */
  formatOptions: Array<{ value: string; label: string }>;

  /** Selected format */
  selectedFormat: string;

  /** Format change handler */
  onFormatChange: (format: string) => void;

  /** Date range for export */
  dateRange: { start: string; end: string };

  /** Date range change handler */
  onDateRangeChange: (range: { start: string; end: string }) => void;

  /** Start export handler */
  onExport: () => void;

  /** Whether exporting */
  isExporting: boolean;
}
