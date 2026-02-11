/**
 * Month Picker Component
 *
 * Allows users to select a month to filter dashboard data.
 * Provides prev/next navigation and a quick "This Month" reset button.
 *
 * PRIVACY: No data leaves the device. This is a pure UI control.
 */

'use client';

import { useCallback, useMemo } from 'react';
import { format, subMonths, addMonths, isSameMonth } from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

export interface MonthPickerProps {
  /** Currently selected month (any date within the month) */
  selectedMonth: Date;
  /** Callback when the month changes */
  onMonthChange: (month: Date) => void;
  /** Optional: earliest month the user can navigate to */
  minMonth?: Date;
  /** Optional: latest month the user can navigate to (defaults to current month) */
  maxMonth?: Date;
}

// ============================================
// Component
// ============================================

/**
 * Dashboard month picker for filtering all data by a selected month.
 */
export function MonthPicker({
  selectedMonth,
  onMonthChange,
  minMonth,
  maxMonth,
}: MonthPickerProps) {
  const now = useMemo(() => new Date(), []);
  const effectiveMaxMonth = maxMonth ?? now;

  const isCurrentMonth = isSameMonth(selectedMonth, now);

  const canGoNext = useMemo(() => {
    const next = addMonths(selectedMonth, 1);
    return next <= effectiveMaxMonth || isSameMonth(next, effectiveMaxMonth);
  }, [selectedMonth, effectiveMaxMonth]);

  const canGoPrev = useMemo(() => {
    if (!minMonth) {
      return true;
    }
    const prev = subMonths(selectedMonth, 1);
    return prev >= minMonth || isSameMonth(prev, minMonth);
  }, [selectedMonth, minMonth]);

  const handlePrev = useCallback(() => {
    if (canGoPrev) {
      onMonthChange(subMonths(selectedMonth, 1));
    }
  }, [selectedMonth, canGoPrev, onMonthChange]);

  const handleNext = useCallback(() => {
    if (canGoNext) {
      onMonthChange(addMonths(selectedMonth, 1));
    }
  }, [selectedMonth, canGoNext, onMonthChange]);

  const handleReset = useCallback(() => {
    onMonthChange(now);
  }, [now, onMonthChange]);

  return (
    <div className="flex items-center gap-2">
      {/* Month navigation */}
      <div className="flex items-center gap-1 rounded-lg border border-[rgba(255,255,255,0.08)] bg-vault-bg-surface px-1 py-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-vault-text-secondary hover:text-vault-text-primary"
          onClick={handlePrev}
          disabled={!canGoPrev}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex min-w-[140px] items-center justify-center gap-1.5 px-2">
          <CalendarDays className="h-3.5 w-3.5 text-vault-gold" />
          <span className="text-sm font-medium text-vault-text-primary">
            {format(selectedMonth, 'MMMM yyyy')}
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-vault-text-secondary hover:text-vault-text-primary"
          onClick={handleNext}
          disabled={!canGoNext}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Quick reset to current month */}
      {!isCurrentMonth && (
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 gap-1 px-2 text-xs',
            'text-vault-gold hover:text-vault-gold-secondary'
          )}
          onClick={handleReset}
        >
          This Month
        </Button>
      )}
    </div>
  );
}

export default MonthPicker;
