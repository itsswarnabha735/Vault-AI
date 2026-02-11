/**
 * Query Router for Vault-AI Chat Service
 *
 * Handles intent classification and entity extraction from user queries.
 * All processing is done locally without sending data to external services.
 */

import type { QueryIntent, SearchFilter } from '@/types/ai';
import { embeddingService } from './embedding-service';
import { getQueryAliasMap } from '@/lib/categories/category-registry';

// ============================================
// Types
// ============================================

/**
 * Extracted entities from a query.
 */
/**
 * Transaction direction for filtering income vs expenses.
 * - 'expense': only positive amounts (debits/outflows)
 * - 'income': only negative amounts (credits/inflows)
 * - 'all': both directions (or direction not specified)
 */
export type TransactionDirection = 'expense' | 'income' | 'all';

export interface ExtractedQueryEntities {
  /** Parsed date range */
  dateRange: {
    start: string;
    end: string;
  } | null;

  /** Category mentions */
  categories: string[];

  /** Amount range */
  amountRange: {
    min: number | null;
    max: number | null;
  } | null;

  /** Vendor mentions */
  vendors: string[];

  /** Location mentions */
  locations: string[];

  /** Time period keywords */
  timePeriod: TimePeriod | null;

  /** Comparison type */
  comparisonType: ComparisonType | null;

  /** Raw keywords for fallback search */
  keywords: string[];

  /** Transaction direction (income, expense, or all) */
  transactionDirection: TransactionDirection;

  /** Superlative intent (e.g., "biggest", "smallest") */
  superlative?: SuperlativeType;
}

/**
 * Time period types.
 */
export type TimePeriod =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'specific_month';

/**
 * Comparison types for trend queries.
 */
export type ComparisonType =
  | 'month_over_month'
  | 'week_over_week'
  | 'year_over_year'
  | 'category_breakdown'
  | 'vendor_breakdown';

/**
 * Query classification result.
 */
export interface QueryClassification {
  /** Primary intent */
  intent: QueryIntent;

  /** Confidence score (0-1) */
  confidence: number;

  /** Extracted entities */
  entities: ExtractedQueryEntities;

  /** Whether query is asking a question */
  isQuestion: boolean;

  /** Whether query needs cloud data */
  needsCloudData: boolean;

  /** Whether query needs local search */
  needsLocalSearch: boolean;
}

// ============================================
// Intent Classification Patterns
// ============================================

/**
 * Patterns for classifying query intent.
 */
const INTENT_PATTERNS: Record<QueryIntent, RegExp[]> = {
  spending_query: [
    /how much (?:did i|have i|do i) (?:spend|spent|pay|paid)/i,
    /(?:what|how much) (?:was|is|are) (?:my )?(?:total|spending|expenses?)/i,
    /(?:total|sum|amount) (?:of )?(?:spending|expenses?|money)/i,
    /(?:spent|spend|paid|pay) (?:on|for|at)/i,
    /(?:what|show) (?:did i|have i) (?:spend|spent|pay|paid)/i,
    /spending (?:on|for|at|in)/i,
    /expenses? (?:for|on|at|in)/i,
  ],
  income_query: [
    /how much (?:did i|have i|do i) (?:earn|receive|get paid|make)/i,
    /(?:what|how much) (?:was|is|are) (?:my )?(?:total )?(?:income|earnings?|salary|revenue)/i,
    /(?:total|sum|amount) (?:of )?(?:income|earnings?|salary|credits?|deposits?)/i,
    /(?:what|how much) (?:was|were) (?:credited|deposited|received)/i,
    /(?:credited|deposited|received) (?:to|into|in) (?:my )?(?:account|bank)/i,
    /(?:income|salary|paycheck|earnings?|deposits?) (?:for|in|on|this|last)/i,
    /(?:show|find|get) (?:me )?(?:my )?(?:income|earnings?|salary|credits?|deposits?)/i,
    /(?:money|amount) (?:received|earned|credited|deposited|coming in)/i,
    /(?:what|how much) (?:did i|have i) (?:earned?|received|got paid)/i,
    /(?:inflow|inflows|money in|cash in)/i,
  ],
  search_query: [
    /(?:find|show|get|search|look for|locate) (?:me )?(?:the )?(?:receipt|document|transaction|bill|invoice)/i,
    /(?:where|which) (?:is|are) (?:my|the)/i,
    /(?:can you )?(?:find|show|get) (?:all )?(?:my )?/i,
    /search for/i,
    /find (?:receipts?|transactions?|documents?|bills?|invoices?)/i,
  ],
  budget_query: [
    /(?:what|how) (?:is|are) (?:my )?budget/i,
    /budget (?:status|remaining|left|available)/i,
    /(?:am i|are we) (?:over|under|within) budget/i,
    /(?:how much|what) (?:is )?(?:left|remaining) (?:in|of) (?:my )?budget/i,
    /spending (?:vs|versus|compared to) budget/i,
    /budget (?:for|on)/i,
  ],
  trend_query: [
    /(?:show|what are) (?:my )?(?:spending )?trends?/i,
    /(?:how|what) (?:has|have) (?:my )?spending (?:changed|trended)/i,
    /spending (?:pattern|habits?|behavior)/i,
    /(?:increasing|decreasing|going up|going down)/i,
    /(?:over time|overtime)/i,
    /trend(?:s|ing)?/i,
  ],
  comparison_query: [
    /compare (?:this|last)/i,
    /(?:this|last) (?:month|week|year) (?:vs|versus|compared to|to)/i,
    /(?:how does|what is) (?:this|last) (?:month|week|year) compare/i,
    /(?:difference|change) (?:between|from)/i,
    /month over month|week over week|year over year/i,
    /compared to (?:last|previous)/i,
  ],
  general_query: [
    // Fallback patterns - catch-all
    /.*/,
  ],
};

