import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, Content } from '@google/generative-ai';

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
    // Gemini expects alternating user / model turns. We map the incoming
    // messages accordingly and ensure the conversation starts with a user turn.
    const history: Content[] = [];

    for (const msg of messages.slice(0, -1)) {
      const geminiRole = msg.role === 'assistant' ? 'model' : 'user';

      // Gemini disallows two consecutive turns by the same role. Merge if needed.
      if (history.length > 0 && history[history.length - 1].role === geminiRole) {
        history[history.length - 1].parts.push({ text: msg.content });
      } else {
        history.push({ role: geminiRole, parts: [{ text: msg.content }] });
      }
    }

    // The last message is the current user prompt.
    const lastMessage = messages[messages.length - 1];
    const currentPrompt = lastMessage.content;

    // --- Call Gemini ---
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: systemPrompt,
    });

    const chat = model.startChat({
      history,
    });

    const result = await chat.sendMessage(currentPrompt);
    const response = result.response;
    const reply = response.text();

    if (!reply) {
      return NextResponse.json(
        { error: 'Gemini returned an empty response.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    console.error('[/api/ai] Error:', err);

    // Surface Gemini-specific blocked-prompt errors
    const message =
      err instanceof Error ? err.message : 'Internal server error';

    const status =
      message.includes('SAFETY') || message.includes('blocked')
        ? 400
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
