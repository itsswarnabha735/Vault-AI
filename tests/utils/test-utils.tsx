/**
 * Test Utilities for Vault-AI
 *
 * Provides custom render functions with providers and common test utilities.
 */

import React, { ReactElement, ReactNode } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ============================================
// Test Query Client
// ============================================

/**
 * Creates a new QueryClient configured for testing.
 * Disables retries and caching for deterministic tests.
 */
export const createTestQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

// ============================================
// Provider Wrapper
// ============================================

interface AllProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

/**
 * Wraps components with all necessary providers for testing.
 */
function AllProviders({
  children,
  queryClient,
}: AllProvidersProps): ReactElement {
  const client = queryClient ?? createTestQueryClient();

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// ============================================
// Custom Render
// ============================================

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
}

/**
 * Custom render function that wraps components with all providers.
 */
function customRender(
  ui: ReactElement,
  options?: CustomRenderOptions
): RenderResult {
  const { queryClient, ...renderOptions } = options ?? {};

  return render(ui, {
    wrapper: ({ children }) => (
      <AllProviders queryClient={queryClient}>{children}</AllProviders>
    ),
    ...renderOptions,
  });
}

// ============================================
// User Event Setup
// ============================================

/**
 * Sets up user event for interaction testing.
 * Returns both the render result and the user event instance.
 */
export function renderWithUser(
  ui: ReactElement,
  options?: CustomRenderOptions
): RenderResult & { user: ReturnType<typeof userEvent.setup> } {
  const user = userEvent.setup();
  const renderResult = customRender(ui, options);

  return {
    ...renderResult,
    user,
  };
}

// ============================================
// Async Utilities
// ============================================

/**
 * Waits for a condition to be true.
 * Useful for waiting for async state updates.
 */
export async function waitForCondition(
  condition: () => boolean,
  options?: { timeout?: number; interval?: number }
): Promise<void> {
  const { timeout = 5000, interval = 50 } = options ?? {};
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('waitForCondition timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Flushes all pending promises and microtasks.
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// ============================================
// Mock Data Helpers
// ============================================

/**
 * Creates a mock File object.
 */
export function createMockFile(
  name: string = 'test.pdf',
  type: string = 'application/pdf',
  content: string = 'test content'
): File {
  return new File([content], name, { type });
}

/**
 * Creates a mock FileList.
 */
export function createMockFileList(files: File[]): FileList {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: function* () {
      for (const file of files) {
        yield file;
      }
    },
  };

  // Add indexed access
  files.forEach((file, index) => {
    Object.defineProperty(fileList, index, { value: file });
  });

  return fileList as unknown as FileList;
}

/**
 * Creates a mock embedding vector.
 */
export function createMockEmbedding(
  dimensions: number = 384,
  fillValue: number = 0.1
): Float32Array {
  return new Float32Array(dimensions).fill(fillValue);
}

// ============================================
// Date Helpers
// ============================================

/**
 * Creates a date string in ISO 8601 format (YYYY-MM-DD).
 */
export function createDateString(daysFromNow: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
}

/**
 * Creates a Date object relative to now.
 */
export function createDate(daysFromNow: number = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date;
}

// ============================================
// Assertion Helpers
// ============================================

/**
 * Type guard to check if a value is defined.
 */
export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

/**
 * Asserts that network requests don't contain sensitive data.
 */
export function assertNoSensitiveData(
  data: unknown,
  sensitiveFields: string[] = [
    'rawText',
    'embedding',
    'filePath',
    'ocrOutput',
    'password',
    'token',
  ]
): void {
  const jsonString =
    typeof data === 'string' ? data : JSON.stringify(data ?? {});

  for (const field of sensitiveFields) {
    if (jsonString.includes(`"${field}"`)) {
      throw new Error(`Sensitive field "${field}" found in data`);
    }
  }
}

// ============================================
// Re-exports
// ============================================

export * from '@testing-library/react';
export { userEvent };
export { customRender as render };
