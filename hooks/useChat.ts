/**
 * useChat Hook for Vault-AI
 *
 * Custom hook for managing chat interactions with the AI assistant.
 * Handles sending messages, receiving responses, streaming, and error handling.
 *
 * PRIVACY: Uses chatService which ensures raw text/embeddings never leave device.
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useChatStore, getOrCreateSession } from '@/stores/chatStore';
import { chatService } from '@/lib/ai/chat-service';
import type { ChatMessage, Citation } from '@/types/ai';

// ============================================
// Types
// ============================================

/**
 * Options for useChat hook.
 */
export interface UseChatOptions {
  /** Auto-create session if none exists */
  autoCreateSession?: boolean;

  /** Enable streaming responses */
  enableStreaming?: boolean;

  /** Maximum message length */
  maxMessageLength?: number;

  /** Callback when message is sent */
  onMessageSent?: (message: ChatMessage) => void;

  /** Callback when response is received */
  onResponseReceived?: (response: {
    text: string;
    citations: Citation[];
  }) => void;

  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * Return type for useChat hook.
 */
export interface UseChatReturn {
  // State
  /** All messages in current session */
  messages: ChatMessage[];

  /** Current input text */
  inputText: string;

  /** Whether a response is loading */
  isLoading: boolean;

  /** Whether response is streaming */
  isStreaming: boolean;

  /** Current streaming text */
  streamingText: string;

  /** Whether the AI model is ready */
  isModelReady: boolean;

  /** Model initialization progress */
  modelProgress: number;

  /** Last error */
  error: { message: string; code: string } | null;

  /** Whether can send message */
  canSendMessage: boolean;

  /** Suggested follow-up queries */
  suggestedQueries: string[];

  /** Selected citation for preview */
  selectedCitation: Citation | null;

  // Actions
  /** Send a message */
  sendMessage: (text?: string) => Promise<void>;

  /** Set input text */
  setInputText: (text: string) => void;

  /** Clear input */
  clearInput: () => void;

  /** Clear conversation history */
  clearHistory: () => void;

  /** Select a quick query */
  selectQuickQuery: (query: string) => void;

  /** Select a citation for preview */
  selectCitation: (citation: Citation | null) => void;

  /** Retry last failed message */
  retryLastMessage: () => Promise<void>;

  /** Cancel streaming response */
  cancelStreaming: () => void;

  /** Clear error */
  clearError: () => void;
}

// ============================================
// Default Options
// ============================================

const DEFAULT_OPTIONS: UseChatOptions = {
  autoCreateSession: true,
  enableStreaming: true,
  maxMessageLength: 2000,
};

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for managing chat interactions.
 *
 * @example
 * ```tsx
 * const { messages, sendMessage, isLoading } = useChat();
 *
 * const handleSend = async () => {
 *   await sendMessage("How much did I spend this month?");
 * };
 * ```
 */
export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Store state
  const messages = useChatStore((state) => state.messages);
  const inputText = useChatStore((state) => state.inputText);
  const loadingState = useChatStore((state) => state.loadingState);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const streamingText = useChatStore((state) => state.streamingText);
  const isModelReady = useChatStore((state) => state.isModelReady);
  const modelProgress = useChatStore((state) => state.modelProgress);
  const lastError = useChatStore((state) => state.lastError);
  const suggestedQueries = useChatStore((state) => state.suggestedQueries);
  const selectedCitation = useChatStore((state) => state.selectedCitation);
  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const userPreferences = useChatStore((state) => state.userPreferences);

  // Store actions
  const storeActions = useChatStore((state) => ({
    setInputText: state.setInputText,
    clearInputText: state.clearInputText,
    addUserMessage: state.addUserMessage,
    addAssistantMessage: state.addAssistantMessage,
    setLoadingState: state.setLoadingState,
    startStreaming: state.startStreaming,
    appendStreamingText: state.appendStreamingText,
    completeStreaming: state.completeStreaming,
    cancelStreaming: state.cancelStreaming,
    setError: state.setError,
    clearError: state.clearError,
    clearCurrentSession: state.clearCurrentSession,
    selectCitation: state.selectCitation,
    createSession: state.createSession,
    setSuggestedQueries: state.setSuggestedQueries,
  }));

  // Keep track of last user message for retry
  const lastUserMessageRef = useRef<string | null>(null);

  // Derived state
  const isLoading =
    loadingState === 'processing' || loadingState === 'streaming';
  const canSendMessage = inputText.trim().length > 0 && !isLoading;
  const error = lastError
    ? { message: lastError.message, code: lastError.code }
    : null;

  // Auto-create session on mount
  useEffect(() => {
    if (opts.autoCreateSession && !currentSessionId) {
      storeActions.createSession();
    }
  }, [opts.autoCreateSession, currentSessionId, storeActions]);

