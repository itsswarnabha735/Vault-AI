/**
 * Vault-AI OPFS (Origin Private File System) Storage Service
 *
 * Provides secure, sandboxed file storage for raw documents.
 * Files stored here NEVER leave the user's device.
 *
 * PRIVACY BOUNDARY:
 * All files in OPFS are privacy-sensitive and must NEVER be
 * transmitted to any server or external service.
 *
 * Directory Structure:
 * /vault-ai/
 * ├── documents/{year}/{month}/{uuid}.{ext}
 * ├── thumbnails/{uuid}_thumb.webp
 * ├── exports/{timestamp}_export.zip
 * └── temp/{uuid}_processing
 */

// Extend FileSystemDirectoryHandle for TypeScript
declare global {
  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    values(): AsyncIterableIterator<FileSystemHandle>;
    keys(): AsyncIterableIterator<string>;
  }
}

// ============================================
// Types
// ============================================

/**
 * Storage statistics.
 */
export interface StorageStats {
  /** Total bytes used by documents */
  documentBytes: number;
  /** Total bytes used by thumbnails */
  thumbnailBytes: number;
  /** Total bytes used overall */
  totalBytes: number;
  /** Number of documents stored */
  documentCount: number;
  /** Number of thumbnails stored */
  thumbnailCount: number;
  /** Estimated available storage (if quota API available) */
  availableBytes: number | null;
  /** Storage quota (if available) */
  quotaBytes: number | null;
  /** Percentage of quota used */
  percentUsed: number | null;
}

/**
 * File metadata returned when saving.
 */
export interface SavedFileInfo {
  /** Full path in OPFS */
  filePath: string;
  /** Original filename */
  originalName: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** When the file was saved */
  savedAt: Date;
}

/**
 * OPFS initialization status.
 */
export interface OPFSStatus {
  /** Whether OPFS is supported */
  isSupported: boolean;
  /** Whether OPFS is initialized */
  isInitialized: boolean;
  /** Whether currently initializing */
  isInitializing: boolean;
  /** Error if initialization failed */
  error: Error | null;
  /** Browser-specific notes */
  browserNotes: string | null;
}

/**
 * Custom error types for OPFS operations.
 */
export class OPFSError extends Error {
  constructor(
    message: string,
    public code: OPFSErrorCode,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'OPFSError';
  }
}

export type OPFSErrorCode =
  | 'NOT_SUPPORTED'
  | 'NOT_INITIALIZED'
  | 'QUOTA_EXCEEDED'
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'CONCURRENT_ACCESS'
  | 'INVALID_PATH'
  | 'DIRECTORY_ERROR'
  | 'UNKNOWN_ERROR';

// ============================================
// Constants
// ============================================

const ROOT_DIR = 'vault-ai';
const DOCUMENTS_DIR = 'documents';
const THUMBNAILS_DIR = 'thumbnails';
const EXPORTS_DIR = 'exports';
const TEMP_DIR = 'temp';

const THUMBNAIL_MAX_SIZE = 200; // Max width/height for thumbnails
const THUMBNAIL_QUALITY = 0.8; // WebP quality (0-1)

// Supported file types
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

// ============================================
// OPFS Service Interface
// ============================================

export interface OPFSService {
  // Lifecycle
  initialize(): Promise<void>;
  isSupported(): boolean;
  getStatus(): OPFSStatus;

  // File Operations
  saveFile(file: File, transactionId: string): Promise<SavedFileInfo>;
  getFile(filePath: string): Promise<File | null>;
  deleteFile(filePath: string): Promise<void>;
  fileExists(filePath: string): Promise<boolean>;

  // Thumbnail Operations
  generateThumbnail(
    filePath: string,
    transactionId: string
  ): Promise<string | null>;
  getThumbnail(transactionId: string): Promise<Blob | null>;
  deleteThumbnail(transactionId: string): Promise<void>;

  // Storage Management
  getStorageUsage(): Promise<StorageStats>;
  exportAll(): Promise<Blob>;
  cleanup(olderThan?: Date): Promise<number>;
  clearAll(): Promise<void>;

  // Temp File Operations
  createTempFile(transactionId: string): Promise<string>;
  deleteTempFile(transactionId: string): Promise<void>;
  cleanupTempFiles(): Promise<number>;
}

// ============================================
// OPFS Service Implementation
// ============================================

