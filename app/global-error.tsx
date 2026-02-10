'use client';

/**
 * Global Error Boundary for Root Layout
 *
 * This handles errors that occur in the root layout.
 * It must provide its own html and body tags.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
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
                Critical Error
              </h1>
              <p className="mt-2 text-sm text-vault-text-secondary">
                {error.message || 'Something went wrong. Please refresh the page.'}
              </p>
            </div>

            {/* Retry Button */}
            <button
              onClick={reset}
              className="gradient-vault rounded-lg px-6 py-2 font-medium text-vault-bg-primary hover:opacity-90"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
