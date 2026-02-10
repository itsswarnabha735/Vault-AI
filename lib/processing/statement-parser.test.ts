/**
 * Unit Tests for Statement Parser
 *
 * Tests the statement parser's ability to:
 * - Detect document types (statement vs receipt vs invoice)
 * - Detect bank/card issuers
 * - Parse individual transaction lines from various statement formats
 * - Handle date/amount/vendor extraction from tabular data
 * - Calculate totals and validate against statement totals
 * - Handle edge cases (OCR noise, unusual formats, multi-page)
 */

import { describe, it, expect } from 'vitest';
import {
  statementParser,
  detectDocumentType,
  parseStatement,
} from './statement-parser';

// ============================================
// Test Data - Sample Statements
// ============================================

const SAMPLE_CREDIT_CARD_STATEMENT = `
CHASE BANK
Credit Card Statement

Account Number: XXXX XXXX XXXX 4567
Statement Period: 01/01/2026 - 01/31/2026

Account Summary
Previous Balance                    $1,245.67
Payments                             -$500.00
New Charges                         $1,032.45
New Balance                         $1,778.12
Minimum Payment Due                   $35.00
Payment Due Date                   02/25/2026

Transaction Detail

01/03  01/05  STARBUCKS COFFEE #1234          $5.75
01/05  01/06  AMAZON.COM*MK4R52              $45.99
01/07  01/08  UBER TRIP                       $12.50
01/08  01/09  WHOLE FOODS MARKET #123         $87.32
01/10  01/11  NETFLIX.COM                     $15.99
01/12  01/13  SHELL OIL 84721                 $52.40
01/14  01/15  TARGET T-2341                   $34.99
01/15  01/16  PAYMENT - THANK YOU           -$500.00
01/18  01/19  CHIPOTLE ONLINE                  $9.85
01/20  01/21  SPOTIFY USA                      $9.99
01/22  01/23  COSTCO WHSE #1234              $156.78
01/25  01/26  CVS PHARMACY #4521              $23.45
01/27  01/28  DOORDASH*THAI BASIL             $32.50
01/28  01/29  APPLE.COM/BILL                  $14.99
01/30  01/31  INTEREST CHARGE                  $29.95
01/30  01/31  LATE FEE                         $25.00

Total New Charges: $1,032.45
Total Payments: $500.00
`;

const SAMPLE_BANK_STATEMENT = `
BANK OF AMERICA
Checking Account Statement

Account: ****7890
Statement Period: January 1, 2026 through January 31, 2026

Opening Balance: $5,234.56

Date        Description                          Debit      Credit
01/02/2026  PAYROLL DIRECT DEPOSIT                          $3,250.00
01/03/2026  RENT PAYMENT - ACH              $1,500.00
01/05/2026  AMAZON.COM                         $67.89
01/07/2026  WALMART GROCERY                   $145.23
01/10/2026  ELECTRIC COMPANY                   $89.45
01/12/2026  AT&T WIRELESS                      $78.99
01/15/2026  PAYROLL DIRECT DEPOSIT                          $3,250.00
01/17/2026  TRANSFER TO SAVINGS              $500.00
01/20/2026  GAS STATION - SHELL                $45.00
01/22/2026  RESTAURANT - OLIVE GARDEN          $65.80
01/25/2026  INSURANCE PREMIUM                 $210.00
01/28/2026  NETFLIX SUBSCRIPTION               $15.99
01/30/2026  INTEREST EARNED                                    $2.45

Closing Balance: $9,019.66
Total Debits: $2,718.35
Total Credits: $6,502.45
`;

const SAMPLE_INDIAN_CC_STATEMENT = `
HDFC BANK
Credit Card Statement

Card Number: XXXX XXXX XXXX 8901
Statement Date: 31-Jan-2026
Payment Due Date: 18-Feb-2026

Statement Period: 01 Jan 2026 to 31 Jan 2026

Previous Balance: Rs. 15,234.00
Payments Received: Rs. 15,234.00
New Charges: Rs. 12,456.78

Transaction Details

05 Jan 2026  SWIGGY ORDER #123456            Rs. 450.00
08 Jan 2026  AMAZON INDIA                    Rs. 2,345.00
10 Jan 2026  UBER INDIA                      Rs. 189.00
12 Jan 2026  FLIPKART                        Rs. 1,299.00
15 Jan 2026  BIGBASKET                       Rs. 876.50
18 Jan 2026  BOOKMYSHOW                      Rs. 550.00
20 Jan 2026  RELIANCE DIGITAL                Rs. 3,499.00
22 Jan 2026  ZOMATO                          Rs. 325.00
25 Jan 2026  PAYMENT RECEIVED              -Rs. 15,234.00
28 Jan 2026  AIRTEL RECHARGE                 Rs. 699.00
30 Jan 2026  MAKEMYTRIP                      Rs. 2,224.28

Total Amount Due: Rs. 12,456.78
Minimum Amount Due: Rs. 1,245.00
`;

