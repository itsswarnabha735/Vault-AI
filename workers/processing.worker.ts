/**
 * Document Processing Web Worker for Vault-AI
 *
 * Runs all CPU-intensive document processing operations off the main thread:
 * - PDF.js text extraction
 * - Tesseract.js OCR
 * - Entity extraction
 * - Embedding generation
 * - Thumbnail generation
 *
 * Uses Comlink for clean RPC-style communication with the main thread.
 *
 * PRIVACY: All processing happens locally within this worker.
 * No document data is ever transmitted to external servers.
 */

import { expose } from 'comlink';

// ============================================
// Types
// ============================================

/**
 * Progress stages for document processing.
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
 * Processing progress update.
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
 * Processing options for the worker.
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
 * Entity extraction result.
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
 * Thumbnail result.
 */
export interface ThumbnailResult {
  dataUrl: string;
  width: number;
  height: number;
  size: number;
  format: 'webp' | 'jpeg' | 'png';
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
 * Converts to grayscale with contrast stretching (no hard binarization).
 */
function preprocessImageForOCR(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);

  // Step 1: Convert to grayscale
  const grayscale = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    grayscale[i] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }

  // Step 2: Find min/max for contrast stretching (clip 1% outliers)
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < grayscale.length; i++) {
    const grayVal = grayscale[i] ?? 0;
    histogram[grayVal] = (histogram[grayVal] ?? 0) + 1;
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

  if (maxVal <= minVal) {
    maxVal = minVal + 1;
  }

  // Step 3: Apply contrast stretching
  const range = maxVal - minVal;
  for (let i = 0; i < width * height; i++) {
    const val = grayscale[i] ?? 0;
    const stretched = Math.round(
      Math.max(0, Math.min(255, ((val - minVal) / range) * 255))
    );
    output[i * 4] = stretched;
    output[i * 4 + 1] = stretched;
    output[i * 4 + 2] = stretched;
    output[i * 4 + 3] = 255;
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
 * exactly 2 decimal places). If this happens 2+ times, it's a systematic ₹→3 misread
 * and we replace ALL such occurrences. Otherwise, only replace near known keywords.
 */
function normalizeOCRText(text: string): string {
  let normalized = text;

  // Detect systematic ₹→3 misread: count '3' before price patterns (X.XX)
  const rupee3Pattern = /(?<!\d)3(\d{1,6}\.\d{2})(?!\d)/g;
  const priceMatches = text.match(rupee3Pattern);
  const hasSystematicMisread = (priceMatches?.length ?? 0) >= 2;

  if (hasSystematicMisread) {
    // Systematic misread detected: replace ALL '3' before price patterns with ₹
    normalized = normalized.replace(/(?<!\d)3(\d{1,6}\.\d{2})(?!\d)/g, '₹$1');

    // Also fix negative amounts
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
// Processing Worker Class
// ============================================

/**
 * Processing worker exposed via Comlink.
 */
class ProcessingWorker {
  private pdfjs: typeof import('pdfjs-dist') | null = null;
  private tesseract: typeof import('tesseract.js') | null = null;
  private tesseractWorker: import('tesseract.js').Worker | null = null;
  private cancelled = new Set<string>();
  private progressCallback:
    | ((progress: WorkerProcessingProgress) => void)
    | null = null;

  /**
   * Initialize the processing worker.
   */
  async initialize(): Promise<void> {
    // Lazy load dependencies when first needed
  }

  /**
   * Set the progress callback.
   */
  setProgressCallback(
    callback: ((progress: WorkerProcessingProgress) => void) | null
  ): void {
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
    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
      return {
        isValid: false,
        error: `Unsupported file type: ${mimeType}`,
      };
    }

    const fileType = mimeType === 'application/pdf' ? 'pdf' : 'image';

    return {
      isValid: true,
      fileType,
      mimeType,
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
    const startTime = performance.now();

    if (!this.pdfjs) {
      console.log('[ProcessingWorker] Loading PDF.js library...');
      try {
        this.pdfjs = await import('pdfjs-dist');
        this.pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        console.log('[ProcessingWorker] PDF.js loaded successfully');
      } catch (err) {
        console.error('[ProcessingWorker] Failed to load PDF.js:', err);
        throw err;
      }
    }

    const arrayBuffer = await file.arrayBuffer();

    interface PDFTextItem {
      str: string;
      transform?: number[];
      hasEOL?: boolean;
    }

    interface PDFDoc {
      numPages: number;
      getPage(num: number): Promise<{
        getTextContent(): Promise<{ items: PDFTextItem[] }>;
      }>;
      destroy(): Promise<void>;
    }

    const loadingTask = this.pdfjs.getDocument({
      data: arrayBuffer,
    }) as unknown as {
      promise: Promise<PDFDoc>;
    };
    const pdfDoc = await loadingTask.promise;

    try {
      const totalPages = pdfDoc.numPages;
      const pageTexts: string[] = [];
      let fullText = '';
      let lowTextPageCount = 0;
      const minTextPerPage = 50;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();

        const pageText = textContent.items
          .map((item: PDFTextItem, idx: number, arr: PDFTextItem[]) => {
            let text = item.str;
            if (item.hasEOL) {
              text += '\n';
            } else if (idx < arr.length - 1) {
              const next = arr[idx + 1];
              if (
                next &&
                item.transform &&
                next.transform &&
                Math.abs((item.transform[5] ?? 0) - (next.transform[5] ?? 0)) > 2
              ) {
                text += '\n';
              } else {
                text += ' ';
              }
            }
            return text;
          })
          .join('')
          .trim();

        pageTexts.push(pageText);
        fullText += (pageNum > 1 ? '\n\n' : '') + pageText;

        if (pageText.length < minTextPerPage) {
          lowTextPageCount++;
        }

        onProgress?.(pageNum, totalPages);
      }

      const isImageBased = lowTextPageCount > totalPages / 2;

      return {
        text: fullText,
        pageCount: totalPages,
        isImageBased,
        pageTexts,
        extractionTimeMs: performance.now() - startTime,
      };
    } finally {
      await pdfDoc.destroy();
    }
  }

  /**
   * Perform OCR on an image.
   */
  async performOCR(
    imageSource: File | Blob | ImageData,
    language: string = 'eng',
    onProgress?: (progress: number) => void
  ): Promise<OCRResult> {
    const startTime = performance.now();

    if (!this.tesseract) {
      console.log('[ProcessingWorker] Loading Tesseract.js library...');
      try {
        this.tesseract = await import('tesseract.js');
        console.log('[ProcessingWorker] Tesseract.js loaded successfully');
      } catch (err) {
        console.error('[ProcessingWorker] Failed to load Tesseract.js:', err);
        throw err;
      }
    }

    if (!this.tesseractWorker) {
      console.log('[ProcessingWorker] Initializing Tesseract worker...');
      try {
        const { createWorker } = this.tesseract;
        this.tesseractWorker = await createWorker(language, 1, {
          logger: (message: { progress: number }) => {
            onProgress?.(message.progress * 100);
          },
        });

        // Set optimized parameters for receipt/invoice OCR
        await this.tesseractWorker.setParameters({
          tessedit_pageseg_mode: '3' as import('tesseract.js').PSM, // PSM.AUTO
          preserve_interword_spaces: '1', // Preserve spacing structure
        });

        console.log('[ProcessingWorker] Tesseract worker initialized');
      } catch (err) {
        console.error(
          '[ProcessingWorker] Failed to initialize Tesseract worker:',
          err
        );
        throw err;
      }
    }

    // Convert ImageData to Blob if needed (Tesseract doesn't accept ImageData directly)
    let imageToRecognize: File | Blob = imageSource as File | Blob;
    if (imageSource instanceof ImageData) {
      imageToRecognize = await this.imageDataToBlob(imageSource);
    }

    const result = await this.tesseractWorker.recognize(imageToRecognize);

    return {
      text: result.data.text,
      confidence: result.data.confidence,
      processingTimeMs: performance.now() - startTime,
    };
  }

  /**
   * Convert ImageData to Blob using OffscreenCanvas.
   */
  private async imageDataToBlob(imageData: ImageData): Promise<Blob> {
    const canvas = new OffscreenCanvas(imageData.width, imageData.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
  }

  /**
   * Render a PDF page to ImageData for OCR.
   */
  async renderPDFPageToImage(
    file: File,
    pageNumber: number = 1,
    scale: number = 2.0
  ): Promise<ImageData> {
    if (!this.pdfjs) {
      this.pdfjs = await import('pdfjs-dist');
      this.pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }

    const arrayBuffer = await file.arrayBuffer();

    interface PDFPage {
      getViewport(opts: { scale: number }): { width: number; height: number };
      render(params: {
        canvasContext: CanvasRenderingContext2D;
        viewport: { width: number; height: number };
      }): { promise: Promise<void> };
    }

    interface PDFDoc {
      numPages: number;
      getPage(num: number): Promise<PDFPage>;
      destroy(): Promise<void>;
    }

    const loadingTask = this.pdfjs.getDocument({
      data: arrayBuffer,
    }) as unknown as {
      promise: Promise<PDFDoc>;
    };
    const pdfDoc = await loadingTask.promise;

    try {
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });

      // OffscreenCanvas for worker context
      const canvas = new OffscreenCanvas(
        Math.round(viewport.width),
        Math.round(viewport.height)
      );
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Failed to get canvas context');
      }

      await page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;

      return context.getImageData(0, 0, canvas.width, canvas.height);
    } finally {
      await pdfDoc.destroy();
    }
  }

  /**
   * Extract entities from text.
   */
  extractEntities(text: string): ExtractedEntities {
    // Date patterns
    const dates = this.extractDates(text);
    const amounts = this.extractAmounts(text);
    const vendor = this.extractVendor(text);
    const currency = this.detectCurrency(text);
    const description = this.generateDescription(text);

    return {
      date: dates.length > 0 ? (dates[0] ?? null) : null,
      amount: amounts.length > 0 ? (amounts[0] ?? null) : null,
      vendor,
      description,
      currency,
      allAmounts: amounts,
      allDates: dates,
    };
  }

  /**
   * Process a complete document.
   */
  async processDocument(
    file: File,
    options: WorkerProcessingOptions = {}
  ): Promise<ProcessedDocumentResult> {
    const startTime = performance.now();
    const fileId = this.generateId();

    console.log('[ProcessingWorker] Starting document processing:', {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      fileId,
    });

    const {
      ocrLanguage = 'eng',
      forceOCR = false,
      minTextForNoOCR = MIN_TEXT_LENGTH_FOR_NO_OCR,
    } = options;

    try {
      // Validate
      this.reportProgress({
        fileId,
        fileName: file.name,
        stage: 'validating',
        progress: 0,
      });

      const validation = this.validateFile(file);
      console.log('[ProcessingWorker] Validation result:', validation);
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

      // Extract text
      let rawText = '';
      let pageCount: number | null = null;
      let ocrUsed = false;

      if (validation.fileType === 'pdf') {
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
            progress: Math.round((current / total) * 100),
            currentPage: current,
            totalPages: total,
          });
        });

        rawText = pdfResult.text;
        pageCount = pdfResult.pageCount;

        // OCR if needed
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

          const rawImageData = await this.renderPDFPageToImage(file, 1, 3.0);
          const imageData = preprocessImageForOCR(rawImageData);
          const ocrResult = await this.performOCR(
            imageData,
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
        }
      } else {
        // Image - perform OCR
        this.reportProgress({
          fileId,
          fileName: file.name,
          stage: 'ocr',
          progress: 0,
        });

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
      }

      if (this.cancelled.has(fileId)) {
        throw new Error('Processing cancelled');
      }

      // Extract entities
      this.reportProgress({
        fileId,
        fileName: file.name,
        stage: 'embedding',
        progress: 50,
      });

      const entities = this.extractEntities(rawText);

      // Calculate confidence
      const confidence = this.calculateConfidence(entities, ocrUsed);

      this.reportProgress({
        fileId,
        fileName: file.name,
        stage: 'complete',
        progress: 100,
      });

      return {
        id: fileId,
        rawText,
        embedding: null, // Embedding generation handled separately
        entities,
        thumbnailDataUrl: null, // Thumbnail generation handled separately if needed
        fileMetadata: {
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
          pageCount,
        },
        confidence,
        processingTimeMs: performance.now() - startTime,
        ocrUsed,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : '';

      // Log detailed error for debugging
      console.error('[ProcessingWorker] Document processing failed:', {
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
   * Cancel processing of a document.
   */
  cancelProcessing(fileId: string): void {
    this.cancelled.add(fileId);
  }

  /**
   * Terminate the worker and clean up resources.
   */
  async terminate(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
    }
    this.pdfjs = null;
    this.tesseract = null;
    this.cancelled.clear();
  }

  // ============================================
  // Private Helper Methods
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

  private extractDates(
    text: string
  ): Array<{ value: string; confidence: number }> {
    const dates: Array<{ value: string; confidence: number }> = [];
    const seen = new Set<string>();

    // ISO format
    const isoPattern = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
    for (const match of text.matchAll(isoPattern)) {
      const dateStr = match[0];
      if (!seen.has(dateStr)) {
        seen.add(dateStr);
        dates.push({ value: dateStr, confidence: 0.95 });
      }
    }

    // US format
    const usPattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
    for (const match of text.matchAll(usPattern)) {
      const m = parseInt(match[1] ?? '0', 10);
      const d = parseInt(match[2] ?? '0', 10);
      let y = parseInt(match[3] ?? '0', 10);
      if (y < 100) {
        y = y > 50 ? 1900 + y : 2000 + y;
      }

      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        const dateStr = `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
        if (!seen.has(dateStr)) {
          seen.add(dateStr);
          dates.push({ value: dateStr, confidence: 0.75 });
        }
      }
    }

    return dates;
  }

  private extractAmounts(
    text: string
  ): Array<{ value: number; confidence: number }> {
    const amounts: Array<{ value: number; confidence: number }> = [];
    const seen = new Set<number>();

    // Dollar amounts
    const dollarPattern = /\$\s*([\d,]+(?:\.\d{2})?)/g;
    for (const match of text.matchAll(dollarPattern)) {
      const amount = parseFloat((match[1] ?? '0').replace(/,/g, ''));
      if (!isNaN(amount) && amount > 0 && !seen.has(amount)) {
        seen.add(amount);
        amounts.push({ value: amount, confidence: 0.85 });
      }
    }

    // Total keyword
    const totalPattern =
      /(?:Total|Amount|Due)(?:\s*:|\s+is)?\s*\$?\s*([\d,]+(?:\.\d{2})?)/gi;
    for (const match of text.matchAll(totalPattern)) {
      const amount = parseFloat((match[1] ?? '0').replace(/,/g, ''));
      if (!isNaN(amount) && amount > 0 && !seen.has(amount)) {
        seen.add(amount);
        amounts.push({ value: amount, confidence: 0.95 });
      }
    }

    return amounts.sort((a, b) => b.confidence - a.confidence);
  }

  private extractVendor(
    text: string
  ): { value: string; confidence: number } | null {
    // Check for vendor keywords
    const keywordPattern =
      /(?:From|Merchant|Vendor|Store)(?:\s*:)?\s+([A-Z][A-Za-z0-9\s&'.,-]+?)(?:\n|$)/gi;
    for (const match of text.matchAll(keywordPattern)) {
      const vendor = (match[1] ?? '').trim();
      if (vendor.length >= 2 && vendor.length <= 50) {
        return { value: vendor, confidence: 0.9 };
      }
    }

    // Check first line for all-caps company name
    const lines = text.split('\n').slice(0, 5);
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.length >= 3 &&
        trimmed.length <= 40 &&
        trimmed === trimmed.toUpperCase() &&
        /^[A-Z][A-Z0-9\s&'.,-]+$/.test(trimmed)
      ) {
        return { value: trimmed, confidence: 0.7 };
      }
    }

    return null;
  }

  private detectCurrency(text: string): string {
    if (text.includes('$')) {
      return 'USD';
    }
    if (text.includes('€')) {
      return 'EUR';
    }
    if (text.includes('£')) {
      return 'GBP';
    }
    if (text.includes('¥')) {
      return 'JPY';
    }
    if (text.includes('₹')) {
      return 'INR';
    }

    const match = text.match(/\b(USD|EUR|GBP|CAD|AUD|JPY|CNY|INR)\b/i);
    return match ? (match[1]?.toUpperCase() ?? 'USD') : 'USD';
  }

  private generateDescription(text: string): string {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.length < 100);

    let description = '';
    for (const line of lines.slice(0, 3)) {
      if (description.length + line.length > 200) {
        break;
      }
      description += (description ? ' | ' : '') + line;
    }

    return description || 'No description available';
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
// Expose Worker via Comlink
// ============================================

const worker = new ProcessingWorker();
expose(worker);

export type { ProcessingWorker };
