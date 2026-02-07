/**
 * Processing Worker Client for Vault-AI
 *
 * Comlink wrapper for the document processing Web Worker.
 * Provides a clean, promise-based API for the main thread.
 *
 * PRIVACY: All processing happens in the Web Worker.
 * No document data is transmitted to external servers.
 */

import { wrap, proxy, type Remote } from 'comlink';
import type {
  ProcessingWorker,
  WorkerProcessingProgress,
  WorkerProcessingOptions,
  ProcessedDocumentResult,
  PDFExtractionResult,
  OCRResult,
  ExtractedEntities,
  ValidationResult,
} from '@/workers/processing.worker';

// ============================================
// Types
// ============================================

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
// ProcessingWorkerClient Class
// ============================================

/**
 * Client for interacting with the processing Web Worker.
 */
class ProcessingWorkerClientImpl {
  private worker: Worker | null = null;
  private workerApi: Remote<ProcessingWorker> | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private progressCallback: ProcessingProgressCallback | null = null;

  /**
   * Initialize the worker.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._initialize();
    await this.initPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      // Create the worker
      this.worker = new Worker(
        new URL('../../workers/processing.worker.ts', import.meta.url),
        { type: 'module' }
      );

      // Wrap with Comlink
      this.workerApi = wrap<ProcessingWorker>(this.worker);

      // Initialize the worker
      await this.workerApi.initialize();

      this.isInitialized = true;
    } catch (error) {
      this.worker = null;
      this.workerApi = null;
      this.initPromise = null;

      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize processing worker: ${message}`);
    }
  }

  /**
   * Get the worker API, throwing if not initialized.
   */
  private getWorkerApi(): Remote<ProcessingWorker> {
    if (!this.workerApi) {
      throw new Error(
        'Processing worker not initialized. Call initialize() first.'
      );
    }
    return this.workerApi;
  }

  /**
   * Set the progress callback.
   */
  setProgressCallback(callback: ProcessingProgressCallback | null): void {
    this.progressCallback = callback;

    if (this.workerApi) {
      // Use Comlink proxy for the callback
      this.workerApi.setProgressCallback(callback ? proxy(callback) : null);
    }
  }

  /**
   * Validate a file for processing.
   */
  async validateFile(file: File): Promise<ValidationResult> {
    await this.initialize();
    return this.getWorkerApi().validateFile(file);
  }

  /**
   * Extract text from a PDF file.
   */
  async extractPDFText(
    file: File,
    onProgress?: (current: number, total: number) => void
  ): Promise<PDFExtractionResult> {
    await this.initialize();
    return this.getWorkerApi().extractPDFText(
      file,
      onProgress ? proxy(onProgress) : undefined
    );
  }

  /**
   * Perform OCR on an image.
   * Note: ImageData is handled inside the worker by converting to Blob.
   */
  async performOCR(
    imageSource: File | Blob | ImageData,
    language?: string,
    onProgress?: (progress: number) => void
  ): Promise<OCRResult> {
    await this.initialize();
    return this.getWorkerApi().performOCR(
      imageSource,
      language,
      onProgress ? proxy(onProgress) : undefined
    );
  }

  /**
   * Extract entities from text.
   */
  async extractEntities(text: string): Promise<ExtractedEntities> {
    await this.initialize();
    return this.getWorkerApi().extractEntities(text);
  }

  /**
   * Process a complete document.
   */
  async processDocument(
    file: File,
    options?: WorkerProcessingOptions
  ): Promise<ProcessedDocumentResult> {
    await this.initialize();

    // Set up progress callback if provided in class
    if (this.progressCallback) {
      await this.workerApi?.setProgressCallback(proxy(this.progressCallback));
    }

    return this.getWorkerApi().processDocument(file, options);
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

    // Set up progress callback
    if (onProgress) {
      await this.workerApi?.setProgressCallback(proxy(onProgress));
    }

    const results: ProcessedDocumentResult[] = [];

    for (const file of files) {
      try {
        const result = await this.getWorkerApi().processDocument(file, options);
        results.push(result);
      } catch (error) {
        // Continue processing other files
        console.error(`Failed to process ${file.name}:`, error);
      }
    }

    // Clear progress callback
    if (onProgress) {
      await this.workerApi?.setProgressCallback(null);
    }

    return results;
  }

  /**
   * Cancel processing of a document.
   */
  async cancelProcessing(fileId: string): Promise<void> {
    if (this.workerApi) {
      await this.workerApi.cancelProcessing(fileId);
    }
  }

  /**
   * Get the current status.
   */
  getStatus(): ProcessingWorkerStatus {
    return {
      isInitialized: this.isInitialized,
      isProcessing: false, // Would need to track this
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
   * Terminate the worker and clean up.
   */
  async terminate(): Promise<void> {
    if (this.workerApi) {
      try {
        await this.workerApi.terminate();
      } catch {
        // Worker might already be terminated
      }
    }

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.workerApi = null;
    this.isInitialized = false;
    this.initPromise = null;
    this.progressCallback = null;
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

/**
 * Re-export types from worker.
 */
export type {
  WorkerProcessingProgress,
  WorkerProcessingOptions,
  ProcessedDocumentResult,
  PDFExtractionResult,
  OCRResult,
  ExtractedEntities,
  ValidationResult,
};