class OPFSServiceImpl implements OPFSService {
  private root: FileSystemDirectoryHandle | null = null;
  private status: OPFSStatus = {
    isSupported: false,
    isInitialized: false,
    isInitializing: false,
    error: null,
    browserNotes: null,
  };

  // ============================================
  // Lifecycle Methods
  // ============================================

  /**
   * Check if OPFS is supported in this browser.
   */
  isSupported(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    // Check for File System Access API
    const hasStorageManager = 'storage' in navigator;
    const hasGetDirectory =
      hasStorageManager &&
      'getDirectory' in (navigator.storage as StorageManager);

    return hasGetDirectory;
  }

  /**
   * Get current OPFS status.
   */
  getStatus(): OPFSStatus {
    return { ...this.status };
  }

  /**
   * Initialize OPFS and create directory structure.
   */
  async initialize(): Promise<void> {
    if (this.status.isInitialized) {
      return;
    }
    if (this.status.isInitializing) {
      return;
    }

    this.status.isInitializing = true;

    try {
      // Check support
      if (!this.isSupported()) {
        this.status.isSupported = false;
        this.status.browserNotes = this.getBrowserNotes();
        throw new OPFSError(
          'OPFS is not supported in this browser',
          'NOT_SUPPORTED',
          false
        );
      }

      this.status.isSupported = true;

      // Get root directory
      this.root = await navigator.storage.getDirectory();

      // Create directory structure
      await this.ensureDirectory(ROOT_DIR);
      await this.ensureDirectory(`${ROOT_DIR}/${DOCUMENTS_DIR}`);
      await this.ensureDirectory(`${ROOT_DIR}/${THUMBNAILS_DIR}`);
      await this.ensureDirectory(`${ROOT_DIR}/${EXPORTS_DIR}`);
      await this.ensureDirectory(`${ROOT_DIR}/${TEMP_DIR}`);

      this.status.isInitialized = true;
      this.status.error = null;

      // Check for Safari-specific notes
      this.status.browserNotes = this.getBrowserNotes();
    } catch (error) {
      this.status.error = error as Error;
      if (!(error instanceof OPFSError)) {
        throw new OPFSError(
          `Failed to initialize OPFS: ${(error as Error).message}`,
          'UNKNOWN_ERROR',
          true
        );
      }
      throw error;
    } finally {
      this.status.isInitializing = false;
    }
  }

  /**
   * Get browser-specific notes.
   */
  private getBrowserNotes(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const ua = navigator.userAgent;

    if (ua.includes('Safari') && !ua.includes('Chrome')) {
      return 'Safari requires iOS 15.4+ or macOS Safari 15.4+ for OPFS support.';
    }

    if (ua.includes('Firefox')) {
      return 'Firefox requires version 111+ for OPFS support.';
    }

    return null;
  }

  // ============================================
  // Directory Helpers
  // ============================================

  /**
   * Ensure a directory exists, creating it if necessary.
   */
  private async ensureDirectory(
    path: string
  ): Promise<FileSystemDirectoryHandle> {
    if (!this.root) {
      throw new OPFSError('OPFS not initialized', 'NOT_INITIALIZED');
    }

    const parts = path.split('/').filter(Boolean);
    let current = this.root;

    for (const part of parts) {
      try {
        current = await current.getDirectoryHandle(part, { create: true });
      } catch {
        throw new OPFSError(
          `Failed to create directory: ${path}`,
          'DIRECTORY_ERROR'
        );
      }
    }

    return current;
  }

  /**
   * Get a directory handle by path.
   */
  private async getDirectory(
    path: string
  ): Promise<FileSystemDirectoryHandle | null> {
    if (!this.root) {
      throw new OPFSError('OPFS not initialized', 'NOT_INITIALIZED');
    }

    const parts = path.split('/').filter(Boolean);
    let current = this.root;

    for (const part of parts) {
      try {
        current = await current.getDirectoryHandle(part);
      } catch {
        return null;
      }
    }

    return current;
  }

