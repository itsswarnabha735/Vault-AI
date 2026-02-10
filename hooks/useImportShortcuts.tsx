/**
 * useImportShortcuts Hook
 *
 * Keyboard shortcuts for document import functionality.
 * Supports Cmd/Ctrl + I for import and Cmd/Ctrl + U for quick upload.
 */

'use client';

import { useEffect, useCallback, useRef } from 'react';
import { create } from 'zustand';

// ============================================
// Types
// ============================================

export interface ImportShortcutsOptions {
  /** Handler for import shortcut (Cmd/Ctrl + I) */
  onImport?: () => void;

  /** Handler for quick upload shortcut (Cmd/Ctrl + U) */
  onQuickUpload?: () => void;

  /** Whether shortcuts are enabled */
  enabled?: boolean;

  /** Prevent shortcuts when input is focused */
  preventOnInput?: boolean;
}

export interface UseImportShortcutsReturn {
  /** Currently pressed keys (for UI display) */
  pressedKeys: Set<string>;
}

// ============================================
// Hook
// ============================================

/**
 * Hook for document import keyboard shortcuts.
 *
 * @example
 * ```tsx
 * useImportShortcuts({
 *   onImport: () => setImportModalOpen(true),
 *   onQuickUpload: () => fileInputRef.current?.click(),
 * });
 * ```
 */
export function useImportShortcuts(
  options: ImportShortcutsOptions = {}
): UseImportShortcutsReturn {
  const {
    onImport,
    onQuickUpload,
    enabled = true,
    preventOnInput = true,
  } = options;

  const pressedKeysRef = useRef<Set<string>>(new Set());

  // Check if we should prevent shortcut
  const shouldPrevent = useCallback(
    (event: KeyboardEvent): boolean => {
      if (!preventOnInput) {
        return false;
      }

      const target = event.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();

      // Prevent if focused on input elements
      if (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target.isContentEditable
      ) {
        return true;
      }

      return false;
    },
    [preventOnInput]
  );

  // Handle keydown
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) {
        return;
      }

      pressedKeysRef.current.add(event.key.toLowerCase());

      // Check for modifier key (Cmd on Mac, Ctrl on Windows/Linux)
      const modifier = event.metaKey || event.ctrlKey;

      if (!modifier) {
        return;
      }
      if (shouldPrevent(event)) {
        return;
      }

      // Cmd/Ctrl + I - Import
      if (event.key.toLowerCase() === 'i') {
        event.preventDefault();
        onImport?.();
        return;
      }

      // Cmd/Ctrl + U - Quick Upload
      if (event.key.toLowerCase() === 'u') {
        event.preventDefault();
        onQuickUpload?.();
        return;
      }
    },
    [enabled, onImport, onQuickUpload, shouldPrevent]
  );

  // Handle keyup
  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    pressedKeysRef.current.delete(event.key.toLowerCase());
  }, []);

  // Handle blur (reset pressed keys)
  const handleBlur = useCallback(() => {
    pressedKeysRef.current.clear();
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (!enabled) {
      return;
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [enabled, handleKeyDown, handleKeyUp, handleBlur]);

  return {
    pressedKeys: pressedKeysRef.current,
  };
}

// ============================================
// Shortcut Hints Component
// ============================================

export interface ShortcutHintsProps {
  /** Whether to show hints */
  show?: boolean;

  /** Position of hints */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

  /** Custom class name */
  className?: string;
}

/**
 * Component to display keyboard shortcut hints.
 */
export function ShortcutHints({
  show = true,
  position = 'bottom-right',
  className,
}: ShortcutHintsProps) {
  if (!show) {
    return null;
  }

  const isMac =
    typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
  const modKey = isMac ? '⌘' : 'Ctrl';

  const positionClasses: Record<string, string> = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  };

  const baseClasses =
    'fixed z-50 flex flex-col gap-1 rounded-lg border border-border bg-background/95 p-2 text-xs shadow-lg backdrop-blur';
  const posClass = positionClasses[position] || positionClasses['bottom-right'];

  return (
    <div className={`${baseClasses} ${posClass} ${className || ''}`}>
      <div className="flex items-center gap-2">
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
          {modKey}
        </kbd>
        <span>+</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
          I
        </kbd>
        <span className="text-muted-foreground">Import documents</span>
      </div>
      <div className="flex items-center gap-2">
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
          {modKey}
        </kbd>
        <span>+</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
          U
        </kbd>
        <span className="text-muted-foreground">Quick upload</span>
      </div>
    </div>
  );
}

// ============================================
// Global Import Modal State Hook
// ============================================

interface ImportModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/**
 * Global state for import modal.
 * Use this to control the import modal from anywhere in the app.
 */
export const useImportModalStore = create<ImportModalState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));

/**
 * Convenience hook that combines import shortcuts with modal state.
 *
 * @example
 * ```tsx
 * function AppLayout() {
 *   const { isOpen, open, close } = useImportModal();
 *
 *   return (
 *     <>
 *       <ImportModal open={isOpen} onClose={close} />
 *       <Button onClick={open}>Import</Button>
 *     </>
 *   );
 * }
 * ```
 */
export function useImportModal() {
  const store = useImportModalStore();

  // Set up keyboard shortcuts
  useImportShortcuts({
    onImport: store.open,
    enabled: true,
  });

  return store;
}

export default useImportShortcuts;
