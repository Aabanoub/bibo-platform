'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import type { Task, TaskPriority, TaskStatus } from '@/types';
import {
  Plus,
  Trash2,
  Calendar,
  Clock,
  Bell,
  BellRing,
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  X,
  Search,
  Filter,
  Sparkles,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Edit3,
  CheckSquare,
  Zap,
  RotateCcw,
  Flag,
  Check,
} from 'lucide-react';
import {
  requestNotificationPermission,
  sendLocalNotification,
  createInAppNotification,
  scheduleBackgroundNotification,
} from '@/lib/notifications';

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

type SortOption = 'smart' | 'due_date' | 'priority' | 'newest';
type TabOption = 'all' | 'today' | 'upcoming' | 'done';

const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; bg: string; text: string; border: string; badge: string }
> = {
  urgent: {
    label: 'Urgent',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/30',
    badge: 'bg-red-500/20 text-red-300 border border-red-500/30',
  },
  high: {
    label: 'High',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  },
  medium: {
    label: 'Medium',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  },
  low: {
    label: 'Low',
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    badge: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',
  },
};

// ---------------------------------------------------------------------------
// Smart Priority Scoring Algorithm
// ---------------------------------------------------------------------------

/**
 * Calculates a numerical priority score for a task.
 * Higher score = higher ranking (displayed first).
 *
 * Factors:
 * 1. Base Priority: Urgent (+1200), High (+700), Medium (+300), Low (+100)
 * 2. Status: In-Progress bonus (+250)
 * 3. Deadline Urgency:
 *    - Overdue: +5000 + (daysOverdue * 150)
 *    - Due Today: +3500
 *    - Due Tomorrow: +2000
 *    - Due in 2-3 days: +1000
 *    - Due within 7 days: +500
 * 4. Upcoming Reminder Proximity:
 *    - Due within 2 hours or passed: +2200
 *    - Due today: +900
 */
