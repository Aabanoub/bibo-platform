-- ============================================================================
-- AbanoubApp — Complete Supabase Database Schema
-- ============================================================================

-- 1. Extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Custom Enum Types
-- ============================================================================
CREATE TYPE task_priority  AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE task_status    AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE transaction_type AS ENUM ('income', 'expense');
CREATE TYPE habit_frequency  AS ENUM ('daily', 'weekly');
CREATE TYPE chat_role        AS ENUM ('user', 'assistant');

-- 3. Tables
-- ============================================================================

-- 3.1  profiles
CREATE TABLE profiles (
    id         UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    full_name  TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2  notes
CREATE TABLE notes (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles (id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT,
    tags       TEXT[] DEFAULT '{}',
    is_pinned  BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.3  tasks
CREATE TABLE tasks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles (id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    priority    task_priority NOT NULL DEFAULT 'medium',
    status      task_status   NOT NULL DEFAULT 'todo',
    due_date    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.4  transactions
CREATE TABLE transactions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles (id) ON DELETE CASCADE,
    amount      DECIMAL(12, 2) NOT NULL,
    type        transaction_type NOT NULL,
    category    TEXT,
    description TEXT,
    date        DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.5  habits
CREATE TABLE habits (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles (id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    frequency   habit_frequency NOT NULL DEFAULT 'daily',
    icon        TEXT,
    color       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.6  habit_logs
CREATE TABLE habit_logs (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    habit_id     UUID NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
    user_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles (id) ON DELETE CASCADE,
    completed_at DATE NOT NULL DEFAULT CURRENT_DATE,
    notes        TEXT,
    UNIQUE (habit_id, completed_at)
);

-- 3.7  chat_messages
CREATE TABLE chat_messages (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles (id) ON DELETE CASCADE,
    role       chat_role NOT NULL,
    content    TEXT NOT NULL,
    persona    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.8  notifications
CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles (id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    message    TEXT,
    type       TEXT,
    is_read    BOOLEAN NOT NULL DEFAULT false,
    action_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.9  push_subscriptions
CREATE TABLE push_subscriptions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles (id) ON DELETE CASCADE,
    subscription JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.10 daily_summaries
CREATE TABLE daily_summaries (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles (id) ON DELETE CASCADE,
    summary_date DATE NOT NULL,
    content      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, summary_date)
);

-- 4. Indexes
-- ============================================================================

-- notes
CREATE INDEX idx_notes_user_id    ON notes (user_id);
CREATE INDEX idx_notes_is_pinned  ON notes (user_id, is_pinned) WHERE is_pinned = true;
CREATE INDEX idx_notes_created_at ON notes (created_at DESC);

-- tasks
CREATE INDEX idx_tasks_user_id    ON tasks (user_id);
CREATE INDEX idx_tasks_status     ON tasks (user_id, status);
CREATE INDEX idx_tasks_due_date   ON tasks (user_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_priority   ON tasks (user_id, priority);

-- transactions
CREATE INDEX idx_transactions_user_id ON transactions (user_id);
CREATE INDEX idx_transactions_date    ON transactions (user_id, date DESC);
CREATE INDEX idx_transactions_type    ON transactions (user_id, type);

-- habits
CREATE INDEX idx_habits_user_id ON habits (user_id);

-- habit_logs
CREATE INDEX idx_habit_logs_user_id      ON habit_logs (user_id);
CREATE INDEX idx_habit_logs_habit_id     ON habit_logs (habit_id);
CREATE INDEX idx_habit_logs_completed_at ON habit_logs (user_id, completed_at DESC);

-- chat_messages
CREATE INDEX idx_chat_messages_user_id    ON chat_messages (user_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages (user_id, created_at DESC);

-- notifications
CREATE INDEX idx_notifications_user_id ON notifications (user_id);
CREATE INDEX idx_notifications_unread  ON notifications (user_id, is_read) WHERE is_read = false;

-- push_subscriptions
CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions (user_id);

-- daily_summaries
CREATE INDEX idx_daily_summaries_user_id ON daily_summaries (user_id);
CREATE INDEX idx_daily_summaries_date    ON daily_summaries (user_id, summary_date DESC);

-- 5. Row Level Security
-- ============================================================================

-- Enable RLS on every table
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits             ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries    ENABLE ROW LEVEL SECURITY;

-- ---- profiles ----
CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Insert is handled by the trigger (see §6), but allow explicit inserts too
CREATE POLICY "Users can insert their own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete their own profile"
    ON profiles FOR DELETE
    USING (auth.uid() = id);

-- ---- notes ----
CREATE POLICY "Users can view their own notes"
    ON notes FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own notes"
    ON notes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notes"
    ON notes FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notes"
    ON notes FOR DELETE
    USING (auth.uid() = user_id);

-- ---- tasks ----
CREATE POLICY "Users can view their own tasks"
    ON tasks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tasks"
    ON tasks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks"
    ON tasks FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks"
    ON tasks FOR DELETE
    USING (auth.uid() = user_id);

-- ---- transactions ----
CREATE POLICY "Users can view their own transactions"
    ON transactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own transactions"
    ON transactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions"
    ON transactions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transactions"
    ON transactions FOR DELETE
    USING (auth.uid() = user_id);

-- ---- habits ----
CREATE POLICY "Users can view their own habits"
    ON habits FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own habits"
    ON habits FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own habits"
    ON habits FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own habits"
    ON habits FOR DELETE
    USING (auth.uid() = user_id);

-- ---- habit_logs ----
CREATE POLICY "Users can view their own habit logs"
    ON habit_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own habit logs"
    ON habit_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own habit logs"
    ON habit_logs FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own habit logs"
    ON habit_logs FOR DELETE
    USING (auth.uid() = user_id);

-- ---- chat_messages ----
CREATE POLICY "Users can view their own chat messages"
    ON chat_messages FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own chat messages"
    ON chat_messages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat messages"
    ON chat_messages FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat messages"
    ON chat_messages FOR DELETE
    USING (auth.uid() = user_id);

-- ---- notifications ----
CREATE POLICY "Users can view their own notifications"
    ON notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own notifications"
    ON notifications FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
    ON notifications FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
    ON notifications FOR DELETE
    USING (auth.uid() = user_id);

-- ---- push_subscriptions ----
CREATE POLICY "Users can view their own push subscriptions"
    ON push_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own push subscriptions"
    ON push_subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own push subscriptions"
    ON push_subscriptions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push subscriptions"
    ON push_subscriptions FOR DELETE
    USING (auth.uid() = user_id);

-- ---- daily_summaries ----
CREATE POLICY "Users can view their own daily summaries"
    ON daily_summaries FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own daily summaries"
    ON daily_summaries FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily summaries"
    ON daily_summaries FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own daily summaries"
    ON daily_summaries FOR DELETE
    USING (auth.uid() = user_id);

-- 6. Trigger — auto-create profile on signup
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
        COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', '')
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 7. Helper — auto-update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_profiles
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_notes
    BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_tasks
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 8. Enable Realtime on tables for live updates
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE notes;
ALTER PUBLICATION supabase_realtime ADD TABLE habit_logs;

