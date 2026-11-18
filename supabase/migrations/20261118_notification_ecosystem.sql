-- ============================================================================
-- EVOLVE — Complete Notification Ecosystem Migration
-- 1. Push subscription unique index (prevents duplicate endpoints per user)
-- 2. In-app notifications event_id deduplication column
-- 3. Notification preferences table (syncs user toggles across devices)
-- 4. Scheduled notifications table (free server-side background scheduling)
-- ============================================================================

-- 1. push_subscriptions: Add endpoint unique index for idempotent upserts
DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_user_endpoint 
    ON push_subscriptions (user_id, (subscription->>'endpoint'));
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- Add updated_at to push_subscriptions if missing
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. notifications: Add event_id for database-level deduplication
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_id TEXT;
CREATE INDEX IF NOT EXISTS idx_notifications_user_event ON notifications (user_id, event_id);

-- 3. notification_preferences: User-configurable granular controls
CREATE TABLE IF NOT EXISTS notification_preferences (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
    in_app_enabled          BOOLEAN NOT NULL DEFAULT true,
    browser_enabled         BOOLEAN NOT NULL DEFAULT true,
    push_enabled            BOOLEAN NOT NULL DEFAULT true,
    task_reminders          BOOLEAN NOT NULL DEFAULT true,
    countdown_reminders     BOOLEAN NOT NULL DEFAULT true,
    finance_alerts          BOOLEAN NOT NULL DEFAULT true,
    salary_reminders        BOOLEAN NOT NULL DEFAULT true,
    habit_reminders         BOOLEAN NOT NULL DEFAULT true,
    ai_notifications        BOOLEAN NOT NULL DEFAULT true,
    quiet_hours_enabled     BOOLEAN NOT NULL DEFAULT false,
    quiet_hours_start       TEXT NOT NULL DEFAULT '22:00',
    quiet_hours_end         TEXT NOT NULL DEFAULT '08:00',
    timezone                TEXT NOT NULL DEFAULT 'UTC',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_user_id ON notification_preferences (user_id);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view own notification preferences" ON notification_preferences;
    DROP POLICY IF EXISTS "Users can insert own notification preferences" ON notification_preferences;
    DROP POLICY IF EXISTS "Users can update own notification preferences" ON notification_preferences;
EXCEPTION WHEN OTHERS THEN null;
END $$;

CREATE POLICY "Users can view own notification preferences"   ON notification_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notification preferences" ON notification_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notification preferences" ON notification_preferences FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. scheduled_notifications: Reliable background scheduler queue
CREATE TABLE IF NOT EXISTS scheduled_notifications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    idempotency_key     TEXT NOT NULL,
    title               TEXT NOT NULL,
    message             TEXT NOT NULL,
    category            TEXT NOT NULL DEFAULT 'reminder', -- 'task', 'countdown', 'salary', 'habit', 'finance', 'ai'
    action_url          TEXT DEFAULT '/',
    scheduled_for       TIMESTAMPTZ NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'sent', 'failed', 'cancelled'
    retry_count         INT NOT NULL DEFAULT 0,
    last_error          TEXT,
    sent_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_scheduled_notifications_idempotency UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_pending 
ON scheduled_notifications (status, scheduled_for) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_user 
ON scheduled_notifications (user_id);

ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view own scheduled notifications" ON scheduled_notifications;
    DROP POLICY IF EXISTS "Users can insert own scheduled notifications" ON scheduled_notifications;
    DROP POLICY IF EXISTS "Users can update own scheduled notifications" ON scheduled_notifications;
    DROP POLICY IF EXISTS "Users can delete own scheduled notifications" ON scheduled_notifications;
EXCEPTION WHEN OTHERS THEN null;
END $$;

CREATE POLICY "Users can view own scheduled notifications"   ON scheduled_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own scheduled notifications" ON scheduled_notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own scheduled notifications" ON scheduled_notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own scheduled notifications" ON scheduled_notifications FOR DELETE USING (auth.uid() = user_id);

-- 5. Enable Realtime on notification_preferences
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notification_preferences;
EXCEPTION WHEN OTHERS THEN null;
END $$;
