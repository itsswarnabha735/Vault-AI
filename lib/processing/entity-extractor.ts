/**
 * Entity Extractor for Vault-AI
 *
 * Extracts structured financial entities from document text using
 * a hybrid approach of regex patterns, heuristics, and context-aware
 * confidence scoring.
 *
 * Extracts:
 * - Dates (various formats with validation)
 * - Monetary amounts (with currency detection)
 * - Vendor/merchant names (with confidence)
 * - Currency information
 *
 * PRIVACY: All entity extraction happens locally in the browser.
 * No document content is ever transmitted to external servers.
 */

import type { ExtractedEntities, ExtractedField } from '@/types/ai';

// ============================================
// Types
// ============================================

/**
 * Options for entity extraction.
 */
export interface EntityExtractionOptions {
  /** Default currency code if not detected */
  defaultCurrency?: string;

  /** Timezone for date parsing */
  timezone?: string;

  /** Whether to extract all amounts or just the likely total */
  extractAllAmounts?: boolean;

  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;

  /** Maximum date (default: today) */
  maxDate?: Date;

  /** Minimum date (default: 10 years ago) */
  minDate?: Date;

  /** Amount range for sanity checks */
  amountRange?: {
    min: number;
    max: number;
  };

  /** Prefer total amounts over individual line items */
  preferTotalAmounts?: boolean;
}

/**
 * Internal match result from regex patterns.
 */
interface PatternMatch {
  value: string;
  index: number;
  confidence: number;
  context?: string;
  pattern?: string;
}

/**
 * Date pattern configuration with metadata.
 */
interface DatePattern {
  regex: RegExp;
  format: string;
  baseConfidence: number;
  parser: (
    match: RegExpMatchArray
  ) => { year: number; month: number; day: number } | null;
}

/**
 * Amount pattern configuration with metadata.
 */
interface AmountPattern {
  regex: RegExp;
  description: string;
  baseConfidence: number;
  isTotalIndicator: boolean;
  extractor: (match: RegExpMatchArray) => number;
}

/**
 * Vendor pattern configuration with metadata.
 */
interface VendorPattern {
  regex: RegExp;
  description: string;
  baseConfidence: number;
  extractor: (match: RegExpMatchArray) => string;
}

// ============================================
// Constants - Date Patterns
// ============================================

/**
 * Month name to number mapping.
 */
const MONTH_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/**
 * Context keywords that boost date confidence.
 */
const DATE_CONTEXT_KEYWORDS = [
  'date',
  'invoice date',
  'transaction date',
  'purchase date',
  'order date',
  'bill date',
  'statement date',
  'due date',
  'payment date',
  'receipt date',
  'issued',
  'created',
  'processed',
];

/**
 * Date patterns in order of specificity with parsers.
 */
