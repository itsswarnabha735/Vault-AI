/**
 * ExtractionReview Component
 *
 * Review and edit extracted document data before saving.
 * Displays all processed documents with editable fields.
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExtractionCard, type EditableDocument } from './ExtractionCard';
import { autoCategorizer } from '@/lib/processing/auto-categorizer';
import { importDuplicateChecker, type ImportDuplicateResult } from '@/lib/anomaly/import-duplicate-checker';
import { useCategories } from '@/hooks/useLocalDB';
import type { ProcessedDocumentResult } from '@/lib/processing/processing-worker-client';
import type { CategoryId } from '@/types/database';

// Re-export EditableDocument for external use
export type { EditableDocument };

// ============================================
// Types
// ============================================

export interface ExtractionReviewProps {
  /** Processed documents to review */
  documents: ProcessedDocumentResult[];

  /** Confirm handler */
  onConfirm: (documents: EditableDocument[]) => void;

  /** Cancel handler */
  onCancel: () => void;

  /** Custom class name */
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * Document extraction review screen.
 *
 * @example
 * ```tsx
 * <ExtractionReview
 *   documents={processedDocs}
 *   onConfirm={(docs) => saveDocuments(docs)}
 *   onCancel={() => setStage('drop')}
 * />
 * ```
 */
