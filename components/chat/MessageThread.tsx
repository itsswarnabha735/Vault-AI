/**
 * MessageThread Component
 *
 * Scrollable container displaying chat messages.
 * Handles auto-scroll, empty state, and streaming messages.
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { ChatMessage as ChatMessageType, Citation } from '@/types/ai';
import { ChatMessage } from './ChatMessage';
import { MessageTypingIndicator } from './TypingIndicator';

// ============================================
// Types
// ============================================

export interface MessageThreadProps {
  /** Array of messages to display */
  messages: ChatMessageType[];

  /** Whether AI is currently loading/processing */
  isLoading?: boolean;

  /** Whether response is currently streaming */
  isStreaming?: boolean;

  /** Current streaming text */
  streamingText?: string;

  /** Handler for citation clicks */
  onCitationClick?: (citation: Citation) => void;

  /** Handler for follow-up query clicks */
  onFollowupClick?: (query: string) => void;

  /** Currently selected citation ID */
  selectedCitationId?: string;

  /** Error message to display */
  error?: { message: string; code: string } | null;

  /** Handler for retry action */
  onRetry?: () => void;

  /** Custom class name */
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * Scrollable message thread with auto-scroll behavior.
 *
 * @example
 * ```tsx
 * <MessageThread
 *   messages={messages}
 *   isLoading={isLoading}
 *   onCitationClick={handleCitation}
 * />
 * ```
 */
export function MessageThread({
  messages,
  isLoading = false,
  isStreaming = false,
  streamingText = '',
  onCitationClick,
  onFollowupClick,
  selectedCitationId,
  error,
  onRetry,
  className,
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // Scroll while streaming
  useEffect(() => {
    if (isStreaming) {
      scrollToBottom('auto');
    }
  }, [streamingText, isStreaming, scrollToBottom]);

  // Empty state
  if (messages.length === 0 && !isLoading && !error) {
    return (
      <div className={cn('flex h-full flex-col', className)}>
        <EmptyState />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        'flex flex-1 flex-col overflow-y-auto',
        'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border',
        className
      )}
    >
      <div className="flex flex-col gap-4 p-4">
        {/* Messages */}
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onCitationClick={onCitationClick}
            onFollowupClick={onFollowupClick}
            selectedCitationId={selectedCitationId}
          />
        ))}

        {/* Streaming message */}
        {isStreaming && streamingText && (
          <ChatMessage
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingText,
              timestamp: new Date(),
              citations: null,
            }}
            isStreaming
          />
        )}

        {/* Loading indicator */}
        {isLoading && !isStreaming && (
          <MessageTypingIndicator text="Analyzing your finances..." />
        )}

        {/* Error message */}
        {error && (
          <ErrorMessage
            message={error.message}
            code={error.code}
            onRetry={onRetry}
          />
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} className="h-0" />
      </div>
    </div>
  );
}

// ============================================
// Empty State
// ============================================

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      {/* AI Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg">
        <svg
          className="h-8 w-8 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
          />
        </svg>
      </div>

      {/* Title */}
      <h3 className="mt-6 text-xl font-semibold text-foreground">
        Start a conversation
      </h3>

      {/* Description */}
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Ask me anything about your finances. I can help you understand spending
        patterns, find specific transactions, and provide insights.
      </p>

      {/* Privacy note */}
      <div className="mt-6 flex items-center gap-2 rounded-full bg-green-500/10 px-4 py-2">
        <svg
          className="h-4 w-4 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
          />
        </svg>
        <span className="text-xs text-green-600">
          Your data stays on your device
        </span>
      </div>
    </div>
  );
}

// ============================================
// Error Message
// ============================================

function ErrorMessage({
  message,
  code,
  onRetry,
}: {
  message: string;
  code: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex justify-start">
      <div className="flex max-w-[85%] gap-3">
        {/* Error icon */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
          <svg
            className="h-4 w-4 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>

        {/* Error content */}
        <div className="flex flex-col gap-2">
          <div className="rounded-2xl rounded-bl-md bg-destructive/10 px-4 py-3">
            <p className="text-sm text-destructive">{message}</p>
            {code && (
              <p className="mt-1 text-xs text-destructive/60">
                Error code: {code}
              </p>
            )}
          </div>

          {/* Retry button */}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default MessageThread;
