'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'lucide-react';
import ReceiptScannerModal from '@/components/ReceiptScannerModal';

// ---------------------------------------------------------------------------
// Constants
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
  Other: '📦',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FinancePage() {
  const supabase = createClient();

  // ---- state --------------------------------------------------------------
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form
  const [showForm, setShowForm] = useState(false);
  const [formAmount, setFormAmount] = useState('');
  const [formType, setFormType] = useState<TransactionType>('expense');
  const [formCategory, setFormCategory] = useState('Food');
  const [formDesc, setFormDesc] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);

  // filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<TransactionType | ''>('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // scanner
  const [scannerOpen, setScannerOpen] = useState(false);

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

    await supabase.from('profiles').upsert(
      {
        id: user.id,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    const { data: newRow, error: insertErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        amount: data.amount,
        type: data.type,
        category: data.category,
        description: data.description,
        date: data.date,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;
    if (newRow) {
      setTransactions((prev) => [newRow as Transaction, ...prev]);
    }
  };

  // ---- fetch --------------------------------------------------------------
  const fetchTransactions = useCallback(async () => {
    try {
      setError(null);
      const { data, error: err } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });
      if (err) throw err;
      setTransactions((data as Transaction[]) ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // ---- create transaction -------------------------------------------------
  const createTransaction = async () => {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) return;
    setSubmitting(true);
    try {
      setError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('Please sign in to add transactions.');
        return;
      }

      // Ensure profile row exists
      try {
        await supabase.from('profiles').upsert(
          {
            id: user.id,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          },
          { onConflict: 'id' }
        );
      } catch {}

      const { data, error: err } = await supabase
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
      if (err) throw err;
      setTransactions((prev) => [data as Transaction, ...prev]);
      setFormAmount('');
      setFormDesc('');
      setFormDate(new Date().toISOString().split('T')[0]);
      setShowForm(false);
    } catch (e: any) {
      console.error('createTransaction error:', e);
      const msg = e?.message || e?.error_description || (e instanceof Error ? e.message : 'Failed to create transaction');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- delete transaction -------------------------------------------------
  const deleteTransaction = async (id: string) => {
    try {
      setError(null);
      const { error: err } = await supabase.from('transactions').delete().eq('id', id);
      if (err) throw err;
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete transaction');
    }
  };

  // ---- filtering ----------------------------------------------------------
  const filtered = transactions.filter((t) => {
    if (filterType && t.type !== filterType) return false;
    if (filterCategory && t.category !== filterCategory) return false;
    if (filterDateFrom && t.date < filterDateFrom) return false;
    if (filterDateTo && t.date > filterDateTo) return false;
    return true;
  });

  // ---- monthly summary ----------------------------------------------------
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const monthlyTransactions = transactions.filter((t) => t.date.startsWith(currentMonth));
  const totalIncome = monthlyTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = monthlyTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const netBalance = totalIncome - totalExpenses;

  // ---- daily spending chart (current month) -------------------------------
  const dailySpending = useMemo(() => {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const spending: { day: number; amount: number }[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentMonth}-${String(d).padStart(2, '0')}`;
      const dayTotal = monthlyTransactions
        .filter((t) => t.type === 'expense' && t.date === dateStr)
        .reduce((sum, t) => sum + t.amount, 0);
      spending.push({ day: d, amount: dayTotal });
    }
    return spending;
  }, [monthlyTransactions, currentMonth]);

  const maxSpending = Math.max(...dailySpending.map((d) => d.amount), 1);

  // ---- render -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-400" />
            Finance
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors ${
                showFilters || filterType || filterCategory || filterDateFrom || filterDateTo
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-slate-800 hover:bg-slate-700'
              }`}
            >
              <Filter className="w-4 h-4" /> Filters
            </button>
            <button
              onClick={() => setScannerOpen(true)}
              className="px-3 py-2 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 transition-colors flex items-center gap-1.5 text-emerald-400 border border-emerald-500/20"
            >
              <Camera className="w-4 h-4" /> Scan Receipt (AI)
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-3 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add Transaction
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Monthly Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
              <TrendingUp className="w-4 h-4 text-emerald-400" /> Income
            </div>
            <p className="text-2xl font-bold text-emerald-400">${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
              <TrendingDown className="w-4 h-4 text-red-400" /> Expenses
            </div>
            <p className="text-2xl font-bold text-red-400">${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
              <DollarSign className="w-4 h-4 text-blue-400" /> Net Balance
            </div>
            <p className={`text-2xl font-bold ${netBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {netBalance >= 0 ? '+' : '-'}${Math.abs(netBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Add Transaction Form */}
        {showForm && (
          <div className="mb-6 p-4 rounded-lg bg-slate-900 border border-slate-800">
            <h2 className="text-lg font-semibold mb-3">New Transaction</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <input
                type="number"
                placeholder="Amount *"
                min="0"
                step="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 placeholder-slate-500"
              />
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as TransactionType)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Description (optional)"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 placeholder-slate-500"
              />
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createTransaction}
                disabled={!formAmount || parseFloat(formAmount) <= 0 || submitting}
                className="px-4 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        {showFilters && (
          <div className="mb-4 p-4 rounded-lg bg-slate-900 border border-slate-800 flex flex-wrap gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as TransactionType | '')}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">All</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Category</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">All</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">From</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">To</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {(filterType || filterCategory || filterDateFrom || filterDateTo) && (
              <button
                onClick={() => { setFilterType(''); setFilterCategory(''); setFilterDateFrom(''); setFilterDateTo(''); }}
                className="self-end text-xs text-slate-400 hover:text-white underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Daily Spending Chart */}
        <div className="mb-6 p-4 rounded-xl bg-slate-900 border border-slate-800">
          <h2 className="text-sm font-semibold text-slate-400 mb-3">
            Daily Spending — {new Date(now.getFullYear(), now.getMonth()).toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex items-end gap-[2px] h-32">
            {dailySpending.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                <div
                  className="w-full bg-emerald-500/70 rounded-t-sm transition-all group-hover:bg-emerald-400 min-h-[2px]"
                  style={{ height: d.amount > 0 ? `${(d.amount / maxSpending) * 100}%` : '2px', opacity: d.amount > 0 ? 1 : 0.2 }}
                />
                {/* Tooltip */}
                <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
                  <div className="bg-slate-800 text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg border border-slate-700">
                    Day {d.day}: ${d.amount.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-slate-600">
            <span>1</span>
            <span>{Math.floor(dailySpending.length / 2)}</span>
            <span>{dailySpending.length}</span>
          </div>
        </div>

        {/* Transaction List */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h2 className="font-semibold">Transactions</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <DollarSign className="w-10 h-10 mx-auto mb-2 text-slate-700" />
              <p className="text-sm">No transactions found.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {filtered.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3 hover:bg-slate-800/50 transition-colors group">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-lg flex-shrink-0">
                    {CATEGORY_EMOJI[t.category ?? 'Other'] ?? '📦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{t.description || t.category || 'Transaction'}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{t.category}</span>
                    </div>
                    <p className="text-xs text-slate-500">{new Date(t.date).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-sm font-semibold flex items-center gap-0.5 ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.type === 'income' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      ${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    <button
                      onClick={() => deleteTransaction(t.id)}
                      className="p-1.5 rounded hover:bg-red-600/30 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ReceiptScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onSaveTransaction={handleSaveScannedTransaction}
      />
    </div>
  );
}
