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

    // Password verified! Delete all user-scoped data across all tables
    // 1. Habit logs & Habits
    await supabase.from('habit_logs').delete().eq('user_id', user.id);
    await supabase.from('habits').delete().eq('user_id', user.id);

    // 2. Tasks
    await supabase.from('tasks').delete().eq('user_id', user.id);

    // 3. Transactions
    await supabase.from('transactions').delete().eq('user_id', user.id);

    // 4. Notes
    await supabase.from('notes').delete().eq('user_id', user.id);

    // 5. Chat messages
    await supabase.from('chat_messages').delete().eq('user_id', user.id);

    // 6. Notifications, Summaries & Countdowns
    await supabase.from('daily_summaries').delete().eq('user_id', user.id);
    await supabase.from('notifications').delete().eq('user_id', user.id);
    await supabase.from('countdown_events').delete().eq('user_id', user.id);

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
