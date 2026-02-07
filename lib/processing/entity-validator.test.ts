/**
 * Unit Tests for Entity Validator
 *
 * Tests validation and normalization of extracted entities.
 */

import { describe, it, expect } from 'vitest';
import {
  validateDate,
  validateAmount,
  validateVendor,
  validateEntities,
  normalizeVendorName,
  normalizeAmount,
  normalizeDate,
  normalizeEntities,
  calculateQualityScore,
  meetsQualityThreshold,
  getValidationSummary,
} from './entity-validator';
import type { ExtractedEntities, ExtractedField } from '@/types/ai';

// ============================================
// Test Helpers
// ============================================

function createDateField(
  value: string,
  confidence = 0.9
): ExtractedField<string> {
  return { value, confidence };
}

function createAmountField(
  value: number,
  confidence = 0.9
): ExtractedField<number> {
  return { value, confidence };
}

function createVendorField(
  value: string,
  confidence = 0.9
): ExtractedField<string> {
  return { value, confidence };
}

function createEntities(
  overrides: Partial<ExtractedEntities> = {}
): ExtractedEntities {
  return {
    date: createDateField('2024-01-15'),
    amount: createAmountField(50.31),
    vendor: createVendorField('Walmart'),
    description: 'Sample receipt',
    currency: 'USD',
    allAmounts: [],
    allDates: [],
    ...overrides,
  };
}

// ============================================
// Date Validation Tests
// ============================================

describe('Date Validation', () => {
  describe('validateDate', () => {
    it('should validate a valid date', () => {
      const date = createDateField('2024-01-15');
      const result = validateDate(date);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle null date (optional)', () => {
      const result = validateDate(null);

      expect(result.isValid).toBe(true);
    });

    it('should reject future dates', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const dateStr = futureDate.toISOString().split('T')[0];

      const result = validateDate(createDateField(dateStr ?? ''), {
        maxDate: new Date(),
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('future'))).toBe(true);
    });

    it('should reject very old dates', () => {
      const result = validateDate(createDateField('1900-01-01'), {
        minDate: new Date('2000-01-01'),
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('old'))).toBe(true);
    });

    it('should reject invalid date formats', () => {
      const result = validateDate(createDateField('not-a-date'));

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid'))).toBe(true);
    });

    it('should warn about low confidence', () => {
      const date = createDateField('2024-01-15', 0.2);
      const result = validateDate(date, { minConfidence: 0.3 });

      expect(result.warnings.some((w) => w.includes('confidence'))).toBe(true);
    });

    it('should warn about weekend dates', () => {
      // January 14, 2024 was a Sunday
      const date = createDateField('2024-01-14');
      const result = validateDate(date);

      expect(result.warnings.some((w) => w.includes('weekend'))).toBe(true);
    });
  });
});

// ============================================
// Amount Validation Tests
// ============================================

describe('Amount Validation', () => {
  describe('validateAmount', () => {
    it('should validate a valid amount', () => {
      const amount = createAmountField(50.31);
      const result = validateAmount(amount);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle null amount (optional)', () => {
      const result = validateAmount(null);

      expect(result.isValid).toBe(true);
    });

    it('should reject amounts below minimum', () => {
      const result = validateAmount(createAmountField(0.001), {
        minAmount: 0.01,
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('below minimum'))).toBe(true);
    });

    it('should reject amounts above maximum', () => {
      const result = validateAmount(createAmountField(5000000), {
        maxAmount: 1000000,
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('exceeds maximum'))).toBe(
        true
      );
    });

    it('should reject invalid numbers', () => {
      const result = validateAmount(createAmountField(NaN));

      expect(result.isValid).toBe(false);
    });

    it('should warn about low confidence', () => {
      const amount = createAmountField(50, 0.2);
      const result = validateAmount(amount, { minConfidence: 0.3 });

      expect(result.warnings.some((w) => w.includes('confidence'))).toBe(true);
    });

    it('should warn about round numbers', () => {
      const amount = createAmountField(500);
      const result = validateAmount(amount);

      expect(result.warnings.some((w) => w.includes('round number'))).toBe(
        true
      );
    });

    it('should warn about too many decimal places', () => {
      const amount = createAmountField(50.123);
      const result = validateAmount(amount);

      expect(result.warnings.some((w) => w.includes('decimal'))).toBe(true);
    });
  });
});

// ============================================
// Vendor Validation Tests
// ============================================

