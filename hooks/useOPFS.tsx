/**
 * React Hook for OPFS (Origin Private File System) Operations
 *
 * Provides reactive access to OPFS storage with loading states,
 * error handling, and automatic initialization.
 *
 * PRIVACY: All files handled through this hook are stored locally
 * and should NEVER be transmitted to external servers.
 */

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';

import {
  opfsService,
  isOPFSSupported,
  formatBytes,
  type OPFSStatus,
  type StorageStats,
  type SavedFileInfo,
  type OPFSError,
} from '@/lib/storage/opfs';

// ============================================
// Types
// ============================================

/**
 * OPFS initialization state.
 */
export interface UseOPFSInitResult {
  /** Whether OPFS is supported in this browser */
  isSupported: boolean;
  /** Whether OPFS is initialized and ready */
  isInitialized: boolean;
  /** Whether currently initializing */
  isInitializing: boolean;
  /** Initialization error if any */
  error: Error | null;
  /** Browser-specific compatibility notes */
  browserNotes: string | null;
  /** Manually trigger initialization */
  initialize: () => Promise<void>;
}

/**
 * Storage statistics with formatted values.
 */
export interface FormattedStorageStats extends StorageStats {
  /** Human-readable document size */
  documentBytesFormatted: string;
  /** Human-readable thumbnail size */
  thumbnailBytesFormatted: string;
  /** Human-readable total size */
  totalBytesFormatted: string;
  /** Human-readable available space */
  availableBytesFormatted: string | null;
  /** Human-readable quota */
  quotaBytesFormatted: string | null;
}

/**
 * File operation result.
 */
export interface FileOperationResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Upload progress state.
 */
export interface UploadProgress {
  /** Transaction ID being uploaded */
  transactionId: string;
  /** Original filename */
  fileName: string;
  /** Current stage */
  stage: 'saving' | 'thumbnail' | 'complete' | 'error';
  /** Progress percentage (0-100) */
  progress: number;
  /** Error if any */
  error?: Error;
}

// ============================================
// useOPFSInit Hook
// ============================================

/**
 * Hook for OPFS initialization status and control.
 *
 * @example
 * ```tsx
 * const { isSupported, isInitialized, error, initialize } = useOPFSInit();
 *
 * useEffect(() => {
 *   if (isSupported && !isInitialized) {
 *     initialize();
 *   }
 * }, [isSupported, isInitialized]);
 *
 * if (!isSupported) {
 *   return <p>Your browser does not support local file storage.</p>;
 * }
 * ```
 */
export function useOPFSInit(): UseOPFSInitResult {
  const [status, setStatus] = useState<OPFSStatus>(() =>
    opfsService.getStatus()
  );
  const initializingRef = useRef(false);

  const initialize = useCallback(async () => {
    if (initializingRef.current) return;
    initializingRef.current = true;

    setStatus((prev) => ({ ...prev, isInitializing: true, error: null }));

    try {
      await opfsService.initialize();
      setStatus(opfsService.getStatus());
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        isInitializing: false,
        error: error as Error,
      }));
    } finally {
      initializingRef.current = false;
    }
  }, []);

  // Check initial status
  useEffect(() => {
    setStatus(opfsService.getStatus());
  }, []);

  return {
    isSupported: status.isSupported || isOPFSSupported(),
    isInitialized: status.isInitialized,
    isInitializing: status.isInitializing,
    error: status.error,
    browserNotes: status.browserNotes,
    initialize,
  };
}

// ============================================
// useOPFSStorage Hook
// ============================================

/**
 * Hook for storage statistics with automatic refresh.
 *
 * @param refreshInterval - Auto-refresh interval in ms (0 to disable)
 *
 * @example
 * ```tsx
 * const { stats, isLoading, refresh } = useOPFSStorage();
 *
 * return (
 *   <div>
 *     <p>Documents: {stats?.documentCount}</p>
 *     <p>Used: {stats?.totalBytesFormatted}</p>
 *     <p>Available: {stats?.availableBytesFormatted}</p>
 *   </div>
 * );
 * ```
 */
