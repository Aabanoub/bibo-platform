'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Calendar,
  Wallet,
  Activity,
  StickyNote,
  Award,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export default function WeeklyReviewPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiReview, setAiReview] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState({
    income: 0,
    expense: 0,
    netSavings: 0,
    savingsRate: 0,
    completedTasks: 0,
    totalTasks: 0,
    taskCompletionRate: 0,
    habitLogsCount: 0,
    activeHabitsCount: 0,
    notesCreated: 0,
  });

  const loadWeeklyData = useCallback(async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // 7 days ago timestamp
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString();
      const sevenDaysAgoDate = sevenDaysAgo.toISOString().split('T')[0];

      // 1. Transactions past 7 days
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', sevenDaysAgoDate);

      let income = 0;
      let expense = 0;
      (transactions || []).forEach((t: any) => {
        if (t.type === 'income') income += Number(t.amount);
        else expense += Number(t.amount);
      });

      const netSavings = income - expense;
      const savingsRate = income > 0 ? Math.round((netSavings / income) * 100) : 0;

      // 2. Tasks
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id);

      const recentTasks = (allTasks || []).filter(
        (t: any) => t.created_at >= sevenDaysAgoStr || t.status === 'done'
      );
      const completedTasks = recentTasks.filter((t: any) => t.status === 'done').length;
      const totalTasks = recentTasks.length;
      const taskCompletionRate =
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

      // 3. Habits
      const { data: habits } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', user.id);

      const { data: habitLogs } = await supabase
        .from('habit_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('completed_at', sevenDaysAgoStr);

      // 4. Notes
      const { data: notes } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', sevenDaysAgoStr);

      setStats({
        income,
        expense,
        netSavings,
        savingsRate,
        completedTasks,
        totalTasks,
        taskCompletionRate,
        habitLogsCount: habitLogs?.length || 0,
        activeHabitsCount: habits?.length || 0,
        notesCreated: notes?.length || 0,
      });
    } catch (err) {
      console.error('Failed to load weekly review data:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadWeeklyData();
  }, [loadWeeklyData]);

  const generateAiSynthesis = async () => {
    setGeneratingAi(true);
    try {
      const prompt = `
Generate a comprehensive, motivational Sunday Life OS Review for this week based on these numbers:
- Total Income: $${stats.income.toFixed(2)}
- Total Expenses: $${stats.expense.toFixed(2)}
- Net Savings: $${stats.netSavings.toFixed(2)} (${stats.savingsRate}% savings rate)
- Tasks: ${stats.completedTasks} completed out of ${stats.totalTasks} total (${stats.taskCompletionRate}% completion rate)
- Habits: ${stats.habitLogsCount} habit sessions completed across ${stats.activeHabitsCount} active habits
- Notes: ${stats.notesCreated} new thoughts/notes captured

Format your review with clear markdown sections:
1. 🏆 **Weekly Wins & Highlights** (Praise strong areas)
2. 💡 **Financial & Habit Diagnosis** (Actionable advice based on numbers)
3. 🎯 **Strategic Priorities For Next Week** (3 concrete goals)
4. ⚡ **Productivity Rating** (Score out of 10 with brief justification)
`;

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          persona: 'accountability-coach',
        }),
      });

      if (!res.ok) throw new Error('AI failed to generate review');
      const data = await res.json();
      setAiReview(data.reply);
    } catch (err: any) {
      console.error('AI review generation error:', err);
      alert(err.message || 'Could not generate AI review');
    } finally {
      setGeneratingAi(false);
    }
  };

  return (
    <div className="flex h-full min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20">
            <Award size={18} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Sunday Life Review</h1>
            <p className="text-xs text-zinc-400">Weekly Performance, Habits & Financial Synthesis</p>
          </div>
        </div>

        <button
          onClick={generateAiSynthesis}
          disabled={generatingAi}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50"
        >
          {generatingAi ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          <span>{generatingAi ? 'Analyzing Week...' : 'Generate AI Weekly Review'}</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Top 4 Metric Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Net Savings */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Weekly Net Cash</span>
                <Wallet size={16} className="text-emerald-400" />
              </div>
              <p
                className={`text-2xl font-bold tracking-tight ${
                  stats.netSavings >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                ${stats.netSavings.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Income: ${stats.income.toFixed(2)} | Expense: ${stats.expense.toFixed(2)}
              </p>
            </div>

            {/* Task Completion */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Task Completion</span>
                <CheckCircle2 size={16} className="text-blue-400" />
              </div>
              <p className="text-2xl font-bold tracking-tight text-white">
                {stats.taskCompletionRate}%
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {stats.completedTasks} completed of {stats.totalTasks} tasks
              </p>
            </div>

            {/* Habit Consistency */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Habit Consistency</span>
                <Activity size={16} className="text-purple-400" />
              </div>
              <p className="text-2xl font-bold tracking-tight text-white">
                {stats.habitLogsCount} check-ins
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Across {stats.activeHabitsCount} active daily habits
              </p>
            </div>

            {/* Notes & Knowledge */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider">Knowledge Captured</span>
                <StickyNote size={16} className="text-amber-400" />
              </div>
              <p className="text-2xl font-bold tracking-tight text-white">
                {stats.notesCreated} notes
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Insights and thoughts saved this week
              </p>
            </div>
          </div>

          {/* AI Review Output */}
          {aiReview && (
            <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/30 via-zinc-900 to-purple-950/20 p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-4 text-indigo-400 font-semibold text-sm">
                <Sparkles size={18} />
                <span>AI Executive Coach Synthesis</span>
              </div>
              <div className="prose prose-invert max-w-none text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap">
                {aiReview}
              </div>
            </div>
          )}

          {/* Weekly Habits & Focus breakdown */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Financial Health Summary */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Wallet size={16} className="text-emerald-400" />
                <span>Financial Health Breakdown</span>
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Total Money In (Income)</span>
                  <span className="font-semibold text-emerald-400">+${stats.income.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Total Money Out (Expenses)</span>
                  <span className="font-semibold text-rose-400">-${stats.expense.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Savings Rate</span>
                  <span className="font-semibold text-white">{stats.savingsRate}%</span>
                </div>
              </div>
            </div>

            {/* Productivity Health Summary */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Activity size={16} className="text-blue-400" />
                <span>Execution & Consistency</span>
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Task Execution Rate</span>
                  <span className="font-semibold text-blue-400">{stats.taskCompletionRate}%</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Total Habit Logs</span>
                  <span className="font-semibold text-purple-400">{stats.habitLogsCount} sessions</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Notes Documented</span>
                  <span className="font-semibold text-amber-400">{stats.notesCreated} entries</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
