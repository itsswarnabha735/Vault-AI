/**
 * Local Linear Classifier for Transaction Categories (4C)
 *
 * A tiny single-layer classifier trained entirely in the browser on
 * the user's own labelled transaction embeddings.
 *
 * Architecture:
 *   Input:  384-dim embedding (all-MiniLM-L6-v2, frozen)
 *   Layer:  Linear(384, N_categories) + softmax
 *   Output: probability distribution over categories
 *
 * Training:
 *   - Stochastic Gradient Descent with cross-entropy loss
 *   - Learns incrementally: can add new training samples without
 *     retraining from scratch
 *   - Weights persisted to IndexedDB so they survive page reloads
 *
 * PRIVACY: All training and inference happen locally. Nothing leaves
 * the device.
 */

import { db } from '@/lib/storage/db';
import { isRealEmbedding } from '@/lib/ai/embedding-classifier';
import type { CategoryId } from '@/types/database';

// ============================================
// Types
// ============================================

export interface ClassifierPrediction {
  /** Most likely category ID */
  categoryId: CategoryId;
  /** Confidence (softmax probability) for the top category */
  confidence: number;
  /** Top-3 predictions with probabilities */
  topK: Array<{ categoryId: CategoryId; probability: number }>;
  /** Source marker */
  source: 'local-classifier';
}

interface ClassifierWeights {
  /** Weight matrix: flat array of shape [numClasses * 384] (row-major) */
  weights: Float32Array;
  /** Bias vector: [numClasses] */
  biases: Float32Array;
  /** Category ID for each class index */
  classLabels: CategoryId[];
  /** Number of training samples seen */
  trainingSamples: number;
  /** Timestamp of last training */
  lastTrained: number;
}

interface TrainingSample {
  embedding: Float32Array;
  categoryId: CategoryId;
}

// ============================================
// Configuration
// ============================================

/** Embedding dimension (all-MiniLM-L6-v2) */
const EMBED_DIM = 384;

/** Learning rate for SGD */
const LEARNING_RATE = 0.01;

/** Number of epochs for full retrain */
const FULL_RETRAIN_EPOCHS = 10;

/** Number of epochs for incremental update */
const INCREMENTAL_EPOCHS = 3;

/** Minimum labelled samples to train */
const MIN_SAMPLES = 20;

/** L2 regularization strength */
const L2_LAMBDA = 0.001;

/** IndexedDB key for persisted weights */
const WEIGHTS_STORAGE_KEY = 'local-classifier-weights';

// ============================================
// Math Helpers (pure, no dependencies)
// ============================================

/**
 * Softmax over a 1D array (in-place for efficiency).
 */
function softmax(logits: Float32Array): Float32Array {
  // Numerical stability: subtract max
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (logits[i]! > max) {
      max = logits[i]!;
    }
  }
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    logits[i] = Math.exp(logits[i]! - max);
    sum += logits[i]!;
  }
  for (let i = 0; i < logits.length; i++) {
    logits[i] = logits[i]! / sum;
  }
  return logits;
}

/**
 * Compute logits = W * x + b (matrix-vector multiply).
 * W is [numClasses x EMBED_DIM], stored row-major.
 */
function forward(
  weights: Float32Array,
  biases: Float32Array,
  embedding: Float32Array,
  numClasses: number
): Float32Array {
  const logits = new Float32Array(numClasses);
  for (let c = 0; c < numClasses; c++) {
    let sum = biases[c]!;
    const offset = c * EMBED_DIM;
    for (let d = 0; d < EMBED_DIM; d++) {
      sum += weights[offset + d]! * embedding[d]!;
    }
    logits[c] = sum;
  }
  return logits;
}

/**
 * Cross-entropy loss for a single sample.
 */
function crossEntropyLoss(probs: Float32Array, targetClass: number): number {
  const p = Math.max(1e-7, probs[targetClass]!);
  return -Math.log(p);
}

/**
 * SGD step: update weights and biases using the gradient of
 * cross-entropy loss w.r.t. a single sample.
 *
 * Gradient for softmax + cross-entropy:
 *   dL/dlogit_j = prob_j - (j == target ? 1 : 0)
 *   dL/dW_jd = dL/dlogit_j * x_d
 *   dL/db_j = dL/dlogit_j
 */
function sgdStep(
  weights: Float32Array,
  biases: Float32Array,
  embedding: Float32Array,
  probs: Float32Array,
  targetClass: number,
  numClasses: number,
  lr: number
): void {
  for (let c = 0; c < numClasses; c++) {
    const grad = probs[c]! - (c === targetClass ? 1 : 0);
    const offset = c * EMBED_DIM;

    // Update weights with L2 regularisation
    for (let d = 0; d < EMBED_DIM; d++) {
      weights[offset + d] =
        weights[offset + d]! -
        lr * (grad * embedding[d]! + L2_LAMBDA * weights[offset + d]!);
    }

    // Update bias
    biases[c] = biases[c]! - lr * grad;
  }
}