const DATE_PATTERNS: DatePattern[] = [
  // ISO format: 2024-01-15 (highest confidence)
  {
    regex: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g,
    format: 'YYYY-MM-DD',
    baseConfidence: 0.95,
    parser: (m) => ({
      year: parseInt(m[1] ?? '0', 10),
      month: parseInt(m[2] ?? '0', 10),
      day: parseInt(m[3] ?? '0', 10),
    }),
  },
  // YYYY/MM/DD format: 2024/01/15
  {
    regex: /\b(\d{4})\/(\d{1,2})\/(\d{1,2})\b/g,
    format: 'YYYY/MM/DD',
    baseConfidence: 0.93,
    parser: (m) => ({
      year: parseInt(m[1] ?? '0', 10),
      month: parseInt(m[2] ?? '0', 10),
      day: parseInt(m[3] ?? '0', 10),
    }),
  },
  // Written format: January 15, 2024 or Jan 15, 2024
  {
    regex:
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi,
    format: 'Month DD, YYYY',
    baseConfidence: 0.92,
    parser: (m) => {
      const month = MONTH_MAP[m[1]?.toLowerCase() ?? ''];
      if (!month) {
        return null;
      }
      return {
        year: parseInt(m[3] ?? '0', 10),
        month,
        day: parseInt(m[2] ?? '0', 10),
      };
    },
  },
  // Compact written: 15 Jan 2024 or 15-Jan-2024
  {
    regex:
      /\b(\d{1,2})[\s\-](Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s\-](\d{4})\b/gi,
    format: 'DD Month YYYY',
    baseConfidence: 0.9,
    parser: (m) => {
      const month = MONTH_MAP[m[2]?.toLowerCase() ?? ''];
      if (!month) {
        return null;
      }
      return {
        year: parseInt(m[3] ?? '0', 10),
        month,
        day: parseInt(m[1] ?? '0', 10),
      };
    },
  },
  // US format: MM/DD/YYYY or M/D/YY
  {
    regex: /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g,
    format: 'MM/DD/YYYY',
    baseConfidence: 0.78,
    parser: (m) => {
      const month = parseInt(m[1] ?? '0', 10);
      const day = parseInt(m[2] ?? '0', 10);
      let year = parseInt(m[3] ?? '0', 10);
      if (year < 100) {
        year = year > 50 ? 1900 + year : 2000 + year;
      }
      return { year, month, day };
    },
  },
  // US format with dashes: MM-DD-YYYY
  {
    regex: /\b(\d{1,2})-(\d{1,2})-(\d{4})\b/g,
    format: 'MM-DD-YYYY',
    baseConfidence: 0.75,
    parser: (m) => ({
      year: parseInt(m[3] ?? '0', 10),
      month: parseInt(m[1] ?? '0', 10),
      day: parseInt(m[2] ?? '0', 10),
    }),
  },
  // European format: DD/MM/YYYY (lower confidence as ambiguous with US)
  {
    regex: /\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g,
    format: 'DD.MM.YYYY',
    baseConfidence: 0.72,
    parser: (m) => {
      let year = parseInt(m[3] ?? '0', 10);
      if (year < 100) {
        year = year > 50 ? 1900 + year : 2000 + year;
      }
      return {
        year,
        month: parseInt(m[2] ?? '0', 10),
        day: parseInt(m[1] ?? '0', 10),
      };
    },
  },
];

// ============================================
// Constants - Amount Patterns
// ============================================

/**
 * Context keywords that indicate total amounts.
 */
const TOTAL_AMOUNT_KEYWORDS = [
  'total',
  'grand total',
  'amount due',
  'balance due',
  'total due',
  'net amount',
  'final total',
  'payment amount',
  'amount paid',
  'total amount',
  'sum',
];

/**
 * Context keywords that indicate subtotals or line items.
 */
const SUBTOTAL_KEYWORDS = [
  'subtotal',
  'sub-total',
  'sub total',
  'tax',
  'discount',
  'shipping',
  'fee',
  'tip',
  'gratuity',
];

/**
 * Amount patterns with metadata.
 */
