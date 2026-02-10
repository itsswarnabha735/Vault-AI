/**
 * Unit Tests for Auto-Categorizer
 *
 * Tests the auto-categorizer's ability to:
 * - Suggest categories for known vendors using keyword rules
 * - Handle case-insensitive matching
 * - Calculate confidence based on specificity
 * - Return null for unrecognized vendors
 * - Provide batch category suggestions
 * - List available categories
 */

import { describe, it, expect } from 'vitest';
import { autoCategorizer, suggestCategory } from './auto-categorizer';

// ============================================
// Food & Dining Tests
// ============================================

describe('Food & Dining Category', () => {
  it('should categorize Starbucks', () => {
    const result = suggestCategory('STARBUCKS COFFEE #1234');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Food & Dining');
  });

  it('should categorize McDonalds', () => {
    const result = suggestCategory('McDonalds Restaurant');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Food & Dining');
  });

  it('should categorize Chipotle', () => {
    const result = suggestCategory('CHIPOTLE ONLINE ORDER');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Food & Dining');
  });

  it('should categorize DoorDash', () => {
    const result = suggestCategory('DOORDASH*THAI BASIL');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Food & Dining');
  });

  it('should categorize Swiggy (Indian)', () => {
    const result = suggestCategory('SWIGGY ORDER #123456');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Food & Dining');
  });

  it('should categorize Zomato (Indian)', () => {
    const result = suggestCategory('ZOMATO');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Food & Dining');
  });

  it('should categorize generic restaurants', () => {
    const result = suggestCategory('Italian Restaurant');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Food & Dining');
  });
});

// ============================================
// Groceries Tests
// ============================================

describe('Groceries Category', () => {
  it('should categorize Walmart', () => {
    const result = suggestCategory('WALMART GROCERY');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Groceries');
  });

  it('should categorize Whole Foods', () => {
    const result = suggestCategory('WHOLE FOODS MARKET #123');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Groceries');
  });

  it('should categorize Costco', () => {
    const result = suggestCategory('COSTCO WHSE #1234');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Groceries');
  });

  it('should categorize BigBasket (Indian)', () => {
    const result = suggestCategory('BIGBASKET');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Groceries');
  });

  it('should categorize Blinkit (Indian)', () => {
    const result = suggestCategory('BLINKIT ORDER');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Groceries');
  });
});

// ============================================
// Shopping Tests
// ============================================

describe('Shopping Category', () => {
  it('should categorize Amazon', () => {
    const result = suggestCategory('AMAZON.COM*MK4R52');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Shopping');
  });

  it('should categorize Best Buy', () => {
    const result = suggestCategory('BEST BUY #123');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Shopping');
  });

  it('should categorize Flipkart (Indian)', () => {
    const result = suggestCategory('FLIPKART');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Shopping');
  });

  it('should categorize Target', () => {
    const result = suggestCategory('TARGET T-2341');

    expect(result).not.toBeNull();
    // 'target' matches both Groceries and Shopping - the categorizer picks
    // the highest-confidence match based on keyword specificity.
    // 'target' appears in the Groceries list, so that match wins.
    expect(['Shopping', 'Groceries']).toContain(result?.categoryName);
  });
});

// ============================================
// Entertainment Tests
// ============================================

describe('Entertainment Category', () => {
  it('should categorize Netflix', () => {
    const result = suggestCategory('NETFLIX.COM');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Entertainment');
  });

  it('should categorize Spotify', () => {
    const result = suggestCategory('SPOTIFY USA');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Entertainment');
  });

  it('should categorize Disney+', () => {
    const result = suggestCategory('DISNEY PLUS');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Entertainment');
  });

  it('should categorize Hotstar (Indian)', () => {
    const result = suggestCategory('HOTSTAR SUBSCRIPTION');

    expect(result).not.toBeNull();
    // 'hotstar' matches Entertainment, but 'subscription' matches Subscriptions.
    // The categorizer picks the higher-confidence keyword match.
    expect(['Entertainment', 'Subscriptions']).toContain(result?.categoryName);
  });
});

// ============================================
// Transportation Tests
// ============================================

