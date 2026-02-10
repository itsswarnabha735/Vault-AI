/**
 * OCR Service for Vault-AI
 *
 * Uses Tesseract.js for optical character recognition on images
 * and image-based PDFs.
 *
 * PRIVACY: All OCR processing happens locally in the browser.
 * No image data or extracted text is ever transmitted to external servers.
 */

// ============================================
// Types
// ============================================

/**
 * OCR result from text recognition.
 */
export interface OCRResult {
  /** Extracted text */
  text: string;

  /** Confidence score (0-100) */
  confidence: number;

  /** Individual word confidences */
  words: OCRWord[];

  /** Processing time in milliseconds */
  processingTimeMs: number;

  /** Language used for recognition */
  language: string;
}

/**
 * Word with confidence from OCR.
 */
export interface OCRWord {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

/**
 * Progress callback for OCR processing.
 */
export interface OCRProgressCallback {
  (progress: OCRProgress): void;
}

/**
 * OCR progress information.
 */
export interface OCRProgress {
  status: 'loading' | 'initializing' | 'recognizing' | 'complete';
  progress: number;
  message?: string;
}

/**
 * OCR service options.
 */
export interface OCROptions {
  /** Language code (default: 'eng') */
  language?: string;

  /** Progress callback */
  onProgress?: OCRProgressCallback;

  /** Use fast mode (lower accuracy) */
  fastMode?: boolean;
}

/**
 * OCR service status.
 */
export interface OCRStatus {
  isInitialized: boolean;
  isProcessing: boolean;
  currentLanguage: string | null;
  error: string | null;
}

/**
 * Tesseract worker type (simplified).
 */
interface TesseractWorker {
  recognize(image: unknown): Promise<{
    data: {
      text: string;
      confidence: number;
      words?: Array<{
        text: string;
        confidence: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
      }>;
    };
  }>;
  setParameters(params: Record<string, string | number>): Promise<void>;
  terminate(): Promise<void>;
}

// ============================================
// Constants
// ============================================

/** Default language for OCR */
const DEFAULT_LANGUAGE = 'eng';

// ============================================
// OCRService Class
// ============================================

/**
 * OCR service using Tesseract.js.
 */
class OCRServiceImpl {
  private worker: TesseractWorker | null = null;
  private currentLanguage: string | null = null;
  private isProcessing = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the OCR worker with a specific language.
   */
  async initialize(
    language: string = DEFAULT_LANGUAGE,
    onProgress?: OCRProgressCallback
  ): Promise<void> {
    // If already initialized with the same language, return
    if (this.worker && this.currentLanguage === language) {
      return;
    }

    // If initializing, wait for it
    if (this.initPromise) {
      await this.initPromise;
      if (this.currentLanguage === language) {
        return;
      }
    }

    this.initPromise = this._initialize(language, onProgress);
    await this.initPromise;
  }

  private async _initialize(
    language: string,
    onProgress?: OCRProgressCallback
  ): Promise<void> {
    try {
      // Report loading status
      onProgress?.({
        status: 'loading',
        progress: 0,
        message: 'Loading OCR engine...',
      });

      // Terminate existing worker if language changed
      if (this.worker) {
        await this.worker.terminate();
        this.worker = null;
      }

      // Import Tesseract.js
      const tesseract = await import('tesseract.js');

      onProgress?.({
        status: 'initializing',
        progress: 20,
        message: 'Initializing OCR worker...',
      });

      // Create worker - Tesseract.js v5 API
      // createWorker(langs, oem, options) - options is third param
      const worker = await tesseract.createWorker(language, 1, {
        logger: (message: { status: string; progress: number }) => {
          if (onProgress && message.status) {
            const progress = 20 + (message.progress || 0) * 60;
            onProgress({
              status: 'initializing',
              progress,
              message: message.status,
            });
          }
        },
      });

      this.worker = worker as unknown as TesseractWorker;
      this.currentLanguage = language;

      // Set optimized parameters for receipt/invoice OCR
      await this.worker.setParameters({
        tessedit_pageseg_mode: '3', // Fully automatic page segmentation (handles varied layouts)
        preserve_interword_spaces: '1', // Preserve spacing structure
      });

      onProgress?.({
        status: 'complete',
        progress: 100,
        message: 'OCR engine ready',
      });
    } catch (error) {
      this.worker = null;
      this.currentLanguage = null;
      this.initPromise = null;

      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new OCRError(`Failed to initialize OCR: ${message}`);
    }
  }

