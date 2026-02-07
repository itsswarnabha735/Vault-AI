/**
 * QuickQueriesSidebar Component
 *
 * Sidebar panel with preset quick queries for common questions.
 * Displays suggested follow-ups and conversation history.
 */

'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { DEFAULT_QUICK_QUERIES, type QuickQuery } from '@/types/ai';

// ============================================
// Types
// ============================================

export interface QuickQueriesSidebarProps {
  /** Handler for selecting a query */
  onSelectQuery: (query: string) => void;

  /** Suggested follow-up queries */
  suggestedQueries?: string[];

  /** Whether sidebar is open (for mobile) */
  isOpen?: boolean;

  /** Toggle sidebar handler */
  onToggle?: () => void;

  /** Whether to show as collapsible */
  collapsible?: boolean;

  /** Custom class name */
  className?: string;
}

// ============================================
// Quick Query Categories
// ============================================

const CATEGORIES = [
  { id: 'spending', label: 'Spending', icon: '📊' },
  { id: 'budget', label: 'Budget', icon: '💰' },
  { id: 'search', label: 'Search', icon: '🔍' },
  { id: 'insights', label: 'Insights', icon: '💡' },
] as const;

// ============================================
// Component
// ============================================

/**
 * Sidebar with quick queries and suggestions.
 *
 * @example
 * ```tsx
 * <QuickQueriesSidebar
 *   onSelectQuery={(query) => setInputText(query)}
 *   suggestedQueries={suggestedQueries}
 * />
 * ```
 */
export function QuickQueriesSidebar({
  onSelectQuery,
  suggestedQueries = [],
  isOpen = true,
  onToggle,
  collapsible = false,
  className,
}: QuickQueriesSidebarProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Filter queries by category
  const filteredQueries = useMemo(() => {
    if (!selectedCategory) {
      return DEFAULT_QUICK_QUERIES;
    }
    return DEFAULT_QUICK_QUERIES.filter((q) => q.category === selectedCategory);
  }, [selectedCategory]);

  // Don't render if collapsed and closed
  if (collapsible && !isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex h-full w-10 items-center justify-center border-l border-border bg-muted/50',
          'transition-colors hover:bg-muted',
          className
        )}
        aria-label="Open quick queries"
      >
        <svg
          className="h-5 w-5 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
          />
        </svg>
      </button>
    );
  }

  return (
    <div
      className={cn(
        'flex h-full w-72 flex-col border-l border-border bg-muted/30',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Quick Queries</h3>
        {collapsible && (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close quick queries"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Suggested Follow-ups */}
        {suggestedQueries.length > 0 && (
          <div className="border-b border-border p-4">
            <h4 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
              Suggested
            </h4>
            <div className="flex flex-col gap-2">
              {suggestedQueries.slice(0, 4).map((query, index) => (
                <SuggestedQueryButton
                  key={index}
                  query={query}
                  onClick={() => onSelectQuery(query)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Category filters */}
        <div className="border-b border-border p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                selectedCategory === null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              All
            </button>
            {CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  selectedCategory === category.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {category.icon} {category.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick queries list */}
        <div className="p-4">
          <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Common Questions
          </h4>
          <div className="flex flex-col gap-2">
            {filteredQueries.map((query) => (
              <QuickQueryButton
                key={query.id}
                query={query}
                onClick={() => onSelectQuery(query.template)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Footer - Privacy note */}
      <div className="border-t border-border p-4">
        <div className="flex items-start gap-2 rounded-lg bg-green-500/10 p-3">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-green-600"
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
          <div>
            <p className="text-xs font-medium text-green-700 dark:text-green-400">
              Privacy-first
            </p>
            <p className="mt-0.5 text-xs text-green-600 dark:text-green-500">
              Your documents never leave your device
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

/**
 * Quick query button.
 */
function QuickQueryButton({
  query,
  onClick,
}: {
  query: QuickQuery;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors',
        'border border-border bg-background',
        'hover:border-primary/30 hover:bg-primary/5'
      )}
    >
      <span className="text-lg">{query.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground group-hover:text-primary">
          {query.label}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {query.template}
        </p>
      </div>
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
        />
      </svg>
    </button>
  );
}

/**
 * Suggested query button (more prominent).
 */
function SuggestedQueryButton({
  query,
  onClick,
}: {
  query: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2 rounded-lg p-2.5 text-left transition-colors',
        'border border-primary/20 bg-primary/5',
        'hover:border-primary/40 hover:bg-primary/10'
      )}
    >
      <svg
        className="h-4 w-4 shrink-0 text-primary"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
        />
      </svg>
      <span className="flex-1 truncate text-sm text-primary">{query}</span>
    </button>
  );
}

// ============================================
// Inline Quick Queries (for mobile)
// ============================================

export interface InlineQuickQueriesProps {
  /** Handler for selecting a query */
  onSelectQuery: (query: string) => void;

  /** Queries to display */
  queries?: string[];

  /** Custom class name */
  className?: string;
}

/**
 * Horizontal scrollable quick queries for mobile.
 */
export function InlineQuickQueries({
  onSelectQuery,
  queries,
  className,
}: InlineQuickQueriesProps) {
  const displayQueries =
    queries || DEFAULT_QUICK_QUERIES.map((q) => q.template);

  return (
    <div
      className={cn(
        'flex gap-2 overflow-x-auto pb-2',
        'scrollbar-none',
        className
      )}
    >
      {displayQueries.slice(0, 6).map((query, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onSelectQuery(query)}
          className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          {query.length > 30 ? `${query.substring(0, 30)}...` : query}
        </button>
      ))}
    </div>
  );
}

export default QuickQueriesSidebar;
