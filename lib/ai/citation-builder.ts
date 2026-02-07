/**
 * Citation Builder for Vault-AI
 *
 * Generates citations that link AI responses to source documents.
 * Citations provide transparency and allow users to verify AI statements.
 *
 * PRIVACY: Citations reference transaction IDs, not raw document content.
 * Document content is only accessed locally when user clicks to view.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Citation } from '@/types/ai';
import type { LocalTransaction, TransactionId } from '@/types/database';

// ============================================
// Types
// ============================================

/**
 * Citation type indicating the source.
 */
export type CitationType = 'transaction' | 'document' | 'summary';

/**
 * Extended citation with additional metadata.
 */
export interface ExtendedCitation extends Citation {
  /** Unique citation ID */
  id: string;

  /** Type of citation source */
  type: CitationType;

  /** Whether the transaction has an associated document */
  hasDocument: boolean;

  /** Category of the transaction */
  category: string | null;

  /** File type if document exists */
  fileType: string | null;
}

/**
 * Citation generation options.
 */
export interface CitationOptions {
  /** Maximum number of citations to generate */
  maxCitations?: number;

  /** Minimum relevance score threshold */
  minRelevanceScore?: number;

  /** Whether to require document attachment */
  requireDocument?: boolean;

  /** Additional context for relevance calculation */
  queryContext?: string;

  /** Categories mentioned in query */
  mentionedCategories?: string[];

  /** Date range from query */
  dateRange?: {
    start: Date;
    end: Date;
  };

  /** Amount range from query */
  amountRange?: {
    min: number | null;
    max: number | null;
  };
}

/**
 * Relevance factors for scoring.
 */
