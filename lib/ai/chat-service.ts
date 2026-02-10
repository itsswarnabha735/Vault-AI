/**
 * Chat Service for Vault-AI
 *
 * Hybrid chat service that combines local semantic search with cloud LLM.
 * Implements the RAG (Retrieval-Augmented Generation) pattern.
 *
 * PRIVACY: Raw document text and embeddings NEVER leave the device.
 * Only structured data (dates, amounts, vendors) is sent to the LLM.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ChatMessage,
  Citation,
  ChatResponse,
  VerifiedFinancialData,
} from '@/types/ai';
import type {
  TransactionId,
  LocalTransaction,
  CategoryId,
} from '@/types/database';
import { db } from '@/lib/storage/db';
import { vectorSearchService } from '@/lib/storage/vector-search';
import { embeddingService } from './embedding-service';
import {
  classifyQuery,
  classifyQueryAsync,
  type QueryClassification,
  type ExtractedQueryEntities,
} from './query-router';
import {
  buildSafePrompt,
  buildStructuredPrompt,
  verifySafePayload,
  type SafeTransactionData,
  type PromptContext,
} from './prompt-builder';
import {
  getLLMClient,
  isLLMAvailable,
  generateFallbackResponse,
  generateFallbackFollowups,
  type StreamCallback,
  type GenerationOverrides,
} from './llm-client';
import { getClient as getSupabaseClient } from '@/lib/supabase/client';
import { VaultError } from '@/lib/errors';
import type { QueryIntent } from '@/types/ai';

// ============================================
// Types
// ============================================

/**
 * Chat service interface.
 */
export interface ChatService {
  /** Process a user query and generate a response */
  processQuery(query: string, context: ChatContext): Promise<ChatResponse>;

  /** Process a query with streaming response */
  processQueryStream(
    query: string,
    context: ChatContext,
    onChunk: StreamCallback
  ): Promise<ChatResponse>;

  /** Get conversation history for a session */
  getConversationHistory(sessionId: string): ChatMessage[];

  /** Clear conversation history for a session */
  clearHistory(sessionId: string): void;

  /** Get suggested queries based on user's data */
  getSuggestedQueries(): string[];

  /** Initialize the service */
  initialize(): Promise<void>;

  /** Check if service is ready */
  isReady(): boolean;
}

/**
 * Context for chat processing.
 */
export interface ChatContext {
  /** Session identifier */
  sessionId: string;

  /** Previous messages in session */
  history: ChatMessage[];

  /** User preferences */
  userPreferences: UserPreferences;
}

/**
 * User preferences for chat.
 */
export interface UserPreferences {
  /** Preferred currency */
  currency: string;

  /** User's timezone */
  timezone: string;
}

/**
 * Internal search result.
 */
interface LocalSearchResult {
  transactionId: TransactionId;
  score: number;
  transaction: LocalTransaction;
}

// ============================================
// Currency locale mapping (shared with lib/utils)
// ============================================

/** Maps currency codes to their natural locale for proper formatting */
const CURRENCY_LOCALE_MAP: Record<string, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  CNY: 'zh-CN',
  CAD: 'en-CA',
  AUD: 'en-AU',
  SGD: 'en-SG',
  HKD: 'en-HK',
};

/**
 * Format a currency symbol for a given currency code.
 * Used in search text and corrections where Intl is too verbose.
 */
function getCurrencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || currency;
  } catch {
    return currency;
  }
}

// ============================================
// Currency Inference
// ============================================

/**
 * Infer the dominant currency from a list of transactions.
 *
 * Counts the frequency of each currency code across transactions and
 * returns the most common one. This ensures that even if user settings
 * have a stale or incorrect default (e.g., 'USD' from before migration),
 * the prompt will reflect the ACTUAL currency of the user's data.
 *
 * @param transactions - Transactions to inspect
 * @param fallback - Fallback currency if no transactions or none have currency set
 * @returns The dominant currency code (e.g., 'INR', 'USD')
 */
function inferCurrencyFromTransactions(
  transactions: Array<{ currency?: string | null }>,
  fallback: string = 'INR'
): string {
  if (transactions.length === 0) return fallback;

  const counts = new Map<string, number>();
  for (const tx of transactions) {
    const c = tx.currency || fallback;
    counts.set(c, (counts.get(c) || 0) + 1);
  }

  let dominant = fallback;
  let maxCount = 0;
  for (const [code, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = code;
    }
  }

  return dominant;
}

// ============================================
// Configuration
// ============================================

const DEFAULT_CONFIG = {
  /** Maximum number of transactions to include in context */
  maxContextTransactions: 20,

  /** Minimum similarity score for semantic search */
  minSimilarityScore: 0.3,

  /** Maximum conversation history messages to include */
  maxHistoryMessages: 5,

  /** Default user preferences */
  defaultPreferences: {
    currency: 'INR',
    timezone: 'UTC',
  },
};

// ============================================
// Query Reformulation
// ============================================

/**
 * Detect whether a user message is a vague follow-up that relies on
 * conversation history for its meaning (e.g., "What about February?",
 * "And for groceries?", "How about income?", "Show me last month").
 *
 * Heuristic triggers:
 * 1. Starts with a conjunction/pronoun/filler ("and", "what about", "how about", "same for")
 * 2. Very short query (≤ 6 words) that mentions a time, category, or vendor
 * 3. Contains anaphoric references ("that", "those", "it", "them")
 */
function isFollowUpQuery(query: string): boolean {
  const lower = query.toLowerCase().trim();

  // Explicit follow-up starters
  const followUpStarters = [
    /^(and|but|also|what about|how about|same for|same but|show me|now for|now show|ok |okay )/i,
    /^(compare|versus|vs\.?)\s/i,
  ];
  for (const pattern of followUpStarters) {
    if (pattern.test(lower)) return true;
  }

  // Short queries (≤ 6 words) that don't look self-contained
  const words = lower.split(/\s+/);
  if (words.length <= 6) {
    // Contains anaphoric pronouns
    const anaphora = /\b(that|those|it|them|this|these|the same)\b/i;
    if (anaphora.test(lower)) return true;

    // Just a month name or "last month" etc. without a verb
    const justTimeRef = /^(january|february|march|april|may|june|july|august|september|october|november|december|last (month|week|year)|this (month|week|year))\s*\??$/i;
    if (justTimeRef.test(lower)) return true;
  }

  return false;
}

