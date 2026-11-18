-- ============================================================================
-- Fix Salary Cycles Deletion Trigger for Platform Data Reset
-- ============================================================================
-- The previous trigger unconditionally raised an exception when deleting
-- completed or archived historical distribution cycles. This prevented the
-- "Reset All Platform Data" feature from purging history.
--
-- Running this in your Supabase SQL Editor immediately enables full reset:
-- ============================================================================

DROP TRIGGER IF EXISTS trg_prevent_delete_completed_cycles ON public.salary_distribution_cycles;
DROP TRIGGER IF EXISTS trg_protect_completed_cycles ON public.salary_distribution_cycles;

-- Optional: Recreate triggers that allow administrative and data-reset deletions
CREATE OR REPLACE FUNCTION public.protect_completed_cycles()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF OLD.status IN ('completed', 'archived_incomplete') THEN
        RAISE EXCEPTION 'Completed and archived distribution cycles are immutable and cannot be updated.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_completed_cycles
BEFORE UPDATE ON public.salary_distribution_cycles
FOR EACH ROW
EXECUTE FUNCTION public.protect_completed_cycles();
