'use client';

import { type ReactNode } from 'react';
import { AuthProvider } from './AuthProvider';
import { SyncProvider } from './SyncProvider';

/**
 * Props for the Providers component
 */
interface ProvidersProps {
  children: ReactNode;
}

/**
 * Root Providers Component
 *
 * Wraps the application with all necessary providers.
 * Add new providers here in the correct nesting order.
 *
 * Current providers:
 * 1. AuthProvider - Supabase authentication
 * 2. SyncProvider - Cloud sync engine (depends on auth)
 *
 * Future providers to add:
 * - QueryClientProvider (TanStack Query)
 * - LocalBrainProvider (ML models)
 * - ThemeProvider (Dark mode)
 *
 * @example
 * ```tsx
 * // In app/layout.tsx
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <Providers>
 *           {children}
 *         </Providers>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <SyncProvider>
        {children}
      </SyncProvider>
    </AuthProvider>
  );
}

export default Providers;
