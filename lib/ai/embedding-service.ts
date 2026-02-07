/**
 * Local Embedding Service for Vault-AI
 *
 * Generates embeddings using Transformers.js running entirely in the browser.
 * Uses the all-MiniLM-L6-v2 model for semantic similarity tasks.
 *
 * PRIVACY: All embedding generation happens locally - vectors are NEVER
 * transmitted to external servers.
 */

import type { ModelStatus, ModelConfig, InferenceBackend } from '@/types/ai';

// ============================================
// Types
// ============================================

/**
 * Progress callback for model download/initialization.
 */
export interface ModelProgressCallback {
  (progress: ModelProgress): void;
}

/**
 * Progress information during model loading.
 */
export interface ModelProgress {
  /** Current status */
  status: 'initiating' | 'downloading' | 'loading' | 'ready' | 'error';

  /** File being downloaded (if applicable) */
  file?: string;

  /** Download progress (0-100) */
  progress: number;

  /** Total size in bytes (if known) */
  totalBytes?: number;

  /** Downloaded bytes */
  loadedBytes?: number;

  /** Error message if status is 'error' */
  error?: string;
}

/**
 * Interface for the embedding service.
 */
export interface EmbeddingService {
  /** Initialize the model */
  initialize(onProgress?: ModelProgressCallback): Promise<void>;

  /** Check if the model is ready */
  isReady(): boolean;

  /** Get current model status */
  getStatus(): ModelStatus;

  /** Generate embedding for a single text */
  embedText(text: string): Promise<Float32Array>;

  /** Generate embeddings for multiple texts */
  embedBatch(texts: string[]): Promise<Float32Array[]>;

  /** Warm up the model (run a dummy inference) */
  warmup(): Promise<void>;

  /** Dispose of resources */
  dispose(): void;
}

/**
 * Model information.
 */
export interface ModelInfo {
  name: string;
  dimensions: number;
  quantized: boolean;
  backend: InferenceBackend;
  modelSizeMB: number;
}

// ============================================
// Configuration
// ============================================

/**
 * Default model configuration.
 */
export const EMBEDDING_CONFIG: ModelConfig = {
  modelName: 'Xenova/all-MiniLM-L6-v2',
  dimensions: 384,
  quantized: true,
  maxSequenceLength: 256,
  poolingStrategy: 'mean',
  normalize: true,
};

/**
 * Approximate model size in MB.
 */
export const MODEL_SIZE_MB = 23;

// ============================================
// EmbeddingServiceImpl
// ============================================

// Define the pipeline and tokenizer types for Transformers.js
type Pipeline = {
  (
    text: string | string[],
    options?: { pooling?: string; normalize?: boolean }
  ): Promise<{ data: Float32Array }>;
  tokenizer?: {
    model_max_length?: number;
  };
};

type ProgressCallback = (progress: {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}) => void;

type PipelineFactory = (
  task: string,
  model: string,
  options: {
    quantized?: boolean;
    progress_callback?: ProgressCallback;
  }
) => Promise<Pipeline>;

type EnvType = {
  backends: {
    onnx: {
      wasm?: { numThreads?: number };
    };
  };
  allowRemoteModels?: boolean;
  useBrowserCache?: boolean;
};

/**
 * Implementation of the embedding service using Transformers.js.
 *
 * This is a singleton that manages the embedding model lifecycle.
 * The model is loaded lazily on first use.
 */
class EmbeddingServiceImpl implements EmbeddingService {
  private pipeline: Pipeline | null = null;
  private config: ModelConfig;
  private status: ModelStatus;
  private initPromise: Promise<void> | null = null;
  private progressCallback: ModelProgressCallback | null = null;

  constructor(config: ModelConfig = EMBEDDING_CONFIG) {
    this.config = config;
    this.status = {
      loaded: false,
      loadProgress: 0,
      modelName: config.modelName,
      backend: 'cpu',
      memoryUsage: 0,
      lastInferenceTime: 0,
      isInferring: false,
      error: null,
    };
  }

