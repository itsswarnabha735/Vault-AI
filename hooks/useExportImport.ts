/**
 * Export/Import Hooks for Vault-AI
 *
 * React hooks for managing data export and import operations.
 */

import { useState, useCallback, useEffect } from 'react';

import {
  exportService,
  importService,
  downloadExportResult,
  type ExportFormat,
  type ExportFilters,
  type ExportProgress,
  type ExportResult,
  type ImportProgress,
  type ImportResult,
  type ValidationResult,
  type ImportOptions,
  DEFAULT_IMPORT_OPTIONS,
} from '@/lib/export';

// ============================================
// Types
// ============================================

/**
 * Options for useExport hook.
 */
export interface UseExportOptions {
  /** Callback when export completes */
  onComplete?: (result: ExportResult) => void;

  /** Callback when export fails */
  onError?: (error: string) => void;

  /** Auto-download on complete */
  autoDownload?: boolean;
}

/**
 * Return type for useExport hook.
 */
export interface UseExportReturn {
  /** Current export progress */
  progress: ExportProgress;

  /** Whether an export is in progress */
  isExporting: boolean;

  /** Last export result */
  lastResult: ExportResult | null;

  /** Export transactions */
  exportTransactions: (
    format: ExportFormat,
    filters?: ExportFilters
  ) => Promise<ExportResult>;

  /** Export documents */
  exportDocuments: () => Promise<ExportResult>;

  /** Export complete backup */
  exportAll: (includeDocuments?: boolean) => Promise<ExportResult>;

  /** Download a result */
  download: (result: ExportResult) => void;

  /** Cancel ongoing export */
  cancel: () => void;

  /** Reset state */
  reset: () => void;
}

/**
 * Options for useImport hook.
 */
export interface UseImportOptions {
  /** Callback when import completes */
  onComplete?: (result: ImportResult) => void;

  /** Callback when import fails */
  onError?: (error: string) => void;

  /** Default import options */
  defaultOptions?: Partial<ImportOptions>;
}

/**
 * Return type for useImport hook.
 */
export interface UseImportReturn {
  /** Current import progress */
  progress: ImportProgress;

  /** Whether an import is in progress */
  isImporting: boolean;

  /** Validation result */
  validation: ValidationResult | null;

  /** Last import result */
  lastResult: ImportResult | null;

  /** Validate a file before import */
  validateFile: (file: File) => Promise<ValidationResult>;

  /** Import from backup */
  importBackup: (
    file: File,
    options?: Partial<ImportOptions>
  ) => Promise<ImportResult>;

  /** Import from CSV */
  importCSV: (
    file: File,
    options?: Partial<ImportOptions>
  ) => Promise<ImportResult>;

  /** Cancel ongoing import */
  cancel: () => void;

  /** Reset state */
  reset: () => void;
}

// ============================================
// useExport Hook
// ============================================

/**
 * Hook for managing data exports.
 *
 * @param options - Export options
 * @returns Export state and methods
 *
 * @example
 * ```tsx
 * const { exportTransactions, progress, isExporting } = useExport({
 *   autoDownload: true,
 *   onComplete: (result) => toast.success('Export complete!'),
 * });
 *
 * // Export as CSV
 * await exportTransactions('csv');
 *
 * // Export with filters
 * await exportTransactions('json', {
 *   dateRange: { start: '2024-01-01', end: '2024-12-31' },
 * });
 * ```
 */
export function useExport(options: UseExportOptions = {}): UseExportReturn {
  const { onComplete, onError, autoDownload = true } = options;

  const [progress, setProgress] = useState<ExportProgress>(
    exportService.getProgress()
  );
  const [lastResult, setLastResult] = useState<ExportResult | null>(null);

  const isExporting =
    progress.stage === 'exporting' || progress.stage === 'compressing';

  // Subscribe to progress updates
  useEffect(() => {
    const unsubscribe = exportService.onProgress(setProgress);
    return unsubscribe;
  }, []);

  /**
   * Export transactions.
   */
  const exportTransactions = useCallback(
    async (
      format: ExportFormat,
      filters?: ExportFilters
    ): Promise<ExportResult> => {
      try {
        const result = await exportService.exportTransactions(format, filters);
        setLastResult(result);

        if (result.success) {
          if (autoDownload) {
            downloadExportResult(result);
          }
          onComplete?.(result);
        } else {
          onError?.(result.error || 'Export failed');
        }

        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Export failed';
        onError?.(error);
        return { success: false, error };
      }
    },
    [autoDownload, onComplete, onError]
  );

  /**
   * Export documents.
   */
  const exportDocumentsHandler =
    useCallback(async (): Promise<ExportResult> => {
      try {
        const result = await exportService.exportDocuments();
        setLastResult(result);

        if (result.success) {
          if (autoDownload) {
            downloadExportResult(result);
          }
          onComplete?.(result);
        } else {
          onError?.(result.error || 'Export failed');
        }

        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Export failed';
        onError?.(error);
        return { success: false, error };
      }
    }, [autoDownload, onComplete, onError]);

  /**
   * Export complete backup.
   */
  const exportAll = useCallback(
    async (includeDocuments: boolean = false): Promise<ExportResult> => {
      try {
        const result = await exportService.exportAll(includeDocuments);
        setLastResult(result);

        if (result.success) {
          if (autoDownload) {
            downloadExportResult(result);
          }
          onComplete?.(result);
        } else {
          onError?.(result.error || 'Export failed');
        }

        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Export failed';
        onError?.(error);
        return { success: false, error };
      }
    },
    [autoDownload, onComplete, onError]
  );

  /**
   * Download a result.
   */
  const download = useCallback((result: ExportResult) => {
    downloadExportResult(result);
  }, []);

  /**
   * Cancel ongoing export.
   */
  const cancel = useCallback(() => {
    exportService.cancel();
  }, []);

  /**
   * Reset state.
   */
  const reset = useCallback(() => {
    setLastResult(null);
    setProgress(exportService.getProgress());
  }, []);

  return {
    progress,
    isExporting,
    lastResult,
    exportTransactions,
    exportDocuments: exportDocumentsHandler,
    exportAll,
    download,
    cancel,
    reset,
  };
}