const AMOUNT_PATTERNS: AmountPattern[] = [
  // Grand total with keyword (highest confidence)
  {
    regex:
      /(?:Grand\s*Total|Total\s*Amount|Amount\s*Due|Balance\s*Due|Total\s*Due|Net\s*Amount|Final\s*Total|Payment\s*Amount)(?:\s*:|\s+is)?\s*\$?\s*([\d,]+\.?\d*)/gi,
    description: 'Total keyword',
    baseConfidence: 0.98,
    isTotalIndicator: true,
    extractor: (m) => parseFloat((m[1] ?? '0').replace(/,/g, '')),
  },
  // Simple total
  {
    regex: /\bTotal(?:\s*:|\s+is)?\s*\$?\s*([\d,]+\.?\d*)/gi,
    description: 'Total',
    baseConfidence: 0.95,
    isTotalIndicator: true,
    extractor: (m) => parseFloat((m[1] ?? '0').replace(/,/g, '')),
  },
  // Amount due, paid, balance
  {
    regex:
      /(?:Amount|Due|Paid|Balance)(?:\s*:|\s+is)?\s*\$?\s*([\d,]+\.?\d*)/gi,
    description: 'Amount keyword',
    baseConfidence: 0.88,
    isTotalIndicator: false,
    extractor: (m) => parseFloat((m[1] ?? '0').replace(/,/g, '')),
  },
  // Dollar sign with amount: $1,234.56
  {
    regex: /\$\s*([\d,]+(?:\.\d{1,2})?)/g,
    description: 'Dollar sign',
    baseConfidence: 0.85,
    isTotalIndicator: false,
    extractor: (m) => parseFloat((m[1] ?? '0').replace(/,/g, '')),
  },
  // Currency code prefix: USD 1,234.56
  {
    regex: /\b(USD|EUR|GBP|CAD|AUD)\s*([\d,]+(?:\.\d{1,2})?)/gi,
    description: 'Currency code prefix',
    baseConfidence: 0.83,
    isTotalIndicator: false,
    extractor: (m) => parseFloat((m[2] ?? '0').replace(/,/g, '')),
  },
  // Amount with currency suffix: 1,234.56 USD
  {
    regex: /([\d,]+(?:\.\d{1,2})?)\s*(USD|EUR|GBP|dollars?|euros?)/gi,
    description: 'Currency code suffix',
    baseConfidence: 0.82,
    isTotalIndicator: false,
    extractor: (m) => parseFloat((m[1] ?? '0').replace(/,/g, '')),
  },
  // Euro amounts: €1,234.56 or 1.234,56 € or €55.78
  {
    regex: /€\s*([\d.,]+)/g,
    description: 'Euro sign',
    baseConfidence: 0.85,
    isTotalIndicator: false,
    extractor: (m) => {
      const val = m[1] ?? '0';
      // Detect format: if comma is after dot, it's European format (1.234,56)
      // If dot is last (or no comma), it's US format (1,234.56 or 55.78)
      const lastDot = val.lastIndexOf('.');
      const lastComma = val.lastIndexOf(',');

      if (lastComma > lastDot) {
        // European format: 1.234,56 → dots are thousands, comma is decimal
        return parseFloat(val.replace(/\./g, '').replace(',', '.'));
      } else {
        // US format: 1,234.56 or 55.78 → commas are thousands, dot is decimal
        return parseFloat(val.replace(/,/g, ''));
      }
    },
  },
  // Pound amounts: £1,234.56
  {
    regex: /£\s*([\d,]+(?:\.\d{1,2})?)/g,
    description: 'Pound sign',
    baseConfidence: 0.85,
    isTotalIndicator: false,
    extractor: (m) => parseFloat((m[1] ?? '0').replace(/,/g, '')),
  },
  // Plain decimal amount (lowest confidence)
  {
    regex: /\b(\d{1,3}(?:,\d{3})*(?:\.\d{2}))\b/g,
    description: 'Plain decimal',
    baseConfidence: 0.55,
    isTotalIndicator: false,
    extractor: (m) => parseFloat((m[1] ?? '0').replace(/,/g, '')),
  },
];

// ============================================
// Constants - Vendor Patterns
// ============================================

/**
 * Vendor patterns with metadata.
 */