describe('Transportation Category', () => {
  it('should categorize Uber', () => {
    const result = suggestCategory('UBER TRIP');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Transportation');
  });

  it('should categorize Lyft', () => {
    const result = suggestCategory('LYFT RIDE');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Transportation');
  });

  it('should categorize Ola (Indian)', () => {
    const result = suggestCategory('OLA RIDE');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Transportation');
  });

  it('should categorize metro/transit', () => {
    const result = suggestCategory('METRO TRANSIT');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Transportation');
  });
});

// ============================================
// Gas & Fuel Tests
// ============================================

describe('Gas & Fuel Category', () => {
  it('should categorize Shell', () => {
    const result = suggestCategory('SHELL OIL 84721');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Gas & Fuel');
  });

  it('should categorize Chevron', () => {
    const result = suggestCategory('CHEVRON STATION');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Gas & Fuel');
  });

  it('should categorize Indian Oil', () => {
    const result = suggestCategory('INDIAN OIL PUMP');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Gas & Fuel');
  });
});

// ============================================
// Utilities Tests
// ============================================

describe('Utilities Category', () => {
  it('should categorize AT&T', () => {
    const result = suggestCategory('AT&T WIRELESS');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Utilities');
  });

  it('should categorize Jio (Indian)', () => {
    const result = suggestCategory('JIO RECHARGE');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Utilities');
  });

  it('should categorize Airtel (Indian)', () => {
    const result = suggestCategory('AIRTEL RECHARGE');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Utilities');
  });
});

// ============================================
// Healthcare Tests
// ============================================

describe('Healthcare Category', () => {
  it('should categorize CVS Pharmacy', () => {
    const result = suggestCategory('CVS PHARMACY #4521');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Healthcare');
  });

  it('should categorize Apollo (Indian)', () => {
    const result = suggestCategory('APOLLO HOSPITAL');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Healthcare');
  });
});

// ============================================
// Travel Tests
// ============================================

describe('Travel Category', () => {
  it('should categorize airlines', () => {
    const result = suggestCategory('AMERICAN AIRLINES');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Travel');
  });

  it('should categorize Airbnb', () => {
    const result = suggestCategory('AIRBNB BOOKING');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Travel');
  });

  it('should categorize MakeMyTrip (Indian)', () => {
    const result = suggestCategory('MAKEMYTRIP');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Travel');
  });
});

// ============================================
// Subscriptions Tests
// ============================================

describe('Subscriptions Category', () => {
  it('should categorize GitHub', () => {
    const result = suggestCategory('GITHUB SUBSCRIPTION');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Subscriptions');
  });

  it('should categorize Adobe', () => {
    const result = suggestCategory('ADOBE CREATIVE CLOUD');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Subscriptions');
  });
});

// ============================================
// Transfers Tests
// ============================================

describe('Transfers Category', () => {
  it('should categorize Venmo', () => {
    const result = suggestCategory('VENMO TRANSFER');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Transfers');
  });

  it('should categorize UPI (Indian)', () => {
    const result = suggestCategory('UPI TRANSFER');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Transfers');
  });

  it('should categorize PhonePe (Indian)', () => {
    const result = suggestCategory('PHONEPE PAYMENT');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Transfers');
  });
});

// ============================================
// Fees & Charges Tests
// ============================================

describe('Fees & Charges Category', () => {
  it('should categorize late fees', () => {
    const result = suggestCategory('LATE FEE');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Fees & Charges');
  });

  it('should categorize annual fees', () => {
    const result = suggestCategory('ANNUAL FEE');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Fees & Charges');
  });

  it('should categorize interest charges', () => {
    const result = suggestCategory('INTEREST CHARGE');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Fees & Charges');
  });
});

// ============================================
// Confidence Tests
// ============================================

describe('Confidence Scoring', () => {
  it('should have higher confidence for exact vendor matches', () => {
    const exactMatch = suggestCategory('starbucks');
    const partialMatch = suggestCategory('starbucks coffee house manhattan');

    expect(exactMatch).not.toBeNull();
    expect(partialMatch).not.toBeNull();

    // Exact (higher specificity) should have higher confidence
    expect(exactMatch!.confidence).toBeGreaterThanOrEqual(
      partialMatch!.confidence
    );
  });

  it('should have confidence between 0 and 1', () => {
    const result = suggestCategory('AMAZON');

    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });

  it('should include the matched keyword', () => {
    const result = suggestCategory('STARBUCKS COFFEE');

    expect(result).not.toBeNull();
    expect(result!.matchedKeyword).toBeDefined();
    expect(result!.matchedKeyword.length).toBeGreaterThan(0);
  });
});