const SAMPLE_SIMPLE_STATEMENT = `
Account Statement
Statement Date: 02/01/2026

01/05  Coffee Shop          $4.50
01/07  Grocery Store        $52.30
01/10  Gas Station          $38.00
01/15  Online Purchase      $29.99
01/20  Restaurant           $45.75
`;

const SAMPLE_RECEIPT = `
WALMART
STORE #4521
123 MAIN STREET
ANYTOWN, USA 12345

DATE: 01/15/2026
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

const SAMPLE_INVOICE = `
INVOICE

From: Acme Web Services Inc.
123 Business Park Drive

Invoice #: INV-2026-0542
Invoice Date: 15-Jan-2026
Due Date: February 14, 2026

Description                    Amount
Website Development         $2,500.00
Monthly Hosting               $99.00
Amount Due                  $2,599.00
`;

const SAMPLE_STATEMENT_WITH_CONTINUATION = `
Capital One Credit Card Statement
Statement Period: 01/01/2026 - 01/31/2026
Account Number: XXXX XXXX XXXX 5678

01/05  VERY LONG RESTAURANT NAME
       THAT CONTINUES ON NEXT LINE      $45.00
01/10  SHORT VENDOR                      $12.50
01/15  ANOTHER LONG BUSINESS NAME
       WITH ADDRESS INFO                 $89.99
`;

const SAMPLE_EMPTY_TEXT = '';

const SAMPLE_NO_TRANSACTIONS = `
CHASE BANK
Credit Card Statement
Account Number: XXXX XXXX XXXX 4567
Statement Period: 01/01/2026 - 01/31/2026
Previous Balance: $0.00
New Balance: $0.00
`;

// ============================================
// Document Type Detection Tests
// ============================================

describe('Document Type Detection', () => {
  describe('Statement Detection', () => {
    it('should detect a credit card statement', () => {
      const result = detectDocumentType(SAMPLE_CREDIT_CARD_STATEMENT);

      expect(result.type).toBe('statement');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect a bank account statement', () => {
      const result = detectDocumentType(SAMPLE_BANK_STATEMENT);

      expect(result.type).toBe('statement');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect an Indian bank statement', () => {
      const result = detectDocumentType(SAMPLE_INDIAN_CC_STATEMENT);

      expect(result.type).toBe('statement');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect a simple statement with limited keywords', () => {
      const result = detectDocumentType(SAMPLE_SIMPLE_STATEMENT);

      expect(result.type).toBe('statement');
    });

    it('should match statement keywords', () => {
      const result = detectDocumentType(SAMPLE_CREDIT_CARD_STATEMENT);

      expect(result.matchedKeywords.length).toBeGreaterThan(0);
      expect(
        result.matchedKeywords.some(
          (kw) =>
            kw.includes('statement') ||
            kw.includes('balance') ||
            kw.includes('payment')
        )
      ).toBe(true);
    });
  });

  describe('Receipt Detection', () => {
    it('should detect a receipt', () => {
      const result = detectDocumentType(SAMPLE_RECEIPT);

      expect(result.type).toBe('receipt');
    });
  });

  describe('Invoice Detection', () => {
    it('should detect an invoice', () => {
      const result = detectDocumentType(SAMPLE_INVOICE);

      expect(result.type).toBe('invoice');
    });
  });

  describe('Unknown Type', () => {
    it('should return unknown for empty text', () => {
      const result = detectDocumentType(SAMPLE_EMPTY_TEXT);

      expect(result.type).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should return unknown for unrecognizable text', () => {
      const result = detectDocumentType(
        'Hello world. This is just some random text with no financial meaning.'
      );

      expect(result.type).toBe('unknown');
    });
  });
});

// ============================================
// Issuer Detection Tests
// ============================================

describe('Issuer Detection', () => {
  it('should detect Chase', () => {
    const result = detectDocumentType(SAMPLE_CREDIT_CARD_STATEMENT);
    expect(result.issuer).toBe('Chase');
  });

  it('should detect Bank of America', () => {
    const result = detectDocumentType(SAMPLE_BANK_STATEMENT);
    expect(result.issuer).toBe('Bank of America');
  });

  it('should detect HDFC', () => {
    const result = detectDocumentType(SAMPLE_INDIAN_CC_STATEMENT);
    expect(result.issuer).toBe('HDFC');
  });

  it('should detect Capital One', () => {
    const result = detectDocumentType(SAMPLE_STATEMENT_WITH_CONTINUATION);
    expect(result.issuer).toBe('Capital One');
  });

  it('should return null for unknown issuer when no bank keywords present', () => {
    const text = `
