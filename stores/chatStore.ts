/**
 * Chat Store for Vault-AI
 *
 * Zustand store for managing chat state across the application.
 * Handles conversation history, loading states, and chat sessions.
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector, persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type {
  ChatMessage,
  ChatSession,
  Citation,
  QueryIntent,
  ChatResponse,
} from '@/types/ai';

// ============================================
// Types
// ============================================

/**
 * Loading state for chat operations.
 */
export type ChatLoadingState =
  | 'idle'
  | 'initializing'
  | 'processing'
  | 'streaming'
  | 'error';

/**
 * Chat error information.
 */
export interface ChatError {
  /** Error message */
  message: string;

  /** Error code */
  code: string;

  /** Whether the error is recoverable */
  recoverable: boolean;

  /** Timestamp */
  timestamp: Date;
}

/**
 * Chat store state.
 */
export interface ChatState {
  // Session management
  /** Current active session ID */
  currentSessionId: string | null;

  /** All chat sessions */
  sessions: Record<string, ChatSession>;

  // Current conversation state
  /** Messages in the current session */
  messages: ChatMessage[];

  /** Current input text */
  inputText: string;

  // Loading and processing state
  /** Current loading state */
  loadingState: ChatLoadingState;

  /** Whether the AI model is initialized */
  isModelReady: boolean;

  /** Model initialization progress (0-100) */
  modelProgress: number;

  /** Whether response is currently streaming */
  isStreaming: boolean;

  /** Streaming text accumulator */
  streamingText: string;

  // Error state
  /** Last error */
  lastError: ChatError | null;

  // UI state
  /** Whether the chat panel is open (for mobile) */
  isPanelOpen: boolean;

  /** Selected citation for preview */
  selectedCitation: Citation | null;

  /** Suggested queries to display */
  suggestedQueries: string[];

  // User preferences
  /** User preferences for chat */
  userPreferences: {
    currency: string;
    timezone: string;
  };
}

/**
 * Chat store actions.
 */
export interface ChatActions {
  // Session management
  /** Create a new chat session */
  createSession: (title?: string) => string;

  /** Switch to a different session */
  switchSession: (sessionId: string) => void;

  /** Delete a session */
  deleteSession: (sessionId: string) => void;

  /** Clear current session messages */
  clearCurrentSession: () => void;

  /** Update session title */
  updateSessionTitle: (sessionId: string, title: string) => void;

  // Message management
  /** Add a user message */
  addUserMessage: (content: string, intent?: QueryIntent) => ChatMessage;

  /** Add an assistant message */
  addAssistantMessage: (
    content: string,
    citations?: Citation[],
    suggestedFollowups?: string[]
  ) => ChatMessage;

  /** Update a message (for streaming) */
  updateMessage: (messageId: string, content: string) => void;

  /** Delete a message */
  deleteMessage: (messageId: string) => void;

  // Input management
  /** Set input text */
  setInputText: (text: string) => void;

  /** Clear input text */
  clearInputText: () => void;

  // Loading state management
  /** Set loading state */
  setLoadingState: (state: ChatLoadingState) => void;

  /** Set model ready state */
  setModelReady: (ready: boolean) => void;

  /** Set model progress */
  setModelProgress: (progress: number) => void;

  // Streaming management
  /** Start streaming response */
  startStreaming: () => void;

  /** Append to streaming text */
  appendStreamingText: (text: string) => void;

  /** Complete streaming */
  completeStreaming: (
    citations?: Citation[],
    suggestedFollowups?: string[]
  ) => void;

  /** Cancel streaming */
  cancelStreaming: () => void;

  // Error management
  /** Set error */
  setError: (error: ChatError | null) => void;

  /** Clear error */
  clearError: () => void;

  // UI state management
  /** Toggle chat panel */
  togglePanel: () => void;

  /** Set panel open state */
  setPanelOpen: (open: boolean) => void;

  /** Select a citation */
  selectCitation: (citation: Citation | null) => void;

  /** Set suggested queries */
  setSuggestedQueries: (queries: string[]) => void;

  // User preferences
  /** Update user preferences */
  updatePreferences: (prefs: Partial<ChatState['userPreferences']>) => void;

  // Bulk operations
  /** Apply a chat response to the store */
  applyResponse: (response: ChatResponse) => void;

  /** Reset store to initial state */
  reset: () => void;
}

/**
 * Combined store type.
 */
