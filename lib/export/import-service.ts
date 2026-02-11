/**
 * Import Service for Vault-AI
 *
 * Provides functionality to import user data from:
 * - CSV files (transactions)
 * - JSON backup files
 * - ZIP backup files (with documents)
 *
 * PRIVACY: Imported data is stored locally and processed on-device.
 */

import { db } from '@/lib/storage/db';
import { v4 as uuidv4 } from 'uuid';
import type {
  LocalTransaction,
  TransactionId,
  CategoryId,
  BudgetId,
  UserId,
} from '@/types/database';
import type { BackupData } from './export-service';

// ============================================
// Types
// ============================================

/**
 * Import progress tracking.
 */
export interface ImportProgress {
  /** Current stage of import */
  stage: 'idle' | 'validating' | 'importing' | 'complete' | 'error';

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
 * Validation result for an import file.
 */
export interface ValidationResult {
  /** Whether the file is valid */
  isValid: boolean;

  /** File format detected */
  format: 'csv' | 'json' | 'zip' | 'unknown';

  /** Validation errors */
  errors: string[];

  /** Validation warnings */
  warnings: string[];

  /** Preview of data to import */
  preview?: {
    transactionCount: number;
    categoryCount: number;
    budgetCount: number;
    documentCount: number;
    dateRange?: { start: string; end: string };
  };
}

/**
 * Import conflict for existing data.
 */
export interface ImportConflict {
  /** Conflicting item type */
  type: 'transaction' | 'category' | 'budget';

  /** Item ID */
  id: string;

  /** Existing data */
  existing: Record<string, unknown>;

  /** Incoming data */
  incoming: Record<string, unknown>;
}

/**
 * Import result.
 */
export interface ImportResult {
  /** Whether import was successful */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Import statistics */
  stats?: {
    transactionsImported: number;
    transactionsSkipped: number;
    categoriesImported: number;
    budgetsImported: number;
    documentsImported: number;
    conflictsResolved: number;
  };

  /** Unresolved conflicts */
  conflicts?: ImportConflict[];
}

/**
 * Options for import behavior.
 */
export interface ImportOptions {
  /** How to handle conflicts */
  conflictResolution: 'skip' | 'overwrite' | 'ask';

  /** Whether to import documents from ZIP */
  importDocuments: boolean;

  /** Whether to merge categories (by name) */
  mergeCategories: boolean;
}

/**
 * Default import options.
 */
export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  conflictResolution: 'skip',
  importDocuments: true,
  mergeCategories: true,
};

/**
 * Import service interface.
 */
export interface ImportService {
  /** Validate an import file */
  validateFile(file: File): Promise<ValidationResult>;

  /** Import from a backup file */
  importFromBackup(file: File, options?: ImportOptions): Promise<ImportResult>;

  /** Import transactions from CSV */
  importTransactionsCSV(
    file: File,
    options?: ImportOptions
  ): Promise<ImportResult>;

  /** Get current import progress */
  getProgress(): ImportProgress;

  /** Subscribe to progress updates */
  onProgress(callback: (progress: ImportProgress) => void): () => void;

