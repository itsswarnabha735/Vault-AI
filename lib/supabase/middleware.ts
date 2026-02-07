/**
 * Supabase Middleware Helper
 *
 * Creates a Supabase client for use in Next.js middleware.
 * Handles session refresh and cookie management.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// Cookie type for setAll
interface CookieToSet {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

// Return type for updateSession
export interface UpdateSessionResult {
  supabaseResponse: NextResponse;
  user: User | null;
}

/**
 * Update the session and return the response with refreshed cookies.
 * This should be called from the Next.js middleware.
 *
 * @param request - The incoming Next.js request
 * @returns Object containing the response and user
 */
export async function updateSession(
  request: NextRequest
): Promise<UpdateSessionResult> {
  // Create an initial response
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables in middleware');
    return { supabaseResponse, user: null };
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        // Update request cookies
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        // Create new response with updated cookies
        supabaseResponse = NextResponse.next({
          request,
        });

        // Set cookies on response
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // IMPORTANT: Do not run code between createServerClient and getUser()
  // A simple mistake here could result in users being logged out randomly.

  // Refresh the session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user };
}

/**
 * Routes that don't require authentication.
 */
export const publicRoutes = ['/', '/login', '/callback', '/auth/callback'];

/**
 * Routes that require authentication.
 * Uses prefix matching.
 */
export const protectedRoutePrefixes = ['/vault', '/chat', '/settings'];

/**
 * Check if a path is a protected route.
 */
export function isProtectedRoute(pathname: string): boolean {
  return protectedRoutePrefixes.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Check if a path is a public route.
 */
export function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}