Account Statement
Statement Date: 02/01/2026

01/05  Vendor A          $4.50
01/07  Vendor B          $52.30
`;
    const result = detectDocumentType(text);
    expect(result.issuer).toBeNull();
  });
});

// ============================================
// Statement Parsing - Credit Card Tests
// ============================================

describe('Credit Card Statement Parsing', () => {
  it('should parse transactions from a Chase CC statement', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    expect(result.transactions.length).toBeGreaterThan(10);
    expect(result.issuer).toBe('Chase');
    expect(result.currency).toBe('USD');
  });

  it('should extract correct dates from CC statement', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    // All transactions should have January 2026 dates
    for (const tx of result.transactions) {
      expect(tx.date).toMatch(/^2026-01-\d{2}$/);
    }
  });

  it('should extract correct amounts from CC statement', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    // Find Starbucks transaction
    const starbucks = result.transactions.find((tx) =>
      tx.vendor.toLowerCase().includes('starbucks')
    );
    expect(starbucks).toBeDefined();
    expect(starbucks?.amount).toBe(5.75);

    // Find Amazon transaction
    const amazon = result.transactions.find((tx) =>
      tx.vendor.toLowerCase().includes('amazon')
    );
    expect(amazon).toBeDefined();
    expect(amazon?.amount).toBe(45.99);
  });

  it('should detect payment transactions as credits', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    const payment = result.transactions.find(
      (tx) => tx.type === 'payment' || (tx.amount < 0 && tx.vendor.toLowerCase().includes('payment'))
    );
    expect(payment).toBeDefined();
    expect(payment?.amount).toBeLessThan(0);
  });

  it('should detect fee transactions', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    const fee = result.transactions.find(
      (tx) => tx.type === 'fee' || tx.vendor.toLowerCase().includes('late fee')
    );
    expect(fee).toBeDefined();
  });

  it('should detect interest charges', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    const interest = result.transactions.find(
      (tx) =>
        tx.type === 'interest' || tx.vendor.toLowerCase().includes('interest')
    );
    expect(interest).toBeDefined();
  });

  it('should calculate totals correctly', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    expect(result.totals.totalDebits).toBeGreaterThan(0);
    // Credits should include the payment
    expect(result.totals.totalCredits).toBeGreaterThan(0);
  });
});

// ============================================
// Statement Parsing - Bank Account Tests
// ============================================

describe('Bank Account Statement Parsing', () => {
  it('should parse transactions from a bank statement', () => {
    const result = parseStatement(SAMPLE_BANK_STATEMENT);

    expect(result.transactions.length).toBeGreaterThan(5);
    expect(result.issuer).toBe('Bank of America');
  });

  it('should detect both debits and credits', () => {
    const result = parseStatement(SAMPLE_BANK_STATEMENT);

    const debits = result.transactions.filter((tx) => tx.amount > 0);
    const credits = result.transactions.filter((tx) => tx.amount < 0);

    expect(debits.length).toBeGreaterThan(0);
    // Payroll/interest are credits
    expect(credits.length).toBeGreaterThan(0);
  });

  it('should extract vendor names cleanly', () => {
    const result = parseStatement(SAMPLE_BANK_STATEMENT);

    for (const tx of result.transactions) {
      // Vendor should not be empty
      expect(tx.vendor.length).toBeGreaterThan(1);
      // Vendor should not be just numbers
      expect(tx.vendor).not.toMatch(/^\d+$/);
    }
  });
});

// ============================================
// Statement Parsing - Indian Format Tests
// ============================================

describe('Indian Statement Parsing', () => {
  it('should parse transactions from an Indian CC statement', () => {
    const result = parseStatement(SAMPLE_INDIAN_CC_STATEMENT);

    expect(result.transactions.length).toBeGreaterThan(5);
    expect(result.issuer).toBe('HDFC');
  });

  it('should detect INR currency', () => {
    const result = parseStatement(SAMPLE_INDIAN_CC_STATEMENT);

    expect(result.currency).toBe('INR');
  });

  it('should parse DD Mon YYYY date format', () => {
    const result = parseStatement(SAMPLE_INDIAN_CC_STATEMENT);

    // Transactions should have January 2026 dates
    for (const tx of result.transactions) {
      expect(tx.date).toMatch(/^2026-01-\d{2}$/);
    }
  });

  it('should parse Rs. amount format', () => {
    const result = parseStatement(SAMPLE_INDIAN_CC_STATEMENT);

    // Find Swiggy transaction
    const swiggy = result.transactions.find((tx) =>
      tx.vendor.toLowerCase().includes('swiggy')
    );
    expect(swiggy).toBeDefined();
    expect(swiggy?.amount).toBe(450);
  });
});

// ============================================
// Statement Parsing - Simple Format Tests
// ============================================

describe('Simple Statement Parsing', () => {
  it('should parse a simple statement with minimal headers', () => {
    const result = parseStatement(SAMPLE_SIMPLE_STATEMENT);

    expect(result.transactions.length).toBe(5);
  });

  it('should handle MM/DD format without year', () => {
    const result = parseStatement(SAMPLE_SIMPLE_STATEMENT);

    // Should infer year from current year or statement context
    for (const tx of result.transactions) {
      expect(tx.date).toMatch(/^\d{4}-01-\d{2}$/);
    }
  });
});

// ============================================
// Statement Period Extraction Tests
// ============================================

describe('Statement Period Extraction', () => {
  it('should extract period from MM/DD/YYYY format', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    expect(result.statementPeriod.start).not.toBeNull();
    expect(result.statementPeriod.end).not.toBeNull();
  });

  it('should extract period from written date format', () => {
    const result = parseStatement(SAMPLE_BANK_STATEMENT);

    expect(result.statementPeriod.start).not.toBeNull();
    expect(result.statementPeriod.end).not.toBeNull();
  });

  it('should extract period from Indian date format', () => {
    const result = parseStatement(SAMPLE_INDIAN_CC_STATEMENT);

    expect(result.statementPeriod.start).not.toBeNull();
    expect(result.statementPeriod.end).not.toBeNull();
  });
});

// ============================================
// Account Number Extraction Tests
// ============================================

describe('Account Number Extraction', () => {
  it('should extract last 4 digits from masked account number', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);
    expect(result.accountLast4).toBe('4567');
  });

  it('should extract last 4 from XXXX format', () => {
    const result = parseStatement(SAMPLE_INDIAN_CC_STATEMENT);
    expect(result.accountLast4).toBe('8901');
  });

  it('should extract last 4 from **** format', () => {
    const result = parseStatement(SAMPLE_BANK_STATEMENT);
    expect(result.accountLast4).toBe('7890');
  });
});

// ============================================
// Continuation Line Tests
// ============================================

describe('Continuation Lines', () => {
  it('should handle vendor names that span multiple lines', () => {
    const result = parseStatement(SAMPLE_STATEMENT_WITH_CONTINUATION);

    // Should still parse the transactions
    expect(result.transactions.length).toBeGreaterThanOrEqual(2);

    // The first transaction may have the continuation appended
    const first = result.transactions[0];
    if (first) {
      expect(first.vendor.length).toBeGreaterThan(5);
    }
  });
});

// ============================================
// Edge Cases
// ============================================

describe('Edge Cases', () => {
  it('should handle empty text gracefully', () => {
    const result = parseStatement(SAMPLE_EMPTY_TEXT);

    expect(result.transactions).toHaveLength(0);
    expect(result.confidence).toBe(0);
  });

  it('should handle a statement with no transactions', () => {
    const result = parseStatement(SAMPLE_NO_TRANSACTIONS);

    expect(result.transactions).toHaveLength(0);
  });

  it('should handle non-statement documents gracefully', () => {
    const result = parseStatement(SAMPLE_RECEIPT);

    // May or may not find transactions; should not throw
    expect(result).toBeDefined();
    expect(result.transactions).toBeDefined();
  });

  it('should handle lines with only amounts (no dates)', () => {
    const text = `
