'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  AlertCircle,
  X,
  Check,
  Archive,
  ArrowRight,
  RefreshCw,
  DollarSign,
} from 'lucide-react';
import {
  SalaryPlan,
  SalaryCycle,
  formatCurrency,
  computeOccurrenceKey,
  generateCycleLabel,
  calculateExactAllocations,
} from '@/lib/salary-distribution';
import { createClient } from '@/lib/supabase';

interface PaydayConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  plan: SalaryPlan;
  activeCycle?: SalaryCycle | null;
  triggerType: 'schedule' | 'income';
  detectedAmount?: number;
  sourceTransactionId?: string;
  onCycleCreated: (newCycle: SalaryCycle) => void;
  onResumeActiveCycle: () => void;
}

export default function PaydayConfirmationDialog({
  isOpen,
  onClose,
  plan,
  activeCycle,
  triggerType,
  detectedAmount,
  sourceTransactionId,
  onCycleCreated,
  onResumeActiveCycle,
}: PaydayConfirmationDialogProps) {
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable salary amount for this specific cycle (in case of bonus/deduction)
  const defaultAmount = detectedAmount || Number(plan.salary_amount) || 80000;
  const [cycleSalary, setCycleSalary] = useState<number | ''>(defaultAmount);

  if (!isOpen) return null;

  const hasUnfinishedCycle = Boolean(activeCycle && activeCycle.status === 'in_progress');
  const numSalary = Number(cycleSalary) || defaultAmount;

  // Handler to start a fresh cycle
  const handleStartFreshCycle = async (shouldArchivePrevious: boolean = false) => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('You must be signed in.');

      const now = new Date();
      const occurrenceKey = computeOccurrenceKey(
        plan.frequency,
        plan.schedule_config,
        plan.timezone,
        now
      );

      // 1. If previous cycle needs to be archived first
      if (shouldArchivePrevious && activeCycle) {
        const { error: archErr } = await supabase
          .from('salary_distribution_cycles')
          .update({
            status: 'archived_incomplete',
            completed_at: now.toISOString(),
          })
          .eq('id', activeCycle.id);

        if (archErr) throw archErr;
      }

      // 2. Compute exact allocations with Largest Remainder Method
      const checklistItems = calculateExactAllocations(numSalary, plan.allocations);
      const cycleDateStr = now.toISOString().split('T')[0];
      const cycleLabel = generateCycleLabel(plan.frequency, occurrenceKey, cycleDateStr);

      const payload = {
        user_id: user.id,
        plan_id: plan.id,
        source_transaction_id: sourceTransactionId || null,
        occurrence_key: occurrenceKey,
        cycle_date: cycleDateStr,
        cycle_label: cycleLabel,
        salary_amount: numSalary,
        status: 'in_progress',
        checklist: checklistItems,
      };

      const { data, error: insertErr } = await supabase
        .from('salary_distribution_cycles')
        .insert(payload)
        .select()
        .single();

      if (insertErr) {
        // If unique index on occurrence_key triggered, cycle already exists!
        if (insertErr.code === '23505') {
          throw new Error('A distribution cycle for this salary occurrence already exists.');
        }
        throw insertErr;
      }

      onCycleCreated(data as SalaryCycle);
      onClose();
    } catch (err: any) {
      console.error('Error starting salary cycle:', err);
      setError(err.message || 'Failed to start distribution cycle.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-5 sm:p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                {hasUnfinishedCycle ? 'Salary Distribution in Progress' : 'Start Salary Distribution?'}
              </h3>
              <p className="text-xs text-slate-400">
                {triggerType === 'income'
                  ? 'Salary income was recorded in your ledger'
                  : 'Your scheduled payday has arrived'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {hasUnfinishedCycle ? (
          /* Unfinished Cycle Conflict Resolver */
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>You have an unfinished distribution cycle</span>
              </div>
              <p className="text-xs text-slate-300">
                <strong>{activeCycle?.cycle_label}</strong> is still in progress (
                {activeCycle?.checklist.filter((c) => c.is_checked).length} of{' '}
                {activeCycle?.checklist.length} completed).
              </p>
              <p className="text-[11px] text-slate-400">
                Would you like to finish your pending cycle, or archive it as incomplete and start a fresh cycle for your new payout?
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  onResumeActiveCycle();
                  onClose();
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                <span>Resume Pending Cycle</span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => handleStartFreshCycle(true)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Archive className="w-4 h-4 text-amber-400" />
                )}
                <span>Archive Pending as Incomplete & Start New</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 px-4 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Not Now / Decide Later
              </button>
            </div>
          </div>
        ) : (
          /* Normal Start Cycle Flow */
          <div className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Distribute your salary across your <strong>{plan.allocations.length} predefined envelopes</strong> (
              {plan.allocations.map((a) => a.name).slice(0, 3).join(', ')}
              {plan.allocations.length > 3 ? ` +${plan.allocations.length - 3} more` : ''}).
            </p>

            {/* Editable Amount in case of bonus or deduction */}
            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <label className="block text-[11px] font-medium text-slate-400">
                Confirm Payout Amount for This Checklist:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={cycleSalary}
                  onChange={(e) =>
                    setCycleSalary(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold outline-none focus:border-emerald-500"
                />
                <span className="text-xs font-semibold text-slate-400 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl">
                  {plan.currency}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 block">
                Default plan amount is {formatCurrency(Number(plan.salary_amount), plan.currency)}. Category amounts will automatically recalculate.
              </span>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Not Now
              </button>

              <button
                type="button"
                disabled={loading || numSalary <= 0}
                onClick={() => handleStartFreshCycle(false)}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-all shadow-md shadow-emerald-600/30 flex items-center justify-center gap-1.5"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Start Checklist</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
