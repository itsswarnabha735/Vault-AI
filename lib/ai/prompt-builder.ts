/**
 * Privacy-Safe Prompt Builder for Vault-AI
 *
 * Constructs LLM prompts using ONLY structured data.
 * CRITICAL: Raw document text and embeddings are NEVER included in prompts.
 *
 * PRIVACY BOUNDARY:
 * This module enforces the privacy boundary between local data and LLM API.
 * All prompts MUST be verified safe before transmission.
 */

import type {
  QueryIntent,
  ChatMessage,
  VerifiedFinancialData,
} from '@/types/ai';
import type { TransactionId } from '@/types/database';

// ============================================
// Types
// ============================================

/**
 * Structured transaction data safe for LLM prompts.
 * NEVER includes rawText, embedding, or file references.
 */
export interface SafeTransactionData {
  /** Transaction ID (for citation) */
  id: TransactionId;

  /** Transaction date */
  date: string;

  /** Transaction amount */
  amount: number;

  /** Vendor/merchant name */
  vendor: string;

  /** Category name (resolved) */
  category: string | null;

  /** Currency code */
  currency: string;

  /** User notes (if any) */
  note: string | null;
}

/**
 * Context for prompt building.
 */
export interface PromptContext {
  /** User's original query */
  query: string;

  /** Classified intent */
  intent: QueryIntent;

  /** Structured transaction data */
  transactions: SafeTransactionData[];

  /** Verified financial data from cloud */
  verifiedData?: VerifiedFinancialData;

  /** Conversation history (limited) */
  history: ChatMessage[];

  /** User preferences */
  userPreferences: {
    currency: string;
    timezone: string;
  };

  /** Current date for context */
  currentDate: string;
}

/**
 * Fields that MUST NEVER appear in prompts.
 * Used for safety verification.
 */
const FORBIDDEN_FIELDS = [
  'rawText',
  'embedding',
  'filePath',
  'fileSize',
  'mimeType',
  'ocrOutput',
  'confidence',
  'queryEmbedding',
] as const;

// ============================================
// Safety Verification
// ============================================

/**
 * Privacy violation error.
 */
export class PrivacyViolationError extends Error {
  constructor(
    message: string,
    public field: string
  ) {
    super(message);
    this.name = 'PrivacyViolationError';
  }
}

/**
 * Verify that a payload is safe for LLM transmission.
 * Throws PrivacyViolationError if unsafe data is detected.
 *
 * @param payload - The payload to verify
 * @throws PrivacyViolationError if unsafe fields are detected
 */
export function verifySafePayload(payload: unknown): void {
  const json = JSON.stringify(payload);

  for (const field of FORBIDDEN_FIELDS) {
    // Check for exact field names in JSON keys
    const fieldPattern = new RegExp(`"${field}"\\s*:`, 'i');
    if (fieldPattern.test(json)) {
      throw new PrivacyViolationError(
        `Privacy violation: payload contains forbidden field '${field}'`,
        field
      );
    }
  }

  // Check for embedding-like patterns (Float32Array serialized)
  if (/\[\s*-?0\.\d+\s*,\s*-?0\.\d+\s*,/.test(json)) {
    throw new PrivacyViolationError(
      'Privacy violation: payload appears to contain embedding vector data',
      'embedding'
    );
  }

  // Check for very long text fields that might be OCR output
  const longTextPattern = /"[^"]{2000,}"/;
  if (longTextPattern.test(json)) {
    throw new PrivacyViolationError(
      'Privacy violation: payload contains suspiciously long text that may be OCR output',
      'rawText'
    );
  }
}

/**
 * Sanitize transaction data for safe LLM transmission.
 * Only includes whitelisted fields.
 *
 * @param transaction - Full transaction object
 * @returns SafeTransactionData
 */
export function sanitizeTransaction(
  transaction: Record<string, unknown>
): SafeTransactionData {
  return {
    id: transaction.id as TransactionId,
    date: String(transaction.date || ''),
    amount: Number(transaction.amount || 0),
    vendor: String(transaction.vendor || 'Unknown'),
    category: transaction.category ? String(transaction.category) : null,
    currency: String(transaction.currency || 'USD'),
    note: transaction.note ? String(transaction.note) : null,
  };
}

/**
 * Sanitize multiple transactions.
 */
export function sanitizeTransactions(
  transactions: Record<string, unknown>[]
): SafeTransactionData[] {
  return transactions.map(sanitizeTransaction);
}

// ============================================
// System Prompts
// ============================================

/**
 * Base system prompt for the chat assistant.
 */
const SYSTEM_PROMPT = `You are Vault-AI, a helpful personal finance assistant. You help users understand their spending, find transactions, and manage their finances.

IMPORTANT GUIDELINES:
1. Be precise with monetary amounts - always include currency symbols and exact values
2. When referencing transactions, mention the date, vendor, and amount
3. Suggest follow-up questions to help users explore their finances
4. Keep responses concise but informative
5. If you cannot find relevant data, say so clearly and suggest what the user could search for instead
6. Format monetary amounts with proper currency symbols (e.g., $1,234.56)
7. When showing multiple transactions, organize them clearly
8. For spending summaries, provide totals and breakdowns when available

PRIVACY NOTE:
You only have access to structured financial data (dates, amounts, vendors, categories).
You do NOT have access to raw receipt images or full document text.
Never ask for or reference sensitive personal information beyond what's provided.`;

