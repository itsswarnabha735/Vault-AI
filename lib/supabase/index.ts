/**
 * Supabase Client Exports
 *
 * Re-exports all Supabase client utilities for easy importing.
 */

// Browser client (for Client Components)
export { createClient, getClient, type SupabaseBrowserClient } from './client';

// Server clients (for Server Components and Route Handlers)
export {
  createClient as createServerClient,
  createRouteHandlerClient,
  createAdminClient,
  type SupabaseServerClient,
} from './server';

// Middleware utilities
export {
  updateSession,
  publicRoutes,
  protectedRoutePrefixes,
  isProtectedRoute,
  isPublicRoute,
  type UpdateSessionResult,
} from './middleware';