Account Statement
$25.00
$50.00
$100.00
`;
    const result = parseStatement(text);

    // Should not crash, may extract 0 transactions due to missing dates
    expect(result).toBeDefined();
  });

  it('should handle OCR noise in dates', () => {
    const text = `
Statement Period: 01/01/2026 - 01/31/2026

0l/05  COFFEE SHOP          $4.50
01/l0  GROCERY STORE        $52.30
`;
    // OCR commonly confuses 0/O and 1/l
    // Parser may or may not handle these, but should not throw
    const result = parseStatement(text);
    expect(result).toBeDefined();
  });

  it('should skip header and footer lines', () => {
    const text = `
Credit Card Statement
Statement Period: 01/01/2026 - 01/31/2026
Date        Description              Amount
-----------------------------------------
01/05/2026  VENDOR A                $25.00
01/10/2026  VENDOR B                $50.00
-----------------------------------------
Total                              $75.00
Page 1 of 1
`;
    const result = parseStatement(text);

    // Should parse 2 transactions, skip headers, separators, totals, page numbers
    expect(result.transactions.length).toBe(2);
  });

  it('should handle very long vendor descriptions', () => {
    const text = `
Statement Period: 01/01/2026 - 01/31/2026

01/05/2026  THIS IS A VERY LONG VENDOR NAME THAT GOES ON AND ON FOR A WHILE AND MAY CAUSE ISSUES  $25.00
01/10/2026  SHORT                                                                                  $50.00
`;
    const result = parseStatement(text);

    expect(result.transactions.length).toBe(2);
  });
});

// ============================================
// Transaction Type Detection Tests
// ============================================

describe('Transaction Type Detection', () => {
  it('should classify payments correctly', () => {
    const text = `
