/**
 * Supabase Server Client
 *
 * Creates Supabase clients for use in Server Components, Route Handlers,
 * and Server Actions. Handles cookies properly for SSR authentication.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/supabase';

// Cookie type for setAll
interface CookieToSet {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

// Environment variable validation
function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // During build/static generation, env vars may not be available
    console.warn(
      'Supabase environment variables not available. This is expected during static generation.'
    );
    return {
      supabaseUrl: 'https://placeholder.supabase.co',
      supabaseAnonKey: 'placeholder-key',
    };
  }

  return { supabaseUrl, supabaseAnonKey };
}

/**
 * Create a Supabase client for use in Server Components.
 * This client is read-only for cookies (cannot set new cookies).
 *
 * Use this in:
 * - Server Components (page.tsx, layout.tsx with 'use server')
 * - Server Actions
 * - Route Handlers that only read data
 *
 * @returns Typed Supabase server client
 *
 * @example
 * ```typescript
 * // In a Server Component
 * const supabase = createServerClient();
 * const { data: { user } } = await supabase.auth.getUser();
 * ```
 */
export async function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing sessions.
        }
      },
    },
  });
}

/**
 * Create a Supabase client for use in Route Handlers.
 * This client can both read and write cookies.
 *
 * Use this in:
 * - Route Handlers (route.ts) that modify auth state
 * - API routes that handle sign in/sign out
 *
 * @returns Typed Supabase server client with cookie write access
 *
 * @example
 * ```typescript
 * // In a Route Handler
 * export async function POST(request: Request) {
 *   const supabase = await createRouteHandlerClient();
 *   const { data, error } = await supabase.auth.signInWithOtp({ email });
 * }
 * ```
 */
export async function createRouteHandlerClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

/**
 * Create a Supabase admin client with service role key.
 * WARNING: Only use this on the server side for admin operations.
 *
 * @returns Supabase client with admin privileges
 */
export async function createAdminClient() {
  const { supabaseUrl } = getSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY environment variable for admin client.'
    );
  }

  return createServerClient<Database>(supabaseUrl, serviceRoleKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // Admin client doesn't need cookies
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Export type for external use
export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
