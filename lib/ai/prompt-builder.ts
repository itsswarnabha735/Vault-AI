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
 * A multi-turn message for the Gemini API.
 */
export interface PromptMessage {
  role: 'user' | 'model';
  text: string;
}

/**
 * Structured prompt that separates system instruction from conversation turns.
 * Maps directly to Gemini API's `system_instruction` + `contents[]` structure,
 * giving the model much better context comprehension than a single text blob.
 */
export interface StructuredPrompt {
  /** System instruction (stable across turns) */
  systemInstruction: string;

  /** Multi-turn conversation contents */
  contents: PromptMessage[];

  /** Flat text fallback for non-structured clients */
  flatText: string;
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
    currency: String(transaction.currency || 'INR'),
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
// Currency Detection
// ============================================

/**
 * Detect the dominant currency from a list of safe transactions.
 *
 * This ensures the prompt uses the ACTUAL currency from the user's data,
 * not a potentially stale or incorrect userPreferences default.
 *
 * @param transactions - Sanitized transactions to inspect
 * @param fallback - Fallback currency (from userPreferences)
 * @returns The most common currency code, or fallback if no transactions
 */
function detectDominantCurrency(
  transactions: SafeTransactionData[],
  fallback: string
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
// System Prompts
// ============================================

/**
 * Base system prompt for the chat assistant.
 */
const SYSTEM_PROMPT = `You are Vault-AI, a helpful personal finance assistant. You help users understand their spending, income, find transactions, and manage their finances.

IMPORTANT GUIDELINES:
1. Be precise with monetary amounts - ALWAYS use the user's configured currency (provided in CONTEXT section) with proper symbol and formatting
2. When referencing transactions, mention the date, vendor, and amount in the user's currency
3. Suggest follow-up questions to help users explore their finances
4. Keep responses concise but informative
5. If you cannot find relevant data, say so clearly and suggest what the user could search for instead
6. Format monetary amounts with the correct currency symbol (e.g., ₹1,23,456.78 for INR, $1,234.56 for USD, €1.234,56 for EUR)
7. When showing multiple transactions, organize them clearly
8. For spending summaries, provide totals and breakdowns when available
9. NEVER assume USD or $ — always use the currency specified in the CONTEXT section

TRANSACTION DATA CONVENTIONS:
- Transactions are labeled as DEBIT (expense/outflow) or CREDIT (income/inflow)
- DEBIT transactions represent money going out: purchases, bills, payments
- CREDIT transactions represent money coming in: salary, refunds, deposits, transfers in
- When a VERIFIED FINANCIAL DATA section is provided, ALWAYS use those pre-computed totals instead of trying to calculate from the transaction list (the list may be a sample)
- Currency symbols in the transaction data reflect the user's actual currency — use them as-is

RESPONSE EXAMPLES (follow this style — adapt currency to match the user's actual currency):

Example 1 — Spending query with verified data (INR):
User: "How much did I spend in January 2026?"
Assistant: "In January 2026, you spent a total of **₹3,24,567.00** across **42 transactions**.

Here's the breakdown by category:
- 🍔 Food & Dining: ₹87,650.00 (12 transactions)
- 🏠 Rent & Utilities: ₹1,20,000.00 (2 transactions)
- 🛒 Groceries: ₹65,432.00 (15 transactions)
- 🚗 Transportation: ₹51,485.00 (13 transactions)

Your largest expense was **₹1,00,000.00** for rent on Jan 1.

Would you like to:
- Compare this to December 2025?
- See a breakdown of your grocery spending?"

Example 2 — Income query:
User: "What was my income this month?"
Assistant: "This month, you received a total of **₹5,20,000.00** in income across **2 transactions**:

1. Jan 15 — CREDIT — Salary Deposit — ₹4,50,000.00
2. Jan 22 — CREDIT — Freelance Payment — ₹70,000.00

Would you like to compare this to last month's income?"

Example 3 — No data found:
User: "How much did I spend at Target?"
Assistant: "I couldn't find any transactions for Target in your records. This could mean:
- The vendor name might be recorded differently (e.g., 'Target Corp' or 'Target.com')
- The transactions haven't been imported yet

Would you like me to search for similar vendor names?"

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
The user is asking about their spending (expenses/debits). Provide:
- Total amount spent from VERIFIED FINANCIAL DATA if available (do NOT recalculate)
- List of relevant DEBIT transactions with dates, vendors, and amounts
- Category breakdown if applicable
- Comparison context if mentioned
- Only include DEBIT (expense) transactions unless explicitly asked otherwise`;

    case 'income_query':
      return `
The user is asking about their income (credits/deposits/earnings). Provide:
- Total income from VERIFIED FINANCIAL DATA if available (do NOT recalculate)
- List of relevant CREDIT transactions with dates, vendors, and amounts
- Category breakdown if applicable
- Only include CREDIT (income) transactions
- If no income transactions are found, clearly state that and suggest the user check if their bank statement has been imported`;

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

  // Determine the effective currency: prefer the dominant currency from
  // actual transaction data over userPreferences (which may be stale).
  const effectiveCurrency = detectDominantCurrency(
    context.transactions,
    context.userPreferences.currency
  );

  const parts: string[] = [];

  // Add system prompt
  parts.push(SYSTEM_PROMPT);

  // Add intent-specific instructions
  parts.push('\n## CURRENT TASK');
  parts.push(getIntentInstructions(context.intent));

  // Add current context
  parts.push('\n## CONTEXT');
  parts.push(`Current Date: ${context.currentDate}`);
  parts.push(`User Currency: ${effectiveCurrency}`);
  parts.push(`User Timezone: ${context.userPreferences.timezone}`);

  // Add verified data if available — pre-computed aggregates the LLM should trust
  if (context.verifiedData) {
    parts.push('\n## VERIFIED FINANCIAL DATA');
    parts.push(
      'IMPORTANT: Use these pre-computed totals in your response. Do NOT recalculate from the transaction list below (it may be a sample).'
    );

    const currency = effectiveCurrency;
    parts.push(
      `Total Expenses (DEBIT): ${formatCurrency(context.verifiedData.totalExpenses, currency)} (${context.verifiedData.expenseCount} transactions)`
    );
    parts.push(
      `Total Income (CREDIT): ${formatCurrency(context.verifiedData.totalIncome, currency)} (${context.verifiedData.incomeCount} transactions)`
    );
    parts.push(
      `Net Flow: ${formatCurrency(context.verifiedData.total, currency)}`
    );
    parts.push(`Total Transactions: ${context.verifiedData.count}`);

    if (context.verifiedData.byCategory) {
      parts.push('\nCategory Breakdown:');
      for (const [category, amount] of Object.entries(
        context.verifiedData.byCategory
      )) {
        parts.push(
          `- ${category}: ${formatCurrency(amount, currency)}`
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
        effectiveCurrency
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
 * Build a structured prompt that separates system instruction from
 * conversation turns. This maps to Gemini's native `system_instruction`
 * + `contents[]` structure for better context comprehension.
 *
 * Falls back to a flat text version for clients that don't support it.
 */
export function buildStructuredPrompt(context: PromptContext): StructuredPrompt {
  verifySafePayload(context.transactions);

  // Determine the effective currency from actual transaction data
  const effectiveCurrency = detectDominantCurrency(
    context.transactions,
    context.userPreferences.currency
  );

  // ── System instruction (stable persona + rules) ────────────────────
  const systemParts: string[] = [SYSTEM_PROMPT];
  systemParts.push('\n## CURRENT TASK');
  systemParts.push(getIntentInstructions(context.intent));
  systemParts.push('\n## CONTEXT');
  systemParts.push(`Current Date: ${context.currentDate}`);
  systemParts.push(`User Currency: ${effectiveCurrency}`);
  systemParts.push(`User Timezone: ${context.userPreferences.timezone}`);

  // Response format instructions belong in the system instruction
  systemParts.push('\n## RESPONSE FORMAT');
  systemParts.push(
    'Provide a clear, helpful response. Include specific transaction references when relevant.'
  );
  systemParts.push(
    'End with 1-2 relevant follow-up questions the user might want to ask.'
  );

  const systemInstruction = systemParts.join('\n');

  // ── Multi-turn contents ────────────────────────────────────────────
  const contents: PromptMessage[] = [];

  // Add conversation history as alternating user/model turns
  if (context.history.length > 0) {
    const recentHistory = context.history.slice(-5);
    for (const msg of recentHistory) {
      const role = msg.role === 'user' ? 'user' : 'model';
      const content =
        msg.content.length > 500
          ? `${msg.content.substring(0, 500)}...`
          : msg.content;
      contents.push({ role: role as 'user' | 'model', text: content });
    }
  }

  // Build the user message with retrieved context + actual question
  const userParts: string[] = [];

  // Verified data
  if (context.verifiedData) {
    userParts.push('## VERIFIED FINANCIAL DATA');
    userParts.push(
      'IMPORTANT: Use these pre-computed totals. Do NOT recalculate from the transaction list.'
    );
    const currency = effectiveCurrency;
    userParts.push(
      `Total Expenses (DEBIT): ${formatCurrency(context.verifiedData.totalExpenses, currency)} (${context.verifiedData.expenseCount} transactions)`
    );
    userParts.push(
      `Total Income (CREDIT): ${formatCurrency(context.verifiedData.totalIncome, currency)} (${context.verifiedData.incomeCount} transactions)`
    );
    userParts.push(
      `Net Flow: ${formatCurrency(context.verifiedData.total, currency)}`
    );
    userParts.push(`Total Transactions: ${context.verifiedData.count}`);

    if (context.verifiedData.byCategory) {
      userParts.push('\nCategory Breakdown:');
      for (const [category, amount] of Object.entries(
        context.verifiedData.byCategory
      )) {
        userParts.push(`- ${category}: ${formatCurrency(amount, currency)}`);
      }
    }
    if (context.verifiedData.period) {
      userParts.push(
        `\nPeriod: ${context.verifiedData.period.start} to ${context.verifiedData.period.end}`
      );
    }
  }

  // Transaction data
  if (context.transactions.length > 0) {
    userParts.push('\n## RELEVANT TRANSACTIONS');
    userParts.push(`Found ${context.transactions.length} transaction(s):`);
    userParts.push(
      formatTransactionsForPrompt(
        context.transactions,
        effectiveCurrency
      )
    );
  } else {
    userParts.push('\n## TRANSACTION DATA');
    userParts.push('No matching transactions found for this query.');
  }

  // The actual user question
  userParts.push(`\n## MY QUESTION\n${context.query}`);

  contents.push({ role: 'user', text: userParts.join('\n') });

  // Also build flat text as fallback
  const flatText = buildSafePrompt(context);

  return { systemInstruction, contents, flatText };
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
 * Uses each transaction's own currency for accurate formatting.
 * The `fallbackCurrency` is only used when a transaction has no currency set.
 */
function formatTransactionsForPrompt(
  transactions: SafeTransactionData[],
  fallbackCurrency: string
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
    // Label each transaction with direction for clear LLM understanding
    const direction = tx.amount < 0 ? 'CREDIT' : 'DEBIT';
    // Use the transaction's own currency — this is the source of truth
    const txCurrency = tx.currency || fallbackCurrency;
    const absAmount = formatCurrency(Math.abs(tx.amount), txCurrency);
    const category = tx.category ? ` [${tx.category}]` : '';
    const note = tx.note ? ` - ${tx.note}` : '';
    lines.push(
      `${tx.date} | ${direction} | ${tx.vendor} | ${absAmount}${category}${note}`
    );
  }

  lines.push('```');

  if (remaining > 0) {
    lines.push(
      `... and ${remaining} more transactions (see VERIFIED FINANCIAL DATA for accurate totals)`
    );
  }

  // Add a sample summary — note this is a SAMPLE, not the full dataset
  const expenses = limited.filter((tx) => tx.amount >= 0);
  const income = limited.filter((tx) => tx.amount < 0);
  lines.push(
    `\nSample summary (${limited.length} of ${transactions.length} shown): ` +
      `${expenses.length} expenses, ${income.length} income transactions`
  );

  return lines.join('\n');
}

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
 * Format currency amount using the correct locale for the currency code.
 * e.g., INR uses en-IN for lakh notation (₹1,23,456.78),
 *       USD uses en-US ($1,234.56).
 */
function formatCurrency(amount: number, currency: string = 'INR'): string {
  try {
    const locale = CURRENCY_LOCALE_MAP[currency] || 'en-US';
    return new Intl.NumberFormat(locale, {
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
  currency: string = 'INR'
): string {
  // Separate income and expense transactions for accurate aggregates
  const expenses = transactions.filter((tx) => tx.amount >= 0);
  const income = transactions.filter((tx) => tx.amount < 0);
  const totalExpenses = expenses.reduce((sum, tx) => sum + tx.amount, 0);
  const totalIncome = income.reduce(
    (sum, tx) => sum + Math.abs(tx.amount),
    0
  );

  const context: PromptContext = {
    query,
    intent: 'spending_query',
    transactions,
    verifiedData: {
      total,
      totalExpenses,
      totalIncome,
      count: transactions.length,
      expenseCount: expenses.length,
      incomeCount: income.length,
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
  currency: string = 'INR'
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
  currency: string = 'INR'
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