/**
 * Time period patterns for entity extraction.
 */
const TIME_PERIOD_PATTERNS: Record<TimePeriod, RegExp[]> = {
  today: [/today/i, /this day/i],
  yesterday: [/yesterday/i],
  this_week: [/this week/i, /current week/i],
  last_week: [/last week/i, /previous week/i, /past week/i],
  this_month: [/this month/i, /current month/i],
  last_month: [/last month/i, /previous month/i, /past month/i],
  this_quarter: [/this quarter/i, /current quarter/i, /q[1-4] ?\d{4}/i],
  last_quarter: [/last quarter/i, /previous quarter/i],
  // Removed /\b\d{4}\b/ — it greedily matched bare years like "2026" in
  // "January 2026", preventing extractMonthNameDateRange from running.
  this_year: [/this year/i, /current year/i],
  last_year: [/last year/i, /previous year/i],
  // specific_month is handled separately by extractMonthNameDateRange()
  specific_month: [],
};

/**
 * Category keyword mappings for query routing.
 *
 * Derived from the Category Registry (single source of truth).
 * Keys are canonical category names (e.g., "Food & Dining") that match
 * the DB category names exactly, enabling direct name-based lookups.
 *
 * @see lib/categories/category-registry.ts
 */
export const CATEGORY_KEYWORDS: Record<string, string[]> =
  getQueryAliasMap();

// Note: Amount and date extraction patterns are used inline in the extraction functions
// via regex literals for better readability and maintenance.

// ============================================
// Classification Functions
// ============================================

/**
 * Classify the intent of a user query.
 *
 * @param query - The user's query string
 * @returns QueryIntent - The classified intent
 */
export function classifyIntent(query: string): QueryIntent {
  const normalizedQuery = query.toLowerCase().trim();

  // Check each intent pattern in order of specificity
  const intentOrder: QueryIntent[] = [
    'spending_query',
    'income_query',
    'budget_query',
    'comparison_query',
    'trend_query',
    'search_query',
    'general_query',
  ];

  for (const intent of intentOrder) {
    const patterns = INTENT_PATTERNS[intent];
    for (const pattern of patterns) {
      if (pattern.test(normalizedQuery)) {
        // Skip general_query catch-all unless it's the last resort
        if (intent === 'general_query') {
          return intent;
        }
        return intent;
      }
    }
  }

  return 'general_query';
}

// ============================================
// Embedding-Based Intent Classification
// ============================================

/**
 * Canonical example queries for each intent.
 * These are embedded once and cached — each new user query is compared
 * against these centroids via cosine similarity, which handles paraphrases
 * far better than regex patterns.
 */
const INTENT_EXAMPLES: Record<
  Exclude<QueryIntent, 'general_query'>,
  string[]