export type ChatStore = ChatState & ChatActions;

// ============================================
// Default Values
// ============================================

const DEFAULT_SUGGESTED_QUERIES = [
  'How much did I spend this month?',
  "What's my budget status?",
  'Show my largest expenses',
  'Compare this month to last month',
];

const initialState: ChatState = {
  currentSessionId: null,
  sessions: {},
  messages: [],
  inputText: '',
  loadingState: 'idle',
  isModelReady: false,
  modelProgress: 0,
  isStreaming: false,
  streamingText: '',
  lastError: null,
  isPanelOpen: false,
  selectedCitation: null,
  suggestedQueries: DEFAULT_SUGGESTED_QUERIES,
  userPreferences: {
    currency: 'INR',
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
  },
};

// ============================================
// Store Implementation
// ============================================

export const useChatStore = create<ChatStore>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set, get) => ({
          // Initial state
          ...initialState,

          // ============================================
          // Session Management
          // ============================================

          createSession: (title?: string) => {
            const sessionId = uuidv4();
            const now = new Date();

            const session: ChatSession = {
              id: sessionId,
              messages: [],
              createdAt: now,
              lastActivityAt: now,
              title: title || `Chat ${Object.keys(get().sessions).length + 1}`,
            };

            set(
              (state) => ({
                sessions: { ...state.sessions, [sessionId]: session },
                currentSessionId: sessionId,
                messages: [],
              }),
              false,
              'createSession'
            );

            return sessionId;
          },

          switchSession: (sessionId) => {
            const session = get().sessions[sessionId];
            if (!session) {
              return;
            }

            set(
              {
                currentSessionId: sessionId,
                messages: session.messages,
                lastError: null,
              },
              false,
              'switchSession'
            );
          },

          deleteSession: (sessionId) => {
            set(
              (state) => {
                const { [sessionId]: _deleted, ...remainingSessions } =
                  state.sessions;
                const isCurrentSession = state.currentSessionId === sessionId;

                return {
                  sessions: remainingSessions,
                  currentSessionId: isCurrentSession
                    ? null
                    : state.currentSessionId,
                  messages: isCurrentSession ? [] : state.messages,
                };
              },
              false,
              'deleteSession'
            );
          },

          clearCurrentSession: () => {
            const { currentSessionId } = get();
            if (!currentSessionId) {
              return;
            }

            set(
              (state) => ({
                messages: [],
                sessions: {
                  ...state.sessions,
                  [currentSessionId]: {
                    ...state.sessions[currentSessionId]!,
                    messages: [],
                    lastActivityAt: new Date(),
                  },
                },
              }),
              false,
              'clearCurrentSession'
            );
          },

          updateSessionTitle: (sessionId, title) => {
            set(
              (state) => {
                const session = state.sessions[sessionId];
                if (!session) {
                  return state;
                }

                return {
                  sessions: {
                    ...state.sessions,
                    [sessionId]: { ...session, title },
                  },
                };
              },
              false,
              'updateSessionTitle'
            );
          },

          // ============================================
          // Message Management
          // ============================================

          addUserMessage: (content, intent) => {
            const message: ChatMessage = {
              id: uuidv4(),
              role: 'user',
              content,
              timestamp: new Date(),
              citations: null,
              intent,
            };

            set(
              (state) => {
                const messages = [...state.messages, message];
                const { currentSessionId } = state;

                // Update session if exists
                if (currentSessionId && state.sessions[currentSessionId]) {
                  return {
                    messages,
                    sessions: {
                      ...state.sessions,
                      [currentSessionId]: {
                        ...state.sessions[currentSessionId]!,
                        messages,
                        lastActivityAt: new Date(),
                      },
                    },
                  };
                }

                return { messages };
              },
              false,
              'addUserMessage'
            );

            return message;
          },

          addAssistantMessage: (
            content,
            citations = [],
            suggestedFollowups = []
          ) => {
            const message: ChatMessage = {
              id: uuidv4(),
              role: 'assistant',
              content,
              timestamp: new Date(),
              citations,
              suggestedFollowups,
            };

            set(
              (state) => {
                const messages = [...state.messages, message];
                const { currentSessionId } = state;

                // Update session if exists
                if (currentSessionId && state.sessions[currentSessionId]) {
                  return {
                    messages,
                    suggestedQueries:
                      suggestedFollowups.length > 0
                        ? suggestedFollowups
                        : state.suggestedQueries,
                    sessions: {
                      ...state.sessions,
                      [currentSessionId]: {
                        ...state.sessions[currentSessionId]!,
                        messages,
                        lastActivityAt: new Date(),
                      },
                    },
                  };
                }

                return {
                  messages,
                  suggestedQueries:
                    suggestedFollowups.length > 0
                      ? suggestedFollowups
                      : state.suggestedQueries,
                };
              },
              false,
              'addAssistantMessage'
            );

            return message;
          },

          updateMessage: (messageId, content) => {
            set(
              (state) => ({
                messages: state.messages.map((m) =>
                  m.id === messageId ? { ...m, content } : m
                ),
              }),
              false,
              'updateMessage'
            );
          },

          deleteMessage: (messageId) => {
            set(
              (state) => ({
                messages: state.messages.filter((m) => m.id !== messageId),
              }),
              false,
              'deleteMessage'
            );
          },

          // ============================================
          // Input Management
          // ============================================

          setInputText: (text) =>
            set({ inputText: text }, false, 'setInputText'),

          clearInputText: () => set({ inputText: '' }, false, 'clearInputText'),

          // ============================================
          // Loading State Management
          // ============================================

          setLoadingState: (loadingState) =>
            set({ loadingState }, false, 'setLoadingState'),

          setModelReady: (isModelReady) =>
            set({ isModelReady }, false, 'setModelReady'),

          setModelProgress: (modelProgress) =>
            set({ modelProgress }, false, 'setModelProgress'),

          // ============================================
          // Streaming Management
          // ============================================

          startStreaming: () =>
            set(
              {
                isStreaming: true,
                streamingText: '',
                loadingState: 'streaming',
              },
              false,
              'startStreaming'
            ),

          appendStreamingText: (text) =>
            set(
              (state) => ({
                streamingText: state.streamingText + text,
              }),
              false,
              'appendStreamingText'
            ),

          completeStreaming: (citations = [], suggestedFollowups = []) => {
            const { streamingText, addAssistantMessage } = get();

            // Add the complete message
            addAssistantMessage(streamingText, citations, suggestedFollowups);

            set(
              {
                isStreaming: false,
                streamingText: '',
                loadingState: 'idle',
              },
              false,
              'completeStreaming'
            );
          },

          cancelStreaming: () =>
            set(
              {
                isStreaming: false,
                streamingText: '',
                loadingState: 'idle',
              },
              false,
              'cancelStreaming'
            ),

          // ============================================
          // Error Management
          // ============================================

          setError: (error) =>
            set(
              {
                lastError: error,
                loadingState: error ? 'error' : 'idle',
              },
              false,
              'setError'
            ),

          clearError: () =>
            set(
              {
                lastError: null,
                loadingState: 'idle',
              },
              false,
              'clearError'
            ),

          // ============================================
          // UI State Management
          // ============================================

          togglePanel: () =>
            set(
              (state) => ({ isPanelOpen: !state.isPanelOpen }),
              false,
              'togglePanel'
            ),

          setPanelOpen: (isPanelOpen) =>
            set({ isPanelOpen }, false, 'setPanelOpen'),

          selectCitation: (selectedCitation) =>
            set({ selectedCitation }, false, 'selectCitation'),

          setSuggestedQueries: (suggestedQueries) =>
            set({ suggestedQueries }, false, 'setSuggestedQueries'),

          // ============================================
          // User Preferences
          // ============================================

          updatePreferences: (prefs) =>
            set(
              (state) => ({
                userPreferences: { ...state.userPreferences, ...prefs },
              }),
              false,
              'updatePreferences'
            ),

          // ============================================
          // Bulk Operations
          // ============================================

          applyResponse: (response) => {
            const { addAssistantMessage, setSuggestedQueries } = get();

            addAssistantMessage(
              response.text,
              response.citations,
              response.suggestedFollowups
            );

            if (response.suggestedFollowups.length > 0) {
              setSuggestedQueries(response.suggestedFollowups);
            }

            set({ loadingState: 'idle' }, false, 'applyResponse');
          },

          reset: () =>
            set(
              {
                ...initialState,
                userPreferences: get().userPreferences, // Preserve preferences
              },
              false,
              'reset'
            ),
        }),
        {
          name: 'vault-ai-chat',
          // Version 2: Migrates persisted state from USD defaults to INR
          version: 2,
          migrate: (persistedState: unknown, version: number) => {
            const state = persistedState as Record<string, unknown>;
            if (version < 2) {
              // Fix stale USD currency from v1 persisted state
              const prefs = state.userPreferences as
                | { currency?: string; timezone?: string }
                | undefined;
              if (prefs) {
                if (prefs.currency === 'USD') {
                  prefs.currency = 'INR';
                }
                if (prefs.timezone === 'UTC') {
                  prefs.timezone =
                    Intl.DateTimeFormat().resolvedOptions().timeZone ||
                    'Asia/Kolkata';
                }
              }
            }
            return state as ChatState & ChatActions;
          },
          partialize: (state) => ({
            // Persist sessions (which contain messages), current session, and preferences
            sessions: state.sessions,
            currentSessionId: state.currentSessionId,
            userPreferences: state.userPreferences,
          }),
          onRehydrateStorage: () => {
            return (state) => {
              // After rehydration, restore messages from the current session
              // Must use setState — direct mutation doesn't work in Zustand v5
              if (state && state.currentSessionId) {
                const session = state.sessions[state.currentSessionId];
                if (
                  session &&
                  session.messages &&
                  session.messages.length > 0
                ) {
                  useChatStore.setState({
                    messages: session.messages,
                  });
                }
              }
            };
          },
        }
      )
    ),
    { name: 'ChatStore' }
  )
);