/**
 * Reformulate a vague follow-up query into a self-contained query by
 * combining it with the most recent user query from conversation history.
 *
 * Examples:
 *   Previous: "How much did I spend in January?"
 *   Current:  "What about February?"
 *   Result:   "How much did I spend in February? (context: What about February?)"
 *
 * Falls back to the original query if no history is available or
 * the query doesn't look like a follow-up.
 */
function reformulateQuery(
  query: string,
  history: ChatMessage[]
): { reformulated: string; wasReformulated: boolean } {
  if (!isFollowUpQuery(query) || history.length === 0) {
    return { reformulated: query, wasReformulated: false };
  }

  // Find the most recent user message
  const lastUserMessage = [...history]
    .reverse()
    .find((m) => m.role === 'user');

  if (!lastUserMessage) {
    return { reformulated: query, wasReformulated: false };
  }

  const prevQuery = lastUserMessage.content;
  const currentLower = query.toLowerCase().trim();

  // Strategy 1: Month substitution
  // "What about February?" + "How much did I spend in January?" => "How much did I spend in February?"
  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const monthInCurrent = monthNames.find((m) =>
    currentLower.includes(m)
  );
  const monthInPrev = monthNames.find((m) =>
    prevQuery.toLowerCase().includes(m)
  );

  if (monthInCurrent && monthInPrev && monthInCurrent !== monthInPrev) {
    // Replace the old month with the new month in the previous query
    const reformulated = prevQuery.replace(
      new RegExp(monthInPrev, 'gi'),
      monthInCurrent.charAt(0).toUpperCase() + monthInCurrent.slice(1)
    );
    return { reformulated, wasReformulated: true };
  }

  // Strategy 2: Time period substitution ("last month" -> "this month")
  const timePeriods = [
    'last month', 'this month', 'last week', 'this week',
    'last year', 'this year', 'yesterday', 'today',
  ];
  const periodInCurrent = timePeriods.find((p) =>
    currentLower.includes(p)
  );
  if (periodInCurrent) {
    const prevLower = prevQuery.toLowerCase();
    const periodInPrev = timePeriods.find((p) => prevLower.includes(p));
    if (periodInPrev && periodInPrev !== periodInCurrent) {
      const reformulated = prevQuery.replace(
        new RegExp(periodInPrev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        periodInCurrent
      );
      return { reformulated, wasReformulated: true };
    }
  }

  // Strategy 3: Direction substitution ("income" vs "spending")
  const directionTerms: Record<string, string[]> = {
    income: ['income', 'earn', 'earned', 'earnings', 'credit', 'credits', 'deposits', 'salary'],
    spending: ['spend', 'spent', 'spending', 'expenses', 'expense', 'debit', 'debits', 'payments'],
  };
  let currentDirection: string | null = null;
  let prevDirection: string | null = null;
  for (const [dir, terms] of Object.entries(directionTerms)) {
    if (terms.some((t) => currentLower.includes(t))) currentDirection = dir;
    if (terms.some((t) => prevQuery.toLowerCase().includes(t))) prevDirection = dir;
  }
  if (
    currentDirection &&
    prevDirection &&
    currentDirection !== prevDirection
  ) {
    // Swap direction terms in the previous query
    let reformulated = prevQuery;
    const prevTerms = directionTerms[prevDirection]!;
    const newTerm = currentDirection === 'income' ? 'income' : 'spending';
    for (const term of prevTerms) {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      if (regex.test(reformulated)) {
        reformulated = reformulated.replace(regex, newTerm);
        break;
      }
    }
    return { reformulated, wasReformulated: true };
  }

  // Strategy 4: Category substitution ("groceries" -> "dining")
  // If the current query is just a category-like word/phrase, combine with previous template
  if (currentLower.split(/\s+/).length <= 3) {
    // Simple prepend approach: reuse the previous query structure
    const reformulated = `${prevQuery} — specifically for: ${query}`;
    return { reformulated, wasReformulated: true };
  }

  // Fallback: concatenate for additional context
  const reformulated = `${query} (in the context of: ${prevQuery})`;
  return { reformulated, wasReformulated: true };
}

/**
 * Get LLM generation overrides based on query intent.
 * Financial queries use low temperature for accuracy;
 * conversational queries use higher temperature for natural responses.
 */
function getGenerationOverrides(intent: QueryIntent): GenerationOverrides {
  switch (intent) {
    case 'spending_query':
    case 'income_query':
    case 'budget_query':
    case 'comparison_query':
      // Financial accuracy queries — low temperature to minimise hallucination
      return { temperature: 0.15, topP: 0.8 };
    case 'trend_query':
      // Trend analysis needs some creativity for insights, but still grounded
      return { temperature: 0.3, topP: 0.85 };
    case 'search_query':
      return { temperature: 0.2, topP: 0.8 };
    case 'general_query':
    default:
      // Conversational — keep default temperature for natural responses
      return {};
  }
}

// ============================================
// Post-Generation Amount Verification
// ============================================

/**
 * Result of verifying the LLM response against verified financial data.
 */
interface AmountVerificationResult {
  /** The (possibly corrected) response text */
  text: string;
  /** Whether the response was modified */
  wasCorrected: boolean;
  /** Details of any corrections made */
  corrections: string[];
}

/**
 * Parse all monetary amounts from a text string.
 * Supports multiple currency symbols: $, ₹, €, £, ¥, etc.
 * Also handles "Rs." and "INR" prefixes.
 * Returns the numeric values.
 */
function extractMonetaryAmounts(text: string): number[] {
  const amounts: number[] = [];
  // Match common currency symbols/prefixes followed by numbers
  // Covers: $, ₹, €, £, ¥, Rs., Rs, INR, USD, etc.
  const pattern = /(?:[\$₹€£¥]|Rs\.?\s*|(?:INR|USD|EUR|GBP|SGD|AUD|CAD|JPY|CNY|HKD)\s*)\s*([\d,]+(?:\.\d{1,2})?)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const numStr = match[1]!.replace(/,/g, '');
    const num = parseFloat(numStr);
    if (!isNaN(num) && num > 0) {
      amounts.push(num);
    }
  }
  return amounts;
}

