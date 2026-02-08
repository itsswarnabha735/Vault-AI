/**
 * Supabase Browser Client
 *
 * Creates a singleton Supabase client for use in browser/client components.
 * This client handles authentication persistence and real-time subscriptions.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

// Environment variable validation
function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // During build/static generation, env vars may not be available
    // Return placeholder values that will be replaced at runtime
    if (typeof window === 'undefined') {
      console.warn(
        'Supabase environment variables not available during build. This is expected for static generation.'
      );
      return {
        supabaseUrl: 'https://placeholder.supabase.co',
        supabaseAnonKey: 'placeholder-key',
      };
    }
    throw new Error(
      'Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

/**
 * Create a Supabase client for use in the browser.
 * Uses singleton pattern to ensure only one client instance exists.
 *
 * Features:
 * - Type-safe with Database generic
 * - Auth persistence across page reloads
 * - Auto token refresh
 * - Real-time subscriptions support
 *
 * @returns Typed Supabase client instance
 *
 * @example
 * ```typescript
 * const supabase = createClient();
 * const { data, error } = await supabase.from('transactions').select('*');
 * ```
 */
export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}

// Singleton instance for direct import
let clientInstance: ReturnType<typeof createClient> | null = null;

/**
 * Get the singleton Supabase browser client.
 * Creates the client on first call, returns cached instance on subsequent calls.
 *
 * @returns Typed Supabase client instance
 */
export function getClient() {
  if (!clientInstance) {
    clientInstance = createClient();
  }
  return clientInstance;
}

// Export type for external use
export type SupabaseBrowserClient = ReturnType<typeof createClient>;