interface RelevanceFactors {
  vendorMatch: number;
  recency: number;
  amountSignificance: number;
  hasDocument: number;
  categoryMatch: number;
  dateRangeMatch: number;
  amountRangeMatch: number;
  confidenceScore: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_OPTIONS: Required<CitationOptions> = {
  maxCitations: 5,
  minRelevanceScore: 0.2,
  requireDocument: false,
  queryContext: '',
  mentionedCategories: [],
  dateRange: {
    start: new Date(0),
    end: new Date(),
  },
  amountRange: {
    min: null,
    max: null,
  },
};

/**
 * Relevance weights for scoring.
 */
const RELEVANCE_WEIGHTS = {
  vendorMatch: 0.25,
  recency: 0.15,
  amountSignificance: 0.1,
  hasDocument: 0.15,
  categoryMatch: 0.15,
  dateRangeMatch: 0.1,
  amountRangeMatch: 0.05,
  confidenceScore: 0.05,
} as const;

// ============================================
// Main Functions
// ============================================

/**
 * Build citations from transactions.
 *
 * @param transactions - Transactions to generate citations from
 * @param options - Citation generation options
 * @returns Array of citations sorted by relevance
 *
 * @example
 * ```typescript
 * const citations = buildCitations(transactions, {
 *   queryContext: "How much did I spend at Starbucks?",
 *   maxCitations: 5,
 * });
 * ```
 */
export function buildCitations(
  transactions: LocalTransaction[],
  options: CitationOptions = {}
): Citation[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Filter and score transactions
  const scoredTransactions = transactions
    .filter((tx) => {
      // Filter by document requirement
      if (opts.requireDocument && !tx.filePath) {
        return false;
      }
      return true;
    })
    .map((tx) => ({
      transaction: tx,
      score: calculateRelevanceScore(tx, opts),
    }))
    .filter((item) => item.score >= opts.minRelevanceScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.maxCitations);

  // Generate citations
  return scoredTransactions.map((item, index) =>
    createCitation(item.transaction, item.score, index)
  );
}

/**
 * Build extended citations with additional metadata.
 *
 * @param transactions - Transactions to generate citations from
 * @param options - Citation generation options
 * @param categoryMap - Map of category IDs to names
 * @returns Array of extended citations
 */
export function buildExtendedCitations(
  transactions: LocalTransaction[],
  options: CitationOptions = {},
  categoryMap: Map<string, string> = new Map()
): ExtendedCitation[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const scoredTransactions = transactions
    .filter((tx) => {
      if (opts.requireDocument && !tx.filePath) {
        return false;
      }
      return true;
    })
    .map((tx) => ({
      transaction: tx,
      score: calculateRelevanceScore(tx, opts),
    }))
    .filter((item) => item.score >= opts.minRelevanceScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.maxCitations);

  return scoredTransactions.map((item, index) =>
    createExtendedCitation(item.transaction, item.score, index, categoryMap)
  );
}

/**
 * Calculate relevance score for a transaction.
 *
 * @param transaction - Transaction to score
 * @param options - Scoring context
 * @returns Relevance score between 0 and 1
 */
export function calculateRelevanceScore(
  transaction: LocalTransaction,
  options: CitationOptions = {}
): number {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const factors = calculateRelevanceFactors(transaction, opts);

  // Calculate weighted score
  let score = 0;
  score += factors.vendorMatch * RELEVANCE_WEIGHTS.vendorMatch;
  score += factors.recency * RELEVANCE_WEIGHTS.recency;
  score += factors.amountSignificance * RELEVANCE_WEIGHTS.amountSignificance;
  score += factors.hasDocument * RELEVANCE_WEIGHTS.hasDocument;
  score += factors.categoryMatch * RELEVANCE_WEIGHTS.categoryMatch;
  score += factors.dateRangeMatch * RELEVANCE_WEIGHTS.dateRangeMatch;
  score += factors.amountRangeMatch * RELEVANCE_WEIGHTS.amountRangeMatch;
  score += factors.confidenceScore * RELEVANCE_WEIGHTS.confidenceScore;

  return Math.min(Math.max(score, 0), 1);
}

/**
 * Calculate individual relevance factors.
 */
export function calculateRelevanceFactors(
  transaction: LocalTransaction,
  options: CitationOptions = {}
): RelevanceFactors {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const queryLower = opts.queryContext.toLowerCase();

  // 1. Vendor match
  const vendorMatch = queryLower.includes(transaction.vendor.toLowerCase())
    ? 1.0
    : containsPartialMatch(queryLower, transaction.vendor)
      ? 0.5
      : 0;

  // 2. Recency score
  const recency = calculateRecencyScore(new Date(transaction.date));

  // 3. Amount significance
  const amountSignificance = calculateAmountSignificance(transaction.amount);

  // 4. Has document
  const hasDocument = transaction.filePath ? 1.0 : 0;

  // 5. Category match
  let categoryMatch = 0;
  if (opts.mentionedCategories.length > 0 && transaction.category) {
    const txCategory = transaction.category.toLowerCase();
    categoryMatch = opts.mentionedCategories.some((cat) =>
      txCategory.includes(cat.toLowerCase())
    )
      ? 1.0
      : 0;
  }

  // 6. Date range match
  let dateRangeMatch = 0;
  if (opts.dateRange) {
    const txDate = new Date(transaction.date);
    if (txDate >= opts.dateRange.start && txDate <= opts.dateRange.end) {
      dateRangeMatch = 1.0;
    }
  }

  // 7. Amount range match
  let amountRangeMatch = 0;
  if (opts.amountRange.min !== null || opts.amountRange.max !== null) {
    const inRange =
      (opts.amountRange.min === null ||
        transaction.amount >= opts.amountRange.min) &&
      (opts.amountRange.max === null ||
        transaction.amount <= opts.amountRange.max);
    amountRangeMatch = inRange ? 1.0 : 0;
  }

  // 8. Confidence score (from extraction)
  const confidenceScore = transaction.confidence || 0;

  return {
    vendorMatch,
    recency,
    amountSignificance,
    hasDocument,
    categoryMatch,
    dateRangeMatch,
    amountRangeMatch,
    confidenceScore,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Create a citation from a transaction.
 */
function createCitation(
  transaction: LocalTransaction,
  relevanceScore: number,
  index: number
): Citation {
  return {
    transactionId: transaction.id,
    relevanceScore,
    snippet: generateSnippet(transaction),
    label: `[${index + 1}]`,
    date: transaction.date,
    amount: transaction.amount,
    vendor: transaction.vendor,
  };
}

/**
 * Create an extended citation with additional metadata.
 */
function createExtendedCitation(
  transaction: LocalTransaction,
  relevanceScore: number,
  index: number,
  categoryMap: Map<string, string>
): ExtendedCitation {
  const baseCitation = createCitation(transaction, relevanceScore, index);

  return {
    ...baseCitation,
    id: `citation-${uuidv4().slice(0, 8)}`,
    type: transaction.filePath ? 'document' : 'transaction',
    hasDocument: !!transaction.filePath,
    category: transaction.category
      ? categoryMap.get(transaction.category) || null
      : null,
    fileType: transaction.mimeType || null,
  };
}

/**
 * Generate a snippet for the citation.
 */
function generateSnippet(transaction: LocalTransaction): string {
  const parts: string[] = [];

  // Vendor and amount
  parts.push(`${transaction.vendor} - $${transaction.amount.toFixed(2)}`);

  // Date
  const date = new Date(transaction.date);
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  parts.push(formattedDate);

  return parts.join(' • ');
}

/**
 * Calculate recency score based on transaction date.
 * More recent transactions score higher.
 */
function calculateRecencyScore(txDate: Date): number {
  const now = new Date();
  const daysDiff = (now.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysDiff <= 7) {
    return 1.0;
  }
  if (daysDiff <= 14) {
    return 0.9;
  }
  if (daysDiff <= 30) {
    return 0.7;
  }
  if (daysDiff <= 90) {
    return 0.5;
  }
  if (daysDiff <= 180) {
    return 0.3;
  }
  if (daysDiff <= 365) {
    return 0.2;
  }
  return 0.1;
}

/**
 * Calculate amount significance score.
 * Larger amounts are generally more significant.
 */
function calculateAmountSignificance(amount: number): number {
  const absAmount = Math.abs(amount);

  if (absAmount >= 1000) {
    return 1.0;
  }
  if (absAmount >= 500) {
    return 0.8;
  }
  if (absAmount >= 200) {
    return 0.6;
  }
  if (absAmount >= 100) {
    return 0.4;
  }
  if (absAmount >= 50) {
    return 0.2;
  }
  return 0.1;
}

/**
 * Check for partial word match in query.
 */
function containsPartialMatch(query: string, target: string): boolean {
  const targetWords = target.toLowerCase().split(/\s+/);
  return targetWords.some((word) => word.length >= 3 && query.includes(word));
}

// ============================================
// Citation Grouping
// ============================================

/**
 * Group citations by category.
 */
export function groupCitationsByCategory(
  citations: ExtendedCitation[]
): Map<string, ExtendedCitation[]> {
  const groups = new Map<string, ExtendedCitation[]>();

  for (const citation of citations) {
    const category = citation.category || 'Uncategorized';
    const existing = groups.get(category) || [];
    groups.set(category, [...existing, citation]);
  }

  return groups;
}

/**
 * Group citations by date.
 */
export function groupCitationsByDate(
  citations: Citation[]
): Map<string, Citation[]> {
  const groups = new Map<string, Citation[]>();

  for (const citation of citations) {
    const date = new Date(citation.date);
    const key = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    });
    const existing = groups.get(key) || [];
    groups.set(key, [...existing, citation]);
  }

  return groups;
}

// ============================================
// Citation Formatting
// ============================================

/**
 * Format citation as inline reference.
 */
export function formatCitationInline(citation: Citation): string {
  return `${citation.label}`;
}

/**
 * Format citation as footnote.
 */
export function formatCitationFootnote(citation: Citation): string {
  const date = new Date(citation.date);
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return `${citation.label} ${citation.vendor} ($${citation.amount.toFixed(2)}) - ${formattedDate}`;
}

/**
 * Format all citations as footnotes.
 */
export function formatCitationsAsFootnotes(citations: Citation[]): string {
  if (citations.length === 0) {
    return '';
  }

  const footnotes = citations.map((c) => formatCitationFootnote(c)).join('\n');

  return `\n\n---\nSources:\n${footnotes}`;
}

// ============================================
// Citation Validation
// ============================================

/**
 * Validate a citation object.
 */
export function isValidCitation(citation: unknown): citation is Citation {
  if (!citation || typeof citation !== 'object') {
    return false;
  }

  const c = citation as Record<string, unknown>;

  return (
    typeof c.transactionId === 'string' &&
    typeof c.relevanceScore === 'number' &&
    typeof c.snippet === 'string' &&
    typeof c.label === 'string' &&
    typeof c.date === 'string' &&
    typeof c.amount === 'number' &&
    typeof c.vendor === 'string'
  );
}

/**
 * Filter to only valid citations.
 */
export function filterValidCitations(citations: unknown[]): Citation[] {
  return citations.filter(isValidCitation);
}

// ============================================
// Transaction ID Extraction
// ============================================

/**
 * Extract transaction IDs from citations.
 */
export function extractTransactionIds(citations: Citation[]): TransactionId[] {
  return citations.map((c) => c.transactionId);
}

/**
 * Find citation by transaction ID.
 */
export function findCitationByTransactionId(
  citations: Citation[],
  transactionId: TransactionId
): Citation | undefined {
  return citations.find((c) => c.transactionId === transactionId);
}
