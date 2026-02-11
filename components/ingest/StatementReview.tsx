/**
 * StatementReview Component
 *
 * Table-based review screen for batch-importing transactions
 * parsed from bank/credit card statements. Allows users to:
 * - Review all parsed transactions
 * - Edit individual fields (vendor, amount, date, category)
 * - Select/deselect transactions for import
 * - See statement summary and validation info
 *
 * PRIVACY: All data displayed here is local-only.
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useCategories } from '@/hooks/useLocalDB';
import {
  importDuplicateChecker,
  type ImportDuplicateResult,
} from '@/lib/anomaly/import-duplicate-checker';
import { autoCategorizer } from '@/lib/processing/auto-categorizer';
import {
  useHierarchicalCategories,
  type CategoryGroup,
} from '@/hooks/useHierarchicalCategories';
import { useBatchLLMCategorize } from '@/hooks/useLLMCategorize';
import { LLM_CATEGORIZE_THRESHOLD } from '@/lib/ai/llm-categorizer';
import { resolveCategoryName } from '@/lib/categories/category-registry';
import type {
  StatementParseResult,
  ParsedStatementTransaction,
} from '@/types/statement';
import type { CategoryId } from '@/types/database';

// ============================================
// Types
// ============================================

export interface StatementReviewProps {
  /** Parsed statement result */
  statementResult: StatementParseResult;

  /** Raw text for reference */
  rawText: string;

  /** File metadata */
  fileMetadata: {
    originalName: string;
    mimeType: string;
    size: number;
    pageCount: number | null;
  };

  /** Whether OCR was used */
  ocrUsed: boolean;

  /** Confirm handler with final transactions */
  onConfirm: (transactions: ParsedStatementTransaction[]) => void;

  /** Cancel handler */
  onCancel: () => void;

  /** Custom class name */
  className?: string;
}

// ============================================
// Component
// ============================================

