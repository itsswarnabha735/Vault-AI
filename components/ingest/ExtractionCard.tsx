/**
 * ExtractionCard Component
 *
 * Editable card for reviewing extracted document data.
 * Shows thumbnail, extracted fields, and confidence indicators.
 * Auto-suggests categories based on vendor name using the auto-categorizer.
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useCategories } from '@/hooks/useLocalDB';
import { useHierarchicalCategories } from '@/hooks/useHierarchicalCategories';
import { autoCategorizer } from '@/lib/processing/auto-categorizer';
import type { ProcessedDocumentResult } from '@/lib/processing/processing-worker-client';
import type { CategoryId } from '@/types/database';

// ============================================
// Types
// ============================================

export interface EditableDocument {
  /** Original processing result */
  original: ProcessedDocumentResult;

  /** Edited values */
  edited: {
    vendor: string;
    amount: number;
    date: string;
    category: CategoryId | null;
    note: string;
  };

  /** Whether any field has been edited */
  isEdited: boolean;
}

export interface ExtractionCardProps {
  /** Document to display */
  document: ProcessedDocumentResult;

  /** Change handler */
  onChange: (updated: EditableDocument) => void;

  /** Whether the card is expanded */
  isExpanded?: boolean;

  /** Toggle expanded handler */
  onToggleExpand?: () => void;

  /** Custom class name */
  className?: string;
}

// ============================================
// Helpers
// ============================================

/**
 * Extract vendor from ProcessedDocumentResult.
 */
function getVendor(doc: ProcessedDocumentResult): string {
  return doc.entities.vendor?.value || '';
}

/**
 * Extract amount from ProcessedDocumentResult.
 */
function getAmount(doc: ProcessedDocumentResult): number {
  return doc.entities.amount?.value || 0;
}

/**
 * Extract date from ProcessedDocumentResult.
 */
function getDate(doc: ProcessedDocumentResult): string {
  return (
    doc.entities.date?.value || new Date().toISOString().split('T')[0] || ''
  );
}

// ============================================
// Component
// ============================================

/**
 * Editable extraction card for document review.
 *
 * @example
 * ```tsx
 * <ExtractionCard
 *   document={processedDoc}
 *   onChange={(updated) => updateDocument(updated)}
 * />
 * ```
 */
