/**
 * AI/ML Types for Vault-AI
 *
 * Types related to machine learning, embeddings, vector search,
 * document processing, and chat functionality.
 */

import type { TransactionId, CategoryId } from './database';

// ============================================
// Model Status & Configuration
// ============================================

/**
 * Inference backend types ordered by preference.
 */
export type InferenceBackend = 'webgpu' | 'webgl' | 'wasm' | 'cpu';

/**
 * Status of the local ML model.
 */
export interface ModelStatus {
  /** Whether the model is loaded and ready */
  loaded: boolean;

  /** Current loading progress (0-100) */
  loadProgress: number;

  /** Model identifier */
  modelName: string;

  /** Active inference backend */
  backend: InferenceBackend;

  /** Approximate memory usage in bytes */
  memoryUsage: number;

  /** Last inference time in milliseconds */
  lastInferenceTime: number;

  /** Whether model is currently performing inference */
  isInferring: boolean;

  /** Error message if loading failed */
  error: string | null;
}

/**
 * Model configuration.
 */
export interface ModelConfig {
  /** Model name/path for Transformers.js */
  modelName: string;

  /** Embedding dimensions */
  dimensions: number;

  /** Whether to use quantized model */
  quantized: boolean;

  /** Maximum sequence length */
  maxSequenceLength: number;

  /** Pooling strategy */
  poolingStrategy: 'mean' | 'max' | 'cls';

  /** Whether to normalize output vectors */
  normalize: boolean;
}

/**
 * Default model configuration for Vault-AI.
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  modelName: 'Xenova/all-MiniLM-L6-v2',
  dimensions: 384,
  quantized: true,
  maxSequenceLength: 256,
  poolingStrategy: 'mean',
  normalize: true,
} as const;

// ============================================
// Embedding Types
// ============================================

/**
 * Result from embedding generation.
 */
export interface EmbeddingResult {
  /** The embedding vector */
  embedding: Float32Array;

  /** Model used for generation */
  model: string;

  /** Inference time in milliseconds */
  inferenceTimeMs: number;

  /** Number of tokens processed */
  tokenCount: number;

  /** Whether text was truncated */
  wasTruncated: boolean;
}

/**
 * Batch embedding result.
 */
export interface BatchEmbeddingResult {
  /** Array of embedding vectors */
  embeddings: Float32Array[];

  /** Total inference time in milliseconds */
  totalInferenceTimeMs: number;

  /** Average time per embedding */
  avgInferenceTimeMs: number;

  /** Number of texts processed */
  count: number;

  /** Number of texts that were truncated */
  truncatedCount: number;
}

// ============================================
// Vector Search Types
// ============================================

/**
 * Result from vector similarity search.
 */
export interface SearchResult {
  /** Transaction ID */
  id: TransactionId;

  /** Cosine similarity score (0-1) */
  score: number;

  /** Optional metadata attached to vector */
  metadata?: SearchResultMetadata;
}

/**
 * Metadata associated with search results.
 */
export interface SearchResultMetadata {
  /** Transaction date */
  date: string;

  /** Transaction amount */
  amount: number;

  /** Vendor name */
  vendor: string;

  /** Category ID */
  categoryId: CategoryId | null;

  /** Match reason for UI display */
  matchReason?: string;
}

/**
 * Enhanced search result with full transaction context.
 */
export interface EnrichedSearchResult extends SearchResult {
  /** Transaction date */
  date: string;

  /** Transaction amount */
  amount: number;

  /** Vendor name */
  vendor: string;

  /** Category name (resolved) */
  categoryName: string | null;

  /** Text snippet showing match context */
  snippet: string;

  /** Highlighted portions of the snippet */
  highlights: TextHighlight[];
}

/**
 * Text highlight for search result display.
 */
export interface TextHighlight {
  /** Start index in snippet */
  start: number;

  /** End index in snippet */
  end: number;

  /** Matched text */
  text: string;
}

/**
 * Vector search index statistics.
 */
export interface VectorIndexStats {
  /** Total number of vectors in index */
  vectorCount: number;

  /** Vector dimensions */
  dimensions: number;

  /** Approximate index size in bytes */
  indexSizeBytes: number;

