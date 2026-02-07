'use client';

import { type ReactNode } from 'react';
import { AuthProvider } from './AuthProvider';

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
 *
 * Future providers to add:
 * - QueryClientProvider (TanStack Query)
 * - LocalBrainProvider (ML models)
 * - SyncProvider (Cloud sync)
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
      {/* Add more providers here as needed */}
      {/* <QueryClientProvider client={queryClient}> */}
      {/* <ThemeProvider> */}
      {children}
      {/* </ThemeProvider> */}
      {/* </QueryClientProvider> */}
    </AuthProvider>
  );
}

export default Providers;