> = {
  spending_query: [
    'How much did I spend this month?',
    'What are my total expenses?',
    'Show me my spending in January',
    'How much money did I spend on food?',
    'What was my total spending last week?',
    'How much did I pay for groceries?',
    'Total amount spent on utilities',
    'My expenses this year',
    'What did I spend at Starbucks?',
    'Show me all my purchases',
  ],
  income_query: [
    'How much income did I receive?',
    'What was my salary this month?',
    'Show me my earnings',
    'How much money did I earn this year?',
    'What deposits came into my account?',
    'Total credits this month',
    'How much did I get paid?',
    'Show my income for January',
    'What was deposited into my account?',
    'How much money came in last month?',
  ],
  search_query: [
    'Find my receipt from Amazon',
    'Search for transactions at Walmart',
    'Show me the invoice from last Tuesday',
    'Where is my electricity bill?',
    'Find all transactions from Target',
    'Locate my dental receipt',
    'Search for the payment to Dr. Smith',
    'Find documents from February',
    'Show me my gym membership transaction',
    'Get the receipt for my phone bill',
  ],
  budget_query: [
    'Am I within my budget?',
    'How much budget do I have left?',
    'What is my budget status for groceries?',
    'Am I over budget this month?',
    'How much can I still spend?',
    'Budget remaining for entertainment',
    'Show my budget versus actual spending',
    'Have I exceeded my dining budget?',
  ],
  trend_query: [
    'Show me my spending trends',
    'How has my spending changed over time?',
    'What are my spending patterns?',
    'Is my spending increasing or decreasing?',
    'Show me spending trends for food',
    'How have my expenses evolved?',
    'Monthly spending trend analysis',
    'Spending habits over the past year',
  ],
  comparison_query: [
    'Compare this month to last month',
    'How does January compare to February?',
    'This month versus last month spending',
    'Compare my expenses week over week',
    'Spending this year vs last year',
    'Difference between this and last quarter',
    'Month over month comparison',
    'How did my spending change from January to February?',
  ],
};

/**
 * Cache for pre-computed intent example embeddings.
 * Populated lazily on first use — avoids blocking initialization.
 */
interface IntentEmbeddingEntry {
  intent: QueryIntent;
  embedding: Float32Array;
}

let intentEmbeddingCache: IntentEmbeddingEntry[] | null = null;
let intentEmbeddingCachePromise: Promise<IntentEmbeddingEntry[]> | null = null;

/**
 * Compute and cache embeddings for all canonical intent examples.
 * Called once, subsequent calls return the cached result.
 */
async function getIntentEmbeddings(): Promise<IntentEmbeddingEntry[]> {
  if (intentEmbeddingCache) {
    return intentEmbeddingCache;
  }
  if (intentEmbeddingCachePromise) {
    return intentEmbeddingCachePromise;
  }

  intentEmbeddingCachePromise = (async () => {
    const entries: IntentEmbeddingEntry[] = [];

    for (const [intent, examples] of Object.entries(INTENT_EXAMPLES)) {
      const embeddings = await embeddingService.embedBatch(examples);
      for (const embedding of embeddings) {
        entries.push({ intent: intent as QueryIntent, embedding });
      }
    }

    intentEmbeddingCache = entries;
    console.log(
      `[QueryRouter] Cached ${entries.length} intent example embeddings`
    );
    return entries;
  })();

  return intentEmbeddingCachePromise;
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Classify intent using embedding similarity.
 *
 * Embeds the user query and compares against pre-computed canonical
 * examples for each intent. Returns the intent with the highest
 * average similarity among its top-k examples.
 *
 * @returns The classified intent and confidence, or null if embeddings aren't ready.
 */
async function classifyIntentWithEmbeddings(
  query: string
): Promise<{ intent: QueryIntent; confidence: number } | null> {
  // Bail out if the embedding model isn't ready
  if (!embeddingService.isReady()) {
    return null;
  }

  try {
    const [queryEmbedding, intentEntries] = await Promise.all([
      embeddingService.embedText(query),
      getIntentEmbeddings(),
    ]);

    // Compute similarity against every canonical example
    const scores: { intent: QueryIntent; similarity: number }[] = [];
    for (const entry of intentEntries) {
      scores.push({
        intent: entry.intent,
        similarity: cosineSimilarity(queryEmbedding, entry.embedding),
      });
    }

    // Group by intent and compute the average of the top-3 similarities
    const intentScores = new Map<QueryIntent, number[]>();
    for (const { intent, similarity } of scores) {
      const arr = intentScores.get(intent) || [];
      arr.push(similarity);
      intentScores.set(intent, arr);
    }

    let bestIntent: QueryIntent = 'general_query';
    let bestScore = 0;

    for (const [intent, sims] of intentScores.entries()) {
      // Take the top-3 similarities and average them
      sims.sort((a, b) => b - a);
      const topK = sims.slice(0, 3);
      const avgScore = topK.reduce((a, b) => a + b, 0) / topK.length;

      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestIntent = intent;
      }
    }

    // Require a minimum similarity threshold to avoid mis-classification
    // of truly general queries
    const MIN_SIMILARITY = 0.45;
    if (bestScore < MIN_SIMILARITY) {
      return { intent: 'general_query', confidence: 1 - bestScore };
    }

    return { intent: bestIntent, confidence: bestScore };
  } catch (error) {
    console.warn(
      '[QueryRouter] Embedding-based classification failed, will use regex:',
      error
    );
    return null;
  }
}

