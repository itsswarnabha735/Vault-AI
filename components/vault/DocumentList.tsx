/**
 * DocumentList Component
 *
 * Table/list view for displaying documents/transactions in the vault.
 * Supports sorting, bulk selection, and inline actions.
 */

'use client';

import { useCallback, useMemo } from 'react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SyncStatusBadge } from './DocumentCard';
import { Badge } from '@/components/ui/badge';
import type {
  LocalTransaction,
  TransactionId,
  Category,
} from '@/types/database';

// ============================================
// Types
// ============================================

export type SortField = 'date' | 'amount' | 'vendor' | 'category';
export type SortOrder = 'asc' | 'desc';

export interface DocumentListProps {
  /** Transactions to display */
  transactions: LocalTransaction[];

  /** Category lookup map (id → Category) for displaying category badges */
  categories?: Map<string, Category>;

  /** Currently selected transaction IDs */
  selectedIds?: Set<TransactionId>;

  /** Selection handler */
  onSelect?: (transaction: LocalTransaction) => void;

  /** Bulk selection handler */
  onBulkSelect?: (ids: TransactionId[]) => void;

  /** Sort field */
  sortField?: SortField;

  /** Sort order */
  sortOrder?: SortOrder;

  /** Sort change handler */
  onSortChange?: (field: SortField, order: SortOrder) => void;

  /** Whether the list is loading */
  isLoading?: boolean;

  /** Custom class name */
  className?: string;

  /** Show bulk actions */
  showBulkActions?: boolean;
}

// ============================================
// Component
// ============================================

/**
 * Document list/table view.
 *
 * @example
 * ```tsx
 * <DocumentList
 *   transactions={transactions}
 *   selectedIds={selectedIds}
 *   onSelect={(tx) => handleSelect(tx)}
 *   sortField="date"
 *   sortOrder="desc"
 *   onSortChange={(field, order) => handleSort(field, order)}
 * />
 * ```
 */
export function DocumentList({
  transactions,
  categories,
  selectedIds = new Set(),
  onSelect,
  onBulkSelect,
  sortField = 'date',
  sortOrder = 'desc',
  onSortChange,
  isLoading = false,
  className,
  showBulkActions = true,
}: DocumentListProps) {
  // All selected state
  const allSelected = useMemo(() => {
    return (
      transactions.length > 0 &&
      transactions.every((tx) => selectedIds.has(tx.id))
    );
  }, [transactions, selectedIds]);

  // Some selected state
  const someSelected = useMemo(() => {
    return transactions.some((tx) => selectedIds.has(tx.id)) && !allSelected;
  }, [transactions, selectedIds, allSelected]);

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      onBulkSelect?.([]);
    } else {
      onBulkSelect?.(transactions.map((tx) => tx.id));
    }
  }, [allSelected, transactions, onBulkSelect]);

  // Handle sort click
  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        // Toggle order
        onSortChange?.(field, sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        // New field, default to desc
        onSortChange?.(field, 'desc');
      }
    },
    [sortField, sortOrder, onSortChange]
  );

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          'overflow-hidden rounded-lg border border-border',
          className
        )}
      >
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              {showBulkActions && <th className="w-10 px-4 py-3" />}
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Vendor
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Category
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Date
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Status
              </th>
              <th className="w-20 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-t border-border">
                {showBulkActions && (
                  <td className="px-4 py-3">
                    <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-8 animate-pulse rounded bg-muted" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Empty state
  if (transactions.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center',
          className
        )}
      >
        <ListIcon className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-medium text-foreground">
          No documents found
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Try adjusting your filters or upload some documents to get started.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border',
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              {/* Select all */}
              {showBulkActions && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = someSelected;
                      }
                    }}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-muted-foreground/50"
                    aria-label="Select all"
                  />
                </th>
              )}

              {/* Vendor */}
              <th className="px-4 py-3">
                <SortButton
                  label="Vendor"
                  field="vendor"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onClick={handleSort}
                />
              </th>

              {/* Amount */}
              <th className="px-4 py-3">
                <SortButton
                  label="Amount"
                  field="amount"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onClick={handleSort}
                />
              </th>

              {/* Category */}
              <th className="px-4 py-3">
                <SortButton
                  label="Category"
                  field="category"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onClick={handleSort}
                />
              </th>

              {/* Date */}
              <th className="px-4 py-3">
                <SortButton
                  label="Date"
                  field="date"
                  currentField={sortField}
                  currentOrder={sortOrder}
                  onClick={handleSort}
                />
              </th>

              {/* Status */}
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Status
              </th>

              {/* Actions */}
              <th className="w-20 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {transactions.map((tx) => (
              <DocumentRow
                key={tx.id}
                transaction={tx}
                category={
                  tx.category ? categories?.get(tx.category) : undefined
                }
                isSelected={selectedIds.has(tx.id)}
                onSelect={() => onSelect?.(tx)}
                onToggleSelect={() => {
                  if (selectedIds.has(tx.id)) {
                    onBulkSelect?.(
                      Array.from(selectedIds).filter((id) => id !== tx.id)
                    );
                  } else {
                    onBulkSelect?.([...Array.from(selectedIds), tx.id]);
                  }
                }}
                showCheckbox={showBulkActions}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk actions bar */}
      {showBulkActions && selectedIds.size > 0 && (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          onClear={() => onBulkSelect?.([])}
        />
      )}
    </div>
  );
}

