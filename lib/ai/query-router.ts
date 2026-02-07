/**
 * Query Router for Vault-AI Chat Service
 *
 * Handles intent classification and entity extraction from user queries.
 * All processing is done locally without sending data to external services.
 */

import type { QueryIntent, SearchFilter } from '@/types/ai';

// ============================================
// Types
// ============================================

/**
 * Extracted entities from a query.
 */
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
  | 'last_year';

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
  this_year: [/this year/i, /current year/i, /\b\d{4}\b/],
  last_year: [/last year/i, /previous year/i],
};

/**
 * Category keyword mappings.
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  groceries: [
    'groceries',
    'grocery',
    'supermarket',
    'food shopping',
    'provisions',
  ],
  dining: [
    'dining',
    'restaurant',
    'food',
    'meal',
    'lunch',
    'dinner',
    'breakfast',
    'eating out',
    'takeout',
    'delivery',
  ],
  transport: [
    'transport',
    'transportation',
    'uber',
    'lyft',
    'taxi',
    'cab',
    'gas',
    'fuel',
    'petrol',
    'parking',
    'car',
    'commute',
  ],
  entertainment: [
    'entertainment',
    'movie',
    'movies',
    'cinema',
    'concert',
    'show',
    'streaming',
    'netflix',
    'spotify',
    'gaming',
  ],
  shopping: [
    'shopping',
    'clothes',
    'clothing',
    'amazon',
    'online shopping',
    'retail',
    'store',
  ],
  healthcare: [
    'healthcare',
    'health',
    'medical',
    'doctor',
    'hospital',
    'pharmacy',
    'medicine',
    'dentist',
    'dental',
  ],
  utilities: [
    'utilities',
    'electricity',
    'water',
    'gas',
    'internet',
    'phone',
    'bill',
    'bills',
  ],
  travel: [
    'travel',
    'trip',
    'vacation',
    'holiday',
    'flight',
    'hotel',
    'airbnb',
    'booking',
  ],
  income: ['income', 'salary', 'paycheck', 'payment received', 'deposit'],
};

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
  };

  const normalizedQuery = query.toLowerCase();

  // Extract time period
  entities.timePeriod = extractTimePeriod(normalizedQuery);

  // Extract date range from time period
  if (entities.timePeriod) {
    entities.dateRange = getDateRangeFromPeriod(entities.timePeriod);
  }

  // Extract categories
  entities.categories = extractCategories(normalizedQuery);

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
    'budget_query',
    'comparison_query',
    'trend_query',
  ].includes(intent);
  const needsLocalSearch = [
    'search_query',
    'spending_query',
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
    default:
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = today;
  }

  return {
    start: start.toISOString().split('T')[0]!,
    end: end.toISOString().split('T')[0]!,
  };
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