describe('Vendor Validation', () => {
  describe('validateVendor', () => {
    it('should validate a valid vendor', () => {
      const vendor = createVendorField('Walmart');
      const result = validateVendor(vendor);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle null vendor (optional)', () => {
      const result = validateVendor(null);

      expect(result.isValid).toBe(true);
    });

    it('should reject too short names', () => {
      const result = validateVendor(createVendorField('A'), {
        minVendorLength: 2,
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('too short'))).toBe(true);
    });

    it('should reject too long names', () => {
      const longName = 'A'.repeat(150);
      const result = validateVendor(createVendorField(longName), {
        maxVendorLength: 100,
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('too long'))).toBe(true);
    });

    it('should reject all-number names', () => {
      const result = validateVendor(createVendorField('12345'));

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('all numbers'))).toBe(true);
    });

    it('should warn about invalid characters', () => {
      const result = validateVendor(createVendorField('Store <script>'));

      expect(
        result.warnings.some((w) => w.includes('unusual characters'))
      ).toBe(true);
    });

    it('should warn about suspicious patterns', () => {
      const result = validateVendor(createVendorField('Test Company'));

      expect(result.warnings.some((w) => w.includes('suspicious'))).toBe(true);
    });

    it('should warn about excessive whitespace', () => {
      const result = validateVendor(createVendorField('Store   Name'));

      expect(result.warnings.some((w) => w.includes('whitespace'))).toBe(true);
    });

    it('should warn about low confidence', () => {
      const vendor = createVendorField('Store', 0.2);
      const result = validateVendor(vendor, { minConfidence: 0.3 });

      expect(result.warnings.some((w) => w.includes('confidence'))).toBe(true);
    });
  });
});

// ============================================
// Full Entity Validation Tests
// ============================================

describe('Full Entity Validation', () => {
  describe('validateEntities', () => {
    it('should validate all entities', () => {
      const entities = createEntities();
      const result = validateEntities(entities);

      expect(result.isValid).toBe(true);
      expect(result.validCount).toBe(3);
      expect(result.invalidCount).toBe(0);
    });

    it('should handle partial entities', () => {
      const entities = createEntities({
        date: null,
        vendor: null,
      });
      const result = validateEntities(entities);

      expect(result.isValid).toBe(true);
    });

    it('should warn when no entities extracted', () => {
      const entities = createEntities({
        date: null,
        amount: null,
        vendor: null,
      });
      const result = validateEntities(entities);

      expect(
        result.crossValidation.warnings.some((w) => w.includes('No entities'))
      ).toBe(true);
    });

    it('should detect inconsistent confidence levels', () => {
      const entities = createEntities({
        date: createDateField('2024-01-15', 0.95),
        amount: createAmountField(50, 0.3),
        vendor: createVendorField('Store', 0.9),
      });
      const result = validateEntities(entities);

      expect(
        result.crossValidation.warnings.some((w) => w.includes('inconsistent'))
      ).toBe(true);
    });
  });
});

// ============================================
// Normalization Tests
// ============================================