export function ExtractionReview({
  documents,
  onConfirm,
  onCancel,
  className,
}: ExtractionReviewProps) {
  const { data: categories } = useCategories();

  // Build category name-to-ID map for auto-categorization fallback
  const categoryNameToId = useMemo(() => {
    const map = new Map<string, CategoryId>();
    for (const cat of categories) {
      map.set(cat.name.toLowerCase(), cat.id);
    }
    return map;
  }, [categories]);

  // Duplicate detection state
  const [duplicateResults, setDuplicateResults] = useState<Map<string, ImportDuplicateResult>>(
    () => new Map()
  );

  // Run duplicate check on mount
  useEffect(() => {
    let cancelled = false;

    async function checkDuplicates() {
      const results = new Map<string, ImportDuplicateResult>();

      for (const doc of documents) {
        const date = doc.entities.date?.value || '';
        const vendor = doc.entities.vendor?.value || '';
        const amount = doc.entities.amount?.value || 0;

        if (date && vendor && amount) {
          const result = await importDuplicateChecker.checkReceipt(date, vendor, amount);
          results.set(doc.id, result);
        }
      }

      if (!cancelled) {
        setDuplicateResults(results);
      }
    }

    void checkDuplicates();
    return () => { cancelled = true; };
  }, [documents]);

  // Count duplicates
  const duplicateDocCount = useMemo(() => {
    let count = 0;
    for (const result of duplicateResults.values()) {
      if (result.isDuplicate) count++;
    }
    return count;
  }, [duplicateResults]);

  // Track edited documents
  const [editedDocs, setEditedDocs] = useState<Map<string, EditableDocument>>(
    () => new Map()
  );

  // Track expanded card
  const [expandedId, setExpandedId] = useState<string | null>(
    // Auto-expand first low confidence doc, or first doc
    documents.find((d) => (d.confidence || 0) < 0.7)?.id ||
      documents[0]?.id ||
      null
  );

  // Update document handler
  const handleDocumentChange = useCallback((updated: EditableDocument) => {
    setEditedDocs((prev) => {
      const next = new Map(prev);
      next.set(updated.original.id, updated);
      return next;
    });
  }, []);

  // Toggle expand handler
  const handleToggleExpand = useCallback((docId: string) => {
    setExpandedId((prev) => (prev === docId ? null : docId));
  }, []);

  // Count documents needing review
  const needsReviewCount = useMemo(() => {
    return documents.filter((d) => (d.confidence || 0) < 0.7).length;
  }, [documents]);

  // Count edited documents
  const editedCount = useMemo(() => {
    return Array.from(editedDocs.values()).filter((d) => d.isEdited).length;
  }, [editedDocs]);

  /**
   * Resolve a category from auto-categorizer suggestion, handling
   * both learned (direct CategoryId) and rule-based (name → id) results.
   */
  const resolveSuggestedCategory = useCallback(
    (vendor: string): CategoryId | null => {
      const suggestion = autoCategorizer.suggestCategory(vendor);
      if (!suggestion) return null;
      if (suggestion.isLearned && suggestion.learnedCategoryId) {
        return suggestion.learnedCategoryId;
      }
      return categoryNameToId.get(suggestion.categoryName.toLowerCase()) || null;
    },
    [categoryNameToId]
  );

  // Handle confirm
  const handleConfirm = async () => {
    // Build final document list with auto-categorization fallback
    const finalDocs = documents.map((doc) => {
      const edited = editedDocs.get(doc.id);
      if (edited) {
        // If no category was set, try auto-categorization as fallback
        if (!edited.edited.category && edited.edited.vendor) {
          const catId = resolveSuggestedCategory(edited.edited.vendor);
          if (catId) {
            return {
              ...edited,
              edited: { ...edited.edited, category: catId },
            };
          }
        }
        return edited;
      }

      // Return unedited as EditableDocument, with auto-category if possible
      const vendor = doc.entities.vendor?.value || '';
      const autoCategory = vendor ? resolveSuggestedCategory(vendor) : null;

      return {
        original: doc,
        edited: {
          vendor,
          amount: doc.entities.amount?.value || 0,
          date:
            doc.entities.date?.value ||
            new Date().toISOString().split('T')[0] ||
            '',
          category: autoCategory,
          note: '',
        },
        isEdited: false,
      } as EditableDocument;
    });

    // Learn vendor-category mappings from user's confirmed selections
    const learnings: Array<{ vendor: string; categoryId: CategoryId }> = [];
    for (const doc of finalDocs) {
      if (doc.edited.vendor && doc.edited.category) {
        learnings.push({
          vendor: doc.edited.vendor,
          categoryId: doc.edited.category,
        });
      }
    }
    if (learnings.length > 0) {
      try {
        await autoCategorizer.learnCategories(learnings);
        console.log(
          `[ExtractionReview] Learned ${learnings.length} vendor-category mappings`
        );
      } catch (e) {
        // Learning failure is non-critical
        console.error('[ExtractionReview] Failed to learn categories:', e);
      }
    }

    onConfirm(finalDocs);
  };

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Review Extracted Data
          </h3>
          <p className="text-sm text-muted-foreground">
            Verify and edit the extracted information before saving
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline">{documents.length} documents</Badge>
          {needsReviewCount > 0 && (
            <Badge
              variant="outline"
              className="border-yellow-500/50 bg-yellow-500/10 text-yellow-600"
            >
              {needsReviewCount} need review
            </Badge>
          )}
          {editedCount > 0 && (
            <Badge
              variant="outline"
              className="border-blue-500/50 bg-blue-500/10 text-blue-600"
            >
              {editedCount} edited
            </Badge>
          )}
        </div>
      </div>

      {/* Duplicate Warning */}
      {duplicateDocCount > 0 && (
        <div className="mt-4 rounded-lg border border-orange-500/30 bg-orange-50 p-3 dark:bg-orange-950/20">
          <div className="flex items-center gap-2">
            <DuplicateWarningIcon className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
            <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
              {duplicateDocCount} document{duplicateDocCount > 1 ? 's' : ''} may already exist in your vault
            </p>
          </div>
          <p className="mt-1 text-xs text-orange-600/80 dark:text-orange-400/80">
            Review the flagged documents below. They will still be saved unless you cancel.
          </p>
        </div>
      )}

      {/* Documents list */}
      <div className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-lg border border-border p-3">
        {documents.map((doc) => {
          const dupResult = duplicateResults.get(doc.id);
          return (
            <div key={doc.id} className="relative">
              {dupResult?.isDuplicate && (
                <div className="mb-1 flex items-center gap-1.5 rounded bg-orange-100 px-2 py-1 text-xs text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                  <DuplicateWarningIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{dupResult.reason}</span>
                </div>
              )}
              <ExtractionCard
                document={doc}
                onChange={handleDocumentChange}
                isExpanded={expandedId === doc.id}
                onToggleExpand={() => handleToggleExpand(doc.id)}
                className={dupResult?.isDuplicate ? 'border-orange-500/30' : undefined}
              />
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="mt-6 flex items-center justify-between">
        {/* Tips */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <InfoIcon className="h-4 w-4" />
          <span>Click a document to expand and edit</span>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            <CheckIcon className="mr-2 h-4 w-4" />
            Confirm & Save ({documents.length})
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Quick Actions Bar
// ============================================

export interface QuickActionsBarProps {
  /** Total documents */
  totalCount: number;

  /** Documents needing review */
  reviewCount: number;

  /** Handler to expand all needing review */
  onExpandReviewItems?: () => void;

  /** Handler to auto-fill from AI */
  onAutoFill?: () => void;

  /** Custom class name */
  className?: string;
}

/**
 * Quick actions bar for batch operations.
 */
export function QuickActionsBar({
  totalCount,
  reviewCount,
  onExpandReviewItems,
  onAutoFill,
  className,
}: QuickActionsBarProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg bg-muted p-3',
        className
      )}
    >
      <div className="text-sm text-muted-foreground">
        {totalCount} documents ready for import
        {reviewCount > 0 && (
          <span className="ml-1 text-yellow-600 dark:text-yellow-400">
            ({reviewCount} need attention)
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {reviewCount > 0 && onExpandReviewItems && (
          <Button variant="outline" size="sm" onClick={onExpandReviewItems}>
            <EyeIcon className="mr-1.5 h-3.5 w-3.5" />
            Review Items
          </Button>
        )}
        {onAutoFill && (
          <Button variant="outline" size="sm" onClick={onAutoFill}>
            <SparklesIcon className="mr-1.5 h-3.5 w-3.5" />
            Auto-fill
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================
// Icons
// ============================================

function InfoIcon({ className }: { className?: string }) {
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
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
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

function EyeIcon({ className }: { className?: string }) {
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
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function DuplicateWarningIcon({ className }: { className?: string }) {
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
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  );
}

export default ExtractionReview;