  /** Last index update timestamp */
  lastUpdated: Date;

  /** Index algorithm used */
  algorithm: 'hnsw' | 'flat';
}

/**
 * Search filter options.
 */
export interface SearchFilter {
  /** Date range filter */
  dateRange?: {
    start: string;
    end: string;
  };

  /** Category filter */
  categories?: CategoryId[];

  /** Minimum amount */
  minAmount?: number;

  /** Maximum amount */
  maxAmount?: number;

  /** Vendor filter (partial match) */
  vendor?: string;
}

// ============================================
// Document Processing Types
// ============================================

/**
 * Processing stages for document ingestion.
 */
export type ProcessingStage =
  | 'validating'
  | 'extracting'
  | 'ocr'
  | 'embedding'
  | 'saving'
  | 'indexing'
  | 'complete'
  | 'error';

/**
 * Extracted entities from document.
 */
export interface ExtractedEntities {
  /** Extracted date with confidence */
  date: ExtractedField<string> | null;

  /** Extracted amount with confidence */
  amount: ExtractedField<number> | null;

  /** Extracted vendor with confidence */
  vendor: ExtractedField<string> | null;

  /** Generated description */
  description: string;

  /** Detected currency code */
  currency: string;

  /** All detected amounts (for multi-item receipts) */
  allAmounts: ExtractedField<number>[];

  /** All detected dates */
  allDates: ExtractedField<string>[];
}

/**
 * Extracted field with confidence score.
 */
export interface ExtractedField<T> {
  /** Extracted value */
  value: T;

  /** Confidence score (0-1) */
  confidence: number;

  /** Source text that led to extraction */
  source?: string;

  /** Position in original text */
  position?: {
    start: number;
    end: number;
  };
}

/**
 * Processed document ready for storage.
 */
export interface ProcessedDocument {
  /** Unique identifier */
  id: TransactionId;

  /** Full extracted text */
  rawText: string;

  /** Generated embedding vector */
  embedding: Float32Array;

  /** Extracted structured entities */
  entities: ExtractedEntities;

  /** OPFS file path */
  filePath: string;

  /** Original file metadata */
  fileMetadata: FileMetadata;

  /** Overall extraction confidence (0-1) */
  confidence: number;

  /** Total processing time in milliseconds */
  processingTimeMs: number;

  /** Whether OCR was used */
  ocrUsed: boolean;
}

/**
 * File metadata for processed documents.
 */
export interface FileMetadata {
  /** Original filename */
  originalName: string;

  /** MIME type */
  mimeType: string;

  /** File size in bytes */
  size: number;

  /** Number of pages (for PDFs) */
  pageCount: number | null;

  /** Image dimensions (for images) */
  dimensions?: {
    width: number;
    height: number;
  };
}

/**
 * Document processing progress event.
 */
export interface ProcessingProgress {
  /** Unique file identifier */
  fileId: string;

  /** Original filename */
  fileName: string;

  /** Current processing stage */
  stage: ProcessingStage;

  /** Progress within current stage (0-100) */
  progress: number;

  /** Current page being processed (for multi-page docs) */
  currentPage?: number;

  /** Total pages */
  totalPages?: number;

  /** Error if processing failed */
  error?: ProcessingError;

  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number;
}

/**
 * Document processing error.
 */
export interface ProcessingError {
  /** Error code */
  code: string;

  /** Human-readable message */
  message: string;

  /** Whether processing can be retried */
  recoverable: boolean;

  /** Suggestion for resolution */
  suggestion?: string;
}

// ============================================
// Chat Types
// ============================================

/**
 * Chat message roles.
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Query intent types for routing.
 */
export type QueryIntent =
  | 'spending_query'
  | 'income_query'
  | 'budget_query'
  | 'search_query'
  | 'comparison_query'
  | 'trend_query'
  | 'general_query';

/**
 * Chat message in a conversation.
 */
export interface ChatMessage {
  /** Unique message identifier */
  id: string;

  /** Message role */
  role: MessageRole;

  /** Message content */
  content: string;

  /** Message timestamp */
  timestamp: Date;

  /** Citations for assistant messages */
  citations: Citation[] | null;

  /** Query intent (for user messages) */
  intent?: QueryIntent;