export function useOPFSStorage(refreshInterval: number = 0) {
  const [stats, setStats] = useState<FormattedStorageStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const rawStats = await opfsService.getStorageUsage();

      const formattedStats: FormattedStorageStats = {
        ...rawStats,
        documentBytesFormatted: formatBytes(rawStats.documentBytes),
        thumbnailBytesFormatted: formatBytes(rawStats.thumbnailBytes),
        totalBytesFormatted: formatBytes(rawStats.totalBytes),
        availableBytesFormatted: rawStats.availableBytes
          ? formatBytes(rawStats.availableBytes)
          : null,
        quotaBytesFormatted: rawStats.quotaBytes
          ? formatBytes(rawStats.quotaBytes)
          : null,
      };

      setStats(formattedStats);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and refresh interval
  useEffect(() => {
    const status = opfsService.getStatus();
    if (status.isInitialized) {
      refresh();
    }

    if (refreshInterval > 0 && status.isInitialized) {
      const interval = setInterval(refresh, refreshInterval);
      return () => clearInterval(interval);
    }

    return undefined;
  }, [refresh, refreshInterval]);

  return {
    stats,
    isLoading,
    error,
    refresh,
  };
}

// ============================================
// useFileUpload Hook
// ============================================

/**
 * Hook for uploading files to OPFS.
 *
 * @example
 * ```tsx
 * const { upload, isUploading, progress, error } = useFileUpload();
 *
 * const handleDrop = async (file: File, transactionId: string) => {
 *   const result = await upload(file, transactionId);
 *   if (result) {
 *     console.log('Saved to:', result.filePath);
 *   }
 * };
 * ```
 */
export function useFileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const upload = useCallback(
    async (
      file: File,
      transactionId: string,
      options?: { generateThumbnail?: boolean }
    ): Promise<SavedFileInfo | null> => {
      setIsUploading(true);
      setError(null);
      setProgress({
        transactionId,
        fileName: file.name,
        stage: 'saving',
        progress: 0,
      });

      try {
        // Save file
        setProgress((prev) =>
          prev ? { ...prev, stage: 'saving', progress: 30 } : null
        );

        const savedFile = await opfsService.saveFile(file, transactionId);

        setProgress((prev) =>
          prev ? { ...prev, stage: 'saving', progress: 60 } : null
        );

        // Generate thumbnail if requested
        if (options?.generateThumbnail !== false) {
          setProgress((prev) =>
            prev ? { ...prev, stage: 'thumbnail', progress: 80 } : null
          );

          await opfsService.generateThumbnail(
            savedFile.filePath,
            transactionId
          );
        }

        setProgress((prev) =>
          prev ? { ...prev, stage: 'complete', progress: 100 } : null
        );

        return savedFile;
      } catch (err) {
        const opfsError = err as OPFSError;
        setError(opfsError);
        setProgress((prev) =>
          prev ? { ...prev, stage: 'error', error: opfsError } : null
        );
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setProgress(null);
    setError(null);
  }, []);

  return {
    upload,
    isUploading,
    progress,
    error,
    reset,
  };
}

// ============================================
// useFileDownload Hook
// ============================================

/**
 * Hook for retrieving files from OPFS.
 *
 * @example
 * ```tsx
 * const { getFile, isLoading, error } = useFileDownload();
 *
 * const handleView = async (filePath: string) => {
 *   const file = await getFile(filePath);
 *   if (file) {
 *     const url = URL.createObjectURL(file);
 *     window.open(url, '_blank');
 *   }
 * };
 * ```
 */
