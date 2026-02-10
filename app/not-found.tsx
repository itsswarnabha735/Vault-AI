import Link from 'next/link';

/**
 * 404 Not Found Page
 *
 * Displayed when a route doesn't exist.
 * This is a Server Component (required for root not-found in Next.js 14).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-vault-bg-primary p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Error Message */}
        <div>
          <h1 className="text-6xl font-bold text-vault-text-primary">404</h1>
          <h2 className="mt-2 text-xl font-semibold text-vault-text-secondary">
            Page Not Found
          </h2>
          <p className="mt-2 text-sm text-vault-text-secondary">
            The page you&apos;re looking for doesn&apos;t exist or has been
            moved.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="gradient-vault rounded-lg px-6 py-2.5 font-medium text-vault-bg-primary shadow-sm transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-vault-gold focus:ring-offset-2"
          >
            Go Home
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-[rgba(255,255,255,0.10)] bg-vault-bg-surface px-6 py-2.5 font-medium text-vault-text-primary shadow-sm transition-colors hover:bg-vault-bg-hover focus:outline-none focus:ring-2 focus:ring-vault-gold focus:ring-offset-2"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
