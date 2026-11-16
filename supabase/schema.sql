-- ============================================================================
-- AbanoubApp Complete Supabase Database Schema
-- Run this in the Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Custom ENUM Types
DO $$ BEGIN
    CREATE TYPE task_priority AS ENUM ('urgent', 'high', 'medium', 'low');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE transaction_type AS ENUM ('income', 'expense');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE habit_frequency AS ENUM ('daily', 'weekly');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE chat_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 3. Core Tables
-- ============================================================================

-- 3.1  profiles
CREATE TABLE IF NOT EXISTS profiles (
    id                    UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    full_name             TEXT,
    avatar_url            TEXT,
    gender                TEXT NOT NULL DEFAULT 'default',
    is_locked             BOOLEAN NOT NULL DEFAULT false,
    focus_duration        INT NOT NULL DEFAULT 25,
    short_break_duration  INT NOT NULL DEFAULT 5,
    long_break_duration   INT NOT NULL DEFAULT 15,
    nav_slots             TEXT[] NOT NULL DEFAULT '{"notes", "tasks", "finance", "chat"}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2  notes
CREATE TABLE IF NOT EXISTS notes (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT,
    tags       TEXT[] DEFAULT '{}',
    is_pinned  BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.3  tasks
CREATE TABLE IF NOT EXISTS tasks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    priority    task_priority NOT NULL DEFAULT 'medium',
    status      task_status   NOT NULL DEFAULT 'todo',
    due_date    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.4  transactions
CREATE TABLE IF NOT EXISTS transactions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    amount      DECIMAL(12, 2) NOT NULL,
    type        transaction_type NOT NULL,
    category    TEXT,
    description TEXT,
    receipt_url TEXT,
    date        DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.5  habits
CREATE TABLE IF NOT EXISTS habits (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    frequency   habit_frequency NOT NULL DEFAULT 'daily',
    icon        TEXT,
    color       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.6  habit_logs
CREATE TABLE IF NOT EXISTS habit_logs (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    habit_id     UUID NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
    user_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    completed_at DATE NOT NULL DEFAULT CURRENT_DATE,
    notes        TEXT,
    UNIQUE (habit_id, completed_at)
);

-- 3.7  chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    role       chat_role NOT NULL,
    content    TEXT NOT NULL,
    persona    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.8  notifications
CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    message    TEXT,
    type       TEXT,
    is_read    BOOLEAN NOT NULL DEFAULT false,
    action_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.9  push_subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    subscription JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.10 daily_summaries
CREATE TABLE IF NOT EXISTS daily_summaries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    date                DATE NOT NULL DEFAULT CURRENT_DATE,
    summary_date        DATE,
    summary             TEXT,
    content             TEXT,
    tasks_completed     INT NOT NULL DEFAULT 0,
    transactions_count  INT NOT NULL DEFAULT 0,
    habits_completed    INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, date)
);

-- 3.11 countdown_events
CREATE TABLE IF NOT EXISTS countdown_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    description         TEXT,
    target_date         TIMESTAMPTZ NOT NULL,
    category            TEXT NOT NULL DEFAULT 'event',
    emoji               TEXT NOT NULL DEFAULT '⏳',
    color               TEXT NOT NULL DEFAULT 'blue',
    is_pinned           BOOLEAN NOT NULL DEFAULT false,
    reminder_intervals  TEXT[] NOT NULL DEFAULT '{"at_time", "1h", "1d"}',
    triggered_reminders TEXT[] NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_notes_user_id             ON notes (user_id);
CREATE INDEX IF NOT EXISTS idx_notes_is_pinned           ON notes (user_id, is_pinned);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id             ON tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status              ON tasks (user_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id      ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date         ON transactions (user_id, date);
CREATE INDEX IF NOT EXISTS idx_habits_user_id            ON habits (user_id);
CREATE INDEX IF NOT EXISTS idx_habit_logs_user_id        ON habit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date     ON habit_logs (habit_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id     ON chat_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id     ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_user_id         ON push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_user_date ON daily_summaries (user_id, summary_date);
CREATE INDEX IF NOT EXISTS idx_countdown_events_user_id  ON countdown_events (user_id);
CREATE INDEX IF NOT EXISTS idx_countdown_events_target   ON countdown_events (user_id, target_date);

-- ============================================================================
-- 5. Row-Level Security (RLS) Policies
-- ============================================================================

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
ALTER TABLE countdown_events   ENABLE ROW LEVEL SECURITY;

-- Helper to safely drop old policies before creating new ones
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
    DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
    DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
    DROP POLICY IF EXISTS "Users can delete their own profile" ON profiles;

    DROP POLICY IF EXISTS "Users can view their own notes" ON notes;
    DROP POLICY IF EXISTS "Users can create their own notes" ON notes;
    DROP POLICY IF EXISTS "Users can update their own notes" ON notes;
    DROP POLICY IF EXISTS "Users can delete their own notes" ON notes;

    DROP POLICY IF EXISTS "Users can view their own tasks" ON tasks;
    DROP POLICY IF EXISTS "Users can create their own tasks" ON tasks;
    DROP POLICY IF EXISTS "Users can update their own tasks" ON tasks;
    DROP POLICY IF EXISTS "Users can delete their own tasks" ON tasks;

    DROP POLICY IF EXISTS "Users can view their own transactions" ON transactions;
    DROP POLICY IF EXISTS "Users can create their own transactions" ON transactions;
    DROP POLICY IF EXISTS "Users can update their own transactions" ON transactions;
    DROP POLICY IF EXISTS "Users can delete their own transactions" ON transactions;

    DROP POLICY IF EXISTS "Users can view their own habits" ON habits;
    DROP POLICY IF EXISTS "Users can create their own habits" ON habits;
    DROP POLICY IF EXISTS "Users can update their own habits" ON habits;
    DROP POLICY IF EXISTS "Users can delete their own habits" ON habits;

    DROP POLICY IF EXISTS "Users can view their own habit logs" ON habit_logs;
    DROP POLICY IF EXISTS "Users can create their own habit logs" ON habit_logs;
    DROP POLICY IF EXISTS "Users can delete their own habit logs" ON habit_logs;

    DROP POLICY IF EXISTS "Users can view their own chat messages" ON chat_messages;
    DROP POLICY IF EXISTS "Users can insert their own chat messages" ON chat_messages;
    DROP POLICY IF EXISTS "Users can delete their own chat messages" ON chat_messages;

    DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
    DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
    DROP POLICY IF EXISTS "Users can create their own notifications" ON notifications;
    DROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications;

    DROP POLICY IF EXISTS "Users can view their own subscriptions" ON push_subscriptions;
    DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON push_subscriptions;

    DROP POLICY IF EXISTS "Users can view their own daily summaries" ON daily_summaries;
    DROP POLICY IF EXISTS "Users can create their own daily summaries" ON daily_summaries;
    DROP POLICY IF EXISTS "Users can delete their own daily summaries" ON daily_summaries;
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- Profiles Policies
CREATE POLICY "Users can view their own profile"   ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can delete their own profile" ON profiles FOR DELETE USING (auth.uid() = id);

-- Notes Policies
CREATE POLICY "Users can view their own notes"   ON notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own notes" ON notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own notes" ON notes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notes" ON notes FOR DELETE USING (auth.uid() = user_id);

-- Tasks Policies
CREATE POLICY "Users can view their own tasks"   ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own tasks" ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own tasks" ON tasks FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own tasks" ON tasks FOR DELETE USING (auth.uid() = user_id);

-- Transactions Policies
CREATE POLICY "Users can view their own transactions"   ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own transactions" ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own transactions" ON transactions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own transactions" ON transactions FOR DELETE USING (auth.uid() = user_id);

-- Habits Policies
CREATE POLICY "Users can view their own habits"   ON habits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own habits" ON habits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own habits" ON habits FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own habits" ON habits FOR DELETE USING (auth.uid() = user_id);

-- Habit Logs Policies
CREATE POLICY "Users can view their own habit logs"   ON habit_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own habit logs" ON habit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own habit logs" ON habit_logs FOR DELETE USING (auth.uid() = user_id);

-- Chat Messages Policies
CREATE POLICY "Users can view their own chat messages"   ON chat_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own chat messages" ON chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own chat messages" ON chat_messages FOR DELETE USING (auth.uid() = user_id);

-- Notifications Policies
CREATE POLICY "Users can view their own notifications"   ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can create their own notifications" ON notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notifications" ON notifications FOR DELETE USING (auth.uid() = user_id);

-- Push Subscriptions Policies
CREATE POLICY "Users can view their own subscriptions"   ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own subscriptions" ON push_subscriptions FOR ALL    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Daily Summaries Policies
CREATE POLICY "Users can view their own daily summaries"   ON daily_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own daily summaries" ON daily_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own daily summaries" ON daily_summaries FOR DELETE USING (auth.uid() = user_id);

-- Countdown Events Policies
CREATE POLICY "Users can view their own countdown events"   ON countdown_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own countdown events" ON countdown_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own countdown events" ON countdown_events FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own countdown events" ON countdown_events FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- 6. Trigger — auto-create profile on signup & backfill
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        full_name,
        avatar_url,
        gender,
        is_locked
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
        COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', ''),
        COALESCE(NEW.raw_user_meta_data ->> 'gender', 'default'),
        COALESCE((NEW.raw_user_meta_data ->> 'is_locked')::boolean, false)
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        gender = COALESCE(NULLIF(EXCLUDED.gender, 'default'), profiles.gender);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Automatically backfill any existing users who do not have a profile row yet
INSERT INTO public.profiles (id, full_name)
SELECT id, COALESCE(raw_user_meta_data ->> 'full_name', email)
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 7. Trigger — auto-update updated_at timestamp
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

DROP TRIGGER IF EXISTS set_updated_at_profiles ON profiles;
CREATE TRIGGER set_updated_at_profiles
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_notes ON notes;
CREATE TRIGGER set_updated_at_notes
    BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_tasks ON tasks;
CREATE TRIGGER set_updated_at_tasks
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_countdown ON countdown_events;
CREATE TRIGGER set_updated_at_countdown
    BEFORE UPDATE ON countdown_events
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 8. Enable Realtime on tables for live updates
-- ============================================================================
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
    ALTER PUBLICATION supabase_realtime ADD TABLE notes;
    ALTER PUBLICATION supabase_realtime ADD TABLE habit_logs;
    ALTER PUBLICATION supabase_realtime ADD TABLE countdown_events;
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- ============================================================================
-- 9. Idempotent Schema Migrations (Safe for existing databases)
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'default';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS focus_duration INT NOT NULL DEFAULT 25;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS short_break_duration INT NOT NULL DEFAULT 5;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS long_break_duration INT NOT NULL DEFAULT 15;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nav_slots TEXT[] NOT NULL DEFAULT '{"notes", "tasks", "finance", "chat"}';

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_url TEXT;

ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS tasks_completed INT NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS transactions_count INT NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS habits_completed INT NOT NULL DEFAULT 0;

-- 9.1 Countdown Events Table & Realtime Migration
CREATE TABLE IF NOT EXISTS countdown_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    description         TEXT,
    target_date         TIMESTAMPTZ NOT NULL,
    category            TEXT NOT NULL DEFAULT 'event',
    emoji               TEXT NOT NULL DEFAULT '⏳',
    color               TEXT NOT NULL DEFAULT 'blue',
    is_pinned           BOOLEAN NOT NULL DEFAULT false,
    reminder_intervals  TEXT[] NOT NULL DEFAULT '{"at_time", "1h", "1d"}',
    triggered_reminders TEXT[] NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_countdown_events_user_id ON countdown_events (user_id);
CREATE INDEX IF NOT EXISTS idx_countdown_events_target ON countdown_events (user_id, target_date);

ALTER TABLE countdown_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view their own countdown events" ON countdown_events;
    DROP POLICY IF EXISTS "Users can create their own countdown events" ON countdown_events;
    DROP POLICY IF EXISTS "Users can update their own countdown events" ON countdown_events;
    DROP POLICY IF EXISTS "Users can delete their own countdown events" ON countdown_events;
EXCEPTION WHEN OTHERS THEN null;
END $$;

CREATE POLICY "Users can view their own countdown events"   ON countdown_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own countdown events" ON countdown_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own countdown events" ON countdown_events FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own countdown events" ON countdown_events FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_updated_at_countdown ON countdown_events;
CREATE TRIGGER set_updated_at_countdown
    BEFORE UPDATE ON countdown_events
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE countdown_events;
EXCEPTION WHEN OTHERS THEN null;
END $$;
