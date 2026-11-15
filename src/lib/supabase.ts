import { createBrowserClient } from "@supabase/ssr";

/**
 * AbanoubApp Supabase Client with full Beta / Demo Mode support.
 *
 * - When real NEXT_PUBLIC_SUPABASE_URL & ANON_KEY are set, it connects to Supabase.
 * - When in Beta Mode (or using placeholder keys), it transparently provides a reactive
 *   localStorage data layer so you can test all features (Notes, Tasks, Finance, Habits, AI Chat)
 *   out of the box with ANY email & password!
 */

export interface BetaUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

const DEFAULT_BETA_USER: BetaUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "abanoub@app.local",
  name: "Abanoub",
};

export function getStoredBetaUser(): BetaUser | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("abanoub_beta_user");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
}

export function setStoredBetaUser(user: BetaUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem("abanoub_beta_user", JSON.stringify(user));
  document.cookie = `abanoub_beta_user=${encodeURIComponent(
    JSON.stringify(user)
  )}; path=/; max-age=2592000; SameSite=Lax`;
}

export function clearStoredBetaUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("abanoub_beta_user");
  document.cookie = "abanoub_beta_user=; path=/; max-age=0; SameSite=Lax";
}

// ---------------------------------------------------------------------------
// LocalStorage Mock DB for Beta / Offline Mode
// ---------------------------------------------------------------------------

