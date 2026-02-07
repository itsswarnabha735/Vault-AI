/**
 * Embedding Worker Client for Vault-AI
 *
 * Comlink wrapper that provides a clean API for interacting with
 * the embedding Web Worker.
 *
 * PRIVACY: All embedding operations run locally in a Web Worker.
 * No data is ever transmitted to external servers.
 */

import { wrap, proxy, releaseProxy, Remote } from 'comlink';
import type {
  EmbeddingWorker,
  WorkerProgress,
  WorkerProgressCallback,
  WorkerModelStatus,
  WorkerEmbeddingResult,
  WorkerBatchResult,
  WorkerConfig,
} from '@/workers/embedding.worker';
import type { EmbeddingService, ModelProgress } from './embedding-service';

// ============================================
// Types
// ============================================

/**
 * Client options for the embedding worker.
 */
export interface EmbeddingWorkerClientOptions {
  /** Whether to auto-initialize on first use */
  autoInitialize?: boolean;

  /** Configuration overrides */
  config?: Partial<WorkerConfig>;
}

/**
 * Callback for progress updates.
 */
export type ProgressCallback = (progress: ModelProgress) => void;

// ============================================
// Worker Client Implementation
// ============================================

/**
 * Client for the embedding Web Worker.
 *
 * Provides a clean, promise-based API for embedding operations
 * that run off the main thread.
 *
 * @example
 * ```typescript
 * const client = new EmbeddingWorkerClient();
 *
 * // Initialize with progress tracking
 * await client.initialize((progress) => {
 *   console.log(`Loading: ${progress.progress}%`);
 * });
 *
 * // Generate embeddings
 * const embedding = await client.embedText("Hello world");
 *
 * // Cleanup when done
 * client.terminate();
 * ```
 */
export class EmbeddingWorkerClient implements EmbeddingService {
  private worker: Worker | null = null;
  private workerApi: Remote<EmbeddingWorker> | null = null;
  private options: EmbeddingWorkerClientOptions;
  private isInitializing: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(options: EmbeddingWorkerClientOptions = {}) {
    this.options = {
      autoInitialize: false,
      ...options,
    };
  }

  /**
   * Create and initialize the worker.
   */
  async initialize(onProgress?: ProgressCallback): Promise<void> {
    // Already initialized
    if (this.workerApi && (await this.workerApi.isReady())) {
      return;
    }

    // Initialization in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;
    this.initPromise = this._initialize(onProgress);

    try {
      await this.initPromise;
    } finally {
      this.isInitializing = false;
    }
  }

