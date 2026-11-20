import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { createServerClient } from '@/lib/supabase-server';
import { fetchUserPlatformData, formatContextPrompt, UserPlatformData } from '@/lib/user-context';
import { calculateSmartDistribution } from '@/lib/smart-distribution';
import { generateDeterministicDailyPlan } from '@/lib/daily-planner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Persona system prompts
// ---------------------------------------------------------------------------
const PERSONA_PROMPTS: Record<string, string> = {
  'executive-assistant':
    "You are Abanoub's personal executive AI assistant. You help manage his day, prioritize tasks, draft messages, and think strategically. Be concise, intelligent, and action-oriented.",
  'code-reviewer':
    'You are a senior software engineer helping Abanoub review code. Be thorough, point out bugs, suggest improvements, and explain your reasoning.',
  'creative-brainstormer':
    'You are a creative thinking partner. Help Abanoub brainstorm ideas, think outside the box, and explore possibilities. Be enthusiastic and imaginative.',
  'accountability-coach':
    'You are a tough but caring accountability coach. Help Abanoub stay on track with his goals, call out excuses, and celebrate wins.',
};

const DEFAULT_PERSONA = 'executive-assistant';

const ACTIONS_INSTRUCTION = `
=== AUTONOMOUS PLATFORM ACTIONS ===
You have full permission to execute real actions in the user's database when they ask to log, record, add, create, or check off something.
When the user expresses an intent to:
1. Log an expense or income (e.g. "I spent $25 on lunch", "Paid 80 for wifi", "Received $3000 salary")
2. Add a task or todo (e.g. "Add a task to call dentist tomorrow", "Remind me urgently to submit report")
3. Save or take a note (e.g. "Save a note about meeting with Sarah...", "Take note: Ideas for my project...")
4. Check off / complete a habit (e.g. "I finished my workout today", "Done with reading")

You MUST fulfill the user's intent by appending this exact JSON block at the VERY END of your reply (on a new line):
ACTION: {"type": "<action_type>", "data": { ... }}

Supported action schemas:
- create_transaction:
  {"type": "create_transaction", "data": {"amount": number, "type": "expense" | "income", "category": string, "description": string, "date"?: "YYYY-MM-DD"}}
  (Standard categories: Food, Groceries, Transport, Utilities, Housing, Entertainment, Shopping, Health, Salary, Investment, Other. Default type is "expense" unless income/salary.)
- create_task:
  {"type": "create_task", "data": {"title": string, "priority": "low" | "medium" | "high" | "urgent", "difficulty"?: "easy" | "medium" | "hard", "estimated_duration"?: number, "due_date"?: "YYYY-MM-DD", "description"?: string}}
- distribute_tasks:
  {"type": "distribute_tasks", "data": {"folder_name"?: string, "deadline": "YYYY-MM-DD", "tasks": [{"title": string, "priority"?: "low" | "medium" | "high" | "urgent", "description"?: string}]}}
  (CRITICAL SMART DISTRIBUTION & LESSON SEQUENCING RULES:
   1. Workload balance: DO NOT schedule all tasks for that exact final deadline day! Evenly distribute the workload across the timeframe preceding the deadline — e.g., if 10 tasks are due on Dec 2nd, allocate ~1 task per day over the preceding 10 days.
   2. Pedagogical order: If tasks are study lessons/chapters/lectures, YOU MUST ALWAYS arrange them in natural ascending numerical order (e.g. Lesson 1, Lesson 2, Lesson 3... never Lesson 5 before Lesson 2!). Earlier lessons must be assigned to earlier days.)
- smart_distribute_folder:
  {"type": "smart_distribute_folder", "data": {"folder_name"?: string, "folder_id"?: string, "deadline"?: "YYYY-MM-DD"}}
  (Use this when the user asks to balance/redistribute the workload of existing tasks inside a folder or exam subject across days leading up to the deadline. Always arranges lessons sequentially so Lesson 1 is studied before Lesson 2).
- create_note:
  {"type": "create_note", "data": {"title": string, "content": string, "tags"?: string[]}}
- complete_habit:
  {"type": "complete_habit", "data": {"habit_name": string}}
- generate_daily_plan:
  {"type": "generate_daily_plan", "data": {"date"?: "YYYY-MM-DD"}}
  (Use this when the user asks to schedule their day, plan their tasks for today/tomorrow, or optimize their daily study schedule.)

RULES:
- Always give a warm, clear conversational response acknowledging the action in your text first.
- Put the ACTION: {...} block on its own line at the end.
- Emit at most ONE action per message.
- If the user is only asking a question or requesting info (e.g. "What is my balance?", "What tasks do I have?"), DO NOT emit an ACTION block; answer directly using the live platform data.
`;

