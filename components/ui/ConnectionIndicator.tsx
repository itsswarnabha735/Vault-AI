/**
 * ConnectionIndicator Component
 *
 * Displays real-time connection status with a colored dot indicator.
 * - Green: Connected
 * - Yellow: Connecting/Reconnecting
 * - Red: Error
 * - Gray: Disconnected
 */

'use client';

import { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useRealtimeStatus, useRealtimeColor } from '@/hooks/useRealtime';
import { useSyncStatus } from '@/hooks/useSync';
import type { ConnectionState } from '@/lib/sync/realtime';

// ============================================
// Types
// ============================================

export interface ConnectionIndicatorProps {
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';

  /** Whether to show the label */
  showLabel?: boolean;

  /** Whether to show detailed status on hover */
  showTooltip?: boolean;

  /** Whether to animate the dot when syncing */
  animated?: boolean;

  /** Additional CSS classes */
  className?: string;

  /** Show sync status alongside connection status */
  showSyncStatus?: boolean;
}

// ============================================
// Size Configuration
// ============================================

const sizeConfig = {
  sm: {
    dot: 'h-2 w-2',
    text: 'text-xs',
    container: 'gap-1.5',
  },
  md: {
    dot: 'h-2.5 w-2.5',
    text: 'text-sm',
    container: 'gap-2',
  },
  lg: {
    dot: 'h-3 w-3',
    text: 'text-base',
    container: 'gap-2.5',
  },
};

// ============================================
// Color Configuration
// ============================================

const colorConfig = {
  green: {
    dot: 'bg-green-500',
    ring: 'ring-green-500/30',
    text: 'text-green-600 dark:text-green-400',
    pulse: 'animate-pulse-slow',
  },
  yellow: {
    dot: 'bg-yellow-500',
    ring: 'ring-yellow-500/30',
    text: 'text-yellow-600 dark:text-yellow-400',
    pulse: 'animate-pulse',
  },
  red: {
    dot: 'bg-red-500',
    ring: 'ring-red-500/30',
    text: 'text-red-600 dark:text-red-400',
    pulse: '',
  },
  gray: {
    dot: 'bg-gray-400',
    ring: 'ring-gray-400/30',
    text: 'text-gray-500 dark:text-gray-400',
    pulse: '',
  },
};

// ============================================
// Helper Functions
// ============================================

function getConnectionLabel(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'disconnected':
      return 'Disconnected';
    case 'error':
      return 'Connection Error';
    default:
      return 'Unknown';
  }
}

function getConnectionTooltip(
  state: ConnectionState,
  isOnline: boolean,
  isSyncing: boolean,
  pendingCount: number
): string {
  const lines: string[] = [];

  // Connection status
  lines.push(`Real-time: ${getConnectionLabel(state)}`);

  // Online status
  lines.push(`Network: ${isOnline ? 'Online' : 'Offline'}`);

  // Sync status
  if (isSyncing) {
    lines.push('Sync: In progress...');
  } else if (pendingCount > 0) {
    lines.push(`Sync: ${pendingCount} pending`);
  } else {
    lines.push('Sync: Up to date');
  }

  return lines.join('\n');
}

// ============================================
// Component
// ============================================

