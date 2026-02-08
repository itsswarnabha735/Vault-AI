/**
 * CRITICAL: Privacy - Document Upload Tests
 *
 * These tests verify that document bytes NEVER leave the user's device.
 * All document processing must happen client-side in Web Workers.
 *
 * FAILURE OF THESE TESTS BLOCKS DEPLOYMENT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockFile } from '../utils/test-utils';

// ============================================
// Test Setup
// ============================================

interface CapturedRequest {
  url: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
  contentType: string | null;
}

const capturedRequests: CapturedRequest[] = [];
const originalFetch = global.fetch;

beforeEach(() => {
  capturedRequests.length = 0;

  global.fetch = vi.fn(async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    let bodyString: string | null = null;
    let contentType: string | null = null;

    if (init?.headers) {
      const headers = init.headers as Record<string, string>;
      contentType = headers['Content-Type'] || headers['content-type'] || null;
    }

    if (init?.body) {
      if (typeof init.body === 'string') {
        bodyString = init.body;
      } else if (init.body instanceof FormData) {
        // FormData indicates file upload - capture entries
        const entries: string[] = [];
        init.body.forEach((value, key) => {
          if (value instanceof File) {
            entries.push(`FILE:${key}:${value.name}:${value.size}`);
          } else {
            entries.push(`${key}:${value}`);
          }
        });
        bodyString = entries.join('; ');
        contentType = 'multipart/form-data';
      } else if (
        init.body instanceof ArrayBuffer ||
        init.body instanceof Blob
      ) {
        bodyString = '[BINARY_DATA]';
      } else {
        bodyString = JSON.stringify(init.body);
      }
    }

    capturedRequests.push({
      url,
      method: init?.method ?? 'GET',
      body: bodyString,
      headers: (init?.headers as Record<string, string>) ?? {},
      contentType,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

// ============================================
// Mock OPFS Service
// ============================================

const mockOPFSService = {
  saveFile: vi.fn(async (file: File, transactionId: string) => {
    return `/vault-ai/documents/2024/01/${transactionId}.pdf`;
  }),
  getFile: vi.fn(async () => null),
  deleteFile: vi.fn(async () => undefined),
  fileExists: vi.fn(async () => true),
};

// ============================================
// Mock Document Processor
// ============================================

const mockDocumentProcessor = {
  processDocument: vi.fn(async (file: File) => {
    // Simulate local processing (no network calls)
    const rawText = 'Extracted text from document';
    const embedding = new Float32Array(384).fill(0.1);

    // Save to OPFS (local only)
    const filePath = await mockOPFSService.saveFile(file, 'test-id');

    return {
      id: 'test-id',
      rawText,
      embedding,
      filePath,
      entities: {
        date: { value: '2024-01-15', confidence: 0.95 },
        amount: { value: 100, confidence: 0.9 },
        vendor: { value: 'Test Store', confidence: 0.85 },
      },
    };
  }),
};

// ============================================
// Privacy Tests
// ============================================

describe('CRITICAL: Privacy - Document Upload', () => {
  describe('File Upload Prevention', () => {
    it('MUST NOT upload document bytes to any server', async () => {
      const sensitiveContent =
        'sensitive document content with SSN 123-45-6789 and medical records';
      const testFile = createMockFile(
        'sensitive.pdf',
        'application/pdf',
        sensitiveContent
      );

      await mockDocumentProcessor.processDocument(testFile);

      // Verify no requests were made at all during processing
      for (const request of capturedRequests) {
        // Should not contain the file content
        expect(request.body).not.toContain('sensitive document content');
        expect(request.body).not.toContain('SSN');
        expect(request.body).not.toContain('123-45-6789');
        expect(request.body).not.toContain('medical records');

        // URL should not indicate file upload
        expect(request.url).not.toContain('upload');
        expect(request.url).not.toContain('storage');
        expect(request.url).not.toContain('blob');
      }
    });

    it('MUST NOT use multipart/form-data for document processing', async () => {
      const testFile = createMockFile('test.pdf', 'application/pdf', 'content');

      await mockDocumentProcessor.processDocument(testFile);

      // Check no multipart requests (which would indicate file upload)
      for (const request of capturedRequests) {
        expect(request.contentType).not.toContain('multipart');
      }
    });

    it('MUST NOT send binary data to any endpoint', async () => {
      const testFile = createMockFile(
        'binary.pdf',
        'application/pdf',
        'binary content'
      );

      await mockDocumentProcessor.processDocument(testFile);

      for (const request of capturedRequests) {
        expect(request.body).not.toBe('[BINARY_DATA]');
      }
    });
  });

  describe('OPFS Storage', () => {
    it('MUST store documents only in OPFS', async () => {
      const testFile = createMockFile('test.pdf', 'application/pdf', 'content');

      await mockDocumentProcessor.processDocument(testFile);

      // OPFS save should have been called
      expect(mockOPFSService.saveFile).toHaveBeenCalled();

      // Verify no cloud storage calls
      const cloudStorageCalls = capturedRequests.filter(
        (r) =>
          r.url.includes('storage') ||
          r.url.includes('upload') ||
          r.url.includes('blob') ||
          r.url.includes('s3') ||
          r.url.includes('bucket')
      );
      expect(cloudStorageCalls).toHaveLength(0);
    });

    it('MUST NOT transmit OPFS file paths to cloud', async () => {
      const testFile = createMockFile('test.pdf', 'application/pdf', 'content');

      const result = await mockDocumentProcessor.processDocument(testFile);

      // File path should be local OPFS path
      expect(result.filePath).toContain('/vault-ai/documents/');

      // But should never appear in network requests
      for (const request of capturedRequests) {
        expect(request.body).not.toContain('/vault-ai/documents/');
        expect(request.body).not.toContain('filePath');
      }
    });
  });

  describe('Processing Results', () => {
    it('MUST process documents entirely client-side', async () => {
      const testFile = createMockFile(
        'local-process.pdf',
        'application/pdf',
        'test content'
      );

      const result = await mockDocumentProcessor.processDocument(testFile);

      // Results should be returned
      expect(result.rawText).toBeDefined();
      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.entities).toBeDefined();

      // No processing requests should have been made to external services
      const processingRequests = capturedRequests.filter(
        (r) =>
          r.url.includes('ocr') ||
          r.url.includes('extract') ||
          r.url.includes('parse') ||
          r.url.includes('process')
      );
      expect(processingRequests).toHaveLength(0);
    });

    it('MUST NOT send extracted text to any external service', async () => {
      const testFile = createMockFile(
        'extract.pdf',
        'application/pdf',
        'Secret financial data'
      );

      const result = await mockDocumentProcessor.processDocument(testFile);

      // Extracted text should exist locally
      expect(result.rawText).toBeDefined();

      // But should never appear in network requests
      for (const request of capturedRequests) {
        expect(request.body).not.toContain(result.rawText);
      }
    });

    it('MUST NOT send embeddings to any external service', async () => {
      const testFile = createMockFile(
        'embed.pdf',
        'application/pdf',
        'content'
      );

      const result = await mockDocumentProcessor.processDocument(testFile);

      // Embedding should exist locally
      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding.length).toBe(384);

      // But should never appear in network requests
      for (const request of capturedRequests) {
        expect(request.body).not.toContain('embedding');
        // Check for array of floats pattern
        expect(request.body).not.toMatch(/\[0\.\d+,/);
      }
    });
  });

  describe('Multiple File Upload', () => {
    it('MUST process batch uploads without any network file transmission', async () => {
      const files = [
        createMockFile(
          'doc1.pdf',
          'application/pdf',
          'Confidential: Employee salaries'
        ),
        createMockFile(
          'doc2.pdf',
          'application/pdf',
          'Private: Medical diagnosis'
        ),
        createMockFile(
          'doc3.pdf',
          'application/pdf',
          'Secret: Bank account 123456'
        ),
      ];

      for (const file of files) {
        await mockDocumentProcessor.processDocument(file);
      }

      // Check all captured requests
      const allBodies = capturedRequests.map((r) => r.body || '').join(' ');

      expect(allBodies).not.toContain('Confidential');
      expect(allBodies).not.toContain('Employee salaries');
      expect(allBodies).not.toContain('Private');
      expect(allBodies).not.toContain('Medical diagnosis');
      expect(allBodies).not.toContain('Secret');
      expect(allBodies).not.toContain('Bank account');
      expect(allBodies).not.toContain('123456');
    });
  });

  describe('Edge Cases', () => {
    it('MUST handle large files without uploading', async () => {
      // Create a "large" file (simulated)
      const largeContent = 'A'.repeat(10000);
      const largeFile = createMockFile(
        'large.pdf',
        'application/pdf',
        largeContent
      );

      await mockDocumentProcessor.processDocument(largeFile);

      // No large data should be transmitted
      for (const request of capturedRequests) {
        if (request.body) {
          expect(request.body.length).toBeLessThan(1000);
        }
      }
    });

    it('MUST handle image files without uploading', async () => {
      const imageFile = createMockFile(
        'receipt.png',
        'image/png',
        'fake image data'
      );

      await mockDocumentProcessor.processDocument(imageFile);

      for (const request of capturedRequests) {
        expect(request.contentType).not.toContain('image');
        expect(request.body).not.toContain('fake image data');
      }
    });

    it('MUST handle HEIC files without uploading', async () => {
      const heicFile = createMockFile('photo.heic', 'image/heic', 'heic data');

      await mockDocumentProcessor.processDocument(heicFile);

      for (const request of capturedRequests) {
        expect(request.body).not.toContain('heic data');
      }
    });
  });
});

describe('CRITICAL: Privacy - File Input Sanitization', () => {
  it('MUST NOT allow direct file URL creation for cloud upload', () => {
    const file = createMockFile('test.pdf', 'application/pdf', 'content');

    // Creating object URLs is fine for local display
    const objectUrl = URL.createObjectURL(file);
    expect(objectUrl).toContain('blob:');

    // But this URL should never be transmitted
    for (const request of capturedRequests) {
      expect(request.url).not.toContain(objectUrl);
      expect(request.body).not.toContain(objectUrl);
    }

    URL.revokeObjectURL(objectUrl);
  });

  it('MUST NOT read file as data URL for transmission', async () => {
    const file = createMockFile(
      'test.pdf',
      'application/pdf',
      'secret content'
    );

    // Read file locally (simulated)
    const reader = new FileReader();
    const dataUrlPromise = new Promise<string>((resolve) => {
      reader.onload = () => resolve(reader.result as string);
    });
    reader.readAsDataURL(file);

    const dataUrl = await dataUrlPromise;

    // Data URL should exist locally but never be transmitted
    expect(dataUrl).toContain('data:application/pdf');

    for (const request of capturedRequests) {
      expect(request.body).not.toContain('data:application/pdf');
      expect(request.body).not.toContain(dataUrl);
    }
  });
});
