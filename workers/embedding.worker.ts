/**
 * Embedding Worker for Vault-AI
 *
 * Runs embedding generation in a Web Worker to prevent blocking the main thread.
 * Uses Comlink for a clean, promise-based API.
 *
 * PRIVACY: All processing happens locally in the browser.
 * Embeddings are NEVER transmitted to external servers.
 */

import { expose } from 'comlink';

// ============================================
// Types
// ============================================

/**
 * Progress callback for model loading.
 */
export interface WorkerProgressCallback {
  (progress: WorkerProgress): void;
}

/**
 * Progress information during model loading.
 */
export interface WorkerProgress {
  status: 'initiating' | 'downloading' | 'loading' | 'ready' | 'error';
  file?: string;
  progress: number;
  totalBytes?: number;
  loadedBytes?: number;
  error?: string;
}

/**
 * Model status information.
 */
export interface WorkerModelStatus {
  loaded: boolean;
  loadProgress: number;
  modelName: string;
  backend: 'webgpu' | 'webgl' | 'wasm' | 'cpu';
  memoryUsage: number;
  lastInferenceTime: number;
  isInferring: boolean;
  error: string | null;
}

/**
 * Embedding result from the worker.
 */
export interface WorkerEmbeddingResult {
  embedding: Float32Array;
  inferenceTimeMs: number;
  tokenCount: number;
  wasTruncated: boolean;
}

/**
 * Batch embedding result from the worker.
 */
export interface WorkerBatchResult {
  embeddings: Float32Array[];
  totalInferenceTimeMs: number;
  avgInferenceTimeMs: number;
  count: number;
  truncatedCount: number;
}

/**
 * Worker configuration.
 */
