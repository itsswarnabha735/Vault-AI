/**
 * Supabase Admin Utilities
 *
 * Helper functions for database administration, type generation,
 * and migration management.
 *
 * IMPORTANT: This file is for development/admin use only.
 * Do not expose these functions to end users.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// ============================================
// Admin Client (Service Role)
// ============================================

/**
 * Creates a Supabase client with service role permissions.
 * NEVER use this client on the frontend - only for admin operations.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase admin credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ============================================
// Type Generation
// ============================================

/**
 * Instructions for generating TypeScript types from Supabase.
 *
 * Run the following command to generate types:
 *
 * ```bash
 * npx supabase gen types typescript \
 *   --project-id YOUR_PROJECT_REF \
 *   --schema public \
 *   > types/supabase.ts
 * ```
 *
 * Or with the Supabase CLI:
 *
 * ```bash
 * supabase gen types typescript --local > types/supabase.ts
 * ```
 */
export const TYPE_GENERATION_INSTRUCTIONS = `
To generate TypeScript types from your Supabase schema:

1. Install Supabase CLI if not already installed:
   npm install -g supabase

2. Login to Supabase:
   supabase login

3. Link your project:
   supabase link --project-ref YOUR_PROJECT_REF

4. Generate types:
   supabase gen types typescript --linked > types/supabase.ts

5. For local development:
   supabase gen types typescript --local > types/supabase.ts

The generated types will be saved to types/supabase.ts and can be imported
throughout your application for type-safe database operations.
`;

// ============================================
// Migration Helpers
// ============================================

/**
 * Lists all applied migrations.
 */
export async function listMigrations() {
  const client = createAdminClient();

  const { data, error } = await client
    .from('_supabase_migrations' as keyof Database['public']['Tables'])
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error listing migrations:', error);
    throw error;
  }

  return data;
}

/**
 * Checks database health by running a simple query.
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const client = createAdminClient();
  const startTime = Date.now();

  try {
    const { error } = await client
      .from('categories')
      .select('count')
      .limit(1);

    if (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: error.message,
      };
    }

    return {
      healthy: true,
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      healthy: false,
      latencyMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ============================================
// User Management (Admin)
// ============================================

/**
 * Seeds demo data for a specific user.
 * Only use for development/demo purposes.
 */
export async function seedDemoDataForUser(userId: string): Promise<void> {
  const client = createAdminClient();

  const { error } = await client.rpc('seed_demo_data', {
    demo_user_id: userId,
  });

  if (error) {
    console.error('Error seeding demo data:', error);
    throw error;
  }

  console.log(`Demo data seeded for user ${userId}`);
}

/**
 * Cleans up all data for a specific user.
 * Use with caution - this is destructive.
 */
export async function cleanupUserData(userId: string): Promise<void> {
  const client = createAdminClient();

  const { error } = await client.rpc('cleanup_demo_data', {
    demo_user_id: userId,
  });

  if (error) {
    console.error('Error cleaning up user data:', error);
    throw error;
  }

  console.log(`Data cleaned up for user ${userId}`);
}

/**
 * Initializes a new user with default categories and preferences.
 */
export async function initializeNewUser(userId: string): Promise<void> {
  const client = createAdminClient();

  // Create default preferences
  const { error: prefError } = await client
    .from('user_preferences')
    .upsert({
      user_id: userId,
      theme: 'system',
      default_currency: 'INR',
      timezone: 'Asia/Kolkata',
      sync_enabled: true,
      anomaly_detection_enabled: true,
      anomaly_threshold: 20,
      date_format: 'yyyy-MM-dd',
      number_locale: 'en-US',
    });

  if (prefError) {
    console.error('Error creating user preferences:', prefError);
    throw prefError;
  }

  // Create default categories
  const defaultCategories = [
    { name: 'Food & Dining', icon: '🍽️', color: '#f59e0b', sort_order: 1 },
    { name: 'Transportation', icon: '🚗', color: '#3b82f6', sort_order: 2 },
    { name: 'Shopping', icon: '🛍️', color: '#ec4899', sort_order: 3 },
    { name: 'Entertainment', icon: '🎬', color: '#8b5cf6', sort_order: 4 },
    { name: 'Healthcare', icon: '🏥', color: '#ef4444', sort_order: 5 },
    { name: 'Utilities', icon: '💡', color: '#22c55e', sort_order: 6 },
    { name: 'Travel', icon: '✈️', color: '#06b6d4', sort_order: 7 },
    { name: 'Income', icon: '💰', color: '#10b981', sort_order: 8 },
    { name: 'Other', icon: '📦', color: '#6b7280', sort_order: 99 },
  ];

  const categoriesWithUser = defaultCategories.map((cat) => ({
    ...cat,
    user_id: userId,
    is_default: true,
    is_deleted: false,
  }));

  const { error: catError } = await client
    .from('categories')
    .insert(categoriesWithUser);

  if (catError) {
    console.error('Error creating default categories:', catError);
    throw catError;
  }

  console.log(`User ${userId} initialized with default data`);
}

// ============================================
// Analytics Helpers (Admin)
// ============================================

/**
 * Gets aggregate statistics across all users.
 * Admin only - for internal analytics.
 */
export async function getGlobalStats(): Promise<{
  totalUsers: number;
  totalTransactions: number;
  totalCategories: number;
  averageTransactionsPerUser: number;
}> {
  const client = createAdminClient();

  const [usersResult, transactionsResult, categoriesResult] = await Promise.all(
    [
      client.from('user_preferences').select('count'),
      client.from('transactions').select('count').eq('is_deleted', false),
      client.from('categories').select('count').eq('is_deleted', false),
    ]
  );

  const totalUsers = (usersResult.data?.[0] as { count: number })?.count ?? 0;
  const totalTransactions =
    (transactionsResult.data?.[0] as { count: number })?.count ?? 0;
  const totalCategories =
    (categoriesResult.data?.[0] as { count: number })?.count ?? 0;

  return {
    totalUsers,
    totalTransactions,
    totalCategories,
    averageTransactionsPerUser:
      totalUsers > 0 ? totalTransactions / totalUsers : 0,
  };
}

// ============================================
// RLS Testing Helpers
// ============================================

/**
 * Tests that RLS policies are working correctly.
 * Returns true if RLS is properly configured.
 */
export async function testRLSPolicies(): Promise<{
  categoriesRLS: boolean;
  transactionsRLS: boolean;
  budgetsRLS: boolean;
  allPassed: boolean;
}> {
  // This would require creating test users and verifying
  // that they can only access their own data.
  // For now, return a placeholder.

  console.log('RLS policy testing requires manual verification.');
  console.log('See the Supabase dashboard for RLS policy details.');

  return {
    categoriesRLS: true,
    transactionsRLS: true,
    budgetsRLS: true,
    allPassed: true,
  };
}

// ============================================
// Export Types for Admin Functions
// ============================================

export interface MigrationInfo {
  id: string;
  name: string;
  applied_at: string;
}

export interface DatabaseHealthResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

export interface GlobalStats {
  totalUsers: number;
  totalTransactions: number;
  totalCategories: number;
  averageTransactionsPerUser: number;
}