/**
 * Check whether two monetary amounts are "close enough".
 * Uses a relative tolerance of 1% + absolute tolerance of $0.01
 * to handle rounding differences.
 */
function amountsMatch(a: number, b: number): boolean {
  if (a === b) return true;
  const diff = Math.abs(a - b);
  // Absolute tolerance for very small amounts
  if (diff <= 0.01) return true;
  // Relative tolerance (1%) for larger amounts
  const maxVal = Math.max(Math.abs(a), Math.abs(b));
  return diff / maxVal <= 0.01;
}

/**
 * Format a number as currency for display in corrections.
 * Uses the proper locale for the given currency code.
 */
function formatAmountForCorrection(
  amount: number,
  currency: string = 'INR'
): string {
  try {
    const locale = CURRENCY_LOCALE_MAP[currency] || 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    const symbol = getCurrencySymbol(currency);
    return `${symbol}${amount.toFixed(2)}`;
  }
}

/**
 * Verify the LLM response against pre-computed verified financial data.
 *
 * Detects when the LLM has hallucinated or miscalculated totals and
 * appends a correction note. This is a safety net — the low temperature
 * and explicit "do not recalculate" instructions should prevent most
 * cases, but LLMs can still hallucinate numbers.
 *
 * Only runs when:
 * - `verifiedData` is available (we have ground truth)
 * - The query intent is financial (spending_query, income_query, budget_query)
 */
function verifyResponseAmounts(
  responseText: string,
  verifiedData: VerifiedFinancialData | undefined,
  intent: QueryIntent,
  currency: string = 'INR'
): AmountVerificationResult {
  // Only verify for financial queries with verified data
  const financialIntents: QueryIntent[] = [
    'spending_query',
    'income_query',
    'budget_query',
    'comparison_query',
  ];

  if (!verifiedData || !financialIntents.includes(intent)) {
    return { text: responseText, wasCorrected: false, corrections: [] };
  }

  const mentionedAmounts = extractMonetaryAmounts(responseText);
  if (mentionedAmounts.length === 0) {
    return { text: responseText, wasCorrected: false, corrections: [] };
  }

  const corrections: string[] = [];

  // Build a set of "known good" amounts from verified data
  const knownAmounts = new Set<number>();
  if (verifiedData.totalExpenses > 0) knownAmounts.add(verifiedData.totalExpenses);
  if (verifiedData.totalIncome > 0) knownAmounts.add(verifiedData.totalIncome);
  if (verifiedData.total !== 0) knownAmounts.add(Math.abs(verifiedData.total));
  if (verifiedData.byCategory) {
    for (const amount of Object.values(verifiedData.byCategory)) {
      if (amount > 0) knownAmounts.add(amount);
    }
  }

  // Check if the response mentions a "total" that doesn't match verified data
  // Focus on the primary aggregate — look for the first large amount near keywords
  // Supports multiple currency symbols: $, ₹, €, £, ¥, Rs.
  const currencyPrefix = `(?:[\\$₹€£¥]|Rs\\.?\\s*)`;
  const totalPatterns = [
    new RegExp(`(?:total|spent|spending|expenses?)\\s+(?:of\\s+|was\\s+|is\\s+|:?\\s*)${currencyPrefix}\\s*([\\d,]+(?:\\.\\d{1,2})?)`, 'gi'),
    new RegExp(`${currencyPrefix}\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s+(?:total|in total|altogether|combined)`, 'gi'),
    new RegExp(`(?:total|received|income|earned|earnings?)\\s+(?:of\\s+|was\\s+|is\\s+|:?\\s*)${currencyPrefix}\\s*([\\d,]+(?:\\.\\d{1,2})?)`, 'gi'),
  ];

  const totalAmountsInResponse: number[] = [];
  for (const pattern of totalPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(responseText)) !== null) {
      const numStr = match[1]!.replace(/,/g, '');
      const num = parseFloat(numStr);
      if (!isNaN(num) && num > 0) {
        totalAmountsInResponse.push(num);
      }
    }
  }

  // For each "total" amount in the response, check if it matches a known amount
  for (const responseAmount of totalAmountsInResponse) {
    let foundMatch = false;
    for (const knownAmount of knownAmounts) {
      if (amountsMatch(responseAmount, knownAmount)) {
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) {
      // Determine the correct amount based on intent
      let correctAmount: number | undefined;
      let label: string;

      if (intent === 'spending_query' && verifiedData.totalExpenses > 0) {
        correctAmount = verifiedData.totalExpenses;
        label = 'total expenses';
      } else if (intent === 'income_query' && verifiedData.totalIncome > 0) {
        correctAmount = verifiedData.totalIncome;
        label = 'total income';
      } else {
        // For other intents, find the closest known amount
        let closestDiff = Infinity;
        for (const known of knownAmounts) {
          const diff = Math.abs(responseAmount - known);
          if (diff < closestDiff) {
            closestDiff = diff;
            correctAmount = known;
          }
        }
        label = 'verified total';
      }

      if (correctAmount !== undefined) {
        corrections.push(
          `Note: The ${label} is ${formatAmountForCorrection(correctAmount, currency)} ` +
          `(the response mentioned ${formatAmountForCorrection(responseAmount, currency)}).`
        );
      }
    }
  }

  if (corrections.length > 0) {
    const correctionBlock = `\n\n---\n⚠️ **Correction**: ${corrections.join(' ')}`;
    return {
      text: responseText + correctionBlock,
      wasCorrected: true,
      corrections,
    };
  }

  return { text: responseText, wasCorrected: false, corrections: [] };
}

