/**
 * SearchBar Component
 *
 * Semantic search bar for the document vault.
 * Uses local embeddings for privacy-first search.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

// ============================================
// Types
// ============================================

export interface SearchBarProps {
  /** Current search value */
  value?: string;

  /** Change handler */
  onChange?: (value: string) => void;

  /** Search handler (called on debounce) */
  onSearch?: (query: string) => void;

  /** Whether search is in progress */
  isSearching?: boolean;

  /** Placeholder text */
  placeholder?: string;

  /** Debounce delay in ms */
  debounceMs?: number;

  /** Custom class name */
  className?: string;

  /** Whether to show clear button */
  showClear?: boolean;

  /** Whether to auto-focus */
  autoFocus?: boolean;
}

// ============================================
// Component
// ============================================

/**
 * Semantic search bar with debounced search.
 *
 * @example
 * ```tsx
 * <SearchBar
 *   onSearch={(query) => performSearch(query)}
 *   placeholder="Search by concept..."
 *   isSearching={isLoading}
 * />
 * ```
 */
export function SearchBar({
  value: controlledValue,
  onChange,
  onSearch,
  isSearching = false,
  placeholder = "Search by concept (e.g., 'furniture', 'medical')",
  debounceMs = 300,
  className,
  showClear = true,
  autoFocus = false,
}: SearchBarProps) {
  const [internalValue, setInternalValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Use controlled or internal value
  const value = controlledValue !== undefined ? controlledValue : internalValue;

  // Handle input change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;

      if (controlledValue === undefined) {
        setInternalValue(newValue);
      }

      onChange?.(newValue);
    },
    [controlledValue, onChange]
  );

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (value.length > 2) {
        onSearch?.(value);
      } else if (value.length === 0) {
        onSearch?.('');
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [value, debounceMs, onSearch]);

  // Clear handler
  const handleClear = useCallback(() => {
    if (controlledValue === undefined) {
      setInternalValue('');
    }
    onChange?.('');
    onSearch?.('');
    inputRef.current?.focus();
  }, [controlledValue, onChange, onSearch]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && value) {
        e.preventDefault();
        handleClear();
      }
    },
    [value, handleClear]
  );

  return (
    <div className={cn('relative', className)}>
      {/* Search icon */}
      <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

      {/* Input */}
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn('h-10 pl-10 pr-10', isSearching && 'pr-16')}
        aria-label="Search documents"
      />

      {/* Right side controls */}
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
        {/* Loading spinner */}
        {isSearching && (
          <LoadingSpinner className="h-4 w-4 animate-spin text-muted-foreground" />
        )}

        {/* Clear button */}
        {showClear && value && !isSearching && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================
// Search Hints
// ============================================

export interface SearchHintsProps {
  /** Example searches */
  examples?: string[];

  /** Click handler */
  onSelect?: (example: string) => void;

  /** Custom class name */
  className?: string;
}

/**
 * Search hints/suggestions.
 */
export function SearchHints({
  examples = [
    'furniture purchases',
    'medical expenses',
    'monthly subscriptions',
    'travel receipts',
    'office supplies',
  ],
  onSelect,
  className,
}: SearchHintsProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <span className="text-xs text-muted-foreground">Try:</span>
      {examples.map((example) => (
        <button
          key={example}
          type="button"
          onClick={() => onSelect?.(example)}
          className="text-xs text-primary hover:underline"
        >
          {example}
        </button>
      ))}
    </div>
  );
}

// ============================================
// Search Results Summary
// ============================================

export interface SearchResultsSummaryProps {
  /** Total results count */
  count: number;

  /** Search query */
  query: string;

  /** Search time in ms */
  searchTimeMs?: number;

  /** Custom class name */
  className?: string;
}

/**
 * Search results summary.
 */
export function SearchResultsSummary({
  count,
  query,
  searchTimeMs,
  className,
}: SearchResultsSummaryProps) {
  if (!query) {
    return null;
  }

  return (
    <p className={cn('text-sm text-muted-foreground', className)}>
      Found <span className="font-medium text-foreground">{count}</span>{' '}
      {count === 1 ? 'result' : 'results'} for{' '}
      <span className="font-medium text-foreground">&quot;{query}&quot;</span>
      {searchTimeMs !== undefined && (
        <span className="ml-1">({searchTimeMs}ms)</span>
      )}
    </p>
  );
}

// ============================================
// Icons
// ============================================

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

export default SearchBar;
