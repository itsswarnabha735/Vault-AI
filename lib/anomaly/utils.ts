/**
 * Utility Functions for Anomaly Detection
 *
 * Contains helper functions for:
 * - Levenshtein distance calculation
 * - Date arithmetic
 * - Vendor name normalization
 * - Similarity calculations
 */

// ============================================
// Levenshtein Distance
// ============================================

/**
 * Calculate the Levenshtein distance between two strings.
 * The Levenshtein distance is the minimum number of single-character
 * edits (insertions, deletions, substitutions) required to change
 * one string into the other.
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @returns The Levenshtein distance
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // Early termination for empty strings
  if (len1 === 0) {
    return len2;
  }
  if (len2 === 0) {
    return len1;
  }

  // Create the distance matrix
  // Use a 2D array for clarity, but can be optimized to 1D
  const matrix: number[][] = Array.from(
    { length: len1 + 1 },
    () => Array(len2 + 1).fill(0) as number[]
  );

  // Initialize first row and column
  for (let i = 0; i <= len1; i++) {
    matrix[i]![0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0]![j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;

      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1, // Deletion
        matrix[i]![j - 1]! + 1, // Insertion
        matrix[i - 1]![j - 1]! + cost // Substitution
      );
    }
  }

  return matrix[len1]![len2]!;
}

/**
 * Calculate the similarity between two strings using Levenshtein distance.
 * Returns a value between 0 (completely different) and 1 (identical).
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity score (0-1)
 */
export function stringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) {
    return 1;
  }
  if (str1.length === 0 && str2.length === 0) {
    return 1;
  }
  if (str1.length === 0 || str2.length === 0) {
    return 0;
  }

  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);

  return 1 - distance / maxLength;
}

// ============================================
// Date Arithmetic
// ============================================

/**
 * Parse a date string in ISO 8601 format (YYYY-MM-DD) to a Date object.
 *
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Date object
 */
export function parseDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year!, month! - 1, day);
}

/**
 * Format a Date object to ISO 8601 date string (YYYY-MM-DD).
 *
 * @param date - Date object
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Add days to a date string.
 *
 * @param dateString - Date string in YYYY-MM-DD format
 * @param days - Number of days to add (can be negative)
 * @returns New date string in YYYY-MM-DD format
 */
