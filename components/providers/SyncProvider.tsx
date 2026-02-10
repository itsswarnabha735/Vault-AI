/**
 * SyncProvider Component
 *
 * Starts the sync engine when the user is authenticated.
 * Integrates with AuthProvider to automatically begin/stop sync
 * based on login state.
 *
 * IMPORTANT: This provider does NOT subscribe to sync state.
 * It only manages the engine lifecycle and pushes events into
 * the Zustand store. Leaf components (DashboardHeader, SyncSettings)
 * subscribe to the store for reactive display. This avoids
 * re-rendering the entire component tree on every sync event.
 *
 * PRIVACY: The sync engine only transmits sanitized accounting data
 * (amounts, vendors, dates). Raw documents, text, and embeddings
 * NEVER leave the device.
 */

'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useAuthContext } from './AuthProvider';
import { getSyncEngine, type SyncEngine } from '@/lib/sync/sync-engine';
import { useSyncStore } from '@/stores/syncStore';

interface SyncProviderProps {
  children: ReactNode;
}

/**
 * Provides sync engine lifecycle management.
 *
 * - When user is authenticated: starts the sync engine
 * - When user signs out: stops the sync engine
 * - Pushes sync events to Zustand store (without subscribing)
 *
 * Mount this inside AuthProvider so it has access to auth state.
 */
export function SyncProvider({ children }: SyncProviderProps) {
  const { isAuthenticated, isLoading } = useAuthContext();
  const engineRef = useRef<SyncEngine | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Set up the sync engine ONCE on mount — subscribe to events
  // and push them into the Zustand store without re-rendering this component
  useEffect(() => {
    const engine = getSyncEngine();
    engineRef.current = engine;

    // Get store actions directly (non-reactive — doesn't cause re-renders)
    const store = useSyncStore.getState();

    // Subscribe to engine events → push into Zustand store
    const unsubStart = engine.onSyncStart(() => {
      useSyncStore.getState().setSyncState('syncing');
    });

    const unsubComplete = engine.onSyncComplete((result) => {
      useSyncStore.getState().onSyncComplete(result);
      // Update pending count after sync
      engine.getPendingCount().then((count) => {
        useSyncStore.getState().setPendingCount(count);
      });
    });

    const unsubError = engine.onSyncError((error) => {
      useSyncStore.getState().onSyncError(error);
      useSyncStore.getState().setSyncState('error');
    });

    const unsubConflict = engine.onConflict((conflict) => {
      useSyncStore.getState().addConflict(conflict);
    });

    // Set up online/offline listeners
    const handleOnline = () => useSyncStore.getState().setOnline(true);
    const handleOffline = () => useSyncStore.getState().setOnline(false);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      // Set initial online state
      store.setOnline(navigator.onLine);
    }

    // Update initial pending count
    engine.getPendingCount().then((count) => {
      useSyncStore.getState().setPendingCount(count);
    });

    // Store cleanup function
    cleanupRef.current = () => {
      unsubStart();
      unsubComplete();
      unsubError();
      unsubConflict();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []); // Empty deps — set up once, never re-run

  // Manage engine lifecycle based on auth state
  useEffect(() => {
    if (isLoading) return;

    const engine = engineRef.current;
    if (!engine) return;

    if (isAuthenticated) {
      engine.start();
      console.log('[SyncProvider] User authenticated — sync engine started');
    } else {
      engine.stop();
      useSyncStore.getState().setSyncState('idle');
      console.log('[SyncProvider] Not authenticated — sync engine stopped');
    }
  }, [isAuthenticated, isLoading]);

  // This component renders NO extra elements and NEVER re-renders
  // due to sync state changes (it doesn't subscribe to the store)
  return <>{children}</>;
}

export default SyncProvider;