  /**
   * Get the document directory path for a date.
   */
  private getDocumentPath(date: Date = new Date()): string {
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${ROOT_DIR}/${DOCUMENTS_DIR}/${year}/${month}`;
  }

  /**
   * Extract file extension from filename or MIME type.
   */
  private getExtension(file: File): string {
    // Try to get from filename
    const nameParts = file.name.split('.');
    if (nameParts.length > 1) {
      return nameParts.pop()!.toLowerCase();
    }

    // Fall back to MIME type
    const mimeMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'image/heif': 'heif',
    };

    return mimeMap[file.type] || 'bin';
  }

  // ============================================
  // File Operations
  // ============================================

  /**
   * Save a file to OPFS.
   */
  async saveFile(file: File, transactionId: string): Promise<SavedFileInfo> {
    this.ensureInitialized();

    try {
      const ext = this.getExtension(file);
      const dirPath = this.getDocumentPath();
      const fileName = `${transactionId}.${ext}`;
      const filePath = `${dirPath}/${fileName}`;

      // Ensure directory exists
      const dir = await this.ensureDirectory(dirPath);

      // Create file handle
      const fileHandle = await dir.getFileHandle(fileName, { create: true });

      // Write file
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(file);
      } finally {
        await writable.close();
      }

      return {
        filePath,
        originalName: file.name,
        size: file.size,
        mimeType: file.type,
        savedAt: new Date(),
      };
    } catch (error) {
      if ((error as Error).name === 'QuotaExceededError') {
        throw new OPFSError(
          'Storage quota exceeded. Please delete some files to free up space.',
          'QUOTA_EXCEEDED'
        );
      }
      throw new OPFSError(
        `Failed to save file: ${(error as Error).message}`,
        'UNKNOWN_ERROR'
      );
    }
  }

  /**
   * Get a file from OPFS.
   */
  async getFile(filePath: string): Promise<File | null> {
    this.ensureInitialized();

    try {
      const parts = filePath.split('/');
      const fileName = parts.pop()!;
      const dirPath = parts.join('/');

      const dir = await this.getDirectory(dirPath);
      if (!dir) {
        return null;
      }

      const fileHandle = await dir.getFileHandle(fileName);
      return await fileHandle.getFile();
    } catch (error) {
      if ((error as Error).name === 'NotFoundError') {
        return null;
      }
      throw new OPFSError(
        `Failed to get file: ${(error as Error).message}`,
        'UNKNOWN_ERROR'
      );
    }
  }

  /**
   * Delete a file from OPFS.
   */
  async deleteFile(filePath: string): Promise<void> {
    this.ensureInitialized();

    try {
      const parts = filePath.split('/');
      const fileName = parts.pop()!;
      const dirPath = parts.join('/');

      const dir = await this.getDirectory(dirPath);
      if (!dir) {
        return;
      }

      await dir.removeEntry(fileName);
    } catch (error) {
      if ((error as Error).name === 'NotFoundError') {
        return; // File already deleted
      }
      throw new OPFSError(
        `Failed to delete file: ${(error as Error).message}`,
        'UNKNOWN_ERROR'
      );
    }
  }

  /**
   * Check if a file exists.
   */
  async fileExists(filePath: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const parts = filePath.split('/');
      const fileName = parts.pop()!;
      const dirPath = parts.join('/');

      const dir = await this.getDirectory(dirPath);
      if (!dir) {
        return false;
      }

      await dir.getFileHandle(fileName);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================
  // Thumbnail Operations
  // ============================================

  /**
   * Generate a thumbnail for a file.
   */
  async generateThumbnail(
    filePath: string,
    transactionId: string
  ): Promise<string | null> {
    this.ensureInitialized();

    try {
      const file = await this.getFile(filePath);
      if (!file) {
        return null;
      }

      let thumbnailBlob: Blob | null = null;

      if (file.type.startsWith('image/')) {
        thumbnailBlob = await this.createImageThumbnail(file);
      } else if (file.type === 'application/pdf') {
        thumbnailBlob = await this.createPdfThumbnail(file);
      }

      if (!thumbnailBlob) {
        return null;
      }

      // Save thumbnail
      const thumbnailPath = `${ROOT_DIR}/${THUMBNAILS_DIR}/${transactionId}_thumb.webp`;
      const dir = await this.ensureDirectory(`${ROOT_DIR}/${THUMBNAILS_DIR}`);
      const fileHandle = await dir.getFileHandle(
        `${transactionId}_thumb.webp`,
        { create: true }
      );

      const writable = await fileHandle.createWritable();
      try {
        await writable.write(thumbnailBlob);
      } finally {
        await writable.close();
      }

      return thumbnailPath;
    } catch (error) {
      // Thumbnail generation is non-critical, log and return null
      console.warn('Failed to generate thumbnail:', error);
      return null;
    }
  }

  /**
   * Create thumbnail from image file.
   */
  private async createImageThumbnail(file: File): Promise<Blob | null> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        // Calculate dimensions
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > THUMBNAIL_MAX_SIZE) {
            height = (height * THUMBNAIL_MAX_SIZE) / width;
            width = THUMBNAIL_MAX_SIZE;
          }
        } else {
          if (height > THUMBNAIL_MAX_SIZE) {
            width = (width * THUMBNAIL_MAX_SIZE) / height;
            height = THUMBNAIL_MAX_SIZE;
          }
        }

        // Draw to canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP
        canvas.toBlob((blob) => resolve(blob), 'image/webp', THUMBNAIL_QUALITY);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };

      img.src = url;
    });
  }

  /**
   * Create thumbnail from PDF (first page).
   */
  private async createPdfThumbnail(file: File): Promise<Blob | null> {
    try {
      // Dynamically import PDF.js
      const pdfjs = await import('pdfjs-dist');

      // Set worker source
      if (typeof window !== 'undefined') {
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);

      // Calculate scale to fit thumbnail
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        THUMBNAIL_MAX_SIZE / viewport.width,
        THUMBNAIL_MAX_SIZE / viewport.height
      );
      const scaledViewport = page.getViewport({ scale });

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return null;
      }

      // Render page
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (page.render as any)({
        canvasContext: ctx,
        viewport: scaledViewport,
      }).promise;

      // Convert to WebP
      return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/webp', THUMBNAIL_QUALITY);
      });
    } catch (error) {
      console.warn('Failed to create PDF thumbnail:', error);
      return null;
    }
  }

  /**
   * Get a thumbnail by transaction ID.
   */
  async getThumbnail(transactionId: string): Promise<Blob | null> {
    this.ensureInitialized();

    try {
      const dir = await this.getDirectory(`${ROOT_DIR}/${THUMBNAILS_DIR}`);
      if (!dir) {
        return null;
      }

      const fileHandle = await dir.getFileHandle(`${transactionId}_thumb.webp`);
      const file = await fileHandle.getFile();
      return file;
    } catch {
      return null;
    }
  }

  /**
   * Delete a thumbnail.
   */
  async deleteThumbnail(transactionId: string): Promise<void> {
    this.ensureInitialized();

    try {
      const dir = await this.getDirectory(`${ROOT_DIR}/${THUMBNAILS_DIR}`);
      if (!dir) {
        return;
      }

      await dir.removeEntry(`${transactionId}_thumb.webp`);
    } catch {
      // Thumbnail might not exist, ignore
    }
  }

  // ============================================
  // Storage Management
  // ============================================

  /**
   * Get storage usage statistics.
   */
  async getStorageUsage(): Promise<StorageStats> {
    this.ensureInitialized();

    const stats: StorageStats = {
      documentBytes: 0,
      thumbnailBytes: 0,
      totalBytes: 0,
      documentCount: 0,
      thumbnailCount: 0,
      availableBytes: null,
      quotaBytes: null,
      percentUsed: null,
    };

    try {
      // Calculate document usage
      const docStats = await this.calculateDirectorySize(
        `${ROOT_DIR}/${DOCUMENTS_DIR}`
      );
      stats.documentBytes = docStats.bytes;
      stats.documentCount = docStats.count;

      // Calculate thumbnail usage
      const thumbStats = await this.calculateDirectorySize(
        `${ROOT_DIR}/${THUMBNAILS_DIR}`
      );
      stats.thumbnailBytes = thumbStats.bytes;
      stats.thumbnailCount = thumbStats.count;

      stats.totalBytes = stats.documentBytes + stats.thumbnailBytes;

      // Try to get quota info
      if ('estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        stats.quotaBytes = estimate.quota ?? null;
        stats.availableBytes =
          estimate.quota && estimate.usage
            ? estimate.quota - estimate.usage
            : null;
        stats.percentUsed =
          estimate.quota && estimate.usage
            ? (estimate.usage / estimate.quota) * 100
            : null;
      }
    } catch (error) {
      console.warn('Failed to calculate storage usage:', error);
    }

    return stats;
  }

  /**
   * Calculate size of a directory recursively.
   */
  private async calculateDirectorySize(
    path: string
  ): Promise<{ bytes: number; count: number }> {
    let bytes = 0;
    let count = 0;

    const dir = await this.getDirectory(path);
    if (!dir) {
      return { bytes: 0, count: 0 };
    }

    try {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'file') {
          const fileHandle = handle as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          bytes += file.size;
          count++;
        } else if (handle.kind === 'directory') {
          const subStats = await this.calculateDirectorySize(`${path}/${name}`);
          bytes += subStats.bytes;
          count += subStats.count;
        }
      }
    } catch {
      // Directory might not exist
    }

    return { bytes, count };
  }

  /**
   * Export all documents as a ZIP file.
   */
  async exportAll(): Promise<Blob> {
    this.ensureInitialized();

    // Dynamic import for JSZip (must be installed)
    // Note: In a real implementation, you'd want to add JSZip as a dependency
    // For now, we'll create a simple concatenated file list
    const files: Array<{ name: string; data: Blob }> = [];

    try {
      await this.collectFilesRecursive(
        `${ROOT_DIR}/${DOCUMENTS_DIR}`,
        '',
        files
      );

      // Try to use JSZip if available (optional dependency)
      // If not available, fall back to JSON manifest
      const zipResult = await this.tryCreateZip(files);
      if (zipResult) {
        return zipResult;
      }

      // JSZip not available, return manifest as JSON
      const manifest = files.map((f) => ({
        name: f.name,
        size: f.data.size,
        type: f.data.type,
      }));

      return new Blob([JSON.stringify(manifest, null, 2)], {
        type: 'application/json',
      });
    } catch (error) {
      throw new OPFSError(
        `Failed to export files: ${(error as Error).message}`,
        'UNKNOWN_ERROR'
      );
    }
  }

  /**
   * Try to create a ZIP file using JSZip (optional dependency).
   */
  private async tryCreateZip(
    files: Array<{ name: string; data: Blob }>
  ): Promise<Blob | null> {
    try {
      // Check if JSZip is available in window (optional dependency)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const globalJSZip = (globalThis as any).JSZip;
      if (globalJSZip) {
        const zip = new globalJSZip();
        for (const file of files) {
          zip.file(file.name, file.data);
        }
        return await zip.generateAsync({ type: 'blob' });
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Collect all files recursively.
   */
  private async collectFilesRecursive(
    path: string,
    relativePath: string,
    files: Array<{ name: string; data: Blob }>
  ): Promise<void> {
    const dir = await this.getDirectory(path);
    if (!dir) {
      return;
    }

    for await (const [name, handle] of dir.entries()) {
      const fullRelativePath = relativePath ? `${relativePath}/${name}` : name;

      if (handle.kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        files.push({ name: fullRelativePath, data: file });
      } else if (handle.kind === 'directory') {
        await this.collectFilesRecursive(
          `${path}/${name}`,
          fullRelativePath,
          files
        );
      }
    }
  }

  /**
   * Clean up orphaned files.
   */
  async cleanup(_olderThan?: Date): Promise<number> {
    this.ensureInitialized();

    let deleted = 0;

    try {
      // Clean up temp files
      deleted += await this.cleanupTempFiles();

      // TODO: If _olderThan is specified, clean up old documents
      // This would require tracking file dates via a separate metadata store
      // For now, we only clean up temp files

      // Clean up empty directories
      await this.cleanupEmptyDirectories(`${ROOT_DIR}/${DOCUMENTS_DIR}`);
    } catch (error) {
      console.warn('Cleanup error:', error);
    }

    return deleted;
  }

  /**
   * Clean up empty directories.
   */
  private async cleanupEmptyDirectories(path: string): Promise<void> {
    const dir = await this.getDirectory(path);
    if (!dir) {
      return;
    }

    const entries: string[] = [];
    for await (const [name, handle] of dir.entries()) {
      entries.push(name);
      if (handle.kind === 'directory') {
        await this.cleanupEmptyDirectories(`${path}/${name}`);
      }
    }

    // Don't delete the root documents directory
    if (path !== `${ROOT_DIR}/${DOCUMENTS_DIR}` && entries.length === 0) {
      try {
        const parent = await this.getDirectory(
          path.split('/').slice(0, -1).join('/')
        );
        if (parent) {
          await parent.removeEntry(path.split('/').pop()!);
        }
      } catch {
        // Ignore errors when deleting empty directories
      }
    }
  }

  /**
   * Clear all files (USE WITH CAUTION).
   */
  async clearAll(): Promise<void> {
    this.ensureInitialized();

    if (!this.root) {
      return;
    }

    try {
      await this.root.removeEntry(ROOT_DIR, { recursive: true });

      // Recreate directory structure
      await this.ensureDirectory(ROOT_DIR);
      await this.ensureDirectory(`${ROOT_DIR}/${DOCUMENTS_DIR}`);
      await this.ensureDirectory(`${ROOT_DIR}/${THUMBNAILS_DIR}`);
      await this.ensureDirectory(`${ROOT_DIR}/${EXPORTS_DIR}`);
      await this.ensureDirectory(`${ROOT_DIR}/${TEMP_DIR}`);
    } catch (error) {
      throw new OPFSError(
        `Failed to clear storage: ${(error as Error).message}`,
        'UNKNOWN_ERROR'
      );
    }
  }

  // ============================================
  // Temp File Operations
  // ============================================

  /**
   * Create a temp file for processing.
   */
  async createTempFile(transactionId: string): Promise<string> {
    this.ensureInitialized();

    const tempPath = `${ROOT_DIR}/${TEMP_DIR}/${transactionId}_processing`;
    const dir = await this.ensureDirectory(`${ROOT_DIR}/${TEMP_DIR}`);

    await dir.getFileHandle(`${transactionId}_processing`, { create: true });

    return tempPath;
  }

  /**
   * Delete a temp file.
   */
  async deleteTempFile(transactionId: string): Promise<void> {
    this.ensureInitialized();

    try {
      const dir = await this.getDirectory(`${ROOT_DIR}/${TEMP_DIR}`);
      if (!dir) {
        return;
      }

      await dir.removeEntry(`${transactionId}_processing`);
    } catch {
      // Ignore if not found
    }
  }

  /**
   * Clean up all temp files.
   */
  async cleanupTempFiles(): Promise<number> {
    this.ensureInitialized();

    let deleted = 0;

    try {
      const dir = await this.getDirectory(`${ROOT_DIR}/${TEMP_DIR}`);
      if (!dir) {
        return 0;
      }

      const entries: string[] = [];
      for await (const [name] of dir.entries()) {
        entries.push(name);
      }

      for (const name of entries) {
        try {
          await dir.removeEntry(name);
          deleted++;
        } catch {
          // Ignore individual failures
        }
      }
    } catch {
      // Ignore errors
    }

    return deleted;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Ensure OPFS is initialized.
   */
  private ensureInitialized(): void {
    if (!this.status.isInitialized) {
      throw new OPFSError(
        'OPFS not initialized. Call initialize() first.',
        'NOT_INITIALIZED'
      );
    }
  }

  /**
   * Get all file paths in documents directory.
   */
  async getAllFilePaths(): Promise<string[]> {
    this.ensureInitialized();

    const paths: string[] = [];
    await this.collectPathsRecursive(
      `${ROOT_DIR}/${DOCUMENTS_DIR}`,
      `${ROOT_DIR}/${DOCUMENTS_DIR}`,
      paths
    );
    return paths;
  }

  /**
   * Collect all file paths recursively.
   */
  private async collectPathsRecursive(
    path: string,
    _basePath: string,
    paths: string[]
  ): Promise<void> {
    const dir = await this.getDirectory(path);
    if (!dir) {
      return;
    }

    for await (const [name, handle] of dir.entries()) {
      const fullPath = `${path}/${name}`;

      if (handle.kind === 'file') {
        paths.push(fullPath);
      } else if (handle.kind === 'directory') {
        await this.collectPathsRecursive(fullPath, _basePath, paths);
      }
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Singleton OPFS service instance.
 */
export const opfsService: OPFSService = new OPFSServiceImpl();

// ============================================
// Utility Functions
// ============================================

/**
 * Check if OPFS is supported in the current browser.
 */
export function isOPFSSupported(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const hasStorageManager = 'storage' in navigator;
  const hasGetDirectory =
    hasStorageManager &&
    'getDirectory' in (navigator.storage as StorageManager);

  return hasGetDirectory;
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Get supported file types.
 */
export function getSupportedMimeTypes(): readonly string[] {
  return SUPPORTED_MIME_TYPES;
}

/**
 * Check if a file type is supported.
 */
export function isFileTypeSupported(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.includes(
    mimeType as (typeof SUPPORTED_MIME_TYPES)[number]
  );
}
