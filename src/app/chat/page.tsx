'use client';

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { createClient } from '@/lib/supabase';
import { ChatMessage } from '@/types';
import {
  Send,
  Trash2,
  Bot,
  User,
  ChevronDown,
  Sparkles,
  Code2,
  Lightbulb,
  Target,
} from 'lucide-react';

const PERSONAS = [
  { id: 'executive-assistant', label: 'Executive Assistant', icon: Sparkles },
  { id: 'code-reviewer', label: 'Code Reviewer', icon: Code2 },
  { id: 'creative-brainstormer', label: 'Creative Brainstormer', icon: Lightbulb },
  { id: 'accountability-coach', label: 'Accountability Coach', icon: Target },
] as const;

type Persona = (typeof PERSONAS)[number]['id'];

// ---------------------------------------------------------------------------
// Minimal markdown renderer – handles bold, inline code, fenced code blocks,
// unordered / ordered lists, and paragraphs. No external dependency needed.
// ---------------------------------------------------------------------------
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre
          key={key++}
          className="my-2 overflow-x-auto rounded-lg bg-black/40 p-3 text-sm leading-relaxed"
        >
          <code className="text-emerald-400">{codeLines.join('\n')}</code>
          {lang && (
            <span className="mt-1 block text-[10px] uppercase tracking-wider text-zinc-500">
              {lang}
            </span>
          )}
        </pre>,
      );
      continue;
    }

    // Unordered list item
    if (/^[\s]*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\s]*[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*[-*]\s/, ''));
        i++;
      }
      elements.push(
        <ul key={key++} className="my-1 list-disc space-y-0.5 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{inlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list item
    if (/^[\s]*\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\s]*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={key++} className="my-1 list-decimal space-y-0.5 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{inlineMarkdown(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Empty line → spacing
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="my-1">
        {inlineMarkdown(line)}
      </p>,
    );
    i++;
  }

  return <>{elements}</>;
}

