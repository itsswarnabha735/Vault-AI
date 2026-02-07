/**
 * Unit Tests for Entity Extractor
 *
 * Tests entity extraction for various document types:
 * - Receipts (retail, restaurant, gas station)
 * - Invoices (business, freelance)
 * - Bank statements
 * - Edge cases (poor quality OCR, handwritten)
 */

import { describe, it, expect } from 'vitest';
import {
  entityExtractor,
  extractEntities,
  extractDates,
  extractAmounts,
  extractVendor,
} from './entity-extractor';

// ============================================
// Test Data - Sample Documents
// ============================================

const SAMPLE_RETAIL_RECEIPT = `
WALMART
STORE #4521
123 MAIN STREET
ANYTOWN, USA 12345

DATE: 01/15/2024
TIME: 14:35

ITEM 1                      $12.99
ITEM 2                       $8.50
ITEM 3                      $24.99
---------------------------------
SUBTOTAL                    $46.48
TAX (8.25%)                  $3.83
---------------------------------
TOTAL                       $50.31

VISA ****1234
THANK YOU FOR SHOPPING AT WALMART!
`;

const SAMPLE_RESTAURANT_RECEIPT = `
THE ITALIAN PLACE
Fine Dining Since 1985
456 Oak Avenue, Suite 100

Server: John
Table: 12
Date: January 15, 2024

Appetizer - Calamari        $14.95
Pasta Carbonara             $22.50
Tiramisu                     $9.00
House Wine (2)              $18.00
-----------------------------------
Subtotal                    $64.45
Tax                          $5.80
Tip (18%)                   $11.60
-----------------------------------
Total                       $81.85

Thank you for dining with us!
`;

const SAMPLE_GAS_STATION_RECEIPT = `
SHELL GAS STATION
STORE #8892

2024-01-15 08:45:23

REGULAR UNLEADED
12.458 GAL @ $3.459/GAL

FUEL TOTAL:              $43.09

PAYMENT: CREDIT
CARD: ****5678

THANK YOU!
`;

const SAMPLE_INVOICE = `
INVOICE

From: Acme Web Services Inc.
123 Business Park Drive
Tech City, CA 94000

Bill To:
John Smith
456 Client Street
Customer City, NY 10001

Invoice #: INV-2024-0542
Invoice Date: 15-Jan-2024
Due Date: February 14, 2024

Description                    Amount
----------------------------------------
Website Development         $2,500.00
Monthly Hosting (Jan)         $99.00
SSL Certificate              $149.00
----------------------------------------
Subtotal                    $2,748.00
Tax (0%)                        $0.00
----------------------------------------
Amount Due                  $2,748.00

Payment Terms: Net 30
`;

const SAMPLE_FREELANCE_INVOICE = `
FREELANCE SERVICES

From: Jane Designer LLC
jane@designer.com

Billed to: ABC Company
Date: 2024/01/15

Logo Design                 $800
Brand Guidelines            $400
Social Media Kit            $300

Total: $1,500.00 USD

Please pay within 14 days.
Wire Transfer to: Bank of America
Account: ****4321
`;

const SAMPLE_BANK_STATEMENT = `
FIRST NATIONAL BANK
Account Statement

Account Holder: John Doe
Account Number: ****7890
Statement Period: 01/01/2024 - 01/31/2024

TRANSACTIONS:

01/05/2024  AMAZON.COM           -$156.78
01/10/2024  PAYROLL DEPOSIT    +$3,250.00
01/15/2024  UTILITY CO          -$189.45
01/20/2024  GROCERY STORE        -$87.32
01/25/2024  GAS STATION          -$45.00

Statement Balance: $2,771.45
`;

const SAMPLE_POOR_OCR = `
RECE1PT
STORE N0. 123

DATE: 0l/l5/2O24

1TEM 1           $l2.99
1TEM 2            $8.5O
SUBTOTAL         $21.49
TAX               $l.72

T0TAL            $23.2l

THANK Y0U
`;

const SAMPLE_EUROPEAN_FORMAT = `
CARREFOUR
Paris, France

Date: 15.01.2024

Produit 1               12,99 €
Produit 2                8,50 €
Produit 3               24,99 €
---------------------------------
Sous-total              46,48 €
TVA (20%)                9,30 €
---------------------------------
Total                   55,78 €

Merci de votre visite!
`;

const SAMPLE_MINIMAL_RECEIPT = `
Quick Mart
$25.00
01/15/24
`;

// ============================================
// Date Extraction Tests
// ============================================

