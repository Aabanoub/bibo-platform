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
// POST /api/ai
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    // --- Validate API key ---
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key is not configured on the server. Please set GEMINI_API_KEY or GOOGLE_AI_API_KEY.' },
        { status: 500 },
      );
    }

    // --- Parse body ---
    let body: { messages?: { role: string; content: string }[]; persona?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body.' },
        { status: 400 },
      );
    }

    const { messages, persona } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: '`messages` must be a non-empty array of {role, content}.' },
        { status: 400 },
      );
    }

    // Validate every message has role + content strings
    for (const msg of messages) {
      if (
        typeof msg.role !== 'string' ||
        typeof msg.content !== 'string' ||
        !msg.content.trim()
      ) {
        return NextResponse.json(
          { error: 'Each message must have a non-empty `role` and `content` string.' },
          { status: 400 },
        );
      }
    }

    const systemPrompt =
      PERSONA_PROMPTS[persona ?? DEFAULT_PERSONA] ??
      PERSONA_PROMPTS[DEFAULT_PERSONA];

    // --- Build Gemini chat history ---
    const history: Content[] = [];

    for (const msg of messages.slice(0, -1)) {
      const geminiRole = msg.role === 'assistant' ? 'model' : 'user';

      if (history.length > 0 && history[history.length - 1].role === geminiRole) {
        history[history.length - 1].parts.push({ text: msg.content });
      } else {
        history.push({ role: geminiRole, parts: [{ text: msg.content }] });
      }
    }

    // Current user prompt
    const lastMessage = messages[messages.length - 1];
    const currentPrompt = lastMessage.content;

    // Tested and verified fast candidate models
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
    let reply = '';
    let lastError: any = null;

    for (const modelToTry of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelToTry,
          systemInstruction: systemPrompt,
        });

        const chat = model.startChat({
          history,
        });

        // 12-second timeout per individual model call to prevent Vercel 504 gateway timeout
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout on model ${modelToTry}`)), 12000)
        );

        const result: any = await Promise.race([
          chat.sendMessage(currentPrompt),
          timeoutPromise,
        ]);

        reply = result.response.text();

        if (reply) {
          break; // Succeeded!
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || '';

        // If high demand (503), rate limit (429), or 404, cascade to next candidate model
        if (
          errMsg.includes('503') ||
          errMsg.includes('high demand') ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('404') ||
          errMsg.includes('not found') ||
          errMsg.includes('no longer available') ||
          errMsg.includes('Timeout')
        ) {
          console.warn(`[AI] Model ${modelToTry} busy or timed out (${errMsg.slice(0, 60)}...). Trying next model...`);
          continue;
        }

        // Safety or blocked errors should fail fast
        throw err;
      }
    }

    if (!reply && lastError) {
      throw lastError;
    }

    if (!reply) {
      return NextResponse.json(
        { error: 'Gemini returned an empty response. Please try again.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    console.error('[/api/ai] Error:', err);

    const message =
      err instanceof Error ? err.message : 'Internal server error';

    // Friendly message for high demand if all fallbacks failed
    if (message.includes('503') || message.includes('high demand') || message.includes('Timeout')) {
      return NextResponse.json(
        { error: 'Google Gemini servers are currently experiencing peak global demand. Please try sending your message again in a few moments.' },
        { status: 503 }
      );
    }

    const status =
      message.includes('SAFETY') || message.includes('blocked')
        ? 400
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
