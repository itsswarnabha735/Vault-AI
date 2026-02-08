/**
 * Dashboard Header Component
 *
 * Displays welcome message, date, quick actions, and sync status.
 */

'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { Plus, Upload, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/components/providers/AuthProvider';
import { useKeyboardShortcutsContextOptional } from '@/components/providers/KeyboardShortcutsProvider';
import {
  useSyncStore,
  selectSyncStatus,
  getSyncStateMessage,
} from '@/stores/syncStore';
import type { SyncEngineState } from '@/types/sync';
import { usePendingSync } from '@/hooks/useLocalDB';
import { cn } from '@/lib/utils';

/**
 * Dashboard Header with welcome message, date, and quick actions.
 */
export function DashboardHeader() {
  const { user } = useAuthContext();
  const syncStatus = useSyncStore(selectSyncStatus);
  const { data: pendingSync } = usePendingSync();
  const shortcutsContext = useKeyboardShortcutsContextOptional();

  const today = new Date();
  const greeting = getGreeting();
  const userName =
    user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there';

  const handleImportClick = () => {
    shortcutsContext?.openImport();
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          {greeting}, {userName}!
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {format(today, 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Sync Status */}
        <SyncStatusIndicator
          state={syncStatus.state}
          pendingCount={pendingSync.count}
        />

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/vault?action=add">
              <Plus className="mr-1.5 h-4 w-4" />
              Add Transaction
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportClick}
            title="Import Documents (⌘I / Ctrl+I)"
          >
            <Upload className="mr-1.5 h-4 w-4" />
            Import
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Get time-appropriate greeting.
 */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

/**
 * Sync status indicator component.
 */
interface SyncStatusIndicatorProps {
  state: string;
  pendingCount: number;
}

function SyncStatusIndicator({
  state,
  pendingCount,
}: SyncStatusIndicatorProps) {
  const isSyncing = state === 'syncing';
  const hasError = state === 'error';
  const isOffline = state === 'offline';

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
        hasError && 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
        isOffline &&
          'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
        isSyncing &&
          'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
        !hasError &&
          !isOffline &&
          !isSyncing &&
          'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
      )}
    >
      {isSyncing ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <div
          className={cn(
            'h-2 w-2 rounded-full',
            hasError && 'bg-red-500',
            isOffline && 'bg-gray-400',
            isSyncing && 'bg-blue-500',
            !hasError &&
              !isOffline &&
              !isSyncing &&
              'animate-pulse bg-emerald-500'
          )}
        />
      )}
      <span>
        {getSyncStateMessage(state as SyncEngineState)}
        {pendingCount > 0 && !isSyncing && ` (${pendingCount} pending)`}
      </span>
    </div>
  );
}

export default DashboardHeader;