// ============================================
// useImport Hook
// ============================================

/**
 * Hook for managing data imports.
 *
 * @param options - Import options
 * @returns Import state and methods
 *
 * @example
 * ```tsx
 * const { validateFile, importBackup, progress, isImporting } = useImport({
 *   onComplete: (result) => toast.success(`Imported ${result.stats?.transactionsImported} transactions`),
 * });
 *
 * // Validate first
 * const validation = await validateFile(file);
 * if (validation.isValid) {
 *   await importBackup(file);
 * }
 * ```
 */
export function useImport(options: UseImportOptions = {}): UseImportReturn {
  const { onComplete, onError, defaultOptions } = options;

  const [progress, setProgress] = useState<ImportProgress>(
    importService.getProgress()
  );
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  const isImporting = progress.stage === 'importing';

  // Subscribe to progress updates
  useEffect(() => {
    const unsubscribe = importService.onProgress(setProgress);
    return unsubscribe;
  }, []);

  /**
   * Validate a file before import.
   */
  const validateFileHandler = useCallback(
    async (file: File): Promise<ValidationResult> => {
      const result = await importService.validateFile(file);
      setValidation(result);
      return result;
    },
    []
  );

  /**
   * Import from backup.
   */
  const importBackupHandler = useCallback(
    async (
      file: File,
      options?: Partial<ImportOptions>
    ): Promise<ImportResult> => {
      try {
        const mergedOptions = {
          ...DEFAULT_IMPORT_OPTIONS,
          ...defaultOptions,
          ...options,
        };

        const result = await importService.importFromBackup(
          file,
          mergedOptions
        );
        setLastResult(result);

        if (result.success) {
          onComplete?.(result);
        } else {
          onError?.(result.error || 'Import failed');
        }

        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Import failed';
        onError?.(error);
        return { success: false, error };
      }
    },
    [defaultOptions, onComplete, onError]
  );

  /**
   * Import from CSV.
   */
  const importCSVHandler = useCallback(
    async (
      file: File,
      options?: Partial<ImportOptions>
    ): Promise<ImportResult> => {
      try {
        const mergedOptions = {
          ...DEFAULT_IMPORT_OPTIONS,
          ...defaultOptions,
          ...options,
        };

        const result = await importService.importTransactionsCSV(
          file,
          mergedOptions
        );
        setLastResult(result);

        if (result.success) {
          onComplete?.(result);
        } else {
          onError?.(result.error || 'Import failed');
        }

        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Import failed';
        onError?.(error);
        return { success: false, error };
      }
    },
    [defaultOptions, onComplete, onError]
  );

  /**
   * Cancel ongoing import.
   */
  const cancel = useCallback(() => {
    importService.cancel();
  }, []);

  /**
   * Reset state.
   */
  const reset = useCallback(() => {
    setValidation(null);
    setLastResult(null);
    setProgress(importService.getProgress());
  }, []);

  return {
    progress,
    isImporting,
    validation,
    lastResult,
    validateFile: validateFileHandler,
    importBackup: importBackupHandler,
    importCSV: importCSVHandler,
    cancel,
    reset,
  };
}

// ============================================
// Combined Hook
// ============================================

/**
 * Combined hook for both export and import.
 */
export function useExportImport(
  exportOptions?: UseExportOptions,
  importOptions?: UseImportOptions
) {
  const exportHook = useExport(exportOptions);
  const importHook = useImport(importOptions);

  return {
    export: exportHook,
    import: importHook,
  };
}
