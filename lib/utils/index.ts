/**
 * Utility Functions for Vault AI
 *
 * Common utility functions used throughout the application.
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS classes with proper conflict resolution
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a number as currency.
 * Auto-selects locale based on currency for proper formatting
 * (e.g., INR uses 'en-IN' for lakh notation: ₹1,87,551.00).
 */
export function formatCurrency(
  amount: number,
  currency: string = 'INR',
  locale?: string
): string {
  // Auto-select locale based on currency if not explicitly provided
  const effectiveLocale = locale || CURRENCY_LOCALE_MAP[currency] || 'en-US';

  return new Intl.NumberFormat(effectiveLocale, {
    style: 'currency',
    currency,
  }).format(amount);
}

/** Maps currency codes to their natural locale for proper formatting */
const CURRENCY_LOCALE_MAP: Record<string, string> = {
  INR: 'en-IN', // ₹1,87,551.00 (lakh notation)
  USD: 'en-US', // $187,551.00
  EUR: 'de-DE', // 187.551,00 €
  GBP: 'en-GB', // £187,551.00
  JPY: 'ja-JP', // ¥187,551
  CNY: 'zh-CN', // ¥187,551.00
  CAD: 'en-CA',
  AUD: 'en-AU',
  SGD: 'en-SG',
  HKD: 'en-HK',
};

/**
 * Formats a date in a human-readable format
 */
export function formatDate(
  date: Date,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }
): string {
  return new Intl.DateTimeFormat('en-US', options).format(date);
}

/**
 * Formats a date in a relative format (e.g., "2 days ago")
 */
export function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInSeconds < 60) {
    return 'just now';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  } else if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  } else {
    return formatDate(date);
  }
}

/**
 * Formats file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Generates a random ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Debounces a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttles a function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Sleeps for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Type guard to check if a value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Sanitizes transaction data for cloud sync
 * CRITICAL: Only includes whitelisted fields, excludes sensitive data
 */
export function sanitizeForSync<T extends Record<string, unknown>>(
  transaction: T
): Record<string, unknown> {
  const SYNCABLE_FIELDS = [
    'id',
    'date',
    'amount',
    'vendor',
    'category',
    'note',
    'clientCreatedAt',
    'clientUpdatedAt',
  ] as const;

  const sanitized: Record<string, unknown> = {};

  for (const field of SYNCABLE_FIELDS) {
    if (field in transaction) {
      sanitized[field] = transaction[field];
    }
  }

  return sanitized;
}