  /**
   * Perform OCR on an image.
   */
  async recognizeImage(
    image: HTMLCanvasElement | HTMLImageElement | Blob | File,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    const startTime = performance.now();
    const {
      language = DEFAULT_LANGUAGE,
      onProgress,
      fastMode = false,
    } = options;

    // Initialize if needed
    await this.initialize(language, onProgress);

    if (!this.worker) {
      throw new OCRError('OCR worker not initialized');
    }

    if (this.isProcessing) {
      throw new OCRError('OCR is already processing another image');
    }

    this.isProcessing = true;

    try {
      onProgress?.({
        status: 'recognizing',
        progress: 0,
        message: 'Starting recognition...',
      });

      // Configure recognition parameters
      if (fastMode) {
        await this.worker.setParameters({
          tessedit_pageseg_mode: 3, // Fully automatic page segmentation
        });
      }

      // Perform recognition
      const result = await this.worker.recognize(image);

      onProgress?.({
        status: 'complete',
        progress: 100,
        message: 'Recognition complete',
      });

      // Extract words with confidence
      const words: OCRWord[] = [];
      if (result.data.words) {
        for (const word of result.data.words) {
          words.push({
            text: word.text,
            confidence: word.confidence,
            bbox: {
              x0: word.bbox.x0,
              y0: word.bbox.y0,
              x1: word.bbox.x1,
              y1: word.bbox.y1,
            },
          });
        }
      }

      return {
        text: result.data.text,
        confidence: result.data.confidence,
        words,
        processingTimeMs: performance.now() - startTime,
        language,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new OCRError(`OCR recognition failed: ${message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Perform OCR on multiple images in batch.
   */
  async recognizeBatch(
    images: Array<HTMLCanvasElement | HTMLImageElement | Blob | File>,
    options: OCROptions = {}
  ): Promise<OCRResult[]> {
    const results: OCRResult[] = [];
    const { onProgress, ...restOptions } = options;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      if (!image) {
        continue;
      }

      // Create a progress wrapper for this image
      const imageProgress: OCRProgressCallback = (progress) => {
        onProgress?.({
          ...progress,
          progress:
            (i / images.length) * 100 + progress.progress / images.length,
          message: `Image ${i + 1}/${images.length}: ${progress.message || ''}`,
        });
      };

      const result = await this.recognizeImage(image, {
        ...restOptions,
        onProgress: imageProgress,
      });

      results.push(result);
    }

    return results;
  }

  /**
   * Recognize ImageData by first converting to canvas.
   */
  async recognizeImageData(
    imageData: ImageData,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    // Convert ImageData to canvas
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new OCRError('Failed to get canvas context');
    }
    ctx.putImageData(imageData, 0, 0);

    return this.recognizeImage(canvas, options);
  }

  /**
   * Get the current status of the OCR service.
   */
  getStatus(): OCRStatus {
    return {
      isInitialized: this.worker !== null,
      isProcessing: this.isProcessing,
      currentLanguage: this.currentLanguage,
      error: null,
    };
  }

  /**
   * Check if the service is ready.
   */
  isReady(): boolean {
    return this.worker !== null && !this.isProcessing;
  }

  /**
   * Terminate the OCR worker and free resources.
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.currentLanguage = null;
      this.initPromise = null;
    }
  }
}

// ============================================
// Error Class
// ============================================

/**
 * Custom error for OCR failures.
 */
export class OCRError extends Error {
  constructor(
    message: string,
    public code: string = 'OCR_ERROR',
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'OCRError';
    Object.setPrototypeOf(this, OCRError.prototype);
  }
}

// ============================================
// Singleton Export
// ============================================

/**
 * Singleton instance of the OCR service.
 */
export const ocrService = new OCRServiceImpl();

/**
 * Convenience function to perform OCR on an image.
 */
export async function performOCR(
  image: HTMLCanvasElement | HTMLImageElement | Blob | File,
  options?: OCROptions
): Promise<OCRResult> {
  return ocrService.recognizeImage(image, options);
}

/**
 * Available languages for OCR.
 * Common languages that Tesseract supports.
 */
export const OCR_LANGUAGES = {
  eng: 'English',
  spa: 'Spanish',
  fra: 'French',
  deu: 'German',
  ita: 'Italian',
  por: 'Portuguese',
  nld: 'Dutch',
  pol: 'Polish',
  rus: 'Russian',
  jpn: 'Japanese',
  chi_sim: 'Chinese (Simplified)',
  chi_tra: 'Chinese (Traditional)',
  kor: 'Korean',
  ara: 'Arabic',
  hin: 'Hindi',
} as const;

export type OCRLanguage = keyof typeof OCR_LANGUAGES;