function calculateTaskScore(task: Task): number {
  if (task.status === 'done') return -1;

  let score = 0;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // 1. Base Priority
  const priorityScores: Record<TaskPriority, number> = {
    urgent: 1200,
    high: 700,
    medium: 300,
    low: 100,
  };
  score += priorityScores[task.priority] || 300;

  // 2. In Progress bonus
  if (task.status === 'in_progress') {
    score += 250;
  }

  // 3. Deadline / Due Date
  if (task.due_date) {
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const [y, m, d] = task.due_date.split('-').map(Number);
    const dueMidnight = new Date(y, m - 1, d).getTime();
    const diffDays = Math.round((dueMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      // Overdue
      const overdueDays = Math.abs(diffDays);
      score += 5000 + Math.min(overdueDays * 150, 1500);
    } else if (diffDays === 0 || task.due_date === todayStr) {
      // Due Today
      score += 3500;
    } else if (diffDays === 1) {
      // Due Tomorrow
      score += 2000;
    } else if (diffDays <= 3) {
      // Due in 2-3 days
      score += 1000;
    } else if (diffDays <= 7) {
      // Due within a week
      score += 500;
    }
  }

  // 4. Upcoming Reminder Proximity
  if (task.reminder_at && !task.reminder_sent) {
    const reminderTime = new Date(task.reminder_at).getTime();
    const timeUntilReminderMs = reminderTime - now.getTime();

    if (timeUntilReminderMs <= 0) {
      score += 2400; // Reminder fired or pending
    } else if (timeUntilReminderMs <= 2 * 60 * 60 * 1000) {
      score += 1800; // Within 2 hours
    } else if (timeUntilReminderMs <= 24 * 60 * 60 * 1000) {
      score += 900; // Reminder today
    }
  }

  return score;
}

function isTaskOverdue(task: Task): boolean {
  if (!task.due_date || task.status === 'done') return false;
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = task.due_date.split('-').map(Number);
  const dueMidnight = new Date(y, m - 1, d).getTime();
  return dueMidnight < todayMidnight;
}

function isTaskDueToday(task: Task): boolean {
  if (!task.due_date || task.status === 'done') return false;
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  return task.due_date === todayStr;
}

function getDaysOverdue(task: Task): number {
  if (!task.due_date) return 0;
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = task.due_date.split('-').map(Number);
  const dueMidnight = new Date(y, m - 1, d).getTime();
  return Math.max(1, Math.round((todayMidnight - dueMidnight) / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function TasksPage() {
  const supabase = createClient();

  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View & Filter states
  const [activeTab, setActiveTab] = useState<TabOption>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('smart');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('');
  const [showCompletedSection, setShowCompletedSection] = useState(false);

  // Quick-Add state (Easy UI)
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>('medium');
  const [quickDueDate, setQuickDueDate] = useState('');
  const [quickReminderAt, setQuickReminderAt] = useState('');
  const [showQuickOptions, setShowQuickOptions] = useState(false);
  const [quickDescription, setQuickDescription] = useState('');
  const [submittingQuick, setSubmittingQuick] = useState(false);

  // Edit Modal state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('medium');
  const [editDueDate, setEditDueDate] = useState('');
  const [editReminderAt, setEditReminderAt] = useState('');
  const [editStatus, setEditStatus] = useState<TaskStatus>('todo');
  const [savingEdit, setSavingEdit] = useState(false);

  // Notification permission tracking
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [requestingPerm, setRequestingPerm] = useState(false);

  const quickInputRef = useRef<HTMLInputElement>(null);

  // Check notification permission
  const checkNotificationStatus = useCallback(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    checkNotificationStatus();
  }, [checkNotificationStatus]);

  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    setRequestingPerm(true);
    try {
      await requestNotificationPermission();
      const status = Notification.permission;
      setNotifPermission(status);
      return status === 'granted';
    } finally {
      setRequestingPerm(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setTasks([]);
        setLoading(false);
        return;
      }

      const lastResetAt =
        user.user_metadata?.last_data_reset_at ||
        (typeof window !== 'undefined' ? localStorage.getItem('bibo_last_reset_at') : null);

      let query = supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id);

      if (lastResetAt) {
        query = query.gt('created_at', lastResetAt);
      }

      const { data, error: err } = await query
        .order('created_at', { ascending: false });

      if (err) throw err;
      setTasks((data as Task[]) || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch tasks';
      console.error('fetchTasks error:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // ---------------------------------------------------------------------------
  // Automated 15s Task Reminder Dispatcher
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (tasks.length === 0) return;

    async function checkTaskReminders() {
      const now = Date.now();
      for (const t of tasks) {
        if (t.status === 'done' || !t.reminder_at || t.reminder_sent) continue;
        const remTime = new Date(t.reminder_at).getTime();

        if (now >= remTime) {
          // 1. Native desktop browser push
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
              const eventId = `task_reminder_${t.id}_${t.reminder_at}`;
              await createInAppNotification(
                user.id,
                `⏰ Task Reminder: ${t.title}`,
                `Time to finish your task: "${t.title}". Scheduled finish reminder reached.`,
                'reminder',
                '/tasks',
                eventId
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
              }).catch(() => { });
            } catch { }
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
          } catch (err) {
            console.error('Failed to update reminder_sent:', err);
          }
        }
      }
    }

    const interval = setInterval(checkTaskReminders, 15000);
    checkTaskReminders();
    return () => clearInterval(interval);
  }, [tasks, supabase]);

  // ---------------------------------------------------------------------------
  // Task Actions (Quick, Easy, Optimistic)
  // ---------------------------------------------------------------------------

  /**
   * 1-Tap Complete Checkbox toggle:
   * Instant toggle between 'done' and 'todo'
   */
  const toggleTaskDone = async (task: Task) => {
    const nextStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done';

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, status: nextStatus, updated_at: new Date().toISOString() } : t
      )
    );

    try {
      const { error: err } = await supabase
        .from('tasks')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', task.id);

      if (err) throw err;

      if (nextStatus === 'done') {
        try {
          await supabase
            .from('scheduled_notifications')
            .update({ status: 'delivered', updated_at: new Date().toISOString() })
            .eq('status', 'pending')
            .like('idempotency_key', `task_reminder_${task.id}_%`);
        } catch {}
      }
    } catch (e: unknown) {
      console.error('toggleTaskDone error:', e);
      // Rollback on error
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
      );
      setError(e instanceof Error ? e.message : 'Failed to update task');
    }
  };

  /**
   * Toggle in_progress state
   */
  const toggleInProgress = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus: TaskStatus = task.status === 'in_progress' ? 'todo' : 'in_progress';

    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, status: nextStatus, updated_at: new Date().toISOString() } : t
      )
    );

    try {
      const { error: err } = await supabase
        .from('tasks')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', task.id);
      if (err) throw err;
    } catch (e: unknown) {
      console.error('toggleInProgress error:', e);
      fetchTasks();
    }
  };

  /**
   * Quick Add Task
   */
  const handleQuickAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const title = quickTitle.trim();
    if (!title || submittingQuick) return;

    setSubmittingQuick(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('You must be logged in to create tasks.');

      const reminderDateISO = quickReminderAt ? new Date(quickReminderAt).toISOString() : null;

      const { data, error: err } = await supabase
        .from('tasks')
        .insert({
          user_id: user.id,
          title,
          description: quickDescription.trim() || null,
          priority: quickPriority,
          status: 'todo' as TaskStatus,
          due_date: quickDueDate || null,
          reminder_at: reminderDateISO,
          reminder_sent: false,
        })
        .select()
        .single();

      if (err) throw err;

      const newTask = data as Task;
      setTasks((prev) => [newTask, ...prev]);

      // If scheduled reminder is in the future, queue background notification
      if (reminderDateISO && new Date(reminderDateISO).getTime() > Date.now()) {
        scheduleBackgroundNotification({
          userId: user.id,
          idempotencyKey: `task_reminder_${newTask.id}_${reminderDateISO}`,
          title: `⏰ Task Reminder: ${newTask.title}`,
          message: `Time to finish your task: "${newTask.title}"! Priority: ${newTask.priority.toUpperCase()}`,
          category: 'task',
          actionUrl: '/tasks',
          scheduledFor: new Date(reminderDateISO),
        }).catch(() => { });
      }

      // Reset Quick Add fields
      setQuickTitle('');
      setQuickDescription('');
      setQuickDueDate('');
      setQuickReminderAt('');
      setQuickPriority('medium');
      setShowQuickOptions(false);

      // In-app notification
      try {
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: 'Task Created',
          message: reminderDateISO
            ? `Task "${newTask.title}" added with reminder.`
            : `Task "${newTask.title}" added to your list.`,
          type: 'task',
          is_read: false,
          action_url: '/tasks',
        });
      } catch { }

      // Keep focus on input for rapid entry
      quickInputRef.current?.focus();
    } catch (err: unknown) {
      console.error('Create task error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSubmittingQuick(false);
    }
  };

  /**
   * Delete Task
   */
  const deleteTask = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      const { error: err } = await supabase.from('tasks').delete().eq('id', id);
      if (err) throw err;
      try {
        await supabase
          .from('scheduled_notifications')
          .delete()
          .like('idempotency_key', `task_reminder_${id}_%`);
      } catch {}
    } catch (e: unknown) {
      fetchTasks();
      setError(e instanceof Error ? e.message : 'Failed to delete task');
    }
  };

  /**
   * Delete all completed tasks
   */
  const clearCompletedTasks = async () => {
    const doneIds = tasks.filter((t) => t.status === 'done').map((t) => t.id);
    if (doneIds.length === 0) return;

    if (!confirm(`Are you sure you want to clear ${doneIds.length} completed task(s)?`)) return;

    try {
      setTasks((prev) => prev.filter((t) => t.status !== 'done'));
      const { error: err } = await supabase.from('tasks').delete().in('id', doneIds);
      if (err) throw err;
    } catch (e: unknown) {
      fetchTasks();
      setError(e instanceof Error ? e.message : 'Failed to clear completed tasks');
    }
  };

  /**
   * Open Edit Modal
   */
  const openEditModal = (task: Task, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditPriority(task.priority);
    setEditDueDate(task.due_date || '');
    setEditStatus(task.status);

    if (task.reminder_at) {
      const d = new Date(task.reminder_at);
      const offset = d.getTimezoneOffset() * 60000;
      setEditReminderAt(new Date(d.getTime() - offset).toISOString().slice(0, 16));
    } else {
      setEditReminderAt('');
    }
  };

  /**
   * Save Edited Task
   */
  const saveEditedTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTitle.trim() || savingEdit) return;

    setSavingEdit(true);
    try {
      const reminderDateISO = editReminderAt ? new Date(editReminderAt).toISOString() : null;

      const { error: err } = await supabase
        .from('tasks')
        .update({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          priority: editPriority,
          status: editStatus,
          due_date: editDueDate || null,
          reminder_at: reminderDateISO,
          reminder_sent:
            reminderDateISO !== editingTask.reminder_at ? false : editingTask.reminder_sent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingTask.id);

      if (err) throw err;

      if (reminderDateISO && new Date(reminderDateISO).getTime() > Date.now()) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          scheduleBackgroundNotification({
            userId: user.id,
            idempotencyKey: `task_reminder_${editingTask.id}_${reminderDateISO}`,
            title: `⏰ Task Reminder: ${editTitle.trim()}`,
            message: `Time to finish your task: "${editTitle.trim()}"! Priority: ${editPriority.toUpperCase()}`,
            category: 'task',
            actionUrl: '/tasks',
            scheduledFor: new Date(reminderDateISO),
          }).catch(() => { });
        }
      }

      setTasks((prev) =>
        prev.map((t) =>
          t.id === editingTask.id
            ? {
              ...t,
              title: editTitle.trim(),
              description: editDescription.trim() || null,
              priority: editPriority,
              status: editStatus,
              due_date: editDueDate || null,
              reminder_at: reminderDateISO,
              reminder_sent:
                reminderDateISO !== editingTask.reminder_at ? false : editingTask.reminder_sent,
              updated_at: new Date().toISOString(),
            }
            : t
        )
      );

      setEditingTask(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update task');
    } finally {
      setSavingEdit(false);
    }
  };

  // Quick preset helper for dates
  const setQuickDatePreset = (preset: 'today' | 'tomorrow' | 'clear') => {
    const now = new Date();
    if (preset === 'today') {
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate()
      ).padStart(2, '0')}`;
      setQuickDueDate(todayStr);
    } else if (preset === 'tomorrow') {
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(tomorrow.getDate()).padStart(2, '0')}`;
      setQuickDueDate(tomorrowStr);
    } else {
      setQuickDueDate('');
    }
  };

  // Quick preset helper for reminders
  const setQuickReminderPreset = async (preset: '1h' | 'tonight' | 'tomorrow_9am') => {
    const now = new Date();
    let target = new Date();

    if (preset === '1h') {
      target = new Date(now.getTime() + 60 * 60 * 1000);
    } else if (preset === 'tonight') {
      target.setHours(20, 0, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      }
    } else if (preset === 'tomorrow_9am') {
      target.setDate(target.getDate() + 1);
      target.setHours(9, 0, 0, 0);
    }

    const offset = target.getTimezoneOffset() * 60000;
    setQuickReminderAt(new Date(target.getTime() - offset).toISOString().slice(0, 16));

    if (notifPermission !== 'granted') {
      await requestPermission();
    }
  };

  // ---------------------------------------------------------------------------
  // Filtered & Smart Sorted Tasks
  // ---------------------------------------------------------------------------

  const taskStats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const active = total - done;
    const overdue = tasks.filter(isTaskOverdue).length;
    const today = tasks.filter((t) => isTaskDueToday(t) || isTaskOverdue(t)).length;
    const upcoming = tasks.filter(
      (t) => t.status !== 'done' && t.due_date && !isTaskOverdue(t) && !isTaskDueToday(t)
    ).length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;

    return { total, done, active, overdue, today, upcoming, percent };
  }, [tasks]);

  const displayedTasks = useMemo(() => {
    // 1. Text Search & Priority Filter
    let list = tasks.filter((t) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchDesc = t.description?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc) return false;
      }
      if (filterPriority && t.priority !== filterPriority) return false;
      return true;
    });

    // 2. Tab Filter
    if (activeTab === 'today') {
      list = list.filter((t) => t.status !== 'done' && (isTaskDueToday(t) || isTaskOverdue(t)));
    } else if (activeTab === 'upcoming') {
      list = list.filter(
        (t) => t.status !== 'done' && t.due_date && !isTaskOverdue(t) && !isTaskDueToday(t)
      );
    } else if (activeTab === 'done') {
      list = list.filter((t) => t.status === 'done');
    }

    // 3. Sorting Algorithm
    return list.sort((a, b) => {
      // Keep done tasks at the very bottom unless in 'done' tab
      if (activeTab !== 'done') {
        if (a.status === 'done' && b.status !== 'done') return 1;
        if (a.status !== 'done' && b.status === 'done') return -1;
      }

      if (sortBy === 'smart') {
        // Smart Priority Scoring: highest score first!
        const scoreA = calculateTaskScore(a);
        const scoreB = calculateTaskScore(b);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      if (sortBy === 'due_date') {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }

      if (sortBy === 'priority') {
        const weight: Record<TaskPriority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
        return weight[b.priority] - weight[a.priority];
      }

      // newest
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [tasks, activeTab, searchQuery, filterPriority, sortBy]);

  // Separate active vs completed for clean sectioning in 'all' view
  const activeDisplayed = useMemo(
    () => displayedTasks.filter((t) => t.status !== 'done'),
    [displayedTasks]
  );
  const doneDisplayed = useMemo(
    () => displayedTasks.filter((t) => t.status === 'done'),
    [displayedTasks]
  );

  const overdueList = useMemo(() => activeDisplayed.filter(isTaskOverdue), [activeDisplayed]);
  const nonOverdueList = useMemo(() => activeDisplayed.filter((t) => !isTaskOverdue(t)), [
    activeDisplayed,
  ]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="text-slate-100 max-w-4xl mx-auto pb-24 px-2 sm:px-4">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pt-2">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/15 border border-blue-500/20 text-blue-400">
              <CheckSquare className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Tasks
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-normal border border-slate-700/60">
                  {taskStats.active} open
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                {taskStats.total === 0
                  ? 'No tasks created yet'
                  : `${taskStats.done} of ${taskStats.total} completed (${taskStats.percent}%)`}
              </p>
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        {taskStats.total > 0 && (
          <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800/80 px-3.5 py-2 rounded-xl">
            <div className="w-24 sm:w-32 bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${taskStats.percent}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-slate-300 min-w-[34px]">
              {taskStats.percent}%
            </span>
          </div>
        )}
      </div>

      {/* ── BROWSER NOTIFICATIONS PERMISSION BANNER (IF BLOCKED) ── */}
      {notifPermission === 'denied' && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              Browser notifications are blocked. To receive push reminders when tasks are due, enable
              notifications in your browser settings.
            </span>
          </div>
          <button
            onClick={checkNotificationStatus}
            className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs shrink-0 font-medium transition-colors"
          >
            Re-check
          </button>
        </div>
      )}

      {/* ── ERROR ALERT ── */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-900/30 border border-red-800/80 text-red-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="p-1 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── EASY UI: INSTANT QUICK-ADD BAR ── */}
      <div className="mb-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-lg shadow-black/20 focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
        <form onSubmit={handleQuickAdd}>
          <div className="flex items-center gap-2.5">
            <div className="text-slate-500 pl-1">
              <Plus className="w-5 h-5 text-blue-400" />
            </div>
            <input
              ref={quickInputRef}
              type="text"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onFocus={() => setShowQuickOptions(true)}
              placeholder="What needs to be done? Type and press Enter..."
              className="w-full bg-transparent text-sm sm:text-base text-white placeholder-slate-500 outline-none"
            />
            <button
              type="submit"
              disabled={!quickTitle.trim() || submittingQuick}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/30 shrink-0"
            >
              {submittingQuick ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Add</span>
                </>
              )}
            </button>
          </div>

          {/* Quick-Options Bar (Pills & Controls) */}
          {showQuickOptions && (
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Priority Selector Pill */}
                <div className="relative inline-flex items-center">
                  <select
                    value={quickPriority}
                    onChange={(e) => setQuickPriority(e.target.value as TaskPriority)}
                    className={`text-[11px] font-medium py-1 px-2.5 rounded-lg border outline-none cursor-pointer appearance-none pr-5 ${PRIORITY_CONFIG[quickPriority].badge}`}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p} className="bg-slate-900 text-white">
                        {p.toUpperCase()} Priority
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-1.5 pointer-events-none opacity-60" />
                </div>

                {/* Due Date Presets */}
                <button
                  type="button"
                  onClick={() => setQuickDatePreset('today')}
                  className={`py-1 px-2.5 rounded-lg border text-[11px] transition-colors flex items-center gap-1 ${quickDueDate === new Date().toISOString().slice(0, 10)
                    ? 'bg-blue-600/30 border-blue-500 text-blue-300 font-semibold'
                    : 'bg-slate-800/80 border-slate-700/60 text-slate-300 hover:bg-slate-700'
                    }`}
                >
                  <Calendar className="w-3 h-3" /> Today
                </button>

                <button
                  type="button"
                  onClick={() => setQuickDatePreset('tomorrow')}
                  className="py-1 px-2.5 rounded-lg border border-slate-700/60 bg-slate-800/80 text-slate-300 hover:bg-slate-700 text-[11px] transition-colors"
                >
                  Tomorrow
                </button>

                {/* Date Picker input */}
                <input
                  type="date"
                  value={quickDueDate}
                  onChange={(e) => setQuickDueDate(e.target.value)}
                  className="bg-slate-800/80 border border-slate-700/60 text-slate-300 text-[11px] rounded-lg py-1 px-2 outline-none focus:border-blue-500"
                />

                {/* Reminder Preset Button */}
                <button
                  type="button"
                  onClick={() => setQuickReminderPreset('1h')}
                  className={`py-1 px-2.5 rounded-lg border text-[11px] transition-colors flex items-center gap-1 ${quickReminderAt
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-medium'
                    : 'bg-slate-800/80 border-slate-700/60 text-slate-300 hover:bg-slate-700'
                    }`}
                  title="Set reminder for 1 hour from now"
                >
                  <Bell className="w-3 h-3" />
                  {quickReminderAt ? 'Remind Set' : 'Remind 1h'}
                </button>
              </div>

              {/* Extra details toggle */}
              <button
                type="button"
                onClick={() => setShowQuickOptions(!showQuickOptions)}
                className="text-[11px] text-slate-500 hover:text-slate-400 py-1"
              >
                Hide
              </button>
            </div>
          )}
        </form>
      </div>

      {/* ── TOOLBAR: TABS, SEARCH & SMART SORT ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-4">
        {/* Segmented Filter Tabs */}
        <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-xl overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'all'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
          >
            All
            <span className="text-[10px] bg-black/20 px-1.5 py-0.2 rounded-full">
              {taskStats.active}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('today')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'today'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
          >
            Today
            {taskStats.today > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${taskStats.overdue > 0 ? 'bg-red-500 text-white' : 'bg-black/20'
                  }`}
              >
                {taskStats.today}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'upcoming'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
          >
            Upcoming
            <span className="text-[10px] bg-black/20 px-1.5 py-0.2 rounded-full">
              {taskStats.upcoming}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('done')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'done'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
          >
            Completed
            <span className="text-[10px] bg-black/20 px-1.5 py-0.2 rounded-full">
              {taskStats.done}
            </span>
          </button>
        </div>

        {/* Search & Smart Sorting Control */}
        <div className="flex items-center gap-2">
          {/* Quick Search Input */}
          <div className="relative flex-1 sm:w-48 md:w-56">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Smart Algorithm / Sorting Selector */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs rounded-xl px-2.5 py-1.5 outline-none focus:border-blue-500 cursor-pointer pr-7 appearance-none font-medium"
              title="Change task sorting algorithm"
            >
              <option value="smart">⚡ Smart Algorithm</option>
              <option value="due_date">📅 Due Date</option>
              <option value="priority">🚩 Priority (Urgent first)</option>
              <option value="newest">🕒 Newest first</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
          </div>

          {/* Clear Completed button */}
          {taskStats.done > 0 && activeTab === 'done' && (
            <button
              onClick={clearCompletedTasks}
              className="px-2.5 py-1.5 rounded-xl bg-red-950/40 border border-red-800/60 hover:bg-red-900/60 text-red-300 text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear Done
            </button>
          )}
        </div>
      </div>

      {/* ── TASKS LIST CONTAINER ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
          <p className="text-xs">Loading tasks...</p>
        </div>
      ) : displayedTasks.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 border border-slate-800/80 rounded-2xl">
          <CheckSquare className="w-10 h-10 mx-auto text-slate-600 mb-2 stroke-1" />
          <h3 className="text-sm font-semibold text-slate-300">No tasks found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            {searchQuery
              ? 'No tasks match your search filter.'
              : activeTab === 'today'
                ? 'No tasks due today. Great job keeping on top of your schedule!'
                : activeTab === 'upcoming'
                  ? 'No upcoming scheduled tasks.'
                  : activeTab === 'done'
                    ? 'No completed tasks yet. Finish a task to see it here!'
                    : 'Add your first task using the box above to get organized.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* SECTION 1: OVERDUE TASKS (HIGH URGENCY ALERT) */}
          {activeTab === 'all' && overdueList.length > 0 && (
            <div className="bg-red-950/20 border border-red-900/40 rounded-2xl p-3">
              <div className="flex items-center gap-2 mb-2 px-1 text-red-400 font-semibold text-xs tracking-wider uppercase">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Overdue ({overdueList.length})</span>
              </div>
              <div className="space-y-2">
                {overdueList.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggleDone={toggleTaskDone}
                    onToggleInProgress={toggleInProgress}
                    onEdit={openEditModal}
                    onDelete={deleteTask}
                  />
                ))}
              </div>
            </div>
          )}

          {/* SECTION 2: ACTIVE TASKS (SMART RANKED) */}
          {activeTab === 'all' ? (
            nonOverdueList.length > 0 && (
              <div className="space-y-2">
                {overdueList.length > 0 && (
                  <div className="flex items-center gap-2 px-1 text-slate-400 font-semibold text-xs tracking-wider uppercase pt-1">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <span>Up Next</span>
                  </div>
                )}
                {nonOverdueList.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggleDone={toggleTaskDone}
                    onToggleInProgress={toggleInProgress}
                    onEdit={openEditModal}
                    onDelete={deleteTask}
                  />
                ))}
              </div>
            )
          ) : (
            <div className="space-y-2">
              {displayedTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onToggleDone={toggleTaskDone}
                  onToggleInProgress={toggleInProgress}
                  onEdit={openEditModal}
                  onDelete={deleteTask}
                />
              ))}
            </div>
          )}

          {/* SECTION 3: COMPLETED TASKS (COLLAPSIBLE IN 'ALL' VIEW) */}
          {activeTab === 'all' && doneDisplayed.length > 0 && (
            <div className="pt-4 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setShowCompletedSection(!showCompletedSection)}
                className="flex items-center justify-between w-full p-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 transition-colors"
              >
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Completed ({doneDisplayed.length})</span>
                </div>
                {showCompletedSection ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </button>

              {showCompletedSection && (
                <div className="space-y-2 mt-2">
                  {doneDisplayed.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggleDone={toggleTaskDone}
                      onToggleInProgress={toggleInProgress}
                      onEdit={openEditModal}
                      onDelete={deleteTask}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── EDIT TASK MODAL ── */}
      {editingTask && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-semibold text-base text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-400" />
                Edit Task
              </h3>
              <button
                onClick={() => setEditingTask(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={saveEditedTask} className="space-y-4 mt-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Task Title *</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Notes, links, or context..."
                />
              </div>

              {/* Priority & Status Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Priority</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Completed</option>
                  </select>
                </div>
              </div>

              {/* Due Date & Reminder Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                    <span>Notification Reminder</span>
                    {editReminderAt && (
                      <button
                        type="button"
                        onClick={() => setEditReminderAt('')}
                        className="text-[10px] text-red-400 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </label>
                  <input
                    type="datetime-local"
                    value={editReminderAt}
                    onChange={(e) => {
                      setEditReminderAt(e.target.value);
                      if (e.target.value && notifPermission !== 'granted') {
                        requestPermission();
                      }
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="px-4 py-2 rounded-xl text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editTitle.trim() || savingEdit}
                  className="px-4 py-2 rounded-xl text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 transition-colors shadow-md shadow-blue-500/20"
                >
                  {savingEdit ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-Component: Task Row Item (1-Tap Checkbox & Minimalist Row)
// ---------------------------------------------------------------------------

interface TaskItemProps {
  task: Task;
  onToggleDone: (task: Task) => void;
  onToggleInProgress: (task: Task, e: React.MouseEvent) => void;
  onEdit: (task: Task, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

function TaskItem({ task, onToggleDone, onToggleInProgress, onEdit, onDelete }: TaskItemProps) {
  const overdue = isTaskOverdue(task);
  const dueToday = isTaskDueToday(task);
  const isDone = task.status === 'done';
  const isInProgress = task.status === 'in_progress';
  const daysOverdue = overdue ? getDaysOverdue(task) : 0;

  return (
    <div
      onClick={(e) => onEdit(task, e)}
      className={`group relative flex items-start sm:items-center justify-between gap-3 p-3 sm:py-3 sm:px-3.5 rounded-xl border transition-all cursor-pointer ${isDone
        ? 'bg-slate-900/40 border-slate-800/50 opacity-60 hover:opacity-90'
        : overdue
          ? 'bg-red-950/20 border-red-800/40 hover:border-red-700/60 shadow-sm shadow-red-950/20'
          : isInProgress
            ? 'bg-blue-950/15 border-blue-800/40 hover:border-blue-700/60'
            : 'bg-slate-900/80 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900 shadow-sm'
        }`}
    >
      {/* LEFT: 1-Tap Checkbox & Content */}
      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
        {/* 1-Tap Circular Complete Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone(task);
          }}
          className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center transition-all mt-0.5 sm:mt-0 ${isDone
            ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/30'
            : overdue
              ? 'border-red-500 hover:bg-red-500/20 text-transparent hover:text-red-300'
              : 'border-slate-600 hover:border-blue-400 hover:bg-blue-500/10 text-transparent hover:text-blue-400'
            }`}
          title={isDone ? 'Mark as incomplete' : 'Mark as done'}
        >
          <Check className="w-3.5 h-3.5 stroke-[3]" />
        </button>

        {/* Task Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm sm:text-base font-medium break-words transition-all ${isDone
                ? 'line-through text-slate-500'
                : overdue
                  ? 'text-red-200'
                  : 'text-slate-100 group-hover:text-white'
                }`}
            >
              {task.title}
            </span>

            {/* In Progress Badge */}
            {isInProgress && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium">
                In Progress
              </span>
            )}
          </div>

          {/* Description Snippet (if any) */}
          {task.description && (
            <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{task.description}</p>
          )}

          {/* Metadata Chips Row */}
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
            {/* Priority Chip */}
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${PRIORITY_CONFIG[task.priority].badge
                }`}
            >
              {PRIORITY_CONFIG[task.priority].label}
            </span>

            {/* Due Date Indicator */}
            {task.due_date && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ${overdue
                  ? 'bg-red-500/20 text-red-300 border border-red-500/30 font-semibold'
                  : dueToday
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium'
                    : 'bg-slate-800 text-slate-400'
                  }`}
              >
                <Calendar className="w-3 h-3 shrink-0" />
                {overdue
                  ? `Overdue (${daysOverdue}d ago)`
                  : dueToday
                    ? 'Due Today'
                    : new Date(task.due_date).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
              </span>
            )}

            {/* Reminder Badge */}
            {task.reminder_at && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-medium px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                <Bell className="w-3 h-3 shrink-0" />
                {new Date(task.reminder_at).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {task.reminder_sent && (
                  <span className="text-[9px] text-slate-400 bg-slate-800 px-1 py-0.2 rounded border border-slate-700 ml-0.5">
                    Sent
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: Quick Action Buttons */}
      <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
        {/* Toggle In Progress / Todo */}
        {!isDone && (
          <button
            type="button"
            onClick={(e) => onToggleInProgress(task, e)}
            className={`p-1.5 rounded-lg text-xs transition-colors ${isInProgress
              ? 'bg-blue-600/30 text-blue-300 hover:bg-blue-600/50'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            title={isInProgress ? 'Set back to To Do' : 'Mark as In Progress'}
          >
            <Zap className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Edit Button */}
        <button
          type="button"
          onClick={(e) => onEdit(task, e)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Edit task"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>

        {/* Delete Button */}
        <button
          type="button"
          onClick={(e) => onDelete(task.id, e)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Delete task"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
