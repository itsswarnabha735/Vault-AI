/**
 * AI Module Index
 *
 * Exports all AI-related services and utilities for Vault-AI.
 *
 * PRIVACY: All AI operations run locally in the browser.
 * Raw text and embeddings are NEVER transmitted to external servers.
 * Only structured data (dates, amounts, vendors) is sent to LLM APIs.
 */

// ============================================
// Embedding Service (Main Thread)
// ============================================

export {
  embeddingService,
  createEmbeddingService,
  EmbeddingError,
  EMBEDDING_CONFIG,
  MODEL_SIZE_MB,
  cosineSimilarity,
  findSimilar,
  type EmbeddingService,
  type ModelProgress,
  type ModelProgressCallback,
  type ModelInfo,
} from './embedding-service';

// ============================================
// Embedding Worker Client (Web Worker)
// ============================================

export {
  EmbeddingWorkerClient,
  getEmbeddingWorkerClient,
  initializeEmbeddingWorker,
  terminateEmbeddingWorker,
  createEmbeddingWorkerClient,
  type EmbeddingWorkerClientOptions,
  type ProgressCallback,
} from './embedding-worker-client';

// ============================================
// Chat Service
// ============================================

export {
  chatService,
  createChatService,
  ChatServiceError,
  type ChatService,
  type ChatContext,
  type UserPreferences,
} from './chat-service';

// ============================================
// Query Router
// ============================================

export {
  classifyIntent,
  extractEntities,
  classifyQuery,
  buildSearchFilter,
  type ExtractedQueryEntities,
  type QueryClassification,
  type TimePeriod,
  type ComparisonType,
} from './query-router';

// ============================================
// Prompt Builder (Privacy-Safe)
// ============================================

export {
  buildSafePrompt,
  sanitizeTransaction,
  sanitizeTransactions,
  verifySafePayload,
  formatHistory,
  buildSpendingQueryPrompt,
  buildBudgetQueryPrompt,
  buildComparisonQueryPrompt,
  PrivacyViolationError,
  type SafeTransactionData,
  type PromptContext,
} from './prompt-builder';

// ============================================
// LLM Client
// ============================================

export {
  getLLMClient,
  createLLMClient,
  isLLMAvailable,
  generateFallbackResponse,
  generateFallbackFollowups,
  GeminiClient,
  ApiRouteProxyClient,
  LLMError,
  RateLimitError,
  LLMConfigError,
  type LLMClient,
  type LLMProvider,
  type LLMResponse,
  type LLMConfig,
  type StreamCallback,
} from './llm-client';

// ============================================
// Citation Builder
// ============================================

export {
  buildCitations,
  buildExtendedCitations,
  calculateRelevanceScore,
  calculateRelevanceFactors,
  groupCitationsByCategory,
  groupCitationsByDate,
  formatCitationInline,
  formatCitationFootnote,
  formatCitationsAsFootnotes,
  isValidCitation,
  filterValidCitations,
  extractTransactionIds,
  findCitationByTransactionId,
  type CitationType,
  type ExtendedCitation,
  type CitationOptions,
} from './citation-builder';