  /**
   * Initialize the embedding model.
   * This loads the model weights and prepares for inference.
   */
  async initialize(onProgress?: ModelProgressCallback): Promise<void> {
    // If already initialized, return immediately
    if (this.pipeline) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    this.progressCallback = onProgress ?? null;

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      this.updateProgress({
        status: 'initiating',
        progress: 0,
      });

      // Dynamically import Transformers.js to enable tree-shaking
      const transformers = await import('@xenova/transformers');
      const { pipeline, env } = transformers;

      // Configure environment
      this.configureEnvironment(env as unknown as EnvType);

      // Detect backend
      this.status.backend = await this.detectBackend();

      this.updateProgress({
        status: 'downloading',
        progress: 0,
      });

      // Create the feature extraction pipeline
      this.pipeline = await (pipeline as PipelineFactory)(
        'feature-extraction',
        this.config.modelName,
        {
          quantized: this.config.quantized,
          progress_callback: (progress) => {
            if (progress.status === 'progress' && progress.progress) {
              this.updateProgress({
                status: 'downloading',
                file: progress.file,
                progress: progress.progress,
                loadedBytes: progress.loaded,
                totalBytes: progress.total,
              });
            } else if (progress.status === 'done') {
              this.updateProgress({
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
      this.status.memoryUsage = MODEL_SIZE_MB * 1024 * 1024; // Approximate

      this.updateProgress({
        status: 'ready',
        progress: 100,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.status.error = errorMessage;
      this.status.loaded = false;

      this.updateProgress({
        status: 'error',
        progress: 0,
        error: errorMessage,
      });

      this.initPromise = null;
      throw new EmbeddingError(`Failed to initialize model: ${errorMessage}`);
    }
  }

  /**
   * Configure the Transformers.js environment.
   */
  private configureEnvironment(env: EnvType): void {
    // Allow loading models from Hugging Face Hub
    env.allowRemoteModels = true;

    // Use browser cache for models
    env.useBrowserCache = true;

    // Configure WASM backend (fallback)
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;
    }
  }

  /**
   * Detect the best available inference backend.
   */
  private async detectBackend(): Promise<InferenceBackend> {
    // Check for WebGPU support (future)
    if ('gpu' in navigator) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (adapter) {
          return 'webgpu';
        }
      } catch {
        // WebGPU not available
      }
    }

    // Check for WebGL support
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        return 'webgl';
      }
    } catch {
      // WebGL not available
    }

    // Check for WebAssembly support
    if (typeof WebAssembly !== 'undefined') {
      return 'wasm';
    }

    // Fallback to CPU
    return 'cpu';
  }

  /**
   * Update progress and notify callback.
   */
  private updateProgress(progress: ModelProgress): void {
    this.status.loadProgress = progress.progress;

    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  /**
   * Check if the model is ready for inference.
   */
  isReady(): boolean {
    return this.status.loaded && this.pipeline !== null;
  }

  /**
   * Get the current model status.
   */
  getStatus(): ModelStatus {
    return { ...this.status };
  }

  /**
   * Get model information.
   */
  getModelInfo(): ModelInfo {
    return {
      name: this.config.modelName,
      dimensions: this.config.dimensions,
      quantized: this.config.quantized,
      backend: this.status.backend,
      modelSizeMB: MODEL_SIZE_MB,
    };
  }

  /**
   * Generate an embedding for a single text.
   */
  async embedText(text: string): Promise<Float32Array> {
    if (!this.pipeline) {
      throw new EmbeddingError(
        'Model not initialized. Call initialize() first.',
        'MODEL_NOT_READY'
      );
    }

    if (!text || typeof text !== 'string') {
      throw new EmbeddingError(
        'Invalid input: text must be a non-empty string'
      );
    }

    this.status.isInferring = true;
    const startTime = performance.now();

    try {
      // Truncate text if needed
      const truncatedText = this.truncateText(text);

      // Run inference
      const output = await this.pipeline(truncatedText, {
        pooling: this.config.poolingStrategy,
        normalize: this.config.normalize,
      });

      const embedding = output.data;

      // Update stats
      this.status.lastInferenceTime = performance.now() - startTime;
      this.status.isInferring = false;

      return embedding;
    } catch (error) {
      this.status.isInferring = false;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new EmbeddingError(`Embedding generation failed: ${errorMessage}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch.
   * More efficient than calling embedText repeatedly.
   */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.pipeline) {
      throw new EmbeddingError(
        'Model not initialized. Call initialize() first.',
        'MODEL_NOT_READY'
      );
    }

    if (!Array.isArray(texts) || texts.length === 0) {
      throw new EmbeddingError(
        'Invalid input: texts must be a non-empty array'
      );
    }

    this.status.isInferring = true;
    const startTime = performance.now();

    try {
      // Truncate all texts
      const truncatedTexts = texts.map((text) => this.truncateText(text));

      // Process in smaller batches to manage memory
      const BATCH_SIZE = 8;
      const embeddings: Float32Array[] = [];

      for (let i = 0; i < truncatedTexts.length; i += BATCH_SIZE) {
        const batch = truncatedTexts.slice(i, i + BATCH_SIZE);

        // Run inference for this batch
        const pipeline = this.pipeline;
        if (!pipeline) {
          throw new EmbeddingError(
            'Pipeline became null during batch processing',
            'PIPELINE_ERROR'
          );
        }

        const outputs = await Promise.all(
          batch.map(async (text) => {
            const output = await pipeline(text, {
              pooling: this.config.poolingStrategy,
              normalize: this.config.normalize,
            });
            return output.data;
          })
        );

        embeddings.push(...outputs);
      }

      // Update stats
      this.status.lastInferenceTime = performance.now() - startTime;
      this.status.isInferring = false;

      return embeddings;
    } catch (error) {
      this.status.isInferring = false;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new EmbeddingError(`Batch embedding failed: ${errorMessage}`);
    }
  }

  /**
   * Warm up the model by running a dummy inference.
   * This helps reduce latency for subsequent calls.
   */
  async warmup(): Promise<void> {
    if (!this.pipeline) {
      await this.initialize();
    }

    // Run a dummy inference to warm up the model
    await this.embedText('warmup');
  }

  /**
   * Truncate text to the maximum sequence length.
   */
  private truncateText(text: string): string {
    // Rough approximation: 4 characters per token on average
    const approxMaxChars = this.config.maxSequenceLength * 4;

    if (text.length <= approxMaxChars) {
      return text;
    }

    // Truncate and add ellipsis
    return `${text.slice(0, approxMaxChars - 3)}...`;
  }

  /**
   * Dispose of the model and free resources.
   */
  dispose(): void {
    this.pipeline = null;
    this.initPromise = null;
    this.progressCallback = null;
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
// Error Class
// ============================================

/**
 * Custom error class for embedding-related errors.
 */
export class EmbeddingError extends Error {
  code: string;
  recoverable: boolean;

  constructor(
    message: string,
    code: string = 'EMBEDDING_ERROR',
    recoverable: boolean = true
  ) {
    super(message);
    this.name = 'EmbeddingError';
    this.code = code;
    this.recoverable = recoverable;
    Object.setPrototypeOf(this, EmbeddingError.prototype);
  }
}

// ============================================
// Singleton Export
// ============================================

/**
 * Singleton instance of the embedding service.
 * Use this for all embedding operations in the application.
 */
export const embeddingService = new EmbeddingServiceImpl(EMBEDDING_CONFIG);

/**
 * Factory function to create a new embedding service instance.
 * Use this if you need a custom configuration or isolated instance.
 */
export function createEmbeddingService(
  config: Partial<ModelConfig> = {}
): EmbeddingService {
  return new EmbeddingServiceImpl({ ...EMBEDDING_CONFIG, ...config });
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate cosine similarity between two vectors.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Find the most similar items to a query embedding.
 */
export function findSimilar(
  queryEmbedding: Float32Array,
  embeddings: Array<{ id: string; embedding: Float32Array }>,
  topK: number = 10
): Array<{ id: string; score: number }> {
  const scored = embeddings
    .filter(
      (item): item is { id: string; embedding: Float32Array } =>
        item !== undefined &&
        item.id !== undefined &&
        item.embedding !== undefined
    )
    .map(({ id, embedding }) => ({
      id,
      score: cosineSimilarity(queryEmbedding, embedding),
    }));

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
