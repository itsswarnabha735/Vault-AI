/**
 * ConflictBanner Component for Vault-AI
 *
 * Shows a notification banner when there are unresolved sync conflicts.
 * Clicking the banner opens the conflict resolution dialog.
 */

'use client';

import * as React from 'react';
import { AlertTriangle, X, ChevronRight, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/index';
import { useConflicts, useConflictCount } from '@/hooks/useConflicts';
import type { TransactionId } from '@/types/database';

// ============================================
// Types
// ============================================

interface ConflictBannerProps {
  /** Additional CSS classes */
  className?: string;
  /** Whether the banner can be dismissed */
  dismissible?: boolean;
  /** Position of the banner */
  position?: 'top' | 'bottom' | 'inline';
  /** Variant style */
  variant?: 'banner' | 'compact' | 'toast';
  /** Auto-hide after showing */
  autoHide?: boolean;
  /** Auto-hide delay in ms */
  autoHideDelay?: number;
}

// ============================================
// Main Component
// ============================================

/**
 * Banner that shows when there are unresolved sync conflicts.
 *
 * @example
 * ```tsx
 * // In a layout component
 * function AppLayout({ children }) {
 *   return (
 *     <div>
 *       <ConflictBanner position="top" />
 *       {children}
 *     </div>
 *   );
 * }
 * ```
 */
export function ConflictBanner({
  className,
  dismissible = true,
  position = 'top',
  variant = 'banner',
  autoHide = false,
  autoHideDelay = 10000,
}: ConflictBannerProps) {
  const { hasConflicts, count } = useConflictCount();
  const { openFirstUnresolved } = useConflicts();
  const [isDismissed, setIsDismissed] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(true);

  // Reset dismissed state when new conflicts appear
  React.useEffect(() => {
    if (hasConflicts) {
      setIsDismissed(false);
      setIsVisible(true);
    }
  }, [hasConflicts, count]);

  // Auto-hide functionality
  React.useEffect(() => {
    if (autoHide && hasConflicts && isVisible) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, autoHideDelay);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoHide, autoHideDelay, hasConflicts, isVisible]);

  // Don't render if no conflicts or dismissed
  if (!hasConflicts || isDismissed || !isVisible) {
    return null;
  }

  // Handle click
  const handleClick = () => {
    openFirstUnresolved();
  };

  // Handle dismiss
  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDismissed(true);
  };

  // Position styles
  const positionStyles = {
    top: 'fixed top-0 left-0 right-0 z-50',
    bottom: 'fixed bottom-0 left-0 right-0 z-50',
    inline: '',
  };

  // Variant styles
  if (variant === 'compact') {
    return (
      <button
        onClick={handleClick}
        className={cn(
          'flex items-center gap-2 rounded-md bg-yellow-500/10 px-3 py-1.5 text-sm text-yellow-600 transition-colors hover:bg-yellow-500/20 dark:text-yellow-400',
          className
        )}
      >
        <AlertTriangle className="h-4 w-4" />
        <span>
          {count} conflict{count !== 1 ? 's' : ''}
        </span>
        <ChevronRight className="h-4 w-4" />
      </button>
    );
  }

  if (variant === 'toast') {
    return (
      <div
        className={cn(
          'fixed bottom-4 right-4 z-50 max-w-sm animate-in fade-in slide-in-from-bottom-2',
          className
        )}
      >
        <div
          onClick={handleClick}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 shadow-lg backdrop-blur-sm transition-colors hover:bg-yellow-500/20"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
              Sync Conflict{count !== 1 ? 's' : ''} Detected
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              {count} transaction{count !== 1 ? 's' : ''} need
              {count === 1 ? 's' : ''} your attention
            </p>
          </div>
          {dismissible && (
            <button
              onClick={handleDismiss}
              className="rounded p-1 text-yellow-600 hover:bg-yellow-500/20 dark:text-yellow-400"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Default banner variant
  return (
    <div
      className={cn(
        positionStyles[position],
        'animate-in fade-in slide-in-from-top-1',
        className
      )}
    >
      <div
        onClick={handleClick}
        className="flex cursor-pointer items-center justify-between gap-4 bg-yellow-500/10 px-4 py-2 transition-colors hover:bg-yellow-500/15"
      >
        {/* Left side */}
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          <div>
            <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
              {count} Sync Conflict{count !== 1 ? 's' : ''} Detected
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Click to review and resolve
            </p>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="text-yellow-600 hover:bg-yellow-500/20 hover:text-yellow-700 dark:text-yellow-400"
            onClick={(e) => {
              e.stopPropagation();
              openFirstUnresolved();
            }}
          >
            Resolve Now
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>

          {dismissible && (
            <button
              onClick={handleDismiss}
              className="rounded p-1 text-yellow-600 hover:bg-yellow-500/20 dark:text-yellow-400"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Alternative Components
// ============================================

/**
 * A small indicator dot that shows when there are conflicts.
 * Useful for icons or compact UI elements.
 */
export function ConflictIndicator({
  className,
  showCount = false,
}: {
  className?: string;
  showCount?: boolean;
}) {
  const { hasConflicts, count } = useConflictCount();

  if (!hasConflicts) {
    return null;
  }

  if (showCount) {
    return (
      <span
        className={cn(
          'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-500 px-1.5 text-xs font-medium text-white',
          className
        )}
      >
        {count}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-yellow-500',
        className
      )}
    />
  );
}

/**
 * A notification badge that shows conflict count.
 * Designed to be placed on icons like a sync button.
 */
export function ConflictBadge({ className }: { className?: string }) {
  const { hasConflicts, count } = useConflictCount();
  const { openFirstUnresolved } = useConflicts();

  if (!hasConflicts) {
    return null;
  }

  return (
    <button
      onClick={openFirstUnresolved}
      className={cn(
        'absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-500 px-1 text-[10px] font-bold text-white shadow-sm transition-transform hover:scale-110',
        className
      )}
    >
      {count > 9 ? '9+' : count}
    </button>
  );
}

/**
 * Inline conflict warning for specific transactions.
 */
export function TransactionConflictWarning({
  transactionId,
  className,
}: {
  transactionId: string;
  className?: string;
}) {
  const { getConflictForTransaction, openDialog } = useConflicts();
  const conflict = getConflictForTransaction(transactionId as TransactionId);

  if (!conflict) {
    return null;
  }

  return (
    <button
      onClick={() => openDialog(conflict.id)}
      className={cn(
        'inline-flex items-center gap-1 rounded bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-600 transition-colors hover:bg-yellow-500/20 dark:text-yellow-400',
        className
      )}
    >
      <AlertTriangle className="h-3 w-3" />
      <span>Conflict</span>
    </button>
  );
}

/**
 * Full-width sync status bar with conflict awareness.
 */
export function SyncStatusBar({ className }: { className?: string }) {
  const { hasConflicts, count } = useConflictCount();
  const { openFirstUnresolved } = useConflicts();

  // This would typically also include sync status from useSync
  // For now, just show conflict status

  if (!hasConflicts) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-xs text-muted-foreground',
          className
        )}
      >
        <RefreshCw className="h-3 w-3" />
        <span>All synced</span>
      </div>
    );
  }

  return (
    <button
      onClick={openFirstUnresolved}
      className={cn(
        'flex items-center gap-2 text-xs text-yellow-600 transition-colors hover:text-yellow-700 dark:text-yellow-400',
        className
      )}
    >
      <AlertTriangle className="h-3 w-3" />
      <span>
        {count} conflict{count !== 1 ? 's' : ''} need resolution
      </span>
    </button>
  );
}

export default ConflictBanner;