  /**
   * Send a message to the AI assistant.
   */
  const sendMessage = useCallback(
    async (text?: string) => {
      const messageText = text || inputText.trim();

      if (!messageText) {
        return;
      }

      // Validate message length
      if (opts.maxMessageLength && messageText.length > opts.maxMessageLength) {
        storeActions.setError({
          message: `Message too long. Maximum ${opts.maxMessageLength} characters.`,
          code: 'MESSAGE_TOO_LONG',
          recoverable: true,
          timestamp: new Date(),
        });
        return;
      }

      // Ensure session exists
      const store = useChatStore.getState();
      const sessionId = getOrCreateSession(store);

      // Clear input and add user message
      storeActions.clearInputText();
      const userMessage = storeActions.addUserMessage(messageText);
      lastUserMessageRef.current = messageText;

      // Call onMessageSent callback
      opts.onMessageSent?.(userMessage);

      try {
        // Set loading state
        storeActions.setLoadingState('processing');

        // Build context for chat service
        const context = {
          sessionId,
          history: store.messages,
          userPreferences,
        };

        if (opts.enableStreaming) {
          // Streaming response
          storeActions.startStreaming();

          let fullText = '';

          const response = await chatService.processQueryStream(
            messageText,
            context,
            (chunk: string, done: boolean) => {
              // Handle streaming chunk
              fullText += chunk;
              storeActions.appendStreamingText(chunk);

              if (done) {
                // Streaming complete - response object will have citations
              }
            }
          );

          // Complete streaming with citations from response
          storeActions.completeStreaming(
            response.citations,
            response.suggestedFollowups
          );

          // Call onResponseReceived callback
          opts.onResponseReceived?.({
            text: response.text,
            citations: response.citations,
          });
        } else {
          // Non-streaming response
          const response = await chatService.processQuery(messageText, context);

          // Add assistant message
          storeActions.addAssistantMessage(
            response.text,
            response.citations,
            response.suggestedFollowups
          );

          // Update suggested queries
          if (response.suggestedFollowups.length > 0) {
            storeActions.setSuggestedQueries(response.suggestedFollowups);
          }

          storeActions.setLoadingState('idle');

          // Call onResponseReceived callback
          opts.onResponseReceived?.({
            text: response.text,
            citations: response.citations,
          });
        }
      } catch (err) {
        const error = err as Error;
        console.error('Chat error:', error);

        storeActions.setError({
          message: error.message || 'Failed to process your request',
          code: 'PROCESSING_ERROR',
          recoverable: true,
          timestamp: new Date(),
        });

        storeActions.setLoadingState('error');

        // Call onError callback
        opts.onError?.(error);
      }
    },
    [inputText, opts, storeActions, userPreferences]
  );

  /**
   * Set input text.
   */
  const setInputText = useCallback(
    (text: string) => {
      storeActions.setInputText(text);
    },
    [storeActions]
  );

  /**
   * Clear input.
   */
  const clearInput = useCallback(() => {
    storeActions.clearInputText();
  }, [storeActions]);

  /**
   * Clear conversation history.
   */
  const clearHistory = useCallback(() => {
    storeActions.clearCurrentSession();
    storeActions.clearError();
    lastUserMessageRef.current = null;
  }, [storeActions]);

  /**
   * Select a quick query.
   */
  const selectQuickQuery = useCallback(
    (query: string) => {
      storeActions.setInputText(query);
    },
    [storeActions]
  );

  /**
   * Select a citation for preview.
   */
  const selectCitationHandler = useCallback(
    (citation: Citation | null) => {
      storeActions.selectCitation(citation);
    },
    [storeActions]
  );

  /**
   * Retry the last failed message.
   */
  const retryLastMessage = useCallback(async () => {
    if (lastUserMessageRef.current) {
      storeActions.clearError();
      await sendMessage(lastUserMessageRef.current);
    }
  }, [sendMessage, storeActions]);

  /**
   * Cancel streaming response.
   */
  const cancelStreamingHandler = useCallback(() => {
    storeActions.cancelStreaming();
  }, [storeActions]);

  /**
   * Clear error.
   */
  const clearErrorHandler = useCallback(() => {
    storeActions.clearError();
  }, [storeActions]);

  return {
    // State
    messages,
    inputText,
    isLoading,
    isStreaming,
    streamingText,
    isModelReady,
    modelProgress,
    error,
    canSendMessage,
    suggestedQueries,
    selectedCitation,

    // Actions
    sendMessage,
    setInputText,
    clearInput,
    clearHistory,
    selectQuickQuery,
    selectCitation: selectCitationHandler,
    retryLastMessage,
    cancelStreaming: cancelStreamingHandler,
    clearError: clearErrorHandler,
  };
}

// ============================================
// Exports
// ============================================

export default useChat;