/**
 * Async version of classifyQuery that uses embedding-based intent
 * classification when the model is ready, falling back to regex.
 *
 * The embedding classifier handles paraphrases and natural language
 * variations much better than regex (e.g., "Where'd all my money go?"
 * → spending_query).
 */
export async function classifyQueryAsync(
  query: string
): Promise<QueryClassification> {
  // Try embedding-based classification first
  const embeddingResult = await classifyIntentWithEmbeddings(query);

  let intent: QueryIntent;
  let confidence: number;

  if (embeddingResult && embeddingResult.confidence >= 0.45) {
    intent = embeddingResult.intent;
    confidence = embeddingResult.confidence;

    // Cross-check with regex — if regex gives a different high-confidence result,
    // prefer the regex result (it's deterministic and pattern-exact)
    const regexIntent = classifyIntent(query);
    const regexConfidence = calculateConfidence(query, regexIntent);

    if (regexIntent !== intent && regexConfidence > 0.8) {
      // Regex is very confident about a different intent — trust it
      intent = regexIntent;
      confidence = regexConfidence;
    }
  } else {
    // Fallback to regex classification
    intent = classifyIntent(query);
    confidence = calculateConfidence(query, intent);
  }

  const entities = extractEntities(query, intent);

  // #region agent log
  fetch('/api/debug-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'query-router.ts:classifyQueryAsync',message:'Full classification details',data:{query,embeddingIntent:embeddingResult?.intent||null,embeddingConfidence:embeddingResult?.confidence||null,finalIntent:intent,finalConfidence:confidence,direction:entities.transactionDirection,dateRange:entities.dateRange,categories:entities.categories,keywords:entities.keywords},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  const isQuestion =
    /^(what|how|where|when|why|which|who|can|could|would|is|are|did|do|does|have|has)\b/i.test(
      query.trim()
    ) || query.trim().endsWith('?');

  const needsCloudData = [
    'spending_query',
    'income_query',
    'budget_query',
    'comparison_query',
    'trend_query',
  ].includes(intent);
  const needsLocalSearch = [
    'search_query',
    'spending_query',
    'income_query',
    'general_query',
  ].includes(intent);

  return {
    intent,
    confidence,
    entities,
    isQuestion,
    needsCloudData,
    needsLocalSearch,
  };
}

/**
 * Extract entities from a query.
 *
 * @param query - The user's query string
 * @param intent - The classified intent
 * @returns ExtractedQueryEntities
 */
export function extractEntities(
  query: string,
  intent: QueryIntent
): ExtractedQueryEntities {
  const entities: ExtractedQueryEntities = {
    dateRange: null,
    categories: [],
    amountRange: null,
    vendors: [],
    locations: [],
    timePeriod: null,
    comparisonType: null,
    keywords: [],
    transactionDirection: 'all',
  };

  const normalizedQuery = query.toLowerCase();

  // Extract transaction direction from query
  entities.transactionDirection = extractTransactionDirection(
    normalizedQuery,
    intent
  );

  // Try to extract a "between X and Y" date range first (most specific)
  entities.dateRange = extractBetweenDateRange(normalizedQuery);

  // Then try a specific month name (e.g., "in January", "January 2026")
  if (!entities.dateRange) {
    entities.dateRange = extractMonthNameDateRange(normalizedQuery);
    if (entities.dateRange) {
      entities.timePeriod = 'specific_month';
    }
  }

  // Then try relative date ranges ("last 3 months", "past 90 days")
  if (!entities.dateRange) {
    entities.dateRange = extractRelativeDateRange(normalizedQuery);
  }

  // If still no date matched, try general time period patterns
  if (!entities.dateRange) {
    entities.timePeriod = extractTimePeriod(normalizedQuery);
    if (entities.timePeriod) {
      entities.dateRange = getDateRangeFromPeriod(entities.timePeriod);
    }
  }

  // Extract superlative intent
  entities.superlative = extractSuperlative(normalizedQuery);

  // Extract categories
  entities.categories = extractCategories(normalizedQuery);

  // Extract vendors — look for proper nouns / capitalized words that
  // are likely vendor or merchant names (e.g., "Starbucks", "Amazon")
  entities.vendors = extractVendors(query);

  // Extract amounts
  entities.amountRange = extractAmountRange(query);

  // Extract comparison type for comparison queries
  if (intent === 'comparison_query') {
    entities.comparisonType = extractComparisonType(normalizedQuery);
  }

  // Extract keywords (for fallback search)
  entities.keywords = extractKeywords(normalizedQuery);

  // Extract locations (simple approach)
  entities.locations = extractLocations(query);

  return entities;
}

/**
 * Classify a query and extract all relevant information.
 *
 * @param query - The user's query string
 * @returns QueryClassification
 */
export function classifyQuery(query: string): QueryClassification {
  const intent = classifyIntent(query);
  const entities = extractEntities(query, intent);

  // Determine confidence based on pattern match strength
  const confidence = calculateConfidence(query, intent);

  // Determine if this is a question
  const isQuestion =
    /^(what|how|where|when|why|which|who|can|could|would|is|are|did|do|does|have|has)\b/i.test(
      query.trim()
    ) || query.trim().endsWith('?');

  // Determine data requirements
  const needsCloudData = [
    'spending_query',
    'income_query',
    'budget_query',
    'comparison_query',
    'trend_query',
  ].includes(intent);
  const needsLocalSearch = [
    'search_query',
    'spending_query',
    'income_query',
    'general_query',
  ].includes(intent);

  return {
    intent,
    confidence,
    entities,
    isQuestion,
    needsCloudData,
    needsLocalSearch,
  };
}

// ============================================
// Entity Extraction Helpers
// ============================================

/**
 * Extract transaction direction from query and intent.
 * Uses intent as a strong signal, plus keyword detection for explicit direction.
 */
function extractTransactionDirection(
  query: string,
  intent: QueryIntent
): TransactionDirection {
  // income_query intent is a strong signal
  if (intent === 'income_query') {
    return 'income';
  }

  // spending_query intent is a strong signal
  if (intent === 'spending_query') {
    return 'expense';
  }

  // For other intents, check for explicit direction keywords
  const incomeKeywords =
    /\b(income|earn|earned|earning|salary|paycheck|credit|credited|deposit|deposited|received|inflow|inflows|money in|cash in|payment received|refund|refunded|cashback|cash back|dividend|dividends)\b/i;
  const expenseKeywords =
    /\b(spend|spent|spending|expense|expenses|paid|pay|payment|debit|debited|outflow|outflows|money out|cash out|cost|costs|purchase|bought|invest|invested|investing|investment|subscribe|subscribed|subscription|transfer|transferred|emi|loan|premium|rent|tax|taxes)\b/i;

  const hasIncomeSignal = incomeKeywords.test(query);
  const hasExpenseSignal = expenseKeywords.test(query);

  if (hasIncomeSignal && !hasExpenseSignal) {
    return 'income';
  }
  if (hasExpenseSignal && !hasIncomeSignal) {
    return 'expense';
  }

  // Both or neither — return 'all'
  return 'all';
}

/**
 * Month name to number mapping.
 */
const MONTH_NAMES: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Format a Date as YYYY-MM-DD in the local timezone.
 *
 * IMPORTANT: Do NOT use `date.toISOString().split('T')[0]` for calendar dates!
 * toISOString() converts to UTC, which shifts the date backward in timezones
 * ahead of UTC (e.g., IST). For example, Jan 1 2026 00:00 IST becomes
 * 2025-12-31T18:30:00Z, yielding "2025-12-31" instead of "2026-01-01".
 */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Extract a date range from a specific month name in the query.
 * Handles patterns like "in January", "for February", "January 2026", etc.
 * Assumes the current year if no year is specified.
 * If the month is in the future, assumes last year.
 */
function extractMonthNameDateRange(
  query: string
): { start: string; end: string } | null {
  // Match month names, optionally followed by a year
  const monthPattern =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b(?:\s+(\d{4}))?/i;

  const match = query.match(monthPattern);
  if (!match?.[1]) {
    return null;
  }

  const monthName = match[1].toLowerCase();
  const monthIndex = MONTH_NAMES[monthName];
  if (monthIndex === undefined) {
    return null;
  }

  const now = new Date();
  let year = match[2] ? parseInt(match[2], 10) : now.getFullYear();

  // If month is in the future and no year specified, assume last year
  if (!match[2] && monthIndex > now.getMonth()) {
    year = now.getFullYear() - 1;
  }

  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0); // Last day of the month

  return {
    start: toLocalDateString(start),
    end: toLocalDateString(end),
  };
}

