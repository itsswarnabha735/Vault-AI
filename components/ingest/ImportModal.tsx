/**
 * ImportModal Component
 *
 * Main import dialog for document ingestion.
 * Orchestrates the full import flow: drop → processing → review → complete.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DropZone } from './DropZone';
import { ProcessingProgress } from './ProcessingProgress';
import { ExtractionReview } from './ExtractionReview';
import { ImportComplete } from './ImportComplete';
import { useTransactionActions } from '@/hooks/useLocalDB';
import { opfsService } from '@/lib/storage/opfs';
import type { ProcessedDocumentResult } from '@/lib/processing/processing-worker-client';
import type { TransactionId } from '@/types/database';
import type { EditableDocument } from './ExtractionCard';

// ============================================
// Types
// ============================================

export type ImportStage = 'drop' | 'processing' | 'review' | 'complete';

export interface ImportModalProps {
  /** Whether the modal is open */
  open: boolean;

  /** Close handler */
  onClose: () => void;

  /** Success callback with imported transaction IDs */
  onSuccess?: (transactionIds: TransactionId[]) => void;

  /** Custom class name for dialog content */
  className?: string;
}

// ============================================
// Helpers
// ============================================

/**
 * Check if a processing result has an error (based on confidence or lack of entities).
 */
function hasProcessingError(result: ProcessedDocumentResult): boolean {
  // Consider it an error if there's no text and no entities
  const hasNoData =
    !result.rawText && !result.entities.vendor && !result.entities.amount;
  return hasNoData;
}

// ============================================
// Component
// ============================================

/**
 * Main document import modal.
 *
 * @example
 * ```tsx
 * <ImportModal
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onSuccess={(ids) => console.log('Imported:', ids)}
 * />
 * ```
 */
