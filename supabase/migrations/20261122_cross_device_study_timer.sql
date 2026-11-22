-- Migration: Cross-Device Active Study Timer Synchronization
-- Date: 2026-11-22

-- 1. Create active_study_timers table for cross-device synchronized active timer
CREATE TABLE IF NOT EXISTS public.active_study_timers (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    session_type TEXT NOT NULL DEFAULT 'task' CHECK (session_type IN ('task', 'break')),
    title TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    total_seconds INTEGER NOT NULL,
    seconds_left INTEGER NOT NULL,
    is_running BOOLEAN NOT NULL DEFAULT true,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.active_study_timers ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policy
DROP POLICY IF EXISTS "Users can manage own active study timer" ON public.active_study_timers;
CREATE POLICY "Users can manage own active study timer"
ON public.active_study_timers
FOR ALL
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- 4. Also add active_study_timer JSONB column to profiles as fallback/cache
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS active_study_timer JSONB DEFAULT NULL;

-- 5. Enable Realtime broadcast
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'active_study_timers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.active_study_timers;
  END IF;
END $$;
