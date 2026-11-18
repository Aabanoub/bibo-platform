'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Clock,
  Calendar,
  Sparkles,
  History,
  Sliders,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import {
  SalaryPlan,
  SalaryCategoryAllocation,
  SalaryFrequency,
  ScheduleConfig,
  DEFAULT_PLAN_ALLOCATIONS,
  calculateExactAllocations,
  formatCurrency,
  SalaryCycle,
  computeOccurrenceKey,
  generateCycleLabel,
} from '@/lib/salary-distribution';

interface SalaryPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlanSaved?: (plan: SalaryPlan) => void;
  onStartCycleManually?: (salaryAmount: number) => void;
  activeCycle?: SalaryCycle | null;
}

const COMMON_CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR', 'AED', 'GBP'];

const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const PRESET_EMOJIS = ['🤝', '🍔', '🎬', '📄', '🎒', '🏠', '🚗', '🛍️', '🏥', '📈', '📦', '💡', '✈️'];

export default function SalaryPlanModal({
  isOpen,
  onClose,
  onPlanSaved,
  onStartCycleManually,
  activeCycle,
}: SalaryPlanModalProps) {
  const supabase = createClient();

  // Tab State: 'settings' | 'history'
  const [activeTab, setActiveTab] = useState<'settings' | 'history'>('settings');

  // Form States
  const [loading, setLoading] = useState(false);
  const [fetchingPlan, setFetchingPlan] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Existing plan ID if present
  const [planId, setPlanId] = useState<string | null>(null);

  // Configuration Fields
  const [salaryAmount, setSalaryAmount] = useState<number | ''>('');
  const [currency, setCurrency] = useState<string>('EGP');
  const [frequency, setFrequency] = useState<SalaryFrequency>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState<number>(25);
  const [isEndOfMonth, setIsEndOfMonth] = useState<boolean>(false);
  const [dayOfWeek, setDayOfWeek] = useState<number>(5); // Friday
  const [anchorDate, setAnchorDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [userTimezone, setUserTimezone] = useState<string>('UTC');

  // Category Allocations
  const [allocations, setAllocations] = useState<SalaryCategoryAllocation[]>(
    DEFAULT_PLAN_ALLOCATIONS
  );

  // Past Cycles History
  const [pastCycles, setPastCycles] = useState<SalaryCycle[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Detect local timezone on mount
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setUserTimezone(tz);
    } catch {
      setUserTimezone('UTC');
    }
  }, []);

  // Fetch Existing Plan
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadPlan() {
      setFetchingPlan(true);
      setError(null);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setFetchingPlan(false);
          return;
        }

        const { data, error: fetchErr } = await supabase
          .from('salary_distribution_plans')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (fetchErr && fetchErr.code !== 'PGRST116') {
          console.error('Error fetching salary plan:', fetchErr);
        }

        if (isMounted) {
          if (data) {
            setPlanId(data.id);
            setSalaryAmount(Number(data.salary_amount));
            setCurrency(data.currency || 'EGP');
            setFrequency(data.frequency || 'monthly');
            setUserTimezone(data.timezone || userTimezone);

            const cfg = data.schedule_config || {};
            setDayOfMonth(cfg.day_of_month || 25);
            setIsEndOfMonth(Boolean(cfg.is_end_of_month));
            setDayOfWeek(cfg.day_of_week ?? 5);
            setAnchorDate(cfg.anchor_date || new Date().toISOString().split('T')[0]);

            if (Array.isArray(data.allocations) && data.allocations.length > 0) {
              setAllocations(data.allocations);
            }
          } else {
            setPlanId(null);
            setSalaryAmount('');
            setAllocations(DEFAULT_PLAN_ALLOCATIONS);
          }
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load plan');
      } finally {
        if (isMounted) setFetchingPlan(false);
      }
    }

    loadPlan();

    return () => {
      isMounted = false;
    };
  }, [isOpen, supabase]);

  // Fetch History when switching to history tab
  useEffect(() => {
    if (!isOpen || activeTab !== 'history') return;

    let isMounted = true;
    async function loadHistory() {
      setLoadingHistory(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const { data, error: histErr } = await supabase
          .from('salary_distribution_cycles')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);

        if (histErr) throw histErr;
        if (isMounted && data) {
          setPastCycles(data as SalaryCycle[]);
        }
      } catch (err: any) {
        console.error('Error loading cycles history:', err);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    }

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeTab, supabase]);

  // Calculations & Validations
  const totalPercentage = useMemo(() => {
    return allocations.reduce((sum, item) => sum + (Number(item.percentage) || 0), 0);
  }, [allocations]);

  const isBalanced = totalPercentage === 100;
  const numSalary = Number(salaryAmount) || 0;

  // Real-time calculated amounts via Largest Remainder Algorithm
  const calculatedItems = useMemo(() => {
    return calculateExactAllocations(numSalary, allocations);
  }, [numSalary, allocations]);

  // Handlers for Category Adjustments
  const handlePercentageChange = (id: string, val: number) => {
    setAllocations((prev) =>
      prev.map((cat) => (cat.id === id ? { ...cat, percentage: Math.max(0, val) } : cat))
    );
  };

  const handleNameChange = (id: string, name: string) => {
    setAllocations((prev) =>
      prev.map((cat) => (cat.id === id ? { ...cat, name } : cat))
    );
  };

  const handleEmojiChange = (id: string, emoji: string) => {
    setAllocations((prev) =>
      prev.map((cat) => (cat.id === id ? { ...cat, emoji } : cat))
    );
  };

  const handleAddCategory = () => {
    const newId = `cat_${Date.now()}`;
    const unusedEmoji =
      PRESET_EMOJIS.find((e) => !allocations.some((a) => a.emoji === e)) || '📦';
    setAllocations((prev) => [
      ...prev,
      {
        id: newId,
        name: 'New Category',
        emoji: unusedEmoji,
        percentage: 0,
      },
    ]);
  };

  const handleRemoveCategory = (id: string) => {
    if (allocations.length <= 1) return;
    setAllocations((prev) => prev.filter((cat) => cat.id !== id));
  };

  const handleAutoFillRemainder = () => {
    const diff = 100 - totalPercentage;
    if (diff <= 0) return;

    // Add to 'Other' or the last category
    setAllocations((prev) => {
      const copy = [...prev];
      const targetIdx = copy.findIndex((c) => c.id === 'other') !== -1
        ? copy.findIndex((c) => c.id === 'other')
        : copy.length - 1;
      copy[targetIdx].percentage += diff;
      return copy;
    });
  };

  // Save Plan to Supabase
  const handleSavePlan = async () => {
    if (!isBalanced || numSalary <= 0) return;

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('You must be signed in to save a salary plan.');
      }

      const scheduleConfig: ScheduleConfig = {
        day_of_month: dayOfMonth,
        is_end_of_month: isEndOfMonth,
        day_of_week: dayOfWeek,
        anchor_date: anchorDate,
      };

      const payload = {
        user_id: user.id,
        salary_amount: numSalary,
        currency,
        frequency,
        schedule_config: scheduleConfig,
        timezone: userTimezone,
        is_active: true,
        allocations,
        updated_at: new Date().toISOString(),
      };

      let savedPlan: any = null;

      if (planId) {
        const { data, error: updateErr } = await supabase
          .from('salary_distribution_plans')
          .update(payload)
          .eq('id', planId)
          .select()
          .single();

        if (updateErr) throw updateErr;
        savedPlan = data;
      } else {
        const { data, error: insertErr } = await supabase
          .from('salary_distribution_plans')
          .insert(payload)
          .select()
          .single();

        if (insertErr) throw insertErr;
        savedPlan = data;
        setPlanId(data.id);
      }

      setSuccessMsg('Salary distribution plan saved successfully!');
      if (onPlanSaved && savedPlan) {
        onPlanSaved(savedPlan as SalaryPlan);
      }

      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch (err: any) {
      console.error('Failed to save salary plan:', err);
      setError(err.message || 'Failed to save salary plan.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Salary Distribution Plan
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
                  Zero-Based
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Configure your automatic envelope budget for paydays
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

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-800/80 bg-slate-900/60 text-xs">
          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'settings'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Plan Settings
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Distribution History
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === 'settings' ? (
            fetchingPlan ? (
              <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
                Loading distribution settings...
              </div>
            ) : (
              <>
                {/* Section 1: Salary & Schedule */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-400" /> Expected Payout & Frequency
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Timezone: {userTimezone}
                    </span>
                  </div>

                  {/* Salary Amount & Currency */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Salary Amount (Per Payout)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          step="any"
                          value={salaryAmount}
                          onChange={(e) =>
                            setSalaryAmount(e.target.value === '' ? '' : Number(e.target.value))
                          }
                          placeholder="e.g. 80000"
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-sm text-white font-semibold outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Currency
                      </label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-white font-medium outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        {COMMON_CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Frequency Selector */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                      Salary Frequency
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['monthly', 'biweekly', 'weekly', 'custom'] as SalaryFrequency[]).map(
                        (f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setFrequency(f)}
                            className={`py-2 px-3 rounded-xl text-xs font-semibold capitalize border transition-all text-center ${
                              frequency === f
                                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-sm'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            {f === 'biweekly' ? 'Bi-Weekly' : f}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Frequency Schedule Parameters */}
                  {frequency === 'monthly' && (
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                      <div className="flex items-center gap-2">
                        <label className="text-slate-400 font-medium">Payday Day:</label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          disabled={isEndOfMonth}
                          value={dayOfMonth}
                          onChange={(e) => setDayOfMonth(Number(e.target.value))}
                          className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-center font-bold outline-none focus:border-emerald-500 disabled:opacity-40"
                        />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={isEndOfMonth}
                          onChange={(e) => setIsEndOfMonth(e.target.checked)}
                          className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-0 cursor-pointer"
                        />
                        <span>Last Day of Month (28th/30th/31st)</span>
                      </label>
                    </div>
                  )}

                  {frequency === 'weekly' && (
                    <div className="flex items-center gap-2 text-xs pt-1">
                      <label className="text-slate-400 font-medium">Payday Weekday:</label>
                      <select
                        value={dayOfWeek}
                        onChange={(e) => setDayOfWeek(Number(e.target.value))}
                        className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        {WEEKDAYS.map((w) => (
                          <option key={w.value} value={w.value}>
                            Every {w.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {frequency === 'biweekly' && (
                    <div className="flex items-center gap-2 text-xs pt-1">
                      <label className="text-slate-400 font-medium">Reference Start Date:</label>
                      <input
                        type="date"
                        value={anchorDate}
                        onChange={(e) => setAnchorDate(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1 text-xs text-white outline-none focus:border-emerald-500"
                      />
                      <span className="text-slate-500 text-[11px]">(Repeats every 14 days)</span>
                    </div>
                  )}

                  {frequency === 'custom' && (
                    <p className="text-[11px] text-slate-400 pt-1">
                      💡 <strong>Custom Schedule:</strong> Checklists will be created manually on demand or prompted whenever an income transaction is categorized as Salary.
                    </p>
                  )}
                </div>

                {/* Section 2: 100% Allocation Visualizer */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-400" /> Category Allocations
                    </span>

                    {/* Balance Indicator Badge */}
                    <div
                      className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border flex items-center gap-1.5 ${
                        isBalanced
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : totalPercentage > 100
                          ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                      }`}
                    >
                      {isBalanced ? (
                        <>
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>100% Perfectly Balanced</span>
                        </>
                      ) : totalPercentage > 100 ? (
                        <span>Total: {totalPercentage}% (Over by {totalPercentage - 100}%)</span>
                      ) : (
                        <span>
                          Total: {totalPercentage}% ({100 - totalPercentage}% Unallocated)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Multi-Color Progress Bar */}
                  <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                    {allocations.map((cat, idx) => {
                      const colors = [
                        'bg-emerald-500',
                        'bg-blue-500',
                        'bg-indigo-500',
                        'bg-violet-500',
                        'bg-amber-500',
                        'bg-rose-500',
                        'bg-teal-500',
                      ];
                      const color = colors[idx % colors.length];
                      if (cat.percentage <= 0) return null;
                      return (
                        <div
                          key={cat.id}
                          style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                          title={`${cat.name}: ${cat.percentage}%`}
                          className={`${color} h-full transition-all`}
                        />
                      );
                    })}
                  </div>

                  {/* Quick Auto-fill button if under 100% */}
                  {!isBalanced && totalPercentage < 100 && (
                    <div className="flex justify-end pt-0.5">
                      <button
                        type="button"
                        onClick={handleAutoFillRemainder}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium hover:underline flex items-center gap-1"
                      >
                        + Auto-allocate remaining {100 - totalPercentage}% to savings/other
                      </button>
                    </div>
                  )}
                </div>

                {/* Section 3: Category Allocation List */}
                <div className="space-y-2">
                  {allocations.map((cat) => {
                    const calculated = calculatedItems.find((c) => c.id === cat.id);
                    const allocatedAmount = calculated?.allocated_amount || 0;

                    return (
                      <div
                        key={cat.id}
                        className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 p-2.5 rounded-2xl bg-slate-950/40 border border-slate-800/80 hover:border-slate-700/80 transition-colors"
                      >
                        {/* Emoji Picker / Select */}
                        <div className="relative">
                          <select
                            value={cat.emoji}
                            onChange={(e) => handleEmojiChange(cat.id, e.target.value)}
                            className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 text-lg flex items-center justify-center text-center cursor-pointer outline-none appearance-none"
                            title="Change category emoji"
                          >
                            {PRESET_EMOJIS.map((em) => (
                              <option key={em} value={em}>
                                {em}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Category Name Input */}
                        <div className="flex-1 min-w-[140px]">
                          <input
                            type="text"
                            value={cat.name}
                            onChange={(e) => handleNameChange(cat.id, e.target.value)}
                            placeholder="Category name..."
                            className="w-full bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white font-medium outline-none focus:border-emerald-500"
                          />
                        </div>

                        {/* Percentage Controls */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handlePercentageChange(cat.id, Math.max(0, cat.percentage - 5))
                            }
                            className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold"
                          >
                            -5
                          </button>
                          <div className="relative w-16">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={cat.percentage}
                              onChange={(e) =>
                                handlePercentageChange(cat.id, Number(e.target.value))
                              }
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center text-white font-bold outline-none focus:border-emerald-500 pr-5"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-[10px] pointer-events-none">
                              %
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handlePercentageChange(cat.id, Math.min(100, cat.percentage + 5))
                            }
                            className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold"
                          >
                            +5
                          </button>
                        </div>

                        {/* Amount Preview */}
                        <div className="w-24 text-right">
                          <span className="text-xs font-bold text-emerald-400">
                            {formatCurrency(allocatedAmount, currency)}
                          </span>
                        </div>

                        {/* Delete Button */}
                        <button
                          type="button"
                          disabled={allocations.length <= 1}
                          onClick={() => handleRemoveCategory(cat.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Remove category"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="w-full py-2 border border-dashed border-slate-800 hover:border-emerald-500/50 rounded-2xl text-xs font-semibold text-slate-400 hover:text-emerald-400 transition-colors flex items-center justify-center gap-1.5 bg-slate-950/20"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Custom Category</span>
                  </button>
                </div>
              </>
            )
          ) : (
            /* Tab 2: Distribution History */
            <div className="space-y-3">
              {loadingHistory ? (
                <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
                  Loading past distribution cycles...
                </div>
              ) : pastCycles.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <History className="w-10 h-10 mx-auto mb-2 text-slate-700" />
                  <p className="text-sm font-medium text-slate-400">No past cycles found</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Completed and archived payday checklists will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pastCycles.map((cyc) => {
                    const completedCount = cyc.checklist.filter((c) => c.is_checked).length;
                    const totalCount = cyc.checklist.length;
                    const isFullyCompleted = cyc.status === 'completed';

                    return (
                      <div
                        key={cyc.id}
                        className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                              {cyc.cycle_label}
                              <span
                                className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${
                                  isFullyCompleted
                                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                    : cyc.status === 'in_progress'
                                    ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                                    : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                                }`}
                              >
                                {cyc.status.replace('_', ' ')}
                              </span>
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Date: {cyc.cycle_date} • {formatCurrency(Number(cyc.salary_amount), currency)}
                            </p>
                          </div>

                          <div className="text-right">
                            <span className="text-xs font-semibold text-slate-300">
                              {completedCount} / {totalCount} Envelopes
                            </span>
                          </div>
                        </div>

                        {/* Envelopes mini breakdown */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-850">
                          {cyc.checklist.map((item) => (
                            <div
                              key={item.id}
                              className="text-[11px] flex items-center justify-between p-1.5 rounded-lg bg-slate-900 border border-slate-800/80"
                            >
                              <span className="flex items-center gap-1.5 text-slate-300 truncate">
                                <span>{item.emoji}</span>
                                <span className="truncate">{item.name}</span>
                              </span>
                              <span
                                className={`font-semibold ml-1 flex-shrink-0 ${
                                  item.is_checked ? 'text-emerald-400' : 'text-slate-500'
                                }`}
                              >
                                {item.is_checked ? '✓' : ''} {formatCurrency(item.allocated_amount, currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {activeTab === 'settings' && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 sm:px-6 border-t border-slate-800 bg-slate-900/90">
            {/* Optional Manual Trigger Button */}
            {planId && !activeCycle && (
              <button
                type="button"
                onClick={() => {
                  if (onStartCycleManually) onStartCycleManually(numSalary);
                  onClose();
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Start Distribution Cycle Now</span>
              </button>
            )}

            <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Close
              </button>

              <button
                type="button"
                disabled={!isBalanced || numSalary <= 0 || loading}
                onClick={handleSavePlan}
                className="flex-1 sm:flex-none px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white transition-all shadow-md shadow-emerald-600/30 flex items-center justify-center gap-1.5"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Save Plan</span>
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