export function ImportModal({
  open,
  onClose,
  onSuccess,
  className,
}: ImportModalProps) {
  const router = useRouter();
  const { addTransaction } = useTransactionActions();

  // State
  const [stage, setStage] = useState<ImportStage>('drop');
  const [files, setFiles] = useState<File[]>([]);
  const [processed, setProcessed] = useState<ProcessedDocumentResult[]>([]);
  const [importedIds, setImportedIds] = useState<TransactionId[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when modal closes
  const handleClose = useCallback(() => {
    setStage('drop');
    setFiles([]);
    setProcessed([]);
    setImportedIds([]);
    setTotalAmount(0);
    setError(null);
    setIsSaving(false);
    onClose();
  }, [onClose]);

  // Handle files selected
  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setStage('processing');
    setError(null);
  }, []);

  // Handle processing complete
  const handleProcessingComplete = useCallback(
    (results: ProcessedDocumentResult[]) => {
      // Filter out errored results
      const successful = results.filter((r) => !hasProcessingError(r));
      setProcessed(successful);

      if (successful.length === 0) {
        setError('No documents could be processed. Please try again.');
        setStage('drop');
      } else {
        setStage('review');
      }
    },
    []
  );

  // Handle processing cancelled
  const handleProcessingCancelled = useCallback(() => {
    setStage('drop');
    setFiles([]);
  }, []);

  // Handle confirm and save
  const handleConfirm = useCallback(
    async (documents: EditableDocument[]) => {
      setIsSaving(true);
      setError(null);

      try {
        const savedIds: TransactionId[] = [];
        let total = 0;

        for (const doc of documents) {
          const { original, edited } = doc;

          // Save file to OPFS
          let filePath: string | undefined;
          let mimeType: string | undefined;
          let fileSize: number | undefined;

          // Find the original file by matching name
          const originalFile = files.find(
            (f) => f.name === original.fileMetadata.originalName
          );

          // Generate a temp transaction ID for file storage
          const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

          if (originalFile) {
            try {
              const savedInfo = await opfsService.saveFile(
                originalFile,
                tempId
              );
              filePath = savedInfo.filePath;
              mimeType = savedInfo.mimeType;
              fileSize = savedInfo.size;
            } catch (e) {
              console.error('Failed to save file to OPFS:', e);
              // Continue without file
            }
          }

          // Create transaction with all required fields
          const transaction = {
            date: edited.date,
            amount: edited.amount,
            vendor: edited.vendor,
            category: edited.category,
            note: edited.note || '',
            rawText: original.rawText,
            embedding: original.embedding || new Float32Array(384),
            filePath: filePath || '',
            mimeType: mimeType || 'application/octet-stream',
            fileSize: fileSize || 0,
            confidence: original.confidence,
            currency: 'USD',
            isManuallyEdited: false,
          };

          const id = await addTransaction(transaction);
          savedIds.push(id);
          total += edited.amount;
        }

        setImportedIds(savedIds);
        setTotalAmount(total);
        setStage('complete');
        onSuccess?.(savedIds);
      } catch (e) {
        console.error('Failed to save transactions:', e);
        setError(
          e instanceof Error ? e.message : 'Failed to save transactions'
        );
      } finally {
        setIsSaving(false);
      }
    },
    [files, addTransaction, onSuccess]
  );

  // Handle review cancel
  const handleReviewCancel = useCallback(() => {
    setStage('drop');
    setFiles([]);
    setProcessed([]);
  }, []);

  // Handle view vault
  const handleViewVault = useCallback(() => {
    handleClose();
    router.push('/vault');
  }, [handleClose, router]);

  // Handle import more
  const handleImportMore = useCallback(() => {
    setStage('drop');
    setFiles([]);
    setProcessed([]);
    setImportedIds([]);
    setTotalAmount(0);
  }, []);

  // Stage title and description
  const stageInfo = useMemo(() => {
    switch (stage) {
      case 'drop':
        return {
          title: 'Import Documents',
          description:
            'Upload receipts, invoices, or other financial documents',
        };
      case 'processing':
        return {
          title: 'Processing Documents',
          description: 'Extracting text and analyzing your documents locally',
        };
      case 'review':
        return {
          title: 'Review & Confirm',
          description: 'Verify the extracted information before saving',
        };
      case 'complete':
        return {
          title: 'Import Complete',
          description: 'Your documents have been saved successfully',
        };
    }
  }, [stage]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent
        className={cn(
          'max-w-3xl overflow-hidden',
          stage === 'complete' && 'max-w-lg',
          className
        )}
      >
        {/* Header - hidden for complete stage */}
        {stage !== 'complete' && (
          <DialogHeader>
            <DialogTitle>{stageInfo.title}</DialogTitle>
            <DialogDescription>{stageInfo.description}</DialogDescription>
          </DialogHeader>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <ErrorIcon className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto rounded-full p-0.5 hover:bg-destructive/20"
              aria-label="Dismiss error"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Content based on stage */}
        <div className="mt-2">
          {stage === 'drop' && (
            <DropZone onFilesSelected={handleFilesSelected} />
          )}

          {stage === 'processing' && (
            <ProcessingProgress
              files={files}
              onComplete={handleProcessingComplete}
              onCancel={handleProcessingCancelled}
            />
          )}

          {stage === 'review' && (
            <ExtractionReview
              documents={processed}
              onConfirm={handleConfirm}
              onCancel={handleReviewCancel}
            />
          )}

          {stage === 'complete' && (
            <ImportComplete
              count={importedIds.length}
              totalAmount={totalAmount}
              onClose={handleClose}
              onViewVault={handleViewVault}
              onImportMore={handleImportMore}
            />
          )}
        </div>

        {/* Loading overlay for saving */}
        {isSaving && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <LoadingSpinner className="h-8 w-8 text-primary" />
              <p className="text-sm text-muted-foreground">
                Saving documents...
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Trigger Button
// ============================================

export interface ImportTriggerProps {
  /** Open modal handler */
  onClick: () => void;

  /** Variant style */
  variant?: 'default' | 'outline' | 'ghost';

  /** Size */
  size?: 'default' | 'sm' | 'lg' | 'icon';

  /** Custom class name */
  className?: string;

  /** Children (overrides default content) */
  children?: React.ReactNode;
}

/**
 * Import trigger button.
 */
export function ImportTrigger({
  onClick,
  variant = 'default',
  size = 'default',
  className,
  children,
}: ImportTriggerProps) {
  return (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      className={className}
    >
      {children || (
        <>
          <PlusIcon className="mr-2 h-4 w-4" />
          Import Documents
        </>
      )}
    </Button>
  );
}

// ============================================
// Icons
// ============================================

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

function XIcon({ className }: { className?: string }) {
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
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
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
        d="M12 4.5v15m7.5-7.5h-15"
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

export default ImportModal;
