/**
 * Entity Validator for Vault-AI
 *
 * Validates and normalizes extracted entities from financial documents.
 * Ensures data quality and consistency before storage.
 *
 * Validation includes:
 * - Date range checks (not future, not too old)
 * - Amount sanity checks (reasonable values)
 * - Vendor name cleanup and validation
 * - Cross-entity validation (logical consistency)
 *
 * PRIVACY: All validation happens locally in the browser.
 * No data is transmitted to external servers.
 */

import type { ExtractedEntities, ExtractedField } from '@/types/ai';

// ============================================
// Types
// ============================================

/**
 * Validation result for a single entity.
 */
export interface EntityValidationResult {
  /** Whether the entity is valid */
  isValid: boolean;

  /** Validation errors if any */
  errors: string[];

  /** Validation warnings (non-blocking) */
  warnings: string[];

  /** Suggested corrections if applicable */
  suggestions?: string[];
}

/**
 * Complete validation result for all entities.
 */
export interface ValidationResult {
  /** Overall validation status */
  isValid: boolean;

  /** Number of valid entities */
  validCount: number;

  /** Number of invalid entities */
  invalidCount: number;

  /** Number of warnings */
  warningCount: number;

  /** Individual entity validation results */
  date: EntityValidationResult | null;
  amount: EntityValidationResult | null;
  vendor: EntityValidationResult | null;

  /** Cross-entity validation issues */
  crossValidation: {
    errors: string[];
    warnings: string[];
  };
}

/**
 * Validation options.
 */
export interface ValidationOptions {
  /** Maximum allowed date (default: today + 30 days for pending) */
  maxDate?: Date;

  /** Minimum allowed date (default: 50 years ago) */
  minDate?: Date;

  /** Minimum amount (default: $0.01) */
  minAmount?: number;

  /** Maximum amount (default: $1,000,000) */
  maxAmount?: number;

  /** Minimum vendor name length (default: 2) */
  minVendorLength?: number;

  /** Maximum vendor name length (default: 100) */
  maxVendorLength?: number;

  /** Minimum confidence threshold (default: 0.3) */
  minConfidence?: number;

  /** Whether to apply strict validation (default: false) */
  strict?: boolean;
}

/**
 * Normalized entities after validation and cleanup.
 */
export interface NormalizedEntities {
  /** Normalized date in ISO format */
  date: string | null;

  /** Normalized amount as number */
  amount: number | null;

  /** Cleaned vendor name */
  vendor: string | null;

  /** Currency code */
  currency: string;

  /** Description */
  description: string;

  /** Overall confidence score (0-1) */
  overallConfidence: number;

  /** Validation result */
  validation: ValidationResult;
}

// ============================================
// Constants
// ============================================

/** Default validation options */
const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  maxDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days in future
  minDate: new Date(Date.now() - 50 * 365 * 24 * 60 * 60 * 1000), // 50 years ago
  minAmount: 0.01,
  maxAmount: 1000000,
  minVendorLength: 2,
  maxVendorLength: 100,
  minConfidence: 0.3,
  strict: false,
};

