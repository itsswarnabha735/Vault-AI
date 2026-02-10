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
  /** Sign in with email and password */
  signInWithPassword: (
    email: string,
    password: string
  ) => Promise<{ error: AuthError | null }>;
  /** Sign up with email and password */
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: AuthError | null }>;
  /** Sign out the current user */
  signOut: () => Promise<{ error: AuthError | null }>;
  /** Request password reset email */
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  /** Update user password */
  updatePassword: (newPassword: string) => Promise<{ error: AuthError | null }>;
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
 * sign in/out functionality with password-based authentication.
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
   * Sign in with email and password
   */
  const signInWithPassword = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ error: AuthError | null }> => {
      setIsLoading(true);
      setError(null);

      try {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
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
   * Sign up with email and password
   */
  const signUp = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ error: AuthError | null }> => {
      setIsLoading(true);
      setError(null);

      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${appUrl}/callback`,
          },
        });

        if (signUpError) {
          setError(signUpError);
        }

        return { error: signUpError ?? null };
      } finally {
        setIsLoading(false);
      }
    },
    [supabase.auth]
  );

  /**
   * Request password reset email
   */
  const resetPassword = useCallback(
    async (email: string): Promise<{ error: AuthError | null }> => {
      setIsLoading(true);
      setError(null);

      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: `${appUrl}/reset-password`,
          }
        );

        if (resetError) {
          setError(resetError);
        }

        return { error: resetError ?? null };
      } finally {
        setIsLoading(false);
      }
    },
    [supabase.auth]
  );

  /**
   * Update user password
   */
  const updatePassword = useCallback(
    async (newPassword: string): Promise<{ error: AuthError | null }> => {
      setIsLoading(true);
      setError(null);

      try {
        const { error: updateError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (updateError) {
          setError(updateError);
        }

        return { error: updateError ?? null };
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
        case 'PASSWORD_RECOVERY':
          // User clicked password reset link
          router.push('/reset-password');
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
    signInWithPassword,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
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