// ============================================
// Document Row
// ============================================

interface DocumentRowProps {
  transaction: LocalTransaction;
  category?: Category;
  isSelected: boolean;
  onSelect: () => void;
  onToggleSelect: () => void;
  showCheckbox: boolean;
}

function DocumentRow({
  transaction,
  category,
  isSelected,
  onSelect,
  onToggleSelect,
  showCheckbox,
}: DocumentRowProps) {
  const formattedAmount = formatCurrency(
    transaction.amount,
    transaction.currency
  );
  const formattedDate = formatDate(new Date(transaction.date), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <tr
      className={cn(
        'cursor-pointer transition-colors hover:bg-muted/50',
        isSelected && 'bg-primary/5'
      )}
      onClick={onSelect}
    >
      {/* Checkbox */}
      {showCheckbox && (
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-muted-foreground/50"
            aria-label={`Select ${transaction.vendor}`}
          />
        </td>
      )}

      {/* Vendor */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <FileIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {transaction.vendor}
            </p>
            {transaction.note && (
              <p className="truncate text-xs text-muted-foreground">
                {transaction.note}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Amount */}
      <td className="px-4 py-3">
        <span
          className={cn(
            'font-medium',
            transaction.amount >= 0 ? 'text-foreground' : 'text-green-600'
          )}
        >
          {formattedAmount}
        </span>
      </td>

      {/* Category */}
      <td className="px-4 py-3">
        {category ? (
          <Badge
            variant="secondary"
            className="gap-1 text-xs font-medium"
            style={{
              backgroundColor: `${category.color}18`,
              color: category.color,
              borderColor: `${category.color}30`,
            }}
          >
            <span>{category.icon}</span>
            {category.name}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </td>

      {/* Date */}
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {formattedDate}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <SyncStatusBadge status={transaction.syncStatus} />
      </td>

      {/* Actions */}
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreIcon className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </td>
    </tr>
  );
}

// ============================================
// Sort Button
// ============================================

interface SortButtonProps {
  label: string;
  field: SortField;
  currentField: SortField;
  currentOrder: SortOrder;
  onClick: (field: SortField) => void;
}

function SortButton({
  label,
  field,
  currentField,
  currentOrder,
  onClick,
}: SortButtonProps) {
  const isActive = currentField === field;

  return (
    <button
      type="button"
      onClick={() => onClick(field)}
      className={cn(
        'flex items-center gap-1 text-left text-sm font-medium',
        isActive ? 'text-foreground' : 'text-muted-foreground'
      )}
    >
      {label}
      <span className="flex flex-col">
        <ChevronUpIcon
          className={cn(
            'h-2.5 w-2.5',
            isActive && currentOrder === 'asc'
              ? 'text-foreground'
              : 'text-muted-foreground/50'
          )}
        />
        <ChevronDownIcon
          className={cn(
            '-mt-0.5 h-2.5 w-2.5',
            isActive && currentOrder === 'desc'
              ? 'text-foreground'
              : 'text-muted-foreground/50'
          )}
        />
      </span>
    </button>
  );
}

// ============================================
// Bulk Actions Bar
// ============================================

interface BulkActionsBarProps {
  selectedCount: number;
  onClear: () => void;
}

function BulkActionsBar({ selectedCount, onClear }: BulkActionsBarProps) {
  return (
    <div className="flex items-center justify-between border-t border-border bg-muted/50 px-4 py-2">
      <span className="text-sm text-muted-foreground">
        {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
        <Button variant="outline" size="sm">
          Export
        </Button>
        <Button variant="destructive" size="sm">
          Delete
        </Button>
      </div>
    </div>
  );
}

// ============================================
// Icons
// ============================================

function ListIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
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
        d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
      />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
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
        d="M4.5 15.75l7.5-7.5 7.5 7.5"
      />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
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
        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
}

export default DocumentList;
