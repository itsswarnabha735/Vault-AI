/**
 * Next.js Middleware
 *
 * Handles authentication and route protection for Vault-AI.
 * Runs on every request to protected routes.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession, isProtectedRoute } from '@/lib/supabase/middleware';

/**
 * Middleware function that runs on matched routes.
 *
 * Responsibilities:
 * 1. Refresh expired auth tokens
 * 2. Redirect unauthenticated users from protected routes
 * 3. Allow access to public routes
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets and API routes (except auth-related)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.') // Static files like favicon.ico
  ) {
    return NextResponse.next();
  }

  try {
    // Update the session (refresh tokens if needed)
    const result = await updateSession(request);
    const { supabaseResponse, user } = result;

    // Debug logging
    console.log('[Middleware] Path:', pathname);
    console.log('[Middleware] User:', user?.email ?? 'null');
    console.log('[Middleware] Cookies:', request.cookies.getAll().map(c => c.name).join(', '));

    // If accessing a protected route without authentication
    if (isProtectedRoute(pathname) && !user) {
      console.log('[Middleware] Redirecting to login - no user session');
      const redirectUrl = new URL('/login', request.url);
      // Store the original URL to redirect back after login
      redirectUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // If authenticated user tries to access auth pages, redirect to vault
    if ((pathname === '/login' || pathname === '/signup') && user) {
      return NextResponse.redirect(new URL('/vault', request.url));
    }

    // Return the response with updated session cookies
    return supabaseResponse;
  } catch (error) {
    // Log error but don't block the request
    console.error('Middleware error:', error);

    // If error on protected route, redirect to login
    if (isProtectedRoute(pathname)) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
  }
}

/**
 * Matcher configuration for the middleware.
 *
 * This configuration determines which routes the middleware runs on.
 * Using a negative lookahead to exclude static files and API routes.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
