import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase environment variables.');
  }
  return createClient(url, serviceKey);
}

function todayRange() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start.getTime() + 86_400_000); // +24 h
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    dateLabel: start.toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// GET /api/cron/daily-summary
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    // ---- Verify cron secret ----
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET is not configured.' },
        { status: 500 },
      );
    }

    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized.' },
        { status: 401 },
      );
    }

    // ---- Validate AI keys ----
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!groqKey && !geminiKey) {
      return NextResponse.json(
        { error: 'Neither GROQ_API_KEY nor GEMINI_API_KEY is configured.' },
        { status: 500 },
      );
    }

    const supabase = getSupabaseAdmin();
    const candidateModels = [
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-flash-latest',
    ];
    const genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;
    const { startISO, endISO, dateLabel } = todayRange();

    // ---- Fetch all users ----
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name');

    if (profilesError) {
      console.error('[daily-summary] profiles error:', profilesError);
      return NextResponse.json(
        { error: 'Failed to fetch profiles.' },
        { status: 500 },
      );
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ message: 'No users found.', summaries: 0 });
    }

    // ---- Process each user ----
    const results: { userId: string; status: string }[] = [];

    for (const profile of profiles) {
      try {
        const userId = profile.id;
        const name = profile.full_name || 'Abanoub';

        // -- Fetch completed tasks (done) --
        const { data: tasks } = await supabase
          .from('tasks')
          .select('title, updated_at')
          .eq('user_id', userId)
          .eq('status', 'done')
          .gte('updated_at', startISO)
          .lt('updated_at', endISO);

        // -- Fetch transactions --
        const { data: transactions } = await supabase
          .from('transactions')
          .select('description, amount, type, category')
          .eq('user_id', userId)
          .gte('created_at', startISO)
          .lt('created_at', endISO);

        // -- Fetch habit completions --
        const { data: habits } = await supabase
          .from('habit_logs')
          .select('habit_id, completed_at, habits(name)')
          .eq('user_id', userId)
          .gte('completed_at', dateLabel);

        // -- Build prompt --
        const taskList =
          tasks && tasks.length > 0
            ? tasks.map((t) => `- ${t.title}`).join('\n')
            : 'No tasks completed today.';

        const txList =
          transactions && transactions.length > 0
            ? transactions
              .map(
                (t) =>
                  `- ${t.description ?? 'Transaction'}: ${t.type === 'expense' ? '-' : '+'}$${Math.abs(t.amount).toFixed(2)} (${t.category ?? 'uncategorized'})`,
              )
              .join('\n')
            : 'No transactions recorded today.';

        const habitList =
          habits && habits.length > 0
            ? habits
              .map((h) => {
                const habitName =
                  (h as Record<string, unknown>).habits &&
                    typeof (h as Record<string, unknown>).habits === 'object'
                    ? ((h as Record<string, unknown>).habits as { name: string }).name
                    : `Habit ${h.habit_id}`;
                return `- ${habitName}`;
              })
              .join('\n')
            : 'No habits completed today.';

        const prompt = `
You are a personal AI assistant. Generate a friendly, concise daily summary/briefing for ${name} for ${dateLabel}.

Here is their data for today:

## Tasks Completed
${taskList}

## Financial Transactions
${txList}

## Habits Completed
${habitList}

Write a professional and motivational daily briefing (3-5 paragraphs). Include:
1. A greeting
2. Summary of accomplishments (tasks + habits)
3. Financial overview if there were transactions
4. When relevant, include a structured Markdown summary table (e.g. | Activity / Item | Category / Time | Status |)
5. An encouraging or actionable closing remark

Keep it warm, structured, and concise.
`.trim();

        let summary = '';

        // 1. Try Groq
        if (groqKey) {
          try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${groqKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              summary = data.choices?.[0]?.message?.content?.trim() || '';
            }
          } catch {}
        }

        // 2. Fall back to Gemini
        if (!summary && genAI) {
          for (const modelToTry of candidateModels) {
            try {
              const model = genAI.getGenerativeModel({ model: modelToTry });
              const result = await model.generateContent(prompt);
              summary = result.response.text();
              if (summary) break;
            } catch {
              await new Promise((r) => setTimeout(r, 300));
            }
          }
        }

        if (!summary) {
          results.push({ userId, status: 'empty_response' });
          continue;
        }

        // -- Save summary --
        const { error: saveError } = await supabase
          .from('daily_summaries')
          .upsert(
            {
              user_id: userId,
              date: dateLabel,
              summary,
              tasks_completed: tasks?.length ?? 0,
              transactions_count: transactions?.length ?? 0,
              habits_completed: habits?.length ?? 0,
              created_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,date' },
          );

        if (saveError) {
          console.error(
            `[daily-summary] save error for user ${userId}:`,
            saveError,
          );
          results.push({ userId, status: 'save_error' });
          continue;
        }

        // -- Create notification --
        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            user_id: userId,
            title: `📋 Your Daily Summary for ${dateLabel}`,
            message: `You completed ${tasks?.length ?? 0} task(s) and ${habits?.length ?? 0} habit(s) today. Tap to read your full briefing.`,
            action_url: '/dashboard',
            is_read: false,
            created_at: new Date().toISOString(),
          });

        if (notifError) {
          console.error(
            `[daily-summary] notification error for user ${userId}:`,
            notifError,
          );
        }

        results.push({ userId, status: 'success' });
      } catch (userErr) {
        console.error(
          `[daily-summary] error for user ${profile.id}:`,
          userErr,
        );
        results.push({ userId: profile.id, status: 'error' });
      }
    }

    const succeeded = results.filter((r) => r.status === 'success').length;

    return NextResponse.json({
      message: `Daily summaries generated for ${succeeded}/${profiles.length} users.`,
      date: dateLabel,
      results,
    });
  } catch (err: unknown) {
    console.error('[daily-summary] Fatal error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
