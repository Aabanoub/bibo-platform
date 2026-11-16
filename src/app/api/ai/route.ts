import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, Content } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Persona system prompts
// ---------------------------------------------------------------------------
const PERSONA_PROMPTS: Record<string, string> = {
  'executive-assistant':
    "You are Abanoub's personal executive AI assistant. You help manage his day, prioritize tasks, draft messages, and think strategically. Be concise and action-oriented.",
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

  const groqMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
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
  const currentPrompt = lastMessage.content;

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

    let body: { messages?: { role: string; content: string }[]; persona?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { messages, persona } = body;

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

    const systemPrompt =
      PERSONA_PROMPTS[persona ?? DEFAULT_PERSONA] ?? PERSONA_PROMPTS[DEFAULT_PERSONA];

    let reply: string | null = null;

    // 1. Try Groq first (Ultra-Fast 500ms responses)
    if (groqKey) {
      reply = await tryCallGroq(groqKey, systemPrompt, messages);
    }

    // 2. Fall back to Gemini if Groq was unavailable or not set
    if (!reply && geminiKey) {
      reply = await tryCallGemini(geminiKey, systemPrompt, messages);
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
