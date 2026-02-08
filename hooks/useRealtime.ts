/**
 * useRealtime Hook for Vault-AI
 *
 * React hook for managing real-time Supabase subscriptions.
 * Provides connection status, auto-reconnect, and change notifications.
 */

'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  getRealtimeManager,
  type RealtimeManager,
  type ConnectionState,
  type ChangeHandler,
  type Unsubscribe,
} from '@/lib/sync/realtime';
import { useAuth } from '@/hooks/useAuth';
import type { RealtimeStatus } from '@/types/sync';
import type { Transaction as TransactionRow } from '@/types/supabase';

// ============================================
// Types
// ============================================

export interface UseRealtimeOptions {
  /** Whether to auto-connect on mount (default: true) */
  autoConnect?: boolean;

  /** Whether to log debug messages (default: false) */
  debug?: boolean;

  /** Callback when a change is received */
  onChange?: ChangeHandler;
}

export interface UseRealtimeReturn {
  /** Current connection state */
  connectionState: ConnectionState;

  /** Whether currently connected */
  isConnected: boolean;

  /** Whether currently connecting */
  isConnecting: boolean;

  /** Whether disconnected */
  isDisconnected: boolean;

  /** Whether in error state */
  hasError: boolean;

  /** Detailed status */
  status: RealtimeStatus;

  /** Time since last event */
  timeSinceLastEvent: string | null;

  /** Connect to real-time */
  connect: () => Promise<void>;

  /** Disconnect from real-time */
  disconnect: () => Promise<void>;

  /** Force reconnection */
  reconnect: () => Promise<void>;

  /** Subscribe to changes */
  subscribeToChanges: (handler: ChangeHandler) => Unsubscribe;
}

// ============================================
// Helper Functions
// ============================================