/**
 * Get intent-specific instructions.
 */
function getIntentInstructions(intent: QueryIntent): string {
  switch (intent) {
    case 'spending_query':
      return `
The user is asking about their spending. Provide:
- Total amount spent (if calculable from provided data)
- List of relevant transactions with dates, vendors, and amounts
- Category breakdown if applicable
- Comparison context if mentioned`;

    case 'search_query':
      return `
The user is searching for specific transactions or documents. Provide:
- Matching transactions with all relevant details
- Organize results clearly (by date, amount, or relevance)
- If no matches found, suggest alternative search terms`;

    case 'budget_query':
      return `
The user is asking about their budget status. Provide:
- Current spending vs budget limit
- Percentage of budget used
- Remaining amount available
- Recommendations if over or approaching budget`;

    case 'trend_query':
      return `
The user wants to understand spending trends. Provide:
- Pattern observations from the data
- Comparisons between time periods
- Notable changes or anomalies
- Insights about spending behavior`;

    case 'comparison_query':
      return `
The user wants to compare spending periods. Provide:
- Clear comparison of the two periods
- Absolute and percentage differences
- Categories with significant changes
- Context for the changes if apparent`;

    case 'general_query':
    default:
      return `
Provide helpful financial insights based on the available data.
Be informative and suggest relevant follow-up questions.`;
  }
}

// ============================================
// Prompt Building
// ============================================

/**
 * Build a privacy-safe prompt for the LLM.
 *
 * @param context - The prompt context
 * @returns The complete prompt string
 */
export function buildSafePrompt(context: PromptContext): string {
  // Verify safety before building
  verifySafePayload(context.transactions);

  const parts: string[] = [];

  // Add system prompt
  parts.push(SYSTEM_PROMPT);

  // Add intent-specific instructions
  parts.push('\n## CURRENT TASK');
  parts.push(getIntentInstructions(context.intent));

  // Add current context
  parts.push('\n## CONTEXT');
  parts.push(`Current Date: ${context.currentDate}`);
  parts.push(`User Currency: ${context.userPreferences.currency}`);
  parts.push(`User Timezone: ${context.userPreferences.timezone}`);

  // Add verified data if available
  if (context.verifiedData) {
    parts.push('\n## VERIFIED FINANCIAL DATA');
    parts.push(
      `Total Amount: ${formatCurrency(context.verifiedData.total, context.userPreferences.currency)}`
    );
    parts.push(`Transaction Count: ${context.verifiedData.count}`);

    if (context.verifiedData.byCategory) {
      parts.push('\nCategory Breakdown:');
      for (const [category, amount] of Object.entries(
        context.verifiedData.byCategory
      )) {
        parts.push(
          `- ${category}: ${formatCurrency(amount, context.userPreferences.currency)}`
        );
      }
    }

    if (context.verifiedData.period) {
      parts.push(
        `\nPeriod: ${context.verifiedData.period.start} to ${context.verifiedData.period.end}`
      );
    }
  }

  // Add transaction data
  if (context.transactions.length > 0) {
    parts.push('\n## RELEVANT TRANSACTIONS');
    parts.push(`Found ${context.transactions.length} transaction(s):`);
    parts.push(
      formatTransactionsForPrompt(
        context.transactions,
        context.userPreferences.currency
      )
    );
  } else {
    parts.push('\n## TRANSACTION DATA');
    parts.push('No matching transactions found for this query.');
  }

  // Add conversation history (limited)
  if (context.history.length > 0) {
    parts.push('\n## CONVERSATION HISTORY');
    const recentHistory = context.history.slice(-5);
    for (const msg of recentHistory) {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      // Truncate long messages
      const content =
        msg.content.length > 200
          ? `${msg.content.substring(0, 200)}...`
          : msg.content;
      parts.push(`${role}: ${content}`);
    }
  }

  // Add the current query
  parts.push('\n## USER QUESTION');
  parts.push(context.query);

  // Add response guidelines
  parts.push('\n## RESPONSE FORMAT');
  parts.push(
    'Provide a clear, helpful response. Include specific transaction references when relevant.'
  );
  parts.push(
    'End with 1-2 relevant follow-up questions the user might want to ask.'
  );

  return parts.join('\n');
}

/**
 * Build a prompt for generating follow-up suggestions.
 */
export function buildFollowupPrompt(
  query: string,
  response: string,
  intent: QueryIntent
): string {
  return `Based on this financial query and response, suggest 3 relevant follow-up questions the user might want to ask.

User Query: ${query}
Response Summary: ${response.substring(0, 300)}
Query Type: ${intent}

Requirements:
1. Questions should be specific and actionable
2. Questions should relate to the current topic
3. Questions should help the user gain more financial insights
4. Format as a simple numbered list

Suggested follow-up questions:`;
}

// ============================================
// Formatting Helpers
// ============================================

/**
 * Format transactions for inclusion in prompt.
 */