/**
 * Shuffle an array in-place (Fisher-Yates).
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

// ============================================
// Classifier Service
// ============================================

class LocalClassifierService {
  private weights: ClassifierWeights | null = null;
  private loaded = false;

  /**
   * Load persisted weights from IndexedDB.
   */
  async loadWeights(): Promise<boolean> {
    if (this.loaded && this.weights) {
      return true;
    }

    try {
      const stored = await db.kvStore.get(WEIGHTS_STORAGE_KEY);
      if (stored?.value) {
        const raw = stored.value as {
          weights: number[];
          biases: number[];
          classLabels: string[];
          trainingSamples: number;
          lastTrained: number;
        };
        this.weights = {
          weights: new Float32Array(raw.weights),
          biases: new Float32Array(raw.biases),
          classLabels: raw.classLabels as CategoryId[],
          trainingSamples: raw.trainingSamples,
          lastTrained: raw.lastTrained,
        };
        this.loaded = true;
        console.log(
          `[LocalClassifier] Loaded weights (${this.weights.classLabels.length} classes, ${this.weights.trainingSamples} samples)`
        );
        return true;
      }
    } catch (error) {
      console.warn('[LocalClassifier] Failed to load weights:', error);
    }
    this.loaded = true;
    return false;
  }

  /**
   * Persist current weights to IndexedDB.
   */
  private async saveWeights(): Promise<void> {
    if (!this.weights) {
      return;
    }

    try {
      await db.kvStore.put({
        key: WEIGHTS_STORAGE_KEY,
        value: {
          weights: Array.from(this.weights.weights),
          biases: Array.from(this.weights.biases),
          classLabels: this.weights.classLabels,
          trainingSamples: this.weights.trainingSamples,
          lastTrained: this.weights.lastTrained,
        },
      });
    } catch (error) {
      console.error('[LocalClassifier] Failed to save weights:', error);
    }
  }

  /**
   * Train the classifier from scratch on all labelled transactions.
   *
   * @returns Training stats or null if insufficient data
   */
  async train(): Promise<{
    numClasses: number;
    numSamples: number;
    finalLoss: number;
    epochs: number;
  } | null> {
    // Gather training data
    const transactions = await db.transactions.toArray();
    const samples: TrainingSample[] = [];

    for (const tx of transactions) {
      // Only train on transactions with real (non-zero) embeddings.
      // Zero-filled embeddings from statement/CSV imports would pollute
      // the classifier weights.
      if (tx.category && isRealEmbedding(tx.embedding)) {
        samples.push({
          embedding: tx.embedding as Float32Array,
          categoryId: tx.category,
        });
      }
    }

    if (samples.length < MIN_SAMPLES) {
      console.log(
        `[LocalClassifier] Not enough samples to train (${samples.length}/${MIN_SAMPLES})`
      );
      return null;
    }

    // Build class label mapping
    const classSet = new Set<CategoryId>();
    for (const s of samples) {
      classSet.add(s.categoryId);
    }
    const classLabels = Array.from(classSet);
    const classIndex = new Map<CategoryId, number>();
    classLabels.forEach((label, idx) => classIndex.set(label, idx));
    const numClasses = classLabels.length;

    if (numClasses < 2) {
      console.log('[LocalClassifier] Need at least 2 classes to train');
      return null;
    }

    // Initialise weights (Xavier init)
    const scale = Math.sqrt(2 / (EMBED_DIM + numClasses));
    const weights = new Float32Array(numClasses * EMBED_DIM);
    for (let i = 0; i < weights.length; i++) {
      weights[i] = (Math.random() - 0.5) * 2 * scale;
    }
    const biases = new Float32Array(numClasses); // zero init

    // Train
    let finalLoss = 0;
    for (let epoch = 0; epoch < FULL_RETRAIN_EPOCHS; epoch++) {
      shuffle(samples);
      let epochLoss = 0;

      for (const sample of samples) {
        const targetIdx = classIndex.get(sample.categoryId)!;
        const logits = forward(weights, biases, sample.embedding, numClasses);
        const probs = softmax(logits);
        epochLoss += crossEntropyLoss(probs, targetIdx);
        sgdStep(
          weights,
          biases,
          sample.embedding,
          probs,
          targetIdx,
          numClasses,
          LEARNING_RATE
        );
      }

      finalLoss = epochLoss / samples.length;
    }

    // Store
    this.weights = {
      weights,
      biases,
      classLabels,
      trainingSamples: samples.length,
      lastTrained: Date.now(),
    };
    await this.saveWeights();

    console.log(
      `[LocalClassifier] Trained: ${numClasses} classes, ${samples.length} samples, loss=${finalLoss.toFixed(4)}`
    );

    return {
      numClasses,
      numSamples: samples.length,
      finalLoss,
      epochs: FULL_RETRAIN_EPOCHS,
    };
  }

  /**
   * Incrementally update the classifier with new labelled samples.
   * Much faster than full retrain — only runs a few SGD epochs
   * on the new data.
   */
  async incrementalUpdate(newSamples: TrainingSample[]): Promise<boolean> {
    if (!this.weights) {
      // Need to do a full train first
      const result = await this.train();
      return result !== null;
    }

    if (newSamples.length === 0) {
      return true;
    }

    const { weights, biases, classLabels } = this.weights;
    const classIndex = new Map<CategoryId, number>();
    classLabels.forEach((label, idx) => classIndex.set(label, idx));

    // Check if any new sample has an unseen class
    let hasNewClasses = false;
    for (const s of newSamples) {
      if (!classIndex.has(s.categoryId)) {
        hasNewClasses = true;
        break;
      }
    }

    if (hasNewClasses) {
      // New class appeared → need full retrain to expand weight matrix
      await this.train();
      return true;
    }

    // Incremental SGD on new samples
    const numClasses = classLabels.length;
    for (let epoch = 0; epoch < INCREMENTAL_EPOCHS; epoch++) {
      shuffle(newSamples);
      for (const sample of newSamples) {
        const targetIdx = classIndex.get(sample.categoryId)!;
        const logits = forward(weights, biases, sample.embedding, numClasses);
        const probs = softmax(logits);
        sgdStep(
          weights,
          biases,
          sample.embedding,
          probs,
          targetIdx,
          numClasses,
          LEARNING_RATE * 0.5 // Lower LR for incremental updates
        );
      }
    }

    this.weights.trainingSamples += newSamples.length;
    this.weights.lastTrained = Date.now();
    await this.saveWeights();

    return true;
  }

  /**
   * Predict the category for a single embedding.
   *
   * @param embedding - 384-dim embedding
   * @returns Prediction or null if classifier isn't trained
   */
  async predict(
    embedding: Float32Array | number[]
  ): Promise<ClassifierPrediction | null> {
    await this.loadWeights();
    if (!this.weights) {
      return null;
    }

    // Reject zero-filled embeddings
    if (!isRealEmbedding(embedding)) {
      return null;
    }

    const vec =
      embedding instanceof Float32Array
        ? embedding
        : new Float32Array(embedding);

    const { weights, biases, classLabels } = this.weights;
    const numClasses = classLabels.length;

    const logits = forward(weights, biases, vec, numClasses);
    const probs = softmax(logits);

    // Get top-K
    const indexed: Array<{ idx: number; prob: number }> = [];
    for (let i = 0; i < numClasses; i++) {
      indexed.push({ idx: i, prob: probs[i]! });
    }
    indexed.sort((a, b) => b.prob - a.prob);

    const topK = indexed.slice(0, 3).map((item) => ({
      categoryId: classLabels[item.idx]!,
      probability: Math.round(item.prob * 1000) / 1000,
    }));

    const top = indexed[0]!;
    return {
      categoryId: classLabels[top.idx]!,
      confidence: Math.round(top.prob * 1000) / 1000,
      topK,
      source: 'local-classifier',
    };
  }

  /**
   * Check if the classifier is trained and ready.
   */
  async isReady(): Promise<boolean> {
    await this.loadWeights();
    return this.weights !== null;
  }

  /**
   * Get classifier stats.
   */
  async getStats(): Promise<{
    isTrained: boolean;
    numClasses: number;
    trainingSamples: number;
    lastTrained: Date | null;
  }> {
    await this.loadWeights();
    if (!this.weights) {
      return {
        isTrained: false,
        numClasses: 0,
        trainingSamples: 0,
        lastTrained: null,
      };
    }
    return {
      isTrained: true,
      numClasses: this.weights.classLabels.length,
      trainingSamples: this.weights.trainingSamples,
      lastTrained: new Date(this.weights.lastTrained),
    };
  }

  /**
   * Clear trained weights.
   */
  async reset(): Promise<void> {
    this.weights = null;
    try {
      await db.kvStore.delete(WEIGHTS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

// ============================================
// Singleton Export
// ============================================

export const localClassifier = new LocalClassifierService();