// ============================================
// Selectors
// ============================================

/** Select current session */
export const selectCurrentSession = (state: ChatStore) =>
  state.currentSessionId ? state.sessions[state.currentSessionId] : null;

/** Select all sessions */
export const selectAllSessions = (state: ChatStore) =>
  Object.values(state.sessions);

/** Select messages */
export const selectMessages = (state: ChatStore) => state.messages;

/** Select if chat is loading */
export const selectIsLoading = (state: ChatStore) =>
  state.loadingState === 'processing' || state.loadingState === 'streaming';

/** Select if streaming */
export const selectIsStreaming = (state: ChatStore) => state.isStreaming;

/** Select loading state */
export const selectLoadingState = (state: ChatStore) => state.loadingState;

/** Select model ready state */
export const selectIsModelReady = (state: ChatStore) => state.isModelReady;

/** Select model progress */
export const selectModelProgress = (state: ChatStore) => state.modelProgress;

/** Select error */
export const selectError = (state: ChatStore) => state.lastError;

/** Select has error */
export const selectHasError = (state: ChatStore) => state.lastError !== null;

/** Select input text */
export const selectInputText = (state: ChatStore) => state.inputText;

/** Select suggested queries */
export const selectSuggestedQueries = (state: ChatStore) =>
  state.suggestedQueries;

