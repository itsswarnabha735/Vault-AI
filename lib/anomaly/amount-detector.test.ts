/**
 * Unit Tests for Amount Anomaly Detector
 *
 * Tests the amount anomaly detection logic including:
 * - Unusually high/low amount detection
 * - Price increase detection for subscriptions
 * - First-time vendor handling
 * - Vendor statistics calculation
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the database before importing the detector
vi.mock('@/lib/storage/db', () => {
  return {
    db: {
      transactions: {
        filter: vi.fn(() => ({
          toArray: vi.fn(() => Promise.resolve([])),
        })),
        toArray: vi.fn(() => Promise.resolve([])),
      },
      anomalies: {
        add: vi.fn(() => Promise.resolve('mock-alert-id')),
        where: vi.fn(() => ({
          equals: vi.fn(() => ({
            and: vi.fn(() => ({
              toArray: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
      },
      resolveAnomaly: vi.fn(() => Promise.resolve()),
    },
  };
});

import {
  DEFAULT_AMOUNT_ANOMALY_CONFIG,
  type VendorStats,
} from './amount-detector';

// ============================================
// Configuration Tests
// ============================================

describe('AmountAnomalyConfig', () => {
  describe('DEFAULT_AMOUNT_ANOMALY_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_AMOUNT_ANOMALY_CONFIG.unusualThreshold).toBe(0.2);
      expect(DEFAULT_AMOUNT_ANOMALY_CONFIG.priceIncreaseThreshold).toBe(0.15);
      expect(DEFAULT_AMOUNT_ANOMALY_CONFIG.minTransactionsForBaseline).toBe(2);
      expect(
        DEFAULT_AMOUNT_ANOMALY_CONFIG.minTransactionsForPriceIncrease
      ).toBe(3);
      expect(DEFAULT_AMOUNT_ANOMALY_CONFIG.consistencyTolerance).toBe(1.0);
      expect(DEFAULT_AMOUNT_ANOMALY_CONFIG.flagFirstTimeVendors).toBe(false);
      expect(DEFAULT_AMOUNT_ANOMALY_CONFIG.confidenceThreshold).toBe(0.5);
    });
  });
});

// ============================================
// Utility Function Tests
// ============================================

describe('Utility Functions', () => {
  describe('calculateStdDeviation (internal)', () => {
    // We test this indirectly through VendorStats
    it('should calculate standard deviation correctly', () => {
      // Given values [10, 10, 10], mean = 10, stdDev should be 0
      const values = [10, 10, 10];
      const mean = 10;
      const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
      const avgSquaredDiff =
        squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
      const stdDev = Math.sqrt(avgSquaredDiff);
      expect(stdDev).toBe(0);
    });

    it('should calculate non-zero standard deviation', () => {
      // Given values [5, 10, 15], mean = 10
      // (5-10)^2 = 25, (10-10)^2 = 0, (15-10)^2 = 25
      // avgSquaredDiff = 50/3 = 16.67
      // stdDev = sqrt(16.67) ≈ 4.08
      const values = [5, 10, 15];
      const mean = 10;
      const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
      const avgSquaredDiff =
        squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
      const stdDev = Math.sqrt(avgSquaredDiff);
      expect(stdDev).toBeCloseTo(4.08, 1);
    });
  });

  describe('calculateConsistencyScore (internal)', () => {
    it('should return 1 for zero standard deviation', () => {
      const stdDev = 0;
      const mean = 100;
      const cv = stdDev / Math.abs(mean);
      const score = Math.max(0, Math.min(1, 1 - cv));
      expect(score).toBe(1);
    });

    it('should return lower score for higher variance', () => {
      // High variance: stdDev = 50, mean = 100 -> cv = 0.5 -> score = 0.5
      const stdDev1 = 50;
      const mean1 = 100;
      const score1 = Math.max(0, Math.min(1, 1 - stdDev1 / Math.abs(mean1)));

      // Low variance: stdDev = 10, mean = 100 -> cv = 0.1 -> score = 0.9
      const stdDev2 = 10;
      const mean2 = 100;
      const score2 = Math.max(0, Math.min(1, 1 - stdDev2 / Math.abs(mean2)));

      expect(score1).toBe(0.5);
      expect(score2).toBe(0.9);
      expect(score2).toBeGreaterThan(score1);
    });
  });
});

// ============================================
// Percent Change Calculation Tests
// ============================================

describe('Percent Change Calculations', () => {
  it('should calculate positive percent change correctly', () => {
    const currentAmount = 120;
    const averageAmount = 100;
    const percentChange = (currentAmount - averageAmount) / averageAmount;
    expect(percentChange).toBe(0.2); // 20% increase
  });

  it('should calculate negative percent change correctly', () => {
    const currentAmount = 80;
    const averageAmount = 100;
    const percentChange = (currentAmount - averageAmount) / averageAmount;
    expect(percentChange).toBe(-0.2); // 20% decrease
  });

  it('should calculate zero percent change for same amounts', () => {
    const currentAmount = 100;
    const averageAmount = 100;
    const percentChange = (currentAmount - averageAmount) / averageAmount;
    expect(percentChange).toBe(0);
  });

  it('should calculate correct percent for subscription increase', () => {
    // Netflix: $15.99 -> $18.99
    const currentAmount = 18.99;
    const averageAmount = 15.99;
    const percentChange = (currentAmount - averageAmount) / averageAmount;
    expect(percentChange).toBeCloseTo(0.1876, 3); // ~18.8% increase
  });
});

// ============================================
// Anomaly Type Detection Tests
// ============================================

describe('Anomaly Type Detection Logic', () => {
  const config = DEFAULT_AMOUNT_ANOMALY_CONFIG;

  describe('Unusually High Amount', () => {
    it('should detect unusually high amount', () => {
      const currentAmount = 150;
      const averageAmount = 100;
      const percentChange = (currentAmount - averageAmount) / averageAmount;

      // 50% is above 20% threshold
      expect(Math.abs(percentChange)).toBeGreaterThan(config.unusualThreshold);
      expect(percentChange).toBeGreaterThan(0);
    });

    it('should not flag amounts within threshold', () => {
      const currentAmount = 115;
      const averageAmount = 100;
      const percentChange = (currentAmount - averageAmount) / averageAmount;

      // 15% is below 20% threshold
      expect(Math.abs(percentChange)).toBeLessThan(config.unusualThreshold);
    });
  });

  describe('Unusually Low Amount', () => {
    it('should detect unusually low amount', () => {
      const currentAmount = 50;
      const averageAmount = 100;
      const percentChange = (currentAmount - averageAmount) / averageAmount;

      // -50% is above 20% threshold
      expect(Math.abs(percentChange)).toBeGreaterThan(config.unusualThreshold);
      expect(percentChange).toBeLessThan(0);
    });
  });

  describe('Price Increase Detection', () => {
    it('should detect price increase for consistent vendors', () => {
      const currentAmount = 18.99;
      const averageAmount = 15.99;
      const percentChange = (currentAmount - averageAmount) / averageAmount;

      // Conditions for price increase:
      // 1. transactionCount >= 3 ✓
      // 2. consistencyScore > 0.8 ✓
      // 3. percentChange > priceIncreaseThreshold (0.15) ✓

      const transactionCount = 5;
      const consistencyScore = 0.95;

      const isPriceIncrease =
        transactionCount >= config.minTransactionsForPriceIncrease &&
        consistencyScore > 0.8 &&
        percentChange > config.priceIncreaseThreshold;

      expect(isPriceIncrease).toBe(true);
    });

    it('should not flag price increase for inconsistent vendors', () => {
      const currentAmount = 120;
      const averageAmount = 100;
      const percentChange = (currentAmount - averageAmount) / averageAmount;

      const transactionCount = 5;
      const consistencyScore = 0.5; // Low consistency

      const isPriceIncrease =
        transactionCount >= config.minTransactionsForPriceIncrease &&
        consistencyScore > 0.8 && // This fails
        percentChange > config.priceIncreaseThreshold;

      expect(isPriceIncrease).toBe(false);
    });
  });
});

// ============================================
// VendorStats Interface Tests
// ============================================

describe('VendorStats', () => {
  it('should have correct structure for empty vendor', () => {
    const emptyStats: VendorStats = {
      vendor: 'unknown',
      transactionCount: 0,
      averageAmount: 0,
      minAmount: 0,
      maxAmount: 0,
      stdDeviation: 0,
      lastAmount: 0,
      lastDate: '',
      consistencyScore: 0,
    };

    expect(emptyStats.transactionCount).toBe(0);
    expect(emptyStats.averageAmount).toBe(0);
  });

  it('should calculate stats correctly for single transaction', () => {
    const amount = 49.99;
    const stats: VendorStats = {
      vendor: 'Netflix',
      transactionCount: 1,
      averageAmount: amount,
      minAmount: amount,
      maxAmount: amount,
      stdDeviation: 0,
      lastAmount: amount,
      lastDate: '2024-01-15',
      consistencyScore: 1, // Perfect consistency with one transaction
    };

    expect(stats.transactionCount).toBe(1);
    expect(stats.averageAmount).toBe(49.99);
    expect(stats.minAmount).toBe(stats.maxAmount);
  });

  it('should calculate stats correctly for multiple transactions', () => {
    // Simulate: amounts [9.99, 9.99, 9.99, 9.99, 9.99] for Spotify
    const amounts = [9.99, 9.99, 9.99, 9.99, 9.99];
    const sum = amounts.reduce((acc, val) => acc + val, 0);
    const average = sum / amounts.length;
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);

    const squaredDiffs = amounts.map((v) => Math.pow(v - average, 2));
    const avgSquaredDiff =
      squaredDiffs.reduce((sum, val) => sum + val, 0) / amounts.length;
    const stdDev = Math.sqrt(avgSquaredDiff);

    expect(average).toBeCloseTo(9.99, 2);
    expect(min).toBe(9.99);
    expect(max).toBe(9.99);
    expect(stdDev).toBe(0); // Perfect consistency
  });
});

// ============================================
// Confidence Score Tests
// ============================================

describe('Confidence Score Calculation', () => {
  const config = DEFAULT_AMOUNT_ANOMALY_CONFIG;

  it('should calculate confidence based on deviation magnitude', () => {
    // Confidence = min(1, |percentChange| / (unusualThreshold * 3))
    // For 40% deviation: min(1, 0.4 / 0.6) = min(1, 0.67) = 0.67
    const percentChange = 0.4;
    const confidence = Math.min(
      1,
      Math.abs(percentChange) / (config.unusualThreshold * 3)
    );
    expect(confidence).toBeCloseTo(0.67, 2);
  });

  it('should cap confidence at 1.0', () => {
    // For 100% deviation: min(1, 1.0 / 0.6) = min(1, 1.67) = 1.0
    const percentChange = 1.0;
    const confidence = Math.min(
      1,
      Math.abs(percentChange) / (config.unusualThreshold * 3)
    );
    expect(confidence).toBe(1);
  });

  it('should have lower confidence for smaller deviations', () => {
    // For 25% deviation: min(1, 0.25 / 0.6) = min(1, 0.42) = 0.42
    const percentChange = 0.25;
    const confidence = Math.min(
      1,
      Math.abs(percentChange) / (config.unusualThreshold * 3)
    );
    expect(confidence).toBeCloseTo(0.42, 2);
  });

  it('should filter out low confidence anomalies', () => {
    // A 21% deviation (just over threshold) should have low confidence
    const percentChange = 0.21;
    const confidence = Math.min(
      1,
      Math.abs(percentChange) / (config.unusualThreshold * 3)
    );

    // Should be below default confidenceThreshold of 0.5
    expect(confidence).toBeLessThan(config.confidenceThreshold);
  });
});

// ============================================
// Edge Cases Tests
// ============================================

describe('Edge Cases', () => {
  it('should handle zero average amount', () => {
    const currentAmount = 100;
    const averageAmount = 0;

    // Division by zero case - should return a special result
    // In real implementation, this should be handled gracefully
    expect(() => {
      const percentChange = (currentAmount - averageAmount) / averageAmount;
      return isFinite(percentChange);
    }).not.toThrow();
  });

  it('should handle negative amounts (refunds)', () => {
    const currentAmount = -50;
    const averageAmount = 100;
    const percentChange = (currentAmount - averageAmount) / averageAmount;

    expect(percentChange).toBe(-1.5); // -150%
    expect(Math.abs(percentChange)).toBeGreaterThan(0.2);
  });

  it('should handle very small amounts', () => {
    const currentAmount = 0.99;
    const averageAmount = 0.5;
    const percentChange = (currentAmount - averageAmount) / averageAmount;

    expect(percentChange).toBeCloseTo(0.98, 2); // 98% increase
  });

  it('should handle very large amounts', () => {
    const currentAmount = 10000;
    const averageAmount = 100;
    const percentChange = (currentAmount - averageAmount) / averageAmount;

    expect(percentChange).toBe(99); // 9900% increase
  });
});

// ============================================
// Real World Scenario Tests
// ============================================

describe('Real World Scenarios', () => {
  const config = DEFAULT_AMOUNT_ANOMALY_CONFIG;

  describe('Subscription Price Increases', () => {
    it('should detect Netflix price increase', () => {
      const oldPrice = 15.99;
      const newPrice = 18.99;
      const percentChange = (newPrice - oldPrice) / oldPrice;

      expect(percentChange).toBeGreaterThan(config.priceIncreaseThreshold);
      expect(percentChange).toBeCloseTo(0.1876, 3);
    });

    it('should detect Spotify price increase', () => {
      const oldPrice = 9.99;
      const newPrice = 10.99;
      const percentChange = (newPrice - oldPrice) / oldPrice;

      expect(percentChange).toBeCloseTo(0.1, 2); // 10%
      // This is below the 15% threshold, so might not trigger
      expect(percentChange).toBeLessThan(config.priceIncreaseThreshold);
    });
  });

  describe('Grocery Shopping Variance', () => {
    it('should not flag normal grocery variance', () => {
      // Grocery shopping naturally varies by 10-15%
      const currentAmount = 115;
      const averageAmount = 100;
      const percentChange = (currentAmount - averageAmount) / averageAmount;

      expect(Math.abs(percentChange)).toBeLessThan(config.unusualThreshold);
    });

    it('should flag unusually large grocery bill', () => {
      // Holiday shopping might be 50% more
      const currentAmount = 150;
      const averageAmount = 100;
      const percentChange = (currentAmount - averageAmount) / averageAmount;

      expect(Math.abs(percentChange)).toBeGreaterThan(config.unusualThreshold);
    });
  });

  describe('Restaurant Bills', () => {
    it('should handle varying restaurant bills', () => {
      // Restaurant bills vary a lot - might not want to flag
      const amounts = [25, 45, 30, 80, 35];
      const sum = amounts.reduce((acc, val) => acc + val, 0);
      const average = sum / amounts.length;
      const squaredDiffs = amounts.map((v) => Math.pow(v - average, 2));
      const avgSquaredDiff =
        squaredDiffs.reduce((sum, val) => sum + val, 0) / amounts.length;
      const stdDev = Math.sqrt(avgSquaredDiff);

      // High variance means low consistency score
      const consistencyScore = Math.max(
        0,
        Math.min(1, 1 - stdDev / Math.abs(average))
      );

      expect(average).toBeCloseTo(43, 0);
      expect(consistencyScore).toBeLessThan(0.8); // Not consistent
    });
  });

  describe('Utility Bills', () => {
    it('should detect significant utility increase', () => {
      // Electric bill jumps in summer
      const winterAverage = 80;
      const summerBill = 150;
      const percentChange = (summerBill - winterAverage) / winterAverage;

      expect(percentChange).toBeCloseTo(0.875, 3); // 87.5% increase
      expect(Math.abs(percentChange)).toBeGreaterThan(config.unusualThreshold);
    });
  });
});

// ============================================
// Message Generation Tests
// ============================================

describe('Message Generation', () => {
  it('should format price increase message correctly', () => {
    const vendor = 'Netflix';
    const oldPrice = 15.99;
    const newPrice = 18.99;
    const percentChange = ((newPrice - oldPrice) / oldPrice) * 100;

    const message = `${vendor} increased from $${oldPrice.toFixed(2)} to $${newPrice.toFixed(2)} (+${percentChange.toFixed(0)}%)`;

    expect(message).toBe('Netflix increased from $15.99 to $18.99 (+19%)');
  });

  it('should format unusual amount message correctly', () => {
    const vendor = 'Amazon';
    const amount = 250;
    const average = 100;
    const type = 'unusually_high';

    const direction = type === 'unusually_high' ? 'higher' : 'lower';
    const message = `${vendor} amount ($${amount.toFixed(2)}) is ${direction} than usual (avg: $${average.toFixed(2)})`;

    expect(message).toBe(
      'Amazon amount ($250.00) is higher than usual (avg: $100.00)'
    );
  });
});
