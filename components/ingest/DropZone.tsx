/**
 * DropZone Component
 *
 * File drop area for document import.
 * Supports drag-and-drop and file browser selection.
 */

'use client';

import { useCallback, useState } from 'react';
import { cn, formatFileSize } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ============================================
// Types
// ============================================

export interface DropZoneProps {
  /** Callback when files are selected */
  onFilesSelected: (files: File[]) => void;

  /** Maximum file size in bytes */
  maxFileSize?: number;

  /** Accepted file types */
  accept?: Record<string, string[]>;

  /** Maximum number of files */
  maxFiles?: number;

  /** Whether to allow multiple files */
  multiple?: boolean;

  /** Whether the drop zone is disabled */
  disabled?: boolean;

  /** Custom class name */
  className?: string;
}

// Default accepted file types
const DEFAULT_ACCEPT = {
  'application/pdf': ['.pdf'],
  'image/*': ['.png', '.jpg', '.jpeg', '.heic', '.webp'],
};

// Default max file size: 25MB
const DEFAULT_MAX_SIZE = 25 * 1024 * 1024;

// ============================================
// Component
// ============================================

/**
 * File drop zone for document import.
 *
 * @example
 * ```tsx
 * <DropZone
 *   onFilesSelected={(files) => processFiles(files)}
 *   maxFileSize={25 * 1024 * 1024}
 * />
 * ```
 */
export function DropZone({
  onFilesSelected,
  maxFileSize = DEFAULT_MAX_SIZE,
  accept = DEFAULT_ACCEPT,
  maxFiles = 20,
  multiple = true,
  disabled = false,
  className,
}: DropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);

  // Get accepted extensions for display
  const acceptedExtensions = Object.values(accept)
    .flat()
    .join(', ')
    .replace(/\./g, '')
    .toUpperCase();

  // Validate files
  const validateFiles = useCallback(
    (files: File[]): { valid: File[]; errors: string[] } => {
      const valid: File[] = [];
      const errors: string[] = [];

      // Check max files
      if (files.length > maxFiles) {
        errors.push(`Maximum ${maxFiles} files allowed`);
        return { valid: [], errors };
      }

      for (const file of files) {
        // Check file size
        if (file.size > maxFileSize) {
          errors.push(
            `${file.name} exceeds ${formatFileSize(maxFileSize)} limit`
          );
          continue;
        }

        // Check file type
        const isValidType = Object.entries(accept).some(
          ([mimeType, extensions]) => {
            if (mimeType.includes('*')) {
              const baseType = mimeType.split('/')[0];
              return file.type.startsWith(`${baseType}/`);
            }
            if (file.type === mimeType) {
              return true;
            }
            const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
            return extensions.includes(ext);
          }
        );

        if (!isValidType) {
          errors.push(`${file.name} is not a supported file type`);
          continue;
        }

        valid.push(file);
      }

      return { valid, errors };
    },
    [accept, maxFileSize, maxFiles]
  );

  // Handle drag events
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragActive(true);
        setDragError(null);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);

      if (disabled) {
        return;
      }

      const droppedFiles = Array.from(e.dataTransfer.files);
      const { valid, errors } = validateFiles(droppedFiles);

      if (errors.length > 0) {
        setDragError(errors[0] || 'Invalid files');
        return;
      }

      if (valid.length > 0) {
        onFilesSelected(valid);
      }
    },
    [disabled, validateFiles, onFilesSelected]
  );

  // Handle file input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      const { valid, errors } = validateFiles(selectedFiles);

      if (errors.length > 0) {
        setDragError(errors[0] || 'Invalid files');
        return;
      }

      if (valid.length > 0) {
        onFilesSelected(valid);
      }

      // Reset input value to allow selecting same files again
      e.target.value = '';
    },
    [validateFiles, onFilesSelected]
  );

  // Build accept string for input
  const inputAccept = Object.entries(accept)
    .flatMap(([mimeType, extensions]) => [mimeType, ...extensions])
    .join(',');

  return (
    <div className={cn('space-y-2', className)}>
      {/* Drop zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors',
          disabled
            ? 'cursor-not-allowed border-muted-foreground/20 bg-muted/50'
            : isDragActive
              ? 'cursor-copy border-primary bg-primary/5'
              : 'cursor-pointer border-muted-foreground/25 hover:border-primary/50'
        )}
      >
        {/* Hidden file input */}
        <input
          type="file"
          accept={inputAccept}
          multiple={multiple}
          onChange={handleInputChange}
          disabled={disabled}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Upload files"
        />

        {/* Upload icon */}
        <UploadIcon
          className={cn(
            'h-12 w-12 transition-colors',
            isDragActive ? 'text-primary' : 'text-muted-foreground'
          )}
        />

        {/* Text */}
        <p className="mt-4 text-lg font-medium text-foreground">
          {isDragActive
            ? 'Drop files here'
            : 'Drag & drop receipts, invoices, or documents'}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {acceptedExtensions} up to {formatFileSize(maxFileSize)} each
        </p>

        {/* Browse button */}
        <Button
          variant="outline"
          className="mt-4"
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
        >
          Or browse files
        </Button>

        {/* Privacy note */}
        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldIcon className="h-3.5 w-3.5 text-green-500" />
          <span>
            Files are processed locally and never uploaded to any server
          </span>
        </div>
      </div>

      {/* Error message */}
      {dragError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <AlertIcon className="h-4 w-4 shrink-0" />
          <span>{dragError}</span>
          <button
            type="button"
            onClick={() => setDragError(null)}
            className="ml-auto rounded-full p-0.5 hover:bg-destructive/20"
            aria-label="Dismiss error"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Compact Drop Zone
// ============================================

export interface CompactDropZoneProps extends DropZoneProps {
  /** Label text */
  label?: string;
}

/**
 * Compact inline drop zone.
 */
export function CompactDropZone({
  onFilesSelected,
  label = 'Drop files or click to upload',
  disabled = false,
  className,
}: CompactDropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 rounded-lg border border-dashed p-4 transition-colors',
        disabled
          ? 'cursor-not-allowed border-muted-foreground/20 bg-muted/50'
          : isDragActive
            ? 'border-primary bg-primary/5'
            : 'cursor-pointer border-muted-foreground/25 hover:border-primary/50',
        className
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) {
          setIsDragActive(true);
        }
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragActive(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragActive(false);
        if (!disabled) {
          onFilesSelected(Array.from(e.dataTransfer.files));
        }
      }}
    >
      <input
        type="file"
        multiple
        onChange={(e) => onFilesSelected(Array.from(e.target.files || []))}
        disabled={disabled}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Upload files"
      />

      <UploadIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

// ============================================
// Icons
// ============================================

function UploadIcon({ className }: { className?: string }) {
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
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
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

function AlertIcon({ className }: { className?: string }) {
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

export default DropZone;
