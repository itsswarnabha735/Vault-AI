/**
 * Hooks Exports
 *
 * Re-exports all custom hooks for easy importing.
 */

// Authentication hooks
export {
  useAuth,
  useUser,
  useIsAuthenticated,
  type AuthState,
  type AuthActions,
  type UseAuthReturn,
} from './useAuth';

// Local database hooks
export {
  // Transaction hooks
  useTransactions,
  useTransaction,
  useTransactionActions,
  // Category hooks
  useCategories,
  useCategory,
  useCategoryActions,
  // Budget hooks
  useBudgets,
  useBudget,
  useBudgetActions,
  // Anomaly hooks
  useAnomalies,
  useTransactionAnomalies,
  useAnomalyActions,
  // Search history hooks
  useSearchHistory,
  // Database utility hooks
  useDbStats,
  usePendingSync,
  useDbInitialization,
  // Types
  type TransactionFilters,
  type BudgetWithStatus,
  type DatabaseStatus,
} from './useLocalDB';

// User settings hooks
export {
  // Main settings hook
  useSettings,
  // Theme hook
  useTheme,
  // Convenience hooks
  useCurrency,
  useTimezone,
  useDateFormat,
  useAnomalySettings,
  useSyncSettings,
  // Constants
  CURRENCY_OPTIONS,
  TIMEZONE_OPTIONS,
  DATE_FORMAT_OPTIONS,
  THEME_OPTIONS,
  // Types
  type SettingsUpdate,
  type UseSettingsReturn,
} from './useSettings';

// OPFS (Origin Private File System) hooks
export {
  // Initialization
  useOPFSInit,
  // Storage statistics
  useOPFSStorage,
  // File operations
  useFileUpload,
  useFileDownload,
  useFileDelete,
  // Thumbnails
  useThumbnail,
  // Export and cleanup
  useExport,
  useCleanup,
  // Combined hook
  useOPFS,
  // Initializer component
  OPFSInitializer,
  // Types
  type UseOPFSInitResult,
  type FormattedStorageStats,
  type FileOperationResult,
  type UploadProgress,
} from './useOPFS.js';

// Vector Search hooks
export {
  // Initialization
  useVectorSearchInit,
  // Search
  useVectorSearch,
  useSemanticSearch,
  // Index management
  useVectorIndex,
  // Similar documents
  useSimilarDocuments,
  // Statistics
  useVectorSearchStats,
  // Types
  type UseVectorSearchInitResult,
  type SearchOptions,
  type EnhancedSearchResult,
  type SearchState,
} from './useVectorSearch';

// Embedding hooks
export {
  // Main embedding hook
  useEmbedding,
  // Simplified model state hook
  useEmbeddingModel,
  // Model status hook
  useEmbeddingStatus,
  // Cleanup function
  terminateEmbeddingWorker,
  // Types
  type ModelLoadingStatus,
  type EmbeddingProgress,
  type UseEmbeddingOptions,
  type UseEmbeddingReturn,
} from './useEmbedding';

// Document Processing hooks
export {
  // Main document processor hook
  useDocumentProcessor,
  // File validation hook
  useFileValidator,
  // Processing status hook
  useProcessingStatus,
  // Types
  type FileProcessingState,
  type BatchProcessingState,
  type UseDocumentProcessorOptions,
  type UseDocumentProcessorReturn,
} from './useDocumentProcessor';

// Sync hooks
export {
  // Main sync hook
  useSync,
  // Lightweight status hook
  useSyncStatus,
  // Conflict management hook
  useSyncConflicts,
  // Manual sync trigger hook
  useSyncNow,
  // Types
  type UseSyncReturn,
} from './useSync';

// Real-time hooks
export {
  // Main realtime hook
  useRealtime,
  // Lightweight status hook
  useRealtimeStatus,
  // Change subscription hook
  useRealtimeChanges,
  // Color helper hook
  useRealtimeColor,
  // Types
  type UseRealtimeOptions,
  type UseRealtimeReturn,
} from './useRealtime';

// Conflict resolution hooks
export {
  // Main conflict hook
  useConflicts,
  // Lightweight count hook
  useConflictCount,
  // Field difference hook
  useConflictDiffs,
  // Newer version hook
  useNewerVersion,
  // Types
  type UseConflictsReturn,
  type ConflictFieldDiff,
} from './useConflicts';

// Chat hooks
export {
  // Main chat hook
  useChat,
  // Types
  type UseChatOptions,
  type UseChatReturn,
} from './useChat';

// Citation hooks
export {
  // Single citation hook
  useCitation,
  // Multiple citations hook
  useCitations,
  // Transaction for citation hook
  useTransactionForCitation,
  // Analytics hook
  useCitationAnalytics,
  // Types
  type CitationState,
  type UseCitationOptions,
  type UseCitationReturn,
  type UseCitationsReturn,
} from './useCitation';

// Import shortcuts hooks
export {
  // Main shortcuts hook
  useImportShortcuts,
  // Global modal state hook
  useImportModal,
  useImportModalStore,
  // Shortcut hints component
  ShortcutHints,
  // Types
  type ImportShortcutsOptions,
  type UseImportShortcutsReturn,
  type ShortcutHintsProps,
} from './useImportShortcuts';

// Keyboard shortcuts hooks
export {
  // Main hooks
  useKeyboardShortcuts,
  useVaultShortcuts,
  // Utilities
  getShortcutDisplay,
  getShortcutsList,
  // Types
  type ShortcutConfig,
  type UseKeyboardShortcutsOptions,
} from './useKeyboardShortcuts';

// Duplicate detection hooks
export {
  // Main duplicate detection hook
  useDuplicateDetection,
  // Convenience hooks
  useDuplicateCount,
  useHasDuplicateAlert,
  useHasUnresolvedDuplicates,
  // Types
  type DuplicateAlertWithTransactions,
  type UseDuplicateDetectionOptions,
  type UseDuplicateDetectionReturn,
} from './useDuplicateDetection';

// Amount anomaly detection hooks
export {
  // Main amount anomaly detection hook
  useAmountAnomalyDetection,
  // Convenience hooks
  useAmountAnomalyCount,
  useHasAmountAnomalies,
  useVendorStats,
  // Combined anomaly hook for dashboard
  useAllAnomalies,
  // Types
  type AmountAlertWithTransaction,
  type UseAmountAnomalyDetectionOptions,
  type UseAmountAnomalyDetectionReturn,
} from './useAmountAnomalyDetection';

// Export/Import hooks
export {
  // Export hook
  useExport as useDataExport,
  // Import hook
  useImport,
  // Combined hook
  useExportImport,
  // Types
  type UseExportOptions,
  type UseExportReturn,
  type UseImportOptions,
  type UseImportReturn,
} from './useExportImport';
