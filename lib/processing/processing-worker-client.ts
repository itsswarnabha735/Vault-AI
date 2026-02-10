/**
 * Processing Worker Client for Vault-AI
 *
 * Processes documents using main-thread services (pdfExtractor, ocrService,
 * entityExtractor). Both PDF.js and Tesseract.js manage their own internal
 * Web Workers, so the main thread is NOT blocked during heavy processing.
 *
 * NOTE: Previously this used a custom Comlink Web Worker, but Next.js 14's
 * webpack bundling cannot properly handle dynamic ESM imports (pdfjs-dist v5)
 * inside Web Workers. Since both PDF.js and Tesseract.js run their own
 * workers internally, a separate wrapper worker is unnecessary.
 *
 * PRIVACY: All processing happens locally in the browser.
 * No document data is transmitted to external servers.
 */

import { pdfExtractor } from '@/lib/processing/pdf-extractor';
import { ocrService } from '@/lib/processing/ocr-service';
import { entityExtractor } from '@/lib/processing/entity-extractor';
import {
  statementParser,
  detectDocumentType,
} from '@/lib/processing/statement-parser';
import { llmStatementParser } from '@/lib/processing/llm-statement-parser';
import { preprocessStatementText } from '@/lib/processing/statement-preprocessor';
import type { ExtractedEntities as AIExtractedEntities } from '@/types/ai';
import type {
  StatementParseResult,
  DocumentTypeDetection,
} from '@/types/statement';

// ============================================
// Types (kept compatible with existing consumers)
// ============================================

/**
 * Processing progress stages.
 */
export type ProcessingStage =
  | 'validating'
  | 'extracting'
  | 'ocr'
  | 'embedding'
  | 'saving'
  | 'complete'
  | 'error';

/**
 * Progress update sent to callbacks.
 */
export interface WorkerProcessingProgress {
  fileId: string;
  fileName: string;
  stage: ProcessingStage;
  progress: number;
  currentPage?: number;
  totalPages?: number;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

/**
 * Processing options.
 */
export interface WorkerProcessingOptions {
  skipEmbedding?: boolean;
  skipThumbnail?: boolean;
  ocrLanguage?: string;
  forceOCR?: boolean;
  minTextForNoOCR?: number;
}

/**
 * PDF extraction result.
 */
export interface PDFExtractionResult {
  text: string;
  pageCount: number;
  isImageBased: boolean;
  pageTexts: string[];
  extractionTimeMs: number;
}

/**
 * OCR result.
 */
export interface OCRResult {
  text: string;
  confidence: number;
  processingTimeMs: number;
}

/**
 * Entity extraction result (simplified for consumers).
 */
export interface ExtractedEntities {
  date: { value: string; confidence: number } | null;
  amount: { value: number; confidence: number } | null;
  vendor: { value: string; confidence: number } | null;
  description: string;
  currency: string;
  allAmounts: Array<{ value: number; confidence: number }>;
  allDates: Array<{ value: string; confidence: number }>;
}

/**
 * Complete processed document result.
 */
export interface ProcessedDocumentResult {
  id: string;
  rawText: string;
  embedding: Float32Array | null;
  entities: ExtractedEntities;
  thumbnailDataUrl: string | null;
  fileMetadata: {
    originalName: string;
    mimeType: string;
    size: number;
    pageCount: number | null;
  };
  confidence: number;
  processingTimeMs: number;
  ocrUsed: boolean;
}

/**
 * Validation result.
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
  fileType?: 'pdf' | 'image';
  mimeType?: string;
  size?: number;
}

/**
 * Progress callback type.
 */
export type ProcessingProgressCallback = (
  progress: WorkerProcessingProgress
) => void;

/**
 * Worker client status.
 */
export interface ProcessingWorkerStatus {
  isInitialized: boolean;
  isProcessing: boolean;
  error: string | null;
}

// ============================================
// Constants
// ============================================

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];
const MIN_TEXT_LENGTH_FOR_NO_OCR = 100;

// ============================================
// Image Preprocessing for OCR
// ============================================