// ============================================
// Chat Service Error
// ============================================

export class ChatServiceError extends VaultError {
  constructor(
    message: string,
    code: string = 'CHAT_ERROR',
    recoverable: boolean = true
  ) {
    super(message, code, recoverable);
    this.name = 'ChatServiceError';
  }
}

// ============================================
// Chat Service Implementation
// ============================================

class ChatServiceImpl implements ChatService {
  private sessionHistories: Map<string, ChatMessage[]> = new Map();
  private initialized = false;
  private categoryCache: Map<CategoryId, string> = new Map();

  /**
   * Initialize the chat service.
   * Loads the embedding model, vector index, and category cache.
   * If the vector index is empty, rebuilds it from existing transactions.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize embedding service (downloads model from HF Hub on first run)
      await embeddingService.initialize();

      // Initialize vector search index
      await vectorSearchService.initialize();

      // Cache category names (needed by ensureVectorIndex for searchable text)
      await this.loadCategoryCache();

      // If the vector index is empty but we have transactions, rebuild it
      await this.ensureVectorIndex();

      this.initialized = true;
    } catch (error) {
      throw new ChatServiceError(
        `Failed to initialize chat service: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INIT_ERROR'
      );
    }
  }

  /**
   * Ensure the vector search index is populated from existing transactions.
   *
   * Unlike the previous approach (which only rebuilt when the index was
   * completely empty), this method performs an **incremental backfill**:
   * it detects transactions in IndexedDB that are missing from the vector
   * index (or have zero-filled embeddings) and generates + indexes them.
   *
   * This handles:
   * - Transactions from receipt imports (zero-filled embeddings)
   * - Transactions from CSV / backup imports (never indexed)
   * - Transactions from cloud sync / realtime (never indexed)
   * - Transactions added after the very first chat session
   *
   * For transactions with valid embeddings (from document upload), use them directly.
   * For transactions with empty embeddings, generate embeddings
   * from their structured fields (vendor, category, amount, date, note).
   */
  private async ensureVectorIndex(): Promise<void> {
    const stats = vectorSearchService.getStats();

    // Check if there are transactions in IndexedDB
    const transactions = await db.transactions.toArray();
    if (transactions.length === 0) {
      return;
    }

    // Find transactions that are missing from the vector index
    const unindexedTransactions = transactions.filter(
      (tx) => !vectorSearchService.hasVector(tx.id)
    );

    // Also find transactions that ARE in the index but have zero-filled
    // embeddings in IndexedDB (e.g. receipt imports that added zero vectors).
    // We need to re-embed and re-index those.
    const zeroEmbeddingTransactions = transactions.filter((tx) => {
      if (!vectorSearchService.hasVector(tx.id)) return false; // Already in unindexed list
      const embedding = tx.embedding;
      return (
        !embedding ||
        embedding.length === 0 ||
        embedding.every((v: number) => v === 0)
      );
    });

    const totalToProcess = unindexedTransactions.length + zeroEmbeddingTransactions.length;

    if (totalToProcess === 0) {
      return;
    }

    console.log(
      `[ChatService] Vector index has ${stats.vectorCount} vectors, ` +
      `but found ${unindexedTransactions.length} unindexed + ${zeroEmbeddingTransactions.length} zero-embedding transactions. ` +
      `Backfilling...`
    );

    const BATCH_SIZE = 20;
    let indexed = 0;

    // Combine both lists for processing
    const toProcess = [...unindexedTransactions, ...zeroEmbeddingTransactions];

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);

