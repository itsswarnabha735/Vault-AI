'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Login Form Component
 *
 * Internal component that handles the login form and uses search params.
 * Wrapped in Suspense boundary for SSR compatibility.
 */
function LoginForm() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/vault';
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Handle browser autofill by checking input value on animation events
  // This is needed because some browsers don't trigger onChange on autofill
  useEffect(() => {
    const emailInput = document.getElementById('email') as HTMLInputElement;
    if (emailInput && emailInput.value && !email) {
      setEmail(emailInput.value);
    }
  }, [email]);

  // Handle error from callback
  useEffect(() => {
    if (errorParam) {
      setMessage({
        type: 'error',
        text: errorDescription || 'Authentication failed. Please try again.',
      });
    }
  }, [errorParam, errorDescription]);

  /**
   * Handle form submission - send magic link
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    // Get email from form data as fallback for autofill issues
    const formData = new FormData(e.currentTarget);
    const emailValue = (formData.get('email') as string) || email;

    if (!emailValue || !emailValue.includes('@')) {
      setMessage({
        type: 'error',
        text: 'Please enter a valid email address.',
      });
      setIsLoading(false);
      return;
    }

    try {
      console.log('Creating Supabase client...');
      const supabase = createClient();
      console.log('Supabase client created, sending OTP to:', emailValue);

      const { error, data } = await supabase.auth.signInWithOtp({
        email: emailValue,
        options: {
          emailRedirectTo: `${window.location.origin}/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
        },
      });

      console.log('OTP response:', { error, data });

      if (error) {
        throw error;
      }

      setMessage({
        type: 'success',
        text: 'Check your email for the magic link! It should arrive within a few seconds.',
      });
      setEmail('');
    } catch (error) {
      console.error('Login error:', error);
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Failed to send magic link. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Login Form */}
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              onBlur={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="relative w-full overflow-hidden rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-3 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:shadow-blue-500/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="h-5 w-5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Sending magic link...
              </span>
            ) : (
              'Send Magic Link'
            )}
          </button>
        </form>

        {/* Message Display */}
        {message && (
          <div
            className={`mt-4 rounded-lg p-4 text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
            }`}
          >
            <div className="flex items-start gap-3">
              {message.type === 'success' ? (
                <svg
                  className="h-5 w-5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
              <p>{message.text}</p>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-3 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                No password required
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Login Form Loading Skeleton
 */
function LoginFormSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-800 dark:bg-gray-900">
      <div className="space-y-6">
        <div>
          <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-1 h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        </div>
        <div className="h-12 animate-pulse rounded-lg bg-gradient-to-r from-blue-200 to-violet-200 dark:from-blue-900 dark:to-violet-900" />
      </div>
    </div>
  );
}

/**
 * Login Page Component
 *
 * Provides email magic link authentication with Vault-AI branding.
 * Handles loading states, errors, and success messages.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4 dark:from-gray-950 dark:to-gray-900">
      <div className="w-full max-w-md space-y-8">
        {/* Logo & Header */}
        <div className="flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 shadow-lg shadow-blue-500/25">
            <svg
              className="h-10 w-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Welcome to Vault AI
          </h1>
          <p className="mt-2 text-center text-gray-600 dark:text-gray-400">
            Privacy-first finance with AI-powered insights
          </p>
        </div>

        {/* Login Form - Wrapped in Suspense for useSearchParams */}
        <Suspense fallback={<LoginFormSkeleton />}>
          <LoginForm />
        </Suspense>

        {/* Privacy Notice */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/50">
          <div className="flex gap-3">
            <svg
              className="h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            <div className="text-sm text-emerald-700 dark:text-emerald-300">
              <p className="font-semibold">Your privacy is guaranteed</p>
              <p className="mt-1 text-emerald-600 dark:text-emerald-400">
                Documents and raw text never leave your device. Only encrypted,
                sanitized accounting data syncs to the cloud.
              </p>
            </div>
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
