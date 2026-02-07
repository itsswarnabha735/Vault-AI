'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

// ============================================
// Types
// ============================================

/**
 * Auth context value interface
 */
export interface AuthContextValue {
  /** Current authenticated user */
  user: User | null;
  /** Current session */
  session: Session | null;
  /** Whether auth state is loading */
  isLoading: boolean;
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Auth error if any */
  error: AuthError | null;
  /** Sign in with email magic link */
  signInWithEmail: (
    email: string,
    redirectTo?: string
  ) => Promise<{ error: AuthError | null }>;
  /** Sign out the current user */
  signOut: () => Promise<{ error: AuthError | null }>;
  /** Refresh the current session */
  refreshSession: () => Promise<void>;
}

/**
 * Auth provider props
 */
interface AuthProviderProps {
  children: ReactNode;
}

// ============================================
// Context
// ============================================

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ============================================
// Provider Component
// ============================================

/**
 * Auth Provider Component
 *
 * Provides authentication state and actions to the entire application.
 * Handles session management, auth state changes, and provides
 * sign in/out functionality.
 *
 * @example
 * ```tsx
 * // In app/layout.tsx
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <AuthProvider>
 *           {children}
 *         </AuthProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const isAuthenticated = !!user;

  /**
   * Refresh the current session
   */
  const refreshSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const {
        data: { session: currentSession },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        setError(sessionError);
        setUser(null);
        setSession(null);
      } else {
        setUser(currentSession?.user ?? null);
        setSession(currentSession);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to refresh session:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase.auth]);

  /**
   * Sign in with email magic link
   */
  const signInWithEmail = useCallback(
    async (
      email: string,
      redirectTo = '/vault'
    ): Promise<{ error: AuthError | null }> => {
      setIsLoading(true);
      setError(null);

      try {
        const { error: signInError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
          },
        });

        if (signInError) {
          setError(signInError);
        }

        return { error: signInError ?? null };
      } finally {
        setIsLoading(false);
      }
    },
    [supabase.auth]
  );

  /**
   * Sign out the current user
   */
  const signOut = useCallback(async (): Promise<{
    error: AuthError | null;
  }> => {
    setIsLoading(true);

    try {
      const { error: signOutError } = await supabase.auth.signOut();

      if (!signOutError) {
        setUser(null);
        setSession(null);
        setError(null);
        router.push('/login');
        router.refresh();
      } else {
        setError(signOutError);
      }

      return { error: signOutError ?? null };
    } finally {
      setIsLoading(false);
    }
  }, [supabase.auth, router]);

  // Initialize auth state and listen for changes
  useEffect(() => {
    // Get initial session
    refreshSession();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      setUser(currentSession?.user ?? null);
      setSession(currentSession);
      setIsLoading(false);

      // Handle specific auth events
      switch (event) {
        case 'SIGNED_IN':
          router.refresh();
          break;
        case 'SIGNED_OUT':
          router.push('/login');
          router.refresh();
          break;
        case 'TOKEN_REFRESHED':
          // Session was automatically refreshed - no action needed
          break;
        case 'USER_UPDATED':
          router.refresh();
          break;
      }
    });

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, [supabase.auth, refreshSession, router]);

  // Context value
  const value: AuthContextValue = {
    user,
    session,
    isLoading,
    isAuthenticated,
    error,
    signInWithEmail,
    signOut,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================
// Hook
// ============================================

/**
 * Hook to access the auth context
 *
 * @returns Auth context value
 * @throws Error if used outside of AuthProvider
 *
 * @example
 * ```tsx
 * function UserMenu() {
 *   const { user, signOut, isLoading } = useAuthContext();
 *
 *   if (isLoading) return <Skeleton />;
 *   if (!user) return null;
 *
 *   return (
 *     <div>
 *       <span>{user.email}</span>
 *       <button onClick={() => signOut()}>Sign Out</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }

  return context;
}

// ============================================
// Convenience Hooks
// ============================================

/**
 * Hook to get just the current user
 */
export function useCurrentUser(): { user: User | null; isLoading: boolean } {
  const { user, isLoading } = useAuthContext();
  return { user, isLoading };
}

/**
 * Hook to check if user is authenticated
 */
export function useIsUserAuthenticated(): boolean {
  const { isAuthenticated, isLoading } = useAuthContext();
  return !isLoading && isAuthenticated;
}

/**
 * Hook to require authentication (redirects if not authenticated)
 */
export function useRequireAuth(): AuthContextValue {
  const auth = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      router.push('/login');
    }
  }, [auth.isLoading, auth.isAuthenticated, router]);

  return auth;
}

export default AuthProvider;