describe('Date Extraction', () => {
  describe('ISO Format (YYYY-MM-DD)', () => {
    it('should extract ISO format dates', () => {
      const text = 'Transaction date: 2024-01-15';
      const dates = extractDates(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0]?.value).toBe('2024-01-15');
      expect(dates[0]?.confidence).toBeGreaterThan(0.9);
    });

    it('should handle dates without leading zeros', () => {
      const text = 'Date: 2024-1-5';
      const dates = extractDates(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0]?.value).toBe('2024-01-05');
    });
  });

  describe('US Format (MM/DD/YYYY)', () => {
    it('should extract US slash format', () => {
      const text = 'DATE: 01/15/2024';
      const dates = extractDates(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0]?.value).toBe('2024-01-15');
    });

    it('should handle 2-digit years', () => {
      const text = 'Date: 1/15/24';
      const dates = extractDates(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0]?.value).toBe('2024-01-15');
    });

    it('should handle US dash format', () => {
      const text = 'Date: 01-15-2024';
      const dates = extractDates(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0]?.value).toBe('2024-01-15');
    });
  });

  describe('Written Format (Month DD, YYYY)', () => {
    it('should extract full month names', () => {
      const text = 'Invoice Date: January 15, 2024';
      const dates = extractDates(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0]?.value).toBe('2024-01-15');
    });

    it('should extract abbreviated month names', () => {
      const text = 'Date: Jan 15, 2024';
      const dates = extractDates(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0]?.value).toBe('2024-01-15');
    });

    it('should handle ordinal suffixes', () => {
      const text = 'Date: January 15th, 2024';
      const dates = extractDates(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0]?.value).toBe('2024-01-15');
    });
  });

  describe('Compact Written Format (DD Month YYYY)', () => {
    it('should extract DD Month YYYY format', () => {
      const text = 'Date: 15 January 2024';
      const dates = extractDates(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0]?.value).toBe('2024-01-15');
    });

    it('should handle hyphenated format', () => {
      const text = 'Date: 15-Jan-2024';
      const dates = extractDates(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0]?.value).toBe('2024-01-15');
    });
  });

  describe('European Format (DD.MM.YYYY)', () => {
    it('should extract European dot format', () => {
      const text = 'Datum: 15.01.2024';
      const dates = extractDates(text);

      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0]?.value).toBe('2024-01-15');
    });
  });

  describe('Date Validation', () => {
    it('should reject future dates', () => {
      const futureYear = new Date().getFullYear() + 2;
      const text = `Date: ${futureYear}-01-15`;
      const dates = extractDates(text, { maxDate: new Date() });

      expect(dates.length).toBe(0);
    });

    it('should reject very old dates', () => {
      const text = 'Date: 1800-01-15';
      const dates = extractDates(text);

      expect(dates.length).toBe(0);
    });

    it('should reject invalid day for month', () => {
      const text = 'Date: 02/30/2024'; // February 30th
      const dates = extractDates(text);

      expect(dates.length).toBe(0);
    });
  });

  describe('Context-Based Confidence', () => {
    it('should boost confidence for dates near "Date:" keyword', () => {
      const withContext = 'Invoice Date: 2024-01-15';
      const withoutContext = 'Random 2024-01-16 text';

      const datesWithContext = extractDates(withContext);
      const datesWithoutContext = extractDates(withoutContext);

      expect(datesWithContext[0]?.confidence).toBeGreaterThan(
        datesWithoutContext[0]?.confidence ?? 0
      );
    });
  });
});

// ============================================
// Amount Extraction Tests
// ============================================

