# Test Fixtures

This directory contains test fixtures for Vault-AI E2E tests.

## Required Files

For full E2E testing, add the following files:

### `sample-receipt.pdf`

A sample PDF receipt for testing document import. Should contain:

- Date: 01/15/2024
- Amount: $82.06
- Vendor: ACME STORE

### `receipt-image.png`

A sample receipt image for testing OCR. Should contain:

- Date: January 20, 2024
- Amount: $45.00
- Vendor: Test Store

### `bank-statement.pdf`

A sample bank statement for testing financial document parsing.

## Creating Test Fixtures

### Option 1: Use Real Documents

Add real (sanitized) documents to this directory.

### Option 2: Create Mock Documents

Use a PDF library to generate mock documents programmatically.

### Option 3: Base64 Encoded Fixtures

Store base64 encoded file content in `.ts` files:

```typescript
// fixtures/sample-receipt.ts
export const SAMPLE_RECEIPT_PDF_BASE64 = '...';
```

## Privacy Notice

⚠️ **IMPORTANT**: Never commit real personal documents to this repository.
All test fixtures should contain only mock/synthetic data.
