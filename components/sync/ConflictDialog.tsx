/**
 * ConflictDialog Component for Vault-AI
 *
 * Shows a side-by-side comparison of conflicting transaction versions
 * and allows the user to choose which version to keep.
 */

'use client';

import * as React from 'react';
import { format } from 'date-fns';
import {
  Monitor,
  Cloud,
  ArrowRight,
  Clock,
  Check,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/index';
import {
  useConflicts,
  useConflictDiffs,
  useNewerVersion,
} from '@/hooks/useConflicts';
import type {
  DetailedConflict,
  TransactionVersion,
} from '@/lib/sync/conflict-resolver';
import type { AutoResolveStrategy } from '@/lib/sync/conflict-resolver';

// ============================================
// Types
// ============================================

interface ConflictDialogProps {
  /** Whether the dialog is controlled externally */
  open?: boolean;
  /** Callback when dialog open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Specific conflict to show (overrides hook state) */
  conflict?: DetailedConflict;
}

interface ConflictVersionProps {
  /** Version data to display */
  version: TransactionVersion;
  /** Title for this version */
  title: string;
  /** Icon to show */
  icon: React.ReactNode;
  /** Whether this is the newer version */
  isNewer?: boolean;
  /** Whether this version is selected */
  isSelected?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Fields that differ from the other version */
  differingFields?: string[];
}

interface FieldDiffRowProps {
  /** Field name */
  field: string;
  /** Display name for the field */
  displayName: string;
  /** Local value */
  localValue: string;
  /** Remote value */
  remoteValue: string;
}

// ============================================
// Helper Functions
// ============================================

function formatTimestamp(date: Date): string {
  return format(date, 'MMM d, yyyy h:mm a');
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return 'just now';
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return format(date, 'MMM d');
}

// ============================================
// Sub-Components
// ============================================

/**
 * Displays a single version of the transaction.
 */
function ConflictVersion({
  version,
  title,
  icon,
  isNewer,
  isSelected,
  onClick,
  differingFields = [],
}: ConflictVersionProps) {
  return (
    <div
      className={cn(
        'relative rounded-lg border p-4 transition-all',
        isSelected
          ? 'border-primary bg-primary/5 ring-2 ring-primary'
          : 'border-border hover:border-primary/50',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{title}</span>
        </div>
        {isNewer && (
          <Badge variant="secondary" className="text-xs">
            <Clock className="mr-1 h-3 w-3" />
            Newer
          </Badge>
        )}
      </div>

      {/* Transaction Details */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Date</span>
          <span
            className={cn(
              differingFields.includes('date') && 'font-medium text-primary'
            )}
          >
            {version.date}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">Vendor</span>
          <span
            className={cn(
              differingFields.includes('vendor') && 'font-medium text-primary'
            )}
          >
            {version.vendor || '(none)'}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">Amount</span>
          <span
            className={cn(
              'font-mono',
              differingFields.includes('amount') && 'font-medium text-primary'
            )}
          >
            ${version.amount.toFixed(2)} {version.currency}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">Category</span>
          <span
            className={cn(
              differingFields.includes('category') && 'font-medium text-primary'
            )}
          >
            {version.category || '(none)'}
          </span>
        </div>

        {version.note && (
          <div className="pt-1">
            <span className="text-muted-foreground">Note</span>
            <p
              className={cn(
                'mt-1 rounded bg-muted/50 p-2 text-xs',
                differingFields.includes('note') && 'border border-primary/30'
              )}
            >
              {version.note}
            </p>
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>Updated {getRelativeTime(version.updatedAt)}</span>
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute -right-2 -top-2 rounded-full bg-primary p-1">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}

/**
 * Displays a row comparing a field between two versions.
 */
function FieldDiffRow({
  displayName,
  localValue,
  remoteValue,
}: FieldDiffRowProps) {
  const isDifferent = localValue !== remoteValue;

  if (!isDifferent) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2 text-sm">
      <span className="w-20 text-muted-foreground">{displayName}</span>
      <span className="flex-1 text-center font-medium">{localValue}</span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 text-center font-medium">{remoteValue}</span>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

/**
 * Dialog for resolving sync conflicts.
 *
 * Shows a side-by-side comparison of local and remote versions
 * and allows the user to choose which version to keep.
 *
 * @example
 * ```tsx
 * function SyncConflictHandler() {
 *   return <ConflictDialog />;
 * }
 * ```
 */
export function ConflictDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  conflict: controlledConflict,
}: ConflictDialogProps) {
  const {
    selectedConflict: hookConflict,
    isDialogOpen: hookIsOpen,
    closeDialog,
    resolveSelected,
    unresolvedConflicts,
    unresolvedCount,
    isLoading,
  } = useConflicts();

  // Use controlled or hook state
  const isOpen = controlledOpen ?? hookIsOpen;
  const conflict = controlledConflict ?? hookConflict;
  const handleOpenChange =
    controlledOnOpenChange ??
    ((open: boolean) => {
      if (!open) {
        closeDialog();
      }
    });

  // Get field diffs and newer version
  const fieldDiffs = useConflictDiffs(conflict);
  const newerVersion = useNewerVersion(conflict);

  // Track which version is selected for preview
  const [previewSelection, setPreviewSelection] = React.useState<
    'local' | 'remote' | null
  >(null);

  // Current conflict index for navigation
  const currentIndex = conflict
    ? unresolvedConflicts.findIndex((c) => c.id === conflict.id)
    : -1;

  // Navigation handlers
  const handlePrevious = React.useCallback(() => {
    if (currentIndex > 0) {
      const prevConflict = unresolvedConflicts[currentIndex - 1];
      // Would need to update hook state - skip for now
    }
  }, [currentIndex, unresolvedConflicts]);

  const handleNext = React.useCallback(() => {
    if (currentIndex < unresolvedConflicts.length - 1) {
      const nextConflict = unresolvedConflicts[currentIndex + 1];
      // Would need to update hook state - skip for now
    }
  }, [currentIndex, unresolvedConflicts]);

  // Resolution handlers
  const handleResolveLocal = React.useCallback(async () => {
    await resolveSelected('local');
    setPreviewSelection(null);
  }, [resolveSelected]);

  const handleResolveRemote = React.useCallback(async () => {
    await resolveSelected('remote');
    setPreviewSelection(null);
  }, [resolveSelected]);

  const handleResolveNewest = React.useCallback(async () => {
    if (newerVersion) {
      await resolveSelected(newerVersion);
      setPreviewSelection(null);
    }
  }, [newerVersion, resolveSelected]);

  if (!conflict) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <DialogTitle>Sync Conflict Detected</DialogTitle>
          </div>
          <DialogDescription>
            The same transaction was modified on multiple devices. Choose which
            version to keep.
          </DialogDescription>

          {/* Conflict counter */}
          {unresolvedCount > 1 && (
            <div className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={currentIndex <= 0}
                onClick={handlePrevious}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>
                {currentIndex + 1} of {unresolvedCount} conflicts
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={currentIndex >= unresolvedCount - 1}
                onClick={handleNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogHeader>

        {/* Side-by-side comparison */}
        <div className="grid grid-cols-2 gap-4">
          <ConflictVersion
            title="This Device"
            version={conflict.localVersion}
            icon={<Monitor className="h-4 w-4 text-blue-500" />}
            isNewer={newerVersion === 'local'}
            isSelected={previewSelection === 'local'}
            onClick={() => setPreviewSelection('local')}
            differingFields={conflict.differingFields}
          />
          <ConflictVersion
            title="Other Device"
            version={conflict.remoteVersion}
            icon={<Cloud className="h-4 w-4 text-green-500" />}
            isNewer={newerVersion === 'remote'}
            isSelected={previewSelection === 'remote'}
            onClick={() => setPreviewSelection('remote')}
            differingFields={conflict.differingFields}
          />
        </div>

        {/* Field differences summary */}
        {fieldDiffs.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Changed fields:
            </p>
            <div className="flex flex-wrap gap-1">
              {fieldDiffs.map((diff) => (
                <Badge key={diff.field} variant="outline" className="text-xs">
                  {diff.displayName}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="mt-4 flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={handleResolveLocal}
            disabled={isLoading}
            className="flex-1"
          >
            <Monitor className="mr-2 h-4 w-4" />
            Keep Local
          </Button>
          <Button
            variant="outline"
            onClick={handleResolveRemote}
            disabled={isLoading}
            className="flex-1"
          >
            <Cloud className="mr-2 h-4 w-4" />
            Keep Remote
          </Button>
          <Button
            onClick={handleResolveNewest}
            disabled={isLoading}
            className="flex-1"
          >
            <Clock className="mr-2 h-4 w-4" />
            Keep Newest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Settings Component
// ============================================

interface ConflictSettingsProps {
  /** Current strategy */
  strategy: AutoResolveStrategy;
  /** Callback when strategy changes */
  onStrategyChange: (strategy: AutoResolveStrategy) => void;
}

/**
 * Settings panel for conflict resolution.
 */
export function ConflictSettings({
  strategy,
  onStrategyChange,
}: ConflictSettingsProps) {
  const strategies: {
    value: AutoResolveStrategy;
    label: string;
    description: string;
  }[] = [
    {
      value: 'ask',
      label: 'Ask me',
      description: 'Show dialog to choose which version to keep',
    },
    {
      value: 'newest',
      label: 'Keep newest',
      description: 'Automatically keep the most recently updated version',
    },
    {
      value: 'local',
      label: 'Always keep local',
      description: 'Always prefer changes made on this device',
    },
    {
      value: 'remote',
      label: 'Always keep remote',
      description: 'Always prefer changes from other devices',
    },
  ];

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-medium">Conflict Resolution</h4>
        <p className="text-xs text-muted-foreground">
          Choose how to handle conflicts when the same transaction is edited on
          multiple devices
        </p>
      </div>

      <div className="space-y-2">
        {strategies.map(({ value, label, description }) => (
          <label
            key={value}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              strategy === value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50'
            )}
          >
            <input
              type="radio"
              name="conflict-strategy"
              value={value}
              checked={strategy === value}
              onChange={() => onStrategyChange(value)}
              className="mt-0.5"
            />
            <div>
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs text-muted-foreground">{description}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

export default ConflictDialog;