export function addDays(dateString: string, days: number): string {
  const date = parseDate(dateString);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

/**
 * Subtract days from a date string.
 *
 * @param dateString - Date string in YYYY-MM-DD format
 * @param days - Number of days to subtract
 * @returns New date string in YYYY-MM-DD format
 */
export function subtractDays(dateString: string, days: number): string {
  return addDays(dateString, -days);
}

/**
 * Calculate the difference in days between two date strings.
 *
 * @param date1 - First date string in YYYY-MM-DD format
 * @param date2 - Second date string in YYYY-MM-DD format
 * @returns Absolute difference in days
 */
export function daysDifference(date1: string, date2: string): number {
  const d1 = parseDate(date1);
  const d2 = parseDate(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Check if a date is within a range (inclusive).
 *
 * @param date - Date to check (YYYY-MM-DD format)
 * @param startDate - Start of range (YYYY-MM-DD format)
 * @param endDate - End of range (YYYY-MM-DD format)
 * @returns True if date is within range
 */
export function isDateInRange(
  date: string,
  startDate: string,
  endDate: string
): boolean {
  return date >= startDate && date <= endDate;
}

// ============================================
// Vendor Name Normalization
// ============================================

/**
 * Common words to remove from vendor names for comparison.
 */
const VENDOR_STOPWORDS = [
  'inc',
  'inc.',
  'incorporated',
  'llc',
  'l.l.c.',
  'ltd',
  'ltd.',
  'limited',
  'corp',
  'corp.',
  'corporation',
  'co',
  'co.',
  'company',
  'the',
  'a',
  'an',
  'store',
  'stores',
  'shop',
  'restaurant',
  'cafe',
  'bar',
];

/**
 * Common character replacements for vendor name normalization.
 */
const VENDOR_REPLACEMENTS: [RegExp, string][] = [
  [/['']/g, "'"], // Normalize apostrophes
  [/[""]/g, '"'], // Normalize quotes
  [/&/g, 'and'], // Replace & with "and"
  [/[^\w\s'-]/g, ''], // Remove special characters except word chars, spaces, hyphens, apostrophes
  [/\s+/g, ' '], // Normalize whitespace
];

/**
 * Normalize a vendor name for comparison.
 * Applies lowercasing, removes common suffixes, and normalizes special characters.
 *
 * @param vendor - Raw vendor name
 * @returns Normalized vendor name
 */
export function normalizeVendor(vendor: string): string {
  if (!vendor) {
    return '';
  }

  let normalized = vendor.toLowerCase().trim();

  // Apply character replacements
  for (const [pattern, replacement] of VENDOR_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Remove stopwords
  const words = normalized.split(' ');
  const filteredWords = words.filter(
    (word) => !VENDOR_STOPWORDS.includes(word.toLowerCase())
  );

  // If all words were stopwords, keep the original (filtered)
  normalized =
    filteredWords.length > 0 ? filteredWords.join(' ') : words.join(' ');

  return normalized.trim();
}

/**
 * Calculate vendor similarity with normalization.
 * Normalizes both vendor names before comparing.
 *
 * @param vendor1 - First vendor name
 * @param vendor2 - Second vendor name
 * @returns Similarity score (0-1)
 */
export function vendorSimilarity(vendor1: string, vendor2: string): number {
  const normalized1 = normalizeVendor(vendor1);
  const normalized2 = normalizeVendor(vendor2);

  // Exact match after normalization
  if (normalized1 === normalized2) {
    return 1;
  }

  // Calculate string similarity
  return stringSimilarity(normalized1, normalized2);
}

// ============================================
// Amount Comparison
// ============================================

/**
 * Check if two amounts are within a tolerance.
 *
 * @param amount1 - First amount
 * @param amount2 - Second amount
 * @param tolerance - Maximum allowed difference (default: 0 for exact match)
 * @returns True if amounts are within tolerance
 */
export function amountsMatch(
  amount1: number,
  amount2: number,
  tolerance: number = 0
): boolean {
  return Math.abs(amount1 - amount2) <= tolerance;
}

/**
 * Calculate the percentage difference between two amounts.
 *
 * @param original - Original amount
 * @param compared - Amount to compare
 * @returns Percentage difference (positive if compared > original)
 */
export function percentageDifference(
  original: number,
  compared: number
): number {
  if (original === 0) {
    return compared === 0 ? 0 : 100;
  }
  return ((compared - original) / Math.abs(original)) * 100;
}

// ============================================
// Confidence Scoring
// ============================================

/**
 * Calculate a combined confidence score for duplicate detection.
 *
 * @param vendorSimilarity - Vendor similarity score (0-1)
 * @param amountMatch - Whether amounts match exactly (true/false)
 * @param dateProximity - How close the dates are (0 = same day, higher = further apart)
 * @param maxDays - Maximum days tolerance
 * @returns Combined confidence score (0-1)
 */
export function calculateDuplicateConfidence(
  vendorSimilarityScore: number,
  amountMatch: boolean,
  dateProximity: number,
  maxDays: number
): number {
  // Weight factors
  const VENDOR_WEIGHT = 0.4;
  const AMOUNT_WEIGHT = 0.4;
  const DATE_WEIGHT = 0.2;

  // Amount score: 1 if match, 0.5 if within 10%, 0 otherwise
  const amountScore = amountMatch ? 1 : 0;

  // Date score: inverse of proximity (closer = higher score)
  const dateScore = Math.max(0, 1 - dateProximity / maxDays);

  // Combined weighted score
  const confidence =
    vendorSimilarityScore * VENDOR_WEIGHT +
    amountScore * AMOUNT_WEIGHT +
    dateScore * DATE_WEIGHT;

  return Math.min(1, Math.max(0, confidence));
}

// ============================================
// Currency Formatting
// ============================================

/**
 * Format an amount as currency.
 *
 * @param amount - Amount to format
 * @param currency - Currency code (default: USD)
 * @param locale - Locale for formatting (default: en-US)
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}