/** Select streaming text */
export const selectStreamingText = (state: ChatStore) => state.streamingText;

/** Select selected citation */
export const selectSelectedCitation = (state: ChatStore) =>
  state.selectedCitation;

/** Select user preferences */
export const selectUserPreferences = (state: ChatStore) =>
  state.userPreferences;

/** Select if panel is open */
export const selectIsPanelOpen = (state: ChatStore) => state.isPanelOpen;

/** Select if can send message */
export const selectCanSendMessage = (state: ChatStore) =>
  state.inputText.trim().length > 0 &&
  state.loadingState !== 'processing' &&
  state.loadingState !== 'streaming';

/** Select last user message */
export const selectLastUserMessage = (state: ChatStore) =>
  [...state.messages].reverse().find((m) => m.role === 'user');

/** Select last assistant message */
export const selectLastAssistantMessage = (state: ChatStore) =>
  [...state.messages].reverse().find((m) => m.role === 'assistant');

// ============================================
// Utility Functions
// ============================================

/**
 * Get or create a session.
 */
export function getOrCreateSession(store: ChatStore): string {
  if (store.currentSessionId && store.sessions[store.currentSessionId]) {
    return store.currentSessionId;
  }
  return store.createSession();
}

/**
 * Format message time for display.
 */
export function formatMessageTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Generate a session title from the first message.
 */
export function generateSessionTitle(messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((m) => m.role === 'user');
  if (!firstUserMessage) {
    return 'New Chat';
  }

  // Truncate to first 40 characters
  const content = firstUserMessage.content.trim();
  if (content.length <= 40) {
    return content;
  }
  return `${content.substring(0, 37)}...`;
}