/**
 * Preprocess an image for better OCR accuracy on scanned PDF pages.
 * Converts to grayscale and applies contrast stretching (histogram normalization)
 * to make text sharper without destroying colored text via hard binarization.
 * Uses only Canvas APIs — no external dependencies.
 *
 * @param imageData - Raw image data from PDF rendering
 * @returns Preprocessed image data optimized for OCR
 */
function _preprocessImageForOCR(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);

  // Step 1: Convert to grayscale
  const grayscale = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    // Luminance formula (ITU-R BT.709)
    grayscale[i] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }

  // Step 2: Find min/max for contrast stretching (ignore top/bottom 1% as outliers)
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < grayscale.length; i++) {
    histogram[grayscale[i] ?? 0]++;
  }

  const totalPixels = width * height;
  const clipCount = Math.floor(totalPixels * 0.01);

  let minVal = 0;
  let cumulative = 0;
  for (let i = 0; i < 256; i++) {
    cumulative += histogram[i] ?? 0;
    if (cumulative > clipCount) {
      minVal = i;
      break;
    }
  }

  let maxVal = 255;
  cumulative = 0;
  for (let i = 255; i >= 0; i--) {
    cumulative += histogram[i] ?? 0;
    if (cumulative > clipCount) {
      maxVal = i;
      break;
    }
  }

  // Ensure we have a valid range
  if (maxVal <= minVal) {
    maxVal = minVal + 1;
  }

  // Step 3: Apply contrast stretching to normalize grayscale range to 0-255
  const range = maxVal - minVal;
  for (let i = 0; i < width * height; i++) {
    const val = grayscale[i] ?? 0;
    const stretched = Math.round(
      Math.max(0, Math.min(255, ((val - minVal) / range) * 255))
    );
    output[i * 4] = stretched;
    output[i * 4 + 1] = stretched;
    output[i * 4 + 2] = stretched;
    output[i * 4 + 3] = 255; // Full opacity
  }

  return new ImageData(output, width, height);
}

// ============================================
// OCR Text Post-Processing
// ============================================

/**
 * Normalize OCR text output to fix common misreads.
 *
 * Tesseract commonly misreads ₹ (Indian Rupee symbol) as '3', 'z', 'Z', '%', or 't'.
 * This function detects the systematic misread pattern and fixes it.
 *
 * Strategy: Count how many times '3' appears before a price-like number (X.XX with
 * exactly 2 decimal places). If this happens 3+ times, it's a systematic ₹→3 misread
 * and we replace ALL such occurrences. Otherwise, only replace near known keywords.
 */
