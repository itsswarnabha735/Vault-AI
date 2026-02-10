/**
 * Auth Callback Route Handler
 *
 * Handles the callback from Supabase authentication flows:
 * - Email confirmation after signup
 * - Password reset confirmation
 * - OAuth provider callbacks
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

/**
 * GET handler for auth callback.
 *
 * This route is called when users complete authentication flows:
 * - Clicking email confirmation link after signup
 * - Clicking password reset link
 * - OAuth provider redirects
 *
 * Query Parameters:
 * - code: The auth code from Supabase
 * - type: The type of auth event (signup, recovery, etc.)
 * - next/redirectTo: Optional redirect path after authentication (default: /vault)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const type = searchParams.get('type');
  const next =
    searchParams.get('next') ?? searchParams.get('redirectTo') ?? '/vault';

  // Determine the redirect URL based on environment
  const getRedirectUrl = (path: string) => {
    const forwardedHost = request.headers.get('x-forwarded-host');
    const isLocalEnv = process.env.NODE_ENV === 'development';

    if (isLocalEnv) {
      return `${origin}${path}`;
    } else if (forwardedHost) {
      return `https://${forwardedHost}${path}`;
    } else {
      return `${origin}${path}`;
    }
  };

  if (code) {
    const supabase = await createRouteHandlerClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if this is a password recovery flow
      if (type === 'recovery') {
        // Redirect to password reset page
        return NextResponse.redirect(getRedirectUrl('/reset-password'));
      }

      // Check if this is an email confirmation (signup)
      if (type === 'signup' || type === 'email') {
        // Redirect to login with success message
        const loginUrl = new URL('/login', origin);
        loginUrl.searchParams.set('registered', 'true');
        return NextResponse.redirect(loginUrl.toString());
      }

      // Default: redirect to the requested page
      return NextResponse.redirect(getRedirectUrl(next));
    }

    // Log auth error for debugging (don't expose to user)
    console.error('Auth callback error:', error.message);
  }

  // Handle token hash for password recovery (when type is in hash, not query)
  // This handles the case where Supabase sends the token in the URL hash
  const tokenHash = searchParams.get('token_hash');
  if (tokenHash && type === 'recovery') {
    const supabase = await createRouteHandlerClient();

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });

    if (!error) {
      return NextResponse.redirect(getRedirectUrl('/reset-password'));
    }

    console.error('Token verification error:', error.message);
  }

  // Authentication failed - redirect to login with error
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('error', 'auth_callback_failed');
  loginUrl.searchParams.set(
    'error_description',
    'Could not complete authentication. Please try again.'
  );

  return NextResponse.redirect(loginUrl);
}
