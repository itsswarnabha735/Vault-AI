/**
 * Sync State Machine for Vault-AI
 *
 * Manages the state transitions for the synchronization engine.
 *
 * State Machine:
 *
 *   IDLE ─────────────────────────────────────────┐
 *     │                                           │
 *     ▼                                           │
 *   SYNCING ──────────────────────────────────────│
 *     │      │      │                             │
 *     │      │      ▼                             │
 *     │      │   ERROR ───────────────────────────│
 *     │      │     │                              │
 *     │      │     └─ (retry) ──► SYNCING         │
 *     │      │                                    │
 *     │      ▼                                    │
 *     │   CONFLICT ───────────────────────────────│
 *     │      │                                    │
 *     │      └─ (user resolution) ──► IDLE        │
 *     │                                           │
 *     ▼                                           │
 *   SYNCED ───────────────────────────────────────┘
 *
 *   PAUSED ◄──────────────────────────────────────┐
 *     │                                           │
 *     └─ (resume) ──► IDLE                        │
 *
 *   OFFLINE ◄─────────────────────────────────────┤
 *     │                                           │
 *     └─ (online) ──► IDLE                        │
 */

import type { SyncEngineState } from '@/types/sync';

// ============================================
// State Machine Types
// ============================================

/** Valid state transitions */
export type StateTransition = {
  from: SyncEngineState;
  to: SyncEngineState;
  trigger: SyncTrigger;
};

/** Triggers that cause state transitions */
export type SyncTrigger =
  | 'START_SYNC'
  | 'SYNC_SUCCESS'
  | 'SYNC_ERROR'
  | 'CONFLICT_DETECTED'
  | 'CONFLICT_RESOLVED'
  | 'PAUSE'
  | 'RESUME'
  | 'GO_OFFLINE'
  | 'GO_ONLINE'
  | 'RETRY';

/** State machine context */
export interface SyncStateContext {
  /** Current state */
  state: SyncEngineState;

  /** Previous state (for debugging) */
  previousState: SyncEngineState | null;

  /** Number of consecutive errors */
  errorCount: number;

  /** Time entered current state */
  stateEnteredAt: Date;

  /** Time of last successful sync */
  lastSuccessAt: Date | null;

  /** Current retry attempt */
  retryAttempt: number;

  /** Maximum retry attempts */
  maxRetries: number;
}

/** State change listener */
export type StateChangeListener = (
  newState: SyncEngineState,
  previousState: SyncEngineState,
  trigger: SyncTrigger
) => void;

// ============================================
// Valid Transitions
// ============================================

/**
 * Valid state transitions map.
 * Each key is a "from" state, value is an object mapping triggers to "to" states.
 */
const VALID_TRANSITIONS: Record<
  SyncEngineState,
  Partial<Record<SyncTrigger, SyncEngineState>>
> = {
  idle: {
    START_SYNC: 'syncing',
    PAUSE: 'paused',
    GO_OFFLINE: 'offline',
  },
  syncing: {
    SYNC_SUCCESS: 'idle',
    SYNC_ERROR: 'error',
    CONFLICT_DETECTED: 'error', // Conflicts are treated as errors until resolved
    GO_OFFLINE: 'offline',
    PAUSE: 'paused',
  },
  paused: {
    RESUME: 'idle',
    GO_OFFLINE: 'offline',
  },
  offline: {
    GO_ONLINE: 'idle',
  },
  error: {
    RETRY: 'syncing',
    CONFLICT_RESOLVED: 'idle',
    PAUSE: 'paused',
    GO_OFFLINE: 'offline',
    START_SYNC: 'syncing', // Allow manual retry via syncNow
  },
};

// ============================================
// Sync State Machine Class
// ============================================

export class SyncStateMachine {
  private context: SyncStateContext;
  private listeners: Set<StateChangeListener> = new Set();