const SEED_DATA: Record<string, any[]> = {
  notes: [
    {
      id: "note-1",
      user_id: DEFAULT_BETA_USER.id,
      title: "Welcome to your Second Brain 🧠",
      content:
        "This is your private knowledge base.\n\n- Auto-saving is enabled automatically as you write\n- Tag your notes to group related thoughts\n- Pin critical notes to the top\n- Search title and body instantly in the sidebar",
      tags: ["welcome", "getting-started"],
      is_pinned: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  tasks: [
    {
      id: "task-1",
      user_id: DEFAULT_BETA_USER.id,
      title: "Explore the AbanoubApp platform",
      description: "Check out Notes, Tasks, Finance, Habits, and AI Chat",
      priority: "high",
      status: "in_progress",
      due_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "task-2",
      user_id: DEFAULT_BETA_USER.id,
      title: "Connect real Supabase database",
      description: "Paste supabase/schema.sql into the Supabase SQL editor",
      priority: "urgent",
      status: "todo",
      due_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "task-3",
      user_id: DEFAULT_BETA_USER.id,
      title: "Architecture & Framework setup",
      description: "Next.js 14 App Router with Tailwind CSS and dark mode",
      priority: "medium",
      status: "done",
      due_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  habits: [
    {
      id: "habit-1",
      user_id: DEFAULT_BETA_USER.id,
      name: "Drink 2L Water",
      description: "Daily hydration target",
      frequency: "daily",
      icon: "💧",
      color: "#3b82f6",
      created_at: new Date().toISOString(),
    },
    {
      id: "habit-2",
      user_id: DEFAULT_BETA_USER.id,
      name: "Read 20 Minutes",
      description: "Learning & growth",
      frequency: "daily",
      icon: "📚",
      color: "#8b5cf6",
      created_at: new Date().toISOString(),
    },
    {
      id: "habit-3",
      user_id: DEFAULT_BETA_USER.id,
      name: "Daily Workout",
      description: "Exercise / gym session",
      frequency: "daily",
      icon: "💪",
      color: "#22c55e",
      created_at: new Date().toISOString(),
    },
  ],
  habit_logs: [
    {
      id: "hlog-1",
      habit_id: "habit-1",
      user_id: DEFAULT_BETA_USER.id,
      completed_at: new Date().toISOString().split("T")[0],
      notes: null,
    },
  ],
  transactions: [
    {
      id: "tx-1",
      user_id: DEFAULT_BETA_USER.id,
      amount: 2500,
      type: "income",
      category: "Salary",
      description: "Monthly Salary",
      date: new Date().toISOString().split("T")[0],
      created_at: new Date().toISOString(),
    },
    {
      id: "tx-2",
      user_id: DEFAULT_BETA_USER.id,
      amount: 35,
      type: "expense",
      category: "Food",
      description: "Lunch with friends",
      date: new Date().toISOString().split("T")[0],
      created_at: new Date().toISOString(),
    },
  ],
  chat_messages: [
    {
      id: "msg-1",
      user_id: DEFAULT_BETA_USER.id,
      role: "assistant",
      content:
        "Hello Abanoub! I am your personal AI assistant. How can I help you today? You can ask me to summarize tasks, brainstorm ideas, review code, or coach you through your goals.",
      persona: "executive-assistant",
      created_at: new Date().toISOString(),
    },
  ],
  notifications: [
    {
      id: "notif-1",
      user_id: DEFAULT_BETA_USER.id,
      title: "Welcome to AbanoubApp Beta 🎉",
      message: "You are signed in! Any email and password works in beta mode.",
      type: "info",
      is_read: false,
      action_url: "/",
      created_at: new Date().toISOString(),
    },
  ],
};

function getTableData(table: string): any[] {
  if (typeof window === "undefined") return SEED_DATA[table] || [];
  const key = `abanoub_mock_${table}`;
  const raw = localStorage.getItem(key);
  if (!raw) {
    const seed = SEED_DATA[table] || [];
    localStorage.setItem(key, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function setTableData(table: string, data: any[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`abanoub_mock_${table}`, JSON.stringify(data));
}

class MockQueryBuilder {
  private table: string;
  private filters: ((row: any) => boolean)[] = [];
  private orderCol?: string;
  private orderAsc = true;
  private limitN?: number;
  private isSingle = false;
  private isCountOnly = false;
  private action: "select" | "insert" | "update" | "delete" = "select";
  private insertData?: any;
  private updateData?: any;

  constructor(table: string) {
    this.table = table;
  }

  select(_columns = "*", options?: { count?: string; head?: boolean }) {
    this.action = "select";
    if (options?.head || options?.count) {
      this.isCountOnly = true;
    }
    return this;
  }

  insert(data: any) {
    this.action = "insert";
    this.insertData = data;
    return this;
  }

  update(data: any) {
    this.action = "update";
    this.updateData = data;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push((row) => row[col] === val);
    return this;
  }

  neq(col: string, val: any) {
    this.filters.push((row) => row[col] !== val);
    return this;
  }

  gte(col: string, val: any) {
    this.filters.push((row) => (row[col] ?? "") >= val);
    return this;
  }

  lt(col: string, val: any) {
    this.filters.push((row) => (row[col] ?? "") < val);
    return this;
  }

  order(col: string, options?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = options?.ascending ?? true;
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  private execute() {
    let rows = [...getTableData(this.table)];

    if (this.action === "insert") {
      const toInsert = Array.isArray(this.insertData)
        ? this.insertData
        : [this.insertData];
      const insertedRows = toInsert.map((item) => ({
        id: item.id || `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        created_at: item.created_at || new Date().toISOString(),
        updated_at: item.updated_at || new Date().toISOString(),
        ...item,
      }));
      rows = [...insertedRows, ...rows];
      setTableData(this.table, rows);

      const result = this.isSingle ? insertedRows[0] : insertedRows;
      return { data: result, error: null };
    }

    if (this.action === "update") {
      rows = rows.map((row) => {
        const matches = this.filters.every((f) => f(row));
        return matches
          ? { ...row, ...this.updateData, updated_at: new Date().toISOString() }
          : row;
      });
      setTableData(this.table, rows);
      return { data: rows, error: null };
    }

    if (this.action === "delete") {
      rows = rows.filter((row) => !this.filters.every((f) => f(row)));
      setTableData(this.table, rows);
      return { data: null, error: null };
    }

    // Select
    let filtered = rows.filter((row) => this.filters.every((f) => f(row)));

    if (this.orderCol) {
      const col = this.orderCol;
      const asc = this.orderAsc;
      filtered.sort((a, b) => {
        if (a[col] === b[col]) return 0;
        if (asc) return a[col] > b[col] ? 1 : -1;
        return a[col] < b[col] ? 1 : -1;
      });
    }

    const count = filtered.length;

    if (this.limitN) {
      filtered = filtered.slice(0, this.limitN);
    }

    if (this.isCountOnly) {
      return { data: null, count, error: null };
    }

    if (this.isSingle) {
      return { data: filtered[0] ?? null, count, error: null };
    }

    return { data: filtered, count, error: null };
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    try {
      const res = this.execute();
      return Promise.resolve(res).then(onfulfilled, onrejected);
    } catch (err) {
      return Promise.reject(err).then(onfulfilled, onrejected);
    }
  }
}

function createMockSupabaseClient() {
  return {
    from: (table: string) => new MockQueryBuilder(table),
    channel: (_name: string) => {
      const chan = {
        on: () => chan,
        subscribe: () => chan,
      };
      return chan;
    },
    removeChannel: () => {},
    auth: {
      async getUser() {
        const beta = getStoredBetaUser() || DEFAULT_BETA_USER;
        return {
          data: {
            user: {
              id: beta.id,
              email: beta.email,
              user_metadata: {
                full_name: beta.name,
                name: beta.name,
              },
              app_metadata: {},
              aud: "authenticated",
              created_at: new Date().toISOString(),
              role: "authenticated",
            },
          },
          error: null,
        };
      },
      async signInWithPassword({ email }: { email: string; password?: string }) {
        const beta: BetaUser = {
          id: DEFAULT_BETA_USER.id,
          email: email.trim() || DEFAULT_BETA_USER.email,
          name: email.split("@")[0] || DEFAULT_BETA_USER.name,
        };
        setStoredBetaUser(beta);
        return {
          data: {
            user: {
              id: beta.id,
              email: beta.email,
              user_metadata: { full_name: beta.name },
            },
            session: { access_token: "beta-token" },
          },
          error: null,
        };
      },
      async signUp({ email }: { email: string; password?: string }) {
        return this.signInWithPassword({ email });
      },
      async signOut() {
        clearStoredBetaUser();
        return { error: null };
      },
      onAuthStateChange(callback: (event: string, session: any) => void) {
        const beta = getStoredBetaUser() || DEFAULT_BETA_USER;
        setTimeout(() => {
          callback("SIGNED_IN", {
            user: {
              id: beta.id,
              email: beta.email,
              user_metadata: { full_name: beta.name },
            },
          });
        }, 10);
        return {
          data: {
            subscription: {
              unsubscribe: () => {},
            },
          },
        };
      },
    },
  };
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isPlaceholder =
    !url ||
    !anonKey ||
    url.includes("placeholder.supabase.co") ||
    anonKey.includes("placeholder");

  if (isPlaceholder) {
    return createMockSupabaseClient() as any;
  }

  // Real Supabase client
  const client = createBrowserClient(url, anonKey);

  // Wrap getUser to also support Beta User fallback
  const originalGetUser = client.auth.getUser.bind(client.auth);
  client.auth.getUser = async () => {
    try {
      const res = await originalGetUser();
      if (res.data?.user) return res;
    } catch {}

    const beta = getStoredBetaUser();
    if (beta) {
      return {
        data: {
          user: {
            id: beta.id,
            email: beta.email,
            user_metadata: { full_name: beta.name, name: beta.name },
            app_metadata: {},
            aud: "authenticated",
            created_at: new Date().toISOString(),
            role: "authenticated",
          } as any,
        },
        error: null,
      };
    }

    return { data: { user: null }, error: null };
  };

  const originalSignOut = client.auth.signOut.bind(client.auth);
  client.auth.signOut = async () => {
    clearStoredBetaUser();
    return originalSignOut();
  };

  return client;
}
