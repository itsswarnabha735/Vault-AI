/**
 * ImportDialog Component
 *
 * Dialog for importing data with:
 * - File drop zone
 * - File validation
 * - Conflict handling options
 * - Import progress
 * - Success/error summary
 */

'use client';

import React, { useState, useCallback, useRef } from 'react';
import {
  Upload,
  FileText,
  FileJson,
  FileArchive,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils/index';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useImport } from '@/hooks/useExportImport';
import type { ImportOptions } from '@/lib/export';

// ============================================
// Types
// ============================================

export interface ImportDialogProps {
  /** Whether the dialog is open */
  open: boolean;

  /** Handler to close the dialog */
  onOpenChange: (open: boolean) => void;

  /** Callback when import completes */
  onImportComplete?: () => void;
}

type ConflictResolution = 'skip' | 'overwrite';

// ============================================
// Sub-components
// ============================================

interface FileDropZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  selectedFile: File | null;
  onClear: () => void;
}

function FileDropZone({
  onFileSelect,
  disabled,
  selectedFile,
  onClear,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) {
        return;
      }

      const file = e.dataTransfer.files[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [disabled, onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click();
    }
  }, [disabled]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const getFileIcon = (file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv')) {
      return FileText;
    }
    if (name.endsWith('.json')) {
      return FileJson;
    }
    if (name.endsWith('.zip')) {
      return FileArchive;
    }
    return FileText;
  };

  if (selectedFile) {
    const Icon = getFileIcon(selectedFile);
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-4">
        <Icon className="h-8 w-8 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{selectedFile.name}</p>
          <p className="text-sm text-muted-foreground">
            {(selectedFile.size / 1024).toFixed(1)} KB
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          disabled={disabled}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.json,.zip"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        disabled={disabled}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <Upload className="h-10 w-10 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">
            {isDragging ? 'Drop file here' : 'Click to select or drag & drop'}
          </p>
          <p className="text-sm text-muted-foreground">
            Supports CSV, JSON, and ZIP backup files
          </p>
        </div>
      </button>
    </>
  );
}

// ============================================
// Main Component
// ============================================

export function ImportDialog({
  open,
  onOpenChange,
  onImportComplete,
}: ImportDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [conflictResolution, setConflictResolution] =
    useState<ConflictResolution>('skip');
  const [mergeCategories, _setMergeCategories] = useState(true);

  const {
    validateFile,
    importBackup,
    importCSV,
    progress,
    isImporting,
    validation,
    lastResult,
    reset,
  } = useImport({
    onComplete: () => {
      onImportComplete?.();
    },
  });

  /**
   * Handle file selection.
   */
  const handleFileSelect = useCallback(
    async (file: File) => {
      setSelectedFile(file);
      await validateFile(file);
    },
    [validateFile]
  );

  /**
   * Clear selected file.
   */
  const handleClearFile = useCallback(() => {
    setSelectedFile(null);
    reset();
  }, [reset]);

  /**
   * Handle import.
   */
  const handleImport = useCallback(async () => {
    if (!selectedFile || !validation?.isValid) {
      return;
    }

    const options: ImportOptions = {
      conflictResolution,
      importDocuments: true,
      mergeCategories,
    };

    if (validation.format === 'csv') {
      await importCSV(selectedFile, options);
    } else {
      await importBackup(selectedFile, options);
    }
  }, [
    selectedFile,
    validation,
    conflictResolution,
    mergeCategories,
    importCSV,
    importBackup,
  ]);

  /**
   * Handle close.
   */
  const handleClose = useCallback(() => {
    if (!isImporting) {
      setSelectedFile(null);
      reset();
      onOpenChange(false);
    }
  }, [isImporting, reset, onOpenChange]);

  const isComplete = progress.stage === 'complete';
  const isError = progress.stage === 'error';
  const showProgress = isImporting || isComplete || isError;
  const canImport = validation?.isValid && !isImporting && !isComplete;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Data
          </DialogTitle>
          <DialogDescription>
            Import transactions from a backup or CSV file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Drop Zone */}
          {!isComplete && (
            <FileDropZone
              onFileSelect={handleFileSelect}
              disabled={isImporting}
              selectedFile={selectedFile}
              onClear={handleClearFile}
            />
          )}

          {/* Validation Results */}
          {validation && !isComplete && (
            <div className="space-y-3">
              {/* Format Badge */}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {validation.format}
                </Badge>
                {validation.isValid ? (
                  <Badge
                    variant="default"
                    className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Valid
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Invalid
                  </Badge>
                )}
              </div>

              {/* Preview */}
              {validation.preview && (
                <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
                  <p className="mb-2 font-medium">Preview</p>
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                    <span>Transactions:</span>
                    <span className="font-medium text-foreground">
                      {validation.preview.transactionCount}
                    </span>
                    {validation.preview.categoryCount > 0 && (
                      <>
                        <span>Categories:</span>
                        <span className="font-medium text-foreground">
                          {validation.preview.categoryCount}
                        </span>
                      </>
                    )}
                    {validation.preview.documentCount > 0 && (
                      <>
                        <span>Documents:</span>
                        <span className="font-medium text-foreground">
                          {validation.preview.documentCount}
                        </span>
                      </>
                    )}
                    {validation.preview.dateRange && (
                      <>
                        <span>Date range:</span>
                        <span className="font-medium text-foreground">
                          {validation.preview.dateRange.start} to{' '}
                          {validation.preview.dateRange.end}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Errors */}
              {validation.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Validation Errors</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-1 list-inside list-disc">
                      {validation.errors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Warnings */}
              {validation.warnings.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Warnings</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-1 list-inside list-disc">
                      {validation.warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Import Options */}
          {validation?.isValid && !isComplete && !isImporting && (
            <div className="space-y-3">
              <Label className="font-medium">Import Options</Label>

              {/* Conflict Resolution */}
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Duplicate Handling</p>
                  <p className="text-xs text-muted-foreground">
                    What to do with existing transactions
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="capitalize">
                      {conflictResolution}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onClick={() => setConflictResolution('skip')}
                    >
                      Skip duplicates
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setConflictResolution('overwrite')}
                    >
                      Overwrite existing
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          {/* Progress Display */}
          {showProgress && (
            <div className="space-y-3">
              {isImporting && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Importing...
                    </span>
                    <span>{progress.progress}%</span>
                  </div>
                  <Progress value={progress.progress} />
                  {progress.currentItem && (
                    <p className="truncate text-xs text-muted-foreground">
                      {progress.currentItem}
                    </p>
                  )}
                </>
              )}

              {isComplete && lastResult?.success && (
                <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-700 dark:text-green-300">
                    Import Complete
                  </AlertTitle>
                  <AlertDescription className="text-green-600 dark:text-green-400">
                    {lastResult.stats && (
                      <div className="mt-2 space-y-1 text-sm">
                        <p>
                          {lastResult.stats.transactionsImported} transactions
                          imported
                        </p>
                        {lastResult.stats.transactionsSkipped > 0 && (
                          <p>
                            {lastResult.stats.transactionsSkipped} duplicates
                            skipped
                          </p>
                        )}
                        {lastResult.stats.categoriesImported > 0 && (
                          <p>
                            {lastResult.stats.categoriesImported} categories
                            created
                          </p>
                        )}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {progress.error || lastResult?.error || 'Import failed'}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isImporting}
          >
            {isComplete ? 'Done' : 'Cancel'}
          </Button>
          {!isComplete && (
            <Button onClick={handleImport} disabled={!canImport}>
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImportDialog;
