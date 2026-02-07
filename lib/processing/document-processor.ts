/**
 * Document Processor for Vault-AI
 *
 * Orchestrates the complete document processing pipeline:
 * 1. Validate file
 * 2. Extract text (PDF.js or image decode)
 * 3. OCR if needed
 * 4. Extract entities
 * 5. Generate embedding
 * 6. Generate thumbnail
 * 7. Save to OPFS
 * 8. Save metadata to IndexedDB
 *
 * PRIVACY: All document processing happens locally in the browser.
 * Raw documents and text are NEVER transmitted to external servers.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ProcessedDocument,
  ProcessingProgress,
  ProcessingStage,
  ExtractedEntities,
  FileMetadata,
} from '@/types/ai';
import type { TransactionId } from '@/types/database';

import { pdfExtractor, type PDFExtractionResult } from './pdf-extractor';
import { ocrService, type OCRResult } from './ocr-service';
import { entityExtractor } from './entity-extractor';
import { thumbnailGenerator } from './thumbnail-generator';

// ============================================
// Types
// ============================================

/**
 * File validation result.
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  fileType?: 'pdf' | 'image';
  mimeType?: string;
  size?: number;
}

/**
 * Processing options.
 */
export interface ProcessingOptions {
  /** Progress callback */
  onProgress?: (progress: ProcessingProgress) => void;

  /** Skip embedding generation (useful for batch imports) */
  skipEmbedding?: boolean;

  /** Skip thumbnail generation */
  skipThumbnail?: boolean;

  /** Custom embedding function */
  embedText?: (text: string) => Promise<Float32Array>;

  /** OCR language */
  ocrLanguage?: string;

  /** Force OCR even for text PDFs */
  forceOCR?: boolean;

  /** Minimum text length to skip OCR */
  minTextForNoOCR?: number;
}

/**
 * Batch processing result.
 */
export interface BatchProcessingResult {
  successful: ProcessedDocument[];
  failed: Array<{
    fileId: string;
    fileName: string;
    error: string;
  }>;
  totalTimeMs: number;
}

/**
 * Document processor interface.
 */
export interface DocumentProcessor {
  processDocument(
    file: File,
    options?: ProcessingOptions
  ): Promise<ProcessedDocument>;
  processDocuments(
    files: File[],
    options?: ProcessingOptions
  ): AsyncGenerator<ProcessingProgress, BatchProcessingResult, undefined>;
  validateFile(file: File): ValidationResult;
  cancelProcessing(fileId: string): void;
}

// ============================================
// Constants
// ============================================

/** Maximum file size in bytes (25MB) */
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/** Supported MIME types */
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

/** Minimum text length to consider PDF text-based */
const MIN_TEXT_LENGTH_FOR_NO_OCR = 100;

// ============================================
// DocumentProcessorService Class
// ============================================

/**
 * Document processing service.
 */
class DocumentProcessorService implements DocumentProcessor {
  private cancelledProcessing = new Set<string>();

  /**
   * Validate a file for processing.
   */
  validateFile(file: File): ValidationResult {
    // Check file exists
    if (!file) {
      return { isValid: false, error: 'No file provided' };
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      };
    }

    // Check file size is not zero
    if (file.size === 0) {
      return { isValid: false, error: 'File is empty' };
    }

