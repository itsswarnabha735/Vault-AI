import { NextResponse } from 'next/server';
import {
  createRouteHandlerClient,
  createAdminClient,
} from '@/lib/supabase/server';

/**
 * DELETE /api/reset
 *
 * Deletes ALL transactions for the authenticated user from Supabase.
 * This is a destructive, development-only endpoint.
 */
export async function DELETE() {
  try {
    // Get the authenticated user from the session cookie
    const supabase = await createRouteHandlerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = user.id;
    console.log(`[Reset] Deleting all data for user ${userId}...`);

    // Use admin client to bypass RLS for bulk delete
    const admin = await createAdminClient();

    // Delete transactions
    const { count: txCount, error: txError } = await admin
      .from('vault_transactions')
      .delete({ count: 'exact' })
      .eq('user_id', userId);

    if (txError) {
      console.error('[Reset] Transaction delete error:', txError);
      return NextResponse.json(
        { error: `Failed to delete transactions: ${txError.message}` },
        { status: 500 }
      );
    }

    console.log(`[Reset] Deleted ${txCount} transactions from Supabase`);

    return NextResponse.json({
      success: true,
      deleted: { transactions: txCount },
      userId,
    });
  } catch (error) {
    console.error('[Reset] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
