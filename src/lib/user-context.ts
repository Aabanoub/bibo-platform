import type { SupabaseClient } from '@supabase/supabase-js';

export interface UserPlatformData {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  recentTransactions: {
    amount: number;
    type: 'income' | 'expense';
    category?: string | null;
    description?: string | null;
    date: string;
  }[];
  tasks: {
    title: string;
    priority: string;
    status: string;
    due_date?: string | null;
  }[];
  habits: {
    name: string;
    frequency: string;
    completedToday?: boolean;
  }[];
  notes: {
    title: string;
    tags?: string[];
    is_pinned?: boolean;
    snippet?: string;
  }[];
}

/**
 * Fetch the user's real-time platform data (Finance, Tasks, Habits, Notes)
 * to give the AI assistant full awareness of their digital cockpit.
 */
export async function fetchUserPlatformData(
  supabase: SupabaseClient,
  userId: string
): Promise<UserPlatformData> {
  const today = new Date().toISOString().split('T')[0];

  try {
    const [txRes, tasksRes, habitsRes, habitLogsRes, notesRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('amount, type, category, description, date')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(30),
      supabase
        .from('tasks')
        .select('title, priority, status, due_date')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('habits')
        .select('id, name, frequency')
        .eq('user_id', userId),
      supabase
        .from('habit_logs')
        .select('habit_id')
        .eq('user_id', userId)
        .eq('completed_at', today),
      supabase
        .from('notes')
        .select('title, tags, is_pinned, content')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(10),
    ]);

    const transactions = (txRes.data ?? []).map((t: any) => ({
      amount: Number(t.amount) || 0,
      type: (t.type as 'income' | 'expense') || 'expense',
      category: t.category,
      description: t.description,
      date: t.date || today,
    }));

    const tasks = (tasksRes.data ?? []).map((t: any) => ({
      title: t.title || 'Untitled task',
      priority: t.priority || 'medium',
      status: t.status || 'todo',
      due_date: t.due_date,
    }));

    const habits = habitsRes.data ?? [];
    const completedHabitIds = new Set((habitLogsRes.data ?? []).map((l: any) => l.habit_id));
    const notes = (notesRes.data ?? []).map((n: any) => ({
      title: n.title || 'Untitled Note',
      tags: n.tags ?? [],
      is_pinned: n.is_pinned ?? false,
      snippet: n.content ? String(n.content).slice(0, 150) : '',
    }));

    let totalIncome = 0;
    let totalExpenses = 0;

    for (const t of transactions) {
      if (t.type === 'income') totalIncome += t.amount;
      else if (t.type === 'expense') totalExpenses += t.amount;
    }

    const netBalance = totalIncome - totalExpenses;

    return {
      totalIncome,
      totalExpenses,
      netBalance,
      recentTransactions: transactions.slice(0, 15),
      tasks,
      habits: habits.map((h: any) => ({
        name: h.name,
        frequency: h.frequency,
        completedToday: completedHabitIds.has(h.id),
      })),
      notes,
    };
  } catch (err) {
    console.warn('fetchUserPlatformData warning:', err);
    return {
      totalIncome: 0,
      totalExpenses: 0,
      netBalance: 0,
      recentTransactions: [],
      tasks: [],
      habits: [],
      notes: [],
    };
  }
}

/**
 * Formats the platform data into a prompt segment injected into the AI's instructions.
 */
export function formatContextPrompt(
  data: UserPlatformData,
  userName?: string
): string {
  const currencyFmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const txList = data.recentTransactions.length
    ? data.recentTransactions
        .map(
          (t) =>
            `- [${t.date}] ${t.type.toUpperCase()}: ${currencyFmt(t.amount)} (${t.category || 'General'}) - ${t.description || 'No description'}`
        )
        .join('\n')
    : 'No transactions recorded yet in the Finance tab.';

  const pendingTasks = data.tasks.filter((t) => t.status !== 'done');
  const completedTasks = data.tasks.filter((t) => t.status === 'done');

  const pendingList = pendingTasks.length
    ? pendingTasks
        .map((t) => `- [Priority: ${t.priority.toUpperCase()}] "${t.title}" (Status: ${t.status})`)
        .join('\n')
    : 'No pending tasks right now.';

  const habitList = data.habits.length
    ? data.habits
        .map((h) => `- "${h.name}" (${h.frequency}): ${h.completedToday ? '✅ Done today' : '⬜ Not completed yet today'}`)
        .join('\n')
    : 'No habits configured yet.';

  const notesList = data.notes.length
    ? data.notes
        .map(
          (n) =>
            `- "${n.title}" ${n.is_pinned ? '📌' : ''} [Tags: ${(n.tags || []).join(', ') || 'none'}]`
        )
        .join('\n')
    : 'No notes created yet.';

  return `
---
### LIVE USER DATA FROM PLATFORM (CURRENT SNAPSHOT FOR ${userName || 'Abanoub'}):
Today's Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

💰 FINANCIAL OVERVIEW (FROM FINANCE TAB):
- Total Recorded Income: ${currencyFmt(data.totalIncome)}
- Total Recorded Expenses: ${currencyFmt(data.totalExpenses)}
- CURRENT NET BALANCE / CASH ON HAND: ${currencyFmt(data.netBalance)}
- Recent Transactions:
${txList}

📋 TASKS OVERVIEW (FROM TASKS TAB):
- Pending / In Progress Tasks (${pendingTasks.length}):
${pendingList}
- Total Completed Tasks: ${completedTasks.length}

🏃 HABITS OVERVIEW (FROM HABITS TAB):
${habitList}

📝 NOTES OVERVIEW (FROM NOTES TAB):
${notesList}

MANDATORY INSTRUCTIONS FOR ASSISTANT:
1. When the user asks about their finances, money, or net balance (e.g. "how much money do I have?", "what is my net balance?"):
   - ALWAYS answer directly using the exact figures above: Net Balance = ${currencyFmt(data.netBalance)} (Income: ${currencyFmt(data.totalIncome)}, Expenses: ${currencyFmt(data.totalExpenses)}).
   - If their transactions are 0, tell them their balance is currently $0.00 because no transactions have been entered in the Finance tab yet, and explain that any transactions they add in the Finance page will immediately reflect here!
   - NEVER ask the user to provide bank statements, spreadsheets, or account lists, because their financial records are already tracked right here in this platform!
2. When the user asks about tasks, habits, or notes, directly cite their real items listed above.
3. Be friendly, accurate, and concise.
---
`;
}