/** Handles **bold**, `inline code`, and plain text within a single line. */
function inlineMarkdown(text: string): React.ReactNode {
  // Split by bold and inline code markers
  const parts: React.ReactNode[] = [];
  // Regex: (`code`) or (**bold**) or (*bold*)
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('`')) {
      parts.push(
        <code
          key={match.index}
          className="rounded bg-black/30 px-1 py-0.5 text-sm text-amber-300"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ---------------------------------------------------------------------------
// Animated typing dots
// ---------------------------------------------------------------------------
function TypingIndicator() {
  return (
    <div className="flex items-end gap-3 px-4 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700">
        <Bot size={16} className="text-zinc-300" />
      </div>
      <div className="rounded-2xl rounded-bl-md bg-zinc-800 px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat Page
// ---------------------------------------------------------------------------
export default function ChatPage() {
  const supabase = createClient();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [persona, setPersona] = useState<Persona>('executive-assistant');
  const [personaOpen, setPersonaOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close persona dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPersonaOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-scroll on new messages / loading change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Load chat history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setInitialLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Failed to load chat history:', error);
        } else if (data) {
          setMessages(data as ChatMessage[]);
        }
      } catch (err) {
        console.error('Error loading chat history:', err);
      } finally {
        setInitialLoading(false);
      }
    }

    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------ helpers ------

  const saveMessage = useCallback(
    async (role: 'user' | 'assistant', content: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('chat_messages')
        .insert({ user_id: user.id, role, content, persona })
        .select()
        .single();

      if (error) {
        console.error('Failed to save message:', error);
        return null;
      }
      return data as ChatMessage;
    },
    [supabase, persona],
  );

  const handleSend = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || loading) return;

      setInput('');
      setLoading(true);

      // Optimistic user bubble
      const optimisticUser: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
        persona,
      } as ChatMessage;
      setMessages((prev) => [...prev, optimisticUser]);

      try {
        // 1. Save user message
        const savedUser = await saveMessage('user', text);
        if (savedUser) {
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticUser.id ? savedUser : m)),
          );
        }

        // 2. Build conversation for API (last 50 messages for context window)
        const recentMessages = [...messages, optimisticUser].slice(-50).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // 3. Call AI API
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: recentMessages, persona }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `API error ${res.status}`);
        }

        const { reply } = await res.json();

        // 4. Save assistant response
        const savedAssistant = await saveMessage('assistant', reply);
        const assistantMsg: ChatMessage = savedAssistant ?? ({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: reply,
          created_at: new Date().toISOString(),
          persona,
        } as ChatMessage);

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: unknown) {
        const errorContent =
          err instanceof Error ? err.message : 'Something went wrong. Please try again.';
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `⚠️ Error: ${errorContent}`,
          created_at: new Date().toISOString(),
          persona,
        } as ChatMessage;
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [input, loading, messages, persona, saveMessage],
  );

  const handleClearChat = useCallback(async () => {
    if (!confirm('Clear all chat messages? This cannot be undone.')) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('chat_messages').delete().eq('user_id', user.id);
      }
      setMessages([]);
    } catch (err) {
      console.error('Failed to clear chat:', err);
    }
  }, [supabase]);

  // Handle Enter to send (Shift+Enter for new line)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const activePersona = PERSONAS.find((p) => p.id === persona) ?? PERSONAS[0];
  const ActiveIcon = activePersona.icon;

  // ------ render ------

  return (
    <div className="flex h-full min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* ---- Header ---- */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600">
            <Bot size={18} className="text-white" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">AI Chat</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Persona selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setPersonaOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm transition hover:border-zinc-600 hover:bg-zinc-800"
            >
              <ActiveIcon size={14} className="text-blue-400" />
              <span className="hidden sm:inline">{activePersona.label}</span>
              <ChevronDown
                size={14}
                className={`text-zinc-400 transition-transform ${personaOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {personaOpen && (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
                {PERSONAS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setPersona(p.id);
                        setPersonaOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-zinc-800 ${
                        persona === p.id ? 'bg-zinc-800 text-blue-400' : 'text-zinc-300'
                      }`}
                    >
                      <Icon size={16} />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Clear chat */}
          <button
            onClick={handleClearChat}
            title="Clear chat"
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-red-400"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      {/* ---- Messages ---- */}
      <main className="flex-1 overflow-y-auto px-2 py-4 sm:px-4">
        <div className="mx-auto max-w-3xl space-y-2">
          {initialLoading ? (
            <div className="flex items-center justify-center py-32">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-32 text-center text-zinc-500">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
                <Sparkles size={28} className="text-blue-500" />
              </div>
              <p className="text-lg font-medium text-zinc-300">
                Start a conversation
              </p>
              <p className="max-w-sm text-sm">
                Select a persona and type a message below to chat with your AI assistant.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
                >
                  {/* Avatar */}
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      isUser
                        ? 'bg-gradient-to-br from-blue-600 to-blue-500'
                        : 'bg-zinc-700'
                    }`}
                  >
                    {isUser ? (
                      <User size={16} className="text-white" />
                    ) : (
                      <Bot size={16} className="text-zinc-300" />
                    )}
                  </div>

                  {/* Bubble */}
                  <div
                    className={`group relative max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[70%] ${
                      isUser
                        ? 'rounded-br-md bg-blue-600 text-white'
                        : 'rounded-bl-md bg-zinc-800 text-zinc-100'
                    }`}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="prose-invert">{renderMarkdown(msg.content)}</div>
                    )}

                    {/* Timestamp */}
                    {msg.created_at && (
                      <span
                        className={`mt-1 block text-[10px] ${
                          isUser ? 'text-blue-200' : 'text-zinc-500'
                        }`}
                      >
                        {formatTime(msg.created_at)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* ---- Input ---- */}
      <footer className="sticky bottom-0 border-t border-zinc-800 bg-zinc-950/90 px-2 py-3 backdrop-blur-md sm:px-4">
        <form
          onSubmit={handleSend}
          className="mx-auto flex max-w-3xl items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="max-h-36 min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
          >
            <Send size={18} />
          </button>
        </form>
        <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-zinc-600">
          AI can make mistakes. Verify important information.
        </p>
      </footer>
    </div>
  );
}
