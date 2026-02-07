/**
 * Keyboard Shortcuts Provider
 *
 * Provides global keyboard shortcuts and import modal context
 * throughout the application.
 */

'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ImportModal } from '@/components/ingest';
import {
  useVaultShortcuts,
  getShortcutsList,
} from '@/hooks/useKeyboardShortcuts';
import type { TransactionId } from '@/types/database';

// ============================================
// Types
// ============================================

interface KeyboardShortcutsContextValue {
  /** Open the import modal */
  openImport: () => void;

  /** Close the import modal */
  closeImport: () => void;

  /** Whether the import modal is open */
  isImportOpen: boolean;

  /** Focus the search bar (if available) */
  focusSearch: () => void;

  /** Navigate to chat */
  navigateToChat: () => void;

  /** Get list of available shortcuts */
  shortcuts: ReturnType<typeof getShortcutsList>;
}

const KeyboardShortcutsContext =
  createContext<KeyboardShortcutsContextValue | null>(null);

// ============================================
// Provider
// ============================================

interface KeyboardShortcutsProviderProps {
  children: ReactNode;
}

/**
 * Provider for keyboard shortcuts and import modal.
 *
 * @example
 * ```tsx
 * // In layout.tsx
 * <KeyboardShortcutsProvider>
 *   {children}
 * </KeyboardShortcutsProvider>
 *
 * // In component
 * const { openImport } = useKeyboardShortcutsContext();
 * ```
 */
export function KeyboardShortcutsProvider({
  children,
}: KeyboardShortcutsProviderProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Import modal state
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Handlers
  const openImport = useCallback(() => {
    setIsImportOpen(true);
  }, []);

  const closeImport = useCallback(() => {
    setIsImportOpen(false);
  }, []);

  const focusSearch = useCallback(() => {
    // Try to find and focus the search input
    const searchInput = document.querySelector<HTMLInputElement>(
      '[data-search-input], input[placeholder*="Search"], input[type="search"]'
    );

    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    } else {
      // If not on vault page, navigate there
      if (pathname !== '/vault') {
        router.push('/vault');
      }
    }
  }, [pathname, router]);

  const navigateToChat = useCallback(() => {
    if (pathname !== '/chat') {
      router.push('/chat');
    }
  }, [pathname, router]);

  // Register keyboard shortcuts
  useVaultShortcuts({
    onImport: openImport,
    onSearch: focusSearch,
    onToggleChat: navigateToChat,
  });

  // Handle import success
  const handleImportSuccess = useCallback((transactionIds: TransactionId[]) => {
    console.log('Imported transactions:', transactionIds.length);
  }, []);

  // Context value
  const value = useMemo(
    () => ({
      openImport,
      closeImport,
      isImportOpen,
      focusSearch,
      navigateToChat,
      shortcuts: getShortcutsList(),
    }),
    [openImport, closeImport, isImportOpen, focusSearch, navigateToChat]
  );

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}

      {/* Import Modal */}
      <ImportModal
        open={isImportOpen}
        onClose={closeImport}
        onSuccess={handleImportSuccess}
      />
    </KeyboardShortcutsContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

/**
 * Hook to access keyboard shortcuts context.
 *
 * @throws Error if used outside of KeyboardShortcutsProvider
 */
export function useKeyboardShortcutsContext(): KeyboardShortcutsContextValue {
  const context = useContext(KeyboardShortcutsContext);

  if (!context) {
    throw new Error(
      'useKeyboardShortcutsContext must be used within a KeyboardShortcutsProvider'
    );
  }

  return context;
}

/**
 * Optional hook that returns null if not in provider context.
 * Useful for components that may be used outside the provider.
 */
export function useKeyboardShortcutsContextOptional(): KeyboardShortcutsContextValue | null {
  return useContext(KeyboardShortcutsContext);
}

export default KeyboardShortcutsProvider;
