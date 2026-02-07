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
  type QueryClassification,
  type ExtractedQueryEntities,
} from './query-router';
import {
  buildSafePrompt,
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
} from './llm-client';
import { getClient as getSupabaseClient } from '@/lib/supabase/client';
import { VaultError } from '@/lib/errors';

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
    currency: 'USD',
    timezone: 'UTC',
  },
};

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
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure embedding service is ready
      await embeddingService.initialize();

      // Ensure vector search is ready
      await vectorSearchService.initialize();

      // Cache category names
      await this.loadCategoryCache();

      this.initialized = true;
    } catch (error) {
      throw new ChatServiceError(
        `Failed to initialize chat service: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INIT_ERROR'
      );
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

      // 1. Classify intent and extract entities
      const classification = classifyQuery(query);

      // 2. Search local context
      const searchResults = await this.searchLocalContext(
        query,
        classification
      );

      // 3. Fetch verified data from cloud if needed
      let verifiedData: VerifiedFinancialData | undefined;
      if (classification.needsCloudData && searchResults.length > 0) {
        verifiedData = await this.fetchVerifiedData(
          searchResults.map((r) => r.transactionId),
          classification.entities
        );
      }

      // 4. Build citations
      const citations = this.buildCitations(searchResults);

      // 5. Prepare safe transaction data
      const safeTransactions = this.prepareTransactionsForPrompt(searchResults);

      // 6. Build privacy-safe prompt
      const promptContext: PromptContext = {
        query,
        intent: classification.intent,
        transactions: safeTransactions,
        verifiedData,
        history: context.history.slice(-DEFAULT_CONFIG.maxHistoryMessages),
        userPreferences: context.userPreferences,
        currentDate: new Date().toISOString().split('T')[0]!,
      };

      // Verify safety before LLM call
      verifySafePayload(promptContext);

      // 7. Generate response
      let responseText: string;
      let suggestedFollowups: string[];

      if (isLLMAvailable()) {
        const prompt = buildSafePrompt(promptContext);
        const llmResponse = await getLLMClient().generate(prompt);
        responseText = llmResponse.text;
        suggestedFollowups = this.extractFollowups(llmResponse.text);
      } else {
        // Fallback response
        const fallback = generateFallbackResponse(
          query,
          searchResults.length > 0
        );
        responseText = fallback.text;
        suggestedFollowups = generateFallbackFollowups(query);
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

      // 1. Classify intent and extract entities
      const classification = classifyQuery(query);

      // 2. Search local context
      const searchResults = await this.searchLocalContext(
        query,
        classification
      );

      // 3. Fetch verified data from cloud if needed
      let verifiedData: VerifiedFinancialData | undefined;
      if (classification.needsCloudData && searchResults.length > 0) {
        verifiedData = await this.fetchVerifiedData(
          searchResults.map((r) => r.transactionId),
          classification.entities
        );
      }

      // 4. Build citations
      const citations = this.buildCitations(searchResults);

      // 5. Prepare safe transaction data
      const safeTransactions = this.prepareTransactionsForPrompt(searchResults);

      // 6. Build privacy-safe prompt
      const promptContext: PromptContext = {
        query,
        intent: classification.intent,
        transactions: safeTransactions,
        verifiedData,
        history: context.history.slice(-DEFAULT_CONFIG.maxHistoryMessages),
        userPreferences: context.userPreferences,
        currentDate: new Date().toISOString().split('T')[0]!,
      };

      // Verify safety
      verifySafePayload(promptContext);

      // 7. Stream response
      let fullText = '';
      const llmClient = getLLMClient();

      if (llmClient.isReady()) {
        const prompt = buildSafePrompt(promptContext);
        const llmResponse = await llmClient.generateStream(
          prompt,
          (chunk, done) => {
            fullText += chunk;
            onChunk(chunk, done);
          }
        );

        // 8. Build response
        const response: ChatResponse = {
          text: llmResponse.text,
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
          query,
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
   * Search local transactions using semantic search.
   */
  private async searchLocalContext(
    query: string,
    classification: QueryClassification
  ): Promise<LocalSearchResult[]> {
    // Generate query embedding
    const queryEmbedding = await embeddingService.embedText(query);

    // Search vector index
    const searchResults = vectorSearchService.search(
      queryEmbedding,
      DEFAULT_CONFIG.maxContextTransactions * 2 // Get more, we'll filter
    );

    // Filter by similarity score
    const filteredResults = searchResults.filter(
      (r) => r.score >= DEFAULT_CONFIG.minSimilarityScore
    );

    // Fetch full transactions
    const results: LocalSearchResult[] = [];

    for (const result of filteredResults.slice(
      0,
      DEFAULT_CONFIG.maxContextTransactions
    )) {
      const transaction = await db.transactions.get(result.id as TransactionId);
      if (transaction) {
        // Apply entity filters if present
        if (this.matchesFilters(transaction, classification.entities)) {
          results.push({
            transactionId: transaction.id,
            score: result.score,
            transaction,
          });
        }
      }
    }

    // If we have date range filters, also search by date
    if (classification.entities.dateRange) {
      const dateTransactions = await db.getTransactionsByDateRange(
        classification.entities.dateRange.start,
        classification.entities.dateRange.end
      );

      for (const tx of dateTransactions) {
        if (!results.some((r) => r.transactionId === tx.id)) {
          results.push({
            transactionId: tx.id,
            score: 0.5, // Default score for date-matched
            transaction: tx,
          });
        }
      }
    }

    // Sort by relevance score
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, DEFAULT_CONFIG.maxContextTransactions);
  }

  /**
   * Check if a transaction matches extracted filters.
   */
  private matchesFilters(
    transaction: LocalTransaction,
    entities: ExtractedQueryEntities
  ): boolean {
    // Date range filter
    if (entities.dateRange) {
      if (
        transaction.date < entities.dateRange.start ||
        transaction.date > entities.dateRange.end
      ) {
        return false;
      }
    }

    // Amount range filter
    if (entities.amountRange) {
      if (
        entities.amountRange.min !== null &&
        transaction.amount < entities.amountRange.min
      ) {
        return false;
      }
      if (
        entities.amountRange.max !== null &&
        transaction.amount > entities.amountRange.max
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
   * Fetch verified totals from Supabase.
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

      // Calculate totals
      const total = transactions.reduce(
        (sum, tx) => sum + Number(tx.amount),
        0
      );
      const count = transactions.length;

      // Calculate category breakdown
      const byCategory: Record<string, number> = {};
      for (const tx of transactions) {
        const categoryId = tx.category_id as CategoryId;
        const categoryName =
          this.categoryCache.get(categoryId) || 'Uncategorized';
        byCategory[categoryName] =
          (byCategory[categoryName] || 0) + Number(tx.amount);
      }

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
        count,
        byCategory,
        period,
      };
    } catch (error) {
      console.error('Error fetching verified data:', error);
      return undefined;
    }
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
   * Format currency for display.
   */
  private formatCurrency(amount: number, currency: string = 'USD'): string {
    try {
      return new Intl.NumberFormat('en-US', {
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