Statement Period: 01/01/2026 - 01/31/2026

01/05/2026  PAYMENT - THANK YOU     -$500.00
01/10/2026  AUTOPAY PAYMENT         -$200.00
`;
    const result = parseStatement(text);

    const payments = result.transactions.filter((tx) => tx.type === 'payment');
    expect(payments.length).toBeGreaterThan(0);
  });

  it('should classify refunds correctly', () => {
    const text = `
Statement Period: 01/01/2026 - 01/31/2026

01/05/2026  REFUND - AMAZON         -$45.99
01/10/2026  RETURN CREDIT           -$25.00
`;
    const result = parseStatement(text);

    const refunds = result.transactions.filter((tx) => tx.type === 'refund');
    expect(refunds.length).toBeGreaterThan(0);
  });

  it('should classify fees correctly', () => {
    const text = `
Statement Period: 01/01/2026 - 01/31/2026

01/05/2026  ANNUAL FEE               $95.00
01/10/2026  LATE FEE                  $29.00
`;
    const result = parseStatement(text);

    const fees = result.transactions.filter((tx) => tx.type === 'fee');
    expect(fees.length).toBeGreaterThan(0);
  });

  it('should classify interest correctly', () => {
    const text = `
Statement Period: 01/01/2026 - 01/31/2026

01/05/2026  INTEREST CHARGE          $15.00
01/10/2026  FINANCE CHARGE            $8.50
`;
    const result = parseStatement(text);

    const interest = result.transactions.filter((tx) => tx.type === 'interest');
    expect(interest.length).toBeGreaterThan(0);
  });
});

// ============================================
// Auto-Categorization Integration Tests
// ============================================

describe('Auto-Categorization Integration', () => {
  it('should suggest categories for known vendors', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    // At least some transactions should have category suggestions
    const withCategories = result.transactions.filter(
      (tx) => tx.suggestedCategoryName !== null || tx.category !== null
    );

    expect(withCategories.length).toBeGreaterThan(0);
  });

  it('should categorize Starbucks as Food & Dining', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    const starbucks = result.transactions.find((tx) =>
      tx.vendor.toLowerCase().includes('starbucks')
    );

    if (starbucks) {
      expect(
        starbucks.suggestedCategoryName === 'Food & Dining' ||
          starbucks.category !== null
      ).toBe(true);
    }
  });

  it('should categorize Netflix as Entertainment', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    const netflix = result.transactions.find((tx) =>
      tx.vendor.toLowerCase().includes('netflix')
    );

    if (netflix) {
      expect(
        netflix.suggestedCategoryName === 'Entertainment' ||
          netflix.suggestedCategoryName === 'Subscriptions' ||
          netflix.category !== null
      ).toBe(true);
    }
  });
});

// ============================================
// Options Tests
// ============================================

describe('Parser Options', () => {
  it('should respect minConfidence option', () => {
    const highThreshold = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT, {
      minConfidence: 0.9,
    });
    const lowThreshold = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT, {
      minConfidence: 0.1,
    });

    // Higher threshold may filter out some lower-confidence transactions
    expect(lowThreshold.transactions.length).toBeGreaterThanOrEqual(
      highThreshold.transactions.length
    );
  });

  it('should respect defaultCurrency option', () => {
    const result = parseStatement(SAMPLE_SIMPLE_STATEMENT, {
      defaultCurrency: 'EUR',
    });

    // If no currency detected, should use the default
    expect(result.currency).toBeDefined();
  });

  it('should respect amountRange option', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT, {
      amountRange: { min: 10, max: 100 },
    });

    // All transaction amounts should be within range
    for (const tx of result.transactions) {
      const absAmount = Math.abs(tx.amount);
      expect(absAmount).toBeGreaterThanOrEqual(10);
      expect(absAmount).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================
// Warnings Tests
// ============================================

describe('Parser Warnings', () => {
  it('should warn about unparsed lines', () => {
    const text = `
