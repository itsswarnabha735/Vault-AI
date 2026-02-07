/**
 * ChatMessage Component
 *
 * Single message bubble in the chat thread.
 * Handles user and assistant messages with different styling.
 * Displays citations and suggested follow-ups for assistant messages.
 */

'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatRelativeDate } from '@/lib/utils';
import type { ChatMessage as ChatMessageType, Citation } from '@/types/ai';
import { CitationList } from './CitationChip';
import { InlineTypingIndicator } from './TypingIndicator';

// ============================================
// Types
// ============================================

export interface ChatMessageProps {
  /** Message data */
  message: ChatMessageType;

  /** Handler for citation clicks */
  onCitationClick?: (citation: Citation) => void;

  /** Handler for follow-up query clicks */
  onFollowupClick?: (query: string) => void;

  /** Currently selected citation ID */
  selectedCitationId?: string;

  /** Whether this message is currently streaming */
  isStreaming?: boolean;

  /** Custom class name */
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * Single chat message bubble.
 *
 * @example
 * ```tsx
 * <ChatMessage
 *   message={message}
 *   onCitationClick={(citation) => showTransaction(citation.transactionId)}
 * />
 * ```
 */
export function ChatMessage({
  message,
  onCitationClick,
  onFollowupClick,
  selectedCitationId,
  isStreaming = false,
  className,
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // Format timestamp
  const timestamp = useMemo(() => {
    if (message.timestamp) {
      return formatRelativeDate(
        message.timestamp instanceof Date
          ? message.timestamp
          : new Date(message.timestamp)
      );
    }
    return null;
  }, [message.timestamp]);

  // Render message content with markdown-like formatting
  const formattedContent = useMemo(() => {
    return formatMessageContent(message.content);
  }, [message.content]);

  return (
    <div
      className={cn(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start',
        className
      )}
    >
      <div
        className={cn(
          'flex max-w-[85%] flex-col gap-2',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        {/* Avatar and message bubble */}
        <div
          className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}
        >
          {/* Avatar */}
          {isAssistant && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-600">
              <svg
                className="h-4 w-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
            </div>
          )}

          {/* Message bubble */}
          <div
            className={cn(
              'rounded-2xl px-4 py-3',
              isUser
                ? 'rounded-br-md bg-primary text-primary-foreground'
                : 'rounded-bl-md bg-muted text-foreground'
            )}
          >
            {/* Message content */}
            <div
              className={cn(
                'whitespace-pre-wrap break-words',
                isAssistant && 'prose prose-sm dark:prose-invert max-w-none'
              )}
            >
              {formattedContent}
              {isStreaming && <InlineTypingIndicator className="ml-1" />}
            </div>

            {/* Citations for assistant messages */}
            {isAssistant &&
              message.citations &&
              message.citations.length > 0 && (
                <div className="mt-3 border-t border-border/40 pt-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Referenced transactions:
                  </p>
                  <CitationList
                    citations={message.citations}
                    selectedId={selectedCitationId}
                    onSelect={(citation) => onCitationClick?.(citation)}
                  />
                </div>
              )}
          </div>
        </div>

        {/* Timestamp */}
        {timestamp && !isStreaming && (
          <span
            className={cn(
              'px-2 text-xs text-muted-foreground',
              isUser ? 'text-right' : 'text-left'
            )}
          >
            {timestamp}
          </span>
        )}

        {/* Suggested follow-ups */}
        {isAssistant &&
          message.suggestedFollowups &&
          message.suggestedFollowups.length > 0 &&
          !isStreaming && (
            <div className="mt-1 flex flex-wrap gap-2">
              {message.suggestedFollowups.slice(0, 3).map((followup, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => onFollowupClick?.(followup)}
                  className={cn(
                    'rounded-full border border-border bg-background px-3 py-1.5 text-xs',
                    'text-muted-foreground transition-colors',
                    'hover:border-primary/50 hover:bg-primary/5 hover:text-primary'
                  )}
                >
                  {followup}
                </button>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

// ============================================
// Helpers
// ============================================

/**
 * Format message content with basic markdown-like formatting.
 */
function formatMessageContent(content: string): React.ReactNode {
  // For now, just return the content as-is
  // TODO: Add markdown parsing if needed
  return content;
}

// ============================================
// Variants
// ============================================

/**
 * Compact message variant for smaller displays.
 */
export function CompactMessage({
  message,
  className,
}: {
  message: ChatMessageType;
  className?: string;
}) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex',
        isUser ? 'justify-end' : 'justify-start',
        className
      )}
    >
      <div
        className={cn(
          'max-w-[90%] rounded-lg px-3 py-2 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

/**
 * System message variant for status updates.
 */
export function SystemMessage({
  content,
  type = 'info',
  className,
}: {
  content: string;
  type?: 'info' | 'warning' | 'error';
  className?: string;
}) {
  return (
    <div className={cn('flex justify-center', className)}>
      <div
        className={cn(
          'rounded-full px-4 py-1.5 text-xs',
          type === 'info' && 'bg-muted text-muted-foreground',
          type === 'warning' && 'bg-yellow-500/10 text-yellow-600',
          type === 'error' && 'bg-destructive/10 text-destructive'
        )}
      >
        {content}
      </div>
    </div>
  );
}

export default ChatMessage;
