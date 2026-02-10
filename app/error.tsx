'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Global Error Boundary
 *
 * Handles runtime errors in the application.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console for debugging
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-vault-bg-primary p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Error Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-vault-danger-muted">
          <svg
            className="h-8 w-8 text-vault-danger-text"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Error Message */}
        <div>
          <h1 className="text-2xl font-bold text-vault-text-primary">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-vault-text-secondary">
            {error.message || 'An unexpected error occurred.'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="gradient-vault rounded-lg px-4 py-2 font-medium text-vault-bg-primary shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-vault-gold focus:ring-offset-2"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-[rgba(255,255,255,0.10)] bg-vault-bg-surface px-4 py-2 font-medium text-vault-text-primary shadow-sm transition-colors hover:bg-vault-bg-hover focus:outline-none focus:ring-2 focus:ring-vault-gold focus:ring-offset-2"
          >
            Go home
          </Link>
        </div>

        {/* Debug Info (development only) */}
        {process.env.NODE_ENV === 'development' && error.digest && (
          <p className="text-xs text-vault-text-tertiary">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
