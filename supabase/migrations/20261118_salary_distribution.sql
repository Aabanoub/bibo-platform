-- ============================================================================
-- 10. Salary Distribution System Migration
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.salary_distribution_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    salary_amount DECIMAL(12, 2) NOT NULL CHECK (salary_amount > 0),
    currency TEXT NOT NULL DEFAULT 'EGP',
    frequency TEXT NOT NULL DEFAULT 'monthly', -- 'monthly', 'biweekly', 'weekly', 'custom'
    schedule_config JSONB NOT NULL DEFAULT '{"day_of_month": 25, "is_end_of_month": false}',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    is_active BOOLEAN NOT NULL DEFAULT true,
    allocations JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.salary_distribution_cycles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.salary_distribution_plans(id) ON DELETE SET NULL,
    source_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    occurrence_key TEXT NOT NULL,
    cycle_date DATE NOT NULL DEFAULT CURRENT_DATE,
    cycle_label TEXT NOT NULL,
    salary_amount DECIMAL(12, 2) NOT NULL CHECK (salary_amount > 0),
    status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'archived_incomplete', 'dismissed'
    checklist JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (user_id, occurrence_key)
);

-- Partial index for exactly one in-progress cycle per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_cycle_per_user 
ON public.salary_distribution_cycles (user_id) 
WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_salary_cycles_user_status 
ON public.salary_distribution_cycles (user_id, status);

CREATE INDEX IF NOT EXISTS idx_salary_cycles_user_date 
ON public.salary_distribution_cycles (user_id, cycle_date);

-- Enable RLS
ALTER TABLE public.salary_distribution_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_distribution_cycles ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.salary_distribution_plans TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.salary_distribution_plans TO authenticated;

GRANT ALL ON TABLE public.salary_distribution_cycles TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.salary_distribution_cycles TO authenticated;

-- Policies: Plans
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users view own salary plan" ON public.salary_distribution_plans;
    DROP POLICY IF EXISTS "Users insert own salary plan" ON public.salary_distribution_plans;
    DROP POLICY IF EXISTS "Users update own salary plan" ON public.salary_distribution_plans;
    DROP POLICY IF EXISTS "Users delete own salary plan" ON public.salary_distribution_plans;
EXCEPTION WHEN OTHERS THEN null;
END $$;

CREATE POLICY "Users view own salary plan" 
  ON public.salary_distribution_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own salary plan" 
  ON public.salary_distribution_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own salary plan" 
  ON public.salary_distribution_plans FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own salary plan" 
  ON public.salary_distribution_plans FOR DELETE USING (auth.uid() = user_id);

-- Policies: Cycles
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users view own distribution cycles" ON public.salary_distribution_cycles;
    DROP POLICY IF EXISTS "Users insert own distribution cycles" ON public.salary_distribution_cycles;
    DROP POLICY IF EXISTS "Users update own distribution cycles" ON public.salary_distribution_cycles;
    DROP POLICY IF EXISTS "Users delete own distribution cycles" ON public.salary_distribution_cycles;
EXCEPTION WHEN OTHERS THEN null;
END $$;

CREATE POLICY "Users view own distribution cycles" 
  ON public.salary_distribution_cycles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own distribution cycles" 
  ON public.salary_distribution_cycles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own distribution cycles" 
  ON public.salary_distribution_cycles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own distribution cycles" 
  ON public.salary_distribution_cycles FOR DELETE USING (auth.uid() = user_id);

-- Immutability Triggers
CREATE OR REPLACE FUNCTION public.protect_completed_cycles()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IN ('completed', 'archived_incomplete') THEN
        RAISE EXCEPTION 'Completed and archived distribution cycles are immutable and cannot be updated.';
    END IF;
    IF OLD.status = 'in_progress' THEN
        IF NEW.salary_amount <> OLD.salary_amount OR NEW.occurrence_key <> OLD.occurrence_key THEN
            RAISE EXCEPTION 'Core financial snapshot fields cannot be modified during an active cycle.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_completed_cycles ON public.salary_distribution_cycles;
CREATE TRIGGER trg_protect_completed_cycles
BEFORE UPDATE ON public.salary_distribution_cycles
FOR EACH ROW
EXECUTE FUNCTION public.protect_completed_cycles();

CREATE OR REPLACE FUNCTION public.prevent_delete_completed_cycles()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IN ('completed', 'archived_incomplete') THEN
        RAISE EXCEPTION 'Completed historical cycles cannot be deleted.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_delete_completed_cycles ON public.salary_distribution_cycles;
CREATE TRIGGER trg_prevent_delete_completed_cycles
BEFORE DELETE ON public.salary_distribution_cycles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_delete_completed_cycles();

-- Realtime sync for active cycles
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.salary_distribution_cycles;
EXCEPTION WHEN OTHERS THEN null;
END $$;
