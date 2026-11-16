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
  const lastContent = `${lastMsg.content}\n\n[System Directive: Answer directly from the live platform data provided in the system instructions. If balance is $0.00, state that no transactions have been added to the Finance tab yet. Do not ask the user for spreadsheets, account forms, or bank statements.]`;

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
  const currentPrompt = `${lastMessage.content}\n\n[System Directive: Answer directly from the live platform data provided in the system instructions. If balance is $0.00, state that no transactions have been added to the Finance tab yet. Do not ask the user for spreadsheets, account forms, or bank statements.]`;

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

    if (userContext) {
      liveContextPrompt = formatContextPrompt(userContext, userName);
    } else {
      try {
        const supabase = await createServerClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const platformData = await fetchUserPlatformData(supabase as any, user.id);
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
      }
    }

    const fullSystemPrompt = `${basePrompt}\n\n${liveContextPrompt}`.trim();

    let reply: string | null = null;

    // 1. Try Groq first (Ultra-Fast ~500ms response)
    if (groqKey) {
      reply = await tryCallGroq(groqKey, fullSystemPrompt, messages);
    }

    // 2. Fall back to Gemini if Groq was unavailable
    if (!reply && geminiKey) {
      reply = await tryCallGemini(geminiKey, fullSystemPrompt, messages);
    }

    if (!reply) {
      return NextResponse.json(
        { error: 'AI service temporarily unavailable. Please try again in a few moments.' },
        { status: 503 }
      );
    }

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    console.error('[/api/ai] Fatal Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