/**
 * Extract time period from query.
 */
function extractTimePeriod(query: string): TimePeriod | null {
  for (const [period, patterns] of Object.entries(TIME_PERIOD_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        return period as TimePeriod;
      }
    }
  }
  return null;
}

/**
 * Get date range from time period.
 */
function getDateRangeFromPeriod(period: TimePeriod): {
  start: string;
  end: string;
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start: Date;
  let end: Date;

  switch (period) {
    case 'today':
      start = today;
      end = today;
      break;
    case 'yesterday':
      start = new Date(today);
      start.setDate(start.getDate() - 1);
      end = start;
      break;
    case 'this_week':
      start = new Date(today);
      start.setDate(start.getDate() - start.getDay());
      end = today;
      break;
    case 'last_week':
      end = new Date(today);
      end.setDate(end.getDate() - end.getDay() - 1);
      start = new Date(end);
      start.setDate(start.getDate() - 6);
      break;
    case 'this_month':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = today;
      break;
    case 'last_month':
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case 'this_quarter':
      const currentQuarter = Math.floor(today.getMonth() / 3);
      start = new Date(today.getFullYear(), currentQuarter * 3, 1);
      end = today;
      break;
    case 'last_quarter':
      const lastQuarter = Math.floor(today.getMonth() / 3) - 1;
      const year =
        lastQuarter < 0 ? today.getFullYear() - 1 : today.getFullYear();
      const quarter = lastQuarter < 0 ? 3 : lastQuarter;
      start = new Date(year, quarter * 3, 1);
      end = new Date(year, quarter * 3 + 3, 0);
      break;
    case 'this_year':
      start = new Date(today.getFullYear(), 0, 1);
      end = today;
      break;
    case 'last_year':
      start = new Date(today.getFullYear() - 1, 0, 1);
      end = new Date(today.getFullYear() - 1, 11, 31);
      break;
    case 'specific_month':
      // Handled by extractMonthNameDateRange, fallback to this month
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = today;
      break;
    default:
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = today;
  }

  return {
    start: toLocalDateString(start),
    end: toLocalDateString(end),
  };
}

