/**
 * Smart Category Suggestions Card
 *
 * Dashboard widget that surfaces uncategorized transactions and provides
 * one-click category suggestions using the auto-categorizer (multi-signal)
 * and optional LLM fallback.
 *
 * PRIVACY: All data stays local. Only structured data is processed.
 */

'use client';

import { useState, useCallback } from 'react';
import { Tag, Sparkles, Check, X, ChevronRight, Wand2, FolderTree } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUncategorizedTransactions } from '@/hooks/useUncategorizedTransactions';
import { useBatchRecategorize } from '@/hooks/useBatchRecategorize';
import { useSubcategorySuggestions } from '@/hooks/useSubcategorySuggestions';
import { useCategories } from '@/hooks/useLocalDB';
import { formatCurrency, cn } from '@/lib/utils';
import type { TransactionId, CategoryId } from '@/types/database';

/**
 * Smart Category Suggestions dashboard card.
 *
 * Shows when there are uncategorized transactions that the
 * auto-categorizer can provide suggestions for.
 */
export function SmartCategorySuggestions() {
  const {
    items,
    totalCount,
    suggestableCount,
    isLoading,
    applySuggestion,
    applyAll,
    dismiss,
  } = useUncategorizedTransactions();

  const { data: categories } = useCategories();
  const batchRecat = useBatchRecategorize();
  const subcatSuggestions = useSubcategorySuggestions();
  const [applyingAll, setApplyingAll] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  // Handle single suggestion accept
  const handleAccept = useCallback(
    async (transactionId: TransactionId, categoryId: CategoryId) => {
      try {
        await applySuggestion(transactionId, categoryId);
        setAppliedIds((prev) => new Set(prev).add(transactionId as string));
        setAppliedCount((prev) => prev + 1);
      } catch (error) {
        console.error('[SmartSuggestions] Apply failed:', error);
      }
    },
    [applySuggestion]
  );

  // Handle single suggestion dismiss
  const handleDismiss = useCallback(
    async (transactionId: TransactionId) => {
      try {
        await dismiss(transactionId);
        setAppliedIds((prev) => new Set(prev).add(transactionId as string));
      } catch (error) {
        console.error('[SmartSuggestions] Dismiss failed:', error);
      }
    },
    [dismiss]
  );

  // Handle "Apply All"
  const handleApplyAll = useCallback(async () => {
    setApplyingAll(true);
    try {
      const count = await applyAll();
      setAppliedCount((prev) => prev + count);
      // Mark all as applied
      setAppliedIds((prev) => {
        const next = new Set(prev);
        for (const item of items) {
          if (item.suggestedCategoryId) {
            next.add(item.transaction.id as string);
          }
        }
        return next;
      });
    } catch (error) {
      console.error('[SmartSuggestions] Apply all failed:', error);
    } finally {
      setApplyingAll(false);
    }
  }, [applyAll, items]);

  if (isLoading) {
    return <SmartCategorySuggestionsSkeleton />;
  }

  // Don't render if there are no uncategorized transactions
  if (totalCount === 0) {
    return null;
  }

  // Filter out already-applied items
  const visibleItems = items.filter(
    (item) => !appliedIds.has(item.transaction.id as string)
  );

  // Show success state after applying all
  if (visibleItems.length === 0 && appliedCount > 0) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/10">
        <CardContent className="flex items-center gap-3 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
            <Check className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {appliedCount} transaction{appliedCount !== 1 ? 's' : ''} categorized
            </p>
            <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
              Nice work keeping your finances organized!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-vault-text-secondary">
          <Tag className="h-4 w-4" />
          Category Suggestions
          <Badge variant="outline" className="ml-1 font-mono text-[10px]">
            {totalCount}
          </Badge>
        </CardTitle>
        {suggestableCount > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleApplyAll}
            disabled={applyingAll}
            className="h-7 gap-1 px-2 text-xs"
          >
            {applyingAll ? (
              'Applying...'
            ) : (
              <>
                <Sparkles className="h-3 w-3" />
                Apply All ({suggestableCount})
              </>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        <p className="mb-3 text-xs text-muted-foreground">
          {totalCount} uncategorized transaction{totalCount !== 1 ? 's' : ''} found.
          {suggestableCount > 0
            ? ` We have suggestions for ${suggestableCount}.`
            : ' Review them to keep your finances organized.'}
        </p>

        {/* Batch AI re-categorization banner (5B) */}
        {batchRecat.suggestions.length > 0 && (
          <div className="mb-3 flex items-center justify-between rounded-md border border-purple-500/30 bg-purple-50/50 px-3 py-2 dark:bg-purple-950/10">
            <div className="flex items-center gap-2 text-xs">
              <Wand2 className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              <span className="text-purple-700 dark:text-purple-300">
                AI found {batchRecat.suggestions.length} category suggestions
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void batchRecat.applyAll()}
              disabled={batchRecat.isProcessing}
              className="h-6 gap-1 border-purple-500/30 px-2 text-[10px] text-purple-700 hover:bg-purple-100 dark:text-purple-300 dark:hover:bg-purple-900/30"
            >
              <Sparkles className="h-3 w-3" />
              Apply All
            </Button>
          </div>
        )}
        {batchRecat.isProcessing && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <Wand2 className="h-3.5 w-3.5 animate-pulse" />
            AI is analysing uncategorized transactions...
          </div>
        )}
        {!batchRecat.hasRunThisSession && totalCount >= 3 && !batchRecat.isProcessing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void batchRecat.triggerRecategorize()}
            className="mb-2 h-7 w-full gap-1 text-xs text-muted-foreground"
          >
            <Wand2 className="h-3 w-3" />
            Run AI batch categorization
          </Button>
        )}

        {/* Suggestion rows */}
        <div className="space-y-1.5">
          {visibleItems.slice(0, 5).map((item) => (
            <SuggestionRow
              key={item.transaction.id}
              vendor={item.transaction.vendor || 'Unknown'}
              amount={item.transaction.amount}
              currency={item.transaction.currency}
              date={item.transaction.date}
              suggestedCategoryName={item.suggestedCategoryName}
              suggestedCategoryId={item.suggestedCategoryId}
              confidence={item.suggestion?.confidence || 0}
              transactionId={item.transaction.id}
              categories={categories}
              onAccept={handleAccept}
              onDismiss={handleDismiss}
            />
          ))}
        </div>

        {/* Sub-category refinement suggestions (Phase B backward compat) */}
        {subcatSuggestions.suggestions.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <FolderTree className="h-3 w-3" />
                Refine to sub-categories
                <Badge variant="outline" className="ml-1 font-mono text-[9px]">
                  {subcatSuggestions.suggestions.length}
                </Badge>
              </p>
              {subcatSuggestions.suggestions.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void subcatSuggestions.applyAll()}
                  className="h-5 px-1.5 text-[10px] text-muted-foreground"
                >
                  Apply All
                </Button>
              )}
            </div>
            <div className="space-y-1">
              {subcatSuggestions.suggestions.slice(0, 3).map((s) => (
                <div
                  key={s.transactionId}
                  className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2 py-1"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium">{s.vendor}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {s.currentCategoryName} → {s.suggestedSubcategoryIcon} {s.suggestedSubcategoryName}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void subcatSuggestions.applySuggestion(s.transactionId, s.suggestedSubcategoryId)}
                    className="rounded p-0.5 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                    title="Accept"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => subcatSuggestions.dismiss(s.transactionId)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                    title="Dismiss"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {subcatSuggestions.suggestions.length > 3 && (
                <p className="text-center text-[10px] text-muted-foreground">
                  +{subcatSuggestions.suggestions.length - 3} more refinements available
                </p>
              )}
            </div>
          </div>
        )}

        {/* "View more" link */}
        {visibleItems.length > 5 && (
          <div className="pt-2">
            <a
              href="/vault"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              View {visibleItems.length - 5} more in Vault
              <ChevronRight className="h-3 w-3" />
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Suggestion Row Sub-component
// ============================================

interface SuggestionRowProps {
  vendor: string;
  amount: number;
  currency: string;
  date: string;
  suggestedCategoryName: string | null;
  suggestedCategoryId: CategoryId | null;
  confidence: number;
  transactionId: TransactionId;
  categories: Array<{ id: CategoryId; name: string; icon: string; color: string }>;
  onAccept: (transactionId: TransactionId, categoryId: CategoryId) => void;
  onDismiss: (transactionId: TransactionId) => void;
}

function SuggestionRow({
  vendor,
  amount,
  currency,
  date,
  suggestedCategoryName,
  suggestedCategoryId,
  confidence,
  transactionId,
  categories,
  onAccept,
  onDismiss,
}: SuggestionRowProps) {
  const [manualCategoryId, setManualCategoryId] = useState<CategoryId | null>(null);

  const suggestedCat = suggestedCategoryId
    ? categories.find((c) => c.id === suggestedCategoryId)
    : null;

  const isHighConfidence = confidence >= 0.85;
  const formattedAmount = formatCurrency(Math.abs(amount), currency);

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
      {/* Transaction info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{vendor}</p>
        <p className="text-[10px] text-muted-foreground">
          {formattedAmount} &middot; {date}
        </p>
      </div>

      {/* Suggestion */}
      {suggestedCat ? (
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
              isHighConfidence
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            )}
          >
            {suggestedCat.icon} {suggestedCat.name}
          </span>

          {/* Accept */}
          <button
            type="button"
            onClick={() => onAccept(transactionId, suggestedCategoryId!)}
            className="rounded p-0.5 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
            aria-label={`Accept suggestion: ${suggestedCategoryName}`}
            title="Accept"
          >
            <Check className="h-3.5 w-3.5" />
          </button>

          {/* Dismiss */}
          <button
            type="button"
            onClick={() => onDismiss(transactionId)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Dismiss suggestion"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {/* Manual category picker (compact) */}
          <select
            value={manualCategoryId || ''}
            onChange={(e) => {
              const catId = (e.target.value || null) as CategoryId | null;
              setManualCategoryId(catId);
              if (catId) {
                onAccept(transactionId, catId);
              }
            }}
            className="h-6 rounded border border-input bg-background px-1 text-[10px]"
          >
            <option value="">Pick...</option>
            {categories
              .filter((c) => c.name !== 'Other')
              .map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
          </select>

          {/* Dismiss */}
          <button
            type="button"
            onClick={() => onDismiss(transactionId)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Dismiss"
            title="Keep as Other"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Skeleton
// ============================================

function SmartCategorySuggestionsSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <Skeleton className="h-3 w-60" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}
