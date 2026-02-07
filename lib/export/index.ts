/**
 * Export/Import Module for Vault-AI
 *
 * Provides services for exporting and importing user data.
 *
 * PRIVACY: Exports only include sanitized data.
 * Raw text and embeddings are NEVER included.
 */

// Export service
export {
  exportService,
  exportTransactionsCSV,
  exportTransactionsJSON,
  exportDocuments,
  exportBackup,
  downloadExportResult,
  type ExportService,
  type ExportFormat,
  type ExportFilters,
  type ExportProgress,
  type ExportResult,
  type BackupMetadata,
  type BackupData,
} from './export-service';

// Import service
export {
  importService,
  validateImportFile,
  importBackup,
  importCSV,
  DEFAULT_IMPORT_OPTIONS,
  type ImportService,
  type ImportProgress,
  type ValidationResult,
  type ImportConflict,
  type ImportResult,
  type ImportOptions,
} from './import-service';