export function StatementReview({
  statementResult,
  rawText: _rawText,
  fileMetadata,
  ocrUsed,
  onConfirm,
  onCancel,
  className,
}: StatementReviewProps) {
  const { data: categories } = useCategories();
  const { groups: categoryGroups } = useHierarchicalCategories();

  // Local state for editable transactions
  const [transactions, setTransactions] = useState<
    ParsedStatementTransaction[]
  >(() => statementResult.transactions.map((tx) => ({ ...tx })));

  // Track which row is being edited
  const [editingId, setEditingId] = useState<string | null>(null);

  // Duplicate detection state
  const [duplicateResults, setDuplicateResults] = useState<
    Map<string, ImportDuplicateResult>
  >(() => new Map());
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  // Run duplicate check on mount
  useEffect(() => {
    let cancelled = false;

    async function checkDuplicates() {
      setIsCheckingDuplicates(true);
      try {
        const result = await importDuplicateChecker.checkStatementTransactions(
          statementResult.transactions
        );

        if (cancelled) {
          return;
        }

        setDuplicateResults(result.transactionResults);

        // Auto-deselect likely duplicates
        if (result.duplicateCount > 0) {
          setTransactions((prev) =>
            prev.map((tx) => {
              const dupResult = result.transactionResults.get(tx.id);
              if (dupResult?.isDuplicate && dupResult.confidence >= 0.85) {
                return { ...tx, selected: false };
              }
              return tx;
            })
          );
        }
      } catch (error) {
        console.error('[StatementReview] Duplicate check failed:', error);
      } finally {
        if (!cancelled) {
          setIsCheckingDuplicates(false);
        }
      }
    }

    void checkDuplicates();
    return () => {
      cancelled = true;
    };
  }, [statementResult.transactions]);

  // Count duplicates found
  const duplicateCount = useMemo(() => {
    let count = 0;
    for (const result of duplicateResults.values()) {
      if (result.isDuplicate) {
        count++;
      }
    }
    return count;
  }, [duplicateResults]);

  // ============================================
  // Computed Values
  // ============================================

  const selectedCount = useMemo(
    () => transactions.filter((tx) => tx.selected).length,
    [transactions]
  );

  const selectedTotal = useMemo(
    () =>
      transactions
        .filter((tx) => tx.selected)
        .reduce((sum, tx) => sum + tx.amount, 0),
    [transactions]
  );

  const allSelected = useMemo(
    () => transactions.every((tx) => tx.selected),
    [transactions]
  );

  const categoryMap = useMemo(() => {
    const map = new Map<string, CategoryId>();
    for (const cat of categories) {
      map.set(cat.name.toLowerCase(), cat.id);
    }
    return map;
  }, [categories]);

  // LLM fallback for low-confidence categorization
  const {
    suggestions: llmSuggestions,
    isLoading: isLLMLoading,
    requestBatch: requestLLMBatch,
  } = useBatchLLMCategorize();

  // Count low-confidence transactions eligible for LLM assist
  const llmEligibleCount = useMemo(() => {
    let count = 0;
    for (const tx of transactions) {
      if (llmSuggestions.has(tx.id)) {
        continue;
      } // Already have LLM suggestion
      const suggestion = tx.vendor
        ? autoCategorizer.suggestCategory(tx.vendor, {
            amount: tx.amount ? Math.abs(tx.amount) : undefined,
            type:
              (tx.type as
                | 'debit'
                | 'credit'
                | 'fee'
                | 'refund'
                | 'payment'
                | 'interest') || undefined,
          })
        : null;
      const conf = suggestion?.confidence || 0;
      if (conf < LLM_CATEGORIZE_THRESHOLD) {
        count++;
      }
    }
    return count;
  }, [transactions, llmSuggestions]);

  // Handle "Get AI Suggestions" button
  const handleRequestLLM = useCallback(() => {
    const eligible = transactions.filter((tx) => {
      if (llmSuggestions.has(tx.id)) {
        return false;
      }
      const suggestion = tx.vendor
        ? autoCategorizer.suggestCategory(tx.vendor, {
            amount: tx.amount ? Math.abs(tx.amount) : undefined,
            type:
              (tx.type as
                | 'debit'
                | 'credit'
                | 'fee'
                | 'refund'
                | 'payment'
                | 'interest') || undefined,
          })
        : null;
      return (suggestion?.confidence || 0) < LLM_CATEGORIZE_THRESHOLD;
    });

    if (eligible.length === 0) {
      return;
    }

    void requestLLMBatch(
      eligible.map((tx) => ({
        id: tx.id,
        vendor: tx.vendor,
        amount: Math.abs(tx.amount),
        date: tx.date,
        type:
          (tx.type as
            | 'debit'
            | 'credit'
            | 'fee'
            | 'refund'
            | 'payment'
            | 'interest') || 'debit',
      }))
    );
  }, [transactions, llmSuggestions, requestLLMBatch]);

  // Apply LLM suggestions to transactions that don't have a category yet
  useEffect(() => {
    if (llmSuggestions.size === 0) {
      return;
    }

    let hasUpdates = false;
    const updated = transactions.map((tx) => {
      if (tx.category) {
        return tx;
      } // Already has a category set
      const llmResult = llmSuggestions.get(tx.id);
      if (llmResult) {
        const catId = categoryMap.get(llmResult.categoryName.toLowerCase());
        if (catId) {
          hasUpdates = true;
          return {
            ...tx,
            category: catId,
            suggestedCategoryName: llmResult.categoryName,
          };
        }
      }
      return tx;
    });

    if (hasUpdates) {
      setTransactions(updated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llmSuggestions]);

  // Category confidence tiers for summary
  const categoryConfidenceStats = useMemo(() => {
    let high = 0;
    let medium = 0;
    let low = 0;
    let uncategorized = 0;

    for (const tx of transactions) {
      if (tx.category || tx.suggestedCategoryName) {
        // Get confidence from auto-categorizer for vendor (with amount context)
        const suggestion = tx.vendor
          ? autoCategorizer.suggestCategory(tx.vendor, {
              amount: tx.amount ? Math.abs(tx.amount) : undefined,
              type:
                (tx.type as
                  | 'debit'
                  | 'credit'
                  | 'fee'
                  | 'refund'
                  | 'payment'
                  | 'interest') || undefined,
            })
          : null;
        const conf = suggestion?.confidence || 0;
        if (conf >= 0.85) {
          high++;
        } else if (conf >= 0.6) {
          medium++;
        } else {
          low++;
        }
      } else {
        uncategorized++;
      }
    }

    return { high, medium, low, uncategorized, total: transactions.length };
  }, [transactions]);

  // ============================================
  // Handlers
  // ============================================

  const toggleSelectAll = useCallback(() => {
    setTransactions((prev) =>
      prev.map((tx) => ({ ...tx, selected: !allSelected }))
    );
  }, [allSelected]);

  const toggleSelect = useCallback((id: string) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, selected: !tx.selected } : tx))
    );
  }, []);

  const updateTransaction = useCallback(
    (id: string, updates: Partial<ParsedStatementTransaction>) => {
      setTransactions((prev) =>
        prev.map((tx) => (tx.id === id ? { ...tx, ...updates } : tx))
      );
    },
    []
  );

  const handleConfirm = useCallback(() => {
    // Map category names to CategoryIds before confirming.
    // Uses a robust resolver that handles LLM name variations via aliases.
    const finalTransactions = transactions
      .filter((tx) => tx.selected)
      .map((tx) => {
        // 1. Already has a resolved CategoryId → keep it
        if (tx.category) {
          return tx;
        }

        // 2. Try to resolve suggestedCategoryName → canonical name → CategoryId
        let categoryId: CategoryId | null = null;
        if (tx.suggestedCategoryName) {
          // First try exact match in DB
          categoryId =
            categoryMap.get(tx.suggestedCategoryName.toLowerCase()) || null;

          // If exact match fails, use the registry resolver (aliases, fuzzy)
          if (!categoryId) {
            const canonicalName = resolveCategoryName(
              tx.suggestedCategoryName
            );
            if (canonicalName) {
              categoryId =
                categoryMap.get(canonicalName.toLowerCase()) || null;
            }
          }
        }

        // 3. Last resort: try auto-categorizer from vendor name
        if (!categoryId && tx.vendor) {
          const suggestion = autoCategorizer.suggestCategory(tx.vendor, {
            amount: tx.amount ? Math.abs(tx.amount) : undefined,
            type: tx.type as 'debit' | 'credit' | 'fee' | 'refund' | 'payment' | 'interest' | undefined,
          });
          if (suggestion) {
            if (suggestion.learnedCategoryId) {
              categoryId = suggestion.learnedCategoryId;
            } else {
              const resolved = resolveCategoryName(suggestion.categoryName);
              if (resolved) {
                categoryId =
                  categoryMap.get(resolved.toLowerCase()) || null;
              }
            }
          }
        }

        return { ...tx, category: categoryId };
      });

    const resolvedCount = finalTransactions.filter(
      (tx) => tx.category
    ).length;
    console.log(
      `[StatementReview] Category resolution: ${resolvedCount}/${finalTransactions.length} resolved (categoryMap has ${categoryMap.size} entries)`
    );

    onConfirm(finalTransactions);
  }, [transactions, categoryMap, onConfirm]);

  // ============================================
  // Render
  // ============================================

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Statement Summary Header */}
      <div className="rounded-lg border border-border bg-muted/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {statementResult.issuer} Statement
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {statementResult.accountLast4 && (
                <span>Account ending {statementResult.accountLast4}</span>
              )}
              {statementResult.statementPeriod.start &&
                statementResult.statementPeriod.end && (
                  <span>
                    {statementResult.statementPeriod.start} to{' '}
                    {statementResult.statementPeriod.end}
                  </span>
                )}
              <span>{fileMetadata.originalName}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {statementResult.transactions.length} transactions found
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                statementResult.confidence >= 0.7
                  ? 'border-green-500/50 bg-green-500/10 text-green-600'
                  : 'border-yellow-500/50 bg-yellow-500/10 text-yellow-600'
              )}
            >
              {Math.round(statementResult.confidence * 100)}% confidence
            </Badge>
            {ocrUsed && (
              <Badge
                variant="outline"
                className="border-blue-500/50 bg-blue-500/10 text-blue-600"
              >
                OCR
              </Badge>
            )}
            <Badge
              variant="outline"
              className="border-purple-500/50 bg-purple-500/10 text-purple-600"
            >
              <ShieldIcon className="mr-1 h-3 w-3" />
              Local Only
            </Badge>
          </div>
        </div>

        {/* Totals Summary */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-md bg-background p-2 text-center">
            <p className="text-xs text-muted-foreground">Total Debits</p>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">
              {formatCurrency(
                statementResult.totals.totalDebits,
                statementResult.currency
              )}
            </p>
          </div>
          <div className="rounded-md bg-background p-2 text-center">
            <p className="text-xs text-muted-foreground">Total Credits</p>
            <p className="text-sm font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(
                statementResult.totals.totalCredits,
                statementResult.currency
              )}
            </p>
          </div>
          <div className="rounded-md bg-background p-2 text-center">
            <p className="text-xs text-muted-foreground">Net Balance</p>
            <p
              className={cn(
                'text-sm font-semibold',
                statementResult.totals.netBalance > 0
                  ? 'text-green-600 dark:text-green-400'
                  : statementResult.totals.netBalance < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-foreground'
              )}
            >
              {formatCurrency(
                statementResult.totals.netBalance,
                statementResult.currency
              )}
            </p>
          </div>
        </div>

        {/* Warnings */}
        {statementResult.warnings.length > 0 && (
          <div className="mt-3 space-y-1">
            {statementResult.warnings.map((warning, i) => (
              <p
                key={i}
                className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400"
              >
                <WarningIcon className="h-3.5 w-3.5 shrink-0" />
                {warning}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Duplicate Detection Warning */}
      {duplicateCount > 0 && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-50 p-3 dark:bg-orange-950/20">
          <div className="flex items-center gap-2">
            <DuplicateIcon className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
            <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
              {duplicateCount} potential duplicate
              {duplicateCount > 1 ? 's' : ''} detected
            </p>
          </div>
          <p className="mt-1 text-xs text-orange-600/80 dark:text-orange-400/80">
            These transactions appear to already exist in your vault. They have
            been automatically deselected. You can re-select them if they are
            different transactions.
          </p>
        </div>
      )}
      {isCheckingDuplicates && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoadingSpinner className="h-3 w-3" />
          Checking for duplicates...
        </div>
      )}

      {/* Selection Info Bar */}
      <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="h-4 w-4 rounded border-gray-300"
            aria-label="Select all transactions"
          />
          <span className="text-muted-foreground">
            {selectedCount} of {transactions.length} selected
          </span>
        </div>
        <div className="font-medium">
          Selected total:{' '}
          <span
            className={cn(
              selectedTotal >= 0 ? 'text-red-600' : 'text-green-600'
            )}
          >
            {formatCurrency(Math.abs(selectedTotal), statementResult.currency)}
          </span>
        </div>
      </div>

      {/* Category Confidence Summary */}
      {categoryConfidenceStats.total > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
          <span className="font-medium text-muted-foreground">Categories:</span>
          {categoryConfidenceStats.high > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {categoryConfidenceStats.high} auto-categorized
            </span>
          )}
          {categoryConfidenceStats.medium > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {categoryConfidenceStats.medium} suggested
            </span>
          )}
          {categoryConfidenceStats.low > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-orange-600 dark:text-orange-400">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              {categoryConfidenceStats.low} low confidence
            </span>
          )}
          {categoryConfidenceStats.uncategorized > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-red-600 dark:text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              {categoryConfidenceStats.uncategorized} uncategorized
            </span>
          )}

          {/* LLM Assist button */}
          {llmEligibleCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRequestLLM}
              disabled={isLLMLoading}
              className="ml-auto h-6 gap-1 px-2 text-[11px]"
            >
              {isLLMLoading ? (
                <>
                  <LoadingSpinner className="h-3 w-3" />
                  Categorizing...
                </>
              ) : (
                <>
                  <SparklesIcon className="h-3 w-3" />
                  AI-categorize {llmEligibleCount} transaction
                  {llmEligibleCount !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          )}
          {llmSuggestions.size > 0 && llmEligibleCount === 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
              <SparklesIcon className="h-3 w-3" />
              {llmSuggestions.size} AI-categorized
            </span>
          )}
        </div>
      )}

      {/* Transaction Table */}
      <div className="max-h-[400px] overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 backdrop-blur-sm">
            <tr>
              <th className="w-10 px-3 py-2 text-left">
                <span className="sr-only">Select</span>
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Date
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Description
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Category
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Amount
              </th>
              <th className="w-10 px-3 py-2 text-left">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {transactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                currency={statementResult.currency}
                categories={categories}
                categoryGroups={categoryGroups}
                isEditing={editingId === tx.id}
                duplicateResult={duplicateResults.get(tx.id)}
                llmSuggestion={llmSuggestions.get(tx.id)}
                onToggleSelect={() => toggleSelect(tx.id)}
                onStartEdit={() => setEditingId(tx.id)}
                onStopEdit={() => setEditingId(null)}
                onUpdate={(updates) => updateTransaction(tx.id, updates)}
              />
            ))}
          </tbody>
        </table>

        {transactions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileIcon className="h-12 w-12 opacity-40" />
            <p className="mt-2 text-sm">
              No transactions could be parsed from this statement.
            </p>
            <p className="text-xs">
              The document may not be a supported statement format.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Parsed in {Math.round(statementResult.parsingTimeMs)}ms
        </p>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selectedCount === 0}>
            <CheckIcon className="mr-2 h-4 w-4" />
            Import {selectedCount} Transaction{selectedCount !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Transaction Row Sub-component
// ============================================

interface TransactionRowProps {
  transaction: ParsedStatementTransaction;
  currency: string;
  categories: Array<{
    id: CategoryId;
    name: string;
    icon: string;
    color: string;
  }>;
  categoryGroups: CategoryGroup[];
  isEditing: boolean;
  duplicateResult?: ImportDuplicateResult;
  llmSuggestion?: { categoryName: string; confidence: number; reason?: string };
  onToggleSelect: () => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onUpdate: (updates: Partial<ParsedStatementTransaction>) => void;
}

function TransactionRow({
  transaction: tx,
  currency,
  categories,
  categoryGroups,
  isEditing,
  duplicateResult,
  llmSuggestion,
  onToggleSelect,
  onStartEdit,
  onStopEdit,
  onUpdate,
}: TransactionRowProps) {
  const isCredit = tx.amount < 0;
  const displayAmount = Math.abs(tx.amount);
  const isDuplicate = duplicateResult?.isDuplicate ?? false;

  // Find matching category for display
  const matchedCategory = categories.find(
    (cat) =>
      cat.id === tx.category ||
      cat.name.toLowerCase() === tx.suggestedCategoryName?.toLowerCase()
  );

  // Get category confidence for this vendor (with amount + type context)
  const catSuggestion = tx.vendor
    ? autoCategorizer.suggestCategory(tx.vendor, {
        amount: tx.amount ? Math.abs(tx.amount) : undefined,
        type:
          (tx.type as
            | 'debit'
            | 'credit'
            | 'fee'
            | 'refund'
            | 'payment'
            | 'interest') || undefined,
      })
    : null;
  const catConfidence = catSuggestion?.confidence || 0;
  type CatTier = 'high' | 'medium' | 'low' | 'none';
  const catTier: CatTier =
    !matchedCategory && !tx.suggestedCategoryName
      ? 'none'
      : catConfidence >= 0.85
        ? 'high'
        : catConfidence >= 0.6
          ? 'medium'
          : 'low';

  if (isEditing) {
    return (
      <tr className="bg-blue-50/50 dark:bg-blue-950/20">
        <td className="px-3 py-2">
          <input
            type="checkbox"
            checked={tx.selected}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-gray-300"
          />
        </td>
        <td className="px-3 py-2">
          <Input
            type="date"
            value={tx.date}
            onChange={(e) => onUpdate({ date: e.target.value })}
            className="h-8 w-32 text-xs"
          />
        </td>
        <td className="px-3 py-2">
          <Input
            value={tx.vendor}
            onChange={(e) => onUpdate({ vendor: e.target.value })}
            className="h-8 text-xs"
            placeholder="Description"
          />
        </td>
        <td className="px-3 py-2">
          <select
            value={
              tx.category ||
              (tx.suggestedCategoryName
                ? categories.find(
                    (c) =>
                      c.name.toLowerCase() ===
                      tx.suggestedCategoryName?.toLowerCase()
                  )?.id
                : '') ||
              ''
            }
            onChange={(e) =>
              onUpdate({
                category: (e.target.value || null) as CategoryId | null,
              })
            }
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Uncategorized</option>
            {categoryGroups.map((group) =>
              group.children.length > 0 ? (
                <optgroup
                  key={group.parent.id}
                  label={`${group.parent.icon} ${group.parent.name}`}
                >
                  <option value={group.parent.id}>
                    {group.parent.icon} {group.parent.name} (General)
                  </option>
                  {group.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.icon} {child.name}
                    </option>
                  ))}
                </optgroup>
              ) : (
                <option key={group.parent.id} value={group.parent.id}>
                  {group.parent.icon} {group.parent.name}
                </option>
              )
            )}
          </select>
        </td>
        <td className="px-3 py-2 text-right">
          <Input
            type="number"
            step="0.01"
            value={tx.amount}
            onChange={(e) =>
              onUpdate({ amount: parseFloat(e.target.value) || 0 })
            }
            className="h-8 w-28 text-right text-xs"
          />
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={onStopEdit}
            className="rounded p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900"
            aria-label="Done editing"
          >
            <CheckIcon className="h-4 w-4" />
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr
      className={cn(
        'transition-colors hover:bg-muted/50',
        !tx.selected && 'opacity-50',
        isDuplicate && 'bg-orange-50/50 dark:bg-orange-950/10'
      )}
    >
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={tx.selected}
          onChange={onToggleSelect}
          className="h-4 w-4 rounded border-gray-300"
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
        {tx.date}
      </td>
      <td className="max-w-[250px] px-3 py-2 font-medium text-foreground">
        <span className="truncate">{tx.vendor}</span>
        {isDuplicate && (
          <span
            className="ml-2 inline-flex items-center gap-0.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
            title={duplicateResult?.reason || 'Potential duplicate'}
          >
            <DuplicateIcon className="h-2.5 w-2.5" />
            Duplicate
          </span>
        )}
        {tx.type !== 'debit' && (
          <Badge
            variant="outline"
            className={cn(
              'ml-2 px-1.5 py-0 text-[10px]',
              tx.type === 'payment' && 'border-green-500/50 text-green-600',
              tx.type === 'refund' && 'border-blue-500/50 text-blue-600',
              tx.type === 'fee' && 'border-orange-500/50 text-orange-600',
              tx.type === 'interest' && 'border-red-500/50 text-red-600',
              tx.type === 'credit' && 'border-green-500/50 text-green-600'
            )}
          >
            {tx.type}
          </Badge>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          {matchedCategory ? (
            <span className="inline-flex items-center gap-1 text-xs">
              <span>{matchedCategory.icon}</span>
              <span className="text-muted-foreground">
                {matchedCategory.name}
              </span>
            </span>
          ) : tx.suggestedCategoryName ? (
            <span className="text-xs italic text-muted-foreground/60">
              {tx.suggestedCategoryName}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/40">-</span>
          )}
          {/* Confidence tier / LLM indicator */}
          {llmSuggestion ? (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-purple-100 px-1 py-0.5 text-[9px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
              title={llmSuggestion.reason || 'AI-categorized'}
            >
              <SparklesIcon className="h-2 w-2" />
              AI
            </span>
          ) : (
            <>
              {catTier === 'high' && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                  title="Auto-categorized (high confidence)"
                />
              )}
              {catTier === 'medium' && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                  title="Suggested (medium confidence)"
                />
              )}
              {catTier === 'low' && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500"
                  title="Low confidence"
                />
              )}
            </>
          )}
        </div>
      </td>
      <td
        className={cn(
          'whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums',
          isCredit ? 'text-green-600 dark:text-green-400' : 'text-foreground'
        )}
      >
        {isCredit ? '-' : ''}
        {formatCurrency(displayAmount, currency)}
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={onStartEdit}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Edit transaction"
        >
          <EditIcon className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ============================================
// Icons
// ============================================

function ShieldIcon({ className }: { className?: string }) {
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

function WarningIcon({ className }: { className?: string }) {
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
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
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

function EditIcon({ className }: { className?: string }) {
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
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
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

function DuplicateIcon({ className }: { className?: string }) {
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
        d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
      />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
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
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
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

export default StatementReview;
