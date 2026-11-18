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

    // Use service role admin client if available (bypasses RLS & immutability triggers for clean administrative purge)
    // or fall back to authenticated server client
    const client = supabaseServiceKey
      ? createSupabaseClient(supabaseUrl, supabaseServiceKey)
      : supabase;

    // Password verified! Delete all user-scoped data across ALL platform tables in safe dependency order:
    
    // Dedicated Salary Distribution purge:
    // First, delete in-progress active cycles (always allowed by database policies)
    try {
      await client
        .from('salary_distribution_cycles')
        .delete()
        .eq('user_id', user.id)
        .eq('status', 'in_progress');
    } catch (e) {
      console.warn('[/api/user/reset] Error deleting in_progress salary cycles:', e);
    }

    // Next, delete all remaining salary cycles (completed, archived, dismissed)
    try {
      await client
        .from('salary_distribution_cycles')
        .delete()
        .eq('user_id', user.id);
    } catch (e) {
      console.warn('[/api/user/reset] Error deleting salary cycles:', e);
    }

    // Delete the salary distribution plan definition
    try {
      await client
        .from('salary_distribution_plans')
        .delete()
        .eq('user_id', user.id);
    } catch (e) {
      console.warn('[/api/user/reset] Error deleting salary plan:', e);
    }

    const tablesToWipe = [
      // 1. Habits & Habit consistency logs
      'habit_logs',
      'habits',
      // 2. Tasks & Deadlines
      'tasks',
      // 3. Financial Transactions
      'transactions',
      // 4. Notes & Scanned Documents
      'notes',
      // 5. AI Chat Messages & Summaries
      'chat_messages',
      'daily_summaries',
      // 6. Countdowns & Milestones
      'countdown_events',
      // 7. Notifications, Scheduled Reminders, Subscriptions & Preferences
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

    // 9. Reset User Profile to factory defaults (focus durations, mobile nav slots)
    const nowISO = new Date().toISOString();
    try {
      await client
        .from('profiles')
        .update({
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

    // 10. Record authoritative reset timestamp in user auth metadata
    try {
      await supabase.auth.updateUser({
        data: { last_data_reset_at: nowISO },
      });
    } catch (metaErr) {
      console.warn('[/api/user/reset] Warning updating user metadata:', metaErr);
    }

    return NextResponse.json({
      success: true,
      message: 'All platform data has been securely reset.',
    });
  } catch (err: unknown) {
    console.error('[/api/user/reset] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