export function useFileDownload() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getFile = useCallback(
    async (filePath: string): Promise<File | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const file = await opfsService.getFile(filePath);
        return file;
      } catch (err) {
        setError(err as Error);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const getFileUrl = useCallback(
    async (filePath: string): Promise<string | null> => {
      const file = await getFile(filePath);
      if (!file) return null;
      return URL.createObjectURL(file);
    },
    [getFile]
  );

  return {
    getFile,
    getFileUrl,
    isLoading,
    error,
  };
}

// ============================================
// useThumbnail Hook
// ============================================

/**
 * Hook for loading thumbnails.
 *
 * @param transactionId - Transaction ID to load thumbnail for
 *
 * @example
 * ```tsx
 * const { thumbnailUrl, isLoading, error } = useThumbnail(transaction.id);
 *
 * return thumbnailUrl ? (
 *   <img src={thumbnailUrl} alt="Receipt" />
 * ) : (
 *   <PlaceholderIcon />
 * );
 * ```
 */
export function useThumbnail(transactionId: string | undefined) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!transactionId) {
      setThumbnailUrl(null);
      return;
    }

    let isCancelled = false;
    let objectUrl: string | null = null;

    const loadThumbnail = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const status = opfsService.getStatus();
        if (!status.isInitialized) {
          return;
        }

        const blob = await opfsService.getThumbnail(transactionId);
        if (blob && !isCancelled) {
          objectUrl = URL.createObjectURL(blob);
          setThumbnailUrl(objectUrl);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err as Error);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadThumbnail();

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [transactionId]);

  return {
    thumbnailUrl,
    isLoading,
    error,
  };
}

// ============================================
// useFileDelete Hook
// ============================================

/**
 * Hook for deleting files from OPFS.
 *
 * @example
 * ```tsx
 * const { deleteFile, isDeleting, error } = useFileDelete();
 *
 * const handleDelete = async (transactionId: string, filePath: string) => {
 *   await deleteFile(filePath, transactionId);
 * };
 * ```
 */
export function useFileDelete() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteFile = useCallback(
    async (filePath: string, transactionId?: string): Promise<boolean> => {
      setIsDeleting(true);
      setError(null);

      try {
        // Delete the file
        await opfsService.deleteFile(filePath);

        // Delete associated thumbnail if transactionId provided
        if (transactionId) {
          await opfsService.deleteThumbnail(transactionId);
        }

        return true;
      } catch (err) {
        setError(err as Error);
        return false;
      } finally {
        setIsDeleting(false);
      }
    },
    []
  );

  return {
    deleteFile,
    isDeleting,
    error,
  };
}

// ============================================
// useExport Hook
// ============================================

/**
 * Hook for exporting all files.
 *
 * @example
 * ```tsx
 * const { exportAll, isExporting, error } = useExport();
 *
 * const handleExport = async () => {
 *   const blob = await exportAll();
 *   if (blob) {
 *     const url = URL.createObjectURL(blob);
 *     const a = document.createElement('a');
 *     a.href = url;
 *     a.download = 'vault-ai-export.zip';
 *     a.click();
 *   }
 * };
 * ```
 */
export function useExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const exportAll = useCallback(async (): Promise<Blob | null> => {
    setIsExporting(true);
    setError(null);

    try {
      const blob = await opfsService.exportAll();
      return blob;
    } catch (err) {
      setError(err as Error);
      return null;
    } finally {
      setIsExporting(false);
    }
  }, []);

  return {
    exportAll,
    isExporting,
    error,
  };
}

// ============================================
// useCleanup Hook
// ============================================

/**
 * Hook for storage cleanup operations.
 *
 * @example
 * ```tsx
 * const { cleanup, clearAll, isCleaningUp, deletedCount } = useCleanup();
 *
 * const handleCleanup = async () => {
 *   const deleted = await cleanup();
 *   console.log(`Cleaned up ${deleted} files`);
 * };
 * ```
 */