// ---------------------------------------------------------------------------
// Action Execution in Supabase
// ---------------------------------------------------------------------------
interface ActionPayload {
  type: string;
  data: Record<string, any>;
}

interface ActionExecuted {
  type: string;
  success: boolean;
  message: string;
  data?: any;
}

async function executeAction(
  supabase: any,
  userId: string,
  userName: string,
  action: ActionPayload
): Promise<ActionExecuted | null> {
  try {
    // Ensure profile exists
    await supabase.from('profiles').upsert(
      {
        id: userId,
        full_name: userName || 'User',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (action.type === 'create_transaction') {
      const amount = Math.abs(parseFloat(action.data.amount) || 0);
      if (amount <= 0) return null;
      const type = action.data.type === 'income' ? 'income' : 'expense';
      const category = action.data.category || (type === 'income' ? 'Salary' : 'General');
      const description = action.data.description || (type === 'income' ? 'Income' : 'Expense');
      const date = action.data.date || new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          amount,
          type,
          category,
          description,
          date,
        })
        .select()
        .single();

      if (error) {
        console.error('Error inserting transaction from AI:', error);
        return { type: action.type, success: false, message: error.message };
      }

      return {
        type: action.type,
        success: true,
        message: `Logged ${type === 'income' ? '+$' : '-$'}${amount.toFixed(2)} (${category}: ${description})`,
        data,
      };
    }

    if (action.type === 'create_task') {
      const title = action.data.title?.trim();
      if (!title) return null;
      const priority = ['urgent', 'high', 'medium', 'low'].includes(action.data.priority)
        ? action.data.priority
        : 'medium';
      const difficulty = ['easy', 'medium', 'hard'].includes(action.data.difficulty)
        ? action.data.difficulty
        : 'medium';
      const estimated_duration =
        typeof action.data.estimated_duration === 'number' && action.data.estimated_duration > 0
          ? Math.round(action.data.estimated_duration)
          : 30;
      const due_date = action.data.due_date ? new Date(action.data.due_date).toISOString() : null;

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          title,
          priority,
          difficulty,
          estimated_duration,
          status: 'todo',
          due_date,
          description: action.data.description || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error inserting task from AI:', error);
        return { type: action.type, success: false, message: error.message };
      }

      return {
        type: action.type,
        success: true,
        message: `Created task "${title}" [${priority.toUpperCase()}]`,
        data,
      };
    }

    if (action.type === 'create_note') {
      const title = action.data.title?.trim() || 'Quick Note';
      const content = action.data.content || '';
      const tags = Array.isArray(action.data.tags) ? action.data.tags : [];

      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: userId,
          title,
          content,
          tags,
          is_pinned: false,
        })
        .select()
        .single();

      if (error) {
        console.error('Error inserting note from AI:', error);
        return { type: action.type, success: false, message: error.message };
      }

      return {
        type: action.type,
        success: true,
        message: `Saved note "${title}"`,
        data,
      };
    }

    if (action.type === 'complete_habit') {
      const habitName = action.data.habit_name?.trim();
      if (!habitName) return null;

      const { data: existingHabits } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', userId)
        .ilike('name', `%${habitName}%`)
        .limit(1);

      let habitId = existingHabits?.[0]?.id;

      if (!habitId) {
        const { data: newHabit, error: habitErr } = await supabase
          .from('habits')
          .insert({
            user_id: userId,
            name: habitName,
            frequency: 'daily',
            color: '#3B82F6',
          })
          .select()
          .single();

        if (habitErr) {
          console.error('Error creating habit:', habitErr);
          return { type: action.type, success: false, message: habitErr.message };
        }
        habitId = newHabit.id;
      }

      const todayDate = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('habit_logs')
        .upsert(
          {
            user_id: userId,
            habit_id: habitId,
            completed_at: todayDate,
            notes: 'Logged via AI Chat',
          },
          { onConflict: 'habit_id,completed_at' }
        )
        .select()
        .single();

      if (error) {
        console.error('Error logging habit from AI:', error);
        return { type: action.type, success: false, message: error.message };
      }

      return {
        type: action.type,
        success: true,
        message: `Marked habit "${habitName}" as completed today!`,
        data,
      };
    }

    if (action.type === 'distribute_tasks') {
      const { folder_name, deadline, tasks: rawTasks } = action.data;
      if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
        return { type: action.type, success: false, message: 'No tasks provided for smart distribution' };
      }

      // 1. Resolve or create Folder if folder_name is provided
      let folderId: string | null = null;
      let folderNameStr = folder_name?.trim();

      if (folderNameStr) {
        const { data: existingFolders } = await supabase
          .from('task_folders')
          .select('id, name, due_date')
          .eq('user_id', userId)
          .ilike('name', folderNameStr)
          .limit(1);

        if (existingFolders && existingFolders.length > 0) {
          folderId = existingFolders[0].id;
          folderNameStr = existingFolders[0].name;
          if (!existingFolders[0].due_date && deadline) {
            await supabase
              .from('task_folders')
              .update({ due_date: new Date(deadline).toISOString() })
              .eq('id', folderId);
          }
        } else {
          const { data: newFolder } = await supabase
            .from('task_folders')
            .insert({
              user_id: userId,
              name: folderNameStr,
              due_date: deadline ? new Date(deadline).toISOString() : null,
              color: 'blue',
              icon: 'book',
            })
            .select()
            .single();

          if (newFolder) folderId = newFolder.id;
        }
      }

      // 2. Compute smart distribution plan
      const deadlineDate = deadline || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const plan = calculateSmartDistribution(
        rawTasks.map((t: any) => ({
          title: t.title?.trim() || 'Lesson',
          priority: ['urgent', 'high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium',
          description: t.description || null,
        })),
        deadlineDate
      );

      // 3. Batch insert distributed tasks
      const tasksToInsert = plan.schedule.map((item) => ({
        user_id: userId,
        folder_id: folderId,
        title: item.task.title,
        priority: item.task.priority || 'medium',
        status: 'todo',
        due_date: new Date(item.suggestedDueDate).toISOString(),
        description: item.task.description || null,
      }));

      const { data: insertedTasks, error: insertErr } = await supabase
        .from('tasks')
        .insert(tasksToInsert)
        .select();

      if (insertErr) {
        console.error('Error inserting distributed tasks:', insertErr);
        return { type: action.type, success: false, message: insertErr.message };
      }

      // In-app notification
      await supabase.from('notifications').insert({
        user_id: userId,
        title: `✨ Smart Distributed ${insertedTasks.length} Tasks`,
        message: plan.summary,
        type: 'ai',
        action_url: '/tasks',
      });

      return {
        type: action.type,
        success: true,
        message: `Smart distributed ${insertedTasks.length} tasks across ${plan.studyDays} days leading to ${plan.deadlineFormatted}. (~${plan.tasksPerDay} tasks/day)`,
        data: { plan, tasks: insertedTasks },
      };
    }

    if (action.type === 'smart_distribute_folder') {
      const { folder_name, folder_id, deadline } = action.data;

      let folderQuery = supabase.from('task_folders').select('*').eq('user_id', userId);
      if (folder_id) folderQuery = folderQuery.eq('id', folder_id);
      else if (folder_name) folderQuery = folderQuery.ilike('name', `%${folder_name.trim()}%`);

      const { data: foldersFound } = await folderQuery.limit(1);
      const targetFolder = foldersFound?.[0];

      const targetDeadline = deadline || targetFolder?.due_date;
      if (!targetDeadline) {
        return {
          type: action.type,
          success: false,
          message: 'Please specify an exam/deadline date to distribute tasks across.',
        };
      }

      const { data: folderTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('folder_id', targetFolder?.id || folder_id)
        .neq('status', 'done')
        .order('created_at', { ascending: true });

      if (!folderTasks || folderTasks.length === 0) {
        return { type: action.type, success: false, message: 'No pending tasks found to distribute.' };
      }

      const plan = calculateSmartDistribution(folderTasks, targetDeadline);

      for (const item of plan.schedule) {
        await supabase
          .from('tasks')
          .update({
            due_date: new Date(item.suggestedDueDate).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.task.id);
      }

      await supabase.from('notifications').insert({
        user_id: userId,
        title: `✨ Smart Distributed "${targetFolder?.name || 'Folder'}" Tasks`,
        message: plan.summary,
        type: 'ai',
        action_url: '/tasks',
      });

      return {
        type: action.type,
        success: true,
        message: `Balanced ${folderTasks.length} tasks in "${targetFolder?.name || 'Folder'}": ${plan.summary}`,
        data: plan,
      };
    }

    if (action.type === 'generate_daily_plan') {
      const targetDate = action.data?.date || new Date().toISOString().split('T')[0];

      // 1. Fetch incomplete tasks, folders, profile
      const [tasksRes, foldersRes, profRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('user_id', userId).neq('status', 'done'),
        supabase.from('task_folders').select('*').eq('user_id', userId),
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      ]);

      const candidateTasks = (tasksRes.data || []) as any[];
      const folders = (foldersRes.data || []) as any[];
      const prof = profRes.data || {};

      const prefs = {
        startTime: prof.daily_start_time || '08:00',
        endTime: prof.daily_end_time || '21:00',
        highFocusStart: prof.high_focus_start || '09:00',
        highFocusEnd: prof.high_focus_end || '12:00',
        preferredBreakDuration: prof.preferred_break_duration || 15,
        maxDailyStudyMinutes: prof.max_daily_study_minutes || 480,
      };

      const plan = generateDeterministicDailyPlan({
        tasks: candidateTasks,
        folders,
        existingSessions: [],
        preferences: prefs,
        targetDate,
      });

      // 2. Wipe old items for target date and save new items
      await supabase
        .from('daily_schedule_items')
        .delete()
        .eq('user_id', userId)
        .eq('date', targetDate);

      if (plan.sessions.length > 0) {
        const payload = plan.sessions.map((item, idx) => ({
          user_id: userId,
          date: targetDate,
          task_id: item.task_id || null,
          session_type: item.session_type,
          start_time: item.start_time,
          end_time: item.end_time,
          duration_minutes: item.duration_minutes,
          title: item.title,
          difficulty: item.difficulty || 'medium',
          is_locked: false,
          is_completed: false,
          sort_order: idx,
        }));

        await supabase.from('daily_schedule_items').insert(payload);
      }

      await supabase.from('notifications').insert({
        user_id: userId,
        title: `✨ AI Daily Plan Generated for ${targetDate}`,
        message: `Scheduled ${plan.sessions.filter((i) => i.session_type !== 'break').length} tasks (${(plan.overview.totalPlannedMinutes / 60).toFixed(1)} hrs) with restorative breaks.`,
        type: 'ai',
        action_url: '/tasks',
      });

      return {
        type: action.type,
        success: true,
        message: `Daily plan generated for ${targetDate}: ${plan.sessions.filter((i) => i.session_type !== 'break').length} study sessions scheduled.`,
        data: plan.overview,
      };
    }

    return null;
  } catch (err: any) {
    console.error('executeAction exception:', err);
    return { type: action.type, success: false, message: err?.message || 'Action failed' };
  }
}

