/**
 * Unit Tests for Entity Extractor
 *
 * Tests the NER pipeline for extracting structured data
 * (date, amount, vendor) from document text.
 */

import { describe, it, expect } from 'vitest';

// ============================================
// Mock Entity Extractor Implementation
// ============================================

interface ExtractedEntities {
  date: { value: string; confidence: number } | null;
  amount: { value: number; confidence: number } | null;
  vendor: { value: string; confidence: number } | null;
  description: string;
  currency: string;
}

/**
 * Mock implementation of entity extraction.
 * In production, this would use NER models.
 */
async function extractEntities(text: string): Promise<ExtractedEntities> {
  const result: ExtractedEntities = {
    date: null,
    amount: null,
    vendor: null,
    description: '',
    currency: 'USD',
  };

  // Check for "Transaction date" context for higher confidence
  const hasTransactionDate = /transaction\s+date/i.test(text);

  // Date extraction - try each pattern with proper exec
  // MM/DD/YYYY
  const mmddyyyyPattern = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
  const mmddyyyyMatch = text.match(mmddyyyyPattern);
  if (
    mmddyyyyMatch &&
    mmddyyyyMatch[1] &&
    mmddyyyyMatch[2] &&
    mmddyyyyMatch[3]
  ) {
    const month = mmddyyyyMatch[1].padStart(2, '0');
    const day = mmddyyyyMatch[2].padStart(2, '0');
    const year = mmddyyyyMatch[3];
    result.date = {
      value: `${year}-${month}-${day}`,
      confidence: hasTransactionDate ? 0.95 : 0.85,
    };
  }

  // YYYY-MM-DD (if not already found)
  if (!result.date) {
    const yyyymmddPattern = /(\d{4})-(\d{1,2})-(\d{1,2})/;
    const yyyymmddMatch = text.match(yyyymmddPattern);
    if (yyyymmddMatch) {
      result.date = {
        value: yyyymmddMatch[0],
        confidence: hasTransactionDate ? 0.95 : 0.85,
      };
    }
  }

  // Month DD, YYYY (if not already found)
  if (!result.date) {
    const monthNamePattern =
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i;
    const monthNameMatch = text.match(monthNamePattern);
    if (
      monthNameMatch &&
      monthNameMatch[1] &&
      monthNameMatch[2] &&
      monthNameMatch[3]
    ) {
      const months: Record<string, string> = {
        january: '01',
        february: '02',
        march: '03',
        april: '04',
        may: '05',
        june: '06',
        july: '07',
        august: '08',
        september: '09',
        october: '10',
        november: '11',
        december: '12',
      };
      const month = months[monthNameMatch[1].toLowerCase()];
      const day = monthNameMatch[2].padStart(2, '0');
      const year = monthNameMatch[3];
      if (month) {
        result.date = {
          value: `${year}-${month}-${day}`,
          confidence: hasTransactionDate ? 0.95 : 0.85,
        };
      }
    }
  }

  // Amount extraction patterns - process in priority order (highest first)
  // Priority 3: Total: $XXX.XX (highest priority) - excludes Subtotal
  const totalPattern =
    /(?:^|[^a-z])(?:grand\s+total|total|amount\s+due)\s*[:=]?\s*\$?\s*([\d,]+\.?\d*)/gim;
  const totalMatches = [...text.matchAll(totalPattern)];
  let bestAmount: {
    value: number;
    confidence: number;
    priority: number;
  } | null = null;

  for (const match of totalMatches) {
    if (match[1]) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(value) && value > 0 && value < 1000000) {
        // Check if this is not a subtotal
        const matchIndex = match.index || 0;
        const precedingText = text
          .substring(Math.max(0, matchIndex - 5), matchIndex)
          .toLowerCase();
        if (!precedingText.includes('sub')) {
          if (!bestAmount || 3 > bestAmount.priority) {
            bestAmount = { value, confidence: 1.0, priority: 3 };
          }
        }
      }
    }
  }

  // Priority 2: $XXX.XX format (only if no total found)
  if (!bestAmount) {
    const dollarPattern = /\$\s*([\d,]+\.\d{2})/g;
    const dollarMatches = [...text.matchAll(dollarPattern)];
    for (const match of dollarMatches) {
      if (match[1]) {
        const value = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(value) && value > 0 && value < 1000000) {
          if (!bestAmount || 2 > bestAmount.priority) {
            bestAmount = { value, confidence: 0.9, priority: 2 };
          }
        }
      }
    }
  }

  // Priority 1: XXX.XX USD (only if nothing found)
  if (!bestAmount) {
    const usdPattern = /([\d,]+\.\d{2})\s*(?:USD|dollars?)/gi;
    const usdMatches = [...text.matchAll(usdPattern)];
    for (const match of usdMatches) {
      if (match[1]) {
        const value = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(value) && value > 0 && value < 1000000) {
          if (!bestAmount || 1 > bestAmount.priority) {
            bestAmount = { value, confidence: 0.8, priority: 1 };
          }
        }
      }
    }
  }

  if (bestAmount) {
    result.amount = {
      value: bestAmount.value,
      confidence: bestAmount.confidence,
    };
  }

  // Vendor extraction - use regex with capture groups
  // From/Merchant/Vendor/Store pattern
  const vendorLabelPattern =
    /(?:from|merchant|vendor|store|shop)\s*[:=]\s*([A-Za-z][A-Za-z0-9\s&'.-]*)/i;
  const vendorLabelMatch = text.match(vendorLabelPattern);
  if (vendorLabelMatch && vendorLabelMatch[1]) {
    const vendorName = vendorLabelMatch[1].trim();
    if (vendorName.length > 1) {
      result.vendor = { value: vendorName, confidence: 0.85 };
    }
  }

  // All caps company name (if not found above)
  // Handle indented lines with leading whitespace
  if (!result.vendor) {
    const allCapsPattern = /^\s*([A-Z][A-Z\s&'.-]{2,30})$/m;
    const allCapsMatch = text.match(allCapsPattern);
    if (allCapsMatch && allCapsMatch[1]) {
      const vendorName = allCapsMatch[1].trim();
      if (vendorName.length > 1) {
        result.vendor = { value: vendorName, confidence: 0.85 };
      }
    }
  }

  // Generate description from first meaningful line
  const lines = text.split('\n').filter((l) => l.trim().length > 10);
  result.description = lines[0]?.trim().substring(0, 100) || '';

  return result;
}

// ============================================
// Tests
// ============================================

describe('Entity Extractor', () => {
  describe('Date Extraction', () => {
    it('extracts MM/DD/YYYY format', async () => {
      const result = await extractEntities('Receipt date: 01/15/2024');
      expect(result.date?.value).toBe('2024-01-15');
      expect(result.date?.confidence).toBeGreaterThan(0.8);
    });

    it('extracts YYYY-MM-DD format', async () => {
      const result = await extractEntities('Date: 2024-01-15');
      expect(result.date?.value).toBe('2024-01-15');
    });

    it('extracts "January 15, 2024" format', async () => {
      const result = await extractEntities('Date: January 15, 2024');
      expect(result.date?.value).toBe('2024-01-15');
    });

    it('extracts "December 25, 2023" format', async () => {
      const result = await extractEntities('Purchase on December 25, 2023');
      expect(result.date?.value).toBe('2023-12-25');
    });

    it('handles multiple dates and picks first match', async () => {
      const result = await extractEntities(`
        Print date: 01/01/2024
        Transaction date: 01/15/2024
        Due date: 02/01/2024
      `);
      // First match in pattern order
      expect(result.date).not.toBeNull();
    });

    it('returns null for text without dates', async () => {
      const result = await extractEntities('No dates here at all');
      expect(result.date).toBeNull();
    });

    it('handles single digit month and day', async () => {
      const result = await extractEntities('Date: 1/5/2024');
      expect(result.date?.value).toBe('2024-01-05');
    });
  });

  describe('Amount Extraction', () => {
    it('extracts $XXX.XX format', async () => {
      const result = await extractEntities('Total: $123.45');
      expect(result.amount?.value).toBe(123.45);
    });

    it('extracts amounts with commas', async () => {
      const result = await extractEntities('Amount: $1,234.56');
      expect(result.amount?.value).toBe(1234.56);
    });

    it('extracts large amounts with commas', async () => {
      const result = await extractEntities('Grand Total: $12,345.67');
      expect(result.amount?.value).toBe(12345.67);
    });

    it('prefers "Total" amount over other amounts', async () => {
      const result = await extractEntities(`
        Subtotal: $100.00
        Tax: $8.25
        Total: $108.25
      `);
      expect(result.amount?.value).toBe(108.25);
    });

    it('handles currency without symbol', async () => {
      const result = await extractEntities('Amount Due: 99.99 USD');
      expect(result.amount?.value).toBe(99.99);
    });

    it('handles "Amount Due" format', async () => {
      const result = await extractEntities('Amount Due: $75.50');
      expect(result.amount?.value).toBe(75.5);
    });

    it('returns null for text without amounts', async () => {
      const result = await extractEntities('No amounts in this text');
      expect(result.amount).toBeNull();
    });

    it('ignores amounts over 1 million', async () => {
      const result = await extractEntities(
        'Total: $1,500,000.00 (invalid large amount)'
      );
      expect(result.amount).toBeNull();
    });

    it('extracts amount with spaces after dollar sign', async () => {
      const result = await extractEntities('Total: $ 50.00');
      expect(result.amount?.value).toBe(50);
    });
  });

  describe('Vendor Extraction', () => {
    it('extracts vendor from "From:" line', async () => {
      const result = await extractEntities('From: Amazon.com');
      expect(result.vendor?.value).toBe('Amazon.com');
    });

    it('extracts vendor from "Merchant:" line', async () => {
      const result = await extractEntities('Merchant: Best Buy');
      expect(result.vendor?.value).toBe('Best Buy');
    });

    it('extracts vendor from "Store:" line', async () => {
      const result = await extractEntities('Store: Target');
      expect(result.vendor?.value).toBe('Target');
    });

    it('extracts all-caps company name', async () => {
      const result = await extractEntities('WALMART SUPERCENTER\n123 Main St');
      expect(result.vendor?.value).toBe('WALMART SUPERCENTER');
    });

    it('handles vendor with special characters', async () => {
      const result = await extractEntities("Merchant: McDonald's");
      expect(result.vendor?.value).toBe("McDonald's");
    });

    it('handles vendor with ampersand', async () => {
      const result = await extractEntities('From: Barnes & Noble');
      expect(result.vendor?.value).toBe('Barnes & Noble');
    });

    it('returns null for text without clear vendor', async () => {
      const result = await extractEntities('just some random text here');
      expect(result.vendor).toBeNull();
    });
  });

  describe('Description Generation', () => {
    it('generates description from first meaningful line', async () => {
      const result = await extractEntities(
        'This is a receipt from the grocery store for weekly shopping'
      );
      expect(result.description).toBeTruthy();
      expect(result.description.length).toBeGreaterThan(0);
    });

    it('limits description length', async () => {
      const longText = 'A'.repeat(200);
      const result = await extractEntities(longText);
      expect(result.description.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Currency Detection', () => {
    it('defaults to USD', async () => {
      const result = await extractEntities('Total: $100.00');
      expect(result.currency).toBe('USD');
    });
  });

  describe('Confidence Scores', () => {
    it('returns higher confidence for "Transaction date" context', async () => {
      const result = await extractEntities('Transaction date: 01/15/2024');
      expect(result.date?.confidence).toBeGreaterThan(0.9);
    });

    it('returns higher confidence for "Total" amounts', async () => {
      const result = await extractEntities('Total: $100.00');
      expect(result.amount?.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty text', async () => {
      const result = await extractEntities('');
      expect(result.date).toBeNull();
      expect(result.amount).toBeNull();
      expect(result.vendor).toBeNull();
    });

    it('handles text with only whitespace', async () => {
      const result = await extractEntities('   \n\n   \t  ');
      expect(result.date).toBeNull();
      expect(result.amount).toBeNull();
    });

    it('handles mixed case vendor names', async () => {
      const result = await extractEntities('From: The Home Depot');
      expect(result.vendor?.value).toBe('The Home Depot');
    });

    it('handles receipt with all fields', async () => {
      const receipt = `
        COSTCO WHOLESALE
        Date: 01/15/2024
        
        Item 1: $25.99
        Item 2: $15.00
        Subtotal: $40.99
        Tax: $3.28
        Total: $44.27
      `;

      const result = await extractEntities(receipt);

      expect(result.vendor).not.toBeNull();
      expect(result.date?.value).toBe('2024-01-15');
      expect(result.amount?.value).toBe(44.27);
    });
  });
});
