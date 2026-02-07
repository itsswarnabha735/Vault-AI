/**
 * Vitest Test Setup
 *
 * This file configures the test environment with necessary mocks for:
 * - IndexedDB (via fake-indexeddb)
 * - OPFS (Origin Private File System)
 * - Transformers.js (ML embeddings)
 * - Supabase (cloud backend)
 * - Next.js router
 * - Browser APIs
 */

import '@testing-library/jest-dom';
import { vi, beforeAll, afterEach, afterAll } from 'vitest';

// ============================================
// Mock IndexedDB
// ============================================

// Import fake-indexeddb for Dexie.js testing
import 'fake-indexeddb/auto';

// ============================================
// Mock OPFS (Origin Private File System)
// ============================================

vi.mock('@/lib/storage/opfs', () => ({
  opfsService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    saveFile: vi.fn().mockResolvedValue('/test/path/document.pdf'),
    getFile: vi.fn().mockResolvedValue(null),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    fileExists: vi.fn().mockResolvedValue(true),
    getStorageUsage: vi.fn().mockResolvedValue({
      totalBytes: 1024 * 1024,
      documentCount: 10,
      thumbnailBytes: 1024 * 100,
      availableBytes: 1024 * 1024 * 500,
    }),
    generateThumbnail: vi.fn().mockResolvedValue('/test/thumbnails/thumb.webp'),
    getThumbnail: vi.fn().mockResolvedValue(null),
    exportAll: vi.fn().mockResolvedValue(new Blob()),
    cleanup: vi.fn().mockResolvedValue(undefined),
  },
}));

// ============================================
// Mock Transformers.js (Embeddings)
// ============================================

const mockEmbedding = new Float32Array(384).fill(0.1);

vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue({
    __call__: vi.fn().mockResolvedValue({
      data: mockEmbedding,
    }),
  }),
  env: {
    allowLocalModels: false,
    useBrowserCache: true,
  },
}));

// ============================================
// Mock Supabase Client
// ============================================

const mockSupabaseData = {
  session: null as { user: { id: string; email: string } } | null,
};

const createMockQueryBuilder = () => {
  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    containedBy: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn().mockResolvedValue({ data: [], error: null }),
  };

  // Make the builder thenable
  builder.then = vi.fn((resolve) => resolve({ data: [], error: null }));

  return builder;
};

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: mockSupabaseData.session },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: mockSupabaseData.session?.user ?? null },
        error: null,
      }),
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      }),
    },
    from: vi.fn().mockImplementation(() => createMockQueryBuilder()),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    }),
  },
  createServerClient: vi.fn(),
}));

// Helper to set mock session
export const setMockSession = (
  session: { user: { id: string; email: string } } | null
) => {
  mockSupabaseData.session = session;
};

// ============================================
// Mock Next.js Router
// ============================================

const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

export { mockRouter };

// ============================================
// Mock Browser APIs
// ============================================

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  root: null,
  rootMargin: '',
  thresholds: [],
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: vi.fn().mockReturnValue([]),
}));

// Mock crypto.randomUUID
if (!global.crypto) {
  (global as Record<string, unknown>).crypto = {};
}
Object.defineProperty(global.crypto, 'randomUUID', {
  value: vi.fn(() => 'test-uuid-' + Math.random().toString(36).substring(7)),
  writable: true,
});

// Mock navigator.storage
Object.defineProperty(navigator, 'storage', {
  value: {
    getDirectory: vi.fn().mockResolvedValue({
      getFileHandle: vi.fn().mockResolvedValue({
        createWritable: vi.fn().mockResolvedValue({
          write: vi.fn(),
          close: vi.fn(),
        }),
        getFile: vi.fn().mockResolvedValue(new File([], 'test.pdf')),
      }),
      getDirectoryHandle: vi.fn(),
    }),
    estimate: vi.fn().mockResolvedValue({
      usage: 1024 * 1024,
      quota: 1024 * 1024 * 1024,
    }),
  },
  writable: true,
});

// Mock fetch
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: vi.fn().mockResolvedValue({}),
  text: vi.fn().mockResolvedValue(''),
  blob: vi.fn().mockResolvedValue(new Blob()),
});

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:test-url');
global.URL.revokeObjectURL = vi.fn();

// ============================================
// Mock Web Workers
// ============================================

class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;

  postMessage = vi.fn();
  terminate = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn();
}

global.Worker = MockWorker as unknown as typeof Worker;

// ============================================
// Test Lifecycle Hooks
// ============================================

beforeAll(() => {
  // Setup any global test state
});

afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks();
});

afterAll(() => {
  // Cleanup after all tests
  vi.restoreAllMocks();
});

// ============================================
// Test Helpers Export
// ============================================

export { mockEmbedding };
