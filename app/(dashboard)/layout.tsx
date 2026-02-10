'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthContext } from '@/components/providers/AuthProvider';
import { useSyncStatus } from '@/hooks/useSync';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * Dashboard Layout Component
 *
 * Provides the main layout for authenticated pages including:
 * - Header with navigation
 * - User menu with sign out
 * - Footer with sync status
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const { user, signOut, isLoading } = useAuthContext();
  const syncStatus = useSyncStatus();

  const handleSignOut = async () => {
    await signOut();
  };

  const isActive = (path: string) => pathname === path;

  return (
    <div className="flex min-h-screen flex-col bg-vault-bg-primary">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[rgba(255,255,255,0.06)] bg-vault-bg-secondary/80 backdrop-blur-lg">
        <div className="flex h-16 items-center gap-8 px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-vault shadow-glow">
              <svg
                className="h-5 w-5 text-vault-bg-primary"
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
            <span className="font-display text-lg font-semibold text-vault-text-primary">
              Vault<span className="text-vault-gold">AI</span>
            </span>
          </Link>

          {/* Navigation */}
          <nav className="flex flex-1 gap-1">
            <Link
              href="/dashboard"
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-150 ${
                isActive('/dashboard')
                  ? 'bg-vault-gold-muted text-vault-gold border-l-2 border-vault-gold'
                  : 'text-vault-text-secondary hover:bg-vault-bg-surface hover:text-vault-text-primary'
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/vault"
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-150 ${
                isActive('/vault')
                  ? 'bg-vault-gold-muted text-vault-gold border-l-2 border-vault-gold'
                  : 'text-vault-text-secondary hover:bg-vault-bg-surface hover:text-vault-text-primary'
              }`}
            >
              Vault
            </Link>
            <Link
              href="/chat"
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-150 ${
                isActive('/chat')
                  ? 'bg-vault-gold-muted text-vault-gold border-l-2 border-vault-gold'
                  : 'text-vault-text-secondary hover:bg-vault-bg-surface hover:text-vault-text-primary'
              }`}
            >
              Chat
            </Link>
            <Link
              href="/settings"
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-150 ${
                isActive('/settings')
                  ? 'bg-vault-gold-muted text-vault-gold border-l-2 border-vault-gold'
                  : 'text-vault-text-secondary hover:bg-vault-bg-surface hover:text-vault-text-primary'
              }`}
            >
              Settings
            </Link>
          </nav>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            {/* Live Sync Status Indicator */}
            <LiveSyncBadge
              statusColor={syncStatus.statusColor}
              statusMessage={syncStatus.statusMessage}
              isSyncing={syncStatus.isSyncing}
              pendingCount={syncStatus.pendingCount}
            />

            {/* User Email */}
            {user && (
              <span className="hidden font-mono text-xs text-vault-text-tertiary sm:block">
                {user.email}
              </span>
            )}

            {/* Sign Out Button */}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isLoading}
              className="rounded-md border border-[rgba(255,255,255,0.10)] bg-vault-bg-surface px-3 py-1.5 text-sm font-medium text-vault-text-secondary transition-all duration-150 hover:bg-vault-bg-hover hover:text-vault-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer - Privacy Status Bar */}
      <footer className="border-t border-[rgba(255,255,255,0.06)] bg-gradient-to-r from-vault-bg-tertiary to-vault-bg-elevated">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-vault-success"
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
              <span className="font-medium text-vault-success-text">
                All documents stored locally on your device
              </span>
              <span className="font-mono text-xs text-vault-text-tertiary">
                AES-256 encrypted
              </span>
            </div>
            <div className="font-mono text-xs text-vault-text-tertiary">
              Vault AI v1.0 &bull; All data stays on your device
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================
// Live Sync Badge
// ============================================

interface LiveSyncBadgeProps {
  statusColor: 'green' | 'yellow' | 'red' | 'gray';
  statusMessage: string;
  isSyncing: boolean;
  pendingCount: number;
}

function LiveSyncBadge({
  statusColor,
  statusMessage,
  isSyncing,
  pendingCount,
}: LiveSyncBadgeProps) {
  const colorClasses: Record<string, string> = {
    green: 'bg-vault-success-muted text-vault-success-text',
    yellow: 'bg-vault-warning-muted text-vault-warning-text',
    red: 'bg-vault-danger-muted text-vault-danger-text',
    gray: 'bg-vault-bg-surface text-vault-text-tertiary',
  };

  const dotClasses: Record<string, string> = {
    green: 'bg-vault-success',
    yellow: 'bg-vault-warning',
    red: 'bg-vault-danger',
    gray: 'bg-vault-text-tertiary',
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${colorClasses[statusColor] || colorClasses.gray}`}
    >
      {isSyncing ? (
        <svg
          className="h-3.5 w-3.5 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      ) : (
        <div
          className={`h-2 w-2 rounded-full ${statusColor === 'green' ? 'animate-pulse' : ''} ${dotClasses[statusColor] || dotClasses.gray}`}
        />
      )}
      <span>
        {statusMessage}
        {pendingCount > 0 && !isSyncing && ` (${pendingCount} pending)`}
      </span>
    </div>
  );
}