export function useCleanup() {
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [deletedCount, setDeletedCount] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const cleanup = useCallback(async (olderThan?: Date): Promise<number> => {
    setIsCleaningUp(true);
    setError(null);
    setDeletedCount(null);

    try {
      const deleted = await opfsService.cleanup(olderThan);
      setDeletedCount(deleted);
      return deleted;
    } catch (err) {
      setError(err as Error);
      return 0;
    } finally {
      setIsCleaningUp(false);
    }
  }, []);

  const clearAll = useCallback(async (): Promise<boolean> => {
    setIsCleaningUp(true);
    setError(null);

    try {
      await opfsService.clearAll();
      setDeletedCount(null);
      return true;
    } catch (err) {
      setError(err as Error);
      return false;
    } finally {
      setIsCleaningUp(false);
    }
  }, []);

  return {
    cleanup,
    clearAll,
    isCleaningUp,
    deletedCount,
    error,
  };
}

// ============================================
// Combined useOPFS Hook
// ============================================

/**
 * Combined hook for common OPFS operations.
 * Use this for simple use cases, or use individual hooks for more control.
 *
 * @example
 * ```tsx
 * const {
 *   isSupported,
 *   isInitialized,
 *   initialize,
 *   stats,
 *   upload,
 *   getFile,
 *   deleteFile,
 * } = useOPFS();
 * ```
 */
export function useOPFS() {
  const init = useOPFSInit();
  const storage = useOPFSStorage();
  const fileUpload = useFileUpload();
  const fileDownload = useFileDownload();
  const fileDelete = useFileDelete();
  const exportHook = useExport();
  const cleanupHook = useCleanup();

  return {
    // Initialization
    isSupported: init.isSupported,
    isInitialized: init.isInitialized,
    isInitializing: init.isInitializing,
    initError: init.error,
    browserNotes: init.browserNotes,
    initialize: init.initialize,

    // Storage
    stats: storage.stats,
    refreshStats: storage.refresh,

    // Upload
    upload: fileUpload.upload,
    isUploading: fileUpload.isUploading,
    uploadProgress: fileUpload.progress,
    uploadError: fileUpload.error,
    resetUpload: fileUpload.reset,

    // Download
    getFile: fileDownload.getFile,
    getFileUrl: fileDownload.getFileUrl,
    isDownloading: fileDownload.isLoading,
    downloadError: fileDownload.error,

    // Delete
    deleteFile: fileDelete.deleteFile,
    isDeleting: fileDelete.isDeleting,
    deleteError: fileDelete.error,

    // Export
    exportAll: exportHook.exportAll,
    isExporting: exportHook.isExporting,
    exportError: exportHook.error,

    // Cleanup
    cleanup: cleanupHook.cleanup,
    clearAll: cleanupHook.clearAll,
    isCleaningUp: cleanupHook.isCleaningUp,
  };
}

// ============================================
// Provider Component (Optional)
// ============================================

/**
 * Auto-initialize OPFS on mount.
 * Wrap your app with this to ensure OPFS is ready.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <OPFSInitializer fallback={<LoadingSpinner />}>
 *       <MainContent />
 *     </OPFSInitializer>
 *   );
 * }
 * ```
 */
export function OPFSInitializer({
  children,
  fallback,
  onError,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error) => void;
}) {
  const { isSupported, isInitialized, isInitializing, error, initialize } =
    useOPFSInit();

  useEffect(() => {
    if (isSupported && !isInitialized && !isInitializing) {
      initialize().catch((err) => {
        onError?.(err);
      });
    }
  }, [isSupported, isInitialized, isInitializing, initialize, onError]);

  useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  if (!isSupported) {
    return (
      <div className="p-4 text-center">
        <p className="text-destructive">
          Your browser does not support local file storage (OPFS).
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Please use a modern browser like Chrome 86+, Firefox 111+, or Safari
          15.4+.
        </p>
      </div>
    );
  }

  if (isInitializing) {
    return fallback ?? null;
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-destructive">Failed to initialize file storage.</p>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return <>{children}</>;
}
