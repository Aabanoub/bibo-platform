-- Migration: AI-Powered Daily Planning & Adaptive Scheduling System
-- Date: 2026-11-20

-- 1. Extend tasks table with difficulty and estimated_duration
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
ADD COLUMN IF NOT EXISTS estimated_duration INTEGER NOT NULL DEFAULT 30 CHECK (estimated_duration > 0);

-- 2. Extend profiles table with working hours / availability preferences
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS daily_start_time TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS daily_end_time TEXT NOT NULL DEFAULT '18:00',
ADD COLUMN IF NOT EXISTS high_focus_start TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS high_focus_end TEXT NOT NULL DEFAULT '12:00',
ADD COLUMN IF NOT EXISTS preferred_break_duration INTEGER NOT NULL DEFAULT 15 CHECK (preferred_break_duration >= 5),
ADD COLUMN IF NOT EXISTS max_daily_study_minutes INTEGER NOT NULL DEFAULT 360 CHECK (max_daily_study_minutes >= 30);

-- 3. Create daily_schedule_items table (keeps scheduled sessions separate from task definitions)
CREATE TABLE IF NOT EXISTS public.daily_schedule_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    session_type TEXT NOT NULL DEFAULT 'task' CHECK (session_type IN ('task', 'break', 'review')),
    title TEXT NOT NULL,
    difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    is_completed BOOLEAN NOT NULL DEFAULT false,
    is_locked BOOLEAN NOT NULL DEFAULT false,
    actual_duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_duration_minutes >= 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for lightning fast queries
CREATE INDEX IF NOT EXISTS idx_daily_schedule_items_user_date ON public.daily_schedule_items(user_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_schedule_items_task_id ON public.daily_schedule_items(task_id);

-- Enable RLS
ALTER TABLE public.daily_schedule_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage own daily schedule items" 
ON public.daily_schedule_items
FOR ALL 
TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);