export function ExtractionCard({
  document,
  onChange,
  isExpanded = false,
  onToggleExpand,
  className,
}: ExtractionCardProps) {
  const { data: categories } = useCategories();
  const { groups: categoryGroups } = useHierarchicalCategories();

  // Extract initial values from document entities
  const initialVendor = getVendor(document);
  const initialAmount = getAmount(document);
  const initialDate = getDate(document);

  // Build a map of category names to IDs for auto-categorization
  const categoryNameToId = useMemo(() => {
    const map = new Map<string, CategoryId>();
    for (const cat of categories) {
      map.set(cat.name.toLowerCase(), cat.id);
    }
    return map;
  }, [categories]);

  // Auto-categorize based on initial vendor + amount context (checks learned mappings first)
  const initialAutoCategory = useMemo(() => {
    if (!initialVendor) {
      return null;
    }
    const suggestion = autoCategorizer.suggestCategory(initialVendor, {
      amount: initialAmount || undefined,
    });
    if (suggestion) {
      // If learned mapping, use the direct categoryId
      if (suggestion.isLearned && suggestion.learnedCategoryId) {
        return suggestion.learnedCategoryId;
      }
      // Otherwise resolve name → id from categories list
      return (
        categoryNameToId.get(suggestion.categoryName.toLowerCase()) || null
      );
    }
    return null;
  }, [initialVendor, initialAmount, categoryNameToId]);

  // Local editing state - pre-populate category with auto-suggestion
  const [editedValues, setEditedValues] = useState({
    vendor: initialVendor,
    amount: initialAmount,
    date: initialDate,
    category: initialAutoCategory,
    note: '',
  });

  // Track whether category was auto-set and its confidence level
  const [categoryAutoSet, setCategoryAutoSet] = useState(!!initialAutoCategory);
  const [categoryConfidence, setCategoryConfidence] = useState<number>(() => {
    if (!initialVendor) {
      return 0;
    }
    const s = autoCategorizer.suggestCategory(initialVendor, {
      amount: initialAmount || undefined,
    });
    return s?.confidence || 0;
  });

  // Confidence tier for visual indicators
  type ConfidenceTier = 'high' | 'medium' | 'low' | 'none';
  const categoryConfidenceTier: ConfidenceTier =
    !categoryAutoSet || !editedValues.category
      ? 'none'
      : categoryConfidence >= 0.85
        ? 'high'
        : categoryConfidence >= 0.6
          ? 'medium'
          : 'low';

  // Update auto-category when initialAutoCategory resolves (categories may load async)
  useEffect(() => {
    if (initialAutoCategory && !editedValues.category) {
      setEditedValues((prev) => ({ ...prev, category: initialAutoCategory }));
      setCategoryAutoSet(true);
    }
  }, [initialAutoCategory, editedValues.category]);

  // Track if edited
  const isEdited =
    editedValues.vendor !== initialVendor ||
    editedValues.amount !== initialAmount ||
    editedValues.date !== initialDate;

  // Notify parent of changes
  useEffect(() => {
    onChange({
      original: document,
      edited: editedValues,
      isEdited,
    });
  }, [editedValues, document, isEdited, onChange]);

  // Confidence level
  const confidence = document.confidence || 0;
  const needsReview = confidence < 0.7;

  // Update field
  const updateField = useCallback(
    <K extends keyof typeof editedValues>(
      field: K,
      value: (typeof editedValues)[K]
    ) => {
      setEditedValues((prev) => ({ ...prev, [field]: value }));
      // If user manually changes category, clear the auto-set hint
      if (field === 'category') {
        setCategoryAutoSet(false);
      }
    },
    []
  );

  // Re-categorize when vendor changes (debounced via blur)
  // Checks learned mappings first, then falls back to default rules
  const handleVendorBlur = useCallback(() => {
    if (!editedValues.vendor) {
      return;
    }
    // Only auto-set if user hasn't manually chosen a category
    if (editedValues.category && !categoryAutoSet) {
      return;
    }

    const suggestion = autoCategorizer.suggestCategory(editedValues.vendor, {
      amount: editedValues.amount || undefined,
    });
    if (suggestion) {
      setCategoryConfidence(suggestion.confidence);
      // If learned mapping, use the direct categoryId
      if (suggestion.isLearned && suggestion.learnedCategoryId) {
        setEditedValues((prev) => ({
          ...prev,
          category: suggestion.learnedCategoryId!,
        }));
        setCategoryAutoSet(true);
        return;
      }
      // Otherwise resolve name → id from categories list
      const catId = categoryNameToId.get(suggestion.categoryName.toLowerCase());
      if (catId) {
        setEditedValues((prev) => ({ ...prev, category: catId }));
        setCategoryAutoSet(true);
      }
    } else {
      setCategoryConfidence(0);
    }
  }, [
    editedValues.vendor,
    editedValues.category,
    categoryAutoSet,
    categoryNameToId,
  ]);

  // Format display values (use detected currency, fallback to INR)
  const detectedCurrency = document.entities.currency || 'INR';
  const formattedAmount = formatCurrency(editedValues.amount, detectedCurrency);
  const formattedDate = formatDate(new Date(editedValues.date), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Resolve category name for display in collapsed view
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === editedValues.category),
    [categories, editedValues.category]
  );

  // Use document.id for unique keys
  const docId = document.id;

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card transition-all',
        needsReview && 'border-yellow-500/50',
        className
      )}
    >
      {/* Header - Always visible */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        {/* Thumbnail placeholder */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
          <FileIcon className="h-6 w-6 text-muted-foreground" />
        </div>

        {/* Summary */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-foreground">
              {editedValues.vendor || 'Unknown Vendor'}
            </p>
            {needsReview && (
              <Badge
                variant="outline"
                className="shrink-0 border-yellow-500/50 bg-yellow-500/10 text-yellow-600"
              >
                Needs Review
              </Badge>
            )}
            {isEdited && (
              <Badge
                variant="outline"
                className="shrink-0 border-blue-500/50 bg-blue-500/10 text-blue-600"
              >
                Edited
              </Badge>
            )}
            {categoryConfidenceTier === 'none' && !isEdited && (
              <Badge
                variant="outline"
                className="shrink-0 border-orange-500/50 bg-orange-500/10 text-orange-600"
              >
                Needs Category
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {formattedAmount} • {formattedDate}
            {selectedCategory && (
              <span className="ml-1.5">
                • {selectedCategory.icon} {selectedCategory.name}
                {categoryAutoSet && (
                  <CategoryConfidenceBadge
                    tier={categoryConfidenceTier}
                    className="ml-1"
                  />
                )}
              </span>
            )}
          </p>
        </div>

        {/* Confidence indicator */}
        <ConfidenceIndicator confidence={confidence} />

        {/* Expand icon */}
        <ChevronIcon
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Vendor */}
            <div>
              <Label htmlFor={`vendor-${docId}`} className="text-xs">
                Vendor
              </Label>
              <Input
                id={`vendor-${docId}`}
                value={editedValues.vendor}
                onChange={(e) => updateField('vendor', e.target.value)}
                onBlur={handleVendorBlur}
                placeholder="Enter vendor name"
                className={cn(
                  'mt-1',
                  needsReview && !editedValues.vendor && 'border-yellow-500'
                )}
              />
            </div>

            {/* Amount */}
            <div>
              <Label htmlFor={`amount-${docId}`} className="text-xs">
                Amount
              </Label>
              <Input
                id={`amount-${docId}`}
                type="number"
                step="0.01"
                value={editedValues.amount}
                onChange={(e) =>
                  updateField('amount', parseFloat(e.target.value) || 0)
                }
                placeholder="0.00"
                className="mt-1"
              />
            </div>

            {/* Date */}
            <div>
              <Label htmlFor={`date-${docId}`} className="text-xs">
                Date
              </Label>
              <Input
                id={`date-${docId}`}
                type="date"
                value={editedValues.date}
                onChange={(e) => updateField('date', e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Category */}
            <div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor={`category-${docId}`} className="text-xs">
                  Category
                </Label>
                {categoryAutoSet && editedValues.category && (
                  <CategoryConfidenceBadge tier={categoryConfidenceTier} />
                )}
              </div>
              <select
                id={`category-${docId}`}
                value={editedValues.category || ''}
                onChange={(e) =>
                  updateField(
                    'category',
                    (e.target.value || null) as CategoryId | null
                  )
                }
                className={cn(
                  'mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                  categoryAutoSet &&
                    editedValues.category &&
                    (categoryConfidenceTier === 'high'
                      ? 'border-emerald-500/50'
                      : categoryConfidenceTier === 'medium'
                        ? 'border-amber-500/50'
                        : 'border-orange-500/50')
                )}
              >
                <option value="">Select category</option>
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
            </div>

            {/* Note */}
            <div className="sm:col-span-2">
              <Label htmlFor={`note-${docId}`} className="text-xs">
                Note (optional)
              </Label>
              <Input
                id={`note-${docId}`}
                value={editedValues.note}
                onChange={(e) => updateField('note', e.target.value)}
                placeholder="Add a note..."
                className="mt-1"
              />
            </div>
          </div>

          {/* Raw extracted text preview */}
          {document.rawText && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground">
                Extracted Text (Preview)
              </p>
              <p className="mt-1 max-h-20 overflow-y-auto rounded bg-muted p-2 text-xs text-muted-foreground">
                {document.rawText.slice(0, 300)}
                {document.rawText.length > 300 && '...'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Category Confidence Badge
// ============================================

interface CategoryConfidenceBadgeProps {
  tier: 'high' | 'medium' | 'low' | 'none';
  className?: string;
}

function CategoryConfidenceBadge({
  tier,
  className,
}: CategoryConfidenceBadgeProps) {
  if (tier === 'none') {
    return null;
  }

  const config = {
    high: {
      label: 'Auto-categorized',
      classes: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    medium: {
      label: 'Suggested',
      classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    low: {
      label: 'Low confidence',
      classes: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    },
  }[tier];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        config.classes,
        className
      )}
    >
      {config.label}
    </span>
  );
}

// ============================================
// Confidence Indicator
// ============================================

interface ConfidenceIndicatorProps {
  confidence: number;
  className?: string;
}

function ConfidenceIndicator({
  confidence,
  className,
}: ConfidenceIndicatorProps) {
  const percent = Math.round(confidence * 100);
  const color =
    confidence >= 0.8
      ? 'text-green-600 dark:text-green-400'
      : confidence >= 0.5
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-red-600 dark:text-red-400';

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex h-4 w-12 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full transition-all',
            confidence >= 0.8
              ? 'bg-green-500'
              : confidence >= 0.5
                ? 'bg-yellow-500'
                : 'bg-red-500'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={cn('text-xs font-medium', color)}>{percent}%</span>
    </div>
  );
}

// ============================================
// Icons
// ============================================

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

function ChevronIcon({ className }: { className?: string }) {
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

export default ExtractionCard;
