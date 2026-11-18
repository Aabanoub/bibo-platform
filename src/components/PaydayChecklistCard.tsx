'use client';

import React, { useState, useMemo } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  PartyPopper,
  AlertCircle,
  Archive,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import {
  SalaryCycle,
  ChecklistItem,
  formatCurrency,
} from '@/lib/salary-distribution';

interface PaydayChecklistCardProps {
  cycle: SalaryCycle;
  currency?: string;
  onCycleUpdated: (updated: SalaryCycle) => void;
  onCycleCompleted: () => void;
  onOpenSettings: () => void;
}

export default function PaydayChecklistCard({
  cycle,
  currency = 'EGP',
  onCycleUpdated,
  onCycleCompleted,
  onOpenSettings,
}: PaydayChecklistCardProps) {
  const supabase = createClient();

  const [collapsed, setCollapsed] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const checklist: ChecklistItem[] = cycle.checklist || [];

  // Tally Calculations
  const { completedCount, totalCount, distributedAmount, remainingAmount, isAllDone } =
    useMemo(() => {
      const total = checklist.length;
      const completed = checklist.filter((item) => item.is_checked);
      const count = completed.length;
      const distributed = completed.reduce((sum, item) => sum + (Number(item.allocated_amount) || 0), 0);
      const remaining = Number(cycle.salary_amount) - distributed;
      return {
        completedCount: count,
        totalCount: total,
        distributedAmount: distributed,
        remainingAmount: Math.max(0, remaining),
        isAllDone: total > 0 && count === total,
      };
    }, [checklist, cycle.salary_amount]);

  const percentageDone = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Toggle item checkmark
  const handleToggleItem = async (itemId: string) => {
    setUpdatingId(itemId);
    try {
      const updatedChecklist = checklist.map((item) => {
        if (item.id === itemId) {
          const nextChecked = !item.is_checked;
          return {
            ...item,
            is_checked: nextChecked,
            checked_at: nextChecked ? new Date().toISOString() : null,
          };
        }
        return item;
      });

      // Optimistically update parent
      const updatedCycle: SalaryCycle = {
        ...cycle,
        checklist: updatedChecklist,
      };
      onCycleUpdated(updatedCycle);

      // Persist to Supabase
      const { error } = await supabase
        .from('salary_distribution_cycles')
        .update({
          checklist: updatedChecklist,
        })
        .eq('id', cycle.id);

      if (error) {
        console.error('Failed to update checklist item:', error);
      }
    } finally {
      setUpdatingId(null);
    }
  };

  // Complete and Archive Cycle
  const handleFinishAndArchive = async () => {
    setFinishing(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('salary_distribution_cycles')
        .update({
          status: 'completed',
          completed_at: now,
        })
        .eq('id', cycle.id);

      if (error) throw error;
      onCycleCompleted();
    } catch (err: any) {
      console.error('Failed to complete distribution cycle:', err);
      alert('Could not archive cycle: ' + (err.message || 'Unknown error'));
    } finally {
      setFinishing(false);
    }
  };

  // Archive Incomplete Cycle
  const handleArchiveIncomplete = async () => {
    if (!confirm('Archive this distribution cycle as incomplete? It will be safely stored in your distribution history.')) {
      return;
    }
    setArchiving(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('salary_distribution_cycles')
        .update({
          status: 'archived_incomplete',
          completed_at: now,
        })
        .eq('id', cycle.id);

      if (error) throw error;
      onCycleCompleted();
    } catch (err: any) {
      console.error('Failed to archive incomplete cycle:', err);
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="mb-6 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-emerald-500/30 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Top Banner Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            {isAllDone ? (
              <PartyPopper className="w-5 h-5 sm:w-6 sm:h-6 animate-bounce" />
            ) : (
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                {cycle.cycle_label}
              </h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {isAllDone ? 'Ready to Archive' : 'In Progress'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAllDone
                ? 'All envelopes have been distributed! Finish and archive this cycle.'
                : `${completedCount} of ${totalCount} envelopes allocated (${percentageDone}%)`}
            </p>
          </div>
        </div>

        {/* Live Financial Counters & Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Distributed Counter */}
          <div className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-right">
            <span className="block text-[10px] text-slate-400 uppercase font-semibold">
              Distributed
            </span>
            <span className="text-xs sm:text-sm font-bold text-emerald-400">
              {formatCurrency(distributedAmount, currency)}
            </span>
          </div>

          {/* Remaining Counter */}
          <div className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-right">
            <span className="block text-[10px] text-slate-400 uppercase font-semibold">
              Remaining
            </span>
            <span
              className={`text-xs sm:text-sm font-bold ${
                remainingAmount === 0 ? 'text-slate-500' : 'text-amber-400'
              }`}
            >
              {formatCurrency(remainingAmount, currency)}
            </span>
          </div>

          {/* Collapse/Expand Toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            title={collapsed ? 'Expand checklist' : 'Collapse checklist'}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-slate-950">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
          style={{ width: `${percentageDone}%` }}
        />
      </div>

      {/* Body: Checklist Items */}
      {!collapsed && (
        <div className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {checklist.map((item) => {
              const isChecked = Boolean(item.is_checked);
              const isUpdating = updatingId === item.id;

              return (
                <div
                  key={item.id}
                  onClick={() => handleToggleItem(item.id)}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer select-none group ${
                    isChecked
                      ? 'bg-slate-950/40 border-slate-800/60 opacity-80'
                      : 'bg-slate-900/90 border-slate-800 hover:border-emerald-500/40 hover:bg-slate-850 shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Circular Checkbox */}
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                        isChecked
                          ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30 scale-105'
                          : 'border-2 border-slate-600 group-hover:border-emerald-400 bg-slate-950/60'
                      }`}
                    >
                      {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      {isUpdating && <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />}
                    </div>

                    {/* Category Emoji & Name */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{item.emoji}</span>
                        <span
                          className={`text-xs font-semibold truncate ${
                            isChecked ? 'line-through text-slate-400' : 'text-white'
                          }`}
                        >
                          {item.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {item.percentage}% Allocation
                      </span>
                    </div>
                  </div>

                  {/* Allocated Amount */}
                  <div className="text-right flex-shrink-0 ml-2">
                    <span
                      className={`text-xs sm:text-sm font-bold ${
                        isChecked ? 'text-slate-500' : 'text-emerald-400'
                      }`}
                    >
                      {formatCurrency(item.allocated_amount, currency)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* All Done Celebration Banner / Action Bar */}
          {isAllDone ? (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎉</span>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-emerald-300">
                    All {totalCount} Envelopes Successfully Distributed!
                  </h4>
                  <p className="text-[11px] text-emerald-400/80">
                    Total {formatCurrency(Number(cycle.salary_amount), currency)} fully allocated.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={finishing}
                onClick={handleFinishAndArchive}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5 active:scale-95"
              >
                {finishing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Archiving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Finish & Archive Checklist</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                💡 Checking categories marks distribution complete. No expenses or bank deductions are generated.
              </span>

              <div className="flex items-center gap-3 ml-auto">
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="hover:text-slate-300 transition-colors flex items-center gap-1"
                >
                  <Sliders className="w-3 h-3" />
                  <span>Edit Plan</span>
                </button>
                <button
                  type="button"
                  disabled={archiving}
                  onClick={handleArchiveIncomplete}
                  className="hover:text-amber-400 transition-colors flex items-center gap-1"
                >
                  <Archive className="w-3 h-3" />
                  <span>Archive Incomplete</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
