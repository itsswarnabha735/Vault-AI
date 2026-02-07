/**
 * Auth Callback Route Handler
 *
 * Handles the callback from Supabase magic link authentication.
 * Exchanges the auth code for a session and redirects the user.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

/**
 * GET handler for auth callback.
 *
 * This route is called when the user clicks the magic link in their email.
 * It exchanges the code for a session and redirects to the dashboard.
 *
 * Query Parameters:
 * - code: The auth code from Supabase
 * - next: Optional redirect path after authentication (default: /vault)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next =
    searchParams.get('next') ?? searchParams.get('redirectTo') ?? '/vault';

  if (code) {
    const supabase = await createRouteHandlerClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Successful authentication - redirect to the requested page
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';

      if (isLocalEnv) {
        // In development, use origin directly
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        // In production with a proxy, use the forwarded host
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        // Fallback to origin
        return NextResponse.redirect(`${origin}${next}`);
      }
    }

    // Log auth error for debugging (don't expose to user)
    console.error('Auth callback error:', error.message);
  }

  // Authentication failed - redirect to login with error
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('error', 'auth_callback_failed');
  loginUrl.searchParams.set(
    'error_description',
    'Could not verify your email. Please try again.'
  );

  return NextResponse.redirect(loginUrl);
}
