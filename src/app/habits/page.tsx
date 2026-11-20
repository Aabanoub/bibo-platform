'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import type { Habit, HabitLog, HabitFrequency } from '@/types';
import {
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  X,
  CheckCircle2,
  Circle,
  Flame,
  BarChart3,
  CalendarDays,
  Sparkles,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDayStr(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekDays(): { date: string; label: string }[] {
  const days = [];
  for (let i = -6; i <= 0; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({
      date: getDayStr(i),
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
    });
  }
  return days;
}

function computeStreak(logs: HabitLog[], frequency: HabitFrequency): number {
  if (logs.length === 0) return 0;

  const uniqueDays = Array.from(new Set(logs.map((l) => l.completed_at.split('T')[0]))).sort().reverse();

  if (frequency === 'daily') {
    let streak = 0;
    const today = getDayStr();
    let expected = today;

    for (const day of uniqueDays) {
      if (day === expected) {
        streak++;
        const d = new Date(expected);
        d.setDate(d.getDate() - 1);
        expected = d.toISOString().split('T')[0];
      } else if (day < expected) {
        // Allow today to be missing — start from yesterday
        if (streak === 0 && day === getDayStr(-1)) {
          streak = 1;
          const d = new Date(day);
          d.setDate(d.getDate() - 1);
          expected = d.toISOString().split('T')[0];
        } else {
          break;
        }
      }
    }
    return streak;
  }

  // weekly: count consecutive weeks
  const weeks = Array.from(new Set(uniqueDays.map((d) => {
    const dt = new Date(d);
    const start = new Date(dt);
    start.setDate(dt.getDate() - dt.getDay());
    return start.toISOString().split('T')[0];
  }))).sort().reverse();

  let streak = 0;
  let expected = (() => {
    const now = new Date();
    now.setDate(now.getDate() - now.getDay());
    return now.toISOString().split('T')[0];
  })();

  for (const w of weeks) {
    if (w === expected) {
      streak++;
      const d = new Date(expected);
      d.setDate(d.getDate() - 7);
      expected = d.toISOString().split('T')[0];
    } else {
      break;
    }
  }
  return streak;
}

// ---------------------------------------------------------------------------
// Default colors & emojis
// ---------------------------------------------------------------------------

const COLOR_OPTIONS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#64748b',
];

const EMOJI_OPTIONS = ['💪', '📚', '🧘', '🏃', '💧', '🎯', '✍️', '🛌', '🥗', '🧠', '🎵', '🌿'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HabitsPage() {
  const supabase = createClient();

  // ---- state --------------------------------------------------------------
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formFreq, setFormFreq] = useState<HabitFrequency>('daily');
  const [formEmoji, setFormEmoji] = useState('💪');
  const [formColor, setFormColor] = useState('#6366f1');
  const [submitting, setSubmitting] = useState(false);

  // view
  const [view, setView] = useState<'today' | 'week'>('today');
  const [togglingKeys, setTogglingKeys] = useState<Set<string>>(new Set());

  // ---- fetch data ---------------------------------------------------------
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [habitsRes, logsRes] = await Promise.all([
        supabase.from('habits').select('*').order('created_at', { ascending: true }),
        supabase
          .from('habit_logs')
          .select('*')
          .gte('completed_at', getDayStr(-30))
          .order('completed_at', { ascending: false }),
      ]);
      if (habitsRes.error) throw habitsRes.error;
      if (logsRes.error) throw logsRes.error;
      setHabits((habitsRes.data as Habit[]) ?? []);
      setLogs((logsRes.data as HabitLog[]) ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load habits');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Supabase Realtime Subscriptions for Habits & Daily Logs
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setupRealtime() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel(`habits-live-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'habits', filter: `user_id=eq.${user.id}` },
          () => fetchData()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'habit_logs', filter: `user_id=eq.${user.id}` },
          () => fetchData()
        )
        .subscribe();
    }

    setupRealtime();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, fetchData]);

  // ---------------------------------------------------------------------------
  // Daily Date Rollover & Tab Visibility Check
  // ---------------------------------------------------------------------------
  const todayRef = useRef<string>(getDayStr());

  useEffect(() => {
    function checkDateRollover() {
      const current = getDayStr();
      if (current !== todayRef.current) {
        todayRef.current = current;
        fetchData();
      }
    }

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        checkDateRollover();
        fetchData();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }
    const interval = setInterval(checkDateRollover, 60000);

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      clearInterval(interval);
    };
  }, [fetchData]);

  // ---- create habit -------------------------------------------------------
  const createHabit = async () => {
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      setError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('Please sign in to create habits.');
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
        .from('habits')
        .insert({
          user_id: user.id,
          name: formName.trim(),
          description: formDesc.trim() || null,
          frequency: formFreq,
          icon: formEmoji,
          color: formColor,
        })
        .select()
        .single();
      if (err) throw err;
      setHabits((prev) => [...prev, data as Habit]);
      setFormName('');
      setFormDesc('');
      setShowForm(false);
    } catch (e: any) {
      console.error('createHabit error:', e);
      const msg = e?.message || e?.error_description || (e instanceof Error ? e.message : 'Failed to create habit');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- delete habit -------------------------------------------------------
  const deleteHabit = async (id: string) => {
    try {
      setError(null);
      // delete logs first
      await supabase.from('habit_logs').delete().eq('habit_id', id);
      const { error: err } = await supabase.from('habits').delete().eq('id', id);
      if (err) throw err;
      setHabits((prev) => prev.filter((h) => h.id !== id));
      setLogs((prev) => prev.filter((l) => l.habit_id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete habit');
    }
  };

  // ---- toggle habit -------------------------------------------------------
  const toggleHabit = async (habit: Habit, rawDate: string) => {
    const date = rawDate.slice(0, 10);
    const toggleKey = `${habit.id}_${date}`;
    if (togglingKeys.has(toggleKey)) return;

    setTogglingKeys((prev) => new Set(prev).add(toggleKey));

    const existing = logs.find(
      (l) => l.habit_id === habit.id && l.completed_at.slice(0, 10) === date,
    );

    try {
      setError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('Please sign in to update habits.');
        return;
      }

      if (existing) {
        // Optimistically remove from logs
        setLogs((prev) =>
          prev.filter((l) => !(l.habit_id === habit.id && l.completed_at.slice(0, 10) === date))
        );

        const { error: err } = await supabase
          .from('habit_logs')
          .delete()
          .eq('habit_id', habit.id)
          .eq('completed_at', date);

        if (err) {
          // Rollback on failure
          setLogs((prev) => [...prev, existing]);
          throw err;
        }
      } else {
        // Upsert handles race conditions & duplicate key constraint gracefully
        const { data, error: err } = await supabase
          .from('habit_logs')
          .upsert(
            {
              user_id: user.id,
              habit_id: habit.id,
              completed_at: date,
            },
            { onConflict: 'habit_id,completed_at' }
          )
          .select()
          .single();

        if (err) {
          // If a unique constraint violation occurs anyway, fetch the existing log rather than throwing
          if (err.code === '23505' || err.message?.includes('habit_logs_habit_id_completed_at_key')) {
            const { data: fetchedLog } = await supabase
              .from('habit_logs')
              .select('*')
              .eq('habit_id', habit.id)
              .eq('completed_at', date)
              .maybeSingle();

            if (fetchedLog) {
              setLogs((prev) => [
                fetchedLog as HabitLog,
                ...prev.filter(
                  (l) => !(l.habit_id === habit.id && l.completed_at.slice(0, 10) === date)
                ),
              ]);
              return;
            }
          }
          throw err;
        }

        if (data) {
          setLogs((prev) => [
            data as HabitLog,
            ...prev.filter(
              (l) => !(l.habit_id === habit.id && l.completed_at.slice(0, 10) === date)
            ),
          ]);
        }

        // create notification on completion
        try {
          await supabase.from('notifications').insert({
            user_id: user.id,
            title: 'Habit Completed! 🎉',
            message: `You completed "${habit.name}" for today. Keep the streak going!`,
            type: 'habit',
            is_read: false,
            action_url: '/habits',
          });
        } catch {}
      }
    } catch (e: any) {
      console.error('toggleHabit error:', e);
      if (e?.code === '23505' || e?.message?.includes('habit_logs_habit_id_completed_at_key')) {
        // Silently recover by refreshing data
        fetchData();
      } else {
        const msg =
          e?.message || e?.error_description || (e instanceof Error ? e.message : 'Failed to update habit log');
        setError(msg);
      }
    } finally {
      setTogglingKeys((prev) => {
        const next = new Set(prev);
        next.delete(toggleKey);
        return next;
      });
    }
  };

  // ---- computed -----------------------------------------------------------
  const today = getDayStr();
  const weekDays = useMemo(() => getWeekDays(), []);

  const isCompletedOn = (habitId: string, date: string): boolean =>
    logs.some((l) => l.habit_id === habitId && l.completed_at.slice(0, 10) === date.slice(0, 10));

  const habitLogs = (habitId: string) => logs.filter((l) => l.habit_id === habitId);

  const completionPct = (habit: Habit): number => {
    const last30 = habit.frequency === 'daily' ? 30 : 4;
    const completed = habitLogs(habit.id).length;
    return Math.min(100, Math.round((completed / last30) * 100));
  };

  const todayCompleted = habits.filter((h) => isCompletedOn(h.id, today)).length;
  const todayTotal = habits.length;

  // ---- render -------------------------------------------------------------
  return (
    <div className="text-slate-100">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" />
            Habits
          </h1>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              <button
                onClick={() => setView('today')}
                className={`px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${view === 'today' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                Today
              </button>
              <button
                onClick={() => setView('week')}
                className={`px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${view === 'week' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                Week
              </button>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm bg-purple-600 hover:bg-purple-500 text-white transition-colors flex items-center gap-1.5 font-medium shadow-sm active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Add Habit
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

        {/* Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
            <p className="text-2xl font-bold text-purple-400">{habits.length}</p>
            <p className="text-xs text-slate-500">Total Habits</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
            <p className="text-2xl font-bold text-emerald-400">{todayCompleted}/{todayTotal}</p>
            <p className="text-xs text-slate-500">Done Today</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
            <p className="text-2xl font-bold text-orange-400">
              {todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0}%
            </p>
            <p className="text-xs text-slate-500">Today&apos;s Rate</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
            <p className="text-2xl font-bold text-amber-400">
              {habits.length > 0 ? Math.max(...habits.map((h) => computeStreak(habitLogs(h.id), h.frequency))) : 0}
            </p>
            <p className="text-xs text-slate-500">Best Streak</p>
          </div>
        </div>

        {/* Add Habit Form */}
        {showForm && (
          <div className="mb-6 p-4 rounded-lg bg-slate-900 border border-slate-800">
            <h2 className="text-lg font-semibold mb-3">New Habit</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Habit name *"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 placeholder-slate-500"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 placeholder-slate-500"
              />
              <select
                value={formFreq}
                onChange={(e) => setFormFreq(e.target.value as HabitFrequency)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            {/* Emoji picker */}
            <div className="mt-3">
              <label className="block text-xs text-slate-400 mb-1.5">Icon</label>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setFormEmoji(e)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${
                      formEmoji === e ? 'bg-purple-600 ring-2 ring-purple-400 scale-110' : 'bg-slate-800 hover:bg-slate-700'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div className="mt-3">
              <label className="block text-xs text-slate-400 mb-1.5">Color</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFormColor(c)}
                    className={`w-7 h-7 rounded-full transition-all ${
                      formColor === c ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createHabit}
                disabled={!formName.trim() || submitting}
                className="px-4 py-2 rounded-lg text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
          </div>
        ) : habits.length === 0 ? (
          <div className="text-center py-16">
            <Sparkles className="w-14 h-14 text-slate-700 mx-auto mb-3" />
            <p className="text-lg font-medium text-slate-500">No habits yet</p>
            <p className="text-sm text-slate-600 mt-1">Start building great habits — add your first one above!</p>
          </div>
        ) : view === 'today' ? (
          /* ---- Today's View ------------------------------------------------ */
          <div className="space-y-3">
            {habits.map((habit) => {
              const done = isCompletedOn(habit.id, today);
              const streak = computeStreak(habitLogs(habit.id), habit.frequency);
              const pct = completionPct(habit);

              return (
                <div
                  key={habit.id}
                  className={`p-4 rounded-xl border transition-all ${
                    done
                      ? 'bg-slate-800/40 border-slate-700/50'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Toggle */}
                    <button
                      onClick={() => toggleHabit(habit, today)}
                      disabled={togglingKeys.has(`${habit.id}_${today.slice(0, 10)}`)}
                      className="flex-shrink-0 transition-transform hover:scale-110 disabled:opacity-50"
                    >
                      {done ? (
                        <CheckCircle2 className="w-7 h-7" style={{ color: habit.color ?? '#6366f1' }} />
                      ) : (
                        <Circle className="w-7 h-7 text-slate-600 hover:text-slate-400" />
                      )}
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{habit.icon ?? '🎯'}</span>
                        <p className={`text-sm font-medium ${done ? 'line-through text-slate-500' : ''}`}>
                          {habit.name}
                        </p>
                      </div>
                      {habit.description && (
                        <p className="text-xs text-slate-500 mt-0.5 ml-8">{habit.description}</p>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {streak > 0 && (
                        <div className="flex items-center gap-1 text-xs text-orange-400">
                          <Flame className="w-3.5 h-3.5" />
                          {streak}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <BarChart3 className="w-3.5 h-3.5" />
                        {pct}%
                      </div>
                      <button
                        onClick={() => deleteHabit(habit.id)}
                        className="p-1.5 rounded hover:bg-red-600/30 text-slate-600 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Completion bar */}
                  <div className="mt-2 ml-10 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: habit.color ?? '#6366f1' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ---- Weekly View ------------------------------------------------- */
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto">
            <div className="min-w-[540px]">
              {/* Week header */}
              <div className="grid grid-cols-[1fr_repeat(7,48px)_80px] gap-1 p-3 border-b border-slate-800 text-center">
              <div className="text-left text-xs text-slate-500 font-medium pl-2">Habit</div>
              {weekDays.map((d) => (
                <div key={d.date} className="text-[10px] text-slate-500">
                  <div>{d.label}</div>
                  <div className="text-slate-600">{new Date(d.date).getDate()}</div>
                </div>
              ))}
              <div className="text-xs text-slate-500">Streak</div>
            </div>

            {/* Habit rows */}
            {habits.map((habit) => {
              const streak = computeStreak(habitLogs(habit.id), habit.frequency);

              return (
                <div
                  key={habit.id}
                  className="grid grid-cols-[1fr_repeat(7,48px)_80px] gap-1 p-3 border-b border-slate-800/50 items-center hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">{habit.icon ?? '🎯'}</span>
                    <span className="text-sm truncate">{habit.name}</span>
                  </div>
                  {weekDays.map((d) => {
                    const done = isCompletedOn(habit.id, d.date);
                    return (
                      <div key={d.date} className="flex justify-center">
                        <button
                          onClick={() => toggleHabit(habit, d.date)}
                          disabled={togglingKeys.has(`${habit.id}_${d.date.slice(0, 10)}`)}
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 disabled:opacity-50"
                          style={{
                            backgroundColor: done ? (habit.color ?? '#6366f1') : 'transparent',
                            border: done ? 'none' : '2px solid rgb(51 65 85)',
                          }}
                        >
                          {done && <span className="text-white text-xs">✓</span>}
                        </button>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-center gap-1 text-xs">
                    <Flame className={`w-3.5 h-3.5 ${streak > 0 ? 'text-orange-400' : 'text-slate-700'}`} />
                    <span className={streak > 0 ? 'text-orange-400' : 'text-slate-600'}>{streak}</span>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
