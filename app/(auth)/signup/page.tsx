'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Signup Form Component
 *
 * Internal component that handles the signup form.
 * Wrapped in Suspense boundary for SSR compatibility.
 */
function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/vault';

  /**
   * Validate password strength
   */
  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return 'Password must be at least 8 characters long.';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least one uppercase letter.';
    }
    if (!/[a-z]/.test(pwd)) {
      return 'Password must contain at least one lowercase letter.';
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain at least one number.';
    }
    return null;
  };

  /**
   * Handle form submission - create account
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    // Validate email
    if (!email || !email.includes('@')) {
      setMessage({
        type: 'error',
        text: 'Please enter a valid email address.',
      });
      setIsLoading(false);
      return;
    }

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      setMessage({
        type: 'error',
        text: passwordError,
      });
      setIsLoading(false);
      return;
    }

    // Check password confirmation
    if (password !== confirmPassword) {
      setMessage({
        type: 'error',
        text: 'Passwords do not match.',
      });
      setIsLoading(false);
      return;
    }

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
        },
      });

      if (error) {
        throw error;
      }

      // Redirect to login with success message
      router.push('/login?registered=true');
    } catch (error) {
      console.error('Signup error:', error);
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Failed to create account. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Password strength indicator
  const getPasswordStrength = (
    pwd: string
  ): { strength: number; label: string; color: string } => {
    if (!pwd) {
      return { strength: 0, label: '', color: '' };
    }

    let strength = 0;
    if (pwd.length >= 8) {
      strength++;
    }
    if (/[A-Z]/.test(pwd)) {
      strength++;
    }
    if (/[a-z]/.test(pwd)) {
      strength++;
    }
    if (/[0-9]/.test(pwd)) {
      strength++;
    }
    if (/[^A-Za-z0-9]/.test(pwd)) {
      strength++;
    }

    if (strength <= 2) {
      return { strength: 1, label: 'Weak', color: 'bg-red-500' };
    }
    if (strength <= 3) {
      return { strength: 2, label: 'Fair', color: 'bg-yellow-500' };
    }
    if (strength <= 4) {
      return { strength: 3, label: 'Good', color: 'bg-blue-500' };
    }
    return { strength: 4, label: 'Strong', color: 'bg-green-500' };
  };

  const passwordStrength = getPasswordStrength(password);

  return (
    <>
      {/* Signup Form */}
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-800 dark:bg-gray-900">
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

          {/* Password Field */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Password
            </label>
            <div className="relative mt-1">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                placeholder="Create a password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassword ? (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
            {/* Password Strength Indicator */}
            {password && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full ${
                        level <= passwordStrength.strength
                          ? passwordStrength.color
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    />
                  ))}
                </div>
                <p
                  className={`mt-1 text-xs ${
                    passwordStrength.strength <= 1
                      ? 'text-red-600'
                      : passwordStrength.strength <= 2
                        ? 'text-yellow-600'
                        : passwordStrength.strength <= 3
                          ? 'text-blue-600'
                          : 'text-green-600'
                  }`}
                >
                  {passwordStrength.label}
                </p>
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Must be 8+ characters with uppercase, lowercase, and number
            </p>
          </div>

          {/* Confirm Password Field */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              className={`mt-1 block w-full rounded-lg border bg-white px-4 py-3 text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 ${
                confirmPassword && password !== confirmPassword
                  ? 'border-red-500 dark:border-red-500'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              placeholder="Confirm your password"
            />
            {confirmPassword && password !== confirmPassword && (
              <p className="mt-1 text-xs text-red-600">
                Passwords do not match
              </p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={
              isLoading ||
              (confirmPassword !== '' && password !== confirmPassword)
            }
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
                Creating account...
              </span>
            ) : (
              'Create Account'
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
                Already have an account?
              </span>
            </div>
          </div>
        </div>

        {/* Sign In Link */}
        <div className="mt-6">
          <Link
            href="/login"
            className="flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Sign in instead
          </Link>
        </div>
      </div>
    </>
  );
}

/**
 * Signup Form Loading Skeleton
 */
function SignupFormSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-800 dark:bg-gray-900">
      <div className="space-y-5">
        <div>
          <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-1 h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        </div>
        <div>
          <div className="h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-1 h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        </div>
        <div>
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-1 h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        </div>
        <div className="h-12 animate-pulse rounded-lg bg-gradient-to-r from-blue-200 to-violet-200 dark:from-blue-900 dark:to-violet-900" />
      </div>
    </div>
  );
}

/**
 * Signup Page Component
 *
 * Provides email/password registration with Vault-AI branding.
 * Includes password strength indicator and validation.
 */
export default function SignupPage() {
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
            Create your account
          </h1>
          <p className="mt-2 text-center text-gray-600 dark:text-gray-400">
            Get started with Vault AI
          </p>
        </div>

        {/* Signup Form - Wrapped in Suspense for useSearchParams */}
        <Suspense fallback={<SignupFormSkeleton />}>
          <SignupForm />
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
