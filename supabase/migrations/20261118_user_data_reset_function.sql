-- ============================================================================
-- Complete User Data Reset Function & Migration
-- ============================================================================
-- 1. Drops the blocking delete trigger on salary cycles so users can always purge history
-- 2. Grants DELETE permission on notification_preferences
-- 3. Installs the atomic SECURITY DEFINER reset_user_data() procedure
-- ============================================================================

-- 1. Ensure notification_preferences can be deleted by user
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can delete own notification preferences" ON public.notification_preferences;
    CREATE POLICY "Users can delete own notification preferences" 
    ON public.notification_preferences FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- 2. Permanently drop the blocking delete trigger on salary distribution cycles
DROP TRIGGER IF EXISTS trg_prevent_delete_completed_cycles ON public.salary_distribution_cycles;
DROP FUNCTION IF EXISTS public.prevent_delete_completed_cycles();

-- 3. Ensure protect trigger only guards invalid UPDATEs, never DELETEs
CREATE OR REPLACE FUNCTION public.protect_completed_cycles()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF OLD.status IN ('completed', 'archived_incomplete') THEN
        IF NEW.salary_amount <> OLD.salary_amount OR NEW.occurrence_key <> OLD.occurrence_key THEN
            RAISE EXCEPTION 'Completed distribution cycles cannot have financial amounts modified.';
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

-- 4. Centralized User Data Reset RPC (SECURITY DEFINER)
-- Runs with elevated database privileges to cleanly erase all user-scoped records
-- across all 14 platform tables while keeping the user's email and password intact in auth.users.
CREATE OR REPLACE FUNCTION public.reset_user_data(user_id_to_reset UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_caller UUID;
BEGIN
    current_caller := auth.uid();
    
    -- Verify authorization: Caller must be the target user or service_role
    IF current_caller IS NULL OR (current_caller <> user_id_to_reset AND current_setting('request.jwt.claim.role', true) <> 'service_role') THEN
        RAISE EXCEPTION 'Unauthorized: You can only reset your own account data.';
    END IF;

    -- Delete all user data across all tables
    DELETE FROM public.salary_distribution_cycles WHERE user_id = user_id_to_reset;
    DELETE FROM public.salary_distribution_plans WHERE user_id = user_id_to_reset;
    DELETE FROM public.habit_logs WHERE user_id = user_id_to_reset;
    DELETE FROM public.habits WHERE user_id = user_id_to_reset;
    DELETE FROM public.tasks WHERE user_id = user_id_to_reset;
    DELETE FROM public.transactions WHERE user_id = user_id_to_reset;
    DELETE FROM public.notes WHERE user_id = user_id_to_reset;
    DELETE FROM public.chat_messages WHERE user_id = user_id_to_reset;
    DELETE FROM public.daily_summaries WHERE user_id = user_id_to_reset;
    DELETE FROM public.countdown_events WHERE user_id = user_id_to_reset;
    DELETE FROM public.notifications WHERE user_id = user_id_to_reset;
    DELETE FROM public.scheduled_notifications WHERE user_id = user_id_to_reset;
    DELETE FROM public.push_subscriptions WHERE user_id = user_id_to_reset;
    DELETE FROM public.notification_preferences WHERE user_id = user_id_to_reset;

    -- Reset profile fields to default
    UPDATE public.profiles
    SET 
        avatar_url = NULL,
        gender = 'default',
        is_locked = false,
        focus_duration = 25,
        short_break_duration = 5,
        long_break_duration = 15,
        nav_slots = '{"notes", "tasks", "finance", "chat"}',
        updated_at = now()
    WHERE id = user_id_to_reset;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'All user data has been permanently wiped except email and password.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_user_data(UUID) TO authenticated, service_role;
