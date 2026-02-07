/**
 * Document Processing Module - Barrel Export
 *
 * This module provides all document processing functionality for Vault-AI.
 *
 * PRIVACY: All processing happens locally in the browser.
 * No document content is ever transmitted to external servers.
 */

// ============================================
// PDF Extractor
// ============================================

export {
  pdfExtractor,
  extractPDFText,
  renderPDFPageToImage,
  PDFExtractionError,
  type PDFExtractionResult,
  type PDFMetadata,
  type PDFProgress,
  type PDFProgressCallback,
  type PDFExtractionOptions,
} from './pdf-extractor';

// ============================================
// OCR Service
// ============================================

export {
  ocrService,
  performOCR,
  OCRError,
  OCR_LANGUAGES,
  type OCRResult,
  type OCRWord,
  type OCRProgress,
  type OCRProgressCallback,
  type OCROptions,
  type OCRStatus,
  type OCRLanguage,
} from './ocr-service';

// ============================================
// Entity Extractor
// ============================================

export {
  entityExtractor,
  extractEntities,
  extractDates,
  extractAmounts,
  extractVendor,
  type EntityExtractionOptions,
  type PatternMatch,
  type DatePattern,
  type AmountPattern,
  type VendorPattern,
} from './entity-extractor';

// ============================================
// Entity Validator
// ============================================

export {
  // Validation functions
  validateDate,
  validateAmount,
  validateVendor,
  validateEntities,
  // Normalization functions
  normalizeVendorName,
  normalizeAmount,
  normalizeDate,
  normalizeEntities,
  // Utility functions
  calculateQualityScore,
  meetsQualityThreshold,
  getValidationSummary,
  // Types
  type EntityValidationResult,
  type ValidationResult as EntityValidationResults,
  type ValidationOptions as EntityValidationOptions,
  type NormalizedEntities,
} from './entity-validator';

// ============================================
// Thumbnail Generator
// ============================================

export {
  thumbnailGenerator,
  generateThumbnail,
  ThumbnailError,
  type ThumbnailResult,
  type ThumbnailOptions,
} from './thumbnail-generator';

// ============================================
// Document Processor
// ============================================

export {
  documentProcessor,
  processDocument,
  validateFile,
  DocumentProcessingError,
  type DocumentProcessor,
  type ValidationResult,
  type ProcessingOptions,
  type BatchProcessingResult,
} from './document-processor';

// ============================================
// Worker Client
// ============================================

export {
  processingWorkerClient,
  ProcessingWorkerClient,
  type ProcessingProgressCallback,
  type ProcessingWorkerStatus,
  type WorkerProcessingProgress,
  type WorkerProcessingOptions,
  type ProcessedDocumentResult,
  type PDFExtractionResult as WorkerPDFExtractionResult,
  type OCRResult as WorkerOCRResult,
  type ExtractedEntities as WorkerExtractedEntities,
  type ValidationResult as WorkerValidationResult,
} from './processing-worker-client';