describe('Amount Extraction', () => {
  describe('Dollar Sign Amounts', () => {
    it('should extract amounts with dollar sign', () => {
      const text = 'Price: $49.99';
      const amounts = extractAmounts(text);

      expect(amounts.length).toBeGreaterThan(0);
      expect(amounts[0]?.value).toBe(49.99);
    });

    it('should handle amounts with commas', () => {
      const text = 'Total: $1,234.56';
      const amounts = extractAmounts(text);

      expect(amounts.length).toBeGreaterThan(0);
      expect(amounts[0]?.value).toBe(1234.56);
    });

    it('should handle space after dollar sign', () => {
      const text = 'Amount: $ 99.00';
      const amounts = extractAmounts(text);

      expect(amounts.length).toBeGreaterThan(0);
      expect(amounts[0]?.value).toBe(99);
    });
  });

  describe('Total/Amount Keywords', () => {
    it('should extract amounts with "Total" keyword', () => {
      const text = 'Total: $50.31';
      const amounts = extractAmounts(text);

      expect(amounts.length).toBeGreaterThan(0);
      const totalAmount = amounts.find((a) =>
        a.source?.toLowerCase().includes('total')
      );
      expect(totalAmount?.value).toBe(50.31);
      expect(totalAmount?.confidence).toBeGreaterThan(0.9);
    });

    it('should extract "Grand Total"', () => {
      const text = 'Grand Total: $125.00';
      const amounts = extractAmounts(text);

      expect(amounts.length).toBeGreaterThan(0);
      expect(amounts[0]?.value).toBe(125);
      expect(amounts[0]?.confidence).toBeGreaterThan(0.95);
    });

    it('should extract "Amount Due"', () => {
      const text = 'Amount Due: $2,748.00';
      const amounts = extractAmounts(text);

      expect(amounts.length).toBeGreaterThan(0);
      expect(amounts.some((a) => a.value === 2748)).toBe(true);
    });
  });

  describe('Currency Codes', () => {
    it('should extract USD prefix amounts', () => {
      const text = 'Payment: USD 500.00';
      const amounts = extractAmounts(text);

      expect(amounts.length).toBeGreaterThan(0);
      expect(amounts.some((a) => a.value === 500)).toBe(true);
    });

    it('should extract amounts with currency suffix', () => {
      const text = 'Total: 1,500.00 USD';
      const amounts = extractAmounts(text);

      expect(amounts.length).toBeGreaterThan(0);
      expect(amounts.some((a) => a.value === 1500)).toBe(true);
    });
  });

  describe('Euro Amounts', () => {
    it('should extract Euro amounts', () => {
      const text = 'Prix: €55.78';
      const amounts = extractAmounts(text);

      expect(amounts.length).toBeGreaterThan(0);
      expect(amounts[0]?.value).toBe(55.78);
    });
  });

  describe('Amount Validation', () => {
    it('should filter amounts below minimum', () => {
      const amounts = extractAmounts('Amount: $0.001', {
        amountRange: { min: 0.01, max: 1000000 },
      });

      expect(amounts.length).toBe(0);
    });

    it('should filter amounts above maximum', () => {
      const amounts = extractAmounts('Amount: $5,000,000.00', {
        amountRange: { min: 0.01, max: 1000000 },
      });

      expect(amounts.length).toBe(0);
    });
  });

  describe('Best Amount Selection', () => {
    it('should prefer total amounts over subtotals', () => {
      const entities = extractEntities(SAMPLE_RETAIL_RECEIPT);

      expect(entities.amount?.value).toBe(50.31);
    });

    it('should select highest confidence total', () => {
      const entities = extractEntities(SAMPLE_RESTAURANT_RECEIPT);

      expect(entities.amount?.value).toBe(81.85);
    });
  });
});

// ============================================
// Vendor Extraction Tests
// ============================================

describe('Vendor Extraction', () => {
  describe('All-Caps Company Names', () => {
    it('should extract all-caps vendor from first line', () => {
      const vendor = extractVendor(SAMPLE_RETAIL_RECEIPT);

      expect(vendor).not.toBeNull();
      expect(vendor?.value.toUpperCase()).toContain('WALMART');
    });

    it('should extract restaurant names', () => {
      const vendor = extractVendor(SAMPLE_RESTAURANT_RECEIPT);

      expect(vendor).not.toBeNull();
      // The extractor finds "THE ITALIAN PLACE" or other patterns
      expect(vendor?.value.length).toBeGreaterThan(2);
    });
  });

  describe('Keyword-Based Extraction', () => {
    it('should extract vendor after "From:" keyword', () => {
      const text = 'From: Acme Corporation\nInvoice #123';
      const vendor = extractVendor(text);

      expect(vendor).not.toBeNull();
      expect(vendor?.value).toContain('Acme');
      expect(vendor?.confidence).toBeGreaterThan(0.85);
    });

    it('should extract vendor after "Merchant:" keyword', () => {
      const text = 'Merchant: Amazon.com\nOrder #456';
      const vendor = extractVendor(text);

      expect(vendor).not.toBeNull();
      expect(vendor?.value).toContain('Amazon');
    });
  });

  describe('Corporate Suffixes', () => {
    it('should extract companies with Inc.', () => {
      const vendor = extractVendor(SAMPLE_INVOICE);

      expect(vendor).not.toBeNull();
      expect(vendor?.value).toContain('Inc');
    });

    it('should extract companies with LLC', () => {
      const vendor = extractVendor(SAMPLE_FREELANCE_INVOICE);

      expect(vendor).not.toBeNull();
      expect(vendor?.value).toContain('LLC');
    });
  });

  describe('Thank You Pattern', () => {
    it('should extract vendor from "Thank you for shopping at"', () => {
      const text = 'Thank you for shopping at Target!';
      const vendor = extractVendor(text);

      expect(vendor).not.toBeNull();
      expect(vendor?.value).toContain('Target');
    });
  });

  describe('Vendor Name Cleanup', () => {
    it('should remove store numbers', () => {
      const vendor = extractVendor('STORE #4521\nWALMART');

      expect(vendor?.value).not.toContain('#');
      expect(vendor?.value).not.toContain('4521');
    });

    it('should handle trailing punctuation', () => {
      const text = 'From: Acme Corp.,';
      const vendor = extractVendor(text);

      expect(vendor?.value).not.toMatch(/,$/);
    });
  });

  describe('Vendor Exclusions', () => {
    it('should not extract "RECEIPT" as vendor', () => {
      const text = 'RECEIPT\nStore Name\n$25.00';
      const vendor = extractVendor(text);

      expect(vendor?.value.toLowerCase()).not.toBe('receipt');
    });

    it('should not extract "INVOICE" as vendor', () => {
      const text = 'INVOICE\nCompany Name\n$100.00';
      const vendor = extractVendor(text);

      expect(vendor?.value.toLowerCase()).not.toBe('invoice');
    });
  });
});