export interface WorkerConfig {
  modelName: string;
  quantized: boolean;
  maxSequenceLength: number;
  poolingStrategy: 'mean' | 'max' | 'cls';
  normalize: boolean;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: WorkerConfig = {
  modelName: 'Xenova/all-MiniLM-L6-v2',
  quantized: true,
  maxSequenceLength: 256,
  poolingStrategy: 'mean',
  normalize: true,
};

const MODEL_SIZE_MB = 23;

// ============================================
// Pipeline Types
// ============================================

// Type definitions for Transformers.js
type Pipeline = {
  (
    text: string | string[],
    options?: { pooling?: string; normalize?: boolean }
  ): Promise<{ data: Float32Array }>;
  tokenizer?: {
    model_max_length?: number;
  };
};

type ProgressInfo = {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

type ProgressCallback = (progress: ProgressInfo) => void;

type PipelineFactory = (
  task: string,
  model: string,
  options: {
    quantized?: boolean;
    progress_callback?: ProgressCallback;
  }
) => Promise<Pipeline>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransformersModule = any;

// ============================================
// Embedding Worker Class
// ============================================

/**
 * Worker class that handles embedding generation.
 * Designed to be exposed via Comlink.
 */
class EmbeddingWorker {
  private pipeline: Pipeline | null = null;
  private config: WorkerConfig;
  private status: WorkerModelStatus;
  private initPromise: Promise<void> | null = null;
  private transformers: TransformersModule | null = null;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.status = {
      loaded: false,
      loadProgress: 0,
      modelName: this.config.modelName,
      backend: 'cpu',
      memoryUsage: 0,
      lastInferenceTime: 0,
      isInferring: false,
      error: null,
    };
  }

  /**
   * Initialize the embedding model with progress reporting.
   */
  async initialize(
    config?: Partial<WorkerConfig>,
    onProgress?: WorkerProgressCallback
  ): Promise<void> {
    // Apply config overrides
    if (config) {
      this.config = { ...this.config, ...config };
      this.status.modelName = this.config.modelName;
    }

    // Already initialized
    if (this.pipeline) {
      return;
    }

    // Initialization in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._initialize(onProgress);
    return this.initPromise;
  }

  private async _initialize(
    onProgress?: WorkerProgressCallback
  ): Promise<void> {
    try {
      this.reportProgress(onProgress, {
        status: 'initiating',
        progress: 0,
      });

      // Dynamically import Transformers.js
      this.transformers = await import('@xenova/transformers');
      const { pipeline, env } = this.transformers;

      // Configure environment for worker context
      this.configureEnvironment(env);

      // Detect best backend
      this.status.backend = this.detectBackend();

      this.reportProgress(onProgress, {
        status: 'downloading',
        progress: 0,
      });

      // Create the pipeline with progress tracking
      this.pipeline = await (pipeline as PipelineFactory)(
        'feature-extraction',
        this.config.modelName,
        {
          quantized: this.config.quantized,
          progress_callback: (progressInfo: ProgressInfo) => {
            if (progressInfo.status === 'progress' && progressInfo.progress) {
              this.status.loadProgress = progressInfo.progress;
              this.reportProgress(onProgress, {
                status: 'downloading',
                file: progressInfo.file,
                progress: progressInfo.progress,
                loadedBytes: progressInfo.loaded,
                totalBytes: progressInfo.total,
              });
            } else if (progressInfo.status === 'done') {
              this.reportProgress(onProgress, {
                status: 'loading',
                progress: 100,
              });
            }
          },
        }
      );

      // Update status
      this.status.loaded = true;
      this.status.loadProgress = 100;
      this.status.memoryUsage = MODEL_SIZE_MB * 1024 * 1024;
      this.status.error = null;

      this.reportProgress(onProgress, {
        status: 'ready',
        progress: 100,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      this.status.error = errorMessage;
      this.status.loaded = false;
      this.initPromise = null;

      this.reportProgress(onProgress, {
        status: 'error',
        progress: 0,
        error: errorMessage,
      });

      throw new Error(`Failed to initialize embedding model: ${errorMessage}`);
    }
  }

  /**
   * Configure the Transformers.js environment for worker context.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private configureEnvironment(env: any): void {
    // Allow remote models
    env.allowRemoteModels = true;

    // Use cache
    env.useBrowserCache = true;

    // Configure threading
    if (env.backends?.onnx?.wasm) {
      // Use multiple threads in worker
      env.backends.onnx.wasm.numThreads = Math.max(
        1,
        (navigator.hardwareConcurrency || 4) - 1
      );
    }
  }

  /**
   * Detect best available backend in worker context.
   */
  private detectBackend(): WorkerModelStatus['backend'] {
    // WebGL check - workers may have limited access
    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        const canvas = new OffscreenCanvas(1, 1);
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (gl) {
          return 'webgl';
        }
      } catch {
        // WebGL not available in worker
      }
    }

    // WASM is our main target for workers
    if (typeof WebAssembly !== 'undefined') {
      return 'wasm';
    }

    return 'cpu';
  }

  /**
   * Report progress to callback.
   */
  private reportProgress(
    callback: WorkerProgressCallback | undefined,
    progress: WorkerProgress
  ): void {
    if (callback) {
      callback(progress);
    }
  }

  /**
   * Check if the model is ready.
   */
  isReady(): boolean {
    return this.status.loaded && this.pipeline !== null;
  }

  /**
   * Get current model status.
   */
  getStatus(): WorkerModelStatus {
    return { ...this.status };
  }

  /**
   * Generate embedding for a single text.
   */
  async embedText(text: string): Promise<WorkerEmbeddingResult> {
    if (!this.pipeline) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    if (!text || typeof text !== 'string') {
      throw new Error('Invalid input: text must be a non-empty string');
    }

    this.status.isInferring = true;
    const startTime = performance.now();

    try {
      // Truncate if needed
      const { text: truncatedText, wasTruncated } = this.truncateText(text);

      // Run inference
      const output = await this.pipeline(truncatedText, {
        pooling: this.config.poolingStrategy,
        normalize: this.config.normalize,
      });

      const inferenceTime = performance.now() - startTime;
      this.status.lastInferenceTime = inferenceTime;
      this.status.isInferring = false;

      // Estimate token count (rough approximation)
      const tokenCount = Math.ceil(truncatedText.length / 4);

      return {
        embedding: output.data,
        inferenceTimeMs: inferenceTime,
        tokenCount,
        wasTruncated,
      };
    } catch (error) {
      this.status.isInferring = false;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Embedding generation failed: ${errorMessage}`);
    }
  }

  /**
   * Generate embeddings for multiple texts.
   */
  async embedBatch(texts: string[]): Promise<WorkerBatchResult> {
    if (!this.pipeline) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Invalid input: texts must be a non-empty array');
    }

    this.status.isInferring = true;
    const startTime = performance.now();

    try {
      const embeddings: Float32Array[] = [];
      let truncatedCount = 0;

      // Process in batches to manage memory
      const BATCH_SIZE = 8;

      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
          batch.map(async (text) => {
            const { text: truncatedText, wasTruncated } =
              this.truncateText(text);

            if (wasTruncated) {
              truncatedCount++;
            }

            const output = await this.pipeline!(truncatedText, {
              pooling: this.config.poolingStrategy,
              normalize: this.config.normalize,
            });

            return output.data;
          })
        );

        embeddings.push(...batchResults);
      }

      const totalTime = performance.now() - startTime;
      this.status.lastInferenceTime = totalTime;
      this.status.isInferring = false;

      return {
        embeddings,
        totalInferenceTimeMs: totalTime,
        avgInferenceTimeMs: totalTime / texts.length,
        count: texts.length,
        truncatedCount,
      };
    } catch (error) {
      this.status.isInferring = false;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Batch embedding failed: ${errorMessage}`);
    }
  }

  /**
   * Warm up the model.
   */
  async warmup(): Promise<void> {
    if (!this.pipeline) {
      await this.initialize();
    }

    // Run dummy inference
    await this.embedText('warmup');
  }

  /**
   * Truncate text to max sequence length.
   */
  private truncateText(text: string): { text: string; wasTruncated: boolean } {
    // Approximate 4 characters per token
    const maxChars = this.config.maxSequenceLength * 4;

    if (text.length <= maxChars) {
      return { text, wasTruncated: false };
    }

    return {
      text: text.slice(0, maxChars - 3) + '...',
      wasTruncated: true,
    };
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.pipeline = null;
    this.transformers = null;
    this.initPromise = null;
    this.status = {
      loaded: false,
      loadProgress: 0,
      modelName: this.config.modelName,
      backend: 'cpu',
      memoryUsage: 0,
      lastInferenceTime: 0,
      isInferring: false,
      error: null,
    };
  }
}

// ============================================
// Expose Worker via Comlink
// ============================================

const embeddingWorker = new EmbeddingWorker();
expose(embeddingWorker);

// Export types for use with Comlink
export type { EmbeddingWorker };
