'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import type { Transaction, TransactionType } from '@/types';
import {
  Plus,
  Trash2,
  Filter,
  AlertCircle,
  Loader2,
  X,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Camera,
  Calendar,
  Edit3,
  ChevronRight,
  Check,
  Tag,
  Receipt,
  Sparkles,
  Sliders,
} from 'lucide-react';
import ReceiptScannerModal from '@/components/ReceiptScannerModal';
import SalaryPlanModal from '@/components/SalaryPlanModal';
import PaydayChecklistCard from '@/components/PaydayChecklistCard';
import PaydayConfirmationDialog from '@/components/PaydayConfirmationDialog';
import {
  SalaryPlan,
  SalaryCycle,
  isPaydayDue,
} from '@/lib/salary-distribution';

// ---------------------------------------------------------------------------
// Constants & Categories
// ---------------------------------------------------------------------------

const CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Entertainment',
  'Bills',
  'Health',
  'Education',
  'Salary',
  'Freelance',
  'Investment',
  'My Money',
  'Other',
] as const;

const CATEGORY_EMOJI: Record<string, string> = {
  Food: '🍔',
  Transport: '🚗',
  Shopping: '🛍️',
  Entertainment: '🎬',
  Bills: '📄',
  Health: '🏥',
  Education: '📚',
  Salary: '💰',
  Freelance: '💻',
  Investment: '📈',
  'My Money': '💵',
  Other: '📦',
};

// Quick increment amounts
const QUICK_AMOUNTS = [10, 25, 50, 100, 250];

// ---------------------------------------------------------------------------
// Main Finance Page
// ---------------------------------------------------------------------------

