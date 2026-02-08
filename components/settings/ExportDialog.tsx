/**
 * ExportDialog Component
 *
 * Dialog for exporting data with options:
 * - Format selection (CSV, JSON)
 * - Include documents option
 * - Date range filter
 * - Export progress
 */

'use client';

import React, { useState, useCallback } from 'react';
import {
  Download,
  FileText,
  FileJson,
  FileArchive,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

import { cn } from '@/lib/utils/index';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useExport } from '@/hooks/useExportImport';
import type { ExportFormat, ExportFilters } from '@/lib/export';

// ============================================
// Types
// ============================================

export interface ExportDialogProps {
  /** Whether the dialog is open */
  open: boolean;

  /** Handler to close the dialog */
  onOpenChange: (open: boolean) => void;

  /** Callback when export completes */
  onExportComplete?: () => void;
}

type ExportType = 'transactions' | 'documents' | 'all';

// ============================================
// Component
// ============================================

export function ExportDialog({
  open,
  onOpenChange,
  onExportComplete,
}: ExportDialogProps) {
  const [exportType, setExportType] = useState<ExportType>('transactions');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [includeDocuments, setIncludeDocuments] = useState(false);
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: '',
    end: '',
  });

  const {
    exportTransactions,
    exportDocuments,
    exportAll,
    progress,
    isExporting,
    lastResult,
    reset,
  } = useExport({
    autoDownload: true,
    onComplete: () => {
      onExportComplete?.();
    },
  });

  /**
   * Handle export.
   */
  const handleExport = useCallback(async () => {
    const filters: ExportFilters | undefined = useDateFilter
      ? { dateRange: { start: dateRange.start, end: dateRange.end } }
      : undefined;

    switch (exportType) {
      case 'transactions':
        await exportTransactions(format, filters);
        break;
      case 'documents':
        await exportDocuments();
        break;
      case 'all':
        await exportAll(includeDocuments);
        break;
    }
  }, [
    exportType,
    format,
    useDateFilter,
    dateRange,
    includeDocuments,
    exportTransactions,
    exportDocuments,
    exportAll,
  ]);

  /**
   * Handle close.
   */
  const handleClose = useCallback(() => {
    if (!isExporting) {
      reset();
      onOpenChange(false);
    }
  }, [isExporting, reset, onOpenChange]);

  const isComplete = progress.stage === 'complete';
  const isError = progress.stage === 'error';
  const showProgress = isExporting || isComplete || isError;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Data
          </DialogTitle>
          <DialogDescription>
            Choose what to export and the format
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Export Type Selection */}
          <div className="space-y-3">
            <Label>What to export</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setExportType('transactions')}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors',
                  exportType === 'transactions'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted'
                )}
                disabled={isExporting}
              >
                <FileText className="h-5 w-5" />
                <span className="text-xs font-medium">Transactions</span>
              </button>
              <button
                type="button"
                onClick={() => setExportType('documents')}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors',
                  exportType === 'documents'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted'
                )}
                disabled={isExporting}
              >
                <FileArchive className="h-5 w-5" />
                <span className="text-xs font-medium">Documents</span>
              </button>
              <button
                type="button"
                onClick={() => setExportType('all')}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors',
                  exportType === 'all'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted'
                )}
                disabled={isExporting}
              >
                <Download className="h-5 w-5" />
                <span className="text-xs font-medium">Full Backup</span>
              </button>
            </div>
          </div>

          {/* Format Selection (for transactions) */}
          {exportType === 'transactions' && (
            <div className="space-y-3">
              <Label>Format</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormat('csv')}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                    format === 'csv'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted'
                  )}
                  disabled={isExporting}
                >
                  <FileText className="h-5 w-5" />
                  <div className="text-left">
                    <p className="text-sm font-medium">CSV</p>
                    <p className="text-xs text-muted-foreground">
                      Excel compatible
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('json')}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                    format === 'json'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted'
                  )}
                  disabled={isExporting}
                >
                  <FileJson className="h-5 w-5" />
                  <div className="text-left">
                    <p className="text-sm font-medium">JSON</p>
                    <p className="text-xs text-muted-foreground">
                      Complete data
                    </p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Include Documents (for full backup) */}
          {exportType === 'all' && (
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label className="font-medium">Include Documents</Label>
                <p className="text-xs text-muted-foreground">
                  Export as ZIP with all original documents
                </p>
              </div>
              <Switch
                checked={includeDocuments}
                onCheckedChange={setIncludeDocuments}
                disabled={isExporting}
              />
            </div>
          )}

          {/* Date Filter (for transactions) */}
          {exportType === 'transactions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Date Range Filter</Label>
                <Switch
                  checked={useDateFilter}
                  onCheckedChange={setUseDateFilter}
                  disabled={isExporting}
                />
              </div>

              {useDateFilter && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">From</Label>
                    <Input
                      type="date"
                      value={dateRange.start}
                      onChange={(e) =>
                        setDateRange((prev) => ({
                          ...prev,
                          start: e.target.value,
                        }))
                      }
                      disabled={isExporting}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">To</Label>
                    <Input
                      type="date"
                      value={dateRange.end}
                      onChange={(e) =>
                        setDateRange((prev) => ({
                          ...prev,
                          end: e.target.value,
                        }))
                      }
                      disabled={isExporting}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Progress Display */}
          {showProgress && (
            <div className="space-y-3">
              {isExporting && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {progress.stage === 'compressing'
                        ? 'Compressing...'
                        : 'Exporting...'}
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

              {isComplete && (
                <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700 dark:text-green-300">
                    Export complete! Check your downloads folder.
                    {lastResult?.stats && (
                      <span className="mt-1 block text-xs">
                        {lastResult.stats.transactionCount} transactions,{' '}
                        {lastResult.stats.documentCount} documents
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {progress.error || 'Export failed'}
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
            disabled={isExporting}
          >
            {isComplete ? 'Done' : 'Cancel'}
          </Button>
          {!isComplete && (
            <Button onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ExportDialog;