  private async _initialize(onProgress?: ProgressCallback): Promise<void> {
    // Create the worker
    this.worker = new Worker(
      new URL('../../workers/embedding.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Wrap with Comlink
    this.workerApi = wrap<EmbeddingWorker>(this.worker);

    // Create a proxy callback for progress updates
    const progressProxy = onProgress
      ? proxy((progress: WorkerProgress) => {
          onProgress({
            status: progress.status,
            file: progress.file,
            progress: progress.progress,
            totalBytes: progress.totalBytes,
            loadedBytes: progress.loadedBytes,
            error: progress.error,
          });
        })
      : undefined;

    // Initialize the worker
    await this.workerApi.initialize(
      this.options.config,
      progressProxy as WorkerProgressCallback | undefined
    );
  }

  /**
   * Ensure the worker is initialized.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.workerApi) {
      if (this.options.autoInitialize) {
        await this.initialize();
      } else {
        throw new Error(
          'Worker not initialized. Call initialize() first or enable autoInitialize.'
        );
      }
    }
  }

  /**
   * Get the worker API, throwing if not initialized.
   */
  private getWorkerApi(): Remote<EmbeddingWorker> {
    if (!this.workerApi) {
      throw new Error('Worker not initialized');
    }
    return this.workerApi;
  }

  /**
   * Check if the model is ready.
   */
  isReady(): boolean {
    // This is synchronous, but the actual check happens asynchronously
    // For a true async check, use isReadyAsync()
    return this.workerApi !== null && !this.isInitializing;
  }

  /**
   * Async check if the model is ready.
   */
  async isReadyAsync(): Promise<boolean> {
    if (!this.workerApi) {
      return false;
    }
    return this.workerApi.isReady();
  }

  /**
   * Get the current model status.
   */
  async getStatusAsync(): Promise<WorkerModelStatus> {
    await this.ensureInitialized();
    return this.getWorkerApi().getStatus();
  }

  /**
   * Get model status synchronously (returns last known status).
   * For accurate status, use getStatusAsync().
   */
  getStatus(): WorkerModelStatus {
    if (!this.workerApi) {
      return {
        loaded: false,
        loadProgress: 0,
        modelName: 'Xenova/all-MiniLM-L6-v2',
        backend: 'cpu',
        memoryUsage: 0,
        lastInferenceTime: 0,
        isInferring: false,
        error: null,
      };
    }

    // Return a default status - use getStatusAsync for accurate info
    return {
      loaded: true,
      loadProgress: 100,
      modelName: 'Xenova/all-MiniLM-L6-v2',
      backend: 'wasm',
      memoryUsage: 23 * 1024 * 1024,
      lastInferenceTime: 0,
      isInferring: false,
      error: null,
    };
  }

  /**
   * Generate embedding for a single text.
   */
  async embedText(text: string): Promise<Float32Array> {
    await this.ensureInitialized();
    const result: WorkerEmbeddingResult =
      await this.getWorkerApi().embedText(text);
    return result.embedding;
  }

  /**
   * Generate embedding with detailed result.
   */
  async embedTextWithDetails(text: string): Promise<WorkerEmbeddingResult> {
    await this.ensureInitialized();
    return this.getWorkerApi().embedText(text);
  }

  /**
   * Generate embeddings for multiple texts.
   */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    await this.ensureInitialized();
    const result: WorkerBatchResult =
      await this.getWorkerApi().embedBatch(texts);
    return result.embeddings;
  }

  /**
   * Generate batch embeddings with detailed result.
   */
  async embedBatchWithDetails(texts: string[]): Promise<WorkerBatchResult> {
    await this.ensureInitialized();
    return this.getWorkerApi().embedBatch(texts);
  }

  /**
   * Warm up the model.
   */
  async warmup(): Promise<void> {
    await this.ensureInitialized();
    await this.getWorkerApi().warmup();
  }

  /**
   * Dispose of the worker and release resources.
   */
  dispose(): void {
    if (this.workerApi) {
      // Tell the worker to clean up
      this.workerApi.dispose().catch(() => {
        // Ignore errors during disposal
      });

      // Release the Comlink proxy
      this.workerApi[releaseProxy]();
      this.workerApi = null;
    }

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.initPromise = null;
  }

  /**
   * Alias for dispose() to match EmbeddingService interface.
   */
  terminate(): void {
    this.dispose();
  }
}

// ============================================
// Singleton Instance
// ============================================

let _embeddingWorkerClient: EmbeddingWorkerClient | null = null;

/**
 * Get the singleton embedding worker client.
 *
 * Creates a new client if one doesn't exist.
 * Use this for most cases to avoid multiple workers.
 */
export function getEmbeddingWorkerClient(): EmbeddingWorkerClient {
  if (!_embeddingWorkerClient) {
    _embeddingWorkerClient = new EmbeddingWorkerClient({
      autoInitialize: false,
    });
  }
  return _embeddingWorkerClient;
}

/**
 * Initialize the singleton worker client with progress tracking.
 */
export async function initializeEmbeddingWorker(
  onProgress?: ProgressCallback
): Promise<EmbeddingWorkerClient> {
  const client = getEmbeddingWorkerClient();
  await client.initialize(onProgress);
  return client;
}

/**
 * Terminate the singleton worker client.
 */
export function terminateEmbeddingWorker(): void {
  if (_embeddingWorkerClient) {
    _embeddingWorkerClient.terminate();
    _embeddingWorkerClient = null;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new embedding worker client.
 *
 * Use this if you need multiple isolated workers or custom configuration.
 */
export function createEmbeddingWorkerClient(
  options?: EmbeddingWorkerClientOptions
): EmbeddingWorkerClient {
  return new EmbeddingWorkerClient(options);
}