/**
 * Extract a relative date range like "last 3 months", "past 90 days",
 * "last 2 weeks", "past 6 months", "last 1 year", etc.
 */
function extractRelativeDateRange(
  query: string
): { start: string; end: string } | null {
  const relativePattern =
    /\b(?:last|past|previous|recent)\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)\b/i;
  const match = query.match(relativePattern);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  const count = parseInt(match[1], 10);
  const unit = match[2].toLowerCase().replace(/s$/, ''); // normalize plural

  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);

  switch (unit) {
    case 'day':
      start.setDate(start.getDate() - count);
      break;
    case 'week':
      start.setDate(start.getDate() - count * 7);
      break;
    case 'month':
      start.setMonth(start.getMonth() - count);
      break;
    case 'year':
      start.setFullYear(start.getFullYear() - count);
      break;
  }

  return {
    start: toLocalDateString(start),
    end: toLocalDateString(end),
  };
}

/**
 * Extract a "between X and Y" date range.
 * Handles patterns like:
 *   "between January and March"
 *   "between Jan 2025 and Mar 2026"
 *   "from February to April"
 */
function extractBetweenDateRange(
  query: string
): { start: string; end: string } | null {
  const monthList = Object.keys(MONTH_NAMES).join('|');
  const betweenPattern = new RegExp(
    `(?:between|from)\\s+(${monthList})(?:\\s+(\\d{4}))?\\s+(?:and|to|through|thru|-)\\s+(${monthList})(?:\\s+(\\d{4}))?`,
    'i'
  );
  const match = query.match(betweenPattern);
  if (!match?.[1] || !match[3]) {
    return null;
  }

  const startMonth = MONTH_NAMES[match[1].toLowerCase()];
  const endMonth = MONTH_NAMES[match[3].toLowerCase()];
  if (startMonth === undefined || endMonth === undefined) {
    return null;
  }

  const now = new Date();
  const startYear = match[2] ? parseInt(match[2], 10) : now.getFullYear();
  const endYear = match[4] ? parseInt(match[4], 10) : now.getFullYear();

  const start = new Date(startYear, startMonth, 1);
  const end = new Date(endYear, endMonth + 1, 0); // Last day of end month

  return {
    start: toLocalDateString(start),
    end: toLocalDateString(end),
  };
}

/**
 * Superlative types for queries like "biggest", "smallest", "most expensive".
 */
export type SuperlativeType = 'largest' | 'smallest' | null;

/**
 * Extract superlative intent from the query.
 * Returns 'largest' for biggest/highest/most expensive/top,
 * 'smallest' for smallest/lowest/cheapest/least, or null.
 */
