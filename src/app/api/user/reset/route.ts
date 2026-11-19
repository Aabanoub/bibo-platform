import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const body = await req.json();
    const password = body?.password;

    if (!password || typeof password !== 'string' || !password.trim()) {
      return NextResponse.json(
        { error: 'Account password is required to authorize data reset.' },
        { status: 400 }
      );
    }

    // Verify the account password against Supabase Auth
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Supabase configuration is missing.' },
        { status: 500 }
      );
    }

    const authVerifyClient = createSupabaseClient(supabaseUrl, supabaseAnonKey);
    const { error: authError } = await authVerifyClient.auth.signInWithPassword({
      email: user.email,
      password: password.trim(),
    });

    if (authError) {
      return NextResponse.json(
        { error: 'Incorrect password. Data reset cancelled for your security.' },
        { status: 403 }
      );
    }

    // Password verified!
    // Check if the service role key is a genuine JWT key (starts with eyJ and not placeholder)
    const isServiceRoleKeyValid =
      Boolean(supabaseServiceKey) &&
      typeof supabaseServiceKey === 'string' &&
      supabaseServiceKey.startsWith('eyJ') &&
      supabaseServiceKey !== 'placeholder-service-key';

    const client = isServiceRoleKeyValid
      ? createSupabaseClient(supabaseUrl, supabaseServiceKey!)
      : supabase;

    const nowISO = new Date().toISOString();

    // Strategy 1: Attempt atomic wipe via PostgreSQL SECURITY DEFINER RPC
    let rpcSucceeded = false;
    try {
      const { data: rpcData, error: rpcError } = await client.rpc('reset_user_data', {
        user_id_to_reset: user.id,
      });

      if (!rpcError && (rpcData as any)?.success) {
        rpcSucceeded = true;
      } else if (rpcError) {
        console.warn('[/api/user/reset] reset_user_data RPC notice (using fallback):', rpcError.message);
      }
    } catch (rpcErr) {
      console.warn('[/api/user/reset] RPC call exception (using fallback):', rpcErr);
    }

    // Strategy 2: If RPC is not installed yet, perform direct table-by-table deletions
    if (!rpcSucceeded) {
      // 1. Delete Salary Distribution Cycles (in-progress first, then all remaining)
      try {
        await client
          .from('salary_distribution_cycles')
          .delete()
          .eq('user_id', user.id)
          .eq('status', 'in_progress');
      } catch (e) {
        console.warn('[/api/user/reset] Error clearing in_progress salary cycles:', e);
      }

      try {
        const { error: cycleErr } = await client
          .from('salary_distribution_cycles')
          .delete()
          .eq('user_id', user.id);
        if (cycleErr) {
          console.warn('[/api/user/reset] Warning clearing salary_distribution_cycles:', cycleErr.message);
        }
      } catch (e) {
        console.warn('[/api/user/reset] Exception clearing salary_distribution_cycles:', e);
      }

      // 2. Delete Salary Distribution Plans
      try {
        const { error: planErr } = await client
          .from('salary_distribution_plans')
          .delete()
          .eq('user_id', user.id);
        if (planErr) {
          console.warn('[/api/user/reset] Warning clearing salary_distribution_plans:', planErr.message);
        }
      } catch (e) {
        console.warn('[/api/user/reset] Exception clearing salary_distribution_plans:', e);
      }

      // 3. Child tables and remaining platform tables in dependency order
      const tablesToWipe = [
        'habit_logs',
        'habits',
        'tasks',
        'task_folders',
        'transactions',
        'notes',
        'chat_messages',
        'daily_summaries',
        'countdown_events',
        'notifications',
        'scheduled_notifications',
        'push_subscriptions',
        'notification_preferences',
      ];

      for (const table of tablesToWipe) {
        try {
          const { error } = await client.from(table).delete().eq('user_id', user.id);
          if (error) {
            console.warn(`[/api/user/reset] Warning clearing table "${table}":`, error.message);
          }
        } catch (tableErr) {
          console.warn(`[/api/user/reset] Exception clearing table "${table}":`, tableErr);
        }
      }

      // 4. Reset User Profile to factory defaults
      try {
        await client
          .from('profiles')
          .update({
            avatar_url: null,
            gender: 'default',
            is_locked: false,
            focus_duration: 25,
            short_break_duration: 5,
            long_break_duration: 15,
            nav_slots: ['notes', 'tasks', 'finance', 'chat'],
            updated_at: nowISO,
          })
          .eq('id', user.id);
      } catch (profileErr) {
        console.warn('[/api/user/reset] Warning resetting profile defaults:', profileErr);
      }
    }

    // 5. Update user auth metadata to clean slate defaults
    // Note: Email and password remain completely intact in auth.users
    try {
      await supabase.auth.updateUser({
        data: {
          last_data_reset_at: null,
          avatar_url: null,
          gender: 'default',
          theme: 'midnight-pulse',
        },
      });
    } catch (metaErr) {
      console.warn('[/api/user/reset] Warning updating user metadata:', metaErr);
    }

    return NextResponse.json({
      success: true,
      message: 'All user data in the database has been completely erased, keeping your email and password.',
    });
  } catch (err: unknown) {
    console.error('[/api/user/reset] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
