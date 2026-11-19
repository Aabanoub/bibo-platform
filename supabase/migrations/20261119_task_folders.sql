-- ============================================================================
-- Migration: Task Folders & Subject/Exam Groups
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.task_folders (
    id          UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    due_date    TIMESTAMPTZ,
    color       TEXT NOT NULL DEFAULT 'blue',
    icon        TEXT NOT NULL DEFAULT 'folder',
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_folders_user_id ON public.task_folders (user_id);
CREATE INDEX IF NOT EXISTS idx_task_folders_due_date ON public.task_folders (due_date);

ALTER TABLE public.task_folders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'task_folders' AND policyname = 'Users can view own task folders'
    ) THEN
        CREATE POLICY "Users can view own task folders"
            ON public.task_folders FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'task_folders' AND policyname = 'Users can create own task folders'
    ) THEN
        CREATE POLICY "Users can create own task folders"
            ON public.task_folders FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'task_folders' AND policyname = 'Users can update own task folders'
    ) THEN
        CREATE POLICY "Users can update own task folders"
            ON public.task_folders FOR UPDATE
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'task_folders' AND policyname = 'Users can delete own task folders'
    ) THEN
        CREATE POLICY "Users can delete own task folders"
            ON public.task_folders FOR DELETE
            USING (auth.uid() = user_id);
    END IF;
END $$;

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.task_folders (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_folder_id ON public.tasks (folder_id);