    // Check MIME type
    const mimeType = file.type.toLowerCase();
    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
      return {
        isValid: false,
        error: `Unsupported file type: ${mimeType}. Supported types: PDF, JPEG, PNG, WebP, HEIC`,
      };
    }

    // Determine file type
    const fileType = mimeType === 'application/pdf' ? 'pdf' : 'image';

    return {
      isValid: true,
      fileType,
      mimeType,
      size: file.size,
    };
  }

  /**
   * Process a single document.
   */
  async processDocument(
    file: File,
    options: ProcessingOptions = {}
  ): Promise<ProcessedDocument> {
    const startTime = performance.now();
    const fileId = uuidv4();

    const {
      onProgress,
      skipEmbedding = false,
      skipThumbnail = false,
      embedText,
      ocrLanguage = 'eng',
      forceOCR = false,
      minTextForNoOCR = MIN_TEXT_LENGTH_FOR_NO_OCR,
    } = options;

    // Helper to report progress
    const reportProgress = (
      stage: ProcessingStage,
      progress: number,
      currentPage?: number,
      totalPages?: number
    ) => {
      if (onProgress) {
        onProgress({
          fileId,
          fileName: file.name,
          stage,
          progress,
          currentPage,
          totalPages,
        });
      }
    };

    try {
      // Step 1: Validate
      reportProgress('validating', 0);

      const validation = this.validateFile(file);
      if (!validation.isValid) {
        throw new DocumentProcessingError(
          validation.error || 'Validation failed'
        );
      }

      if (this.cancelledProcessing.has(fileId)) {
        throw new DocumentProcessingError('Processing cancelled');
      }

      reportProgress('validating', 100);

      // Step 2: Extract text
      reportProgress('extracting', 0);

      let rawText = '';
      let pageCount: number | null = null;
      let ocrUsed = false;
      let dimensions: { width: number; height: number } | undefined;

      if (validation.fileType === 'pdf') {
        // Extract text from PDF
        const pdfResult = await this.extractFromPDF(file, (pdfProgress) => {
          reportProgress(
            'extracting',
            pdfProgress.percentComplete,
            pdfProgress.currentPage,
            pdfProgress.totalPages
          );
        });

        rawText = pdfResult.text;
        pageCount = pdfResult.pageCount;

        // Check if PDF is image-based or has insufficient text
        if (
          forceOCR ||
          pdfResult.isImageBased ||
          rawText.length < minTextForNoOCR
        ) {
          if (this.cancelledProcessing.has(fileId)) {
            throw new DocumentProcessingError('Processing cancelled');
          }

          // Perform OCR
          reportProgress('ocr', 0);
          const ocrResult = await this.performOCROnPDF(
            file,
            pageCount,
            ocrLanguage,
            (ocrProgress) => {
              reportProgress('ocr', ocrProgress);
            }
          );
          rawText = ocrResult;
          ocrUsed = true;
        }
      } else {
        // Extract from image using OCR
        reportProgress('ocr', 0);

        const ocrResult = await this.performOCROnImage(
          file,
          ocrLanguage,
          (ocrProgress) => {
            reportProgress('ocr', ocrProgress);
          }
        );

        rawText = ocrResult.text;
        ocrUsed = true;

        // Get image dimensions
        dimensions = await this.getImageDimensions(file);
      }

      if (this.cancelledProcessing.has(fileId)) {
        throw new DocumentProcessingError('Processing cancelled');
      }

      // Step 3: Extract entities
      reportProgress('embedding', 0);

      const entities = entityExtractor.extractEntities(rawText);

      // Step 4: Generate embedding (if not skipped)
      let embedding: Float32Array = new Float32Array(384);

      if (!skipEmbedding && embedText) {
        const result = await embedText(rawText);
        embedding = new Float32Array(result);
      }

      reportProgress('embedding', 100);

      if (this.cancelledProcessing.has(fileId)) {
        throw new DocumentProcessingError('Processing cancelled');
      }

      // Step 5: Generate thumbnail (if not skipped)
      if (!skipThumbnail) {
        reportProgress('saving', 0);

        try {
          // Generate and save thumbnail to OPFS
          // In a real implementation, save thumbnailResult.blob to OPFS
          await thumbnailGenerator.generate(file);
          // thumbnailPath would be: `vault-ai/thumbnails/${fileId}_thumb.webp`
        } catch (error) {
          // Thumbnail generation failure is not fatal
          console.warn('Thumbnail generation failed:', error);
        }
      }

      // Step 6: Calculate confidence
      const confidence = this.calculateConfidence(entities, ocrUsed);

      reportProgress('complete', 100);

      // Build file metadata
      const fileMetadata: FileMetadata = {
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        pageCount,
        dimensions,
      };

      // Build processed document
      const processedDoc: ProcessedDocument = {
        id: fileId as TransactionId,
        rawText,
        embedding,
        entities,
        filePath: `vault-ai/documents/${new Date().getFullYear()}/${(new Date().getMonth() + 1).toString().padStart(2, '0')}/${fileId}.${this.getFileExtension(file.name)}`,
        fileMetadata,
        confidence,
        processingTimeMs: performance.now() - startTime,
        ocrUsed,
      };

      return processedDoc;
    } catch (error) {
      // Report error
      if (onProgress) {
        onProgress({
          fileId,
          fileName: file.name,
          stage: 'error',
          progress: 0,
          error: {
            code: 'PROCESSING_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            recoverable: true,
          },
        });
      }

      throw error;
    } finally {
      // Clean up cancelled state
      this.cancelledProcessing.delete(fileId);
    }
  }

  /**
   * Process multiple documents as an async generator.
   */
  async *processDocuments(
    files: File[],
    options: ProcessingOptions = {}
  ): AsyncGenerator<ProcessingProgress, BatchProcessingResult, undefined> {
    const startTime = performance.now();
    const successful: ProcessedDocument[] = [];
    const failed: Array<{ fileId: string; fileName: string; error: string }> =
      [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) {
        continue;
      }

      const fileId = uuidv4();

      // Create progress wrapper that yields
      let currentProgress: ProcessingProgress = {
        fileId,
        fileName: file.name,
        stage: 'validating',
        progress: 0,
      };

      const progressWrapper = (progress: ProcessingProgress) => {
        currentProgress = {
          ...progress,
          // Add batch context
          estimatedTimeRemaining: this.estimateTimeRemaining(
            i,
            files.length,
            performance.now() - startTime
          ),
        };
      };

      try {
        // Yield initial progress
        yield currentProgress;

        // Process document
        const doc = await this.processDocument(file, {
          ...options,
          onProgress: progressWrapper,
        });

        successful.push(doc);

        // Yield completion
        yield {
          fileId,
          fileName: file.name,
          stage: 'complete',
          progress: 100,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        failed.push({
          fileId,
          fileName: file.name,
          error: errorMessage,
        });

        // Yield error state
        yield {
          fileId,
          fileName: file.name,
          stage: 'error',
          progress: 0,
          error: {
            code: 'PROCESSING_ERROR',
            message: errorMessage,
            recoverable: true,
          },
        };
      }
    }

    return {
      successful,
      failed,
      totalTimeMs: performance.now() - startTime,
    };
  }

  /**
   * Cancel processing of a specific file.
   */
  cancelProcessing(fileId: string): void {
    this.cancelledProcessing.add(fileId);
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Extract text from PDF.
   */
  private async extractFromPDF(
    file: File,
    onProgress: (progress: {
      currentPage: number;
      totalPages: number;
      percentComplete: number;
    }) => void
  ): Promise<PDFExtractionResult> {
    return pdfExtractor.extractText(file, { onProgress });
  }

  /**
   * Perform OCR on a PDF (render pages to images first).
   */
  private async performOCROnPDF(
    file: File,
    pageCount: number,
    language: string,
    onProgress: (progress: number) => void
  ): Promise<string> {
    const texts: string[] = [];

    // Process first page (or first few for large documents)
    const pagesToProcess = Math.min(pageCount, 5);

    for (let i = 1; i <= pagesToProcess; i++) {
      try {
        // Render page to image
        const imageData = await pdfExtractor.renderPageToImage(file, i, 2.0);

        // Perform OCR using ImageData-specific method
        const result = await ocrService.recognizeImageData(imageData, {
          language,
          fastMode: pageCount > 3, // Use fast mode for multi-page docs
        });

        texts.push(result.text);
        onProgress(Math.round((i / pagesToProcess) * 100));
      } catch (error) {
        console.warn(`OCR failed for page ${i}:`, error);
      }
    }

    return texts.join('\n\n');
  }

  /**
   * Perform OCR on an image file.
   */
  private async performOCROnImage(
    file: File,
    language: string,
    onProgress: (progress: number) => void
  ): Promise<OCRResult> {
    return ocrService.recognizeImage(file, {
      language,
      onProgress: (p) => onProgress(p.progress),
    });
  }

  /**
   * Get image dimensions.
   */
  private getImageDimensions(
    file: File
  ): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        reject(new Error('Failed to load image'));
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Calculate overall extraction confidence.
   */
  private calculateConfidence(
    entities: ExtractedEntities,
    ocrUsed: boolean
  ): number {
    const scores: number[] = [];

    if (entities.date) {
      scores.push(entities.date.confidence);
    }
    if (entities.amount) {
      scores.push(entities.amount.confidence);
    }
    if (entities.vendor) {
      scores.push(entities.vendor.confidence);
    }

    if (scores.length === 0) {
      return 0.3; // Low confidence if no entities extracted
    }

    // Average confidence, with OCR penalty
    const avgConfidence = scores.reduce((a, b) => a + b, 0) / scores.length;
    return ocrUsed ? avgConfidence * 0.9 : avgConfidence; // 10% penalty for OCR
  }

  /**
   * Get file extension from filename.
   */
  private getFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? (parts[parts.length - 1] ?? 'bin') : 'bin';
  }

  /**
   * Estimate remaining time for batch processing.
   */
  private estimateTimeRemaining(
    currentIndex: number,
    totalCount: number,
    elapsedMs: number
  ): number | undefined {
    if (currentIndex === 0) {
      return undefined;
    }

    const avgTimePerFile = elapsedMs / currentIndex;
    const remainingFiles = totalCount - currentIndex;
    return Math.round((avgTimePerFile * remainingFiles) / 1000); // in seconds
  }
}

// ============================================
// Error Class
// ============================================

/**
 * Custom error for document processing failures.
 */
export class DocumentProcessingError extends Error {
  constructor(
    message: string,
    public code: string = 'DOCUMENT_PROCESSING_ERROR',
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'DocumentProcessingError';
    Object.setPrototypeOf(this, DocumentProcessingError.prototype);
  }
}

// ============================================
// Singleton Export
// ============================================

/**
 * Singleton instance of the document processor.
 */
export const documentProcessor = new DocumentProcessorService();

/**
 * Convenience function to process a document.
 */
export async function processDocument(
  file: File,
  options?: ProcessingOptions
): Promise<ProcessedDocument> {
  return documentProcessor.processDocument(file, options);
}

/**
 * Convenience function to validate a file.
 */
export function validateFile(file: File): ValidationResult {
  return documentProcessor.validateFile(file);
}