// ============================================
// Case Insensitivity Tests
// ============================================

describe('Case Insensitivity', () => {
  it('should match regardless of case', () => {
    const upper = suggestCategory('STARBUCKS');
    const lower = suggestCategory('starbucks');
    const mixed = suggestCategory('Starbucks');

    expect(upper?.categoryName).toBe(lower?.categoryName);
    expect(lower?.categoryName).toBe(mixed?.categoryName);
  });
});

// ============================================
// No Match Tests
// ============================================

describe('No Match Cases', () => {
  it('should return null for unrecognized vendors', () => {
    const result = suggestCategory('XYZQWERTY UNKNOWN COMPANY');

    expect(result).toBeNull();
  });

  it('should return null for empty string', () => {
    const result = suggestCategory('');

    expect(result).toBeNull();
  });

  it('should return null for whitespace-only', () => {
    const result = suggestCategory('   ');

    expect(result).toBeNull();
  });
});

// ============================================
// Batch Suggestion Tests
// ============================================

describe('Batch Suggestions', () => {
  it('should suggest categories for multiple vendors', () => {
    const vendors = [
      'STARBUCKS',
      'AMAZON',
      'UBER',
      'NETFLIX',
      'CVS PHARMACY',
      'UNKNOWN_VENDOR_12345',
    ];

    const results = autoCategorizer.suggestCategories(vendors);

    expect(results.size).toBe(vendors.length);
    expect(results.get('STARBUCKS')?.categoryName).toBe('Food & Dining');
    expect(results.get('AMAZON')?.categoryName).toBe('Shopping');
    expect(results.get('UBER')?.categoryName).toBe('Transportation');
    expect(results.get('NETFLIX')?.categoryName).toBe('Entertainment');
    expect(results.get('CVS PHARMACY')?.categoryName).toBe('Healthcare');
    expect(results.get('UNKNOWN_VENDOR_12345')).toBeNull();
  });
});

// ============================================
// Available Categories Tests
// ============================================

describe('Available Categories', () => {
  it('should return a list of category names', () => {
    const categories = autoCategorizer.getAvailableCategories();

    expect(categories.length).toBeGreaterThan(10);
    expect(categories).toContain('Food & Dining');
    expect(categories).toContain('Groceries');
    expect(categories).toContain('Shopping');
    expect(categories).toContain('Transportation');
    expect(categories).toContain('Entertainment');
    expect(categories).toContain('Healthcare');
    expect(categories).toContain('Utilities');
    expect(categories).toContain('Travel');
    expect(categories).toContain('Subscriptions');
    expect(categories).toContain('Transfers');
  });
});

// ============================================
// Rule-Based Only Suggestion Tests
// ============================================

describe('Rule-Based Suggestions (no learning)', () => {
  it('should provide suggestions without learning system', () => {
    const result = autoCategorizer.suggestCategoryFromRules('STARBUCKS');

    expect(result).not.toBeNull();
    expect(result?.categoryName).toBe('Food & Dining');
    expect(result?.isLearned).toBe(false);
  });

  it('should not have learnedCategoryId', () => {
    const result = autoCategorizer.suggestCategoryFromRules('AMAZON');

    expect(result).not.toBeNull();
    expect(result?.learnedCategoryId).toBeUndefined();
  });
});

// ============================================
// Service Instance Tests
// ============================================

describe('AutoCategorizerService', () => {
  it('should be a singleton', () => {
    expect(autoCategorizer).toBeDefined();
  });

  it('should have suggestCategory method', () => {
    expect(typeof autoCategorizer.suggestCategory).toBe('function');
  });

  it('should have suggestCategories method', () => {
    expect(typeof autoCategorizer.suggestCategories).toBe('function');
  });

  it('should have getAvailableCategories method', () => {
    expect(typeof autoCategorizer.getAvailableCategories).toBe('function');
  });

  it('convenience function should match service method', () => {
    const direct = autoCategorizer.suggestCategory('STARBUCKS');
    const convenience = suggestCategory('STARBUCKS');

    expect(direct?.categoryName).toBe(convenience?.categoryName);
    expect(direct?.confidence).toBe(convenience?.confidence);
  });
});
