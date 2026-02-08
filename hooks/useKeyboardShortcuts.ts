/**
 * Keyboard Shortcuts Hook for Vault-AI
 *
 * Provides global keyboard shortcut handling for the application.
 * Supports platform-specific modifiers (Cmd on Mac, Ctrl on Windows/Linux).
 */

'use client';

import { useEffect, useCallback, useRef } from 'react';

// ============================================
// Types
// ============================================

export interface ShortcutConfig {
  /** Keyboard key (e.g., 'i', 'u', 'k') */
  key: string;

  /** Require Cmd (Mac) or Ctrl (Windows/Linux) */
  cmdOrCtrl?: boolean;

  /** Require Shift key */
  shift?: boolean;

  /** Require Alt/Option key */
  alt?: boolean;

  /** Handler function */
  handler: (event: KeyboardEvent) => void;

  /** Description for help/accessibility */
  description?: string;

  /** Whether to prevent default behavior */
  preventDefault?: boolean;

  /** Whether shortcut is enabled */
  enabled?: boolean;
}

export interface UseKeyboardShortcutsOptions {
  /** Whether shortcuts are globally enabled */
  enabled?: boolean;

  /** Elements to exclude (e.g., don't trigger when typing in inputs) */
  excludeSelectors?: string[];
}

// ============================================
// Hook
// ============================================

/**
 * Hook for registering keyboard shortcuts.
 *
 * @param shortcuts - Array of shortcut configurations
 * @param options - Hook options
 *
 * @example
 * ```tsx
 * useKeyboardShortcuts([
 *   {
 *     key: 'i',
 *     cmdOrCtrl: true,
 *     handler: () => setImportOpen(true),
 *     description: 'Open import modal',
 *   },
 *   {
 *     key: 'k',
 *     cmdOrCtrl: true,
 *     handler: () => focusSearch(),
 *     description: 'Focus search',
 *   },
 * ]);
 * ```
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutConfig[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const {
    enabled = true,
    excludeSelectors = [
      'input',
      'textarea',
      'select',
      '[contenteditable="true"]',
    ],
  } = options;

  // Store shortcuts in ref to avoid stale closures
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Check if we should exclude this element
      const target = event.target as HTMLElement;
      const shouldExclude = excludeSelectors.some((selector) =>
        target.matches(selector)
      );

      if (shouldExclude) {
        // Still allow Escape key to work in inputs
        if (event.key !== 'Escape') {
          return;
        }
      }

      // Detect platform
      const isMac =
        typeof navigator !== 'undefined' &&
        navigator.platform.toLowerCase().includes('mac');

      // Check each shortcut
      for (const shortcut of shortcutsRef.current) {
        // Skip if shortcut is disabled
        if (shortcut.enabled === false) continue;

        // Check key match (case-insensitive)
        if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) continue;

        // Check modifiers
        const cmdOrCtrlPressed = isMac ? event.metaKey : event.ctrlKey;
        const cmdOrCtrlRequired = shortcut.cmdOrCtrl ?? false;

        if (cmdOrCtrlRequired && !cmdOrCtrlPressed) continue;
        if (!cmdOrCtrlRequired && cmdOrCtrlPressed) continue;

        const shiftRequired = shortcut.shift ?? false;
        if (shiftRequired !== event.shiftKey) continue;

        const altRequired = shortcut.alt ?? false;
        if (altRequired !== event.altKey) continue;

        // Match found - execute handler
        if (shortcut.preventDefault !== false) {
          event.preventDefault();
        }

        shortcut.handler(event);
        break;
      }
    },
    [enabled, excludeSelectors]
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);
}

// ============================================
// Preset Shortcut Hooks
// ============================================

/**
 * Hook for Vault-AI specific shortcuts.
 *
 * @param handlers - Object with handler functions
 */
export function useVaultShortcuts(handlers: {
  onImport?: () => void;
  onSearch?: () => void;
  onNewTransaction?: () => void;
  onToggleChat?: () => void;
}) {
  const shortcuts: ShortcutConfig[] = [];

  if (handlers.onImport) {
    shortcuts.push({
      key: 'i',
      cmdOrCtrl: true,
      handler: handlers.onImport,
      description: 'Open import modal',
    });

    // Also support Cmd/Ctrl + U for upload (alias)
    shortcuts.push({
      key: 'u',
      cmdOrCtrl: true,
      handler: handlers.onImport,
      description: 'Quick upload',
    });
  }

  if (handlers.onSearch) {
    shortcuts.push({
      key: 'k',
      cmdOrCtrl: true,
      handler: handlers.onSearch,
      description: 'Focus search',
    });

    // Also support / for search
    shortcuts.push({
      key: '/',
      handler: handlers.onSearch,
      description: 'Focus search',
    });
  }

  if (handlers.onNewTransaction) {
    shortcuts.push({
      key: 'n',
      cmdOrCtrl: true,
      handler: handlers.onNewTransaction,
      description: 'New transaction',
    });
  }

  if (handlers.onToggleChat) {
    shortcuts.push({
      key: 'j',
      cmdOrCtrl: true,
      handler: handlers.onToggleChat,
      description: 'Toggle chat',
    });
  }

  useKeyboardShortcuts(shortcuts);
}

// ============================================
// Utility: Get Shortcut Display String
// ============================================

/**
 * Get display string for a shortcut (e.g., "⌘I" or "Ctrl+I").
 */
export function getShortcutDisplay(shortcut: ShortcutConfig): string {
  const isMac =
    typeof navigator !== 'undefined' &&
    navigator.platform.toLowerCase().includes('mac');

  const parts: string[] = [];

  if (shortcut.cmdOrCtrl) {
    parts.push(isMac ? '⌘' : 'Ctrl');
  }

  if (shortcut.shift) {
    parts.push(isMac ? '⇧' : 'Shift');
  }

  if (shortcut.alt) {
    parts.push(isMac ? '⌥' : 'Alt');
  }

  parts.push(shortcut.key.toUpperCase());

  return isMac ? parts.join('') : parts.join('+');
}

/**
 * Get all registered shortcuts with their display strings.
 */
export function getShortcutsList(): Array<{
  key: string;
  description: string;
  display: string;
}> {
  const isMac =
    typeof navigator !== 'undefined' &&
    navigator.platform.toLowerCase().includes('mac');

  return [
    {
      key: 'import',
      description: 'Open import modal',
      display: isMac ? '⌘I' : 'Ctrl+I',
    },
    {
      key: 'upload',
      description: 'Quick upload',
      display: isMac ? '⌘U' : 'Ctrl+U',
    },
    {
      key: 'search',
      description: 'Focus search',
      display: isMac ? '⌘K' : 'Ctrl+K',
    },
    {
      key: 'new',
      description: 'New transaction',
      display: isMac ? '⌘N' : 'Ctrl+N',
    },
    {
      key: 'chat',
      description: 'Toggle chat',
      display: isMac ? '⌘J' : 'Ctrl+J',
    },
  ];
}

export default useKeyboardShortcuts;
