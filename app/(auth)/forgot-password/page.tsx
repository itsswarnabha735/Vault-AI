'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * Forgot Password Page Component
 *
 * Allows users to request a password reset link via email.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  /**
   * Handle form submission - send password reset email
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    if (!email || !email.includes('@')) {
      setMessage({
        type: 'error',
        text: 'Please enter a valid email address.',
      });
      setIsLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/reset-password`,
      });

      if (error) {
        throw error;
      }

      setIsEmailSent(true);
      setMessage({
        type: 'success',
        text: 'Password reset instructions have been sent to your email.',
      });
    } catch (error) {
      console.error('Password reset error:', error);
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Failed to send reset email. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

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
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Reset your password
          </h1>
          <p className="mt-2 text-center text-gray-600 dark:text-gray-400">
            {isEmailSent
              ? 'Check your inbox for reset instructions'
              : "Enter your email and we'll send you a reset link"}
          </p>
        </div>

        {/* Reset Form */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-800 dark:bg-gray-900">
          {!isEmailSent ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Field */}
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
                  disabled={isLoading}
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                  placeholder="you@example.com"
                />
              </div>

              {/* Submit Button */}
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
                    Sending...
                  </span>
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </form>
          ) : (
            /* Success State */
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <svg
                  className="h-6 w-6 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                We&apos;ve sent a password reset link to{' '}
                <strong>{email}</strong>. Please check your inbox and follow the
                instructions.
              </p>
              <button
                onClick={() => {
                  setIsEmailSent(false);
                  setEmail('');
                  setMessage(null);
                }}
                className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                Try a different email
              </button>
            </div>
          )}

          {/* Message Display */}
          {message && !isEmailSent && (
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
                  Remember your password?
                </span>
              </div>
            </div>
          </div>

          {/* Back to Login Link */}
          <div className="mt-6">
            <Link
              href="/login"
              className="flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Back to sign in
            </Link>
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