  constructor(initialState: SyncEngineState = 'idle', maxRetries: number = 3) {
    this.context = {
      state: initialState,
      previousState: null,
      errorCount: 0,
      stateEnteredAt: new Date(),
      lastSuccessAt: null,
      retryAttempt: 0,
      maxRetries,
    };
  }

  // ============================================
  // State Access
  // ============================================

  /** Get current state */
  getState(): SyncEngineState {
    return this.context.state;
  }

  /** Get full context */
  getContext(): Readonly<SyncStateContext> {
    return { ...this.context };
  }

  /** Check if in a specific state */
  isState(state: SyncEngineState): boolean {
    return this.context.state === state;
  }

  /** Check if can sync (in a state that allows sync) */
  canSync(): boolean {
    return this.context.state === 'idle' || this.context.state === 'error';
  }

  /** Check if currently syncing */
  isSyncing(): boolean {
    return this.context.state === 'syncing';
  }

  /** Check if in error state */
  hasError(): boolean {
    return this.context.state === 'error';
  }

  /** Check if paused */
  isPaused(): boolean {
    return this.context.state === 'paused';
  }

  /** Check if offline */
  isOffline(): boolean {
    return this.context.state === 'offline';
  }

  // ============================================
  // State Transitions
  // ============================================

  /**
   * Attempt a state transition.
   *
   * @param trigger - The trigger causing the transition
   * @returns true if transition was successful, false otherwise
   */
  transition(trigger: SyncTrigger): boolean {
    const currentState = this.context.state;
    const validTransitions = VALID_TRANSITIONS[currentState];
    const nextState = validTransitions?.[trigger];

    if (!nextState) {
      console.warn(
        `[SyncStateMachine] Invalid transition: ${currentState} + ${trigger}`
      );
      return false;
    }

    // Check retry limits
    if (trigger === 'RETRY') {
      if (this.context.retryAttempt >= this.context.maxRetries) {
        console.warn(
          `[SyncStateMachine] Max retries (${this.context.maxRetries}) exceeded`
        );
        return false;
      }
      this.context.retryAttempt++;
    }

    // Perform transition
    const previousState = currentState;
    this.context.previousState = previousState;
    this.context.state = nextState;
    this.context.stateEnteredAt = new Date();

    // Update context based on transition
    this.updateContextForTransition(trigger, nextState);

    // Notify listeners
    this.notifyListeners(nextState, previousState, trigger);

    console.log(
      `[SyncStateMachine] ${previousState} ─(${trigger})─► ${nextState}`
    );

    return true;
  }

  /**
   * Update context based on the transition.
   */
  private updateContextForTransition(
    trigger: SyncTrigger,
    _newState: SyncEngineState
  ): void {
    switch (trigger) {
      case 'SYNC_SUCCESS':
        this.context.errorCount = 0;
        this.context.retryAttempt = 0;
        this.context.lastSuccessAt = new Date();
        break;

      case 'SYNC_ERROR':
      case 'CONFLICT_DETECTED':
        this.context.errorCount++;
        break;

      case 'CONFLICT_RESOLVED':
      case 'RESUME':
        this.context.retryAttempt = 0;
        break;

      case 'GO_ONLINE':
        // Reset retry count when coming back online
        this.context.retryAttempt = 0;
        break;
    }
  }

  // ============================================
  // Convenience Methods
  // ============================================

  /** Transition to syncing state */
  startSync(): boolean {
    return this.transition('START_SYNC');
  }

  /** Transition to idle after successful sync */
  syncSuccess(): boolean {
    return this.transition('SYNC_SUCCESS');
  }

  /** Transition to error state */
  syncError(): boolean {
    return this.transition('SYNC_ERROR');
  }

  /** Signal a conflict was detected */
  conflictDetected(): boolean {
    return this.transition('CONFLICT_DETECTED');
  }

  /** Signal a conflict was resolved */
  conflictResolved(): boolean {
    return this.transition('CONFLICT_RESOLVED');
  }

  /** Pause sync */
  pause(): boolean {
    return this.transition('PAUSE');
  }

