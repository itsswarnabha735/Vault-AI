'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

/**
 * Auth state interface
 */
export interface AuthState {
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
}

/**
 * Auth actions interface
 */
export interface AuthActions {
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
 * Combined auth hook return type
 */
export type UseAuthReturn = AuthState & AuthActions;

/**
 * Authentication hook for Vault-AI
 *
 * Provides:
 * - Current user and session state
 * - Sign in/out functions
 * - Loading and error states
 * - Automatic session refresh
 *
 * @returns Auth state and actions
 *
 * @example
 * ```tsx
 * function ProfileButton() {
 *   const { user, isLoading, signOut } = useAuth();
 *
 *   if (isLoading) return <Spinner />;
 *   if (!user) return <LoginButton />;
 *
 *   return (
 *     <button onClick={() => signOut()}>
 *       {user.email}
 *     </button>
 *   );
 * }
 * ```
 */
export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  const router = useRouter();
  const supabase = createClient();

  /**
   * Fetch and set the current session
   */
  const refreshSession = useCallback(async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        setState((prev) => ({
          ...prev,
          user: null,
          session: null,
          isAuthenticated: false,
          error,
          isLoading: false,
        }));
        return;
      }

      setState({
        user: session?.user ?? null,
        session,
        isLoading: false,
        isAuthenticated: !!session?.user,
        error: null,
      });
    } catch (err) {
      console.error('Failed to refresh session:', err);
      setState((prev) => ({
        ...prev,
        isLoading: false,
      }));
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
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
        },
      });

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error ?? null,
      }));

      return { error: error ?? null };
    },
    [supabase.auth]
  );

  /**
   * Sign out the current user
   */
  const signOut = useCallback(async (): Promise<{
    error: AuthError | null;
  }> => {
    setState((prev) => ({ ...prev, isLoading: true }));

    const { error } = await supabase.auth.signOut();

    if (!error) {
      setState({
        user: null,
        session: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      });
      router.push('/login');
      router.refresh();
    } else {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error,
      }));
    }

    return { error: error ?? null };
  }, [supabase.auth, router]);

  // Initialize auth state and listen for changes
  useEffect(() => {
    // Get initial session
    refreshSession();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setState((prev) => ({
        ...prev,
        user: session?.user ?? null,
        session,
        isAuthenticated: !!session?.user,
        isLoading: false,
      }));

      // Handle specific auth events
      if (event === 'SIGNED_IN') {
        router.refresh();
      } else if (event === 'SIGNED_OUT') {
        router.push('/login');
        router.refresh();
      } else if (event === 'TOKEN_REFRESHED') {
        // Session was automatically refreshed
      } else if (event === 'USER_UPDATED') {
        router.refresh();
      }
    });

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, [supabase.auth, refreshSession, router]);

  return {
    ...state,
    signInWithEmail,
    signOut,
    refreshSession,
  };
}

/**
 * Hook to get just the current user (optimized for simple use cases)
 */
export function useUser(): { user: User | null; isLoading: boolean } {
  const { user, isLoading } = useAuth();
  return { user, isLoading };
}

/**
 * Hook to check if user is authenticated
 */
export function useIsAuthenticated(): boolean {
  const { isAuthenticated, isLoading } = useAuth();
  return !isLoading && isAuthenticated;
}

export default useAuth;