/** Characters not allowed in vendor names */
const INVALID_VENDOR_CHARS = /[<>{}[\]\\|^~`]/g;

/** Known suspicious patterns in vendor names */
const SUSPICIOUS_VENDOR_PATTERNS = [
  /^test/i,
  /^sample/i,
  /^example/i,
  /^dummy/i,
  /^xxx/i,
  /^[0-9]+$/,
];

/** Common abbreviations that should be preserved */
const PRESERVED_ABBREVIATIONS = [
  'inc',
  'llc',
  'ltd',
  'corp',
  'co',
  'plc',
  'usa',
  'uk',
  'llp',
];

// ============================================
// Validation Functions
// ============================================

/**
 * Validate a date entity.
 */
export function validateDate(
  date: ExtractedField<string> | null,
  options: ValidationOptions = {}
): EntityValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!date) {
    return { isValid: true, errors, warnings }; // Null is valid (optional)
  }

  // Check confidence
  if (date.confidence < opts.minConfidence) {
    warnings.push(
      `Date confidence (${(date.confidence * 100).toFixed(0)}%) is below threshold`
    );
  }

  // Parse the date
  const dateObj = new Date(date.value);

  if (isNaN(dateObj.getTime())) {
    errors.push(`Invalid date format: ${date.value}`);
    return { isValid: false, errors, warnings, suggestions };
  }

  // Check date range
  if (dateObj > opts.maxDate) {
    errors.push(`Date is in the future: ${date.value}`);
    suggestions.push(`Consider using today's date or a past date`);
  }

  if (dateObj < opts.minDate) {
    errors.push(`Date is too old: ${date.value}`);
    suggestions.push(
      `Date should be within the last ${Math.round((Date.now() - opts.minDate.getTime()) / (365 * 24 * 60 * 60 * 1000))} years`
    );
  }

  // Check for suspicious dates
  const today = new Date();
  const yearDiff = today.getFullYear() - dateObj.getFullYear();
  if (yearDiff > 10) {
    warnings.push(`Date is more than 10 years old`);
  }

  // Check if it's a weekend (might be unusual for business transactions)
  const dayOfWeek = dateObj.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    // Sunday or Saturday - just a note, not an error
    warnings.push(`Transaction date is on a weekend`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * Validate an amount entity.
 */
export function validateAmount(
  amount: ExtractedField<number> | null,
  options: ValidationOptions = {}
): EntityValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!amount) {
    return { isValid: true, errors, warnings }; // Null is valid (optional)
  }

  // Check confidence
  if (amount.confidence < opts.minConfidence) {
    warnings.push(
      `Amount confidence (${(amount.confidence * 100).toFixed(0)}%) is below threshold`
    );
  }

  const value = amount.value;

  // Check if it's a valid number
  if (isNaN(value) || !isFinite(value)) {
    errors.push(`Invalid amount value`);
    return { isValid: false, errors, warnings, suggestions };
  }

  // Check minimum
  if (value < opts.minAmount) {
    errors.push(
      `Amount $${value.toFixed(2)} is below minimum ($${opts.minAmount})`
    );
  }

  // Check maximum
  if (value > opts.maxAmount) {
    errors.push(
      `Amount $${value.toFixed(2)} exceeds maximum ($${opts.maxAmount.toLocaleString()})`
    );
    suggestions.push(`Verify this is not a misread value (e.g., extra digits)`);
  }

  // Check for suspicious round numbers
  if (value > 100 && value % 100 === 0) {
    warnings.push(`Amount is a round number ($${value.toFixed(2)})`);
  }

  // Check for common OCR errors
  if (value.toString().includes('1') && value.toString().includes('l')) {
    warnings.push(`Amount may contain OCR errors (l vs 1)`);
  }

  // Check decimal places
  const decimalPlaces = (value.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) {
    warnings.push(`Amount has more than 2 decimal places`);
    suggestions.push(
      `Consider rounding to 2 decimal places: $${value.toFixed(2)}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * Validate a vendor entity.
 */
export function validateVendor(
  vendor: ExtractedField<string> | null,
  options: ValidationOptions = {}
): EntityValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!vendor) {
    return { isValid: true, errors, warnings }; // Null is valid (optional)
  }

  // Check confidence
  if (vendor.confidence < opts.minConfidence) {
    warnings.push(
      `Vendor confidence (${(vendor.confidence * 100).toFixed(0)}%) is below threshold`
    );
  }

  const value = vendor.value;

  // Check length
  if (value.length < opts.minVendorLength) {
    errors.push(`Vendor name too short: "${value}"`);
  }

  if (value.length > opts.maxVendorLength) {
    errors.push(`Vendor name too long: ${value.length} characters`);
    suggestions.push(
      `Consider truncating to ${opts.maxVendorLength} characters`
    );
  }

  // Check for invalid characters
  if (INVALID_VENDOR_CHARS.test(value)) {
    warnings.push(`Vendor name contains unusual characters`);
    suggestions.push(
      `Cleaned name: "${value.replace(INVALID_VENDOR_CHARS, '')}"`
    );
  }

  // Check for suspicious patterns
  for (const pattern of SUSPICIOUS_VENDOR_PATTERNS) {
    if (pattern.test(value)) {
      warnings.push(`Vendor name matches suspicious pattern`);
      break;
    }
  }

  // Check for all numbers
  if (/^\d+$/.test(value)) {
    errors.push(`Vendor name is all numbers: "${value}"`);
  }

  // Check for excessive whitespace
  if (/\s{2,}/.test(value)) {
    warnings.push(`Vendor name has excessive whitespace`);
    suggestions.push(`Cleaned name: "${value.replace(/\s+/g, ' ')}"`);
  }

  // Check for leading/trailing whitespace
  if (value !== value.trim()) {
    warnings.push(`Vendor name has leading/trailing whitespace`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * Validate all entities together.
 */
export function validateEntities(
  entities: ExtractedEntities,
  options: ValidationOptions = {}
): ValidationResult {
  const dateResult = entities.date
    ? validateDate(entities.date, options)
    : null;
  const amountResult = entities.amount
    ? validateAmount(entities.amount, options)
    : null;
  const vendorResult = entities.vendor
    ? validateVendor(entities.vendor, options)
    : null;

  // Cross-entity validation
  const crossErrors: string[] = [];
  const crossWarnings: string[] = [];

  // Check if we have at least one useful entity
  if (!entities.date && !entities.amount && !entities.vendor) {
    crossWarnings.push('No entities were extracted from the document');
  }

  // Check confidence correlation
  const confidences = [
    entities.date?.confidence,
    entities.amount?.confidence,
    entities.vendor?.confidence,
  ].filter((c): c is number => c !== undefined);

  if (confidences.length > 1) {
    const avgConfidence =
      confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const minConf = Math.min(...confidences);

    if (minConf < avgConfidence * 0.5) {
      crossWarnings.push('Entity confidence levels are inconsistent');
    }
  }

  // Calculate counts
  const results = [dateResult, amountResult, vendorResult].filter(Boolean);
  const validCount = results.filter((r) => r?.isValid).length;
  const invalidCount = results.filter((r) => !r?.isValid).length;
  const warningCount = results.reduce(
    (sum, r) => sum + (r?.warnings.length ?? 0),
    0
  );

  return {
    isValid: invalidCount === 0 && crossErrors.length === 0,
    validCount,
    invalidCount,
    warningCount: warningCount + crossWarnings.length,
    date: dateResult,
    amount: amountResult,
    vendor: vendorResult,
    crossValidation: {
      errors: crossErrors,
      warnings: crossWarnings,
    },
  };
}

// ============================================
// Normalization Functions
// ============================================

/**
 * Normalize a vendor name.
 */
export function normalizeVendorName(vendor: string): string {
  let normalized = vendor
    // Trim whitespace
    .trim()
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    // Remove invalid characters
    .replace(INVALID_VENDOR_CHARS, '')
    // Remove trailing punctuation (except periods in abbreviations)
    .replace(/[,;:!]+$/, '')
    // Remove store numbers at the end
    .replace(/\s*#\d+$/, '')
    .replace(/\s+\d{1,6}$/, '');

  // Title case, preserving abbreviations
  const words = normalized.split(' ');
  normalized = words
    .map((word) => {
      const lower = word.toLowerCase();
      // Keep abbreviations as-is or uppercase
      if (PRESERVED_ABBREVIATIONS.includes(lower)) {
        return word.length <= 3 ? word.toUpperCase() : word;
      }
      // Title case other words
      if (word.length > 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(' ');

  return normalized;
}

/**
 * Normalize an amount value.
 */
export function normalizeAmount(amount: number): number {
  // Round to 2 decimal places
  return Math.round(amount * 100) / 100;
}

/**
 * Normalize a date to ISO format.
 */
export function normalizeDate(date: string): string | null {
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return null;
  }
  return dateObj.toISOString().split('T')[0] ?? null;
}

/**
 * Normalize all entities with validation.
 */
export function normalizeEntities(
  entities: ExtractedEntities,
  options: ValidationOptions = {}
): NormalizedEntities {
  // Validate first
  const validation = validateEntities(entities, options);

  // Normalize date
  const normalizedDate = entities.date
    ? normalizeDate(entities.date.value)
    : null;

  // Normalize amount
  const normalizedAmount = entities.amount
    ? normalizeAmount(entities.amount.value)
    : null;

  // Normalize vendor
  const normalizedVendor = entities.vendor
    ? normalizeVendorName(entities.vendor.value)
    : null;

  // Calculate overall confidence
  const confidences = [
    entities.date?.confidence,
    entities.amount?.confidence,
    entities.vendor?.confidence,
  ].filter((c): c is number => c !== undefined);

  const overallConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

  return {
    date: normalizedDate,
    amount: normalizedAmount,
    vendor: normalizedVendor,
    currency: entities.currency,
    description: entities.description,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
    validation,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate the quality score for extracted entities.
 * Returns a score from 0-100.
 */
export function calculateQualityScore(entities: ExtractedEntities): number {
  let score = 0;
  let maxScore = 0;

  // Date contributes 30 points
  maxScore += 30;
  if (entities.date) {
    score += Math.round(entities.date.confidence * 30);
  }

  // Amount contributes 40 points (most important)
  maxScore += 40;
  if (entities.amount) {
    score += Math.round(entities.amount.confidence * 40);
  }

  // Vendor contributes 20 points
  maxScore += 20;
  if (entities.vendor) {
    score += Math.round(entities.vendor.confidence * 20);
  }

  // Description contributes 10 points
  maxScore += 10;
  if (
    entities.description &&
    entities.description !== 'No description available'
  ) {
    score += 10;
  }

  return Math.round((score / maxScore) * 100);
}

/**
 * Check if entities meet minimum quality threshold.
 */
export function meetsQualityThreshold(
  entities: ExtractedEntities,
  threshold: number = 50
): boolean {
  return calculateQualityScore(entities) >= threshold;
}

/**
 * Get a human-readable summary of validation issues.
 */
export function getValidationSummary(validation: ValidationResult): string {
  const issues: string[] = [];

  if (validation.date?.errors.length) {
    issues.push(`Date: ${validation.date.errors.join(', ')}`);
  }
  if (validation.amount?.errors.length) {
    issues.push(`Amount: ${validation.amount.errors.join(', ')}`);
  }
  if (validation.vendor?.errors.length) {
    issues.push(`Vendor: ${validation.vendor.errors.join(', ')}`);
  }
  if (validation.crossValidation.errors.length) {
    issues.push(validation.crossValidation.errors.join(', '));
  }

  if (issues.length === 0) {
    return 'All entities validated successfully';
  }

  return issues.join('; ');
}

// Types are exported inline with their declarations above
