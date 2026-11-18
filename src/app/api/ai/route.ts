import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { createServerClient } from '@/lib/supabase-server';
import { fetchUserPlatformData, formatContextPrompt, UserPlatformData } from '@/lib/user-context';

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
  {"type": "create_task", "data": {"title": string, "priority": "low" | "medium" | "high" | "urgent", "due_date"?: "YYYY-MM-DD", "description"?: string}}
- create_note:
  {"type": "create_note", "data": {"title": string, "content": string, "tags"?: string[]}}
- complete_habit:
  {"type": "complete_habit", "data": {"habit_name": string}}

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
      const due_date = action.data.due_date ? new Date(action.data.due_date).toISOString() : null;

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          title,
          priority,
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