      for (const tx of batch) {
        try {
          let embedding = tx.embedding;

          // Check if embedding is empty (all zeros — cloud-synced / receipt transactions)
          const isEmptyEmbedding =
            !embedding ||
            embedding.length === 0 ||
            embedding.every((v: number) => v === 0);

          if (isEmptyEmbedding) {
            // Generate embedding from structured fields
            const searchText = this.buildSearchText(tx);
            embedding = await embeddingService.embedText(searchText);

            // Update the transaction in IndexedDB with the new embedding
            await db.transactions.update(tx.id, { embedding });
          }

          // Add to vector index (will overwrite if already present with zero vector)
          vectorSearchService.addVector(tx.id, embedding, {
            date: tx.date,
            vendor: tx.vendor,
            amount: tx.amount,
          });

          indexed++;
        } catch (error) {
          console.warn(
            `[ChatService] Failed to index transaction ${tx.id}:`,
            error
          );
        }
      }
    }

    // Persist the index
    if (indexed > 0) {
      await vectorSearchService.saveIndex();
      console.log(
        `[ChatService] Vector index backfill complete: ${indexed}/${totalToProcess} transactions indexed ` +
        `(total index size: ${stats.vectorCount + indexed})`
      );
    }
  }

  /**
   * Build a searchable text string from a transaction's structured fields.
   * Used to generate embeddings for cloud-synced transactions that lack raw text.
   *
   * Produces natural-language sentences that embed well with MiniLM-L6-v2.
   * Sentence-form text yields much better cosine similarity scores than
   * bare token concatenation (e.g., "Starbucks 2026-01-15 $45.00").
   */
  private buildSearchText(tx: LocalTransaction): string {
    const absAmount = Math.abs(tx.amount).toFixed(2);
    const categoryName = tx.category
      ? this.categoryCache.get(tx.category) || ''
      : '';

    // Format date as readable text (e.g., "January 15, 2026")
    let dateText = tx.date;
    try {
      const d = new Date(tx.date + 'T00:00:00');
      dateText = d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      // Keep ISO format on failure
    }

    if (tx.amount < 0) {
      // Income / credit transaction
      const vendorPart = tx.vendor
        ? `from ${tx.vendor}`
        : 'received';
      const catPart = categoryName ? ` categorized as ${categoryName}` : '';
      const notePart = tx.note ? `. ${tx.note}` : '';
      const symbol = getCurrencySymbol(tx.currency || 'INR');
      return `Income credit of ${symbol}${absAmount} ${vendorPart} on ${dateText}${catPart}${notePart}`;
    } else {
      // Expense / debit transaction
      const vendorPart = tx.vendor
        ? `at ${tx.vendor}`
        : '';
      const catPart = categoryName ? ` for ${categoryName}` : '';
      const notePart = tx.note ? `. ${tx.note}` : '';
      const symbol = getCurrencySymbol(tx.currency || 'INR');
      return `Expense payment of ${symbol}${absAmount} ${vendorPart} on ${dateText}${catPart}${notePart}`;
    }
  }

  /**
   * Check if service is ready.
   */
  isReady(): boolean {
    return this.initialized && embeddingService.isReady();
  }

  /**
   * Process a user query and generate a response.
   */
  async processQuery(
    query: string,
    context: ChatContext
  ): Promise<ChatResponse> {
    const startTime = performance.now();

    try {
      // Ensure service is initialized
      if (!this.initialized) {
        await this.initialize();
      }

      // 0. Reformulate vague follow-ups using conversation history
      const { reformulated, wasReformulated } = reformulateQuery(
        query,
        context.history
      );
      const effectiveQuery = reformulated;
      if (wasReformulated) {
        console.log(
          `[ChatService] Reformulated "${query}" → "${effectiveQuery}"`
        );
      }

      // 1. Classify intent and extract entities (embedding-based with regex fallback)
      const classification = await classifyQueryAsync(effectiveQuery);

      // 2. Search local context
      const searchResults = await this.searchLocalContext(
        effectiveQuery,
        classification
      );

      // 3. Compute aggregates — always provide accurate pre-computed totals
      // so the LLM doesn't have to do arithmetic.
      let verifiedData: VerifiedFinancialData | undefined;

      // Try cloud first for verified totals
      if (classification.needsCloudData && searchResults.length > 0) {
        verifiedData = await this.fetchVerifiedData(
          searchResults.map((r) => r.transactionId),
          classification.entities
        );
      }

      // Fall back to local aggregates when cloud data isn't available,
      // or when we have a date range (to get totals over the FULL dataset,
      // not just the 20 transactions in context).
      if (!verifiedData && classification.entities.dateRange) {
        verifiedData = await this.computeLocalAggregates(
          classification.entities
        );
      }

      // 4. Build citations
      const citations = this.buildCitations(searchResults);

      // 5. Prepare safe transaction data
      const safeTransactions = this.prepareTransactionsForPrompt(searchResults);

      // 6. Build privacy-safe prompt
      // Use the original query for the prompt so the LLM sees what the user actually typed,
      // but all retrieval was done with the reformulated version.

      // Infer the actual currency from the retrieved transactions.
      // This overrides any stale or incorrect userPreferences.currency
      // (e.g., leftover 'USD' from before migration).
      const inferredCurrency = inferCurrencyFromTransactions(
        searchResults.map((r) => r.transaction),
        context.userPreferences.currency
      );

      const promptContext: PromptContext = {
        query: effectiveQuery,
        intent: classification.intent,
        transactions: safeTransactions,
        verifiedData,
        history: context.history.slice(-DEFAULT_CONFIG.maxHistoryMessages),
        userPreferences: {
          ...context.userPreferences,
          currency: inferredCurrency,
        },
        currentDate: new Date().toISOString().split('T')[0]!,
      };

      // Verify safety before LLM call
      verifySafePayload(promptContext);

      // 7. Generate response
      let responseText: string;
      let suggestedFollowups: string[];

      if (isLLMAvailable()) {
        const structured = buildStructuredPrompt(promptContext);
        const overrides = getGenerationOverrides(classification.intent);
        const llmResponse = await getLLMClient().generateStructured(structured, overrides);
        responseText = llmResponse.text;
        suggestedFollowups = this.extractFollowups(llmResponse.text);
      } else {
        // Fallback response
        const fallback = generateFallbackResponse(
          effectiveQuery,
          searchResults.length > 0
        );
        responseText = fallback.text;
        suggestedFollowups = generateFallbackFollowups(query);
      }

      // 7b. Post-generation amount verification — catch hallucinated totals
      const verification = verifyResponseAmounts(
        responseText,
        verifiedData,
        classification.intent,
        inferredCurrency
      );
      if (verification.wasCorrected) {
        responseText = verification.text;
        console.warn(
          `[ChatService] Amount verification corrected response:`,
          verification.corrections
        );
      }

      // 8. Build response
      const response: ChatResponse = {
        text: responseText,
        citations,
        suggestedFollowups,
        verifiedData,
        responseTimeMs: performance.now() - startTime,
        offlineGenerated: !isLLMAvailable(),
      };

      // 9. Update session history
      this.addToHistory(context.sessionId, {
        id: uuidv4(),
        role: 'user',
        content: query,
        timestamp: new Date(),
        citations: null,
        intent: classification.intent,
      });

      this.addToHistory(context.sessionId, {
        id: uuidv4(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
        citations,
        suggestedFollowups,
      });

      return response;
    } catch (error) {
      // Return a graceful error response
      const errorMessage =
        error instanceof Error ? error.message : 'An unexpected error occurred';

      return {
        text: `I'm sorry, I encountered an issue processing your request: ${errorMessage}. Please try again.`,
        citations: [],
        suggestedFollowups: generateFallbackFollowups(query),
        responseTimeMs: performance.now() - startTime,
        offlineGenerated: true,
      };
    }
  }

  /**
   * Process a query with streaming response.
   */
  async processQueryStream(
    query: string,
    context: ChatContext,
    onChunk: StreamCallback
  ): Promise<ChatResponse> {
    const startTime = performance.now();

    try {
      // Ensure service is initialized
      if (!this.initialized) {
        await this.initialize();
      }

      // 0. Reformulate vague follow-ups using conversation history
      const { reformulated, wasReformulated } = reformulateQuery(
        query,
        context.history
      );
      const effectiveQuery = reformulated;
      if (wasReformulated) {
        console.log(
          `[ChatService] Reformulated "${query}" → "${effectiveQuery}"`
        );
      }

      // 1. Classify intent and extract entities (embedding-based with regex fallback)
      const classification = await classifyQueryAsync(effectiveQuery);

      // 2. Search local context
      const searchResults = await this.searchLocalContext(
        effectiveQuery,
        classification
      );

      // 3. Compute aggregates — always provide accurate pre-computed totals
      let verifiedData: VerifiedFinancialData | undefined;

      if (classification.needsCloudData && searchResults.length > 0) {
        verifiedData = await this.fetchVerifiedData(
          searchResults.map((r) => r.transactionId),
          classification.entities
        );
      }

      if (!verifiedData && classification.entities.dateRange) {
        verifiedData = await this.computeLocalAggregates(
          classification.entities
        );
      }

      // 4. Build citations
      const citations = this.buildCitations(searchResults);

      // 5. Prepare safe transaction data
      const safeTransactions = this.prepareTransactionsForPrompt(searchResults);

      // 6. Build privacy-safe prompt

      // Infer currency from retrieved transactions (same as processQuery)
      const inferredCurrency = inferCurrencyFromTransactions(
        searchResults.map((r) => r.transaction),
        context.userPreferences.currency
      );

      const promptContext: PromptContext = {
        query: effectiveQuery,
        intent: classification.intent,
        transactions: safeTransactions,
        verifiedData,
        history: context.history.slice(-DEFAULT_CONFIG.maxHistoryMessages),
        userPreferences: {
          ...context.userPreferences,
          currency: inferredCurrency,
        },
        currentDate: new Date().toISOString().split('T')[0]!,
      };

      // Verify safety
      verifySafePayload(promptContext);

      // 7. Stream response
      let _fullText = '';
      const llmClient = getLLMClient();
      const overrides = getGenerationOverrides(classification.intent);

      if (llmClient.isReady()) {
        const structured = buildStructuredPrompt(promptContext);
        const llmResponse = await llmClient.generateStreamStructured(
          structured,
          (chunk, done) => {
            _fullText += chunk;
            onChunk(chunk, done);
          },
          overrides
        );

        // 7b. Post-generation amount verification — catch hallucinated totals
        // For streaming, if there's a correction we stream it as an additional chunk.
        let finalText = llmResponse.text;
        const verification = verifyResponseAmounts(
          llmResponse.text,
          verifiedData,
          classification.intent,
          inferredCurrency
        );
        if (verification.wasCorrected) {
          // Stream the correction block to the client
          const correctionSuffix = verification.text.slice(llmResponse.text.length);
          if (correctionSuffix) {
            onChunk(correctionSuffix, false);
            onChunk('', true);
          }
          finalText = verification.text;
          console.warn(
            `[ChatService] Amount verification corrected streamed response:`,
            verification.corrections
          );
        }

        // 8. Build response
        const response: ChatResponse = {
          text: finalText,
          citations,
          suggestedFollowups: this.extractFollowups(llmResponse.text),
          verifiedData,
          responseTimeMs: performance.now() - startTime,
          offlineGenerated: false,
        };

        // Update history
        this.addToHistory(context.sessionId, {
          id: uuidv4(),
          role: 'user',
          content: query,
          timestamp: new Date(),
          citations: null,
          intent: classification.intent,
        });

        this.addToHistory(context.sessionId, {
          id: uuidv4(),
          role: 'assistant',
          content: llmResponse.text,
          timestamp: new Date(),
          citations,
          suggestedFollowups: response.suggestedFollowups,
        });

        return response;
      } else {
        // Fallback
        const fallback = generateFallbackResponse(
          effectiveQuery,
          searchResults.length > 0
        );
        onChunk(fallback.text, true);

        return {
          text: fallback.text,
          citations,
          suggestedFollowups: generateFallbackFollowups(query),
          verifiedData,
          responseTimeMs: performance.now() - startTime,
          offlineGenerated: true,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'An unexpected error occurred';
      const fallbackText = `I'm sorry, I encountered an issue: ${errorMessage}`;
      onChunk(fallbackText, true);

      return {
        text: fallbackText,
        citations: [],
        suggestedFollowups: [],
        responseTimeMs: performance.now() - startTime,
        offlineGenerated: true,
      };
    }
  }

  /**
   * Get conversation history for a session.
   */
  getConversationHistory(sessionId: string): ChatMessage[] {
    return this.sessionHistories.get(sessionId) || [];
  }

  /**
   * Clear conversation history for a session.
   */
  clearHistory(sessionId: string): void {
    this.sessionHistories.delete(sessionId);
  }

  /**
   * Get suggested queries based on user's data.
   */
  getSuggestedQueries(): string[] {
    // Default suggestions - could be personalized based on user data
    return [
      'How much did I spend this month?',
      "What's my budget status?",
      'Show my largest expenses',
      'Compare this month to last month',
      'Find my recent transactions',
      'What are my spending trends?',
    ];
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Search local transactions using hybrid retrieval.
   *
   * Combines two retrieval paths for better accuracy:
   * 1. **Structured path** — queries IndexedDB directly using extracted entities
   *    (date range, vendor, category). Best for exact matches.
   * 2. **Semantic path** — vector similarity search for fuzzy/conceptual matches.
   *
   * Results are merged and re-ranked with weighted scores.
   */
  private async searchLocalContext(
    query: string,
    classification: QueryClassification
  ): Promise<LocalSearchResult[]> {
    const entities = classification.entities;
    const resultMap = new Map<string, LocalSearchResult>();

    // ── Path 1: Structured retrieval from IndexedDB ──────────────────
    // Direct DB queries are precise for date ranges, vendors, and categories.
    const structuredResults = await this.structuredSearch(entities);
    for (const result of structuredResults) {
      if (this.matchesFilters(result.transaction, entities)) {
        resultMap.set(result.transactionId, result);
      }
    }

    // ── Path 2: Semantic retrieval from vector index ─────────────────
    const queryEmbedding = await embeddingService.embedText(query);
    const vectorResults = vectorSearchService.search(
      queryEmbedding,
      DEFAULT_CONFIG.maxContextTransactions * 2
    );

    const filteredVectorResults = vectorResults.filter(
      (r) => r.score >= DEFAULT_CONFIG.minSimilarityScore
    );

    for (const result of filteredVectorResults.slice(
      0,
      DEFAULT_CONFIG.maxContextTransactions
    )) {
      const transaction = await db.transactions.get(result.id as TransactionId);
      if (!transaction) continue;
      if (!this.matchesFilters(transaction, entities)) continue;

      const existing = resultMap.get(transaction.id);
      if (existing) {
        // Transaction found by both paths — boost its score
        existing.score = Math.min(
          1.0,
          existing.score * 0.4 + result.score * 0.6 + 0.1
        );
      } else {
        resultMap.set(transaction.id, {
          transactionId: transaction.id,
          score: result.score,
          transaction,
        });
      }
    }

    // ── Merge, sort, and cap ─────────────────────────────────────────
    const results = Array.from(resultMap.values());
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, DEFAULT_CONFIG.maxContextTransactions);
  }

  /**
   * Structured search: query IndexedDB directly using extracted entities.
   * Returns transactions with a relevance score based on how many
   * entity filters they matched.
   */
  private async structuredSearch(
    entities: ExtractedQueryEntities
  ): Promise<LocalSearchResult[]> {
    const resultMap = new Map<string, LocalSearchResult>();

    // Helper to add a transaction with a given base score
    const addResult = (tx: LocalTransaction, baseScore: number) => {
      const existing = resultMap.get(tx.id);
      if (existing) {
        // Boost score when transaction matches multiple structured criteria
        existing.score = Math.min(1.0, existing.score + baseScore * 0.3);
      } else {
        resultMap.set(tx.id, {
          transactionId: tx.id,
          score: baseScore,
          transaction: tx,
        });
      }
    };

    // Date range — strong structured signal
    if (entities.dateRange) {
      const dateTransactions = await db.getTransactionsByDateRange(
        entities.dateRange.start,
        entities.dateRange.end
      );
      for (const tx of dateTransactions) {
        addResult(tx, 0.6);
      }
    }

    // Vendor — exact match via DB index
    if (entities.vendors.length > 0) {
      for (const vendor of entities.vendors) {
        const vendorTxs = await db.getTransactionsByVendor(vendor);
        for (const tx of vendorTxs) {
          addResult(tx, 0.7);
        }
      }
    }

    // Vendor — fuzzy match via keyword scan (when no exact vendor match)
    // Search keywords against vendor names in the date-range results
    if (entities.vendors.length === 0 && entities.keywords.length > 0) {
      const allResults = Array.from(resultMap.values());
      for (const result of allResults) {
        const vendorLower = result.transaction.vendor.toLowerCase();
        for (const keyword of entities.keywords) {
          if (vendorLower.includes(keyword.toLowerCase())) {
            result.score = Math.min(1.0, result.score + 0.15);
            break;
          }
        }
      }
    }

    // Category — via DB index
    if (entities.categories.length > 0) {
      for (const [catId, catName] of this.categoryCache.entries()) {
        const matchesCategory = entities.categories.some((cat) =>
          catName.toLowerCase().includes(cat.toLowerCase())
        );
        if (matchesCategory) {
          const catTxs = await db.getTransactionsByCategory(catId);
          for (const tx of catTxs) {
            addResult(tx, 0.6);
          }
        }
      }
    }

    return Array.from(resultMap.values());
  }

  /**
   * Check if a transaction matches extracted filters.
   */
  private matchesFilters(
    transaction: LocalTransaction,
    entities: ExtractedQueryEntities
  ): boolean {
    // Transaction direction filter
    if (entities.transactionDirection === 'income' && transaction.amount >= 0) {
      return false; // User wants income, this is an expense
    }
    if (entities.transactionDirection === 'expense' && transaction.amount < 0) {
      return false; // User wants expenses, this is income
    }

    // Date range filter
    if (entities.dateRange) {
      if (
        transaction.date < entities.dateRange.start ||
        transaction.date > entities.dateRange.end
      ) {
        return false;
      }
    }

    // Amount range filter — compare against absolute value so both income
    // and expense transactions are handled correctly
    if (entities.amountRange) {
      const absAmount = Math.abs(transaction.amount);
      if (
        entities.amountRange.min !== null &&
        absAmount < entities.amountRange.min
      ) {
        return false;
      }
      if (
        entities.amountRange.max !== null &&
        absAmount > entities.amountRange.max
      ) {
        return false;
      }
    }

    // Category filter
    if (entities.categories.length > 0) {
      const categoryName = this.categoryCache.get(transaction.category!);
      if (categoryName) {
        const matchesCategory = entities.categories.some((cat) =>
          categoryName.toLowerCase().includes(cat.toLowerCase())
        );
        if (!matchesCategory) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Fetch verified totals from Supabase, with income/expense breakdown.
   */
  private async fetchVerifiedData(
    transactionIds: TransactionId[],
    entities: ExtractedQueryEntities
  ): Promise<VerifiedFinancialData | undefined> {
    try {
      const supabase = getSupabaseClient();

      // Type for the query result
      interface TransactionRow {
        amount: number;
        category_id: string | null;
        date: string;
      }

      // Build query for verified totals
      let query = supabase
        .from('transactions')
        .select('amount, category_id, date')
        .in('id', transactionIds);

      if (entities.dateRange) {
        query = query
          .gte('date', entities.dateRange.start)
          .lte('date', entities.dateRange.end);
      }

      const { data, error } = await query;

      if (error || !data) {
        console.error('Failed to fetch verified data:', error);
        return undefined;
      }

      // Cast data to the expected type
      const transactions = data as unknown as TransactionRow[];

      return this.computeAggregates(transactions.map((tx) => ({
        amount: Number(tx.amount),
        categoryId: tx.category_id as CategoryId | null,
        date: tx.date,
      })));
    } catch (error) {
      console.error('Error fetching verified data:', error);
      return undefined;
    }
  }

  /**
   * Compute aggregates from local transactions for a given date range.
   * Used as a fallback when cloud data isn't available, and to provide
   * accurate totals to the LLM instead of making it do arithmetic.
   */
  private async computeLocalAggregates(
    entities: ExtractedQueryEntities
  ): Promise<VerifiedFinancialData | undefined> {
    try {
      let transactions: LocalTransaction[];

      if (entities.dateRange) {
        transactions = await db.getTransactionsByDateRange(
          entities.dateRange.start,
          entities.dateRange.end
        );
      } else {
        // Without a date range, use all transactions (limited usefulness)
        transactions = await db.transactions.toArray();
      }

      // Apply direction filter
      if (entities.transactionDirection === 'income') {
        transactions = transactions.filter((tx) => tx.amount < 0);
      } else if (entities.transactionDirection === 'expense') {
        transactions = transactions.filter((tx) => tx.amount >= 0);
      }

      if (transactions.length === 0) {
        return undefined;
      }

      return this.computeAggregates(transactions.map((tx) => ({
        amount: tx.amount,
        categoryId: tx.category,
        date: tx.date,
      })));
    } catch (error) {
      console.error('Error computing local aggregates:', error);
      return undefined;
    }
  }

  /**
   * Shared aggregate computation logic for both cloud and local data.
   */
  private computeAggregates(
    transactions: Array<{ amount: number; categoryId: CategoryId | null; date: string }>
  ): VerifiedFinancialData {
    let totalExpenses = 0;
    let totalIncome = 0;
    let expenseCount = 0;
    let incomeCount = 0;

    const byCategory: Record<string, number> = {};

    for (const tx of transactions) {
      const amount = tx.amount;
      if (amount >= 0) {
        totalExpenses += amount;
        expenseCount++;
      } else {
        totalIncome += Math.abs(amount);
        incomeCount++;
      }

      const categoryName =
        (tx.categoryId ? this.categoryCache.get(tx.categoryId) : null) ||
        'Uncategorized';
      byCategory[categoryName] = (byCategory[categoryName] || 0) + amount;
    }

    const total = totalExpenses - totalIncome; // Net outflow
    const count = transactions.length;

    // Determine period
    let period: { start: string; end: string } | undefined;
    if (transactions.length > 0) {
      const dates = transactions.map((tx) => tx.date).sort();
      period = {
        start: dates[0]!,
        end: dates[dates.length - 1]!,
      };
    }

    return {
      total,
      totalExpenses,
      totalIncome,
      count,
      expenseCount,
      incomeCount,
      byCategory,
      period,
    };
  }

  /**
   * Build citations from search results.
   */
  private buildCitations(results: LocalSearchResult[]): Citation[] {
    return results.slice(0, 5).map((result) => {
      const tx = result.transaction;
      const categoryName =
        this.categoryCache.get(tx.category!) || 'Uncategorized';

      return {
        transactionId: tx.id,
        relevanceScore: result.score,
        snippet: `${tx.vendor} - ${this.formatCurrency(tx.amount, tx.currency)}`,
        label: `${categoryName} transaction`,
        date: tx.date,
        amount: tx.amount,
        vendor: tx.vendor,
      };
    });
  }

  /**
   * Prepare transactions for prompt (sanitized).
   */
  private prepareTransactionsForPrompt(
    results: LocalSearchResult[]
  ): SafeTransactionData[] {
    return results.map((result) => {
      const tx = result.transaction;
      return {
        id: tx.id,
        date: tx.date,
        amount: tx.amount,
        vendor: tx.vendor,
        category: this.categoryCache.get(tx.category!) || null,
        currency: tx.currency,
        note: tx.note || null,
      };
    });
  }

  /**
   * Extract follow-up questions from LLM response.
   */
  private extractFollowups(text: string): string[] {
    const followups: string[] = [];

    // Look for questions at the end of the response
    const questionPattern = /(?:^|\n)(?:[-•*]?\s*)?([A-Z][^.!?]*\?)/gm;
    let match;

    while ((match = questionPattern.exec(text)) !== null) {
      if (match[1] && match[1].length < 100) {
        followups.push(match[1].trim());
      }
    }

    // Limit to 3 follow-ups
    return followups.slice(0, 3);
  }

  /**
   * Add message to session history.
   */
  private addToHistory(sessionId: string, message: ChatMessage): void {
    if (!this.sessionHistories.has(sessionId)) {
      this.sessionHistories.set(sessionId, []);
    }

    const history = this.sessionHistories.get(sessionId)!;
    history.push(message);

    // Limit history size
    if (history.length > 50) {
      history.shift();
    }
  }

  /**
   * Load category names into cache.
   */
  private async loadCategoryCache(): Promise<void> {
    try {
      const categories = await db.categories.toArray();
      for (const cat of categories) {
        this.categoryCache.set(cat.id, cat.name);
      }
    } catch (error) {
      console.error('Failed to load category cache:', error);
    }
  }

  /**
   * Format currency for display using proper locale for the currency.
   */
  private formatCurrency(amount: number, currency: string = 'INR'): string {
    try {
      const locale = CURRENCY_LOCALE_MAP[currency] || 'en-US';
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Singleton chat service instance.
 */
export const chatService: ChatService = new ChatServiceImpl();

/**
 * Factory function for creating chat service instances.
 */
export function createChatService(): ChatService {
  return new ChatServiceImpl();
}

// Types are exported inline with their definitions above
