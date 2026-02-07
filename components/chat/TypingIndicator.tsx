/**
 * TypingIndicator Component
 *
 * Animated loading indicator shown while AI is processing/generating response.
 * Displays bouncing dots with optional status text.
 */

'use client';

import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

export interface TypingIndicatorProps {
  /** Custom class name */
  className?: string;

  /** Loading text to display */
  text?: string;

  /** Size variant */
  size?: 'sm' | 'md' | 'lg';

  /** Show dots only, no text */
  dotsOnly?: boolean;
}

// ============================================
// Constants
// ============================================

const SIZE_STYLES = {
  sm: {
    dot: 'h-1.5 w-1.5',
    gap: 'gap-1',
    text: 'text-xs',
    container: 'p-2',
  },
  md: {
    dot: 'h-2 w-2',
    gap: 'gap-1.5',
    text: 'text-sm',
    container: 'p-3',
  },
  lg: {
    dot: 'h-2.5 w-2.5',
    gap: 'gap-2',
    text: 'text-base',
    container: 'p-4',
  },
} as const;

// ============================================
// Component
// ============================================

/**
 * Animated typing indicator with bouncing dots.
 *
 * @example
 * ```tsx
 * <TypingIndicator text="Analyzing your finances..." />
 * <TypingIndicator dotsOnly size="sm" />
 * ```
 */
export function TypingIndicator({
  className,
  text = 'Analyzing your finances...',
  size = 'md',
  dotsOnly = false,
}: TypingIndicatorProps) {
  const styles = SIZE_STYLES[size];

  return (
    <div
      className={cn(
        'flex items-center rounded-lg bg-muted',
        styles.container,
        styles.gap,
        className
      )}
      role="status"
      aria-label="AI is typing"
    >
      {/* Bouncing dots */}
      <div className={cn('flex items-center', styles.gap)}>
        <span
          className={cn(
            styles.dot,
            'animate-bounce rounded-full bg-primary/60',
            '[animation-delay:0ms]'
          )}
        />
        <span
          className={cn(
            styles.dot,
            'animate-bounce rounded-full bg-primary/60',
            '[animation-delay:150ms]'
          )}
        />
        <span
          className={cn(
            styles.dot,
            'animate-bounce rounded-full bg-primary/60',
            '[animation-delay:300ms]'
          )}
        />
      </div>

      {/* Status text */}
      {!dotsOnly && text && (
        <span className={cn('text-muted-foreground', styles.text)}>{text}</span>
      )}
    </div>
  );
}

// ============================================
// Variants
// ============================================

/**
 * Inline typing indicator for use within message bubbles.
 */
export function InlineTypingIndicator({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:300ms]" />
    </span>
  );
}

/**
 * Full-width typing indicator with AI avatar.
 */
export function MessageTypingIndicator({
  className,
  text,
}: {
  className?: string;
  text?: string;
}) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      {/* AI Avatar */}
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

      {/* Typing bubble */}
      <div className="max-w-[80%]">
        <TypingIndicator text={text} size="md" />
      </div>
    </div>
  );
}

export default TypingIndicator;