  /** Whether message is still being generated */
  isStreaming?: boolean;

  /** Suggested follow-up questions */
  suggestedFollowups?: string[];
}

/**
 * Citation linking answer to source document.
 */
export interface Citation {
  /** Transaction ID of cited document */
  transactionId: TransactionId;

  /** Relevance score */
  relevanceScore: number;

  /** Text snippet from document */
  snippet: string;

  /** Display label for citation */
  label: string;

  /** Transaction date for context */
  date: string;

  /** Transaction amount */
  amount: number;

  /** Vendor name */
  vendor: string;
}

/**
 * Chat response from the AI.
 */
export interface ChatResponse {
  /** Response text */
  text: string;

  /** Source citations */
  citations: Citation[];

  /** Suggested follow-up questions */
  suggestedFollowups: string[];

  /** Verified totals from cloud (for financial queries) */
  verifiedData?: VerifiedFinancialData;

  /** Response generation time in milliseconds */
  responseTimeMs: number;

  /** Whether response was generated offline */
  offlineGenerated: boolean;
}

/**
 * Verified financial data from cloud.
 */
export interface VerifiedFinancialData {
  /** Net total amount (expenses + income, where expenses are positive, income negative) */
  total: number;

  /** Total expenses (sum of positive amounts) */
  totalExpenses: number;

  /** Total income (sum of absolute value of negative amounts) */
  totalIncome: number;

  /** Transaction count */
  count: number;

  /** Number of expense transactions */
  expenseCount: number;

  /** Number of income transactions */
  incomeCount: number;

  /** Category breakdown (amounts) */
  byCategory?: Record<string, number>;

  /** Category breakdown (transaction counts) */
  countByCategory?: Record<string, number>;

  /** Top vendors by total amount (sorted descending) */
  byVendor?: Array<{ vendor: string; total: number; count: number }>;

  /** Total number of distinct transactions (useful when context is a sample) */
  totalTransactionCount?: number;

  /** Time period covered */
  period?: {
    start: string;
    end: string;
  };
}

/**
 * Chat session state.
 */
export interface ChatSession {
  /** Session identifier */
  id: string;

  /** Message history */
  messages: ChatMessage[];

  /** Session creation timestamp */
  createdAt: Date;

  /** Last activity timestamp */
  lastActivityAt: Date;

  /** Session title (auto-generated) */
  title: string;
}

/**
 * Context for chat query processing.
 */
export interface ChatContext {
  /** Previous messages in session */
  sessionHistory: ChatMessage[];

  /** User preferences */
  userPreferences: {
    currency: string;
    timezone: string;
  };

  /** Retrieved transaction IDs for context */
  relevantTransactionIds: TransactionId[];
}

// ============================================
// Quick Queries
// ============================================

/**
 * Predefined quick query for common questions.
 */
export interface QuickQuery {
  /** Unique identifier */
  id: string;

  /** Display label */
  label: string;

  /** Query template */
  template: string;

  /** Icon for display */
  icon: string;

  /** Category of quick query */
  category: 'spending' | 'budget' | 'search' | 'insights';
}

/**
 * Default quick queries.
 */
export const DEFAULT_QUICK_QUERIES: QuickQuery[] = [
  {
    id: 'spending-this-month',
    label: 'Spending this month',
    template: 'How much did I spend this month?',
    icon: '📊',
    category: 'spending',
  },
  {
    id: 'budget-status',
    label: 'Budget status',
    template: "What's my budget status?",
    icon: '💰',
    category: 'budget',
  },
  {
    id: 'largest-expenses',
    label: 'Largest expenses',
    template: 'What are my largest expenses this month?',
    icon: '📈',
    category: 'spending',
  },
  {
    id: 'spending-by-category',
    label: 'By category',
    template: 'Show my spending by category',
    icon: '🏷️',
    category: 'spending',
  },
  {
    id: 'recurring-expenses',
    label: 'Recurring expenses',
    template: 'What are my recurring expenses?',
    icon: '🔄',
    category: 'insights',
  },
  {
    id: 'compare-months',
    label: 'Compare to last month',
    template: 'How does this month compare to last month?',
    icon: '⚖️',
    category: 'insights',
  },
] as const;
