/**
 * useRecurringPatterns Hook
 *
 * Provides detected recurring transaction patterns (subscriptions,
 * EMIs, rent, SIPs) and upcoming expected transactions.
 *
 * PRIVACY: All detection runs locally.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  recurringDetector,
  type RecurringPattern,
} from '@/lib/processing/recurring-detector';

export interface UseRecurringPatternsReturn {
  /** All detected recurring patterns */
  patterns: RecurringPattern[];
  /** Only active (not stale) patterns */
  activePatterns: RecurringPattern[];
  /** Patterns with a transaction expected in the next 30 days */
  upcoming: RecurringPattern[];
  /** Total monthly recurring amount (from active monthly+ patterns) */
  monthlyRecurringTotal: number;
  /** Loading state */
  isLoading: boolean;
  /** Force re-detect */
  refresh: () => Promise<void>;
}

export function useRecurringPatterns(): UseRecurringPatternsReturn {
  const [patterns, setPatterns] = useState<RecurringPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    setIsLoading(true);
    try {
      const detected = await recurringDetector.detectPatterns(force);
      setPatterns(detected);
    } catch (error) {
      console.error('[useRecurringPatterns] Detection failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activePatterns = patterns.filter((p) => p.isActive);

  const now = new Date();
  const in30Days = new Date(now);
  in30Days.setDate(in30Days.getDate() + 30);

  const upcoming = activePatterns.filter((p) => {
    const next = new Date(p.nextExpected);
    return next >= now && next <= in30Days;
  });

  // Compute total monthly recurring amount
  // Convert all frequencies to monthly equivalent
  const monthlyRecurringTotal = activePatterns.reduce((sum, p) => {
    let monthly = 0;
    switch (p.frequency) {
      case 'weekly':
        monthly = p.averageAmount * (52 / 12);
        break;
      case 'biweekly':
        monthly = p.averageAmount * (26 / 12);
        break;
      case 'monthly':
        monthly = p.averageAmount;
        break;
      case 'quarterly':
        monthly = p.averageAmount / 3;
        break;
      case 'semi-annual':
        monthly = p.averageAmount / 6;
        break;
      case 'annual':
        monthly = p.averageAmount / 12;
        break;
    }
    return sum + monthly;
  }, 0);

  const refresh = useCallback(async () => {
    recurringDetector.invalidateCache();
    await load(true);
  }, [load]);

  return {
    patterns,
    activePatterns,
    upcoming,
    monthlyRecurringTotal: Math.round(monthlyRecurringTotal * 100) / 100,
    isLoading,
    refresh,
  };
}
