'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Login Form Component
 *
 * Internal component that handles the login form and uses search params.
 * Wrapped in Suspense boundary for SSR compatibility.
 */
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const _router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/vault';
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const registered = searchParams.get('registered');

  // Handle browser autofill by checking input value on animation events
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

  // Handle successful registration message
  useEffect(() => {
    if (registered === 'true') {
      setMessage({
        type: 'success',
        text: 'Account created successfully! Please sign in.',
      });
    }
  }, [registered]);

  /**
   * Handle form submission - sign in with password
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    // Get values from form data as fallback for autofill issues
    const formData = new FormData(e.currentTarget);
    const emailValue = (formData.get('email') as string) || email;
    const passwordValue = (formData.get('password') as string) || password;

    if (!emailValue || !emailValue.includes('@')) {
      setMessage({
        type: 'error',
        text: 'Please enter a valid email address.',
      });
      setIsLoading(false);
      return;
    }

    if (!passwordValue || passwordValue.length < 6) {
      setMessage({
        type: 'error',
        text: 'Password must be at least 6 characters.',
      });
      setIsLoading(false);
      return;
    }

    try {
      console.log('Attempting login for:', emailValue);
      const supabase = createClient();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailValue,
        password: passwordValue,
      });

      console.log('Login response:', { data, error });

      if (error) {
        throw error;
      }

      if (!data.session) {
        throw new Error('No session returned. Please check your email for confirmation link.');
      }

      console.log('Login successful, session:', data.session.user.email);
      
      // Add small delay to ensure cookies are set before redirect
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Successful login - use window.location.replace for full page reload
      const redirectUrl = redirectTo.startsWith('/') ? `${window.location.origin}${redirectTo}` : redirectTo;
      console.log('Redirecting to:', redirectUrl);
      window.location.replace(redirectUrl);
    } catch (error) {
      console.error('Login error:', error);
      
      let errorMessage = 'Failed to sign in. Please check your credentials.';
      
      if (error instanceof Error) {
        // Provide more helpful error messages
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = 'Invalid email or password. Please try again.';
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = 'Please verify your email address before signing in. Check your inbox for a confirmation link.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setMessage({
        type: 'error',
        text: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Login Form */}
      <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-vault-bg-elevated p-8 shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email Field */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-vault-text-secondary"
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
              className="mt-1 block w-full rounded-lg border border-[rgba(255,255,255,0.10)] bg-vault-bg-tertiary px-4 py-3 text-vault-text-primary placeholder:text-vault-text-tertiary transition-colors focus:border-vault-gold focus:outline-none focus:ring-2 focus:ring-vault-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="you@example.com"
            />
          </div>

          {/* Password Field */}
          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-vault-text-secondary"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-vault-gold hover:text-vault-gold-secondary"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative mt-1">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="block w-full rounded-lg border border-[rgba(255,255,255,0.10)] bg-vault-bg-tertiary px-4 py-3 pr-10 text-vault-text-primary placeholder:text-vault-text-tertiary transition-colors focus:border-vault-gold focus:outline-none focus:ring-2 focus:ring-vault-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-text-tertiary hover:text-vault-text-secondary"
              >
                {showPassword ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="gradient-vault relative w-full overflow-hidden rounded-lg px-4 py-3 font-semibold text-vault-bg-primary shadow-glow transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-vault-gold focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Message Display */}
        {message && (
          <div
            className={`mt-4 rounded-lg p-4 text-sm ${
              message.type === 'success'
                ? 'bg-vault-success-muted text-vault-success-text'
                : 'bg-vault-danger-muted text-vault-danger-text'
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
              <div className="w-full border-t border-[rgba(255,255,255,0.06)]" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-vault-bg-elevated px-3 text-vault-text-tertiary">
                New to Vault AI?
              </span>
            </div>
          </div>
        </div>

        {/* Sign Up Link */}
        <div className="mt-6">
          <Link
            href="/signup"
            className="flex w-full items-center justify-center rounded-lg border border-[rgba(255,255,255,0.10)] bg-vault-bg-surface px-4 py-3 font-medium text-vault-text-primary shadow-sm transition-colors hover:bg-vault-bg-hover focus:outline-none focus:ring-2 focus:ring-vault-gold focus:ring-offset-2"
          >
            Create an account
          </Link>
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
    <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-vault-bg-elevated p-8 shadow-xl">
      <div className="space-y-5">
        <div>
          <div className="h-4 w-24 rounded bg-vault-bg-surface animate-vault-pulse" />
          <div className="mt-1 h-12 rounded-lg bg-vault-bg-tertiary animate-vault-pulse" />
        </div>
        <div>
          <div className="h-4 w-20 rounded bg-vault-bg-surface animate-vault-pulse" />
          <div className="mt-1 h-12 rounded-lg bg-vault-bg-tertiary animate-vault-pulse" />
        </div>
        <div className="h-12 rounded-lg bg-vault-gold-muted animate-vault-pulse" />
      </div>
    </div>
  );
}

/**
 * Login Page Component
 *
 * Provides email/password authentication with Vault-AI branding.
 * Handles loading states, errors, and success messages.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-vault-bg-primary p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo & Header */}
        <div className="flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl gradient-vault shadow-glow">
            <svg
              className="h-10 w-10 text-vault-bg-primary"
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
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-vault-text-primary">
            Welcome back
          </h1>
          <p className="mt-2 text-center text-vault-text-secondary">
            Sign in to your Vault AI account
          </p>
        </div>

        {/* Login Form - Wrapped in Suspense for useSearchParams */}
        <Suspense fallback={<LoginFormSkeleton />}>
          <LoginForm />
        </Suspense>

        {/* Privacy Notice */}
        <div className="rounded-xl border border-vault-success/20 bg-vault-success-muted p-4">
          <div className="flex gap-3">
            <svg
              className="h-5 w-5 flex-shrink-0 text-vault-success-text"
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
            <div className="text-sm text-vault-success-text">
              <p className="font-semibold">Your privacy is guaranteed</p>
              <p className="mt-1 text-vault-success-text">
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
            className="inline-flex items-center gap-1 text-sm text-vault-text-secondary transition-colors hover:text-vault-text-primary"
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
