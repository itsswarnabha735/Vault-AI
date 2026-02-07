/**
 * ChatInput Component
 *
 * Multi-line textarea with send button for chat input.
 * Supports keyboard shortcuts and character limit.
 */

'use client';

import {
  useRef,
  useCallback,
  useEffect,
  KeyboardEvent,
  ChangeEvent,
} from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ============================================
// Types
// ============================================

export interface ChatInputProps {
  /** Current input value */
  value: string;

  /** Value change handler */
  onChange: (value: string) => void;

  /** Send handler */
  onSend: () => void;

  /** Whether sending is disabled */
  disabled?: boolean;

  /** Whether currently loading */
  isLoading?: boolean;

  /** Placeholder text */
  placeholder?: string;

  /** Maximum character count */
  maxLength?: number;

  /** Show character count */
  showCharacterCount?: boolean;

  /** Auto focus on mount */
  autoFocus?: boolean;

  /** Custom class name */
  className?: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_MAX_LENGTH = 2000;
const MIN_ROWS = 1;
const MAX_ROWS = 6;

// ============================================
// Component
// ============================================

/**
 * Chat input textarea with send button.
 *
 * @example
 * ```tsx
 * <ChatInput
 *   value={inputText}
 *   onChange={setInputText}
 *   onSend={sendMessage}
 *   isLoading={isLoading}
 * />
 * ```
 */
export function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  isLoading = false,
  placeholder = 'Ask a question about your finances...',
  maxLength = DEFAULT_MAX_LENGTH,
  showCharacterCount = true,
  autoFocus = true,
  className,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    // Reset height to calculate scroll height
    textarea.style.height = 'auto';

    // Calculate new height
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
    const minHeight = lineHeight * MIN_ROWS;
    const maxHeight = lineHeight * MAX_ROWS;
    const newHeight = Math.min(
      Math.max(textarea.scrollHeight, minHeight),
      maxHeight
    );

    textarea.style.height = `${newHeight}px`;
  }, []);

  // Adjust height on value change
  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // Auto focus
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Handle input change
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      if (newValue.length <= maxLength) {
        onChange(newValue);
      }
    },
    [onChange, maxLength]
  );

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter to send (without Shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!disabled && !isLoading && value.trim()) {
          onSend();
        }
      }

      // Escape to blur
      if (e.key === 'Escape') {
        textareaRef.current?.blur();
      }
    },
    [disabled, isLoading, value, onSend]
  );

  // Handle form submit
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!disabled && !isLoading && value.trim()) {
        onSend();
      }
    },
    [disabled, isLoading, value, onSend]
  );

  // Character count info
  const characterCount = value.length;
  const isNearLimit = characterCount > maxLength * 0.9;
  const isAtLimit = characterCount >= maxLength;
  const canSend = !disabled && !isLoading && value.trim().length > 0;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className={cn('relative', className)}
    >
      <div className="flex items-end gap-2 rounded-xl border border-input bg-background p-2 shadow-sm transition-colors focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          rows={MIN_ROWS}
          className={cn(
            'flex-1 resize-none bg-transparent px-2 py-1.5 text-sm',
            'placeholder:text-muted-foreground',
            'focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border'
          )}
          aria-label="Chat message input"
        />

        {/* Send button */}
        <Button
          type="submit"
          size="icon"
          disabled={!canSend}
          className={cn(
            'h-9 w-9 shrink-0 rounded-lg',
            'bg-gradient-to-r from-blue-600 to-purple-600',
            'hover:from-blue-700 hover:to-purple-700',
            'disabled:from-gray-400 disabled:to-gray-400 disabled:opacity-50'
          )}
          aria-label="Send message"
        >
          {isLoading ? (
            <LoadingSpinner className="h-4 w-4" />
          ) : (
            <SendIcon className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Footer with character count and hints */}
      <div className="mt-2 flex items-center justify-between px-1">
        {/* Keyboard hint */}
        <p className="text-xs text-muted-foreground">
          Press{' '}
          <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
            Enter
          </kbd>{' '}
          to send,{' '}
          <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
            Shift+Enter
          </kbd>{' '}
          for new line
        </p>

        {/* Character count */}
        {showCharacterCount && (
          <p
            className={cn(
              'text-xs',
              isAtLimit
                ? 'text-destructive'
                : isNearLimit
                  ? 'text-yellow-600'
                  : 'text-muted-foreground'
            )}
          >
            {characterCount}/{maxLength}
          </p>
        )}
      </div>
    </form>
  );
}

// ============================================
// Icons
// ============================================

function SendIcon({ className }: { className?: string }) {
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
        d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
      />
    </svg>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      fill="none"
      viewBox="0 0 24 24"
    >
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

// ============================================
// Compact Variant
// ============================================

/**
 * Compact chat input for smaller spaces.
 */
export function CompactChatInput({
  value,
  onChange,
  onSend,
  disabled,
  isLoading,
  placeholder = 'Type a message...',
  className,
}: Omit<ChatInputProps, 'maxLength' | 'showCharacterCount'>) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !disabled && !isLoading && value.trim()) {
        e.preventDefault();
        onSend();
      }
    },
    [disabled, isLoading, value, onSend]
  );

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isLoading}
        className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Button
        type="button"
        size="sm"
        onClick={onSend}
        disabled={disabled || isLoading || !value.trim()}
      >
        {isLoading ? <LoadingSpinner className="h-4 w-4" /> : 'Send'}
      </Button>
    </div>
  );
}

export default ChatInput;