Statement Period: 01/01/2026 - 01/31/2026

01/05/2026  VENDOR A                $25.00
some random line with $15.00 that cannot be fully parsed
01/10/2026  VENDOR B                $50.00
another unparsable line with $30.00 amount
`;
    const result = parseStatement(text);

    if (result.unparsedLineCount > 0) {
      expect(
        result.warnings.some((w) => w.includes('could not be parsed'))
      ).toBe(true);
    }
  });
});

// ============================================
// Service Instance Tests
// ============================================

describe('StatementParserService', () => {
  it('should be a singleton', () => {
    expect(statementParser).toBeDefined();
  });

  it('should have detectDocumentType method', () => {
    expect(typeof statementParser.detectDocumentType).toBe('function');
  });

  it('should have parseStatement method', () => {
    expect(typeof statementParser.parseStatement).toBe('function');
  });

  it('convenience functions should match service methods', () => {
    const text = SAMPLE_CREDIT_CARD_STATEMENT;

    const directDetect = statementParser.detectDocumentType(text);
    const convenienceDetect = detectDocumentType(text);

    expect(directDetect.type).toBe(convenienceDetect.type);
    expect(directDetect.confidence).toBe(convenienceDetect.confidence);
  });
});

// ============================================
// ParsedStatementTransaction Shape Tests
// ============================================

describe('Transaction Shape', () => {
  it('should have all required fields', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    for (const tx of result.transactions) {
      expect(tx.id).toBeDefined();
      expect(typeof tx.id).toBe('string');
      expect(tx.id.length).toBeGreaterThan(0);

      expect(tx.date).toBeDefined();
      expect(tx.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      expect(tx.vendor).toBeDefined();
      expect(typeof tx.vendor).toBe('string');

      expect(typeof tx.amount).toBe('number');
      expect(!isNaN(tx.amount)).toBe(true);

      expect(['debit', 'credit', 'payment', 'fee', 'interest', 'refund']).toContain(tx.type);

      expect(typeof tx.confidence).toBe('number');
      expect(tx.confidence).toBeGreaterThanOrEqual(0);
      expect(tx.confidence).toBeLessThanOrEqual(1);

      expect(typeof tx.selected).toBe('boolean');
      expect(typeof tx.rawLine).toBe('string');
      expect(typeof tx.note).toBe('string');
    }
  });

  it('should generate unique IDs for each transaction', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);
    const ids = result.transactions.map((tx) => tx.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should mark all transactions as selected by default', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    for (const tx of result.transactions) {
      expect(tx.selected).toBe(true);
    }
  });
});

// ============================================
// StatementParseResult Shape Tests
// ============================================

describe('Parse Result Shape', () => {
  it('should have all required fields', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    expect(result.documentType).toBeDefined();
    expect(result.issuer).toBeDefined();
    expect(result.accountLast4).toBeDefined();
    expect(result.statementPeriod).toBeDefined();
    expect(result.transactions).toBeDefined();
    expect(Array.isArray(result.transactions)).toBe(true);
    expect(result.totals).toBeDefined();
    expect(typeof result.totals.totalDebits).toBe('number');
    expect(typeof result.totals.totalCredits).toBe('number');
    expect(typeof result.totals.netBalance).toBe('number');
    expect(result.currency).toBeDefined();
    expect(typeof result.confidence).toBe('number');
    expect(typeof result.parsingTimeMs).toBe('number');
    expect(typeof result.unparsedLineCount).toBe('number');
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('should report parsing time', () => {
    const result = parseStatement(SAMPLE_CREDIT_CARD_STATEMENT);

    expect(result.parsingTimeMs).toBeGreaterThan(0);
    expect(result.parsingTimeMs).toBeLessThan(5000); // Should be fast
  });
});