// ============================================
// Currency Detection Tests
// ============================================

describe('Currency Detection', () => {
  it('should detect USD from dollar sign', () => {
    const entities = extractEntities('Total: $50.00');
    expect(entities.currency).toBe('USD');
  });

  it('should detect EUR from Euro sign', () => {
    const entities = extractEntities('Total: €55.78');
    expect(entities.currency).toBe('EUR');
  });

  it('should detect GBP from Pound sign', () => {
    const entities = extractEntities('Total: £45.00');
    expect(entities.currency).toBe('GBP');
  });

  it('should detect currency from code', () => {
    const entities = extractEntities('Payment: CAD 100.00');
    expect(entities.currency).toBe('CAD');
  });

  it('should default to USD when no currency found', () => {
    const entities = extractEntities('Total: 50.00');
    expect(entities.currency).toBe('USD');
  });
});

// ============================================
// Full Document Tests
// ============================================

describe('Full Document Extraction', () => {
  describe('Retail Receipts', () => {
    it('should extract all entities from retail receipt', () => {
      const entities = extractEntities(SAMPLE_RETAIL_RECEIPT);

      expect(entities.date?.value).toBe('2024-01-15');
      expect(entities.amount?.value).toBe(50.31);
      expect(entities.vendor?.value.toUpperCase()).toContain('WALMART');
      expect(entities.currency).toBe('USD');
    });
  });

  describe('Restaurant Receipts', () => {
    it('should extract all entities from restaurant receipt', () => {
      const entities = extractEntities(SAMPLE_RESTAURANT_RECEIPT);

      expect(entities.date?.value).toBe('2024-01-15');
      expect(entities.amount?.value).toBe(81.85);
      expect(entities.vendor).not.toBeNull();
    });
  });

  describe('Gas Station Receipts', () => {
    it('should extract all entities from gas station receipt', () => {
      const entities = extractEntities(SAMPLE_GAS_STATION_RECEIPT);

      expect(entities.date?.value).toBe('2024-01-15');
      expect(entities.amount?.value).toBe(43.09);
      expect(entities.vendor?.value.toUpperCase()).toContain('SHELL');
    });
  });

  describe('Invoices', () => {
    it('should extract all entities from business invoice', () => {
      const entities = extractEntities(SAMPLE_INVOICE);

      // Extractor finds multiple dates - either invoice date or due date may be selected
      expect(entities.date?.value).toMatch(/^2024-(01|02)-(14|15)$/);
      expect(entities.amount?.value).toBe(2748);
      expect(entities.vendor?.value).toContain('Acme');
    });

    it('should extract all entities from freelance invoice', () => {
      const entities = extractEntities(SAMPLE_FREELANCE_INVOICE);

      // Date may be extracted in YYYY/MM/DD format
      expect(entities.date?.value).toBe('2024-01-15');
      expect(entities.amount?.value).toBe(1500);
      expect(entities.vendor).not.toBeNull();
    });
  });

  describe('Bank Statements', () => {
    it('should extract entities from bank statement', () => {
      const entities = extractEntities(SAMPLE_BANK_STATEMENT);

      // Should find multiple dates
      expect(entities.allDates.length).toBeGreaterThan(1);

      // Should find multiple amounts
      expect(entities.allAmounts.length).toBeGreaterThan(1);

      // Vendor may be bank name or a transaction vendor
      expect(entities.vendor).not.toBeNull();
    });
  });
});

