/**
 * FilterSidebar Component
 *
 * Sidebar with filters for the document vault.
 * Includes date range, categories, amount, vendor, and sync status filters.
 */

'use client';

import { useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCategories } from '@/hooks/useLocalDB';
import type { CategoryId, SyncStatus } from '@/types/database';

// ============================================
// Types
// ============================================

export interface FilterState {
  /** Start date for date range */
  startDate: string | null;

  /** End date for date range */
  endDate: string | null;

  /** Selected category IDs */
  categories: CategoryId[];

  /** Minimum amount */
  minAmount: number | null;

  /** Maximum amount */
  maxAmount: number | null;

  /** Vendor search string */
  vendor: string;

  /** Sync status filter */
  syncStatus: SyncStatus | 'all';

  /** Has document filter */
  hasDocument: boolean | null;
}

export const defaultFilters: FilterState = {
  startDate: null,
  endDate: null,
  categories: [],
  minAmount: null,
  maxAmount: null,
  vendor: '',
  syncStatus: 'all',
  hasDocument: null,
};

export interface FilterSidebarProps {
  /** Current filter state */
  filters: FilterState;

  /** Filter change handler */
  onChange: (filters: FilterState) => void;

  /** Whether sidebar is collapsed */
  isCollapsed?: boolean;

  /** Toggle collapse handler */
  onToggleCollapse?: () => void;

