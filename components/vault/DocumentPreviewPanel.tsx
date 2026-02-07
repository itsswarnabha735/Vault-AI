/**
 * DocumentPreviewPanel Component
 *
 * Slide-in panel for previewing and editing document details.
 * Shows full document viewer, metadata, and actions.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn, formatCurrency, formatDate, formatFileSize } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SyncStatusBadge } from './DocumentCard';
import { DocumentViewer } from '@/components/chat/DocumentViewer';
import type { LocalTransaction, TransactionId } from '@/types/database';

// ============================================
// Types
// ============================================

export interface DocumentPreviewPanelProps {
  /** Transaction to preview */
  transaction: LocalTransaction | null;

  /** Close handler */
  onClose: () => void;

  /** Delete handler */
  onDelete?: (id: TransactionId) => void;

  /** Edit handler */
  onEdit?: (id: TransactionId, updates: Partial<LocalTransaction>) => void;

  /** Custom class name */
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * Document preview slide-in panel.
 *
 * @example
 * ```tsx
 * <DocumentPreviewPanel
 *   transaction={selectedTransaction}
 *   onClose={() => setSelectedTransaction(null)}
 *   onDelete={(id) => handleDelete(id)}
 * />
 * ```
 */
export function DocumentPreviewPanel({
  transaction,
  onClose,
  onDelete,
  onEdit,
  className,
}: DocumentPreviewPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [editedValues, setEditedValues] = useState<Partial<LocalTransaction>>(
    {}
  );
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);

  // Reset state when transaction changes
  useEffect(() => {
    setIsEditing(false);
    setEditedValues({});
    setDocumentUrl(null);
  }, [transaction?.id]);

  // Load document preview
  useEffect(() => {
    if (!transaction?.filePath) {
      setDocumentUrl(null);
      return;
    }

    const loadDocument = async () => {
      try {
        const root = await navigator.storage.getDirectory();
        const parts = transaction.filePath.split('/').filter(Boolean);

        let current: FileSystemDirectoryHandle = root;
        for (let i = 0; i < parts.length - 1; i++) {
          current = await current.getDirectoryHandle(parts[i]!);
        }

        const fileName = parts[parts.length - 1]!;
        const fileHandle = await current.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        const url = URL.createObjectURL(file);
        setDocumentUrl(url);
      } catch (err) {
        console.warn('Failed to load document:', err);
      }
    };

    loadDocument();

    return () => {
      if (documentUrl) {
        URL.revokeObjectURL(documentUrl);
      }
    };
  }, [transaction?.filePath]);

  // Handle escape key
  useEffect(() => {
    if (!transaction) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditing) {
          setIsEditing(false);
          setEditedValues({});
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [transaction, isEditing, onClose]);

  // Handle save
  const handleSave = useCallback(() => {
    if (transaction && Object.keys(editedValues).length > 0) {
      onEdit?.(transaction.id, editedValues);
    }
    setIsEditing(false);
    setEditedValues({});
  }, [transaction, editedValues, onEdit]);

  // Handle delete
  const handleDelete = useCallback(() => {
    if (
      transaction &&
      window.confirm('Are you sure you want to delete this document?')
    ) {
      onDelete?.(transaction.id);
      onClose();
    }
  }, [transaction, onDelete, onClose]);

  if (!transaction) {
    return null;
  }

  // Format display values
  const formattedAmount = formatCurrency(transaction.amount);
  const formattedDate = formatDate(new Date(transaction.date), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedFileSize = transaction.fileSize
    ? formatFileSize(transaction.fileSize)
    : 'Unknown';

  // Determine file type
  const isPDF = transaction.mimeType?.includes('pdf');
  const isImage = transaction.mimeType?.startsWith('image/');

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed bottom-0 right-0 top-0 z-50 w-full max-w-md overflow-hidden',
          'border-l border-border bg-background shadow-xl',
          'duration-300 animate-in slide-in-from-right',
          'lg:relative lg:max-w-none lg:animate-none lg:border-0 lg:shadow-none',
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Document details"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-foreground">Document Details</h2>
            <SyncStatusBadge status={transaction.syncStatus} />
          </div>

          <div className="flex items-center gap-1">
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    setEditedValues({});
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave}>
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </Button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Close panel"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex h-[calc(100%-8rem)] flex-col overflow-y-auto">
          {/* Document preview */}
          <button
            type="button"
            onClick={() => transaction.filePath && setIsViewerOpen(true)}
            disabled={!transaction.filePath}
            className={cn(
              'relative aspect-[4/3] w-full bg-muted',
              transaction.filePath && 'cursor-pointer hover:opacity-90'
            )}
          >
            {documentUrl && isImage ? (
              <img
                src={documentUrl}
                alt={`Document from ${transaction.vendor}`}
                className="h-full w-full object-contain"
              />
            ) : documentUrl && isPDF ? (
              <iframe
                src={`${documentUrl}#toolbar=0`}
                className="h-full w-full"
                title="Document preview"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                <FileIcon className="h-16 w-16 text-muted-foreground" />
                {transaction.filePath ? (
                  <span className="text-sm text-muted-foreground">
                    Click to view full document
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No document attached
                  </span>
                )}
              </div>
            )}

            {/* View full button overlay */}
            {transaction.filePath && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/20">
                <div className="rounded-full bg-background/90 p-3 opacity-0 shadow-lg transition-opacity hover:opacity-100">
                  <ExpandIcon className="h-6 w-6 text-foreground" />
                </div>
              </div>
            )}
          </button>

          {/* Details */}
          <div className="flex-1 p-4">
            <div className="space-y-4">
              {/* Vendor */}
              <DetailField
                label="Vendor"
                value={transaction.vendor}
                isEditing={isEditing}
                editedValue={editedValues.vendor}
                onEditChange={(value) =>
                  setEditedValues({ ...editedValues, vendor: value })
                }
              />

              {/* Amount */}
              <DetailField
                label="Amount"
                value={formattedAmount}
                isEditing={isEditing}
                editedValue={editedValues.amount?.toString()}
                onEditChange={(value) =>
                  setEditedValues({
                    ...editedValues,
                    amount: parseFloat(value) || 0,
                  })
                }
                type="number"
              />

              {/* Date */}
              <DetailField
                label="Date"
                value={formattedDate}
                isEditing={isEditing}
                editedValue={editedValues.date}
                onEditChange={(value) =>
                  setEditedValues({ ...editedValues, date: value })
                }
                type="date"
                displayValue={formattedDate}
                editValue={transaction.date}
              />

              {/* Note */}
              <DetailField
                label="Note"
                value={transaction.note || 'No note'}
                isEditing={isEditing}
                editedValue={editedValues.note}
                onEditChange={(value) =>
                  setEditedValues({ ...editedValues, note: value })
                }
                multiline
              />

              {/* File info */}
              {transaction.filePath && (
                <div className="rounded-lg border border-border p-3">
                  <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    File Info
                  </h4>
                  <div className="mt-2 space-y-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">Type:</span>{' '}
                      {transaction.mimeType || 'Unknown'}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Size:</span>{' '}
                      {formattedFileSize}
                    </p>
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="rounded-lg border border-border p-3">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Metadata
                </h4>
                <div className="mt-2 space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Confidence:</span>{' '}
                    {Math.round(transaction.confidence * 100)}%
                  </p>
                  <p>
                    <span className="text-muted-foreground">Created:</span>{' '}
                    {formatDate(transaction.createdAt)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Updated:</span>{' '}
                    {formatDate(transaction.updatedAt)}
                  </p>
                </div>
              </div>

              {/* Privacy note */}
              <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/20">
                <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  <p className="font-medium">Privacy Protected</p>
                  <p className="mt-0.5 opacity-80">
                    Document stored locally. Raw text and embeddings never leave
                    your device.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            {transaction.filePath && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsViewerOpen(true)}
              >
                <ExpandIcon className="mr-2 h-4 w-4" />
                View Full Screen
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!onDelete}
            >
              <TrashIcon className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Full screen document viewer */}
      {transaction.filePath && (
        <DocumentViewer
          transactionId={transaction.id}
          filePath={transaction.filePath}
          mimeType={transaction.mimeType}
          isOpen={isViewerOpen}
          onClose={() => setIsViewerOpen(false)}
        />
      )}
    </>
  );
}

// ============================================
// Detail Field
// ============================================

interface DetailFieldProps {
  label: string;
  value: string;
  isEditing: boolean;
  editedValue?: string;
  onEditChange: (value: string) => void;
  type?: 'text' | 'number' | 'date';
  displayValue?: string;
  editValue?: string;
  multiline?: boolean;
}

function DetailField({
  label,
  value,
  isEditing,
  editedValue,
  onEditChange,
  type = 'text',
  displayValue,
  editValue,
  multiline = false,
}: DetailFieldProps) {
  const currentValue = editedValue ?? (editValue || value);

  return (
    <div>
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {isEditing ? (
        multiline ? (
          <textarea
            value={currentValue}
            onChange={(e) => onEditChange(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            rows={3}
          />
        ) : (
          <Input
            type={type}
            value={currentValue}
            onChange={(e) => onEditChange(e.target.value)}
            className="mt-1"
          />
        )
      ) : (
        <p className="mt-1 text-foreground">{displayValue || value}</p>
      )}
    </div>
  );
}

// ============================================
// Icons
// ============================================

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

function ExpandIcon({ className }: { className?: string }) {
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
        d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
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
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

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

export default DocumentPreviewPanel;
