/**
 * Chat Page
 *
 * Full-height chat interface for interacting with the AI assistant.
 * Features message thread, quick queries sidebar, and citation panel.
 *
 * PRIVACY: All document processing happens locally.
 * Only structured data (amounts, dates, vendors) is sent to the LLM.
 */

'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChatContainer } from '@/components/chat';

// ============================================
// Page Component
// ============================================

export default function ChatPage() {
  const router = useRouter();

  // Handle viewing a full document from citation
  const handleViewDocument = useCallback(
    (transactionId: string) => {
      // Navigate to transaction details page
      router.push(`/transactions/${transactionId}`);
    },
    [router]
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Finance Assistant
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask questions about your finances and get instant insights
            </p>
          </div>

          {/* Privacy badge */}
          <div className="hidden items-center gap-2 rounded-full bg-green-500/10 px-4 py-2 sm:flex">
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
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              Private & Secure
            </span>
          </div>
        </div>
      </header>

      {/* Chat Container */}
      <main className="flex-1 overflow-hidden">
        <ChatContainer
          showSidebar={true}
          showInlineQueries={true}
          onViewDocument={handleViewDocument}
          className="h-full"
        />
      </main>
    </div>
  );
}
