/**
 * ImportModal Component
 *
 * Main import dialog for document ingestion.
 * Orchestrates the full import flow:
 *   - Receipt/Invoice: drop → processing → review → complete
 *   - Statement: drop → processing → statement-review → complete
 *
 * Automatically detects whether the uploaded document is a bank/CC statement
 * and routes to the appropriate review screen.
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { vectorSearchService } from '@/lib/storage/vector-search';
import { embeddingService } from '@/lib/ai/embedding-service';
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
import { StatementReview } from './StatementReview';
import { ImportComplete } from './ImportComplete';
import { useTransactionActions } from '@/hooks/useLocalDB';
import { db } from '@/lib/storage/db';
import { opfsService } from '@/lib/storage/opfs';
import { processingWorkerClient } from '@/lib/processing/processing-worker-client';
import { autoCategorizer } from '@/lib/processing/auto-categorizer';
import { importDuplicateChecker } from '@/lib/anomaly/import-duplicate-checker';
import type { ProcessedDocumentResult } from '@/lib/processing/processing-worker-client';
import type { TransactionId, CategoryId } from '@/types/database';
import type { EditableDocument } from './ExtractionCard';
import type {
  StatementParseResult,
  ParsedStatementTransaction,
} from '@/types/statement';

// ============================================
// Types
// ============================================

export type ImportStage =
  | 'drop'
  | 'processing'
  | 'review'
  | 'statement-review'
  | 'complete';

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

  // Initialize vendor-category learning when modal opens
  useEffect(() => {
    if (open) {
      autoCategorizer.initializeLearning().catch((e) => {
        console.error(
          '[ImportModal] Failed to initialize category learning:',
          e
        );
      });
    }
  }, [open]);

  // Statement fingerprint warning (re-import detection)
  const [statementFingerprintWarning, setStatementFingerprintWarning] =
    useState<string | null>(null);

  // Statement-specific state
  const [statementResult, setStatementResult] =
    useState<StatementParseResult | null>(null);
  const [statementRawText, setStatementRawText] = useState<string>('');
  const [statementFileMetadata, setStatementFileMetadata] = useState<{
    originalName: string;
    mimeType: string;
    size: number;
    pageCount: number | null;
  } | null>(null);
  const [statementOcrUsed, setStatementOcrUsed] = useState(false);

  // Reset state when modal closes
  const handleClose = useCallback(() => {
    setStage('drop');
    setFiles([]);
    setProcessed([]);
    setImportedIds([]);
    setTotalAmount(0);
    setError(null);
    setIsSaving(false);
    setStatementResult(null);
    setStatementRawText('');
    setStatementFileMetadata(null);
    setStatementOcrUsed(false);
    setStatementFingerprintWarning(null);
    onClose();
  }, [onClose]);

  // Handle files selected
  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setStage('processing');
    setError(null);
  }, []);

  // Handle processing complete - detect if statement and route accordingly
  const handleProcessingComplete = useCallback(
    async (results: ProcessedDocumentResult[]) => {
      // Filter out errored results
      const successful = results.filter((r) => !hasProcessingError(r));

      if (successful.length === 0) {
        setError('No documents could be processed. Please try again.');
        setStage('drop');
        return;
      }

      // For single-file uploads, detect if it's a statement
      if (successful.length === 1 && successful[0]) {
        const doc = successful[0];
        const detection = processingWorkerClient.detectDocumentType(
          doc.rawText
        );

        console.log('[ImportModal] Document type detected:', detection);

        if (detection.type === 'statement' && detection.confidence >= 0.5) {
          // It's a statement - parse with regex first, then LLM fallback if needed
          try {
            // Use the LLM-enhanced parser which runs regex first,
            // then automatically falls back to Gemini if confidence is low
            const result =
              await processingWorkerClient.parseStatementWithLLMFallback(
                doc.rawText,
                { minConfidence: 0.5 }
              );

            if (result.transactions.length > 0) {
              // Check if this statement was previously imported
              const fpResult =
                await importDuplicateChecker.checkStatementFingerprint(result);
              if (fpResult.isAlreadyImported && fpResult.previousImport) {
                const prevDate =
                  fpResult.previousImport.importedAt.toLocaleDateString();
                setStatementFingerprintWarning(
                  `This statement may have already been imported on ${prevDate} ` +
                    `from "${fpResult.previousImport.fileName}" ` +
                    `(${fpResult.previousImport.transactionCount} transactions). ` +
                    `Duplicate transactions have been auto-deselected below.`
                );
              }

              setStatementResult(result);
              setStatementRawText(doc.rawText);
              setStatementFileMetadata(doc.fileMetadata);
              setStatementOcrUsed(doc.ocrUsed);
              setStage('statement-review');
              return;
            } else {
              // Detected as statement but no transactions found - fall through to receipt view
              console.log(
                '[ImportModal] Statement detected but no transactions parsed, falling back to receipt view'
              );
            }
          } catch (e) {
            console.error('[ImportModal] Statement parsing failed:', e);
            // Fall through to receipt review
          }
        }
      }

      // Not a statement (or multi-file) - use standard receipt review
      setProcessed(successful);
      setStage('review');
    },
    []
  );

  // Handle processing cancelled
  const handleProcessingCancelled = useCallback(() => {
    setStage('drop');
    setFiles([]);
  }, []);

  // Handle standard receipt confirm and save
  const handleConfirm = useCallback(
    async (documents: EditableDocument[]) => {
      setIsSaving(true);
      setError(null);

      try {
        // Ensure OPFS is initialized before saving files
        // This is idempotent — returns immediately if already initialized
        await opfsService.initialize();

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

          // Check if the original has a real (non-zero) embedding
          const origEmb = original.embedding;
          const hasRealEmbedding =
            origEmb &&
            origEmb.length > 0 &&
            !origEmb.every((v: number) => v === 0);

          // Create transaction with all required fields
          const transaction = {
            date: edited.date,
            amount: edited.amount,
            vendor: edited.vendor,
            category: edited.category,
            note: edited.note || '',
            rawText: original.rawText,
            embedding: hasRealEmbedding ? origEmb : new Float32Array(384),
            filePath: filePath || '',
            mimeType: mimeType || 'application/octet-stream',
            fileSize: fileSize || 0,
            confidence: original.confidence,
            currency: original.entities.currency || 'INR',
            isManuallyEdited: false,
          };

          const id = await addTransaction(transaction);
          savedIds.push(id);
          total += edited.amount;

          // Only add to vector index now if we have a real embedding.
          // Zero-filled embeddings will be generated in the background below.
          if (hasRealEmbedding) {
            try {
              vectorSearchService.addVector(id, origEmb, {
                date: edited.date,
                vendor: edited.vendor,
                amount: edited.amount,
              });
            } catch (e) {
              console.warn('Failed to index transaction vector:', e);
            }
          }
        }

        // Persist the vector index after batch import (for any real embeddings added above)
        const idsWithRealEmbeddings = savedIds.length; // approximate; ok to save even if empty
        if (idsWithRealEmbeddings > 0) {
          try {
            await vectorSearchService.saveIndex();
          } catch (e) {
            console.warn('Failed to persist vector index:', e);
          }
        }

        // Generate embeddings in the background for transactions that had
        // zero-filled embeddings (most receipt imports). This mirrors the
        // statement import flow and ensures receipts are searchable via RAG.
        if (savedIds.length > 0) {
          (async () => {
            try {
              if (!embeddingService.isReady()) {
                await embeddingService.initialize();
              }

              let indexed = 0;
              for (const txId of savedIds) {
                try {
                  const tx = await db.transactions.get(txId);
                  if (!tx) {
                    continue;
                  }

                  // Skip if transaction already has a real embedding
                  const emb = tx.embedding;
                  const alreadyHasEmbedding =
                    emb && emb.length > 0 && !emb.every((v: number) => v === 0);
                  if (alreadyHasEmbedding) {
                    continue;
                  }

                  // Build natural-language search text for embedding
                  const absAmt = Math.abs(tx.amount).toFixed(2);
                  let dateText = tx.date;
                  try {
                    const d = new Date(`${tx.date}T00:00:00`);
                    dateText = d.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    });
                  } catch {
                    // keep ISO format
                  }
                  let currSymbol = '₹';
                  try {
                    const parts = new Intl.NumberFormat('en', {
                      style: 'currency',
                      currency: tx.currency || 'INR',
                      currencyDisplay: 'narrowSymbol',
                    }).formatToParts(0);
                    currSymbol =
                      parts.find((p) => p.type === 'currency')?.value ||
                      tx.currency ||
                      '₹';
                  } catch {
                    // fallback
                  }
                  const searchText =
                    tx.amount < 0
                      ? `Income credit of ${currSymbol}${absAmt} from ${tx.vendor || 'unknown'} on ${dateText}${tx.note ? `. ${tx.note}` : ''}`
                      : `Expense payment of ${currSymbol}${absAmt} at ${tx.vendor || 'unknown'} on ${dateText}${tx.note ? `. ${tx.note}` : ''}`;

                  const embedding =
                    await embeddingService.embedText(searchText);

                  // Update transaction in IndexedDB
                  await db.transactions.update(txId, { embedding });

                  // Add to vector index
                  vectorSearchService.addVector(txId, embedding, {
                    date: tx.date,
                    vendor: tx.vendor,
                    amount: tx.amount,
                  });
                  indexed++;
                } catch (e) {
                  console.warn(
                    `[ImportModal] Failed to embed receipt transaction ${txId}:`,
                    e
                  );
                }
              }

              if (indexed > 0) {
                await vectorSearchService.saveIndex();
                console.log(
                  `[ImportModal] Indexed ${indexed}/${savedIds.length} receipt transactions for search`
                );
              }
            } catch (e) {
              console.warn(
                '[ImportModal] Background receipt embedding generation failed:',
                e
              );
            }
          })();
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

  // Handle statement confirm and batch save
  const handleStatementConfirm = useCallback(
    async (transactions: ParsedStatementTransaction[]) => {
      setIsSaving(true);
      setError(null);

      try {
        await opfsService.initialize();

        const savedIds: TransactionId[] = [];
        let total = 0;
        const currency = statementResult?.currency || 'INR';

        // Save the source file to OPFS once (shared by all transactions)
        let filePath = '';
        let mimeType = '';
        let fileSize = 0;
        const originalFile = files[0];

        if (originalFile) {
          try {
            const tempId = `stmt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const savedInfo = await opfsService.saveFile(originalFile, tempId);
            filePath = savedInfo.filePath;
            mimeType = savedInfo.mimeType;
            fileSize = savedInfo.size;
          } catch (e) {
            console.error('Failed to save statement file to OPFS:', e);
          }
        }

        // Collect vendor-category mappings for learning
        const categoryLearnings: Array<{
          vendor: string;
          categoryId: CategoryId;
        }> = [];

        // Save each transaction
        for (const tx of transactions) {
          const transaction = {
            date: tx.date,
            amount: tx.amount,
            vendor: tx.vendor,
            category: tx.category,
            note: tx.note || `From ${statementResult?.issuer || 'statement'}`,
            rawText: tx.rawLine, // Only the specific line, not the full statement
            embedding: new Float32Array(384), // Will be generated later
            filePath,
            mimeType,
            fileSize,
            confidence: tx.confidence,
            currency,
            isManuallyEdited: false,
          };

          const id = await addTransaction(transaction);
          savedIds.push(id);
          total += tx.amount;

          // Collect vendor-category pairs for learning
          if (tx.category && tx.vendor) {
            categoryLearnings.push({
              vendor: tx.vendor,
              categoryId: tx.category,
            });
          }
        }

        // Learn vendor-category mappings from user's confirmed selections
        if (categoryLearnings.length > 0) {
          try {
            await autoCategorizer.learnCategories(categoryLearnings);
            console.log(
              `[ImportModal] Learned ${categoryLearnings.length} vendor-category mappings from statement`
            );
          } catch (e) {
            // Learning failure is non-critical; don't block the save
            console.error('[ImportModal] Failed to learn categories:', e);
          }
        }

        // Save statement fingerprint for future re-import detection
        if (statementResult) {
          try {
            const fingerprint = importDuplicateChecker.generateFingerprint(
              statementResult,
              originalFile?.name || 'unknown'
            );
            await importDuplicateChecker.saveFingerprint(fingerprint);
            console.log('[ImportModal] Statement fingerprint saved');
          } catch (e) {
            console.error('[ImportModal] Failed to save fingerprint:', e);
          }
        }

        // Generate embeddings and add to vector index in the background.
        // This runs after the transactions are saved so it doesn't block
        // the import flow. If it fails, transactions are still searchable
        // via structured DB queries; embeddings will be generated on next
        // chat init via ensureVectorIndex().
        if (savedIds.length > 0) {
          (async () => {
            try {
              // Ensure embedding model is loaded
              if (!embeddingService.isReady()) {
                await embeddingService.initialize();
              }

              let indexed = 0;
              for (const txId of savedIds) {
                try {
                  const tx = await db.transactions.get(txId);
                  if (!tx) {
                    continue;
                  }

                  // Build natural-language search text for embedding
                  // (mirrors ChatServiceImpl.buildSearchText for consistency)
                  const absAmt = Math.abs(tx.amount).toFixed(2);
                  let dateText = tx.date;
                  try {
                    const d = new Date(`${tx.date}T00:00:00`);
                    dateText = d.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    });
                  } catch {
                    // keep ISO format
                  }
                  // Use the transaction's actual currency symbol
                  let currSymbol = '₹';
                  try {
                    const parts = new Intl.NumberFormat('en', {
                      style: 'currency',
                      currency: tx.currency || currency,
                      currencyDisplay: 'narrowSymbol',
                    }).formatToParts(0);
                    currSymbol =
                      parts.find((p) => p.type === 'currency')?.value ||
                      tx.currency ||
                      '₹';
                  } catch {
                    // fallback
                  }
                  const searchText =
                    tx.amount < 0
                      ? `Income credit of ${currSymbol}${absAmt} from ${tx.vendor || 'unknown'} on ${dateText}${tx.note ? `. ${tx.note}` : ''}`
                      : `Expense payment of ${currSymbol}${absAmt} at ${tx.vendor || 'unknown'} on ${dateText}${tx.note ? `. ${tx.note}` : ''}`;

                  const embedding =
                    await embeddingService.embedText(searchText);

                  // Update transaction in IndexedDB
                  await db.transactions.update(txId, { embedding });

                  // Add to vector index
                  vectorSearchService.addVector(txId, embedding, {
                    date: tx.date,
                    vendor: tx.vendor,
                    amount: tx.amount,
                  });
                  indexed++;
                } catch (e) {
                  console.warn(
                    `[ImportModal] Failed to embed transaction ${txId}:`,
                    e
                  );
                }
              }

              if (indexed > 0) {
                await vectorSearchService.saveIndex();
                console.log(
                  `[ImportModal] Indexed ${indexed}/${savedIds.length} statement transactions for search`
                );
              }
            } catch (e) {
              console.warn(
                '[ImportModal] Background embedding generation failed:',
                e
              );
            }
          })();
        }

        setImportedIds(savedIds);
        setTotalAmount(total);
        setStage('complete');
        onSuccess?.(savedIds);
      } catch (e) {
        console.error('Failed to save statement transactions:', e);
        setError(
          e instanceof Error ? e.message : 'Failed to save transactions'
        );
      } finally {
        setIsSaving(false);
      }
    },
    [files, statementResult, addTransaction, onSuccess]
  );

  // Handle review cancel
  const handleReviewCancel = useCallback(() => {
    setStage('drop');
    setFiles([]);
    setProcessed([]);
    setStatementResult(null);
    setStatementRawText('');
    setStatementFileMetadata(null);
    setStatementFingerprintWarning(null);
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
    setStatementResult(null);
    setStatementRawText('');
    setStatementFileMetadata(null);
    setStatementFingerprintWarning(null);
  }, []);

  // Stage title and description
  const stageInfo = useMemo(() => {
    switch (stage) {
      case 'drop':
        return {
          title: 'Import Documents',
          description:
            'Upload receipts, invoices, or bank/credit card statements',
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
      case 'statement-review':
        return {
          title: 'Review Statement Transactions',
          description:
            'We detected a financial statement. Review the parsed transactions below.',
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
          stage === 'statement-review' && 'max-w-4xl',
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

          {stage === 'statement-review' &&
            statementResult &&
            statementFileMetadata && (
              <div className="flex flex-col gap-3">
                {statementFingerprintWarning && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50 p-3 dark:bg-amber-950/20">
                    <ReimportWarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                        Previously Imported Statement
                      </p>
                      <p className="mt-0.5 text-xs text-amber-600/80 dark:text-amber-400/80">
                        {statementFingerprintWarning}
                      </p>
                    </div>
                  </div>
                )}
                <StatementReview
                  statementResult={statementResult}
                  rawText={statementRawText}
                  fileMetadata={statementFileMetadata}
                  ocrUsed={statementOcrUsed}
                  onConfirm={handleStatementConfirm}
                  onCancel={handleReviewCancel}
                />
              </div>
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
                Saving{' '}
                {stage === 'statement-review' ? 'transactions' : 'documents'}...
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

function ReimportWarningIcon({ className }: { className?: string }) {
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
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
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