function normalizeOCRText(text: string): string {
  let normalized = text;

  // Detect systematic ₹→3 misread: count '3' before price patterns (X.XX)
  // A price pattern is: not preceded by a digit, '3' followed by digits with .XX
  const rupee3Pattern = /(?<!\d)3(\d{1,6}\.\d{2})(?!\d)/g;
  const priceMatches = text.match(rupee3Pattern);
  const hasSystematicMisread = (priceMatches?.length ?? 0) >= 2;

  if (hasSystematicMisread) {
    // Systematic misread detected: replace ALL '3' before price patterns with ₹
    // e.g., "3271.00" → "₹271.00", "3315.00" → "₹315.00", "38.00" → "₹8.00"
    normalized = normalized.replace(/(?<!\d)3(\d{1,6}\.\d{2})(?!\d)/g, '₹$1');

    // Also fix negative amounts: "-3" before price → "-₹"
    // e.g., "-380.00" → "-₹80.00"
    normalized = normalized.replace(/-3(\d{1,6}\.\d{2})(?!\d)/g, '-₹$1');
  } else {
    // No systematic misread: only replace '3' near known keywords
    normalized = normalized.replace(
      /(\b(?:Total|Bill\s*Total|Grand\s*Total|Amount|Paid|Payable|Item\s*Total|Net|Due|Bill)\s*(?::?\s*))3(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\b/gi,
      '$1₹$2'
    );
  }

  // Fix 'z' or 'Z' misread as ₹ before amounts
  normalized = normalized.replace(
    /(?<!\w)[zZ](\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)(?!\d)/g,
    '₹$1'
  );

  // Fix '%' misread as ₹ before amounts (when not preceded by a digit)
  normalized = normalized.replace(
    /(?<!\d)%(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)(?!\d)/g,
    '₹$1'
  );

  // Normalize "Rs " / "Rs." patterns with extra OCR noise
  normalized = normalized.replace(/\bRs?\s*[.,:]?\s*(\d)/gi, 'Rs. $1');

  return normalized;
}

// ============================================
// ProcessingWorkerClient Class
// ============================================

/**
 * Client for document processing using main-thread services.
 * Both PDF.js and Tesseract.js use their own internal Web Workers,
 * so the main thread is not blocked during heavy operations.
 */
class ProcessingWorkerClientImpl {
  private isInitialized = false;
  private progressCallback: ProcessingProgressCallback | null = null;
  private cancelled = new Set<string>();

  /**
   * Initialize the processing services.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Pre-initialize PDF.js (loads its own internal worker)
      await pdfExtractor.initialize();
      this.isInitialized = true;
      console.log('[ProcessingClient] Services initialized successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ProcessingClient] Initialization failed:', message);
      throw new Error(`Failed to initialize processing services: ${message}`);
    }
  }

  /**
   * Set the progress callback.
   */
  setProgressCallback(callback: ProcessingProgressCallback | null): void {
    this.progressCallback = callback;
  }

  /**
   * Validate a file for processing.
   */
  validateFile(file: File): ValidationResult {
    if (!file) {
      return { isValid: false, error: 'No file provided' };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      };
    }

    if (file.size === 0) {
      return { isValid: false, error: 'File is empty' };
    }

    const mimeType = file.type.toLowerCase();

    // Also check by extension for browsers that don't set MIME type
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    const validExtensions = [
      '.pdf',
      '.jpg',
      '.jpeg',
      '.png',
      '.webp',
      '.heic',
      '.heif',
    ];

    if (
      !SUPPORTED_MIME_TYPES.includes(mimeType) &&
      !validExtensions.includes(ext)
    ) {
      return {
        isValid: false,
        error: `Unsupported file type: ${mimeType || ext}`,
      };
    }

    const isPdf = mimeType === 'application/pdf' || ext === '.pdf';
    const fileType = isPdf ? 'pdf' : 'image';

    return {
      isValid: true,
      fileType,
      mimeType:
        mimeType || (isPdf ? 'application/pdf' : `image/${ext.slice(1)}`),
      size: file.size,
    };
  }

  /**
   * Extract text from a PDF file.
   */
  async extractPDFText(
    file: File,
    onProgress?: (current: number, total: number) => void
  ): Promise<PDFExtractionResult> {
    const result = await pdfExtractor.extractText(file, {
      onProgress: onProgress
        ? (p) => onProgress(p.currentPage, p.totalPages)
        : undefined,
    });

    return {
      text: result.text,
      pageCount: result.pageCount,
      isImageBased: result.isImageBased,
      pageTexts: result.pageTexts,
      extractionTimeMs: result.extractionTimeMs,
    };
  }

  /**
   * Perform OCR on an image.
   */
  async performOCR(
    imageSource: File | Blob,
    language?: string,
    onProgress?: (progress: number) => void
  ): Promise<OCRResult> {
    const result = await ocrService.recognizeImage(imageSource, {
      language,
      onProgress: onProgress ? (p) => onProgress(p.progress) : undefined,
    });

    return {
      text: result.text,
      confidence: result.confidence,
      processingTimeMs: result.processingTimeMs,
    };
  }

  /**
   * Extract entities from text.
   */
  extractEntities(text: string): ExtractedEntities {
    const result: AIExtractedEntities = entityExtractor.extractEntities(text);

    // Map from ExtractedField<T> format to simplified format
    return {
      date: result.date
        ? { value: result.date.value, confidence: result.date.confidence }
        : null,
      amount: result.amount
        ? { value: result.amount.value, confidence: result.amount.confidence }
        : null,
      vendor: result.vendor
        ? { value: result.vendor.value, confidence: result.vendor.confidence }
        : null,
      description: result.description,
      currency: result.currency,
      allAmounts: result.allAmounts.map((a) => ({
        value: a.value,
        confidence: a.confidence,
      })),
      allDates: result.allDates.map((d) => ({
        value: d.value,
        confidence: d.confidence,
      })),
    };
  }

  /**
   * Process a complete document.
   */
  async processDocument(
    file: File,
    options?: WorkerProcessingOptions
  ): Promise<ProcessedDocumentResult> {
    const startTime = performance.now();
    const fileId = this.generateId();

    const {
      ocrLanguage = 'eng',
      forceOCR = false,
      minTextForNoOCR = MIN_TEXT_LENGTH_FOR_NO_OCR,
    } = options || {};

    console.log('[ProcessingClient] Starting document processing:', {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      fileId,
    });

    try {
      // Step 1: Validate
      this.reportProgress({
        fileId,
        fileName: file.name,
        stage: 'validating',
        progress: 0,
      });

      const validation = this.validateFile(file);
      console.log('[ProcessingClient] Validation result:', validation);

      if (!validation.isValid) {
        throw new Error(validation.error || 'Validation failed');
      }

      if (this.cancelled.has(fileId)) {
        throw new Error('Processing cancelled');
      }

      this.reportProgress({
        fileId,
        fileName: file.name,
        stage: 'validating',
        progress: 100,
      });

      // Step 2: Extract text
      let rawText = '';
      let pageCount: number | null = null;
      let ocrUsed = false;

      if (validation.fileType === 'pdf') {
        // PDF extraction
        this.reportProgress({
          fileId,
          fileName: file.name,
          stage: 'extracting',
          progress: 0,
        });

        console.log('[ProcessingClient] Extracting text from PDF...');
        const pdfResult = await this.extractPDFText(file, (current, total) => {
          this.reportProgress({
            fileId,
            fileName: file.name,
            stage: 'extracting',
            progress: Math.round((current / total) * 100),
            currentPage: current,
            totalPages: total,
          });
        });

        rawText = pdfResult.text;
        pageCount = pdfResult.pageCount;
        console.log('[ProcessingClient] PDF extraction complete:', {
          textLength: rawText.length,
          pageCount,
          isImageBased: pdfResult.isImageBased,
        });

        // OCR if needed (image-based PDF or insufficient text)
        // Now uses multi-page OCR to process ALL pages, not just page 1
        if (
          forceOCR ||
          pdfResult.isImageBased ||
          rawText.length < minTextForNoOCR
        ) {
          this.reportProgress({
            fileId,
            fileName: file.name,
            stage: 'ocr',
            progress: 0,
          });

          console.log(
            '[ProcessingClient] PDF needs OCR, processing all pages...'
          );
          const multiPageResult = await this.performMultiPageOCR(
            file,
            ocrLanguage,
            (currentPage, totalPages) => {
              this.reportProgress({
                fileId,
                fileName: file.name,
                stage: 'ocr',
                progress: Math.round((currentPage / totalPages) * 100),
                currentPage,
                totalPages,
              });
            }
          );

          rawText = normalizeOCRText(multiPageResult.text);
          ocrUsed = true;
          console.log('[ProcessingClient] Multi-page OCR complete:', {
            textLength: rawText.length,
            confidence: multiPageResult.confidence,
            pageCount: multiPageResult.pageTexts.length,
          });
        }
      } else {
        // Image - perform OCR directly
        this.reportProgress({
          fileId,
          fileName: file.name,
          stage: 'ocr',
          progress: 0,
        });

        console.log('[ProcessingClient] Running OCR on image...');
        const ocrResult = await this.performOCR(
          file,
          ocrLanguage,
          (progress) => {
            this.reportProgress({
              fileId,
              fileName: file.name,
              stage: 'ocr',
              progress,
            });
          }
        );

        rawText = normalizeOCRText(ocrResult.text);
        ocrUsed = true;
        console.log('[ProcessingClient] OCR complete:', {
          textLength: rawText.length,
          confidence: ocrResult.confidence,
        });
      }

      if (this.cancelled.has(fileId)) {
        throw new Error('Processing cancelled');
      }

      // Step 3: Extract entities
      this.reportProgress({
        fileId,
        fileName: file.name,
        stage: 'embedding',
        progress: 50,
      });

      console.log('[ProcessingClient] Extracting entities...');
      const entities = this.extractEntities(rawText);
      console.log('[ProcessingClient] Entities extracted:', {
        hasDate: !!entities.date,
        hasAmount: !!entities.amount,
        hasVendor: !!entities.vendor,
      });

      // Step 4: Calculate confidence
      const confidence = this.calculateConfidence(entities, ocrUsed);

      this.reportProgress({
        fileId,
        fileName: file.name,
        stage: 'complete',
        progress: 100,
      });

      const processingTimeMs = performance.now() - startTime;
      console.log('[ProcessingClient] Processing complete:', {
        fileId,
        processingTimeMs: Math.round(processingTimeMs),
        confidence,
      });

      return {
        id: fileId,
        rawText,
        embedding: null, // Embedding generation handled separately
        entities,
        thumbnailDataUrl: null, // Thumbnail generation handled separately
        fileMetadata: {
          originalName: file.name,
          mimeType:
            file.type || validation.mimeType || 'application/octet-stream',
          size: file.size,
          pageCount,
        },
        confidence,
        processingTimeMs,
        ocrUsed,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : '';

      console.error('[ProcessingClient] Document processing failed:', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        error: message,
        stack,
      });

      this.reportProgress({
        fileId,
        fileName: file.name,
        stage: 'error',
        progress: 0,
        error: {
          code: 'PROCESSING_ERROR',
          message,
          recoverable: true,
        },
      });

      throw error;
    } finally {
      this.cancelled.delete(fileId);
    }
  }

  /**
   * Process multiple documents.
   */
  async processDocuments(
    files: File[],
    options?: WorkerProcessingOptions,
    onProgress?: ProcessingProgressCallback
  ): Promise<ProcessedDocumentResult[]> {
    await this.initialize();

    if (onProgress) {
      this.setProgressCallback(onProgress);
    }

    const results: ProcessedDocumentResult[] = [];

    for (const file of files) {
      try {
        const result = await this.processDocument(file, options);
        results.push(result);
      } catch (error) {
        console.error(
          `[ProcessingClient] Failed to process ${file.name}:`,
          error
        );
      }
    }

    if (onProgress) {
      this.setProgressCallback(null);
    }

    return results;
  }

  /**
   * Perform multi-page OCR on a PDF file.
   * Unlike the single-page OCR in processDocument, this processes ALL pages.
   */
  async performMultiPageOCR(
    file: File,
    language?: string,
    onProgress?: (currentPage: number, totalPages: number) => void
  ): Promise<{ text: string; pageTexts: string[]; confidence: number }> {
    await this.initialize();

    // First extract to get page count and check if OCR is needed
    const pdfResult = await this.extractPDFText(file);
    const pageCount = pdfResult.pageCount;

    // If text-based PDF with enough text, return extracted text
    if (
      !pdfResult.isImageBased &&
      pdfResult.text.length >= MIN_TEXT_LENGTH_FOR_NO_OCR
    ) {
      return {
        text: pdfResult.text,
        pageTexts: pdfResult.pageTexts,
        confidence: 0.95,
      };
    }

    // OCR each page
    const pageTexts: string[] = [];
    let totalConfidence = 0;

    for (let page = 1; page <= pageCount; page++) {
      if (onProgress) {
        onProgress(page, pageCount);
      }

      try {
        const imageData = await pdfExtractor.renderPageToImage(file, page, 2.0);

        // Convert ImageData to Blob for OCR
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.putImageData(imageData, 0, 0);
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) =>
                b ? resolve(b) : reject(new Error('Canvas toBlob failed')),
              'image/png'
            );
          });

          const ocrResult = await this.performOCR(blob, language);
          pageTexts.push(ocrResult.text);
          totalConfidence += ocrResult.confidence;
        }
      } catch (error) {
        console.error(`[ProcessingClient] OCR failed for page ${page}:`, error);
        pageTexts.push(''); // Empty text for failed pages
      }
    }

    const combinedText = pageTexts.join('\n\n--- PAGE BREAK ---\n\n');
    const avgConfidence = pageCount > 0 ? totalConfidence / pageCount : 0;

    return {
      text: combinedText,
      pageTexts,
      confidence: avgConfidence,
    };
  }

  /**
   * Detect document type from extracted text.
   */
  detectDocumentType(text: string): DocumentTypeDetection {
    return detectDocumentType(text);
  }

  /**
   * Parse a financial statement into individual transactions.
   * Uses regex parser first, then LLM fallback if confidence is low.
   */
  parseStatement(
    text: string,
    options?: {
      defaultCurrency?: string;
      minConfidence?: number;
    }
  ): StatementParseResult {
    return statementParser.parseStatement(text, options);
  }

  /**
   * Parse a financial statement using LLM-first architecture.
   *
   * Flow (Phase 2C):
   * 1. Run regex parser (fast, local, provides metadata baseline)
   * 2. Run LLM parser as PRIMARY (higher accuracy, especially for Indian statements)
   * 3. If LLM fails, regex result is used as fallback
   * 4. Merge metadata, validate, and return best result
   *
   * @param text - The statement text to parse
   * @param options - Parsing options
   */
  async parseStatementWithLLMFallback(
    text: string,
    options?: {
      defaultCurrency?: string;
      minConfidence?: number;
      forceLLM?: boolean;
      regexOnly?: boolean;
    }
  ): Promise<StatementParseResult> {
    // Step 1: Pre-process statement text (strip page noise, join multi-line transactions)
    const preprocessedText = preprocessStatementText(text);

    console.log('[ProcessingClient] Pre-processed statement text:', {
      rawLength: text.length,
      preprocessedLength: preprocessedText.length,
      reduction: `${((1 - preprocessedText.length / text.length) * 100).toFixed(1)}%`,
    });

    // Step 2: Run regex parser on pre-processed text (fast, provides metadata baseline)
    let regexResult = statementParser.parseStatement(preprocessedText, options);

    console.log('[ProcessingClient] Regex parser result (preprocessed):', {
      transactions: regexResult.transactions.length,
      confidence: regexResult.confidence.toFixed(2),
      issuer: regexResult.issuer,
    });

    // Safety fallback: If preprocessing produced 0 transactions, try raw text.
    // This protects against the preprocessor being too aggressive for certain formats.
    if (regexResult.transactions.length === 0 && text !== preprocessedText) {
      console.log(
        '[ProcessingClient] No transactions found after preprocessing. Trying raw text...'
      );
      const rawRegexResult = statementParser.parseStatement(text, options);
      if (rawRegexResult.transactions.length > 0) {
        console.log(
          '[ProcessingClient] Raw text found',
          rawRegexResult.transactions.length,
          'transactions. Using raw result.'
        );
        regexResult = rawRegexResult;
      }
    }

    // Step 3: Run LLM-first flow (primary → retry → regex fallback)
    // NOTE: parseWithLLMFirst also runs preprocessStatementText internally,
    // but since the text is already preprocessed, it's a near-no-op second pass.
    const result = await llmStatementParser.parseWithLLMFirst(
      preprocessedText,
      regexResult,
      {
        minRegexConfidence: options?.minConfidence ?? 0.5,
        minRegexTransactions: 3,
        forceLLM: options?.forceLLM ?? true, // Default to always using LLM
        minExpectedTransactions: Math.max(3, regexResult.transactions.length),
        regexOnly: options?.regexOnly,
      }
    );

    return result;
  }

  /**
   * Process a document as a financial statement.
   * Performs full processing: extract text -> detect type -> parse transactions.
   */
  async processStatement(
    file: File,
    options?: WorkerProcessingOptions & {
      defaultCurrency?: string;
    }
  ): Promise<{
    rawText: string;
    statementResult: StatementParseResult;
    ocrUsed: boolean;
    processingTimeMs: number;
    fileMetadata: {
      originalName: string;
      mimeType: string;
      size: number;
      pageCount: number | null;
    };
  }> {
    const startTime = performance.now();
    await this.initialize();

    const fileId = this.generateId();
    const { ocrLanguage = 'eng', forceOCR = false } = options || {};

    console.log('[ProcessingClient] Starting statement processing:', {
      fileName: file.name,
      fileType: file.type,
    });

    const validation = this.validateFile(file);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Validation failed');
    }

    let rawText = '';
    let pageCount: number | null = null;
    let ocrUsed = false;

    if (validation.fileType === 'pdf') {
      // Use multi-page OCR for PDFs
      this.reportProgress({
        fileId,
        fileName: file.name,
        stage: 'extracting',
        progress: 0,
      });

      const pdfResult = await this.extractPDFText(file, (current, total) => {
        this.reportProgress({
          fileId,
          fileName: file.name,
          stage: 'extracting',
          progress: Math.round((current / total) * 50),
          currentPage: current,
          totalPages: total,
        });
      });

      rawText = pdfResult.text;
      pageCount = pdfResult.pageCount;

      // Multi-page OCR if needed
      if (
        forceOCR ||
        pdfResult.isImageBased ||
        rawText.length < MIN_TEXT_LENGTH_FOR_NO_OCR
      ) {
        this.reportProgress({
          fileId,
          fileName: file.name,
          stage: 'ocr',
          progress: 0,
        });

        console.log('[ProcessingClient] Statement needs multi-page OCR...');
        const multiPageResult = await this.performMultiPageOCR(
          file,
          ocrLanguage,
          (current, total) => {
            this.reportProgress({
              fileId,
              fileName: file.name,
              stage: 'ocr',
              progress: Math.round((current / total) * 100),
              currentPage: current,
              totalPages: total,
            });
          }
        );

        rawText = multiPageResult.text;
        ocrUsed = true;
      }
    } else {
      // Image file - OCR
      this.reportProgress({
        fileId,
        fileName: file.name,
        stage: 'ocr',
        progress: 0,
      });

      const ocrResult = await this.performOCR(file, ocrLanguage, (progress) => {
        this.reportProgress({
          fileId,
          fileName: file.name,
          stage: 'ocr',
          progress,
        });
      });

      rawText = ocrResult.text;
      ocrUsed = true;
    }

    // Parse as statement
    this.reportProgress({
      fileId,
      fileName: file.name,
      stage: 'embedding',
      progress: 50,
    });

    console.log('[ProcessingClient] Parsing statement text...');
    const statementResult = this.parseStatement(rawText, {
      defaultCurrency: options?.defaultCurrency,
    });

    console.log('[ProcessingClient] Statement parsed:', {
      transactionCount: statementResult.transactions.length,
      issuer: statementResult.issuer,
      confidence: statementResult.confidence,
    });

    this.reportProgress({
      fileId,
      fileName: file.name,
      stage: 'complete',
      progress: 100,
    });

    return {
      rawText,
      statementResult,
      ocrUsed,
      processingTimeMs: performance.now() - startTime,
      fileMetadata: {
        originalName: file.name,
        mimeType:
          file.type || validation.mimeType || 'application/octet-stream',
        size: file.size,
        pageCount,
      },
    };
  }

  /**
   * Cancel processing of a document.
   */
  async cancelProcessing(fileId: string): Promise<void> {
    this.cancelled.add(fileId);
  }

  /**
   * Get the current status.
   */
  getStatus(): ProcessingWorkerStatus {
    return {
      isInitialized: this.isInitialized,
      isProcessing: false,
      error: null,
    };
  }

  /**
   * Check if initialized.
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Terminate and clean up resources.
   */
  async terminate(): Promise<void> {
    await ocrService.terminate();
    this.isInitialized = false;
    this.progressCallback = null;
    this.cancelled.clear();
  }

  // ============================================
  // Private Helpers
  // ============================================

  private reportProgress(progress: WorkerProcessingProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

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
      return 0.3;
    }

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return ocrUsed ? avg * 0.9 : avg;
  }
}

// ============================================
// Singleton Export
// ============================================

/**
 * Singleton instance of the processing worker client.
 */
export const processingWorkerClient = new ProcessingWorkerClientImpl();

/**
 * Export the class for typing.
 */
export { ProcessingWorkerClientImpl as ProcessingWorkerClient };
