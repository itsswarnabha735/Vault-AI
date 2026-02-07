/**
 * Export Service for Vault-AI
 *
 * Provides functionality to export user data in various formats:
 * - CSV (spreadsheet-compatible)
 * - JSON (complete structured data)
 * - ZIP (documents archive)
 * - Full backup (all data + documents)
 *
 * PRIVACY: Export only includes sanitized data.
 * Raw text and embeddings are NEVER included in exports.
 */

import { db } from '@/lib/storage/db';
import { opfsService } from '@/lib/storage/opfs-service';
import type {
  LocalTransaction,
  Category,
  Budget,
  UserSettings,
  CategoryId,
} from '@/types/database';

// ============================================
// Types
// ============================================

/**
 * Export format options.
 */
export type ExportFormat = 'csv' | 'json';

/**
 * Filters for transaction exports.
 */
export interface ExportFilters {
  /** Date range filter */
  dateRange?: {
    start: string;
    end: string;
  };

  /** Category IDs to include */
  categories?: CategoryId[];

  /** Minimum amount filter */
  minAmount?: number;

  /** Maximum amount filter */
  maxAmount?: number;

  /** Vendor name filter (partial match) */
  vendor?: string;
}

/**
 * Export progress tracking.
 */
export interface ExportProgress {
  /** Current stage of export */
  stage:
    | 'idle'
    | 'preparing'
    | 'exporting'
    | 'compressing'
    | 'complete'
    | 'error';

  /** Progress percentage (0-100) */
  progress: number;

  /** Current item being processed */
  currentItem?: string;

  /** Total items to process */
  totalItems: number;

  /** Items processed so far */
  processedItems: number;

  /** Error message if failed */
  error?: string;
}

/**
 * Export result.
 */
export interface ExportResult {
  /** Whether export was successful */
  success: boolean;

  /** Exported data blob */
  blob?: Blob;

  /** Suggested filename */
  filename?: string;

  /** Error message if failed */
  error?: string;

  /** Export statistics */
  stats?: {
    transactionCount: number;
    documentCount: number;
    totalSize: number;
  };
}

/**
 * Backup metadata for versioning.
 */
export interface BackupMetadata {
  /** Export version */
  version: string;

  /** Export timestamp */
  exportedAt: string;

  /** Application version */
  appVersion: string;

  /** Data counts */
  counts: {
    transactions: number;
    categories: number;
    budgets: number;
    documents: number;
  };
}

/**
 * Complete backup data structure.
 */
export interface BackupData {
  /** Backup metadata */
  metadata: BackupMetadata;

  /** Settings */
  settings: UserSettings | null;

  /** Categories */
  categories: Array<
    Omit<Category, 'createdAt' | 'updatedAt'> & {
      createdAt: string;
      updatedAt: string;
    }
  >;

  /** Budgets */
  budgets: Array<
    Omit<Budget, 'createdAt' | 'updatedAt'> & {
      createdAt: string;
      updatedAt: string;
    }
  >;

  /** Transactions (sanitized) */
  transactions: Array<{
    id: string;
    date: string;
    amount: number;
    vendor: string;
    category: CategoryId | null;
    note: string;
    currency: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

/**
 * Export service interface.
 */
export interface ExportService {
  /** Export transactions in specified format */
  exportTransactions(
    format: ExportFormat,
    filters?: ExportFilters
  ): Promise<ExportResult>;

  /** Export all documents as ZIP */
  exportDocuments(): Promise<ExportResult>;

  /** Export complete backup (data + optionally documents) */
  exportAll(includeDocuments?: boolean): Promise<ExportResult>;

  /** Get current export progress */
  getProgress(): ExportProgress;

  /** Subscribe to progress updates */
  onProgress(callback: (progress: ExportProgress) => void): () => void;

  /** Cancel ongoing export */
  cancel(): void;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get file extension from filename.
 */
function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1] || 'bin' : 'bin';
}

/**
 * Sanitize filename for safe export.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_. ]/g, '_').substring(0, 100);
}

/**
 * Format date for filename.
 */
function formatDateForFilename(date: Date = new Date()): string {
  return date.toISOString().split('T')[0] || 'unknown';
}

/**
 * Escape CSV field value.
 */
function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  // If contains comma, newline, or quote, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Get category name by ID.
 */
async function getCategoryName(categoryId: CategoryId | null): Promise<string> {
  if (!categoryId) {
    return '';
  }
  const category = await db.categories.get(categoryId);
  return category?.name || '';
}

// ============================================
// Export Service Implementation
// ============================================

class ExportServiceImpl implements ExportService {
  private progress: ExportProgress = {
    stage: 'idle',
    progress: 0,
    totalItems: 0,
    processedItems: 0,
  };