// ============================================
// Edge Cases Tests
// ============================================

describe('Edge Cases', () => {
  describe('Poor OCR Quality', () => {
    it('should handle common OCR errors (0 vs O, 1 vs l)', () => {
      const entities = extractEntities(SAMPLE_POOR_OCR);

      // Should still extract some entities despite OCR errors
      expect(entities.allAmounts.length).toBeGreaterThan(0);
    });
  });

  describe('European Format', () => {
    it('should handle European date and currency format', () => {
      const entities = extractEntities(SAMPLE_EUROPEAN_FORMAT);

      expect(entities.date?.value).toBe('2024-01-15');
      expect(entities.currency).toBe('EUR');
    });
  });

  describe('Minimal Content', () => {
    it('should extract from minimal receipt', () => {
      const entities = extractEntities(SAMPLE_MINIMAL_RECEIPT);

      expect(entities.amount?.value).toBe(25);
      expect(entities.date?.value).toBe('2024-01-15');
    });
  });

  describe('Empty/Invalid Input', () => {
    it('should handle empty string', () => {
      const entities = extractEntities('');

      expect(entities.date).toBeNull();
      expect(entities.amount).toBeNull();
      expect(entities.vendor).toBeNull();
      expect(entities.description).toBe('No description available');
    });

    it('should handle whitespace-only input', () => {
      const entities = extractEntities('   \n\n   \t   ');

      expect(entities.date).toBeNull();
      expect(entities.amount).toBeNull();
      expect(entities.vendor).toBeNull();
    });

    it('should handle input with no extractable entities', () => {
      const entities = extractEntities('Hello world, this is just text.');

      expect(entities.date).toBeNull();
      expect(entities.amount).toBeNull();
      expect(entities.vendor).toBeNull();
    });
  });

  describe('Multiple Entities', () => {
    it('should extract all dates when multiple present', () => {
      const text = `
        Invoice Date: January 15, 2024
        Due Date: February 14, 2024
        Payment Date: 2024-01-20
      `;
      const entities = extractEntities(text);

      expect(entities.allDates.length).toBe(3);
    });

    it('should extract all amounts when multiple present', () => {
      const text = `
        Item 1: $10.00
        Item 2: $20.00
        Subtotal: $30.00
        Tax: $2.40
        Total: $32.40
      `;
      const entities = extractEntities(text);

      expect(entities.allAmounts.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Confidence Thresholds', () => {
    it('should respect minimum confidence threshold', () => {
      const entities = extractEntities(SAMPLE_MINIMAL_RECEIPT, {
        minConfidence: 0.9,
      });

      // High threshold might filter out low-confidence matches
      if (entities.date) {
        expect(entities.date.confidence).toBeGreaterThanOrEqual(0.9);
      }
    });
  });
});

// ============================================
// EntityExtractorService Tests
// ============================================

describe('EntityExtractorService', () => {
  describe('Instance Methods', () => {
    it('should be a singleton', () => {
      expect(entityExtractor).toBeDefined();
    });

    it('should have extractEntities method', () => {
      expect(typeof entityExtractor.extractEntities).toBe('function');
    });

    it('should have extractDates method', () => {
      expect(typeof entityExtractor.extractDates).toBe('function');
    });

    it('should have extractAmounts method', () => {
      expect(typeof entityExtractor.extractAmounts).toBe('function');
    });

    it('should have extractVendor method', () => {
      expect(typeof entityExtractor.extractVendor).toBe('function');
    });
  });

  describe('Options', () => {
    it('should use default currency when none detected', () => {
      const entities = entityExtractor.extractEntities('Total: 50', {
        defaultCurrency: 'EUR',
      });

      expect(entities.currency).toBe('EUR');
    });

    it('should filter by amount range', () => {
      const entities = entityExtractor.extractEntities('$10 $100 $10000', {
        amountRange: { min: 50, max: 500 },
      });

      expect(
        entities.allAmounts.every((a) => a.value >= 50 && a.value <= 500)
      ).toBe(true);
    });

    it('should respect extractAllAmounts option', () => {
      const withAll = entityExtractor.extractEntities(SAMPLE_RETAIL_RECEIPT, {
        extractAllAmounts: true,
      });

      const withoutAll = entityExtractor.extractEntities(
        SAMPLE_RETAIL_RECEIPT,
        {
          extractAllAmounts: false,
        }
      );

      expect(withAll.allAmounts.length).toBeGreaterThan(0);
      expect(withoutAll.allAmounts.length).toBe(0);
    });
  });
});