  /** Cancel ongoing import */
  cancel(): void;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Parse CSV string into rows.
 */
function parseCSV(csvString: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvString.length; i++) {
    const char = csvString[i]!;
    const nextChar = csvString[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // Row separator
      if (char === '\r' && nextChar === '\n') {
        i++; // Skip \n in \r\n
      }
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  // Last field and row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Validate date string format.
 */
function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Parse amount from string.
 */
function parseAmount(amountString: string): number | null {
  // Remove currency symbols and whitespace
  const cleaned = amountString.replace(/[$€£¥₹,\s]/g, '');
  const amount = parseFloat(cleaned);
  return isNaN(amount) ? null : amount;
}

// ============================================
// Import Service Implementation
// ============================================

class ImportServiceImpl implements ImportService {
  private progress: ImportProgress = {
    stage: 'idle',
    progress: 0,
    totalItems: 0,
    processedItems: 0,
  };

  private progressListeners: Set<(progress: ImportProgress) => void> =
    new Set();
  private isCancelled = false;

  /**
   * Get current import progress.
   */
  getProgress(): ImportProgress {
    return { ...this.progress };
  }

  /**
   * Subscribe to progress updates.
   */
  onProgress(callback: (progress: ImportProgress) => void): () => void {
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
  private updateProgress(updates: Partial<ImportProgress>): void {
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
   * Cancel ongoing import.
   */
  cancel(): void {
    this.isCancelled = true;
  }

  /**
   * Detect file format.
   */
  private async detectFormat(
    file: File
  ): Promise<'csv' | 'json' | 'zip' | 'unknown'> {
    const name = file.name.toLowerCase();

    if (name.endsWith('.csv')) {
      return 'csv';
    }
    if (name.endsWith('.json')) {
      return 'json';
    }
    if (name.endsWith('.zip')) {
      return 'zip';
    }

    // Check magic bytes for ZIP
    const header = await file.slice(0, 4).arrayBuffer();
    const bytes = new Uint8Array(header);
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      return 'zip';
    }

    // Try to detect JSON
    try {
      const text = await file.text();
      JSON.parse(text);
      return 'json';
    } catch {
      // Check if it looks like CSV
      const text = await file.slice(0, 1000).text();
      if (text.includes(',') && text.includes('\n')) {
        return 'csv';
      }
    }

    return 'unknown';
  }

  /**
   * Validate an import file.
   */
  async validateFile(file: File): Promise<ValidationResult> {
    this.updateProgress({ stage: 'validating', progress: 0 });

    const format = await this.detectFormat(file);
    const errors: string[] = [];
    const warnings: string[] = [];
    let preview: ValidationResult['preview'] = undefined;

    if (format === 'unknown') {
      return {
        isValid: false,
        format: 'unknown',
        errors: [
          'Unrecognized file format. Please use CSV, JSON, or ZIP files.',
        ],
        warnings: [],
      };
    }

    try {
      if (format === 'csv') {
        const text = await file.text();
        const rows = parseCSV(text);

        if (rows.length < 2) {
          errors.push('CSV file appears to be empty or has only headers.');
        } else {
          const headers = rows[0]!.map((h) => h.toLowerCase());
          const requiredHeaders = ['date', 'vendor', 'amount'];
          const missingHeaders = requiredHeaders.filter(
            (h) => !headers.some((header) => header.includes(h))
          );

          if (missingHeaders.length > 0) {
            errors.push(
              `Missing required columns: ${missingHeaders.join(', ')}`
            );
          }

          // Check for valid dates
          const dateIndex = headers.findIndex((h) => h.includes('date'));
          if (dateIndex >= 0) {
            let invalidDates = 0;
            for (let i = 1; i < Math.min(rows.length, 10); i++) {
              const row = rows[i];
              if (row && row[dateIndex] && !isValidDate(row[dateIndex]!)) {
                invalidDates++;
              }
            }
            if (invalidDates > 0) {
              warnings.push(`Some dates may not be in a recognized format.`);
            }
          }

          preview = {
            transactionCount: rows.length - 1,
            categoryCount: 0,
            budgetCount: 0,
            documentCount: 0,
          };
        }
      } else if (format === 'json') {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.transactions && !data.metadata) {
          errors.push(
            'JSON file does not appear to be a valid Vault AI backup.'
          );
        } else {
          const transactions = data.transactions || [];
          const categories = data.categories || [];
          const budgets = data.budgets || [];

          if (transactions.length === 0 && categories.length === 0) {
            warnings.push('Backup appears to be empty.');
          }

          preview = {
            transactionCount: transactions.length,
            categoryCount: categories.length,
            budgetCount: budgets.length,
            documentCount: data.metadata?.counts?.documents || 0,
          };

          if (transactions.length > 0) {
            const dates = transactions
              .map((t: { date?: string }) => t.date)
              .filter((d: unknown) => d && typeof d === 'string')
              .sort();
            if (dates.length > 0) {
              preview.dateRange = {
                start: dates[0] as string,
                end: dates[dates.length - 1] as string,
              };
            }
          }
        }
      } else if (format === 'zip') {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);

        const backupFile = zip.file('backup.json');
        if (!backupFile) {
          errors.push('ZIP file does not contain a backup.json file.');
        } else {
          const backupText = await backupFile.async('string');
          const data = JSON.parse(backupText);

          const transactions = data.transactions || [];
          const categories = data.categories || [];
          const budgets = data.budgets || [];
          const docsFolder = zip.folder('documents');
          const docCount = docsFolder
            ? Object.keys(docsFolder.files).filter((f) => !f.endsWith('/'))
                .length
            : 0;

          preview = {
            transactionCount: transactions.length,
            categoryCount: categories.length,
            budgetCount: budgets.length,
            documentCount: docCount,
          };
        }
      }
    } catch (err) {
      errors.push(
        `Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }

    this.updateProgress({ stage: 'idle', progress: 100 });

    return {
      isValid: errors.length === 0,
      format,
      errors,
      warnings,
      preview,
    };
  }

  /**
   * Import transactions from CSV.
   */
  async importTransactionsCSV(
    file: File,
    options: ImportOptions = DEFAULT_IMPORT_OPTIONS
  ): Promise<ImportResult> {
    try {
      this.resetProgress();
      this.updateProgress({ stage: 'validating' });

      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length < 2) {
        return {
          success: false,
          error: 'CSV file is empty or has only headers.',
        };
      }

      const headers = rows[0]!.map((h) => h.toLowerCase().trim());
      const dataRows = rows.slice(1);

      // Map column indices
      const colMap: Record<string, number> = {};
      ['date', 'vendor', 'amount', 'category', 'note', 'currency'].forEach(
        (col) => {
          colMap[col] = headers.findIndex((h) => h.includes(col));
        }
      );

      if (colMap.date === -1 || colMap.vendor === -1 || colMap.amount === -1) {
        return {
          success: false,
          error: 'CSV is missing required columns: date, vendor, amount',
        };
      }

      this.updateProgress({
        stage: 'importing',
        totalItems: dataRows.length,
        processedItems: 0,
      });

      // Get existing categories for mapping
      const existingCategories = await db.categories.toArray();
      const categoryMap = new Map(
        existingCategories.map((c) => [c.name.toLowerCase(), c.id])
      );

      let imported = 0;
      let skipped = 0;
      const conflicts: ImportConflict[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        if (this.isCancelled) {
          return { success: false, error: 'Import cancelled' };
        }

        const row = dataRows[i]!;
        const date = row[colMap.date!] || '';
        const vendor = row[colMap.vendor!] || '';
        const amountStr = row[colMap.amount!] || '0';
        const categoryName =
          colMap.category !== -1 ? row[colMap.category!] || '' : '';
        const note = colMap.note !== -1 ? row[colMap.note!] || '' : '';
        const currency =
          colMap.currency !== -1 ? row[colMap.currency!] || 'INR' : 'INR';

        const amount = parseAmount(amountStr);
        if (amount === null || !date || !vendor) {
          skipped++;
          continue;
        }

        // Find or create category
        let categoryId: CategoryId | null = null;
        if (categoryName && options.mergeCategories) {
          categoryId = categoryMap.get(categoryName.toLowerCase()) || null;
        }

        // Create transaction
        const transaction: LocalTransaction = {
          id: uuidv4() as TransactionId,
          date: new Date(date).toISOString().split('T')[0] || date,
          vendor,
          amount,
          category: categoryId,
          note,
          currency,
          rawText: '',
          embedding: new Float32Array(384),
          filePath: '',
          fileSize: 0,
          mimeType: '',
          confidence: 1,
          isManuallyEdited: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          syncStatus: 'pending',
          lastSyncAttempt: null,
          syncError: null,
        };

        await db.transactions.add(transaction);
        imported++;

        this.updateProgress({
          processedItems: i + 1,
          progress: Math.round(((i + 1) / dataRows.length) * 100),
          currentItem: vendor,
        });
      }

      this.updateProgress({ stage: 'complete', progress: 100 });

      return {
        success: true,
        stats: {
          transactionsImported: imported,
          transactionsSkipped: skipped,
          categoriesImported: 0,
          budgetsImported: 0,
          documentsImported: 0,
          conflictsResolved: 0,
        },
        conflicts: conflicts.length > 0 ? conflicts : undefined,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Import failed';
      this.updateProgress({ stage: 'error', error });
      return { success: false, error };
    }
  }

  /**
   * Import from backup file.
   */
  async importFromBackup(
    file: File,
    options: ImportOptions = DEFAULT_IMPORT_OPTIONS
  ): Promise<ImportResult> {
    try {
      this.resetProgress();
      this.updateProgress({ stage: 'validating' });

      const format = await this.detectFormat(file);
      let backupData: BackupData;
      let zipRef: import('jszip') | null = null;

      if (format === 'json') {
        const text = await file.text();
        backupData = JSON.parse(text);
      } else if (format === 'zip') {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        zipRef = zip as unknown as import('jszip');

        const backupFile = zip.file('backup.json');
        if (!backupFile) {
          return {
            success: false,
            error: 'ZIP does not contain backup.json',
          };
        }

        const backupText = await backupFile.async('string');
        backupData = JSON.parse(backupText);
      } else {
        return {
          success: false,
          error: `Unsupported format: ${format}. Use JSON or ZIP files.`,
        };
      }

      // Calculate total items
      const totalItems =
        (backupData.categories?.length || 0) +
        (backupData.budgets?.length || 0) +
        (backupData.transactions?.length || 0);

      this.updateProgress({
        stage: 'importing',
        totalItems,
        processedItems: 0,
      });

      let processed = 0;
      let categoriesImported = 0;
      let budgetsImported = 0;
      let transactionsImported = 0;
      let transactionsSkipped = 0;
      const documentsImported = 0;

      // Import categories
      const existingCategories = await db.categories.toArray();
      const categoryIdMap = new Map<string, CategoryId>();

      for (const cat of backupData.categories || []) {
        if (this.isCancelled) {
          return { success: false, error: 'Import cancelled' };
        }

        if (options.mergeCategories) {
          const existing = existingCategories.find(
            (c) => c.name.toLowerCase() === cat.name.toLowerCase()
          );
          if (existing) {
            categoryIdMap.set(cat.id, existing.id);
          } else {
            const newId = uuidv4() as CategoryId;
            categoryIdMap.set(cat.id, newId);
            await db.categories.add({
              id: newId,
              userId: (cat.userId || 'default') as UserId,
              name: cat.name,
              icon: cat.icon,
              color: cat.color,
              parentId: cat.parentId,
              sortOrder: cat.sortOrder,
              isDefault: false,
              createdAt: new Date(cat.createdAt),
              updatedAt: new Date(cat.updatedAt),
            });
            categoriesImported++;
          }
        }

        processed++;
        this.updateProgress({
          processedItems: processed,
          progress: Math.round((processed / totalItems) * 100),
          currentItem: cat.name,
        });
      }

      // Import budgets
      for (const budget of backupData.budgets || []) {
        if (this.isCancelled) {
          return { success: false, error: 'Import cancelled' };
        }

        const mappedCategoryId = budget.categoryId
          ? categoryIdMap.get(budget.categoryId) || null
          : null;

        await db.budgets.add({
          id: uuidv4() as BudgetId,
          userId: (budget.userId || 'default') as UserId,
          categoryId: mappedCategoryId,
          amount: budget.amount,
          period: budget.period,
          startDate: budget.startDate,
          isActive: budget.isActive,
          createdAt: new Date(budget.createdAt),
          updatedAt: new Date(budget.updatedAt),
        });
        budgetsImported++;

        processed++;
        this.updateProgress({
          processedItems: processed,
          progress: Math.round((processed / totalItems) * 100),
        });
      }

      // Import transactions
      for (const tx of backupData.transactions || []) {
        if (this.isCancelled) {
          return { success: false, error: 'Import cancelled' };
        }

        // Check for existing transaction by date, vendor, amount
        const existing = await db.transactions
          .where('date')
          .equals(tx.date)
          .filter(
            (t) =>
              t.vendor === tx.vendor && Math.abs(t.amount - tx.amount) < 0.01
          )
          .first();

        if (existing && options.conflictResolution === 'skip') {
          transactionsSkipped++;
        } else {
          const mappedCategoryId = tx.category
            ? categoryIdMap.get(tx.category) || null
            : null;

          const transaction: LocalTransaction = {
            id: uuidv4() as TransactionId,
            date: tx.date,
            vendor: tx.vendor,
            amount: tx.amount,
            category: mappedCategoryId,
            note: tx.note,
            currency: tx.currency,
            rawText: '',
            embedding: new Float32Array(384),
            filePath: '',
            fileSize: 0,
            mimeType: '',
            confidence: 1,
            isManuallyEdited: false,
            createdAt: new Date(tx.createdAt),
            updatedAt: new Date(tx.updatedAt),
            syncStatus: 'pending',
            lastSyncAttempt: null,
            syncError: null,
          };

          await db.transactions.add(transaction);
          transactionsImported++;
        }

        processed++;
        this.updateProgress({
          processedItems: processed,
          progress: Math.round((processed / totalItems) * 100),
          currentItem: tx.vendor,
        });
      }

      // Import documents from ZIP if available
      if (format === 'zip' && options.importDocuments && zipRef) {
        // TODO: Import documents from ZIP
        // This would require reading files from the 'documents' folder
        // and storing them in OPFS, then updating transaction filePath
      }

      this.updateProgress({ stage: 'complete', progress: 100 });

      return {
        success: true,
        stats: {
          transactionsImported,
          transactionsSkipped,
          categoriesImported,
          budgetsImported,
          documentsImported,
          conflictsResolved: 0,
        },
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Import failed';
      this.updateProgress({ stage: 'error', error });
      return { success: false, error };
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

export const importService = new ImportServiceImpl();

// ============================================
// Convenience Functions
// ============================================

/**
 * Validate an import file.
 */
export async function validateImportFile(
  file: File
): Promise<ValidationResult> {
  return importService.validateFile(file);
}

/**
 * Import from backup file.
 */
export async function importBackup(
  file: File,
  options?: ImportOptions
): Promise<ImportResult> {
  return importService.importFromBackup(file, options);
}

/**
 * Import transactions from CSV.
 */
export async function importCSV(
  file: File,
  options?: ImportOptions
): Promise<ImportResult> {
  return importService.importTransactionsCSV(file, options);
}