function formatTimeSinceEvent(lastEventAt: Date | null): string | null {
  if (!lastEventAt) return null;

  const now = new Date();
  const diffMs = now.getTime() - lastEventAt.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) {
    return 'Just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${Math.floor(diffHours / 24)}d ago`;
  }
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for managing real-time Supabase subscriptions.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {
 *     isConnected,
 *     connectionState,
 *     reconnect,
 *   } = useRealtime({
 *     onChange: (eventType, record, oldRecord) => {
 *       console.log('Change:', eventType, record);
 *     }
 *   });
 *
 *   return (
 *     <div>
 *       <p>Status: {connectionState}</p>
 *       <button onClick={reconnect}>Reconnect</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useRealtime(
  options: UseRealtimeOptions = {}
): UseRealtimeReturn {
  const { autoConnect = true, debug = false, onChange } = options;

  // Get current user
  const { user, isAuthenticated } = useAuth();

  // Get realtime manager
  const managerRef = useRef<RealtimeManager | null>(null);

  // State
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Get manager instance
  const getManager = useCallback((): RealtimeManager => {
    if (!managerRef.current) {
      managerRef.current = getRealtimeManager();
    }
    return managerRef.current;
  }, []);

  // ============================================
  // Connection Management
  // ============================================

  const connect = useCallback(async () => {
    if (!user?.id) {
      if (debug) console.log('[useRealtime] No user - cannot connect');
      return;
    }

    if (debug) console.log('[useRealtime] Connecting...');
    const manager = getManager();
    await manager.subscribe(user.id);
  }, [user?.id, getManager, debug]);

  const disconnect = useCallback(async () => {
    if (debug) console.log('[useRealtime] Disconnecting...');
    const manager = getManager();
    await manager.unsubscribe();
  }, [getManager, debug]);

  const reconnect = useCallback(async () => {
    if (debug) console.log('[useRealtime] Reconnecting...');
    const manager = getManager();
    await manager.reconnect();
  }, [getManager, debug]);

  const subscribeToChanges = useCallback(
    (handler: ChangeHandler): Unsubscribe => {
      const manager = getManager();
      return manager.onChange(handler);
    },
    [getManager]
  );

  // ============================================
  // Effects
  // ============================================

  // Subscribe to connection state changes
  useEffect(() => {
    const manager = getManager();

    const unsubscribe = manager.onConnectionChange((connected, state) => {
      if (debug) console.log('[useRealtime] Connection state:', state);
      setConnectionState(state);

      // Update status when connected
      if (connected) {
        const status = manager.getStatus();
        setLastEventAt(status.lastEventAt);
        setReconnectAttempts(status.reconnectAttempts);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [getManager, debug]);

  // Subscribe to changes if onChange callback provided
  useEffect(() => {
    if (!onChange) return;

    const manager = getManager();
    const unsubscribe = manager.onChange((eventType, record, oldRecord) => {
      setLastEventAt(new Date());
      onChange(eventType, record, oldRecord);
    });

    return () => {
      unsubscribe();
    };
  }, [getManager, onChange]);

  // Auto-connect when authenticated
  useEffect(() => {
    if (!autoConnect || !isAuthenticated || !user?.id) {
      return;
    }

    if (debug) console.log('[useRealtime] Auto-connecting for user:', user.id);
    connect();

    return () => {
      if (debug) console.log('[useRealtime] Cleanup - disconnecting');
      disconnect();
    };
  }, [autoConnect, isAuthenticated, user?.id, connect, disconnect, debug]);

  // ============================================
  // Derived State
  // ============================================

  const status = useMemo((): RealtimeStatus => {
    const manager = getManager();
    return manager.getStatus();
  }, [getManager, connectionState]); // eslint-disable-line react-hooks/exhaustive-deps

  const timeSinceLastEvent = useMemo(
    () => formatTimeSinceEvent(lastEventAt),
    [lastEventAt]
  );

  // ============================================
  // Return
  // ============================================

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    isConnecting: connectionState === 'connecting',
    isDisconnected: connectionState === 'disconnected',
    hasError: connectionState === 'error',
    status,
    timeSinceLastEvent,
    connect,
    disconnect,
    reconnect,
    subscribeToChanges,
  };
}

// ============================================
// Lightweight Hooks
// ============================================

/**
 * Lightweight hook that just returns connection status.
 * Use when you only need to display connection state.
 */
export function useRealtimeStatus(): {
  connectionState: ConnectionState;
  isConnected: boolean;
  isConnecting: boolean;
  hasError: boolean;
} {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');

  useEffect(() => {
    const manager = getRealtimeManager();
    setConnectionState(manager.getConnectionState());

    const unsubscribe = manager.onConnectionChange((_, state) => {
      setConnectionState(state);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    isConnecting: connectionState === 'connecting',
    hasError: connectionState === 'error',
  };
}

/**
 * Hook to subscribe to real-time changes with a callback.
 * Automatically handles subscription lifecycle.
 */
export function useRealtimeChanges(
  onInsert?: (record: TransactionRow) => void,
  onUpdate?: (newRecord: TransactionRow, oldRecord: TransactionRow) => void,
  onDelete?: (record: TransactionRow) => void
): void {
  useEffect(() => {
    const manager = getRealtimeManager();

    const unsubscribe = manager.onChange((eventType, record, oldRecord) => {
      switch (eventType) {
        case 'INSERT':
          if (record && onInsert) {
            onInsert(record);
          }
          break;
        case 'UPDATE':
          if (record && oldRecord && onUpdate) {
            onUpdate(record, oldRecord);
          }
          break;
        case 'DELETE':
          if (oldRecord && onDelete) {
            onDelete(oldRecord);
          }
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [onInsert, onUpdate, onDelete]);
}

/**
 * Hook to get color for connection indicator.
 */
export function useRealtimeColor(): 'green' | 'yellow' | 'red' | 'gray' {
  const { connectionState } = useRealtimeStatus();

  switch (connectionState) {
    case 'connected':
      return 'green';
    case 'connecting':
      return 'yellow';
    case 'error':
      return 'red';
    case 'disconnected':
    default:
      return 'gray';
  }
}

// Default export
export default useRealtime;