export default function FinancePage() {
  const supabase = createClient();

  // Transactions state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Premium Modal State (Handles both Add & Edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Form Fields
  const [formAmount, setFormAmount] = useState('');
  const [formType, setFormType] = useState<TransactionType>('expense');
  const [formCategory, setFormCategory] = useState<string>('Food');
  const [formDesc, setFormDesc] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [deletingInModal, setDeletingInModal] = useState(false);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<TransactionType | ''>('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Receipt Scanner Modal
  const [scannerOpen, setScannerOpen] = useState(false);

  // Summary scope: 'all' (All-Time total balance) or 'month' (This Month's cash flow)
  const [summaryScope, setSummaryScope] = useState<'all' | 'month'>('all');

  // Salary Distribution System State
  const [salaryPlan, setSalaryPlan] = useState<SalaryPlan | null>(null);
  const [activeSalaryCycle, setActiveSalaryCycle] = useState<SalaryCycle | null>(null);
  const [salaryPlanModalOpen, setSalaryPlanModalOpen] = useState(false);
  const [paydayConfirmationOpen, setPaydayConfirmationOpen] = useState(false);
  const [paydayTriggerInfo, setPaydayTriggerInfo] = useState<{
    triggerType: 'schedule' | 'income';
    detectedAmount?: number;
    sourceTransactionId?: string;
  }>({ triggerType: 'schedule' });

  const amountInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchSalaryData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: plan } = await supabase
        .from('salary_distribution_plans')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (plan) {
        setSalaryPlan(plan as SalaryPlan);
      } else {
        setSalaryPlan(null);
      }

      const { data: cycle } = await supabase
        .from('salary_distribution_cycles')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'in_progress')
        .maybeSingle();

      if (cycle) {
        setActiveSalaryCycle(cycle as SalaryCycle);
      } else {
        setActiveSalaryCycle(null);
      }
    } catch (e) {
      console.error('fetchSalaryData error:', e);
    }
  }, [supabase]);

  const fetchTransactions = useCallback(async () => {
    try {
      setError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setTransactions([]);
        setLoading(false);
        return;
      }

      const { data, error: err } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (err) throw err;
      const parsed = ((data as any[]) ?? []).map((t) => ({
        ...t,
        amount: Number(t.amount) || 0,
      }));
      setTransactions(parsed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchTransactions();
    fetchSalaryData();
  }, [fetchTransactions, fetchSalaryData]);

  // Scheduled Payday Detection with Idempotency & Duplicate Prevention
  useEffect(() => {
    if (!salaryPlan || activeSalaryCycle) return;

    const { isDue, occurrenceKey } = isPaydayDue(salaryPlan);
    if (!isDue) return;

    // Check if dismissed in this browser session
    const dismissedKey = `dismissed_payday_${occurrenceKey}`;
    if (typeof window !== 'undefined' && sessionStorage.getItem(dismissedKey)) {
      return;
    }

    // Check database to ensure no cycle already exists for this occurrenceKey
    supabase
      .from('salary_distribution_cycles')
      .select('id')
      .eq('occurrence_key', occurrenceKey)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setPaydayTriggerInfo({
            triggerType: 'schedule',
            detectedAmount: Number(salaryPlan.salary_amount),
          });
          setPaydayConfirmationOpen(true);
        }
      });
  }, [salaryPlan, activeSalaryCycle, supabase]);

  // Focus amount input when modal opens
  useEffect(() => {
    if (modalOpen) {
      setTimeout(() => {
        amountInputRef.current?.focus();
      }, 100);
    }
  }, [modalOpen]);

  // ---------------------------------------------------------------------------
  // Modal Handlers (Create & Edit)
  // ---------------------------------------------------------------------------

  const openCreateModal = () => {
    setEditingTransaction(null);
    setFormAmount('');
    setFormType('expense');
    setFormCategory('Food');
    setFormDesc('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setError(null);
    setModalOpen(true);
  };

  const openEditModal = (t: Transaction, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingTransaction(t);
    setFormAmount(t.amount ? t.amount.toString() : '');
    setFormType(t.type);
    setFormCategory(t.category || 'Other');
    setFormDesc(t.description || '');
    setFormDate(t.date ? t.date.slice(0, 10) : new Date().toISOString().split('T')[0]);
    setError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingTransaction(null);
    setSubmitting(false);
    setDeletingInModal(false);
  };

  const addQuickAmount = (val: number) => {
    const current = parseFloat(formAmount) || 0;
    const next = Math.round((current + val) * 100) / 100;
    setFormAmount(next.toString());
  };

  const setQuickDate = (preset: 'today' | 'yesterday') => {
    const d = new Date();
    if (preset === 'yesterday') {
      d.setDate(d.getDate() - 1);
    }
    setFormDate(d.toISOString().split('T')[0]);
  };

  // ---------------------------------------------------------------------------
  // Save Transaction (Insert or Update)
  // ---------------------------------------------------------------------------

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0 || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Please sign in to manage transactions.');
      }

      // Ensure profile row exists
      try {
        await supabase.from('profiles').upsert(
          {
            id: user.id,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      } catch {}

      if (editingTransaction) {
        // --- UPDATE EXISTING TRANSACTION ---
        const { data, error: updateErr } = await supabase
          .from('transactions')
          .update({
            amount,
            type: formType,
            category: formCategory,
            description: formDesc.trim() || null,
            date: formDate,
          })
          .eq('id', editingTransaction.id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (updateErr) throw updateErr;

        const updated = {
          ...(data as Transaction),
          amount: Number(data.amount) || amount,
        };

        setTransactions((prev) =>
          prev.map((t) => (t.id === editingTransaction.id ? updated : t))
        );
      } else {
        // --- INSERT NEW TRANSACTION ---
        const { data, error: insertErr } = await supabase
          .from('transactions')
          .insert({
            user_id: user.id,
            amount,
            type: formType,
            category: formCategory,
            description: formDesc.trim() || null,
            date: formDate,
          })
          .select()
          .single();

        if (insertErr) throw insertErr;

        const newRow: Transaction = {
          ...(data as Transaction),
          amount: Number(data.amount) || amount,
        };

        setTransactions((prev) => [newRow, ...prev]);

        // Create in-app notification
        try {
          await supabase.from('notifications').insert({
            user_id: user.id,
            title: formType === 'income' ? '💰 Income Recorded' : '💸 Expense Recorded',
            message: `${formType === 'income' ? 'Received' : 'Spent'} $${amount.toFixed(2)} on ${formCategory}${
              formDesc ? ` (${formDesc})` : ''
            }.`,
            type: 'info',
            is_read: false,
            action_url: '/finance',
          });
        } catch {}

        // Check if this newly recorded income matches salary distribution trigger
        if (
          formType === 'income' &&
          salaryPlan &&
          (formCategory.toLowerCase() === 'salary' ||
            amount >= Number(salaryPlan.salary_amount) * 0.7)
        ) {
          setPaydayTriggerInfo({
            triggerType: 'income',
            detectedAmount: amount,
            sourceTransactionId: newRow.id,
          });
          setPaydayConfirmationOpen(true);
        }
      }

      closeModal();
    } catch (err: any) {
      console.error('handleSaveTransaction error:', err);
      const msg =
        err?.message ||
        err?.error_description ||
        (err instanceof Error ? err.message : 'Failed to save transaction');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Delete Transaction
  // ---------------------------------------------------------------------------

  const deleteTransaction = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setError(null);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      const { error: err } = await supabase.from('transactions').delete().eq('id', id);
      if (err) throw err;
      if (modalOpen && editingTransaction?.id === id) {
        closeModal();
      }
    } catch (e: unknown) {
      fetchTransactions();
      setError(e instanceof Error ? e.message : 'Failed to delete transaction');
    }
  };

  // ---------------------------------------------------------------------------
  // Scanned Receipt Handler
  // ---------------------------------------------------------------------------

  const handleSaveScannedTransaction = async (data: {
    amount: number;
    type: 'expense';
    category: string;
    description: string;
    date: string;
  }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const safeAmount = Math.abs(Number(data.amount)) || 0;
    const safeDate =
      data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date)
        ? data.date
        : new Date().toISOString().split('T')[0];

    const { data: newRow, error: insertErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        amount: safeAmount,
        type: 'expense',
        category: data.category || 'Other',
        description: data.description || 'Receipt Expense',
        date: safeDate,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;
    if (newRow) {
      const parsed: Transaction = {
        ...(newRow as Transaction),
        amount: Number(newRow.amount) || safeAmount,
      };
      setTransactions((prev) => [parsed, ...prev]);
    }
  };

  // ---------------------------------------------------------------------------
  // Filtered & Summary Calculations
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDesc = t.description?.toLowerCase().includes(q);
        const matchCat = t.category?.toLowerCase().includes(q);
        const matchAmount = t.amount.toString().includes(q);
        if (!matchDesc && !matchCat && !matchAmount) return false;
      }
      if (filterType && t.type !== filterType) return false;
      if (filterCategory && t.category !== filterCategory) return false;
      if (filterDateFrom && t.date < filterDateFrom) return false;
      if (filterDateTo && t.date > filterDateTo) return false;
      return true;
    });
  }, [transactions, searchQuery, filterType, filterCategory, filterDateFrom, filterDateTo]);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  // All-time totals
  const allTimeIncome = useMemo(
    () =>
      transactions
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
    [transactions]
  );
  const allTimeExpenses = useMemo(
    () =>
      transactions
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
    [transactions]
  );
  const allTimeNetBalance = allTimeIncome - allTimeExpenses;

  // Monthly totals
  const monthlyTransactions = useMemo(
    () => transactions.filter((t) => t.date && t.date.startsWith(currentMonth)),
    [transactions, currentMonth]
  );
  const monthlyIncome = useMemo(
    () =>
      monthlyTransactions
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
    [monthlyTransactions]
  );
  const monthlyExpenses = useMemo(
    () =>
      monthlyTransactions
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
    [monthlyTransactions]
  );
  const monthlyNet = monthlyIncome - monthlyExpenses;

  // Display totals based on scope toggle
  const isAllTime = summaryScope === 'all';
  const displayIncome = isAllTime ? allTimeIncome : monthlyIncome;
  const displayExpenses = isAllTime ? allTimeExpenses : monthlyExpenses;
  const displayNet = isAllTime ? allTimeNetBalance : monthlyNet;

  // Daily Spending Chart (Current Month)
  const dailySpending = useMemo(() => {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const spending: { day: number; amount: number }[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentMonth}-${String(d).padStart(2, '0')}`;
      const dayTotal = monthlyTransactions
        .filter((t) => t.type === 'expense' && t.date === dateStr)
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      spending.push({ day: d, amount: dayTotal });
    }
    return spending;
  }, [monthlyTransactions, currentMonth, now]);

  const maxSpending = Math.max(...dailySpending.map((d) => d.amount), 1);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="text-slate-100 pb-24">
      <div className="max-w-6xl mx-auto px-2 sm:px-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pt-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-600/15 border border-emerald-500/20 text-emerald-400">
              <Wallet className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Finance
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-normal border border-slate-700/60">
                  {transactions.length} records
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Track income, expenses & daily spending analytics
              </p>
            </div>
          </div>

          {/* Action Buttons: Scan Receipt & Add Transaction */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScannerOpen(true)}
              className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-900 border border-emerald-500/30 text-emerald-300 hover:bg-slate-800 transition-colors flex items-center gap-1.5 active:scale-95 shadow-sm"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Scan Receipt</span>
            </button>

            {/* Main Add Button: Triggers the Premium Popup */}
            <button
              onClick={openCreateModal}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1.5 shadow-md shadow-emerald-600/30 active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Transaction</span>
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-900/30 border border-red-800 text-red-300 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Summary Scope Selector & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
          <div className="text-xs font-medium text-slate-400">
            {isAllTime ? (
              <span>Showing <strong>All-Time</strong> financial balance across all entries</span>
            ) : (
              <span>Showing <strong>{currentMonthName}</strong> cash flow</span>
            )}
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            {/* Scope Toggle: All Time / This Month */}
            <div className="inline-flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs shadow-sm">
              <button
                type="button"
                onClick={() => setSummaryScope('all')}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  isAllTime
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => setSummaryScope('month')}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  !isAllTime
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                This Month
              </button>
            </div>

            {/* Filters Button next to (All Time & This Month) */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors border shadow-sm ${
                showFilters || filterType || filterCategory || filterDateFrom || filterDateTo || searchQuery
                  ? 'bg-emerald-600 border-emerald-500 text-white shadow-emerald-900/30'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filters</span>
              {(filterType || filterCategory || filterDateFrom || filterDateTo || searchQuery) && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
            </button>

            {/* Salary Plan Discreet Trigger */}
            <button
              onClick={() => setSalaryPlanModalOpen(true)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors border shadow-sm ${
                activeSalaryCycle
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
              title="Configure your salary distribution plan"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Salary Plan</span>
              {activeSalaryCycle && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* Filters Bar: Opens directly below the Scope & Filters bar */}
        {showFilters && (
          <div className="mb-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3 animate-in fade-in duration-150 shadow-md">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-emerald-400" /> Filter Transactions
              </span>
              {(filterType || filterCategory || filterDateFrom || filterDateTo || searchQuery) && (
                <button
                  onClick={() => {
                    setFilterType('');
                    setFilterCategory('');
                    setFilterDateFrom('');
                    setFilterDateTo('');
                    setSearchQuery('');
                  }}
                  className="text-xs text-emerald-400 hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              {/* Search text */}
              <div className="md:col-span-1">
                <label className="block text-slate-400 mb-1">Search</label>
                <input
                  type="text"
                  placeholder="Merchant, note..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-slate-400 mb-1">Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as TransactionType | '')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                >
                  <option value="">All Types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="block text-slate-400 mb-1">Category</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                >
                  <option value="">All Categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_EMOJI[c]} {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* From Date */}
              <div>
                <label className="block text-slate-400 mb-1">From Date</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>

              {/* To Date */}
              <div>
                <label className="block text-slate-400 mb-1">To Date</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* ACTIVE PAYDAY DISTRIBUTION CHECKLIST (Visible only during active distribution) */}
        {activeSalaryCycle && (
          <PaydayChecklistCard
            cycle={activeSalaryCycle}
            plan={salaryPlan}
            currency={salaryPlan?.currency || 'EGP'}
            onCycleUpdated={(updated) => setActiveSalaryCycle(updated)}
            onCycleCompleted={() => {
              setActiveSalaryCycle(null);
              fetchSalaryData();
              fetchTransactions();
            }}
            onOpenSettings={() => setSalaryPlanModalOpen(true)}
          />
        )}

        {/* Metrics Cards Grid (Net Balance at the Top) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
          {/* Net Balance Card (Top Priority - Full width on mobile, 1st on desktop) */}
          <div className="col-span-2 sm:col-span-1 p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-850 border border-slate-800/90 shadow-md relative overflow-hidden group">
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <DollarSign className="w-4 h-4 text-blue-400" /> Net Balance
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700/50">
                {isAllTime ? 'Total Balance' : 'Cash Flow'}
              </span>
            </div>
            <p
              className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                displayNet >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {displayNet >= 0 ? '+' : '-'}$
              {Math.abs(displayNet).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {isAllTime
                ? `Month cash flow: ${monthlyNet >= 0 ? '+' : '-'}$${Math.abs(monthlyNet).toFixed(2)}`
                : `All-time balance: ${allTimeNetBalance >= 0 ? '+' : '-'}$${Math.abs(allTimeNetBalance).toFixed(2)}`}
            </p>
          </div>

          {/* Income Card */}
          <div className="col-span-1 p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm relative overflow-hidden group">
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-2 text-xs font-medium text-slate-400">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Total Income
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full">
                {isAllTime ? 'All-Time' : 'Month'}
              </span>
            </div>
            <p className="text-xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight">
              ${displayIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 truncate">
              {isAllTime ? 'Total earnings' : `Earned in ${currentMonthName}`}
            </p>
          </div>

          {/* Expenses Card */}
          <div className="col-span-1 p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm relative overflow-hidden group">
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-2 text-xs font-medium text-slate-400">
                <TrendingDown className="w-4 h-4 text-rose-400" /> Total Expenses
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full">
                {isAllTime ? 'All-Time' : 'Month'}
              </span>
            </div>
            <p className="text-xl sm:text-3xl font-extrabold text-rose-400 tracking-tight">
              ${displayExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 truncate">
              {isAllTime ? 'Total spending' : `Spent in ${currentMonthName}`}
            </p>
          </div>
        </div>

        {/* Daily Spending Graph */}
        <div className="mb-6 p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs sm:text-sm font-semibold text-slate-300">
              Daily Spending Trends — {currentMonthName}
            </h2>
            <span className="text-[10px] text-slate-500">
              Peak: ${maxSpending.toFixed(2)}
            </span>
          </div>

          <div className="flex items-end gap-[2px] sm:gap-1 h-28 sm:h-32 pt-2">
            {dailySpending.map((d) => (
              <div
                key={d.day}
                className="flex-1 flex flex-col items-center justify-end h-full group relative"
              >
                <div
                  className="w-full rounded-t-sm transition-all group-hover:opacity-100 min-h-[3px]"
                  style={{
                    height: d.amount > 0 ? `${(d.amount / maxSpending) * 100}%` : '3px',
                    backgroundColor: d.amount > 0 ? '#10b981' : '#334155',
                    opacity: d.amount > 0 ? 0.85 : 0.25,
                  }}
                />
                {/* Hover Tooltip */}
                <div className="absolute bottom-full mb-1.5 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                  <div className="bg-slate-800 text-[10px] text-white font-medium rounded-lg px-2 py-1 whitespace-nowrap shadow-xl border border-slate-700">
                    Day {d.day}: ${d.amount.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-slate-500">
            <span>Day 1</span>
            <span>Day {Math.floor(dailySpending.length / 2)}</span>
            <span>Day {dailySpending.length}</span>
          </div>
        </div>

        {/* ── TRANSACTIONS LIST ── */}
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm sm:text-base text-white">
                Transaction History
              </h2>
              <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-medium">
                {filtered.length}
              </span>
            </div>

            {/* Hint for mobile users */}
            <span className="text-[11px] text-slate-400 hidden sm:inline-block">
              💡 Tap any transaction to edit
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
              <p className="text-xs">Loading financial records...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 px-4 text-slate-500">
              <DollarSign className="w-10 h-10 mx-auto mb-2 text-slate-700" />
              <p className="text-sm font-medium text-slate-400">No transactions found</p>
              <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto">
                {searchQuery || filterType || filterCategory || filterDateFrom || filterDateTo
                  ? 'No records match your selected filters.'
                  : 'Start recording your expenses and income with the "Add Transaction" button.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {filtered.map((t) => {
                const isIncome = t.type === 'income';
                return (
                  <div
                    key={t.id}
                    onClick={(e) => openEditModal(t, e)}
                    className="flex items-center gap-3 p-3.5 sm:px-4 hover:bg-slate-800/60 active:bg-slate-800/80 transition-all cursor-pointer group select-none"
                    title="Click to edit this transaction"
                  >
                    {/* Category Icon Badge */}
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 border transition-transform group-hover:scale-105 ${
                        isIncome
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                      }`}
                    >
                      {CATEGORY_EMOJI[t.category ?? 'Other'] ?? '📦'}
                    </div>

                    {/* Transaction Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-white group-hover:text-emerald-300 transition-colors truncate">
                          {t.description || t.category || 'Transaction'}
                        </p>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700/60 shrink-0">
                          {t.category || 'Other'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(t.date).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Amount & Actions */}
                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                      <span
                        className={`text-sm sm:text-base font-bold flex items-center gap-0.5 ${
                          isIncome ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isIncome ? (
                          <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4 stroke-[2.5]" />
                        )}
                        ${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>

                      {/* Edit Hint Icon (Visible on mobile and hover on desktop) */}
                      <div className="p-1.5 rounded-lg text-slate-500 group-hover:text-slate-300 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </div>

                      {/* Inline Delete Button */}
                      <button
                        onClick={(e) => deleteTransaction(t.id, e)}
                        className="p-2 sm:p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete transaction"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── PREMIUM TRANSACTION POPUP MODAL (ADD & EDIT) ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 sm:slide-in-from-bottom-0 slide-in-from-bottom-8 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Drag Indicator */}
            <div className="w-12 h-1.5 rounded-full bg-slate-700 mx-auto my-2.5 sm:hidden" />

            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 pt-3 sm:pt-5 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-xl ${
                    formType === 'income'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {editingTransaction ? <Edit3 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {editingTransaction ? 'Edit Transaction' : 'New Transaction'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {editingTransaction
                      ? 'Update the details or amount of this record'
                      : 'Quickly log your income or expense entry'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveTransaction} className="p-5 space-y-4">
              {/* Type Toggle: Expense vs Income */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-950 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormType('expense')}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    formType === 'expense'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-950/50'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ArrowDownRight className="w-4 h-4 text-rose-400" />
                  <span>Expense</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormType('income')}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    formType === 'income'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-950/50'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                  <span>Income</span>
                </button>
              </div>

              {/* Hero Amount Input Card */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Amount *
                </label>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-3xl sm:text-4xl font-extrabold ${
                      formType === 'income' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    $
                  </span>
                  <input
                    ref={amountInputRef}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full bg-transparent text-3xl sm:text-4xl font-extrabold text-white outline-none placeholder-slate-600"
                    required
                  />
                </div>

                {/* Quick Increment Chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
                  <span className="text-[10px] text-slate-500 font-medium mr-1">Quick:</span>
                  {QUICK_AMOUNTS.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => addQuickAmount(val)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 hover:text-white transition active:scale-95"
                    >
                      +${val}
                    </button>
                  ))}
                  {formAmount && (
                    <button
                      type="button"
                      onClick={() => setFormAmount('')}
                      className="px-2 py-1 rounded-lg text-[10px] text-red-400 hover:underline ml-auto"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Category Selector Grid */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Category *
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto pr-1">
                  {CATEGORIES.map((cat) => {
                    const isSelected = formCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFormCategory(cat)}
                        className={`flex items-center gap-1.5 p-2 rounded-xl border text-xs font-medium transition-all text-left truncate ${
                          isSelected
                            ? 'bg-blue-600/25 border-blue-500 text-white shadow-sm ring-1 ring-blue-500/40'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                        }`}
                      >
                        <span className="text-base shrink-0">{CATEGORY_EMOJI[cat]}</span>
                        <span className="truncate">{cat}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Description / Merchant (optional)
                </label>
                <div className="relative">
                  <Receipt className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="e.g. Starbucks, Target, Freelance project..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Date Selector with Quick Presets */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    Transaction Date *
                  </label>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setQuickDate('today')}
                      className={`px-2 py-0.5 rounded-md border text-[10px] transition ${
                        formDate === new Date().toISOString().split('T')[0]
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold'
                          : 'bg-slate-850 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDate('yesterday')}
                      className="px-2 py-0.5 rounded-md border border-slate-800 bg-slate-850 text-slate-400 hover:text-white text-[10px] transition"
                    >
                      Yesterday
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs sm:text-sm text-white outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                {editingTransaction ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this transaction?')) {
                        deleteTransaction(editingTransaction.id);
                      }
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-medium bg-red-950/40 border border-red-800/60 hover:bg-red-900/60 text-red-300 transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  {editingTransaction && (
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      Cancel
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={!formAmount || parseFloat(formAmount) <= 0 || submitting}
                    className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white transition-all shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      formType === 'income'
                        ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                        : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                    }`}
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    )}
                    <span>{editingTransaction ? 'Save Changes' : `Add ${formType === 'income' ? 'Income' : 'Expense'}`}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── RECEIPT SCANNER MODAL ── */}
      <ReceiptScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onSaveTransaction={handleSaveScannedTransaction}
      />

      {/* ── SALARY DISTRIBUTION PLAN MODAL ── */}
      <SalaryPlanModal
        isOpen={salaryPlanModalOpen}
        onClose={() => setSalaryPlanModalOpen(false)}
        onPlanSaved={(plan) => {
          setSalaryPlan(plan);
          fetchSalaryData();
        }}
        onStartCycleManually={(amount) => {
          setPaydayTriggerInfo({
            triggerType: 'income',
            detectedAmount: amount,
          });
          setPaydayConfirmationOpen(true);
        }}
        activeCycle={activeSalaryCycle}
      />

      {/* ── PAYDAY CONFIRMATION DIALOG ── */}
      {salaryPlan && (
        <PaydayConfirmationDialog
          isOpen={paydayConfirmationOpen}
          onClose={() => {
            setPaydayConfirmationOpen(false);
            if (salaryPlan) {
              const { occurrenceKey } = isPaydayDue(salaryPlan);
              if (occurrenceKey && typeof window !== 'undefined') {
                sessionStorage.setItem(`dismissed_payday_${occurrenceKey}`, 'true');
              }
            }
          }}
          plan={salaryPlan}
          activeCycle={activeSalaryCycle}
          triggerType={paydayTriggerInfo.triggerType}
          detectedAmount={paydayTriggerInfo.detectedAmount}
          sourceTransactionId={paydayTriggerInfo.sourceTransactionId}
          onCycleCreated={(newCycle) => {
            setActiveSalaryCycle(newCycle);
          }}
          onResumeActiveCycle={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}
    </div>
  );
}
