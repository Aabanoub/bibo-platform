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
  folders?: {
    name: string;
    due_date?: string | null;
  }[];
}

/**
 * Fetch the user's real-time platform data (Finance, Tasks, Habits, Notes, Folders)
 * to give the AI assistant full awareness of their digital cockpit.
 */
export async function fetchUserPlatformData(
  supabase: SupabaseClient,
  userId: string
): Promise<UserPlatformData> {
  const today = new Date().toISOString().split('T')[0];

  try {
    const [txRes, tasksRes, habitsRes, habitLogsRes, notesRes, foldersRes] = await Promise.all([
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
      supabase
        .from('task_folders')
        .select('name, due_date')
        .eq('user_id', userId)
        .order('due_date', { ascending: true }),
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

    const folders = (foldersRes?.data ?? []).map((f: any) => ({
      name: f.name || 'Untitled Folder',
      due_date: f.due_date,
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
      folders,
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
      folders: [],
    };
  }
}

/**
 * Formats the platform data into an assertive prompt segment injected into the AI's instructions.
 */
export function formatContextPrompt(
  data: UserPlatformData,
  userName?: string
): string {
  const currencyFmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const hasTransactions = data.recentTransactions.length > 0;

  const txList = hasTransactions
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

  const folderList = (data.folders || []).length
    ? (data.folders || [])
        .map((f) => {
          const dueFmt = f.due_date
            ? new Date(f.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'No exam date set';
          return `- 📁 Folder / Subject: "${f.name}" (Exam / Due Date: ${dueFmt})`;
        })
        .join('\n')
    : 'No exam / subject folders created yet.';

  return `
================================================================================
CRITICAL CONTEXT & STRICT OVERRIDE FOR ${userName || 'Abanoub'}:
Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

You are directly integrated with this user's personal web platform. You have FULL ACCESS to their live database below:

📁 EXAM & SUBJECT FOLDERS (From Platform's Folders Database):
${folderList}

💰 LIVE FINANCIAL DATA (From Platform's Finance Database):
- Total Recorded Income: ${currencyFmt(data.totalIncome)}
- Total Recorded Expenses: ${currencyFmt(data.totalExpenses)}
- CURRENT NET BALANCE: ${currencyFmt(data.netBalance)}
- Number of Transactions: ${data.recentTransactions.length}
- Recent Transactions:
${txList}

📋 LIVE TASKS (From Platform's Tasks Database):
- Pending Tasks (${pendingTasks.length}):
${pendingList}
- Total Completed Tasks: ${completedTasks.length}

🏃 LIVE HABITS (From Platform's Habits Database):
${habitList}

📝 LIVE NOTES (From Platform's Notes Database):
${notesList}

STRICT INSTRUCTIONS FOR EVERY USER QUESTION:
1. IF THE USER ASKS ABOUT MONEY, BALANCE, EXPENSES, OR INCOME:
   ${
     hasTransactions
       ? `- State their exact Net Balance: **${currencyFmt(data.netBalance)}** (Total Income: ${currencyFmt(data.totalIncome)}, Total Expenses: ${currencyFmt(data.totalExpenses)}). List their recent transactions directly.`
       : `- State clearly: **"Your current recorded net balance in the platform is $0.00 because you haven't added any transactions to the Finance tab yet. To start tracking your balance, go to the Finance page in the sidebar and click '+ Add Transaction' to record your income or expenses. Once you add them, I will automatically calculate and track your live balance here!"**`
   }
   - NEVER, UNDER ANY CIRCUMSTANCES, ask the user to fill out a table, share bank account numbers, or upload spreadsheets/CSVs. Their finances are tracked directly within this web platform.
   - Ignore any earlier assistant messages in the chat history where you asked for accounts or forms.
2. IF THE USER ASKS ABOUT TASKS, HABITS, OR NOTES:
   - Answer directly using the real lists above.
================================================================================
`;
}