function formatTransactionsForPrompt(
  transactions: SafeTransactionData[],
  currency: string
): string {
  if (transactions.length === 0) {
    return 'No transactions to display.';
  }

  // Limit to 20 transactions to keep prompt size reasonable
  const limited = transactions.slice(0, 20);
  const remaining = transactions.length - limited.length;

  const lines: string[] = [];
  lines.push('```');

  for (const tx of limited) {
    const amount = formatCurrency(tx.amount, currency);
    const category = tx.category ? ` [${tx.category}]` : '';
    const note = tx.note ? ` - ${tx.note}` : '';
    lines.push(`${tx.date} | ${tx.vendor} | ${amount}${category}${note}`);
  }

  lines.push('```');

  if (remaining > 0) {
    lines.push(`... and ${remaining} more transactions`);
  }

  // Add summary
  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  lines.push(
    `\nTotal: ${formatCurrency(total, currency)} across ${transactions.length} transactions`
  );

  return lines.join('\n');
}

/**
 * Format currency amount.
 */
function formatCurrency(amount: number, currency: string = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Format conversation history for prompt.
 */
export function formatHistory(
  history: ChatMessage[],
  maxMessages: number = 5
): string {
  const recent = history.slice(-maxMessages);

  if (recent.length === 0) {
    return 'No previous conversation.';
  }

  return recent
    .map((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      const content =
        msg.content.length > 150
          ? `${msg.content.substring(0, 150)}...`
          : msg.content;
      return `${role}: ${content}`;
    })
    .join('\n');
}

// ============================================
// Template Builders for Specific Intents
// ============================================

/**
 * Build a spending query prompt.
 */
export function buildSpendingQueryPrompt(
  query: string,
  transactions: SafeTransactionData[],
  total: number,
  currency: string = 'USD'
): string {
  const context: PromptContext = {
    query,
    intent: 'spending_query',
    transactions,
    verifiedData: {
      total,
      count: transactions.length,
    },
    history: [],
    userPreferences: { currency, timezone: 'UTC' },
    currentDate: new Date().toISOString().split('T')[0]!,
  };

  return buildSafePrompt(context);
}

/**
 * Build a budget query prompt.
 */
export function buildBudgetQueryPrompt(
  query: string,
  budgetData: {
    categoryName: string;
    budgetAmount: number;
    spentAmount: number;
    remainingAmount: number;
    percentUsed: number;
  },
  recentTransactions: SafeTransactionData[],
  currency: string = 'USD'
): string {
  const parts: string[] = [];

  parts.push(SYSTEM_PROMPT);
  parts.push('\n## CURRENT TASK');
  parts.push(getIntentInstructions('budget_query'));

  parts.push('\n## BUDGET STATUS');
  parts.push(`Category: ${budgetData.categoryName}`);
  parts.push(
    `Budget Limit: ${formatCurrency(budgetData.budgetAmount, currency)}`
  );
  parts.push(
    `Amount Spent: ${formatCurrency(budgetData.spentAmount, currency)}`
  );
  parts.push(
    `Remaining: ${formatCurrency(budgetData.remainingAmount, currency)}`
  );
  parts.push(`Progress: ${budgetData.percentUsed.toFixed(1)}% used`);

  if (recentTransactions.length > 0) {
    parts.push('\n## RECENT TRANSACTIONS IN THIS CATEGORY');
    parts.push(formatTransactionsForPrompt(recentTransactions, currency));
  }

  parts.push('\n## USER QUESTION');
  parts.push(query);

  // Verify safety
  verifySafePayload({ budgetData, recentTransactions });

  return parts.join('\n');
}

/**
 * Build a comparison query prompt.
 */
export function buildComparisonQueryPrompt(
  query: string,
  period1: {
    name: string;
    total: number;
    transactions: SafeTransactionData[];
  },
  period2: {
    name: string;
    total: number;
    transactions: SafeTransactionData[];
  },
  currency: string = 'USD'
): string {
  const parts: string[] = [];

  parts.push(SYSTEM_PROMPT);
  parts.push('\n## CURRENT TASK');
  parts.push(getIntentInstructions('comparison_query'));

  parts.push('\n## PERIOD COMPARISON');

  parts.push(`\n### ${period1.name}`);
  parts.push(`Total: ${formatCurrency(period1.total, currency)}`);
  parts.push(`Transactions: ${period1.transactions.length}`);

  parts.push(`\n### ${period2.name}`);
  parts.push(`Total: ${formatCurrency(period2.total, currency)}`);
  parts.push(`Transactions: ${period2.transactions.length}`);

  const difference = period1.total - period2.total;
  const percentChange =
    period2.total !== 0 ? (difference / period2.total) * 100 : 0;

  parts.push('\n### Comparison');
  parts.push(
    `Difference: ${formatCurrency(difference, currency)} (${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(1)}%)`
  );

  parts.push('\n## USER QUESTION');
  parts.push(query);

  // Verify safety
  verifySafePayload({ period1, period2 });

  return parts.join('\n');
}

// ============================================
// Exports
// ============================================

export { formatCurrency, formatTransactionsForPrompt };