  /** Custom class name */
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * Filter sidebar for document vault.
 *
 * @example
 * ```tsx
 * <FilterSidebar
 *   filters={filters}
 *   onChange={setFilters}
 * />
 * ```
 */
export function FilterSidebar({
  filters,
  onChange,
  isCollapsed = false,
  onToggleCollapse,
  className,
}: FilterSidebarProps) {
  const { data: categories } = useCategories();

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.startDate || filters.endDate) {
      count++;
    }
    if (filters.categories.length > 0) {
      count++;
    }
    if (filters.minAmount !== null || filters.maxAmount !== null) {
      count++;
    }
    if (filters.vendor) {
      count++;
    }
    if (filters.syncStatus !== 'all') {
      count++;
    }
    if (filters.hasDocument !== null) {
      count++;
    }
    return count;
  }, [filters]);

  // Update handler for individual filter
  const updateFilter = useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
      onChange({ ...filters, [key]: value });
    },
    [filters, onChange]
  );

  // Clear all filters
  const handleClearAll = useCallback(() => {
    onChange(defaultFilters);
  }, [onChange]);

  // Toggle category selection
  const toggleCategory = useCallback(
    (categoryId: CategoryId) => {
      const newCategories = filters.categories.includes(categoryId)
        ? filters.categories.filter((id) => id !== categoryId)
        : [...filters.categories, categoryId];
      updateFilter('categories', newCategories);
    },
    [filters.categories, updateFilter]
  );

  if (isCollapsed) {
    return (
      <div
        className={cn(
          'flex w-12 flex-col border-r border-border bg-muted/30',
          className
        )}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-12 items-center justify-center hover:bg-muted"
          aria-label="Expand filters"
        >
          <FilterIcon className="h-5 w-5 text-muted-foreground" />
          {activeFilterCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex w-64 flex-col border-r border-border bg-muted/30',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <FilterIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Filters</h3>
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </div>

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Collapse filters"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-6">
          {/* Date Range */}
          <FilterSection title="Date Range">
            <div className="flex flex-col gap-2">
              <div>
                <Label htmlFor="start-date" className="text-xs">
                  From
                </Label>
                <Input
                  id="start-date"
                  type="date"
                  value={filters.startDate || ''}
                  onChange={(e) =>
                    updateFilter('startDate', e.target.value || null)
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="end-date" className="text-xs">
                  To
                </Label>
                <Input
                  id="end-date"
                  type="date"
                  value={filters.endDate || ''}
                  onChange={(e) =>
                    updateFilter('endDate', e.target.value || null)
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Quick date presets */}
            <div className="mt-2 flex flex-wrap gap-1">
              {datePresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onChange({
                      ...filters,
                      startDate: preset.startDate,
                      endDate: preset.endDate,
                    });
                  }}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Categories */}
          <FilterSection title="Categories">
            <div className="flex flex-col gap-1">
              {categories?.map((category) => (
                <label
                  key={category.id}
                  className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={filters.categories.includes(category.id)}
                    onChange={() => toggleCategory(category.id)}
                    className="h-3.5 w-3.5 rounded border-muted-foreground/50"
                  />
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="flex-1 truncate text-sm">
                    {category.name}
                  </span>
                </label>
              ))}

              {(!categories || categories.length === 0) && (
                <p className="text-xs text-muted-foreground">
                  No categories available
                </p>
              )}
            </div>
          </FilterSection>

          {/* Amount Range */}
          <FilterSection title="Amount Range">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="min-amount" className="text-xs">
                  Min
                </Label>
                <Input
                  id="min-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.minAmount ?? ''}
                  onChange={(e) =>
                    updateFilter(
                      'minAmount',
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  placeholder="$0"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="max-amount" className="text-xs">
                  Max
                </Label>
                <Input
                  id="max-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.maxAmount ?? ''}
                  onChange={(e) =>
                    updateFilter(
                      'maxAmount',
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  placeholder="$∞"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </FilterSection>

          {/* Vendor */}
          <FilterSection title="Vendor">
            <Input
              type="text"
              value={filters.vendor}
              onChange={(e) => updateFilter('vendor', e.target.value)}
              placeholder="Search vendor..."
              className="h-8 text-sm"
            />
          </FilterSection>

          {/* Sync Status */}
          <FilterSection title="Sync Status">
            <div className="flex flex-col gap-1">
              {syncStatusOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted"
                >
                  <input
                    type="radio"
                    name="syncStatus"
                    checked={filters.syncStatus === option.value}
                    onChange={() =>
                      updateFilter(
                        'syncStatus',
                        option.value as SyncStatus | 'all'
                      )
                    }
                    className="h-3.5 w-3.5"
                  />
                  <span className="flex-1 text-sm">{option.label}</span>
                  {option.icon}
                </label>
              ))}
            </div>
          </FilterSection>

          {/* Has Document */}
          <FilterSection title="Document">
            <div className="flex flex-col gap-1">
              <label className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted">
                <input
                  type="radio"
                  name="hasDocument"
                  checked={filters.hasDocument === null}
                  onChange={() => updateFilter('hasDocument', null)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-sm">All</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted">
                <input
                  type="radio"
                  name="hasDocument"
                  checked={filters.hasDocument === true}
                  onChange={() => updateFilter('hasDocument', true)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-sm">With document</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted">
                <input
                  type="radio"
                  name="hasDocument"
                  checked={filters.hasDocument === false}
                  onChange={() => updateFilter('hasDocument', false)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-sm">Without document</span>
              </label>
            </div>
          </FilterSection>
        </div>
      </div>

      {/* Footer */}
      {activeFilterCount > 0 && (
        <div className="border-t border-border p-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            className="w-full"
          >
            Clear All Filters
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Filter Section
// ============================================

interface FilterSectionProps {
  title: string;
  children: React.ReactNode;
}

function FilterSection({ title, children }: FilterSectionProps) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

// ============================================
// Constants
// ============================================

const datePresets = [
  {
    label: 'Today',
    get startDate() {
      return new Date().toISOString().split('T')[0]!;
    },
    get endDate() {
      return new Date().toISOString().split('T')[0]!;
    },
  },
  {
    label: 'This Week',
    get startDate() {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay());
      return d.toISOString().split('T')[0]!;
    },
    get endDate() {
      return new Date().toISOString().split('T')[0]!;
    },
  },
  {
    label: 'This Month',
    get startDate() {
      const d = new Date();
      d.setDate(1);
      return d.toISOString().split('T')[0]!;
    },
    get endDate() {
      return new Date().toISOString().split('T')[0]!;
    },
  },
  {
    label: 'Last 30 Days',
    get startDate() {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().split('T')[0]!;
    },
    get endDate() {
      return new Date().toISOString().split('T')[0]!;
    },
  },
  {
    label: 'This Year',
    get startDate() {
      return `${new Date().getFullYear()}-01-01`;
    },
    get endDate() {
      return new Date().toISOString().split('T')[0]!;
    },
  },
];

const syncStatusOptions = [
  {
    value: 'all',
    label: 'All',
    icon: null,
  },
  {
    value: 'synced',
    label: 'Synced',
    icon: <SyncedIcon className="h-3.5 w-3.5 text-green-500" />,
  },
  {
    value: 'pending',
    label: 'Pending',
    icon: <PendingIcon className="h-3.5 w-3.5 text-yellow-500" />,
  },
  {
    value: 'error',
    label: 'Error',
    icon: <ErrorIcon className="h-3.5 w-3.5 text-red-500" />,
  },
  {
    value: 'local-only',
    label: 'Local Only',
    icon: <LocalIcon className="h-3.5 w-3.5 text-blue-500" />,
  },
];

// ============================================
// Icons
// ============================================

function FilterIcon({ className }: { className?: string }) {
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
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
      />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function SyncedIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PendingIcon({ className }: { className?: string }) {
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
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
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
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function LocalIcon({ className }: { className?: string }) {
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
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  );
}

export default FilterSidebar;