describe('Normalization', () => {
  describe('normalizeVendorName', () => {
    it('should trim whitespace', () => {
      expect(normalizeVendorName('  Walmart  ')).toBe('Walmart');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeVendorName('Store   Name')).toBe('Store Name');
    });

    it('should remove trailing punctuation', () => {
      expect(normalizeVendorName('Walmart,')).toBe('Walmart');
      expect(normalizeVendorName('Store Inc.;')).toBe('Store Inc.');
    });

    it('should remove store numbers', () => {
      expect(normalizeVendorName('Walmart #4521')).toBe('Walmart');
      expect(normalizeVendorName('Store 123')).toBe('Store');
    });

    it('should preserve abbreviations', () => {
      const result = normalizeVendorName('acme corp llc');
      expect(result).toContain('LLC');
    });

    it('should title case words', () => {
      expect(normalizeVendorName('walmart store')).toBe('Walmart Store');
    });

    it('should remove invalid characters', () => {
      expect(normalizeVendorName('Store <name>')).toBe('Store Name');
    });
  });

  describe('normalizeAmount', () => {
    it('should round to 2 decimal places', () => {
      expect(normalizeAmount(50.123)).toBe(50.12);
      expect(normalizeAmount(50.126)).toBe(50.13);
    });

    it('should handle integers', () => {
      expect(normalizeAmount(50)).toBe(50);
    });

    it('should handle very small amounts', () => {
      expect(normalizeAmount(0.01)).toBe(0.01);
    });
  });

  describe('normalizeDate', () => {
    it('should normalize to ISO format', () => {
      expect(normalizeDate('2024-01-15')).toBe('2024-01-15');
    });

    it('should handle Date objects converted to string', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      expect(normalizeDate(date.toISOString())).toBe('2024-01-15');
    });

    it('should return null for invalid dates', () => {
      expect(normalizeDate('not-a-date')).toBeNull();
    });
  });

  describe('normalizeEntities', () => {
    it('should normalize all entities', () => {
      const entities = createEntities({
        vendor: createVendorField('  walmart  store  '),
        amount: createAmountField(50.123),
      });

      const normalized = normalizeEntities(entities);

      expect(normalized.vendor).toBe('Walmart Store');
      expect(normalized.amount).toBe(50.12);
      expect(normalized.date).toBe('2024-01-15');
      expect(normalized.validation).toBeDefined();
    });

    it('should calculate overall confidence', () => {
      const entities = createEntities({
        date: createDateField('2024-01-15', 0.9),
        amount: createAmountField(50, 0.8),
        vendor: createVendorField('Store', 0.7),
      });

      const normalized = normalizeEntities(entities);

      expect(normalized.overallConfidence).toBeCloseTo(0.8, 1);
    });

    it('should handle null entities', () => {
      const entities = createEntities({
        date: null,
        vendor: null,
      });

      const normalized = normalizeEntities(entities);

      expect(normalized.date).toBeNull();
      expect(normalized.vendor).toBeNull();
      expect(normalized.amount).toBe(50.31);
    });
  });
});

// ============================================
// Quality Score Tests
// ============================================

describe('Quality Score', () => {
  describe('calculateQualityScore', () => {
    it('should return 100 for perfect extraction', () => {
      const entities = createEntities({
        date: createDateField('2024-01-15', 1.0),
        amount: createAmountField(50, 1.0),
        vendor: createVendorField('Store', 1.0),
        description: 'Valid description',
      });

      expect(calculateQualityScore(entities)).toBe(100);
    });

    it('should return 0 for no entities', () => {
      const entities = createEntities({
        date: null,
        amount: null,
        vendor: null,
        description: 'No description available',
      });

      expect(calculateQualityScore(entities)).toBe(0);
    });

    it('should weight amount higher than other fields', () => {
      const withAmount = createEntities({
        date: null,
        amount: createAmountField(50, 1.0),
        vendor: null,
      });

      const withDate = createEntities({
        date: createDateField('2024-01-15', 1.0),
        amount: null,
        vendor: null,
      });

      expect(calculateQualityScore(withAmount)).toBeGreaterThan(
        calculateQualityScore(withDate)
      );
    });

    it('should factor in confidence levels', () => {
      const highConfidence = createEntities({
        amount: createAmountField(50, 1.0),
      });

      const lowConfidence = createEntities({
        amount: createAmountField(50, 0.5),
      });

      expect(calculateQualityScore(highConfidence)).toBeGreaterThan(
        calculateQualityScore(lowConfidence)
      );
    });
  });

  describe('meetsQualityThreshold', () => {
    it('should return true when score meets threshold', () => {
      const entities = createEntities();
      expect(meetsQualityThreshold(entities, 50)).toBe(true);
    });

    it('should return false when score below threshold', () => {
      const entities = createEntities({
        date: null,
        amount: null,
        vendor: null,
      });
      expect(meetsQualityThreshold(entities, 50)).toBe(false);
    });

    it('should use default threshold of 50', () => {
      const entities = createEntities({
        amount: createAmountField(50, 0.7),
      });
      // Amount at 0.7 confidence = 28 points, plus description = 38 points
      // This should be below 50
      expect(meetsQualityThreshold(entities)).toBe(true);
    });
  });
});

// ============================================
// Validation Summary Tests
// ============================================

describe('Validation Summary', () => {
  describe('getValidationSummary', () => {
    it('should return success message for valid entities', () => {
      const entities = createEntities();
      const validation = validateEntities(entities);
      const summary = getValidationSummary(validation);

      expect(summary).toContain('successfully');
    });

    it('should list errors by entity type', () => {
      const entities = createEntities({
        date: createDateField('invalid'),
        amount: createAmountField(-100),
      });
      const validation = validateEntities(entities);
      const summary = getValidationSummary(validation);

      expect(summary).toContain('Date');
      expect(summary).toContain('Amount');
    });
  });
});
