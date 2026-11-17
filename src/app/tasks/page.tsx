'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import type { Task, TaskPriority, TaskStatus } from '@/types';
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Filter,
  AlertCircle,
  Loader2,
  X,
  Calendar,
  ClipboardList,
  ArrowRight,
  Bell,
  BellRing,
  Clock,
  CheckCircle2,
  Check,
} from 'lucide-react';
import {
  requestNotificationPermission,
  sendLocalNotification,
  createInAppNotification,
} from '@/lib/notifications';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];
const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: 'bg-red-600 text-red-100',
  high: 'bg-orange-600 text-orange-100',
  medium: 'bg-yellow-600 text-yellow-100',
  low: 'bg-green-600 text-green-100',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'border-slate-600',
  in_progress: 'border-blue-600',
  done: 'border-emerald-600',
};

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === 'done') return false;
  return new Date(task.due_date) < new Date(new Date().toDateString());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TasksPage() {
  const supabase = createClient();

  // ---- state --------------------------------------------------------------
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPriority, setFormPriority] = useState<TaskPriority>('medium');
  const [formDue, setFormDue] = useState('');
  const [enableReminder, setEnableReminder] = useState(false);
  const [formReminderAt, setFormReminderAt] = useState('');
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [checkingPerm, setCheckingPerm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // filters
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('');
  const [filterStatus, setFilterStatus] = useState<TaskStatus | ''>('');
  const [showFilters, setShowFilters] = useState(false);

  // Check notification permission status
  const checkNotificationStatus = useCallback(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    checkNotificationStatus();
  }, [checkNotificationStatus]);

  // Request browser notification permission explicitly
  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    setCheckingPerm(true);
    try {
      await requestNotificationPermission();
      const status = Notification.permission;
      setNotifPermission(status);
      return status === 'granted';
    } finally {
      setCheckingPerm(false);
    }
  };

  // Toggle reminder and automatically verify notification permission
  const handleToggleReminder = async (checked: boolean) => {
    setEnableReminder(checked);
    if (checked) {
      if (!formReminderAt) {
        // Default to 1 hour from now
        const d = new Date(Date.now() + 60 * 60 * 1000);
        const offset = d.getTimezoneOffset() * 60000;
        setFormReminderAt(new Date(d.getTime() - offset).toISOString().slice(0, 16));
      }
      // Check if user has enabled notifications, and prompt if not granted
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission !== 'granted') {
          await requestPermission();
        }
      }
    }
  };

  // Quick preset buttons for reminders
  const setQuickReminder = async (type: '1h' | '3h' | 'tonight' | 'tomorrow' | 'due') => {
    const now = new Date();
    let target = new Date();

    if (type === '1h') {
      target = new Date(now.getTime() + 60 * 60 * 1000);
    } else if (type === '3h') {
      target = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    } else if (type === 'tonight') {
      target.setHours(20, 0, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      }
    } else if (type === 'tomorrow') {
      target.setDate(target.getDate() + 1);
      target.setHours(9, 0, 0, 0);
    } else if (type === 'due' && formDue) {
      target = new Date(formDue);
      target.setHours(12, 0, 0, 0);
    }

    const offset = target.getTimezoneOffset() * 60000;
    setFormReminderAt(new Date(target.getTime() - offset).toISOString().slice(0, 16));
    setEnableReminder(true);

    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted') {
        await requestPermission();
      }
    }
  };

  // ---- fetch --------------------------------------------------------------
  const fetchTasks = useCallback(async () => {
    try {
      setError(null);
      const { data, error: err } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setTasks((data as Task[]) ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Automated Task Reminder Dispatcher (Runs every 15s)
  useEffect(() => {
    if (tasks.length === 0) return;

    async function checkTaskReminders() {
      const now = Date.now();
      for (const t of tasks) {
        if (t.status === 'done' || !t.reminder_at || t.reminder_sent) continue;
        const remTime = new Date(t.reminder_at).getTime();

        if (now >= remTime) {
          // 1. Native browser push notification
          try {
            await sendLocalNotification(
              `⏰ Task Reminder: ${t.title}`,
              `Time to finish your task: "${t.title}"! Priority: ${t.priority.toUpperCase()}`
            );
          } catch (err) {
            console.warn('Local push failed:', err);
          }

          // 2. In-app notification & webpush
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            try {
              await createInAppNotification(
                user.id,
                `⏰ Task Reminder: ${t.title}`,
                `Time to finish your task: "${t.title}". Scheduled finish reminder reached.`,
                'reminder',
                '/tasks'
              );

              fetch('/api/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: user.id,
                  title: `⏰ Task Reminder: ${t.title}`,
                  message: `Time to finish: "${t.title}".`,
                  actionUrl: '/tasks',
                }),
              }).catch(() => {});
            } catch {}
          }

          // 3. Mark reminder_sent in Supabase
          try {
            await supabase
              .from('tasks')
              .update({ reminder_sent: true, updated_at: new Date().toISOString() })
              .eq('id', t.id);

            setTasks((prev) =>
              prev.map((item) => (item.id === t.id ? { ...item, reminder_sent: true } : item))
            );
          } catch (e) {
            console.warn('Failed to mark reminder_sent:', e);
          }
        }
      }
    }

    checkTaskReminders();
    const interval = setInterval(checkTaskReminders, 15000);
    return () => clearInterval(interval);
  }, [tasks, supabase]);

  // ---- create task --------------------------------------------------------
  const createTask = async () => {
    if (!formTitle.trim()) return;
    setSubmitting(true);
    try {
      setError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('Please sign in to create tasks.');
        return;
      }

      // If user enabled a reminder, check and prompt for notification permission
      let reminderDateISO: string | null = null;
      if (enableReminder && formReminderAt) {
        reminderDateISO = new Date(formReminderAt).toISOString();
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission !== 'granted') {
            await requestPermission();
          }
        }
      }

      // Ensure profile row exists to satisfy foreign key constraints
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
        .from('tasks')
        .insert({
          user_id: user.id,
          title: formTitle.trim(),
          description: formDesc.trim() || null,
          priority: formPriority,
          status: 'todo' as TaskStatus,
          due_date: formDue || null,
          reminder_at: reminderDateISO,
          reminder_sent: false,
        })
        .select()
        .single();

      if (err) throw err;
      const task = data as Task;
      setTasks((prev) => [task, ...prev]);

      // create notification
      try {
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: 'New Task Created',
          message: reminderDateISO
            ? `Task "${task.title}" added with a reminder set for ${new Date(reminderDateISO).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}.`
            : `Task "${task.title}" has been added to your To Do list.`,
          type: 'task',
          is_read: false,
          action_url: '/tasks',
        });
      } catch {}

      // reset form
      setFormTitle('');
      setFormDesc('');
      setFormPriority('medium');
      setFormDue('');
      setEnableReminder(false);
      setFormReminderAt('');
      setShowForm(false);
    } catch (e: any) {
      console.error('createTask error:', e);
      const msg = e?.message || e?.error_description || (e instanceof Error ? e.message : 'Failed to create task');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- move task ----------------------------------------------------------
  const moveTask = async (task: Task, direction: 'forward' | 'back') => {
    const order: TaskStatus[] = ['todo', 'in_progress', 'done'];
    const idx = order.indexOf(task.status);
    const next = direction === 'forward' ? order[idx + 1] : order[idx - 1];
    if (!next) return;

    try {
      setError(null);
      const { error: err } = await supabase
        .from('tasks')
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq('id', task.id);
      if (err) throw err;
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to move task');
    }
  };

  // ---- delete task --------------------------------------------------------
  const deleteTask = async (id: string) => {
    try {
      setError(null);
      const { error: err } = await supabase.from('tasks').delete().eq('id', id);
      if (err) throw err;
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete task');
    }
  };

  const deleteCompleted = async () => {
    const completed = tasks.filter((t) => t.status === 'done');
    if (completed.length === 0) return;
    try {
      setError(null);
      const { error: err } = await supabase
        .from('tasks')
        .delete()
        .in('id', completed.map((t) => t.id));
      if (err) throw err;
      setTasks((prev) => prev.filter((t) => t.status !== 'done'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete completed tasks');
    }
  };

  // ---- filtering ----------------------------------------------------------
  const filtered = tasks.filter((t) => {
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    return true;
  });

  const columns: Record<TaskStatus, Task[]> = {
    todo: filtered.filter((t) => t.status === 'todo'),
    in_progress: filtered.filter((t) => t.status === 'in_progress'),
    done: filtered.filter((t) => t.status === 'done'),
  };

  // ---- render -------------------------------------------------------------
  return (
    <div className="text-slate-100">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
            Tasks
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm flex items-center gap-1.5 transition-colors ${
                showFilters || filterPriority || filterStatus
                  ? 'bg-blue-600 hover:bg-blue-500'
                  : 'bg-slate-800 hover:bg-slate-700'
              }`}
            >
              <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Filters
            </button>
            {columns.done.length > 0 && (
              <button
                onClick={deleteCompleted}
                className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm bg-slate-800 hover:bg-red-600/80 transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Clear Done
              </button>
            )}
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm bg-blue-600 hover:bg-blue-500 transition-colors flex items-center gap-1.5 font-medium shadow-sm active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Add Task
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

        {/* Filters */}
        {showFilters && (
          <div className="mb-4 p-4 rounded-lg bg-slate-900 border border-slate-800 flex flex-wrap gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value as TaskPriority | '')}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as TaskStatus | '')}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            {(filterPriority || filterStatus) && (
              <button
                onClick={() => { setFilterPriority(''); setFilterStatus(''); }}
                className="self-end text-xs text-slate-400 hover:text-white underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Add Task Form */}
        {showForm && (
          <div className="mb-6 p-4 sm:p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-400" />
              <span>New Task</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Task title *"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500 text-slate-100"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500 text-slate-100"
              />
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Priority</label>
                <select
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value as TaskPriority)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-slate-200"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Due Date (Optional)</label>
                <input
                  type="date"
                  value={formDue}
                  onChange={(e) => setFormDue(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-slate-200"
                />
              </div>
            </div>

            {/* Task Finish Reminder Section */}
            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enableReminder}
                    onChange={(e) => handleToggleReminder(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-medium text-slate-200">
                      Remind me to finish this task with a notification
                    </span>
                  </div>
                </label>

                {/* Live Permission Status Badge */}
                {enableReminder && (
                  <div className="text-[11px] font-medium">
                    {notifPermission === 'granted' ? (
                      <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" /> Notifications Enabled
                      </span>
                    ) : notifPermission === 'denied' ? (
                      <span className="flex items-center gap-1 text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                        <AlertCircle className="w-3 h-3" /> Notifications Blocked
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={requestPermission}
                        disabled={checkingPerm}
                        className="flex items-center gap-1 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30 transition text-[11px]"
                      >
                        <BellRing className="w-3 h-3" />
                        {checkingPerm ? 'Enabling...' : 'Enable in Browser'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Reminder Details & Time Pickers */}
              {enableReminder && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-3 animate-fade-in">
                  {notifPermission === 'denied' && (
                    <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block">Browser notifications are blocked</span>
                        <span>
                          Please allow notifications in your browser address bar settings so we can notify you at your scheduled finish time.
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs text-slate-300 font-medium">
                      Select specific finish reminder date & time:
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setQuickReminder('1h')}
                        className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                      >
                        In 1h
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickReminder('3h')}
                        className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                      >
                        In 3h
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickReminder('tonight')}
                        className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                      >
                        Tonight (8 PM)
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickReminder('tomorrow')}
                        className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                      >
                        Tomorrow (9 AM)
                      </button>
                      {formDue && (
                        <button
                          type="button"
                          onClick={() => setQuickReminder('due')}
                          className="px-2 py-1 rounded-md bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 border border-blue-500/40 transition"
                        >
                          At Due Date
                        </button>
                      )}
                    </div>
                  </div>

                  <input
                    type="datetime-local"
                    value={formReminderAt}
                    onChange={(e) => {
                      setFormReminderAt(e.target.value);
                      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
                        requestPermission();
                      }
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createTask}
                disabled={!formTitle.trim() || submitting}
                className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 font-medium shadow-md shadow-blue-500/20"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Task
              </button>
            </div>
          </div>
        )}

        {/* Kanban */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STATUSES.map((status) => (
              <div key={status} className={`rounded-xl bg-slate-900 border-t-2 ${STATUS_COLORS[status]}`}>
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h2 className="font-semibold text-sm">{STATUS_LABELS[status]}</h2>
                  <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">
                    {columns[status].length}
                  </span>
                </div>
                <div className="p-3 space-y-2 min-h-[200px]">
                  {columns[status].length === 0 ? (
                    <p className="text-xs text-slate-600 text-center py-8">No tasks</p>
                  ) : (
                    columns[status].map((task) => (
                      <div
                        key={task.id}
                        className={`p-3 rounded-lg bg-slate-800/60 border transition-colors ${
                          isOverdue(task) ? 'border-red-700 bg-red-900/10' : 'border-slate-700/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{task.title}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${PRIORITY_COLORS[task.priority]}`}>
                            {task.priority}
                          </span>
                        </div>
                        {task.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>
                        )}
                        {task.due_date && (
                          <p className={`text-xs mt-1.5 flex items-center gap-1 ${isOverdue(task) ? 'text-red-400' : 'text-slate-500'}`}>
                            <Calendar className="w-3 h-3" />
                            {new Date(task.due_date).toLocaleDateString()}
                            {isOverdue(task) && ' (overdue)'}
                          </p>
                        )}
                        {task.reminder_at && (
                          <p className="text-xs mt-1.5 flex items-center gap-1.5 text-amber-400/95 font-medium">
                            <Bell className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>
                              Remind: {new Date(task.reminder_at).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                            {task.reminder_sent && (
                              <span className="text-[9px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700">
                                Sent
                              </span>
                            )}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
                          <div className="flex items-center gap-1.5">
                            {status !== 'todo' && (
                              <button
                                onClick={() => moveTask(task, 'back')}
                                className="p-2 sm:p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                                title={`Move to ${STATUS_LABELS[STATUSES[STATUSES.indexOf(status) - 1]]}`}
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                            )}
                            {status !== 'done' && (
                              <button
                                onClick={() => moveTask(task, 'forward')}
                                className="p-2 sm:p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center gap-0.5 text-xs"
                                title={`Move to ${STATUS_LABELS[STATUSES[STATUSES.indexOf(status) + 1]]}`}
                              >
                                <ArrowRight className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="p-2 sm:p-1 rounded-lg hover:bg-red-600/30 text-slate-500 hover:text-red-400 transition-colors"
                            title="Delete task"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
