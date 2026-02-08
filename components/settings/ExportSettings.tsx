/**
 * ExportSettings Component
 *
 * Manages data export and import including:
 * - Export transactions (CSV, JSON)
 * - Export documents (ZIP)
 * - Export all data
 * - Import from backup
 * - Clear local data
 */

'use client';

import React, { useState, useCallback } from 'react';
import {
  Download,
  Upload,
  Trash2,
  Loader2,
  AlertTriangle,
  HardDrive,
  Database,
} from 'lucide-react';

import { cn } from '@/lib/utils/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useDbStats } from '@/hooks/useLocalDB';
import { useOPFSStorage } from '@/hooks/useOPFS';
import { db } from '@/lib/storage/db';
import { ExportDialog } from './ExportDialog';
import { ImportDialog } from './ImportDialog';

// ============================================
// Types
// ============================================

export interface ExportSettingsProps {
  /** Additional CSS class names */
  className?: string;
}

// ============================================
// Helper Functions
// ============================================

function _formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ============================================
// Sub-components
// ============================================

interface StorageInfoProps {
  dbStats:
    | { transactionCount: number; categoryCount: number; budgetCount: number }
    | undefined;
  opfsStats: {
    totalBytes: number;
    quotaBytes: number | null;
    totalBytesFormatted: string;
    quotaBytesFormatted: string | null;
  } | null;
}

function StorageInfo({ dbStats, opfsStats }: StorageInfoProps) {
  const usedPercentage = opfsStats?.quotaBytes
    ? Math.round((opfsStats.totalBytes / opfsStats.quotaBytes) * 100)
    : 0;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/50 p-4">
      {/* Database Stats */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold">{dbStats?.transactionCount || 0}</p>
          <p className="text-xs text-muted-foreground">Transactions</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{dbStats?.categoryCount || 0}</p>
          <p className="text-xs text-muted-foreground">Categories</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{dbStats?.budgetCount || 0}</p>
          <p className="text-xs text-muted-foreground">Budgets</p>
        </div>
      </div>

      <Separator />

      {/* Storage Usage */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Local Storage
          </span>
          <span className="text-muted-foreground">
            {opfsStats?.totalBytesFormatted || '0 B'} /{' '}
            {opfsStats?.quotaBytesFormatted || 'Unknown'}
          </span>
        </div>
        <Progress value={usedPercentage} className="h-2" />
      </div>
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ElementType;
  label: string;
  description: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'secondary';
}

function ActionButton({
  icon: Icon,
  label,
  description,
  onClick,
  variant: _variant = 'outline',
}: ActionButtonProps) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-4 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
      onClick={onClick}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

// ============================================
// Main Component
// ============================================

export function ExportSettings({ className }: ExportSettingsProps) {
  const { data: dbStats } = useDbStats();
  const { stats: opfsStats } = useOPFSStorage();

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [clearConfirmation, setClearConfirmation] = useState('');
  const [isClearing, setIsClearing] = useState(false);

  /**
   * Clear all local data.
   */
  const handleClearData = useCallback(async () => {
    if (clearConfirmation !== 'delete all data') {
      return;
    }

    setIsClearing(true);

    try {
      // Clear all IndexedDB tables
      await Promise.all([
        db.transactions.clear(),
        db.categories.clear(),
        db.budgets.clear(),
        db.anomalies.clear(),
        db.searchHistory.clear(),
      ]);

      // TODO: Clear OPFS files as well

      setShowClearDialog(false);
      setClearConfirmation('');
    } catch (err) {
      console.error('Clear data failed:', err);
    } finally {
      setIsClearing(false);
    }
  }, [clearConfirmation]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Storage Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Local Data
          </CardTitle>
          <CardDescription>
            Overview of your locally stored data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StorageInfo dbStats={dbStats} opfsStats={opfsStats} />
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Data
          </CardTitle>
          <CardDescription>
            Download your data in various formats
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionButton
            icon={Download}
            label="Export Data"
            description="Export transactions, documents, or create a full backup"
            onClick={() => setShowExportDialog(true)}
          />

          <Alert className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Privacy Note</AlertTitle>
            <AlertDescription>
              Exported data does not include raw documents or embeddings. Only
              sanitized transaction data is exported.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Import Options */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Data
          </CardTitle>
          <CardDescription>Restore from a backup file</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionButton
            icon={Upload}
            label="Import Data"
            description="Import from CSV, JSON, or ZIP backup files"
            onClick={() => setShowImportDialog(true)}
          />
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions that affect your local data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Clearing local data will permanently delete all transactions,
              documents, and settings from this device. Cloud data will not be
              affected.
            </AlertDescription>
          </Alert>

          <Button
            variant="destructive"
            className="w-full"
            onClick={() => setShowClearDialog(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear All Local Data
          </Button>
        </CardContent>
      </Card>

      {/* Export Dialog */}
      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
      />

      {/* Import Dialog */}
      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
      />

      {/* Clear Data Dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear All Local Data</DialogTitle>
            <DialogDescription>
              This will permanently delete all transactions, documents,
              categories, budgets, and settings from your device. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Warning:</strong> All local data will be permanently
                deleted. Consider exporting a backup first.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="clear-confirmation">
                Type <strong>delete all data</strong> to confirm
              </Label>
              <Input
                id="clear-confirmation"
                value={clearConfirmation}
                onChange={(e) => setClearConfirmation(e.target.value)}
                placeholder="delete all data"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearData}
              disabled={clearConfirmation !== 'delete all data' || isClearing}
            >
              {isClearing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear All Data
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ExportSettings;