// ---------------------------------------------------------------------------
// Helper: Call Groq API (Ultra-Fast 500ms LPU)
// ---------------------------------------------------------------------------
async function tryCallGroq(
  apiKey: string,
  systemPrompt: string,
  messages: { role: string; content: string }[]
): Promise<string | null> {
  const models = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];

  const lastMsg = messages[messages.length - 1];
  const lastContent = `${lastMsg.content}\n\n[System Directive: Answer directly from the live platform data provided in the system instructions. If balance is $0.00, state that no transactions have been added to the Finance tab yet. Do not ask the user for spreadsheets, account forms, or bank statements. If the user asks you to log an expense, add a task, take a note, or check a habit, append the ACTION: {...} block at the end.]`;

  const groqMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    {
      role: 'user',
      content: lastContent,
    },
  ];

  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: groqMessages,
          temperature: 0.7,
          max_tokens: 2048,
        }),
      });

      if (!res.ok) {
        console.warn(`[Groq] Model ${model} returned status ${res.status}`);
        continue;
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content) {
        return content;
      }
    } catch (err) {
      console.warn(`[Groq] Error with model ${model}:`, err);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helper: Call Gemini API (Google Generative AI)
// ---------------------------------------------------------------------------
async function tryCallGemini(
  apiKey: string,
  systemPrompt: string,
  messages: { role: string; content: string }[]
): Promise<string | null> {
  const history: Content[] = [];

  for (const msg of messages.slice(0, -1)) {
    const geminiRole = msg.role === 'assistant' ? 'model' : 'user';

    if (history.length > 0 && history[history.length - 1].role === geminiRole) {
      history[history.length - 1].parts.push({ text: msg.content });
    } else {
      history.push({ role: geminiRole, parts: [{ text: msg.content }] });
    }
  }

  const lastMessage = messages[messages.length - 1];
  const currentPrompt = `${lastMessage.content}\n\n[System Directive: Answer directly from the live platform data provided in the system instructions. If balance is $0.00, state that no transactions have been added to the Finance tab yet. Do not ask the user for spreadsheets, account forms, or bank statements. If the user asks you to log an expense, add a task, take a note, or check a habit, append the ACTION: {...} block at the end.]`;

  const candidateModels = Array.from(
    new Set(
      [
        process.env.GEMINI_MODEL,
        'gemini-flash-lite-latest',
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash-lite',
        'gemini-3.8-flash',
        'gemini-flash-latest',
      ].filter(Boolean) as string[]
    )
  );

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelToTry of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelToTry,
        systemInstruction: systemPrompt,
      });

      const chat = model.startChat({ history });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout on model ${modelToTry}`)), 10000)
      );

      const result: any = await Promise.race([
        chat.sendMessage(currentPrompt),
        timeoutPromise,
      ]);

      const text = result.response.text();
      if (text) return text.trim();
    } catch (err) {
      console.warn(`[Gemini] Model ${modelToTry} failed:`, err);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// POST /api/ai
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    if (!groqKey && !geminiKey) {
      return NextResponse.json(
        { error: 'No AI API key is configured. Please set GROQ_API_KEY or GEMINI_API_KEY.' },
        { status: 500 }
      );
    }

    let body: {
      messages?: { role: string; content: string }[];
      persona?: string;
      userContext?: UserPlatformData;
      userName?: string;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { messages, persona, userContext, userName } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: '`messages` must be a non-empty array of {role, content}.' },
        { status: 400 }
      );
    }

    for (const msg of messages) {
      if (
        typeof msg.role !== 'string' ||
        typeof msg.content !== 'string' ||
        !msg.content.trim()
      ) {
        return NextResponse.json(
          { error: 'Each message must have a non-empty `role` and `content` string.' },
          { status: 400 }
        );
      }
    }

    const basePrompt =
      PERSONA_PROMPTS[persona ?? DEFAULT_PERSONA] ?? PERSONA_PROMPTS[DEFAULT_PERSONA];

    // ---- Assemble Live User Context from Database ----
    let liveContextPrompt = '';
    let authenticatedUser: any = null;
    let supabaseClient: any = null;

    try {
      supabaseClient = await createServerClient();
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      authenticatedUser = user;

      if (userContext) {
        liveContextPrompt = formatContextPrompt(userContext, userName);
      } else if (user) {
        const platformData = await fetchUserPlatformData(supabaseClient, user.id);
        const resolvedName =
          userName ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          'User';
        liveContextPrompt = formatContextPrompt(platformData, resolvedName);
      }
    } catch (err) {
      console.warn('Could not load user platform context from cookies:', err);
      if (userContext) {
        liveContextPrompt = formatContextPrompt(userContext, userName);
      }
    }

    const fullSystemPrompt = `${basePrompt}\n\n${ACTIONS_INSTRUCTION}\n\n${liveContextPrompt}`.trim();

    let rawReply: string | null = null;

    // 1. Try Groq first (Ultra-Fast ~500ms response)
    if (groqKey) {
      rawReply = await tryCallGroq(groqKey, fullSystemPrompt, messages);
    }

    // 2. Fall back to Gemini if Groq was unavailable
    if (!rawReply && geminiKey) {
      rawReply = await tryCallGemini(geminiKey, fullSystemPrompt, messages);
    }

    if (!rawReply) {
      return NextResponse.json(
        { error: 'AI service temporarily unavailable. Please try again in a few moments.' },
        { status: 503 }
      );
    }

    // ---- Parse and execute any ACTION block ----
    let cleanReply = rawReply;
    let actionExecuted: ActionExecuted | null = null;

    // Match ACTION: { ... } at the end or in markdown
    const actionPattern = /(?:```(?:json)?\s*)?ACTION:\s*(\{[\s\S]*?\})(?:\s*```)?\s*$/i;
    const match = rawReply.match(actionPattern);

    if (match) {
      try {
        const actionJson = JSON.parse(match[1]);
        cleanReply = rawReply.replace(actionPattern, '').trim();

        if (authenticatedUser && supabaseClient && actionJson?.type && actionJson?.data) {
          const resolvedName =
            userName ||
            authenticatedUser.user_metadata?.full_name ||
            authenticatedUser.email?.split('@')[0] ||
            'User';

          actionExecuted = await executeAction(
            supabaseClient,
            authenticatedUser.id,
            resolvedName,
            actionJson
          );
        }
      } catch (parseErr) {
        console.warn('Failed to parse or execute action block:', parseErr);
      }
    }

    return NextResponse.json({
      reply: cleanReply,
      action: actionExecuted,
    });
  } catch (err: unknown) {
    console.error('[/api/ai] Fatal Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
