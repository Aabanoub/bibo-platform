import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIResponse {
  content: string;
  error?: string;
}

export interface DailySummaryData {
  tasks?: { title: string; completed: boolean }[];
  habits?: { name: string; completed: boolean }[];
  journalEntries?: string[];
  notesCreated?: number;
  goalsProgress?: { goal: string; progress: number }[];
  date?: string;
}

// ── Client-side: call the /api/ai route ─────────────────────────────────────

/**
 * Generate an AI response by calling the app's `/api/ai` endpoint.
 *
 * @param messages  Conversation history to send.
 * @param persona   Optional system persona / instruction that shapes the reply.
 * @returns         The AI-generated text, or an error message.
 */
export async function generateAIResponse(
  messages: ChatMessage[],
  persona?: string,
): Promise<AIResponse> {
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, persona }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      return {
        content: '',
        error: errorBody.error ?? `AI request failed with status ${response.status}`,
      };
    }

    const data = await response.json();
    return { content: data.reply ?? data.content ?? data.response ?? '' };
  } catch (error) {
    console.error('generateAIResponse error:', error);
    return {
      content: '',
      error: error instanceof Error ? error.message : 'Unknown error calling AI endpoint',
    };
  }
}

// ── Server-side: generate a daily summary with Gemini directly ──────────────

/**
 * Build a daily summary using the Google Generative AI (Gemini) SDK.
 *
 * **Server-side only** — relies on `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY` env var.
 *
 * @param data  Aggregated user data for the day.
 * @returns     A Markdown-formatted daily summary string.
 */
export async function generateDailySummary(data: DailySummaryData): Promise<string> {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key environment variable is not set.');
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const dateStr = data.date ?? new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Build a structured prompt from the available data sections
  const sections: string[] = [`Date: ${dateStr}`];

  if (data.tasks?.length) {
    const completed = data.tasks.filter((t) => t.completed).length;
    sections.push(
      `Tasks (${completed}/${data.tasks.length} completed):\n` +
        data.tasks.map((t) => `  ${t.completed ? '✅' : '⬜'} ${t.title}`).join('\n'),
    );
  }

  if (data.habits?.length) {
    const done = data.habits.filter((h) => h.completed).length;
    sections.push(
      `Habits (${done}/${data.habits.length}):\n` +
        data.habits.map((h) => `  ${h.completed ? '✅' : '⬜'} ${h.name}`).join('\n'),
    );
  }

  if (data.journalEntries?.length) {
    sections.push(
      `Journal Entries:\n` + data.journalEntries.map((e) => `  - ${e}`).join('\n'),
    );
  }

  if (data.notesCreated !== undefined) {
    sections.push(`Notes created today: ${data.notesCreated}`);
  }

  if (data.goalsProgress?.length) {
    sections.push(
      `Goals Progress:\n` +
        data.goalsProgress.map((g) => `  - ${g.goal}: ${g.progress}%`).join('\n'),
    );
  }

  const prompt = `You are a friendly, motivational personal AI assistant for the app "AbanoubApp".
Given the following daily activity data, write a concise daily summary in Markdown.
Include:
1. A brief greeting.
2. Key accomplishments and highlights.
3. Areas that need attention or were missed.
4. An encouraging closing message for tomorrow.

Keep the tone warm, supportive, and actionable.

--- User's Day ---
${sections.join('\n\n')}
--- End ---`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  return text;
}
