'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Reset Password Page Component
 *
 * Allows users to set a new password after clicking the reset link.
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const router = useRouter();

  // Check if user has a valid session (from the reset link)
  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // If no session, the reset link might be invalid or expired
      if (!session) {
        setMessage({
          type: 'error',
          text: 'Invalid or expired reset link. Please request a new password reset.',
        });
      }
    };

    checkSession();
  }, []);

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
   * Handle form submission - update password
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

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

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      setIsSuccess(true);
      setMessage({
        type: 'success',
        text: 'Password updated successfully! Redirecting to login...',
      });

      // Redirect to login after a short delay
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (error) {
      console.error('Password update error:', error);
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Failed to update password. Please try again.',
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
            Set new password
          </h1>
          <p className="mt-2 text-center text-gray-600 dark:text-gray-400">
            Create a new password for your account
          </p>
        </div>

        {/* Reset Form */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-800 dark:bg-gray-900">
          {!isSuccess ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Password Field */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  New password
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
                    placeholder="Enter new password"
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
                  Confirm new password
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
                  placeholder="Confirm new password"
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
                    Updating password...
                  </span>
                ) : (
                  'Update Password'
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                Your password has been updated successfully!
              </p>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                Redirecting to login...
              </p>
            </div>
          )}

          {/* Message Display */}
          {message && !isSuccess && (
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
        </div>

        {/* Back Link */}
        <div className="text-center">
          <Link
            href="/login"
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
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