  /** Resume sync */
  resume(): boolean {
    return this.transition('RESUME');
  }

  /** Go offline */
  goOffline(): boolean {
    return this.transition('GO_OFFLINE');
  }

  /** Go online */
  goOnline(): boolean {
    return this.transition('GO_ONLINE');
  }

  /** Retry after error */
  retry(): boolean {
    return this.transition('RETRY');
  }

  // ============================================
  // Retry Logic
  // ============================================

  /** Check if can retry */
  canRetry(): boolean {
    return (
      this.context.state === 'error' &&
      this.context.retryAttempt < this.context.maxRetries
    );
  }

  /** Get retry delay with exponential backoff (in ms) */
  getRetryDelay(
    baseDelayMs: number = 1000,
    maxDelayMs: number = 30000
  ): number {
    const delay = Math.min(
      baseDelayMs * Math.pow(2, this.context.retryAttempt),
      maxDelayMs
    );
    // Add jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.round(delay + jitter);
  }

  /** Reset retry count */
  resetRetries(): void {
    this.context.retryAttempt = 0;
  }

  // ============================================
  // Event Listeners
  // ============================================

  /** Subscribe to state changes */
  onStateChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Notify all listeners of state change */
  private notifyListeners(
    newState: SyncEngineState,
    previousState: SyncEngineState,
    trigger: SyncTrigger
  ): void {
    this.listeners.forEach((listener) => {
      try {
        listener(newState, previousState, trigger);
      } catch (error) {
        console.error(
          '[SyncStateMachine] Error in state change listener:',
          error
        );
      }
    });
  }

  // ============================================
  // Utilities
  // ============================================

  /** Reset state machine to initial state */
  reset(): void {
    this.context = {
      state: 'idle',
      previousState: null,
      errorCount: 0,
      stateEnteredAt: new Date(),
      lastSuccessAt: null,
      retryAttempt: 0,
      maxRetries: this.context.maxRetries,
    };
  }

  /** Get time in current state (in ms) */
  getTimeInState(): number {
    return Date.now() - this.context.stateEnteredAt.getTime();
  }

  /** Get time since last success (in ms), or null if never synced */
  getTimeSinceLastSuccess(): number | null {
    if (!this.context.lastSuccessAt) {
      return null;
    }
    return Date.now() - this.context.lastSuccessAt.getTime();
  }

  /** Get debug string representation */
  toString(): string {
    return `SyncStateMachine(state=${this.context.state}, errors=${this.context.errorCount}, retries=${this.context.retryAttempt}/${this.context.maxRetries})`;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new SyncStateMachine instance.
 *
 * @param initialState - Initial state (default: 'idle')
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns SyncStateMachine instance
 */
export function createSyncStateMachine(
  initialState: SyncEngineState = 'idle',
  maxRetries: number = 3
): SyncStateMachine {
  return new SyncStateMachine(initialState, maxRetries);
}

/**
 * Check if a state transition is valid.
 *
 * @param from - Current state
 * @param trigger - Transition trigger
 * @returns true if transition is valid
 */
export function isValidTransition(
  from: SyncEngineState,
  trigger: SyncTrigger
): boolean {
  const validTransitions = VALID_TRANSITIONS[from];
  return validTransitions?.[trigger] !== undefined;
}

/**
 * Get the next state for a transition.
 *
 * @param from - Current state
 * @param trigger - Transition trigger
 * @returns Next state, or undefined if invalid
 */
export function getNextState(
  from: SyncEngineState,
  trigger: SyncTrigger
): SyncEngineState | undefined {
  return VALID_TRANSITIONS[from]?.[trigger];
}

/**
 * Get all valid triggers for a state.
 *
 * @param state - Current state
 * @returns Array of valid triggers
 */
export function getValidTriggers(state: SyncEngineState): SyncTrigger[] {
  const transitions = VALID_TRANSITIONS[state];
  return Object.keys(transitions || {}) as SyncTrigger[];
}