function extractSuperlative(query: string): SuperlativeType {
  if (
    /\b(biggest|largest|highest|most expensive|top|maximum|max|major|highest value)\b/i.test(
      query
    )
  ) {
    return 'largest';
  }
  if (
    /\b(smallest|lowest|cheapest|least|minimum|min|minor|lowest value)\b/i.test(
      query
    )
  ) {
    return 'smallest';
  }
  return null;
}

/**
 * Extract potential vendor/merchant names from a query.
 *
 * Looks for capitalized words that aren't common English words, month names,
 * or financial keywords — these are likely vendor/merchant names.
 * Also matches quoted strings as explicit vendor references.
 */
function extractVendors(query: string): string[] {
  const vendors: string[] = [];

  // 1. Match explicitly quoted vendor names: "Starbucks", 'Amazon'
  const quotedPattern = /["']([^"']+)["']/g;
  let quotedMatch;
  while ((quotedMatch = quotedPattern.exec(query)) !== null) {
    if (quotedMatch[1] && quotedMatch[1].length > 1) {
      vendors.push(quotedMatch[1].trim());
    }
  }

  // 2. Match capitalized words that look like proper nouns (vendor names)
  // e.g., "Starbucks", "Amazon", "Uber", "Netflix"
  const properNounPattern = /\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]+)*)\b/g;
  const ignoreWords = new Set([
    // Common English
    'The',
    'This',
    'That',
    'These',
    'Those',
    'What',
    'Which',
    'Where',
    'When',
    'Why',
    'How',
    'Who',
    'Can',
    'Could',
    'Would',
    'Should',
    'Did',
    'Does',
    'Have',
    'Has',
    'Show',
    'Find',
    'Get',
    'Search',
    'Compare',
    'Total',
    'Amount',
    'Much',
    'Many',
    'All',
    'Most',
    // Months
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
    // Days
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
    // Financial terms
    'Budget',
    'Spending',
    'Income',
    'Expense',
    'Expenses',
    'Transaction',
    'Transactions',
    'Category',
    'Categories',
    'Credit',
    'Debit',
    'Deposit',
    'Salary',
    'Payment',
  ]);

  let nounMatch;
  while ((nounMatch = properNounPattern.exec(query)) !== null) {
    const word = nounMatch[1];
    if (word && !ignoreWords.has(word)) {
      if (!vendors.includes(word)) {
        vendors.push(word);
      }
    }
  }

  // 3. Match common patterns: "at <vendor>", "from <vendor>", "to <vendor>"
  const prepositionPattern =
    /(?:at|from|to|for)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g;
  let prepMatch;
  while ((prepMatch = prepositionPattern.exec(query)) !== null) {
    const vendor = prepMatch[1];
    if (vendor && !ignoreWords.has(vendor) && !vendors.includes(vendor)) {
      vendors.push(vendor);
    }
  }

  return vendors;
}

/**
 * Extract category mentions from query.
 */
function extractCategories(query: string): string[] {
  const categories: string[] = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (query.includes(keyword)) {
        if (!categories.includes(category)) {
          categories.push(category);
        }
        break;
      }
    }
  }

  return categories;
}

/**
 * Extract amount range from query.
 */
function extractAmountRange(
  query: string
): { min: number | null; max: number | null } | null {
  const range: { min: number | null; max: number | null } = {
    min: null,
    max: null,
  };

  // Check for "over X" or "more than X"
  const overMatch = query.match(
    /(?:over|more than|at least|above)\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i
  );
  if (overMatch?.[1]) {
    range.min = parseFloat(overMatch[1].replace(/,/g, ''));
  }

  // Check for "under X" or "less than X"
  const underMatch = query.match(
    /(?:under|less than|at most|below)\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i
  );
  if (underMatch?.[1]) {
    range.max = parseFloat(underMatch[1].replace(/,/g, ''));
  }

  // Check for "between X and Y"
  const betweenMatch = query.match(
    /between\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:and|to|\-)\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i
  );
  if (betweenMatch?.[1] && betweenMatch?.[2]) {
    range.min = parseFloat(betweenMatch[1].replace(/,/g, ''));
    range.max = parseFloat(betweenMatch[2].replace(/,/g, ''));
  }

  // Check for "around X"
  const aroundMatch = query.match(
    /(?:around|about|approximately)\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i
  );
  if (aroundMatch?.[1]) {
    const amount = parseFloat(aroundMatch[1].replace(/,/g, ''));
    range.min = amount * 0.8;
    range.max = amount * 1.2;
  }

  return range.min !== null || range.max !== null ? range : null;
}

/**
 * Extract comparison type from query.
 */
