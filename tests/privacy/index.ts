/**
 * Privacy Test Suite Index
 *
 * This module exports all privacy-related test utilities and helpers.
 * The actual test files are:
 * - data-leakage.test.ts - Core data leakage prevention tests
 * - sync-privacy.test.ts - Sync engine privacy tests
 * - llm-privacy.test.ts - LLM integration privacy tests
 * - document-upload.test.ts - Document upload privacy tests
 * - search-privacy.test.ts - Search operation privacy tests
 */

// Re-export factories for use in privacy tests
export * from '../factories';

/**
 * Patterns that indicate sensitive data fields
 */
export const SENSITIVE_FIELD_PATTERNS = [
  /rawText/i,
  /embedding/i,
  /filePath/i,
  /fileSize/i,
  /mimeType/i,
  /confidence/i,
  /ocrOutput/i,
] as const;

/**
 * PII patterns that should never be transmitted
 */
export const PII_PATTERNS = [
  /\d{3}-\d{2}-\d{4}/g, // SSN
  /\d{16}/g, // Credit card number (simple)
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
  /\b\d{10,12}\b/g, // Account numbers
] as const;

/**
 * Checks if a string contains any sensitive field names.
 */
export function containsSensitiveFields(content: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Check if a string contains any PII
 */
export function containsPII(content: string): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Extracts all sensitive fields found in content.
 */
export function extractSensitiveFields(content: string): string[] {
  const found: string[] = [];

  for (const pattern of SENSITIVE_FIELD_PATTERNS) {
    if (pattern.test(content)) {
      found.push(pattern.source.replace(/\\/g, '').replace(/i$/, ''));
    }
  }

  return found;
}

/**
 * Extract PII from a string
 */
export function extractPII(content: string): string[] {
  const found: string[] = [];
  for (const pattern of PII_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      found.push(...matches);
    }
  }
  return found;
}

/**
 * Validates that an object is safe for network transmission.
 */
export function validateNetworkPayload(payload: unknown): {
  safe: boolean;
  violations: string[];
} {
  const json = JSON.stringify(payload ?? {});
  const violations = extractSensitiveFields(json);

  // Also check for PII
  const pii = extractPII(json);
  violations.push(...pii);

  return {
    safe: violations.length === 0,
    violations,
  };
}

/**
 * Create a mock network interceptor for testing
 */
export function createNetworkInterceptor() {
  const capturedRequests: Array<{
    url: string;
    method: string;
    body: string | null;
    timestamp: Date;
  }> = [];

  return {
    capture: (url: string, method: string, body: string | null) => {
      capturedRequests.push({ url, method, body, timestamp: new Date() });
    },
    getRequests: () => [...capturedRequests],
    clear: () => {
      capturedRequests.length = 0;
    },
    hasViolations: (): boolean => {
      return capturedRequests.some((req) => {
        if (!req.body) {
          return false;
        }
        const validation = validateNetworkPayload(req.body);
        return !validation.safe;
      });
    },
    getViolations: (): string[] => {
      const allViolations: string[] = [];
      for (const req of capturedRequests) {
        if (!req.body) {
          continue;
        }
        const validation = validateNetworkPayload(req.body);
        allViolations.push(...validation.violations);
      }
      return allViolations;
    },
  };
}

/**
 * Assert that no sensitive data was transmitted
 */
export function assertNoSensitiveDataTransmitted(
  requests: Array<{ body: string | null }>
): void {
  for (const request of requests) {
    if (!request.body) {
      continue;
    }

    const validation = validateNetworkPayload(request.body);
    if (!validation.safe) {
      throw new Error(
        `Privacy violation detected! Sensitive data found in network request: ${validation.violations.join(', ')}`
      );
    }
  }
}
