/**
 * ChatContainer Component
 *
 * Main container for the chat interface.
 * Orchestrates the message thread, input, sidebar, and citation panel.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useChat } from '@/hooks/useChat';
import type { Citation } from '@/types/ai';
import { MessageThread } from './MessageThread';
import { ChatInput } from './ChatInput';
import { QuickQueriesSidebar, InlineQuickQueries } from './QuickQueriesSidebar';
import { CitationPanel } from './CitationPanel';

// ============================================
// Types
// ============================================

export interface ChatContainerProps {
  /** Show quick queries sidebar on desktop */
  showSidebar?: boolean;

  /** Show inline quick queries on mobile */
  showInlineQueries?: boolean;

  /** Handler for viewing full document from citation */
  onViewDocument?: (transactionId: string) => void;

  /** Custom class name */
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * Main chat container component.
 *
 * @example
 * ```tsx
 * <ChatContainer
 *   showSidebar={true}
 *   onViewDocument={(id) => router.push(`/transactions/${id}`)}
 * />
 * ```
 */
export function ChatContainer({
  showSidebar = true,
  showInlineQueries = true,
  onViewDocument,
  className,
}: ChatContainerProps) {
  // Use chat hook for all chat functionality
  const {
    messages,
    inputText,
    isLoading,
    isStreaming,
    streamingText,
    error,
    suggestedQueries,
    selectedCitation,
    sendMessage,
    setInputText,
    selectCitation,
    retryLastMessage,
    clearError,
  } = useChat();

  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Get all citations from messages for navigation
  const allCitations = useMemo(() => {
    return messages.flatMap((m) => m.citations || []);
  }, [messages]);

  // Current citation index for navigation
  const currentCitationIndex = useMemo(() => {
    if (!selectedCitation) {
      return -1;
    }
    return allCitations.findIndex(
      (c) => c.transactionId === selectedCitation.transactionId
    );
  }, [allCitations, selectedCitation]);

  // Handle citation click
  const handleCitationClick = useCallback(
    (citation: Citation) => {
      selectCitation(citation);
    },
    [selectCitation]
  );

  // Handle follow-up click - auto-send the follow-up query
  const handleFollowupClick = useCallback(
    (query: string) => {
      sendMessage(query);
    },
    [sendMessage]
  );

  // Handle quick query selection - auto-send
  const handleQuickQuerySelect = useCallback(
    (query: string) => {
      sendMessage(query);
    },
    [sendMessage]
  );

  // Handle citation navigation
  const handleCitationNavigate = useCallback(
    (direction: 'prev' | 'next') => {
      if (allCitations.length === 0) {
        return;
      }

      let newIndex = currentCitationIndex;
      if (direction === 'prev') {
        newIndex = Math.max(0, currentCitationIndex - 1);
      } else {
        newIndex = Math.min(allCitations.length - 1, currentCitationIndex + 1);
      }

      const citation = allCitations[newIndex];
      if (newIndex !== currentCitationIndex && citation) {
        selectCitation(citation);
      }
    },
    [allCitations, currentCitationIndex, selectCitation]
  );

  // Handle close citation panel
  const handleCloseCitation = useCallback(() => {
    selectCitation(null);
  }, [selectCitation]);

  // Handle send message
  const handleSend = useCallback(() => {
    sendMessage();
  }, [sendMessage]);

  // Handle retry
  const handleRetry = useCallback(() => {
    clearError();
    retryLastMessage();
  }, [clearError, retryLastMessage]);

  return (
    <div className={cn('flex h-full', className)}>
      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Message thread */}
        <div className="flex-1 overflow-hidden">
          <MessageThread
            messages={messages}
            isLoading={isLoading}
            isStreaming={isStreaming}
            streamingText={streamingText}
            onCitationClick={handleCitationClick}
            onFollowupClick={handleFollowupClick}
            selectedCitationId={selectedCitation?.transactionId}
            error={error}
            onRetry={handleRetry}
            className="h-full"
          />
        </div>

        {/* Mobile inline quick queries */}
        {showInlineQueries && messages.length === 0 && (
          <div className="border-t border-border px-4 py-3 lg:hidden">
            <InlineQuickQueries
              onSelectQuery={handleQuickQuerySelect}
              queries={suggestedQueries}
            />
          </div>
        )}

        {/* Chat input */}
        <div className="border-t border-border bg-background p-4">
          <ChatInput
            value={inputText}
            onChange={setInputText}
            onSend={handleSend}
            isLoading={isLoading || isStreaming}
            placeholder="Ask a question about your finances..."
          />

          {/* Privacy note */}
          <p className="mt-2 text-center text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <svg
                className="h-3 w-3 text-green-600"
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
              Your documents stay on your device
            </span>
          </p>
        </div>
      </div>

      {/* Desktop quick queries sidebar */}
      {showSidebar && (
        <div className="hidden lg:block">
          <QuickQueriesSidebar
            onSelectQuery={handleQuickQuerySelect}
            suggestedQueries={suggestedQueries}
            isOpen={isSidebarOpen}
            onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
            collapsible
          />
        </div>
      )}

      {/* Citation panel */}
      <CitationPanel
        citation={selectedCitation}
        onClose={handleCloseCitation}
        onViewDocument={onViewDocument}
        onNavigate={
          allCitations.length > 1 ? handleCitationNavigate : undefined
        }
        hasNavigation={allCitations.length > 1}
        currentIndex={currentCitationIndex}
        totalCount={allCitations.length}
      />
    </div>
  );
}

// ============================================
// Compact Variant
// ============================================

export interface CompactChatContainerProps {
  /** Custom class name */
  className?: string;

  /** Handler for viewing full chat */
  onExpandClick?: () => void;
}

/**
 * Compact chat container for embedding in smaller spaces.
 */
export function CompactChatContainer({
  className,
  onExpandClick,
}: CompactChatContainerProps) {
  const {
    messages,
    inputText,
    isLoading,
    isStreaming,
    streamingText,
    sendMessage,
    setInputText,
  } = useChat();

  // Show only last few messages
  const recentMessages = messages.slice(-5);

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border border-border bg-background',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-600">
            <svg
              className="h-3 w-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </div>
          <span className="text-sm font-medium">Finance Assistant</span>
        </div>
        {onExpandClick && (
          <button
            type="button"
            onClick={onExpandClick}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Expand chat"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        <MessageThread
          messages={recentMessages}
          isLoading={isLoading}
          isStreaming={isStreaming}
          streamingText={streamingText}
          className="max-h-60"
        />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && inputText.trim()) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask a question..."
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={() => sendMessage()}
            disabled={isLoading || !inputText.trim()}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatContainer;