function extractComparisonType(query: string): ComparisonType | null {
  if (
    /month over month|month to month|monthly comparison|vs last month|compared to last month/i.test(
      query
    )
  ) {
    return 'month_over_month';
  }
  if (
    /week over week|weekly comparison|vs last week|compared to last week/i.test(
      query
    )
  ) {
    return 'week_over_week';
  }
  if (
    /year over year|yearly comparison|vs last year|compared to last year/i.test(
      query
    )
  ) {
    return 'year_over_year';
  }
  if (
    /by category|per category|category breakdown|breakdown by category/i.test(
      query
    )
  ) {
    return 'category_breakdown';
  }
  if (
    /by vendor|per vendor|vendor breakdown|breakdown by vendor/i.test(query)
  ) {
    return 'vendor_breakdown';
  }
  return null;
}

/**
 * Extract keywords from query.
 */
function extractKeywords(query: string): string[] {
  // Remove common stop words
  const stopWords = new Set([
    'i',
    'me',
    'my',
    'myself',
    'we',
    'our',
    'ours',
    'ourselves',
    'you',
    'your',
    'yours',
    'yourself',
    'yourselves',
    'he',
    'him',
    'his',
    'himself',
    'she',
    'her',
    'hers',
    'herself',
    'it',
    'its',
    'itself',
    'they',
    'them',
    'their',
    'theirs',
    'themselves',
    'what',
    'which',
    'who',
    'whom',
    'this',
    'that',
    'these',
    'those',
    'am',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'having',
    'do',
    'does',
    'did',
    'doing',
    'a',
    'an',
    'the',
    'and',
    'but',
    'if',
    'or',
    'because',
    'as',
    'until',
    'while',
    'of',
    'at',
    'by',
    'for',
    'with',
    'about',
    'against',
    'between',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'to',
    'from',
    'up',
    'down',
    'in',
    'out',
    'on',
    'off',
    'over',
    'under',
    'again',
    'further',
    'then',
    'once',
    'here',
    'there',
    'when',
    'where',
    'why',
    'how',
    'all',
    'each',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'nor',
    'not',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    's',
    't',
    'can',
    'will',
    'just',
    'don',
    'should',
    'now',
    'show',
    'find',
    'get',
    'much',
    'many',
    'spent',
    'spend',
    'spending',
    'paid',
    'pay',
  ]);

  const words = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  return [...new Set(words)];
}

/**
 * Extract location mentions from query.
 */
function extractLocations(query: string): string[] {
  const locations: string[] = [];

  // Look for "in [location]" or "at [location]" patterns
  const locationPatterns = [
    /(?:in|at|from)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/g,
    /(?:trip to|vacation in|visited)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/gi,
  ];

  for (const pattern of locationPatterns) {
    let match;
    while ((match = pattern.exec(query)) !== null) {
      if (match[1] && !isCommonWord(match[1])) {
        locations.push(match[1]);
      }
    }
  }

  return locations;
}

/**
 * Check if a word is a common non-location word.
 */
function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'The',
    'This',
    'That',
    'These',
    'Those',
    'My',
    'Your',
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ]);
  return commonWords.has(word);
}

/**
 * Calculate confidence score for intent classification.
 */
function calculateConfidence(query: string, intent: QueryIntent): number {
  const patterns = INTENT_PATTERNS[intent];
  let matchCount = 0;
  let strongMatch = false;

  for (const pattern of patterns) {
    if (pattern.test(query)) {
      matchCount++;
      // Check if it's a strong pattern (not the catch-all)
      if (pattern.toString() !== '/.*/') {
        strongMatch = true;
      }
    }
  }

  if (intent === 'general_query' && !strongMatch) {
    return 0.3;
  }

  // More matches = higher confidence
  const baseConfidence = strongMatch ? 0.7 : 0.4;
  const matchBonus = Math.min(matchCount * 0.1, 0.3);

  return Math.min(baseConfidence + matchBonus, 1.0);
}

/**
 * Build a search filter from extracted entities.
 */
export function buildSearchFilter(
  entities: ExtractedQueryEntities
): SearchFilter {
  const filter: SearchFilter = {};

  if (entities.dateRange) {
    filter.dateRange = entities.dateRange;
  }

  if (entities.amountRange) {
    if (entities.amountRange.min !== null) {
      filter.minAmount = entities.amountRange.min;
    }
    if (entities.amountRange.max !== null) {
      filter.maxAmount = entities.amountRange.max;
    }
  }

  if (entities.vendors.length > 0) {
    filter.vendor = entities.vendors[0];
  }

  return filter;
}

// Types are exported inline with their definitions above
