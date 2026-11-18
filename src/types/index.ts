// ============================================================================
// AbanoubApp — TypeScript type definitions (mirrors supabase/schema.sql)
// ============================================================================

// ---------------------------------------------------------------------------
// Enum union types
// ---------------------------------------------------------------------------

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "done";
export type TransactionType = "income" | "expense";
export type HabitFrequency = "daily" | "weekly";
export type ChatRole = "user" | "assistant";

// ---------------------------------------------------------------------------
// Table row interfaces
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  gender?: 'female' | 'male' | 'default';
  is_locked?: boolean;
  focus_duration?: number;
  short_break_duration?: number;
  long_break_duration?: number;
  nav_slots?: string[];
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string | null;
  tags: string[];
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  reminder_at?: string | null;
  reminder_sent?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: TransactionType;
  category: string | null;
  description: string | null;
  receipt_url?: string | null;
  date: string;
  created_at: string;
}

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  frequency: HabitFrequency;
  icon: string | null;
  color: string | null;
  created_at: string;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  user_id: string;
  completed_at: string;
  notes: string | null;
}

export interface ActionExecutionResult {
  type: string;
  success: boolean;
  message: string;
  data?: any;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  persona?: string | null;
  action?: ActionExecutionResult | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  type: string | null;
  is_read: boolean;
  action_url: string | null;
  event_id?: string | null;
  created_at: string;
}

export interface NotificationPreference {
  id?: string;
  user_id: string;
  in_app_enabled: boolean;
  browser_enabled: boolean;
  push_enabled: boolean;
  task_reminders: boolean;
  countdown_reminders: boolean;
  finance_alerts: boolean;
  salary_reminders: boolean;
  habit_reminders: boolean;
  ai_notifications: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduledNotification {
  id?: string;
  user_id: string;
  idempotency_key: string;
  title: string;
  message: string;
  category: 'task' | 'countdown' | 'salary' | 'habit' | 'finance' | 'ai' | 'reminder';
  action_url?: string;
  scheduled_for: string;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
  retry_count: number;
  last_error?: string | null;
  sent_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PushSubscription {
  id: string;
  user_id: string;
  subscription: Record<string, unknown>;
  created_at: string;
}

export interface DailySummary {
  id: string;
  user_id: string;
  date?: string;
  summary_date?: string;
  summary?: string | null;
  content?: string | null;
  tasks_completed?: number;
  transactions_count?: number;
  habits_completed?: number;
  created_at: string;
}

export type ReminderIntervalId = 'at_time' | '15m' | '1h' | '3h' | '1d' | '3d' | '1w';

export interface CountdownEvent {
  id: string;
  user_id?: string;
  title: string;
  description?: string | null;
  target_date: string; // ISO date-time string
  category: 'goal' | 'event' | 'travel' | 'birthday' | 'deadline' | 'exam' | 'launch' | 'other';
  emoji: string;
  color: 'blue' | 'purple' | 'pink' | 'emerald' | 'amber' | 'rose' | 'cyan';
  is_pinned?: boolean;
  reminder_intervals: ReminderIntervalId[];
  triggered_reminders?: string[]; // IDs of reminders that have already fired
  created_at: string;
  updated_at?: string;
}