export function ConnectionIndicator({
  size = 'md',
  showLabel = false,
  showTooltip = true,
  animated = true,
  className,
  showSyncStatus = false,
}: ConnectionIndicatorProps) {
  // Get connection status
  const { connectionState, isConnecting } = useRealtimeStatus();
  const color = useRealtimeColor();

  // Get sync status if needed
  const { isOnline, isSyncing, pendingCount } = useSyncStatus();

  // Get size and color config
  const sizes = sizeConfig[size];
  const colors = colorConfig[color];

  // Determine if should pulse
  const shouldPulse = animated && (isConnecting || isSyncing);

  // Build tooltip content
  const tooltip = useMemo(() => {
    if (!showTooltip) {
      return undefined;
    }
    return getConnectionTooltip(
      connectionState,
      isOnline,
      isSyncing,
      pendingCount
    );
  }, [showTooltip, connectionState, isOnline, isSyncing, pendingCount]);

  return (
    <div
      className={cn('inline-flex items-center', sizes.container, className)}
      title={tooltip}
    >
      {/* Dot indicator */}
      <span className="relative flex">
        {/* Pulse ring */}
        {shouldPulse && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75',
              colors.dot,
              'animate-ping'
            )}
          />
        )}
        {/* Main dot */}
        <span
          className={cn(
            'relative inline-flex rounded-full',
            sizes.dot,
            colors.dot,
            shouldPulse && colors.pulse
          )}
        />
      </span>

      {/* Label */}
      {showLabel && (
        <span className={cn(sizes.text, colors.text, 'font-medium')}>
          {getConnectionLabel(connectionState)}
        </span>
      )}

      {/* Sync status badge */}
      {showSyncStatus && pendingCount > 0 && !isSyncing && (
        <span
          className={cn(
            'inline-flex items-center justify-center',
            'h-5 min-w-[1.25rem] rounded-full px-1.5',
            'text-xs font-medium',
            'bg-yellow-100 text-yellow-800',
            'dark:bg-yellow-900/30 dark:text-yellow-400'
          )}
        >
          {pendingCount}
        </span>
      )}
    </div>
  );
}

// ============================================
// Detailed Status Component
// ============================================

export interface ConnectionStatusProps {
  className?: string;
}

export function ConnectionStatus({ className }: ConnectionStatusProps) {
  const { connectionState, isConnected, isConnecting, hasError } =
    useRealtimeStatus();
  const { isOnline, isSyncing, pendingCount, timeSinceSync, statusMessage } =
    useSyncStatus();
  const color = useRealtimeColor();
  const colors = colorConfig[color];

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3',
        'bg-white dark:bg-gray-900',
        'border-gray-200 dark:border-gray-800',
        className
      )}
    >
      {/* Connection row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Real-time
        </span>
        <div className="flex items-center gap-2">
          <ConnectionIndicator size="sm" />
          <span className={cn('text-sm font-medium', colors.text)}>
            {getConnectionLabel(connectionState)}
          </span>
        </div>
      </div>

      {/* Network row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Network
        </span>
        <span
          className={cn(
            'text-sm font-medium',
            isOnline
              ? 'text-green-600 dark:text-green-400'
              : 'text-gray-500 dark:text-gray-400'
          )}
        >
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Sync row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">Sync</span>
        <div className="flex items-center gap-2">
          {isSyncing ? (
            <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
              Syncing...
            </span>
          ) : pendingCount > 0 ? (
            <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
              {pendingCount} pending
            </span>
          ) : (
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              Up to date
            </span>
          )}
        </div>
      </div>

      {/* Last sync row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Last sync
        </span>
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {timeSinceSync}
        </span>
      </div>

      {/* Error message */}
      {hasError && (
        <div className="mt-1 rounded bg-red-50 p-2 dark:bg-red-900/20">
          <span className="text-xs text-red-600 dark:text-red-400">
            Connection lost. Will retry automatically.
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================
// Compact Badge Component
// ============================================

export interface SyncBadgeProps {
  className?: string;
}

export function SyncBadge({ className }: SyncBadgeProps) {
  const { isConnected } = useRealtimeStatus();
  const { isSyncing, pendingCount } = useSyncStatus();

  // Determine what to show
  let label: string;
  let variant: 'success' | 'warning' | 'syncing' | 'offline';

  if (isSyncing) {
    label = 'Syncing...';
    variant = 'syncing';
  } else if (pendingCount > 0) {
    label = `${pendingCount} pending`;
    variant = 'warning';
  } else if (isConnected) {
    label = 'Synced';
    variant = 'success';
  } else {
    label = 'Offline';
    variant = 'offline';
  }

  const variantStyles = {
    success:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    warning:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    syncing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    offline: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1',
        'text-xs font-medium',
        variantStyles[variant],
        className
      )}
    >
      <ConnectionIndicator size="sm" animated={isSyncing} />
      {label}
    </span>
  );
}

// ============================================
// Exports
// ============================================

export default ConnectionIndicator;