const VENDOR_PATTERNS: VendorPattern[] = [
  // Explicit vendor keywords (highest confidence)
  {
    regex:
      /(?:From|Merchant|Vendor|Seller|Payee|Billed\s+by|Bill\s+from|Paid\s+to)(?:\s*:)?\s+([A-Z][A-Za-z0-9\s&'.,-]+?)(?:\n|$|\.)/gi,
    description: 'Vendor keyword',
    baseConfidence: 0.92,
    extractor: (m) => m[1] ?? '',
  },
  // Store/Shop keywords
  {
    regex:
      /(?:Store|Shop|Company|Business)(?:\s*:|\s+Name:?)?\s+([A-Z][A-Za-z0-9\s&'.,-]+?)(?:\n|$|\.)/gi,
    description: 'Store keyword',
    baseConfidence: 0.88,
    extractor: (m) => m[1] ?? '',
  },
  // Corporate suffix patterns: Inc, LLC, Corp, Ltd
  {
    regex:
      /([A-Z][A-Za-z0-9\s&'.,-]+\s+(?:Inc\.?|LLC|L\.L\.C\.?|Corp\.?|Corporation|Ltd\.?|Limited|Company|Co\.?|PLC))\b/gi,
    description: 'Corporate suffix',
    baseConfidence: 0.85,
    extractor: (m) => m[1] ?? '',
  },
  // Thank you pattern
  {
    regex:
      /(?:Thank you for (?:shopping|visiting|dining|choosing) (?:at\s+)?)([\w\s&']+?)(?:!|\.|\n|$)/gi,
    description: 'Thank you pattern',
    baseConfidence: 0.82,
    extractor: (m) => m[1] ?? '',
  },
  // Website-based extraction
  {
    regex:
      /(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]+[a-zA-Z0-9])\.(?:com|org|net|io|co|shop|store)\b/gi,
    description: 'Website',
    baseConfidence: 0.75,
    extractor: (m) => {
      // Convert domain to title case
      const domain = m[1] ?? '';
      return domain.charAt(0).toUpperCase() + domain.slice(1).toLowerCase();
    },
  },
];

/**
 * Words to exclude from vendor names.
 */
const VENDOR_EXCLUDE_WORDS = new Set([
  'receipt',
  'invoice',
  'order',
  'confirmation',
  'statement',
  'bill',
  'tax',
  'total',
  'subtotal',
  'payment',
  'transaction',
  'date',
  'time',
  'thank',
  'you',
  'welcome',
  'customer',
  'copy',
]);

// ============================================
// Constants - Currency
// ============================================

/**
 * Currency symbols and codes.
 */
const CURRENCY_MAP: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  '₩': 'KRW',
  '₽': 'RUB',
  CHF: 'CHF',
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  JPY: 'JPY',
  CAD: 'CAD',
  AUD: 'AUD',
  INR: 'INR',
  CNY: 'CNY',
  NZD: 'NZD',
  SGD: 'SGD',
  HKD: 'HKD',
};

// ============================================
// Confidence Calculation
// ============================================

/**
 * Calculate confidence with context adjustment.
 */
function calculateConfidence(
  baseConfidence: number,
  text: string,
  matchIndex: number,
  contextKeywords: string[],
  options: {
    positionBoost?: boolean;
    contextRadius?: number;
  } = {}
): number {
  const { positionBoost = true, contextRadius = 50 } = options;

  let confidence = baseConfidence;

  // Get surrounding context
  const contextStart = Math.max(0, matchIndex - contextRadius);
  const contextEnd = Math.min(text.length, matchIndex + contextRadius);
  const context = text.slice(contextStart, contextEnd).toLowerCase();

  // Boost confidence if near relevant keywords
  for (const keyword of contextKeywords) {
    if (context.includes(keyword.toLowerCase())) {
      confidence = Math.min(1, confidence + 0.05);
      break; // Only one boost for context
    }
  }

  // Boost confidence for matches in header/first 20% of document
  if (positionBoost && matchIndex < text.length * 0.2) {
    confidence = Math.min(1, confidence + 0.03);
  }

  return Math.round(confidence * 100) / 100;
}

// ============================================
// EntityExtractor Class
// ============================================

/**
 * Entity extraction service.
 */
class EntityExtractorService {
  /**
   * Extract all entities from text.
   */
  extractEntities(
    text: string,
    options: EntityExtractionOptions = {}
  ): ExtractedEntities {
    const {
      defaultCurrency = 'USD',
      extractAllAmounts = true,
      minConfidence = 0.3,
      maxDate = new Date(),
      minDate = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000), // 10 years ago
      amountRange = { min: 0.01, max: 1000000 },
      preferTotalAmounts = true,
    } = options;

    // Extract all dates with validation
    const allDates = this.extractDates(text, { minDate, maxDate });

    // Extract all amounts with validation
    const allAmounts = this.extractAmounts(text, { amountRange });

    // Extract vendor
    const vendor = this.extractVendor(text);

    // Detect currency
    const currency = this.detectCurrency(text) || defaultCurrency;

    // Generate description
    const description = this.generateDescription(text);

    // Select best date (prefer higher confidence, then more recent)
    const date = this.selectBestDate(allDates, minConfidence);

    // Select best amount (prefer totals, then confidence, then value)
    const amount = this.selectBestAmount(
      allAmounts,
      minConfidence,
      preferTotalAmounts
    );

    return {
      date,
      amount,
      vendor,
      description,
      currency,
      allAmounts: extractAllAmounts ? allAmounts : [],
      allDates,
    };
  }

  /**
   * Extract dates from text with enhanced patterns.
   */
  extractDates(
    text: string,
    options: { minDate?: Date; maxDate?: Date } = {}
  ): ExtractedField<string>[] {
    const { minDate, maxDate = new Date() } = options;
    const dates: ExtractedField<string>[] = [];
    const seenDates = new Set<string>();

    for (const pattern of DATE_PATTERNS) {
      // Reset regex state
      pattern.regex.lastIndex = 0;

      for (const match of text.matchAll(pattern.regex)) {
        const parsed = pattern.parser(match);
        if (!parsed) {
          continue;
        }

        const { year, month, day } = parsed;
        const dateStr = this.normalizeDate(year, month, day);

        if (!dateStr || seenDates.has(dateStr)) {
          continue;
        }

        // Validate date range
        const dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) {
          continue;
        }
        if (dateObj > maxDate) {
          continue;
        } // Not in future
        if (minDate && dateObj < minDate) {
          continue;
        } // Not too old

        seenDates.add(dateStr);

        // Calculate confidence with context
        const confidence = calculateConfidence(
          pattern.baseConfidence,
          text,
          match.index ?? 0,
          DATE_CONTEXT_KEYWORDS
        );

        dates.push({
          value: dateStr,
          confidence,
          source: match[0],
          position: {
            start: match.index ?? 0,
            end: (match.index ?? 0) + match[0].length,
          },
        });
      }
    }

    // Sort by confidence descending
    return dates.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Extract monetary amounts from text with enhanced patterns.
   */
  extractAmounts(
    text: string,
    options: { amountRange?: { min: number; max: number } } = {}
  ): ExtractedField<number>[] {
    const { amountRange = { min: 0.01, max: 1000000 } } = options;
    const amounts: ExtractedField<number>[] = [];
    const seenAmounts = new Map<number, ExtractedField<number>>();

    for (const pattern of AMOUNT_PATTERNS) {
      // Reset regex state
      pattern.regex.lastIndex = 0;

      for (const match of text.matchAll(pattern.regex)) {
        const amount = pattern.extractor(match);

        // Validate amount
        if (isNaN(amount) || amount <= 0) {
          continue;
        }
        if (amount < amountRange.min || amount > amountRange.max) {
          continue;
        }

        // Round to 2 decimal places
        const roundedAmount = Math.round(amount * 100) / 100;

        // Calculate confidence with context
        let confidence = calculateConfidence(
          pattern.baseConfidence,
          text,
          match.index ?? 0,
          TOTAL_AMOUNT_KEYWORDS
        );

        // Check if this is near subtotal keywords (reduce confidence)
        const context = text
          .slice(Math.max(0, (match.index ?? 0) - 30), match.index ?? 0)
          .toLowerCase();

        const isSubtotal = SUBTOTAL_KEYWORDS.some((kw) => context.includes(kw));
        if (isSubtotal) {
          confidence = Math.max(0.3, confidence - 0.15);
        }

        // Mark if this is a total indicator
        const isTotalIndicator = pattern.isTotalIndicator;

        // Check if we already have this amount
        const existing = seenAmounts.get(roundedAmount);
        if (existing) {
          // Keep the one with higher confidence
          if (confidence > existing.confidence) {
            seenAmounts.set(roundedAmount, {
              value: roundedAmount,
              confidence,
              source: match[0],
              position: {
                start: match.index ?? 0,
                end: (match.index ?? 0) + match[0].length,
              },
            });
          }
        } else {
          seenAmounts.set(roundedAmount, {
            value: roundedAmount,
            confidence: isTotalIndicator
              ? Math.min(1, confidence + 0.05)
              : confidence,
            source: match[0],
            position: {
              start: match.index ?? 0,
              end: (match.index ?? 0) + match[0].length,
            },
          });
        }
      }
    }

    // Convert to array and sort
    for (const entry of seenAmounts.values()) {
      amounts.push(entry);
    }

    return amounts.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Extract vendor/merchant name from text with enhanced patterns.
   */
  extractVendor(text: string): ExtractedField<string> | null {
    const candidates: PatternMatch[] = [];

    // Try each vendor pattern
    for (const pattern of VENDOR_PATTERNS) {
      pattern.regex.lastIndex = 0;

      for (const match of text.matchAll(pattern.regex)) {
        const rawVendor = pattern.extractor(match);
        const vendor = this.cleanVendorName(rawVendor);

        if (!vendor || vendor.length < 2 || vendor.length > 50) {
          continue;
        }
        if (this.isExcludedVendorName(vendor)) {
          continue;
        }

        candidates.push({
          value: vendor,
          index: match.index ?? 0,
          confidence: pattern.baseConfidence,
          context: pattern.description,
          pattern: pattern.description,
        });
      }
    }

    // Check for all-caps company names in first 10 lines
    const lines = text.split('\n').slice(0, 10);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) {
        continue;
      }

      // All caps pattern
      if (
        line === line.toUpperCase() &&
        line.length >= 3 &&
        line.length <= 40 &&
        /^[A-Z][A-Z0-9\s&'.,-]+$/.test(line) &&
        !this.isExcludedVendorName(line)
      ) {
        // Higher confidence for first line
        const confidence = i === 0 ? 0.78 : 0.68;
        candidates.push({
          value: this.cleanVendorName(line),
          index: i,
          confidence,
          context: 'allcaps',
          pattern: 'All caps line',
        });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Sort by confidence, then by position (earlier is better)
    candidates.sort((a, b) => {
      if (Math.abs(a.confidence - b.confidence) > 0.05) {
        return b.confidence - a.confidence;
      }
      return a.index - b.index;
    });

    const best = candidates[0];
    if (!best) {
      return null;
    }

    return {
      value: best.value,
      confidence: best.confidence,
      source: best.pattern,
    };
  }

  /**
   * Detect currency from text.
   */
  detectCurrency(text: string): string | null {
    // Check for explicit currency codes first
    const currencyMatch = text.match(
      /\b(USD|EUR|GBP|CAD|AUD|JPY|CNY|INR|CHF|NZD|SGD|HKD)\b/i
    );
    if (currencyMatch) {
      return CURRENCY_MAP[currencyMatch[1]?.toUpperCase() ?? ''] || null;
    }

    // Check for currency symbols (count occurrences)
    const symbolCounts: Record<string, number> = {};
    const symbols = ['$', '€', '£', '¥', '₹', '₩', '₽'];

    for (const sym of symbols) {
      const count = (text.match(new RegExp(`\\${sym}`, 'g')) || []).length;
      if (count > 0) {
        symbolCounts[sym] = count;
      }
    }

    // Return the most common currency symbol
    let maxSymbol = '';
    let maxCount = 0;
    for (const [sym, count] of Object.entries(symbolCounts)) {
      if (count > maxCount) {
        maxCount = count;
        maxSymbol = sym;
      }
    }

    return maxSymbol ? CURRENCY_MAP[maxSymbol] || null : null;
  }

  /**
   * Generate a description from the text.
   */
  generateDescription(text: string): string {
    // Get meaningful lines (not too short, not too long)
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => {
        if (l.length < 5 || l.length > 100) {
          return false;
        }
        // Skip lines that are just numbers or symbols
        if (/^[\d\s.,\-$€£¥]+$/.test(l)) {
          return false;
        }
        // Skip common receipt keywords
        if (
          /^(Total|Subtotal|Tax|Tip|Change|Cash|Credit|Debit|Card|Date|Time|Receipt|Invoice)/i.test(
            l
          )
        ) {
          return false;
        }
        return true;
      });

    // Build description from first meaningful lines
    let description = '';
    for (const line of lines.slice(0, 4)) {
      if (description.length + line.length > 200) {
        break;
      }
      description += (description ? ' | ' : '') + line;
    }

    return description || 'No description available';
  }

  /**
   * Select the best date from candidates.
   */
  private selectBestDate(
    dates: ExtractedField<string>[],
    minConfidence: number
  ): ExtractedField<string> | null {
    const validDates = dates.filter((d) => d.confidence >= minConfidence);

    if (validDates.length === 0) {
      return null;
    }

    // Already sorted by confidence, so take the first
    // If confidences are similar, prefer more recent dates
    if (validDates.length > 1) {
      const top = validDates.slice(0, 3);
      top.sort((a, b) => {
        if (Math.abs(a.confidence - b.confidence) > 0.1) {
          return b.confidence - a.confidence;
        }
        // Prefer more recent dates
        return b.value.localeCompare(a.value);
      });
      return top[0] ?? null;
    }

    return validDates[0] ?? null;
  }

  /**
   * Select the best amount from candidates.
   */
  private selectBestAmount(
    amounts: ExtractedField<number>[],
    minConfidence: number,
    preferTotals: boolean
  ): ExtractedField<number> | null {
    const validAmounts = amounts.filter((a) => a.confidence >= minConfidence);

    if (validAmounts.length === 0) {
      return null;
    }

    if (preferTotals) {
      // Find amounts that are likely totals (highest confidence with total keyword)
      const totals = validAmounts.filter(
        (a) => a.source && /total/i.test(a.source)
      );

      if (totals.length > 0) {
        // Return the highest total
        return totals.sort((a, b) => b.value - a.value)[0] ?? null;
      }
    }

    // Fall back to highest confidence, then highest value
    validAmounts.sort((a, b) => {
      if (Math.abs(a.confidence - b.confidence) > 0.1) {
        return b.confidence - a.confidence;
      }
      return b.value - a.value;
    });

    return validAmounts[0] ?? null;
  }

  /**
   * Normalize date to ISO format.
   */
  private normalizeDate(
    year: number,
    month: number,
    day: number
  ): string | null {
    // Validate ranges
    if (year < 1900 || year > 2100) {
      return null;
    }
    if (month < 1 || month > 12) {
      return null;
    }
    if (day < 1 || day > 31) {
      return null;
    }

    // Check for valid day in month
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) {
      return null;
    }

    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  /**
   * Clean up vendor name.
   */
  private cleanVendorName(name: string): string {
    return (
      name
        .trim()
        // Remove multiple spaces
        .replace(/\s+/g, ' ')
        // Remove trailing punctuation
        .replace(/[,.;:!]+$/, '')
        // Remove leading keywords
        .replace(
          /^(From|Merchant|Vendor|Store|Shop|Company|Seller|Payee):?\s*/i,
          ''
        )
        // Remove # and following numbers at end (store numbers)
        .replace(/\s*#?\d{1,6}$/, '')
        // Clean up
        .trim()
    );
  }

  /**
   * Check if a vendor name should be excluded.
   */
  private isExcludedVendorName(name: string): boolean {
    const lower = name.toLowerCase();

    // Check against exclude list
    for (const word of VENDOR_EXCLUDE_WORDS) {
      if (
        lower === word ||
        lower.startsWith(`${word} `) ||
        lower.endsWith(` ${word}`)
      ) {
        return true;
      }
    }

    // Exclude if it's mostly numbers
    if (/^\d[\d\s\-\/]+$/.test(name)) {
      return true;
    }

    // Exclude very short names
    if (name.length < 2) {
      return true;
    }

    return false;
  }
}

// ============================================
// Singleton Export
// ============================================

/**
 * Singleton instance of the entity extractor.
 */
export const entityExtractor = new EntityExtractorService();

/**
 * Convenience function to extract entities from text.
 */
export function extractEntities(
  text: string,
  options?: EntityExtractionOptions
): ExtractedEntities {
  return entityExtractor.extractEntities(text, options);
}

/**
 * Convenience function to extract dates only.
 */
export function extractDates(
  text: string,
  options?: { minDate?: Date; maxDate?: Date }
): ExtractedField<string>[] {
  return entityExtractor.extractDates(text, options);
}

/**
 * Convenience function to extract amounts only.
 */
export function extractAmounts(
  text: string,
  options?: { amountRange?: { min: number; max: number } }
): ExtractedField<number>[] {
  return entityExtractor.extractAmounts(text, options);
}

/**
 * Convenience function to extract vendor only.
 */
export function extractVendor(text: string): ExtractedField<string> | null {
  return entityExtractor.extractVendor(text);
}

// Re-export types
export type { PatternMatch, DatePattern, AmountPattern, VendorPattern };
