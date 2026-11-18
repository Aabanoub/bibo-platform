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
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY;

  if (!groqKey && !geminiKey) {
    throw new Error('Neither GROQ_API_KEY nor GEMINI_API_KEY is configured.');
  }

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

  const prompt = `You are a friendly, motivational personal AI assistant for the app "Evolve".
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
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    } catch {}
  }

  // 2. Try Gemini
  if (geminiKey) {
    const candidateModels = [
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-flash-latest',
    ];
    const genAI = new GoogleGenerativeAI(geminiKey);
    let lastError: any = null;

    for (const modelToTry of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelToTry });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        if (text) return text;
      } catch (err: any) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    if (lastError) throw lastError;
  }

  throw new Error('Failed to generate daily summary from all candidate providers.');
}