  private progressListeners: Set<(progress: ExportProgress) => void> =
    new Set();
  private isCancelled = false;

  /**
   * Get current export progress.
   */
  getProgress(): ExportProgress {
    return { ...this.progress };
  }

  /**
   * Subscribe to progress updates.
   */
  onProgress(callback: (progress: ExportProgress) => void): () => void {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  /**
   * Notify all progress listeners.
   */
  private notifyProgress(): void {
    const progress = this.getProgress();
    for (const listener of this.progressListeners) {
      listener(progress);
    }
  }

  /**
   * Update progress.
   */
  private updateProgress(updates: Partial<ExportProgress>): void {
    this.progress = { ...this.progress, ...updates };
    this.notifyProgress();
  }

  /**
   * Reset progress to idle state.
   */
  private resetProgress(): void {
    this.progress = {
      stage: 'idle',
      progress: 0,
      totalItems: 0,
      processedItems: 0,
    };
    this.isCancelled = false;
  }

  /**
   * Cancel ongoing export.
   */
  cancel(): void {
    this.isCancelled = true;
  }

  /**
   * Get filtered transactions.
   */
  private async getFilteredTransactions(
    filters?: ExportFilters
  ): Promise<LocalTransaction[]> {
    let transactions = await db.transactions.toArray();

    if (!filters) {
      return transactions;
    }

    // Apply filters
    if (filters.dateRange) {
      transactions = transactions.filter(
        (tx) =>
          tx.date >= filters.dateRange!.start &&
          tx.date <= filters.dateRange!.end
      );
    }

    if (filters.categories && filters.categories.length > 0) {
      const categorySet = new Set(filters.categories);
      transactions = transactions.filter(
        (tx) => tx.category && categorySet.has(tx.category)
      );
    }

    if (filters.minAmount !== undefined) {
      transactions = transactions.filter(
        (tx) => tx.amount >= filters.minAmount!
      );
    }

    if (filters.maxAmount !== undefined) {
      transactions = transactions.filter(
        (tx) => tx.amount <= filters.maxAmount!
      );
    }

    if (filters.vendor) {
      const vendorLower = filters.vendor.toLowerCase();
      transactions = transactions.filter((tx) =>
        tx.vendor.toLowerCase().includes(vendorLower)
      );
    }

    return transactions;
  }

  /**
   * Export transactions to CSV format.
   */
  async exportTransactionsCSV(filters?: ExportFilters): Promise<ExportResult> {
    try {
      this.resetProgress();
      this.updateProgress({ stage: 'preparing' });

      const transactions = await this.getFilteredTransactions(filters);
      const categories = await db.categories.toArray();
      const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

      this.updateProgress({
        stage: 'exporting',
        totalItems: transactions.length,
        processedItems: 0,
      });

      // CSV headers
      const headers = [
        'Date',
        'Vendor',
        'Amount',
        'Currency',
        'Category',
        'Note',
      ];
      const rows: string[] = [headers.join(',')];

      // Process transactions
      for (let i = 0; i < transactions.length; i++) {
        if (this.isCancelled) {
          this.updateProgress({ stage: 'idle' });
          return { success: false, error: 'Export cancelled' };
        }

        const tx = transactions[i]!;
        const categoryName = tx.category
          ? categoryMap.get(tx.category) || ''
          : '';

        const row = [
          escapeCSV(tx.date),
          escapeCSV(tx.vendor),
          escapeCSV(tx.amount.toFixed(2)),
          escapeCSV(tx.currency),
          escapeCSV(categoryName),
          escapeCSV(tx.note),
        ];

        rows.push(row.join(','));

        this.updateProgress({
          processedItems: i + 1,
          progress: Math.round(((i + 1) / transactions.length) * 100),
          currentItem: tx.vendor,
        });
      }

      const csv = rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const filename = `vault-ai-transactions-${formatDateForFilename()}.csv`;

      this.updateProgress({ stage: 'complete', progress: 100 });

      return {
        success: true,
        blob,
        filename,
        stats: {
          transactionCount: transactions.length,
          documentCount: 0,
          totalSize: blob.size,
        },
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Export failed';
      this.updateProgress({ stage: 'error', error });
      return { success: false, error };
    }
  }

  /**
   * Export transactions to JSON format.
   */
  async exportTransactionsJSON(filters?: ExportFilters): Promise<ExportResult> {
    try {
      this.resetProgress();
      this.updateProgress({ stage: 'preparing' });

      const transactions = await this.getFilteredTransactions(filters);

      this.updateProgress({
        stage: 'exporting',
        totalItems: transactions.length,
        processedItems: 0,
      });

      // Sanitize transactions (exclude sensitive fields)
      const exportData = transactions.map((tx, i) => {
        if (this.isCancelled) {
          throw new Error('Export cancelled');
        }

        this.updateProgress({
          processedItems: i + 1,
          progress: Math.round(((i + 1) / transactions.length) * 100),
          currentItem: tx.vendor,
        });

        return {
          id: tx.id,
          date: tx.date,
          amount: tx.amount,
          vendor: tx.vendor,
          category: tx.category,
          note: tx.note,
          currency: tx.currency,
          createdAt: tx.createdAt.toISOString(),
          updatedAt: tx.updatedAt.toISOString(),
        };
      });

      const jsonString = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          version: '1.0',
          transactionCount: exportData.length,
          transactions: exportData,
        },
        null,
        2
      );

      const blob = new Blob([jsonString], { type: 'application/json' });
      const filename = `vault-ai-transactions-${formatDateForFilename()}.json`;

      this.updateProgress({ stage: 'complete', progress: 100 });

      return {
        success: true,
        blob,
        filename,
        stats: {
          transactionCount: transactions.length,
          documentCount: 0,
          totalSize: blob.size,
        },
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Export failed';
      this.updateProgress({ stage: 'error', error });
      return { success: false, error };
    }
  }

  /**
   * Export transactions in specified format.
   */
  async exportTransactions(
    format: ExportFormat,
    filters?: ExportFilters
  ): Promise<ExportResult> {
    if (format === 'csv') {
      return this.exportTransactionsCSV(filters);
    }
    return this.exportTransactionsJSON(filters);
  }

  /**
   * Export all documents as ZIP archive.
   */
  async exportDocuments(): Promise<ExportResult> {
    try {
      this.resetProgress();
      this.updateProgress({ stage: 'preparing' });

      // Dynamic import of JSZip
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      const transactions = await db.transactions.toArray();
      const transactionsWithFiles = transactions.filter((tx) => tx.filePath);

      this.updateProgress({
        stage: 'exporting',
        totalItems: transactionsWithFiles.length,
        processedItems: 0,
      });

      let documentCount = 0;

      for (let i = 0; i < transactionsWithFiles.length; i++) {
        if (this.isCancelled) {
          this.updateProgress({ stage: 'idle' });
          return { success: false, error: 'Export cancelled' };
        }

        const tx = transactionsWithFiles[i]!;

        try {
          const file = await opfsService.getFile(tx.id);

          if (file) {
            const arrayBuffer = await file.arrayBuffer();
            const extension = getExtension(file.name);
            const sanitizedVendor = sanitizeFilename(tx.vendor);
            const filename = `${tx.date}_${sanitizedVendor}_${tx.id.substring(0, 8)}.${extension}`;

            zip.file(filename, arrayBuffer);
            documentCount++;
          }
        } catch (err) {
          console.warn(
            `Failed to export document for transaction ${tx.id}:`,
            err
          );
        }

        this.updateProgress({
          processedItems: i + 1,
          progress: Math.round(((i + 1) / transactionsWithFiles.length) * 80),
          currentItem: tx.vendor,
        });
      }

      if (documentCount === 0) {
        this.updateProgress({ stage: 'complete', progress: 100 });
        return {
          success: false,
          error: 'No documents to export',
        };
      }

      this.updateProgress({ stage: 'compressing', progress: 85 });

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const filename = `vault-ai-documents-${formatDateForFilename()}.zip`;

      this.updateProgress({ stage: 'complete', progress: 100 });

      return {
        success: true,
        blob,
        filename,
        stats: {
          transactionCount: 0,
          documentCount,
          totalSize: blob.size,
        },
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Export failed';
      this.updateProgress({ stage: 'error', error });
      return { success: false, error };
    }
  }

  /**
   * Export complete backup.
   */
  async exportAll(includeDocuments: boolean = false): Promise<ExportResult> {
    try {
      this.resetProgress();
      this.updateProgress({ stage: 'preparing' });

      // Gather all data
      const [transactions, categories, budgets, settings] = await Promise.all([
        db.transactions.toArray(),
        db.categories.toArray(),
        db.budgets.toArray(),
        db.settings.toArray(),
      ]);

      const totalItems =
        transactions.length +
        (includeDocuments ? transactions.filter((t) => t.filePath).length : 0);

      this.updateProgress({
        stage: 'exporting',
        totalItems,
        processedItems: 0,
      });

      // Build backup data (sanitized)
      const backupData: BackupData = {
        metadata: {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          appVersion: '0.1.0',
          counts: {
            transactions: transactions.length,
            categories: categories.length,
            budgets: budgets.length,
            documents: transactions.filter((t) => t.filePath).length,
          },
        },
        settings: settings[0] || null,
        categories: categories.map((c) => ({
          id: c.id,
          userId: c.userId,
          name: c.name,
          icon: c.icon,
          color: c.color,
          parentId: c.parentId,
          sortOrder: c.sortOrder,
          isDefault: c.isDefault,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
        budgets: budgets.map((b) => ({
          id: b.id,
          userId: b.userId,
          categoryId: b.categoryId,
          amount: b.amount,
          period: b.period,
          startDate: b.startDate,
          isActive: b.isActive,
          createdAt: b.createdAt.toISOString(),
          updatedAt: b.updatedAt.toISOString(),
        })),
        transactions: transactions.map((tx, i) => {
          this.updateProgress({
            processedItems: i + 1,
            progress: Math.round(
              ((i + 1) / transactions.length) * (includeDocuments ? 40 : 90)
            ),
            currentItem: tx.vendor,
          });

          // PRIVACY: Only export sanitized fields
          return {
            id: tx.id,
            date: tx.date,
            amount: tx.amount,
            vendor: tx.vendor,
            category: tx.category,
            note: tx.note,
            currency: tx.currency,
            createdAt: tx.createdAt.toISOString(),
            updatedAt: tx.updatedAt.toISOString(),
          };
        }),
      };

      if (!includeDocuments) {
        // Export as JSON only
        const jsonString = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const filename = `vault-ai-backup-${formatDateForFilename()}.json`;

        this.updateProgress({ stage: 'complete', progress: 100 });

        return {
          success: true,
          blob,
          filename,
          stats: {
            transactionCount: transactions.length,
            documentCount: 0,
            totalSize: blob.size,
          },
        };
      }

      // Export with documents as ZIP
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // Add backup JSON
      zip.file('backup.json', JSON.stringify(backupData, null, 2));

      // Add documents
      const docsFolder = zip.folder('documents');
      const transactionsWithFiles = transactions.filter((tx) => tx.filePath);
      let documentCount = 0;

      for (let i = 0; i < transactionsWithFiles.length; i++) {
        if (this.isCancelled) {
          this.updateProgress({ stage: 'idle' });
          return { success: false, error: 'Export cancelled' };
        }

        const tx = transactionsWithFiles[i]!;

        try {
          const file = await opfsService.getFile(tx.id);

          if (file && docsFolder) {
            const arrayBuffer = await file.arrayBuffer();
            const extension = getExtension(file.name);
            const filename = `${tx.id}.${extension}`;
            docsFolder.file(filename, arrayBuffer);
            documentCount++;
          }
        } catch (err) {
          console.warn(
            `Failed to export document for transaction ${tx.id}:`,
            err
          );
        }

        this.updateProgress({
          processedItems: transactions.length + i + 1,
          progress: Math.round(
            40 + ((i + 1) / transactionsWithFiles.length) * 50
          ),
          currentItem: tx.vendor,
        });
      }

      this.updateProgress({ stage: 'compressing', progress: 95 });

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const filename = `vault-ai-full-backup-${formatDateForFilename()}.zip`;

      this.updateProgress({ stage: 'complete', progress: 100 });

      return {
        success: true,
        blob,
        filename,
        stats: {
          transactionCount: transactions.length,
          documentCount,
          totalSize: blob.size,
        },
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Export failed';
      this.updateProgress({ stage: 'error', error });
      return { success: false, error };
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

export const exportService = new ExportServiceImpl();

// ============================================
// Convenience Functions
// ============================================

/**
 * Export transactions in CSV format.
 */
export async function exportTransactionsCSV(
  filters?: ExportFilters
): Promise<ExportResult> {
  return exportService.exportTransactions('csv', filters);
}

/**
 * Export transactions in JSON format.
 */
export async function exportTransactionsJSON(
  filters?: ExportFilters
): Promise<ExportResult> {
  return exportService.exportTransactions('json', filters);
}

/**
 * Export all documents as ZIP.
 */
export async function exportDocuments(): Promise<ExportResult> {
  return exportService.exportDocuments();
}

/**
 * Export complete backup.
 */
export async function exportBackup(
  includeDocuments: boolean = false
): Promise<ExportResult> {
  return exportService.exportAll(includeDocuments);
}

/**
 * Download an export result.
 */
export function downloadExportResult(result: ExportResult): void {
  if (!result.success || !result.blob || !result.filename) {
    console.error('Cannot download failed export');
    return;
  }

  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
