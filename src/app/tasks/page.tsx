'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import type { Task, TaskPriority, TaskStatus, TaskFolder, TaskDifficulty, DailyScheduleItem } from '@/types';
import TaskFolderModal, { FOLDER_COLORS, FOLDER_ICONS } from '@/components/TaskFolderModal';
import DeleteFolderDialog from '@/components/DeleteFolderDialog';
import TaskFolderCard, { getFolderCountdown } from '@/components/TaskFolderCard';
import DailyPlannerView from '@/components/DailyPlannerView';
import WeeklyForecastView from '@/components/WeeklyForecastView';
import { toLocalDateStr } from '@/lib/weekly-forecast';
import type { SchedulingPreferences } from '@/lib/daily-planner';
import { extractLessonSequence } from '@/lib/lesson-sequencing';
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
  Filter,
  Sparkles,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Edit3,
  CheckSquare,
  Zap,
  RotateCcw,
  Flag,
  Check,
  Folder,
  FolderPlus,
  FolderOpen,
  BookOpen,
  GraduationCap,
  Layers,
  BarChart2,
  FileDown,
  Lock,
} from 'lucide-react';
import { useNavigation } from '@/context/NavigationContext';
import { generateDailySchedulePdf } from '@/lib/daily-schedule-pdf';
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

function getEffectiveDueDate(task: Task, folder?: TaskFolder): string | null {
  if (task.due_date) return task.due_date;
  if (folder?.due_date) return folder.due_date.slice(0, 10);
  return null;
}

/**
 * Calculates a numerical priority score for a task.
 * Higher score = higher ranking (displayed first).
 */
function calculateTaskScore(task: Task, folder?: TaskFolder): number {
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

  // 3. Deadline / Due Date (Use task due date or folder exam date)
  const effectiveDate = getEffectiveDueDate(task, folder);
  if (effectiveDate) {
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const [y, m, d] = effectiveDate.split('-').map(Number);
    const dueMidnight = new Date(y, m - 1, d).getTime();
    const diffDays = Math.round((dueMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      // Overdue
      const overdueDays = Math.abs(diffDays);
      score += 5000 + Math.min(overdueDays * 150, 1500);
    } else if (diffDays === 0 || effectiveDate === todayStr) {
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

function isTaskOverdue(task: Task, folder?: TaskFolder): boolean {
  if (task.status === 'done') return false;
  const effectiveDate = getEffectiveDueDate(task, folder);
  if (!effectiveDate) return false;
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = effectiveDate.split('-').map(Number);
  const dueMidnight = new Date(y, m - 1, d).getTime();
  return dueMidnight < todayMidnight;
}

function isTaskDueToday(task: Task, folder?: TaskFolder): boolean {
  if (task.status === 'done') return false;
  const effectiveDate = getEffectiveDueDate(task, folder);
  if (!effectiveDate) return false;
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  return effectiveDate === todayStr;
}

function getDaysOverdue(task: Task, folder?: TaskFolder): number {
  const effectiveDate = getEffectiveDueDate(task, folder);
  if (!effectiveDate) return 0;
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = effectiveDate.split('-').map(Number);
  const dueMidnight = new Date(y, m - 1, d).getTime();
  return Math.max(1, Math.round((todayMidnight - dueMidnight) / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function TasksPage() {
  const supabase = createClient();
  const { isStudyLockdownActive } = useNavigation();

  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [folders, setFolders] = useState<TaskFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showFoldersSection, setShowFoldersSection] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<TaskFolder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<TaskFolder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View & Filter states
  const [activeTab, setActiveTab] = useState<TabOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('smart');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('');
  const [showCompletedSection, setShowCompletedSection] = useState(false);

  // Main View Mode (Tasks & Folders vs AI Daily Planner vs Weekly Forecast)
  const [activeMainTab, setActiveMainTab] = useState<'tasks' | 'planner' | 'forecast'>('tasks');
  const [plannerDate, setPlannerDate] = useState<string>(() => toLocalDateStr(new Date()));
  const [scheduleItems, setScheduleItems] = useState<DailyScheduleItem[]>([]);
  const [allScheduleItems, setAllScheduleItems] = useState<DailyScheduleItem[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isNoScheduleAlertOpen, setIsNoScheduleAlertOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportSchedulePdf = async () => {
    const todayStr = toLocalDateStr(new Date());
    // Find today's schedule items
    const todayItems = allScheduleItems.filter((s) => s.date === todayStr);
    const resolvedItems =
      todayItems.length > 0
        ? todayItems
        : plannerDate === todayStr
        ? scheduleItems
        : [];

    if (resolvedItems.length === 0) {
      setIsNoScheduleAlertOpen(true);
      return;
    }

    const sortedItems = [...resolvedItems].sort((a, b) => {
      const partsA = (a.start_time || '00:00').split(':').map(Number);
      const partsB = (b.start_time || '00:00').split(':').map(Number);
      const minA = (partsA[0] || 0) * 60 + (partsA[1] || 0);
      const minB = (partsB[0] || 0) * 60 + (partsB[1] || 0);
      if (minA !== minB) return minA - minB;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    try {
      setIsExportingPdf(true);
      await generateDailySchedulePdf({
        userName: userProfile?.full_name || 'Evolve User',
        date: todayStr,
        sessions: sortedItems,
        tasks,
        folders,
        preferences: {
          startTime: userProfile?.daily_start_time || '08:00',
          endTime: userProfile?.daily_end_time || '21:00',
          highFocusStart: userProfile?.high_focus_start || '09:00',
          highFocusEnd: userProfile?.high_focus_end || '12:00',
          preferredBreakDuration: userProfile?.preferred_break_duration || 15,
        },
      });
    } catch (err) {
      console.error('Failed to export daily schedule PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // User's choice between AI Folders and Classic Task list (stored in localStorage & settings)
  const [tasksViewMode, setTasksViewMode] = useState<'ai_folders' | 'classic'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tasks_view_mode') as 'ai_folders' | 'classic' | null;
      if (saved) return saved;
    }
    return 'ai_folders';
  });

  useEffect(() => {
    const handleModeChange = (e: any) => {
      const mode = e?.detail || (typeof window !== 'undefined' ? (localStorage.getItem('tasks_view_mode') as 'ai_folders' | 'classic') : null);
      if (mode) {
        setTasksViewMode(mode);
        if (mode === 'classic') {
          setActiveMainTab('tasks');
        }
      }
    };
    window.addEventListener('tasks_view_mode_changed', handleModeChange);
    window.addEventListener('storage', handleModeChange);
    return () => {
      window.removeEventListener('tasks_view_mode_changed', handleModeChange);
      window.removeEventListener('storage', handleModeChange);
    };
  }, []);

  // When in classic mode, ensure active tab is always 'tasks' (no AI Planner or Weekly Forecast)
  useEffect(() => {
    if (tasksViewMode === 'classic' && activeMainTab !== 'tasks') {
      setActiveMainTab('tasks');
    }
  }, [tasksViewMode, activeMainTab]);

  // Quick-Add state (for Classic View Mode)
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>('medium');
  const [quickDifficulty, setQuickDifficulty] = useState<TaskDifficulty>('medium');
  const [quickEstimatedDuration, setQuickEstimatedDuration] = useState<number>(30);
  const [quickDueDate, setQuickDueDate] = useState('');
  const [quickReminderAt, setQuickReminderAt] = useState('');
  const [quickFolderId, setQuickFolderId] = useState<string>('');
  const [showQuickOptions, setShowQuickOptions] = useState(false);
  const [quickDescription, setQuickDescription] = useState('');
  const [submittingQuick, setSubmittingQuick] = useState(false);
  const quickInputRef = useRef<HTMLInputElement>(null);

  // Sync quickFolderId when selected folder changes in classic mode
  useEffect(() => {
    if (selectedFolderId && selectedFolderId !== 'unfiled') {
      setQuickFolderId(selectedFolderId);
    } else {
      setQuickFolderId('');
    }
  }, [selectedFolderId]);

  // Unified Task Modal state (Handles both Create & Edit with Image 2 UI)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalMode, setTaskModalMode] = useState<'create' | 'edit'>('create');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskModalFolderId, setTaskModalFolderId] = useState<string>('');
  const [taskModalTitle, setTaskModalTitle] = useState('');
  const [taskModalDescription, setTaskModalDescription] = useState('');
  const [taskModalPriority, setTaskModalPriority] = useState<TaskPriority>('medium');
  const [taskModalDifficulty, setTaskModalDifficulty] = useState<TaskDifficulty>('medium');
  const [taskModalEstimatedDuration, setTaskModalEstimatedDuration] = useState<number>(30);
  const [taskModalDueDate, setTaskModalDueDate] = useState('');
  const [taskModalReminderAt, setTaskModalReminderAt] = useState('');
  const [taskModalStatus, setTaskModalStatus] = useState<TaskStatus>('todo');
  const [savingTaskModal, setSavingTaskModal] = useState(false);
  // Folder expansion state (collapsed by default until expanded by the user)
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleExpandFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const handleExpandAll = () => {
    const allExp: Record<string, boolean> = {};
    folders.forEach((f) => {
      allExp[f.id] = true;
    });
    allExp['unfiled'] = true;
    setExpandedFolders(allExp);
  };

  const handleCollapseAll = () => {
    setExpandedFolders({});
  };

  // Notification permission tracking
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [requestingPerm, setRequestingPerm] = useState(false);


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
  // Data Fetching: Tasks & Folders
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
        setFolders([]);
        setLoading(false);
        return;
      }

      const [tasksRes, foldersRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('task_folders')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (foldersRes.error) throw foldersRes.error;

      setTasks((tasksRes.data as Task[]) || []);
      setFolders((foldersRes.data as TaskFolder[]) || []);
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
  // AI Daily Planner & Weekly Forecast Data Sync
  // ---------------------------------------------------------------------------

  const fetchScheduleAndProfile = useCallback(async (date: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [profRes, scheduleRes, allScheduleRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase
          .from('daily_schedule_items')
          .select('*')
          .eq('user_id', user.id)
          .eq('date', date)
          .order('sort_order', { ascending: true })
          .order('start_time', { ascending: true }),
        supabase
          .from('daily_schedule_items')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: true })
          .order('sort_order', { ascending: true })
          .order('start_time', { ascending: true }),
      ]);

      if (profRes.data) {
        setUserProfile(profRes.data);
      }
      if (scheduleRes.data) {
        setScheduleItems(scheduleRes.data as DailyScheduleItem[]);
      }
      if (allScheduleRes.data) {
        setAllScheduleItems(allScheduleRes.data as DailyScheduleItem[]);
      }
    } catch (e) {
      console.error('fetchScheduleAndProfile error:', e);
    }
  }, [supabase]);

  useEffect(() => {
    fetchScheduleAndProfile(plannerDate);
  }, [fetchScheduleAndProfile, plannerDate]);

  // ---------------------------------------------------------------------------
  // Supabase Realtime Subscriptions (100% Live Updates for Tasks & Schedules)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let tasksChannel: ReturnType<typeof supabase.channel> | null = null;
    let scheduleChannel: ReturnType<typeof supabase.channel> | null = null;
    let foldersChannel: ReturnType<typeof supabase.channel> | null = null;

    async function setupRealtime() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Live Tasks Channel
      tasksChannel = supabase
        .channel(`tasks-live-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tasks',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            if (payload.eventType === 'INSERT') {
              const newTask = payload.new as Task;
              setTasks((prev) => (prev.some((t) => t.id === newTask.id) ? prev : [newTask, ...prev]));
            } else if (payload.eventType === 'UPDATE') {
              const updated = payload.new as Task;
              setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
              const isCompleted = updated.status === 'done';
              setScheduleItems((prev) =>
                prev.map((s) => (s.task_id === updated.id ? { ...s, is_completed: isCompleted } : s))
              );
              setAllScheduleItems((prev) =>
                prev.map((s) => (s.task_id === updated.id ? { ...s, is_completed: isCompleted } : s))
              );
            } else if (payload.eventType === 'DELETE') {
              const deletedId = payload.old.id;
              setTasks((prev) => prev.filter((t) => t.id !== deletedId));
              setScheduleItems((prev) => prev.filter((s) => s.task_id !== deletedId));
              setAllScheduleItems((prev) => prev.filter((s) => s.task_id !== deletedId));
            }
          }
        )
        .subscribe();

      // 2. Live Daily Schedule Items Channel
      scheduleChannel = supabase
        .channel(`schedule-live-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'daily_schedule_items',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            if (payload.eventType === 'INSERT') {
              const newItem = payload.new as DailyScheduleItem;
              setAllScheduleItems((prev) =>
                prev.some((s) => s.id === newItem.id) ? prev : [...prev, newItem]
              );
              setScheduleItems((prev) => {
                if (newItem.date === plannerDate && !prev.some((s) => s.id === newItem.id)) {
                  return [...prev, newItem];
                }
                return prev;
              });
            } else if (payload.eventType === 'UPDATE') {
              const updated = payload.new as DailyScheduleItem;
              setAllScheduleItems((prev) =>
                prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
              );
              setScheduleItems((prev) =>
                prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
              );
              if (updated.task_id) {
                setTasks((prev) =>
                  prev.map((t) =>
                    t.id === updated.task_id
                      ? { ...t, status: updated.is_completed ? 'done' : 'todo' }
                      : t
                  )
                );
              }
            } else if (payload.eventType === 'DELETE') {
              const deletedId = payload.old.id;
              setAllScheduleItems((prev) => prev.filter((s) => s.id !== deletedId));
              setScheduleItems((prev) => prev.filter((s) => s.id !== deletedId));
            }
          }
        )
        .subscribe();

      // 3. Live Task Folders Channel
      foldersChannel = supabase
        .channel(`folders-live-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'task_folders',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            if (payload.eventType === 'INSERT') {
              const newFolder = payload.new as TaskFolder;
              setFolders((prev) => (prev.some((f) => f.id === newFolder.id) ? prev : [newFolder, ...prev]));
            } else if (payload.eventType === 'UPDATE') {
              const updated = payload.new as TaskFolder;
              setFolders((prev) => prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)));
            } else if (payload.eventType === 'DELETE') {
              const deletedId = payload.old.id;
              setFolders((prev) => prev.filter((f) => f.id !== deletedId));
            }
          }
        )
        .subscribe();
    }

    setupRealtime();

    return () => {
      if (tasksChannel) supabase.removeChannel(tasksChannel);
      if (scheduleChannel) supabase.removeChannel(scheduleChannel);
      if (foldersChannel) supabase.removeChannel(foldersChannel);
    };
  }, [supabase, plannerDate]);

  // ---------------------------------------------------------------------------
  // Live Daily Date Rollover & Visibility Sync
  // Automatically updates planner date and recalculates tasks when a new day arrives
  // ---------------------------------------------------------------------------
  const todayRef = useRef<string>(toLocalDateStr(new Date()));

  useEffect(() => {
    function checkDateRollover() {
      const todayNow = toLocalDateStr(new Date());
      if (todayNow !== todayRef.current) {
        todayRef.current = todayNow;
        setPlannerDate(todayNow);
        fetchTasks();
        fetchScheduleAndProfile(todayNow);
      }
    }

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        checkDateRollover();
        fetchTasks();
        fetchScheduleAndProfile(plannerDate);
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
  }, [fetchTasks, fetchScheduleAndProfile, plannerDate]);

  const handleSaveSchedule = async (newItems: DailyScheduleItem[]) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const itemsForToday = newItems.filter((i) => !i.date || i.date === plannerDate);
      const itemsForOtherDates = newItems.filter((i) => i.date && i.date !== plannerDate);

      // 1. Wipe and re-save items for today's selected date
      await supabase
        .from('daily_schedule_items')
        .delete()
        .eq('user_id', user.id)
        .eq('date', plannerDate);

      if (itemsForToday.length > 0) {
        const payload = itemsForToday.map((item, idx) => ({
          user_id: user.id,
          date: plannerDate,
          task_id: item.task_id || null,
          session_type: item.session_type,
          start_time: item.start_time,
          end_time: item.end_time,
          duration_minutes: item.duration_minutes,
          title: item.title,
          difficulty: item.difficulty || 'medium',
          is_locked: Boolean(item.is_locked),
          is_completed: Boolean(item.is_completed),
          actual_duration_minutes: item.actual_duration_minutes || 0,
          sort_order: idx,
        }));

        const { data: inserted, error: insertErr } = await supabase
          .from('daily_schedule_items')
          .insert(payload)
          .select();

        if (insertErr) {
          console.error('Error saving schedule for today:', insertErr);
          setError(insertErr.message);
        } else if (inserted) {
          setScheduleItems(inserted as DailyScheduleItem[]);
        }
      } else {
        setScheduleItems([]);
      }

      // 2. Persist items moved to other dates (e.g. moved to tomorrow)
      if (itemsForOtherDates.length > 0) {
        const payloadOther = itemsForOtherDates.map((item, idx) => ({
          user_id: user.id,
          date: item.date,
          task_id: item.task_id || null,
          session_type: item.session_type,
          start_time: item.start_time,
          end_time: item.end_time,
          duration_minutes: item.duration_minutes,
          title: item.title,
          difficulty: item.difficulty || 'medium',
          is_locked: false,
          is_completed: false,
          actual_duration_minutes: 0,
          sort_order: idx,
        }));

        const { error: otherErr } = await supabase
          .from('daily_schedule_items')
          .insert(payloadOther);

        if (otherErr) {
          console.error('Error saving moved schedule items:', otherErr);
        }
      }

      // Refresh both day schedule and all schedule items
      await fetchScheduleAndProfile(plannerDate);
    } catch (e) {
      console.error('handleSaveSchedule error:', e);
    }
  };

  const handleCompleteTaskFromPlanner = async (taskId: string, completed: boolean) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('tasks')
        .update({
          status: completed ? 'done' : 'todo',
          completed_at: completed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .eq('user_id', user.id);

      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: completed ? 'done' : 'todo' } : t))
      );
    } catch (e) {
      console.error('handleCompleteTaskFromPlanner error:', e);
    }
  };

  /**
   * Fast, targeted single-row completion toggle for AI Daily Planner sessions.
   * Avoids destructive delete/reinsert and guarantees 100% database & state sync.
   */
  const handleToggleSessionComplete = async (session: DailyScheduleItem, completed: boolean) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const actualDuration =
        completed && (!session.actual_duration_minutes || session.actual_duration_minutes === 0)
          ? session.duration_minutes
          : session.actual_duration_minutes || 0;

      // 1. Optimistic updates in schedule items state
      setScheduleItems((prev) =>
        prev.map((s) =>
          s.id === session.id || (session.task_id && s.task_id === session.task_id && s.date === session.date)
            ? { ...s, is_completed: completed, actual_duration_minutes: actualDuration }
            : s
        )
      );

      setAllScheduleItems((prev) =>
        prev.map((s) =>
          s.id === session.id || (session.task_id && s.task_id === session.task_id && s.date === session.date)
            ? { ...s, is_completed: completed, actual_duration_minutes: actualDuration }
            : s
        )
      );

      // 2. Optimistic update in tasks list
      if (session.task_id) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === session.task_id
              ? {
                  ...t,
                  status: completed ? 'done' : 'todo',
                  completed_at: completed ? new Date().toISOString() : null,
                  updated_at: new Date().toISOString(),
                }
              : t
          )
        );
      }

      // 3. Direct DB update on daily_schedule_items
      const isDbUuid = session.id && !session.id.startsWith('sched-');
      let scheduleUpdatePromise;
      if (isDbUuid) {
        scheduleUpdatePromise = supabase
          .from('daily_schedule_items')
          .update({
            is_completed: completed,
            actual_duration_minutes: actualDuration,
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.id)
          .eq('user_id', user.id);
      } else if (session.task_id) {
        scheduleUpdatePromise = supabase
          .from('daily_schedule_items')
          .update({
            is_completed: completed,
            actual_duration_minutes: actualDuration,
            updated_at: new Date().toISOString(),
          })
          .eq('task_id', session.task_id)
          .eq('date', session.date)
          .eq('user_id', user.id);
      }

      // 4. Direct DB update on tasks
      let taskUpdatePromise;
      if (session.task_id) {
        taskUpdatePromise = supabase
          .from('tasks')
          .update({
            status: completed ? 'done' : 'todo',
            completed_at: completed ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.task_id)
          .eq('user_id', user.id);
      }

      await Promise.all([scheduleUpdatePromise, taskUpdatePromise].filter(Boolean));
    } catch (e) {
      console.error('handleToggleSessionComplete error:', e);
      await fetchScheduleAndProfile(plannerDate);
    }
  };

  const handleSavePreferences = async (prefs: SchedulingPreferences) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('profiles')
        .update({
          daily_start_time: prefs.startTime,
          daily_end_time: prefs.endTime,
          high_focus_start: prefs.highFocusStart,
          high_focus_end: prefs.highFocusEnd,
          preferred_break_duration: prefs.preferredBreakDuration,
          max_daily_study_minutes: prefs.maxDailyStudyMinutes,
        })
        .eq('id', user.id);

      setUserProfile((prev: any) => ({
        ...prev,
        daily_start_time: prefs.startTime,
        daily_end_time: prefs.endTime,
        high_focus_start: prefs.highFocusStart,
        high_focus_end: prefs.highFocusEnd,
        preferred_break_duration: prefs.preferredBreakDuration,
        max_daily_study_minutes: prefs.maxDailyStudyMinutes,
      }));
    } catch (e) {
      console.error('handleSavePreferences error:', e);
    }
  };

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
   * Instant toggle between 'done' and 'todo', synchronized with daily schedule
   */
  const toggleTaskDone = async (task: Task) => {
    const nextStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done';
    const isCompleted = nextStatus === 'done';

    // Optimistic update for tasks
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: nextStatus,
              completed_at: isCompleted ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            }
          : t
      )
    );

    // Optimistic update for daily planner sessions
    setScheduleItems((prev) =>
      prev.map((s) => (s.task_id === task.id ? { ...s, is_completed: isCompleted } : s))
    );
    setAllScheduleItems((prev) =>
      prev.map((s) => (s.task_id === task.id ? { ...s, is_completed: isCompleted } : s))
    );

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error: err } = await supabase
        .from('tasks')
        .update({
          status: nextStatus,
          completed_at: isCompleted ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      if (err) throw err;

      // Sync daily_schedule_items in database
      if (user) {
        await supabase
          .from('daily_schedule_items')
          .update({
            is_completed: isCompleted,
            updated_at: new Date().toISOString(),
          })
          .eq('task_id', task.id)
          .eq('user_id', user.id);
      }

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
      setScheduleItems((prev) =>
        prev.map((s) => (s.task_id === task.id ? { ...s, is_completed: task.status === 'done' } : s))
      );
      setAllScheduleItems((prev) =>
        prev.map((s) => (s.task_id === task.id ? { ...s, is_completed: task.status === 'done' } : s))
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

  // ---------------------------------------------------------------------------
  // Folder Handlers (Create, Edit, Delete, Select)
  // ---------------------------------------------------------------------------

  const handleOpenCreateFolder = () => {
    setEditingFolder(null);
    setIsFolderModalOpen(true);
  };

  const handleOpenEditFolder = (folder: TaskFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolder(folder);
    setIsFolderModalOpen(true);
  };

  const handleOpenDeleteFolder = (folder: TaskFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingFolder(folder);
  };

  const handleAddLessonToFolder = (folder: TaskFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tasksViewMode === 'classic') {
      setSelectedFolderId(folder.id);
      setQuickFolderId(folder.id);
      setShowQuickOptions(true);
      quickInputRef.current?.focus();
    } else {
      openCreateTaskModal(folder.id);
    }
  };

  const handleSaveFolder = async (data: {
    name: string;
    description: string;
    dueDate: string | null;
    color: string;
    icon: string;
  }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be logged in to manage folders.');

    if (editingFolder) {
      const { data: updated, error: err } = await supabase
        .from('task_folders')
        .update({
          name: data.name,
          description: data.description || null,
          due_date: data.dueDate,
          color: data.color,
          icon: data.icon,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingFolder.id)
        .select()
        .single();

      if (err) throw err;
      setFolders((prev) =>
        prev.map((f) => (f.id === editingFolder.id ? (updated as TaskFolder) : f))
      );
      setEditingFolder(null);
    } else {
      const { data: created, error: err } = await supabase
        .from('task_folders')
        .insert({
          user_id: user.id,
          name: data.name,
          description: data.description || null,
          due_date: data.dueDate,
          color: data.color,
          icon: data.icon,
        })
        .select()
        .single();

      if (err) throw err;
      const newFolder = created as TaskFolder;
      setFolders((prev) => [newFolder, ...prev]);
      setSelectedFolderId(newFolder.id);
      setTaskModalFolderId(newFolder.id);
    }
  };

  const handleDeleteFolder = async (deleteTasksToo: boolean) => {
    if (!deletingFolder) return;
    const folderId = deletingFolder.id;

    try {
      if (deleteTasksToo) {
        await supabase.from('tasks').delete().eq('folder_id', folderId);
        setTasks((prev) => prev.filter((t) => t.folder_id !== folderId));
      } else {
        await supabase
          .from('tasks')
          .update({ folder_id: null, updated_at: new Date().toISOString() })
          .eq('folder_id', folderId);
        setTasks((prev) =>
          prev.map((t) => (t.folder_id === folderId ? { ...t, folder_id: null } : t))
        );
      }

      const { error: err } = await supabase.from('task_folders').delete().eq('id', folderId);
      if (err) throw err;

      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
      setDeletingFolder(null);
    } catch (err: unknown) {
      console.error('Delete folder error:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete folder');
    }
  };

  /**
   * Quick Add Task (Classic Mode)
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
      const targetFolderId =
        quickFolderId || (selectedFolderId && selectedFolderId !== 'unfiled' ? selectedFolderId : null) || null;

      const { data, error: err } = await supabase
        .from('tasks')
        .insert({
          user_id: user.id,
          folder_id: targetFolderId,
          title,
          description: quickDescription.trim() || null,
          priority: quickPriority,
          difficulty: quickDifficulty,
          estimated_duration: Number(quickEstimatedDuration) || 30,
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

      setQuickTitle('');
      setQuickDescription('');
      setQuickDueDate('');
      setQuickReminderAt('');
      setQuickPriority('medium');
      setShowQuickOptions(false);

      try {
        const folderName = targetFolderId ? foldersMap.get(targetFolderId)?.name : null;
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: folderName ? `Lesson added to "${folderName}"` : 'Task Created',
          message: reminderDateISO
            ? `Task "${newTask.title}" added with reminder.`
            : `Task "${newTask.title}" added to your list.`,
          type: 'task',
          is_read: false,
          action_url: '/tasks',
        });
      } catch { }

      quickInputRef.current?.focus();
    } catch (err: unknown) {
      console.error('Create task error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSubmittingQuick(false);
    }
  };

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

  /**
   * Open Create Task Modal (Matching Image 2)
   */
  const openCreateTaskModal = (folderId?: string) => {
    setTaskModalMode('create');
    setEditingTaskId(null);
    setTaskModalFolderId(folderId || (selectedFolderId && selectedFolderId !== 'unfiled' ? selectedFolderId : ''));
    setTaskModalTitle('');
    setTaskModalDescription('');
    setTaskModalPriority('medium');
    setTaskModalDifficulty('medium');
    setTaskModalEstimatedDuration(30);
    setTaskModalDueDate('');
    setTaskModalReminderAt('');
    setTaskModalStatus('todo');
    setIsTaskModalOpen(true);
  };

  /**
   * Open Edit Task Modal (Matching Image 2)
   */
  const openEditModal = (task: Task, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTaskModalMode('edit');
    setEditingTaskId(task.id);
    setTaskModalFolderId(task.folder_id || '');
    setTaskModalTitle(task.title);
    setTaskModalDescription(task.description || '');
    setTaskModalPriority(task.priority);
    setTaskModalDifficulty(task.difficulty || 'medium');
    setTaskModalEstimatedDuration(task.estimated_duration || 30);
    setTaskModalDueDate(task.due_date ? task.due_date.slice(0, 10) : '');
    setTaskModalStatus(task.status);

    if (task.reminder_at) {
      try {
        const d = new Date(task.reminder_at);
        const offset = d.getTimezoneOffset() * 60000;
        setTaskModalReminderAt(new Date(d.getTime() - offset).toISOString().slice(0, 16));
      } catch {
        setTaskModalReminderAt('');
      }
    } else {
      setTaskModalReminderAt('');
    }

    setIsTaskModalOpen(true);
  };

  /**
   * Unified Save Handler for Create & Edit Task Modal
   */
  const saveTaskModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskModalTitle.trim() || savingTaskModal) return;

    setSavingTaskModal(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be logged in to manage tasks.');

      const reminderDateISO = taskModalReminderAt ? new Date(taskModalReminderAt).toISOString() : null;
      const targetFolderId = taskModalFolderId || null;

      if (taskModalMode === 'create') {
        const payload = {
          user_id: user.id,
          folder_id: targetFolderId,
          title: taskModalTitle.trim(),
          description: taskModalDescription.trim() || null,
          priority: taskModalPriority,
          status: taskModalStatus,
          difficulty: taskModalDifficulty,
          estimated_duration: Number(taskModalEstimatedDuration) || 30,
          due_date: taskModalDueDate || null,
          reminder_at: reminderDateISO,
          reminder_sent: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data, error: err } = await supabase
          .from('tasks')
          .insert(payload)
          .select()
          .single();

        if (err) throw err;

        const newTask = data as Task;
        setTasks((prev) => [newTask, ...prev]);

        // Auto-expand folder so the newly created task is visible
        if (targetFolderId) {
          setExpandedFolders((prev) => ({ ...prev, [targetFolderId]: true }));
        } else {
          setExpandedFolders((prev) => ({ ...prev, unfiled: true }));
        }

        if (reminderDateISO && new Date(reminderDateISO).getTime() > Date.now()) {
          scheduleBackgroundNotification({
            userId: user.id,
            idempotencyKey: `task_reminder_${newTask.id}_${reminderDateISO}`,
            title: `⏰ Task Reminder: ${newTask.title}`,
            message: `Time to finish: "${newTask.title}"! Priority: ${newTask.priority.toUpperCase()}`,
            category: 'task',
            actionUrl: '/tasks',
            scheduledFor: new Date(reminderDateISO),
          }).catch(() => { });
        }
      } else if (taskModalMode === 'edit' && editingTaskId) {
        const isCompleted = taskModalStatus === 'done';
        const existingTask = tasks.find((t) => t.id === editingTaskId);

        const { error: err } = await supabase
          .from('tasks')
          .update({
            folder_id: targetFolderId,
            title: taskModalTitle.trim(),
            description: taskModalDescription.trim() || null,
            priority: taskModalPriority,
            status: taskModalStatus,
            difficulty: taskModalDifficulty,
            estimated_duration: Number(taskModalEstimatedDuration) || 30,
            due_date: taskModalDueDate || null,
            reminder_at: reminderDateISO,
            reminder_sent:
              reminderDateISO !== existingTask?.reminder_at ? false : existingTask?.reminder_sent,
            completed_at: isCompleted ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingTaskId);

        if (err) throw err;

        // Also update daily_schedule_items in DB
        await supabase
          .from('daily_schedule_items')
          .update({
            title: taskModalTitle.trim(),
            difficulty: taskModalDifficulty,
            duration_minutes: Number(taskModalEstimatedDuration) || 30,
            is_completed: isCompleted,
            updated_at: new Date().toISOString(),
          })
          .eq('task_id', editingTaskId)
          .eq('user_id', user.id);

        setTasks((prev) =>
          prev.map((t) =>
            t.id === editingTaskId
              ? {
                  ...t,
                  folder_id: targetFolderId,
                  title: taskModalTitle.trim(),
                  description: taskModalDescription.trim() || null,
                  priority: taskModalPriority,
                  status: taskModalStatus,
                  difficulty: taskModalDifficulty,
                  estimated_duration: Number(taskModalEstimatedDuration) || 30,
                  due_date: taskModalDueDate || null,
                  reminder_at: reminderDateISO,
                  reminder_sent:
                    reminderDateISO !== existingTask?.reminder_at ? false : existingTask?.reminder_sent,
                  completed_at: isCompleted ? new Date().toISOString() : null,
                  updated_at: new Date().toISOString(),
                }
              : t
          )
        );

        setScheduleItems((prev) =>
          prev.map((s) =>
            s.task_id === editingTaskId
              ? {
                  ...s,
                  title: taskModalTitle.trim(),
                  difficulty: taskModalDifficulty,
                  duration_minutes: Number(taskModalEstimatedDuration) || 30,
                  is_completed: isCompleted,
                }
              : s
          )
        );

        setAllScheduleItems((prev) =>
          prev.map((s) =>
            s.task_id === editingTaskId
              ? {
                  ...s,
                  title: taskModalTitle.trim(),
                  difficulty: taskModalDifficulty,
                  duration_minutes: Number(taskModalEstimatedDuration) || 30,
                  is_completed: isCompleted,
                }
              : s
          )
        );
      }

      setIsTaskModalOpen(false);
    } catch (e: unknown) {
      console.error('saveTaskModal error:', e);
      setError(e instanceof Error ? e.message : 'Failed to save task');
    } finally {
      setSavingTaskModal(false);
    }
  };

  /**
   * Delete Task
   */
  const deleteTask = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setScheduleItems((prev) => prev.filter((s) => s.task_id !== id));
      setAllScheduleItems((prev) => prev.filter((s) => s.task_id !== id));

      await supabase.from('daily_schedule_items').delete().eq('task_id', id);
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

  // ---------------------------------------------------------------------------
  // Folder Mappings & Stats
  // ---------------------------------------------------------------------------

  const foldersMap = useMemo(() => {
    const map = new Map<string, TaskFolder>();
    for (const f of folders) {
      map.set(f.id, f);
    }
    return map;
  }, [folders]);

  const folderStatsMap = useMemo(() => {
    const map = new Map<string, { total: number; done: number; percent: number }>();
    for (const f of folders) {
      const inFolder = tasks.filter((t) => t.folder_id === f.id);
      const done = inFolder.filter((t) => t.status === 'done').length;
      const total = inFolder.length;
      const percent = total > 0 ? Math.round((done / total) * 100) : 0;
      map.set(f.id, { total, done, percent });
    }
    return map;
  }, [folders, tasks]);

  const unfiledCount = useMemo(
    () => tasks.filter((t) => !t.folder_id).length,
    [tasks]
  );

  const activeFolder = selectedFolderId && selectedFolderId !== 'unfiled' ? foldersMap.get(selectedFolderId) : null;

  // ---------------------------------------------------------------------------
  // Filtered & Smart Sorted Tasks
  // ---------------------------------------------------------------------------

  const taskStats = useMemo(() => {
    const relevantTasks = selectedFolderId
      ? selectedFolderId === 'unfiled'
        ? tasks.filter((t) => !t.folder_id)
        : tasks.filter((t) => t.folder_id === selectedFolderId)
      : tasks;

    const total = relevantTasks.length;
    const done = relevantTasks.filter((t) => t.status === 'done').length;
    const active = total - done;
    const overdue = relevantTasks.filter((t) => isTaskOverdue(t, t.folder_id ? foldersMap.get(t.folder_id) : undefined)).length;
    const today = relevantTasks.filter((t) => isTaskDueToday(t, t.folder_id ? foldersMap.get(t.folder_id) : undefined) || isTaskOverdue(t, t.folder_id ? foldersMap.get(t.folder_id) : undefined)).length;
    const upcoming = relevantTasks.filter(
      (t) => {
        const folder = t.folder_id ? foldersMap.get(t.folder_id) : undefined;
        const effDate = getEffectiveDueDate(t, folder);
        return t.status !== 'done' && effDate && !isTaskOverdue(t, folder) && !isTaskDueToday(t, folder);
      }
    ).length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;

    return { total, done, active, overdue, today, upcoming, percent, allTasksTotal: tasks.length };
  }, [tasks, selectedFolderId, foldersMap]);

  const displayedTasks = useMemo(() => {
    // 0. Folder Filter (if a folder is active)
    let list = tasks;
    if (selectedFolderId) {
      if (selectedFolderId === 'unfiled') {
        list = list.filter((t) => !t.folder_id);
      } else {
        list = list.filter((t) => t.folder_id === selectedFolderId);
      }
    }

    // 1. Priority Filter
    if (filterPriority) {
      list = list.filter((t) => t.priority === filterPriority);
    }

    // 2. Tab Filter
    if (activeTab === 'today') {
      list = list.filter((t) => {
        const folder = t.folder_id ? foldersMap.get(t.folder_id) : undefined;
        return t.status !== 'done' && (isTaskDueToday(t, folder) || isTaskOverdue(t, folder));
      });
    } else if (activeTab === 'upcoming') {
      list = list.filter((t) => {
        const folder = t.folder_id ? foldersMap.get(t.folder_id) : undefined;
        const effDate = getEffectiveDueDate(t, folder);
        return t.status !== 'done' && effDate && !isTaskOverdue(t, folder) && !isTaskDueToday(t, folder);
      });
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

      const folderA = a.folder_id ? foldersMap.get(a.folder_id) : undefined;
      const folderB = b.folder_id ? foldersMap.get(b.folder_id) : undefined;

      // PEDAGOGICAL LESSON SEQUENCING:
      // If both tasks belong to the same subject or study folder:
      // Earlier lessons MUST strictly precede later lessons (Lesson 1 < Lesson 2 < Lesson 5)
      const lessonA = extractLessonSequence(a.title, folderA?.name);
      const lessonB = extractLessonSequence(b.title, folderB?.name);

      if (
        lessonA.seriesKey === lessonB.seriesKey &&
        lessonA.sequenceNumber !== null &&
        lessonB.sequenceNumber !== null &&
        lessonA.sequenceNumber !== lessonB.sequenceNumber
      ) {
        return lessonA.sequenceNumber - lessonB.sequenceNumber;
      }

      if (sortBy === 'smart') {
        const scoreA = calculateTaskScore(a, folderA);
        const scoreB = calculateTaskScore(b, folderB);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      if (sortBy === 'due_date') {
        const dateA = getEffectiveDueDate(a, folderA);
        const dateB = getEffectiveDueDate(b, folderB);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.localeCompare(dateB);
      }

      if (sortBy === 'priority') {
        const weight: Record<TaskPriority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
        return weight[b.priority] - weight[a.priority];
      }

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [tasks, selectedFolderId, filterPriority, activeTab, sortBy, foldersMap]);

  // Separate active vs completed for clean sectioning in 'all' view
  const activeDisplayed = useMemo(
    () => displayedTasks.filter((t) => t.status !== 'done'),
    [displayedTasks]
  );
  const doneDisplayed = useMemo(
    () => displayedTasks.filter((t) => t.status === 'done'),
    [displayedTasks]
  );

  const overdueList = useMemo(
    () =>
      activeDisplayed.filter((t) =>
        isTaskOverdue(t, t.folder_id ? foldersMap.get(t.folder_id) : undefined)
      ),
    [activeDisplayed, foldersMap]
  );
  const nonOverdueList = useMemo(
    () =>
      activeDisplayed.filter(
        (t) => !isTaskOverdue(t, t.folder_id ? foldersMap.get(t.folder_id) : undefined)
      ),
    [activeDisplayed, foldersMap]
  );

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

      {/* ── TOP-LEVEL VIEW SWITCHER (ONLY IN AI FOLDERS MODE - COMPLETELY REMOVED IN CLASSIC MODE) ── */}
      {tasksViewMode === 'ai_folders' && (
        <div
          className={`flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/90 border border-slate-800 mb-5 overflow-x-auto shadow-sm transition-all duration-200 ${
            isStudyLockdownActive ? 'pointer-events-none opacity-25 select-none grayscale cursor-not-allowed' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveMainTab('tasks')}
            className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeMainTab === 'tasks'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>Tasks & Folders</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab('planner')}
            className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeMainTab === 'planner'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-300" />
            <span>AI Daily Planner</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab('forecast')}
            className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeMainTab === 'forecast'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <BarChart2 className="w-4 h-4 text-emerald-300" />
            <span>Weekly Forecast</span>
          </button>
        </div>
      )}

      {tasksViewMode === 'ai_folders' && activeMainTab === 'planner' && (
        <DailyPlannerView
          tasks={tasks}
          folders={folders}
          scheduleItems={scheduleItems}
          currentDate={plannerDate}
          onDateChange={(d) => setPlannerDate(d)}
          onSaveSchedule={handleSaveSchedule}
          onCompleteTask={handleCompleteTaskFromPlanner}
          onToggleSessionComplete={handleToggleSessionComplete}
          userPreferences={{
            startTime: userProfile?.daily_start_time || '08:00',
            endTime: userProfile?.daily_end_time || '21:00',
            highFocusStart: userProfile?.high_focus_start || '09:00',
            highFocusEnd: userProfile?.high_focus_end || '12:00',
            preferredBreakDuration: userProfile?.preferred_break_duration || 15,
            maxDailyStudyMinutes: userProfile?.max_daily_study_minutes || 480,
          }}
          onSavePreferences={handleSavePreferences}
        />
      )}

      {tasksViewMode === 'ai_folders' && activeMainTab === 'forecast' && (
        <WeeklyForecastView
          tasks={tasks}
          folders={folders}
          scheduleItems={allScheduleItems}
          onSelectDate={(date) => {
            setPlannerDate(date);
            setActiveMainTab('planner');
          }}
          onNavigateToPlanner={() => setActiveMainTab('planner')}
        />
      )}

      {(tasksViewMode === 'classic' || activeMainTab === 'tasks') && (
        <div className="space-y-5">
          {tasksViewMode === 'ai_folders' ? (
<div className="space-y-6">
          {/* ── TOP ACTION BAR: FOLDERS & TASKS ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
                <Folder className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Subject Folders & Tasks</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold font-mono">
                    {folders.length} {folders.length === 1 ? 'Folder' : 'Folders'}
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Organize your subjects, lessons, and exam dates. Add tasks directly into any folder.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {folders.length > 0 && (
                <button
                  type="button"
                  onClick={Object.values(expandedFolders).some(Boolean) ? handleCollapseAll : handleExpandAll}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 shadow-sm active:scale-95"
                  title={Object.values(expandedFolders).some(Boolean) ? 'Collapse all folders' : 'Expand all folders'}
                >
                  {Object.values(expandedFolders).some(Boolean) ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>Collapse All</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Expand All</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={handleExportSchedulePdf}
                disabled={isExportingPdf}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 shadow-sm active:scale-95"
                title="Export today's AI planned schedule as a luxury PDF"
              >
                {isExportingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                ) : (
                  <FileDown className="w-4 h-4 text-purple-400" />
                )}
                <span className="hidden sm:inline">Export Schedule PDF</span>
                <span className="sm:hidden">Schedule PDF</span>
              </button>
              <button
                type="button"
                onClick={handleOpenCreateFolder}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 shadow-sm active:scale-95"
              >
                <FolderPlus className="w-4 h-4 text-cyan-400" />
                <span>New Folder</span>
              </button>
              <button
                type="button"
                onClick={() => openCreateTaskModal()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/30 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Add Task</span>
              </button>
            </div>
          </div>

          {/* ── EMPTY STATE WHEN NO FOLDERS ── */}
          {folders.length === 0 && (
            <div className="p-8 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mx-auto">
                <FolderPlus className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Create your first subject folder</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                  Create folders for your subjects (e.g. Arabic, Math, English) with exam dates.
                  Then add lessons and study tasks to stay on track!
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportSchedulePdf}
                disabled={isExportingPdf}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 shadow-sm active:scale-95"
                title="Export today's AI planned schedule as a luxury PDF"
              >
                {isExportingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                ) : (
                  <FileDown className="w-4 h-4 text-purple-400" />
                )}
                <span className="hidden sm:inline">Export Schedule PDF</span>
                <span className="sm:hidden">Schedule PDF</span>
              </button>
              <button
                type="button"
                onClick={handleOpenCreateFolder}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all"
              >
                <FolderPlus className="w-4 h-4" />
                <span>Create Subject Folder</span>
              </button>
            </div>
          )}

          {/* ── FOLDERS LIST (CONTAINERS WITH EMBEDDED TASKS) ── */}
          {folders.map((folder) => {
            const folderTasks = tasks.filter((t) => t.folder_id === folder.id);
            const completedCount = folderTasks.filter((t) => t.status === 'done').length;
            const totalCount = folderTasks.length;
            const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            const colorCfg = FOLDER_COLORS[folder.color] || FOLDER_COLORS.blue;
            const countdown = folder.due_date ? getFolderCountdown(folder.due_date) : null;
            const isExpanded = Boolean(expandedFolders[folder.id]);
            const isCollapsed = !isExpanded;
            const IconComp = FOLDER_ICONS[folder.icon]?.icon || Folder;

            // Sort tasks pedagogically and by completion
            const sortedFolderTasks = [...folderTasks].sort((a, b) => {
              if (a.status === 'done' && b.status !== 'done') return 1;
              if (a.status !== 'done' && b.status === 'done') return -1;

              const lessonA = extractLessonSequence(a.title, folder.name);
              const lessonB = extractLessonSequence(b.title, folder.name);
              if (
                lessonA.seriesKey === lessonB.seriesKey &&
                lessonA.sequenceNumber !== null &&
                lessonB.sequenceNumber !== null &&
                lessonA.sequenceNumber !== lessonB.sequenceNumber
              ) {
                return lessonA.sequenceNumber - lessonB.sequenceNumber;
              }

              const weight: Record<TaskPriority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
              if (weight[b.priority] !== weight[a.priority]) {
                return weight[b.priority] - weight[a.priority];
              }

              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });

            return (
              <div
                key={folder.id}
                className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-sm hover:border-slate-700/80 transition-all"
              >
                {/* Folder Header Bar */}
                <div className="p-3.5 sm:p-4 bg-slate-900/90 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left: Folder Info */}
                  <div
                    onClick={() => toggleExpandFolder(folder.id)}
                    className="flex items-center gap-3 cursor-pointer select-none group min-w-0 flex-1"
                  >
                    <div
                      className={`p-2 rounded-xl border shrink-0 transition-transform group-hover:scale-105 ${colorCfg.bg} ${colorCfg.border} ${colorCfg.text}`}
                    >
                      <IconComp className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm sm:text-base text-white truncate group-hover:text-blue-300 transition-colors">
                          {folder.name}
                        </h3>

                        {/* Exam Countdown Badge */}
                        {countdown && (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                              countdown.isOverdue
                                ? 'bg-red-500/15 text-red-300 border-red-500/30'
                                : countdown.isToday
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                                : 'bg-blue-500/15 text-blue-200 border-blue-500/30'
                            }`}
                          >
                            <Calendar className="w-3 h-3 shrink-0" />
                            <span>Exam: {countdown.formattedDate}</span>
                            <span className="text-[10px] opacity-80">({countdown.label})</span>
                          </span>
                        )}

                        {/* Task Count Badge */}
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/60 font-medium font-mono">
                          {completedCount}/{totalCount} Completed ({progressPct}%)
                        </span>
                      </div>

                      {/* Mini Progress Bar */}
                      {totalCount > 0 && (
                        <div className="w-full max-w-xs mt-2 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              progressPct === 100 ? 'bg-emerald-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => openCreateTaskModal(folder.id)}
                      className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-semibold flex items-center gap-1 transition-all active:scale-95"
                      title={`Add task to ${folder.name}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Task</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleOpenEditFolder(folder, e)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Edit folder"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleOpenDeleteFolder(folder, e)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                      title="Delete folder"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleExpandFolder(folder.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title={isCollapsed ? 'Expand folder' : 'Collapse folder'}
                    >
                      {isCollapsed ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronUp className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Folder Content (Tasks List) */}
                {!isCollapsed && (
                  <div className="p-3 sm:p-4 space-y-2 bg-slate-950/40">
                    {sortedFolderTasks.length === 0 ? (
                      <div className="py-6 px-4 text-center rounded-xl border border-dashed border-slate-800/80 bg-slate-900/30">
                        <p className="text-xs text-slate-400">
                          No tasks or lessons in <strong className="text-slate-300">&quot;{folder.name}&quot;</strong> yet.
                        </p>
                        <button
                          type="button"
                          onClick={() => openCreateTaskModal(folder.id)}
                          className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold border border-blue-500/30 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add First Lesson</span>
                        </button>
                      </div>
                    ) : (
                      sortedFolderTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          folder={folder}
                          onToggleDone={toggleTaskDone}
                          onToggleInProgress={toggleInProgress}
                          onEdit={openEditModal}
                          onDelete={deleteTask}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── GENERAL / UNFILED TASKS (NO FOLDER) ── */}
          {(() => {
            const unfiledTasks = tasks.filter((t) => !t.folder_id);
            if (unfiledTasks.length === 0 && folders.length > 0) return null;
            const completedCount = unfiledTasks.filter((t) => t.status === 'done').length;
            const totalCount = unfiledTasks.length;
            const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            const isExpanded = Boolean(expandedFolders['unfiled']);
            const isCollapsed = !isExpanded;

            return (
              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-sm hover:border-slate-700/80 transition-all">
                <div className="p-3.5 sm:p-4 bg-slate-900/90 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div
                    onClick={() => toggleExpandFolder('unfiled')}
                    className="flex items-center gap-3 cursor-pointer select-none group min-w-0 flex-1"
                  >
                    <div className="p-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 shrink-0">
                      <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-blue-300 transition-colors">
                          General Tasks
                        </h3>
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/60 font-medium font-mono">
                          {completedCount}/{totalCount} Completed ({progressPct}%)
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Tasks not assigned to any specific subject folder
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => openCreateTaskModal('')}
                      className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-semibold flex items-center gap-1 transition-all active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Task</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExpandFolder('unfiled')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title={isCollapsed ? 'Expand section' : 'Collapse section'}
                    >
                      {isCollapsed ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronUp className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="p-3 sm:p-4 space-y-2 bg-slate-950/40">
                    {unfiledTasks.length === 0 ? (
                      <div className="py-6 px-4 text-center rounded-xl border border-dashed border-slate-800/80 bg-slate-900/30">
                        <p className="text-xs text-slate-400">No general unfiled tasks.</p>
                      </div>
                    ) : (
                      unfiledTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          onToggleDone={toggleTaskDone}
                          onToggleInProgress={toggleInProgress}
                          onEdit={openEditModal}
                          onDelete={deleteTask}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
          ) : (
            <div>
      <div className="mb-5 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 shadow-sm backdrop-blur-sm">
        <div className={`flex items-center justify-between ${showFoldersSection ? 'mb-3' : ''}`}>
          <div
            onClick={() => setShowFoldersSection(!showFoldersSection)}
            className="flex items-center gap-2.5 cursor-pointer select-none group"
          >
            <div className="p-1.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 group-hover:bg-blue-500/25 transition-colors">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Folders & Exams</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/80 font-mono">
                  {folders.length}
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenCreateFolder}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/20 active:scale-95 shrink-0"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>New Folder</span>
            </button>
            <button
              type="button"
              onClick={() => setShowFoldersSection(!showFoldersSection)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title={showFoldersSection ? 'Collapse folders' : 'Expand folders'}
            >
              {showFoldersSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {showFoldersSection && (
          <div>
            {folders.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 text-center space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mx-auto">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">Create your first subject or exam folder</h3>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto mt-0.5">
                    For example, create an <strong>&quot;English&quot;</strong> folder with your exam date to keep all your lessons and study topics organized in one place!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenCreateFolder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold border border-blue-500/30 transition-colors mt-1"
                >
                  <Plus className="w-3 h-3" /> Create &quot;English&quot; Folder
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {folders.map((folder) => {
                  const stats = folderStatsMap.get(folder.id) || { total: 0, done: 0, percent: 0 };
                  const isSelected = selectedFolderId === folder.id;
                  return (
                    <TaskFolderCard
                      key={folder.id}
                      folder={folder}
                      totalTasks={stats.total}
                      completedTasks={stats.done}
                      isSelected={isSelected}
                      onSelect={(fId) => {
                        setSelectedFolderId(selectedFolderId === fId ? null : fId);
                      }}
                      onEdit={handleOpenEditFolder}
                      onDelete={handleOpenDeleteFolder}
                      onAddLesson={handleAddLessonToFolder}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ACTIVE FOLDER BANNER ── */}
      {activeFolder && (
        <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900/90 to-slate-900/90 border border-blue-500/40 flex items-center justify-between gap-3 shadow-lg shadow-blue-950/20 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-2 rounded-xl border shrink-0 ${
                FOLDER_COLORS[activeFolder.color]?.bg || 'bg-blue-500/20'
              } ${FOLDER_COLORS[activeFolder.color]?.border || 'border-blue-500/40'} ${
                FOLDER_COLORS[activeFolder.color]?.text || 'text-blue-300'
              }`}
            >
              {(() => {
                const IconC = FOLDER_ICONS[activeFolder.icon]?.icon || Folder;
                return <IconC className="w-4 h-4 sm:w-5 sm:h-5" />;
              })()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-blue-300 font-bold uppercase tracking-wider">
                  Viewing Folder:
                </span>
                <span className="text-sm font-bold text-white truncate">
                  {activeFolder.name}
                </span>
                {activeFolder.due_date && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-200 border border-blue-500/30 font-medium">
                    📅 Exam: {new Date(activeFolder.due_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Lessons added below are automatically organized in &quot;{activeFolder.name}&quot;.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedFolderId(null)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
            >
              Show All Tasks
            </button>
          </div>
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
              placeholder={
                activeFolder
                  ? `Add lesson or topic to "${activeFolder.name}"... (press Enter)`
                  : 'What needs to be done? Type and press Enter...'
              }
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
                {/* Target Folder Selector */}
                {folders.length > 0 && (
                  <div className="relative inline-flex items-center">
                    <select
                      value={quickFolderId}
                      onChange={(e) => setQuickFolderId(e.target.value)}
                      className="text-[11px] font-medium py-1 px-2.5 rounded-lg border border-slate-700/60 bg-slate-800/80 text-slate-300 outline-none cursor-pointer appearance-none pr-5 hover:bg-slate-700"
                    >
                      <option value="">📁 General (No Folder)</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          📁 {f.name} {f.due_date ? `(Exam: ${new Date(f.due_date).toLocaleDateString([], { month: 'short', day: 'numeric' })})` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3 h-3 absolute right-1.5 pointer-events-none opacity-60 text-slate-400" />
                  </div>
                )}

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

      {/* ── FOLDER FILTER PILLS ── */}
      {folders.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3.5 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
            <Layers className="w-3.5 h-3.5 text-blue-400" /> Filter:
          </span>
          <button
            type="button"
            onClick={() => setSelectedFolderId(null)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 border ${
              selectedFolderId === null
                ? 'bg-blue-600/30 text-blue-200 border-blue-500 font-bold shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            <span>All Tasks</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 font-mono">
              {tasks.length}
            </span>
          </button>

          {folders.map((f) => {
            const stats = folderStatsMap.get(f.id);
            const isFSelected = selectedFolderId === f.id;
            const colorCfg = FOLDER_COLORS[f.color] || FOLDER_COLORS.blue;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFolderId(isFSelected ? null : f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 border ${
                  isFSelected
                    ? `${colorCfg.border} ${colorCfg.bg} ${colorCfg.text} font-bold ring-2 ${colorCfg.ring} shadow-sm`
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60'
                }`}
              >
                <span>📁 {f.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
                  {stats?.done || 0}/{stats?.total || 0}
                </span>
              </button>
            );
          })}

          {unfiledCount > 0 && (
            <button
              type="button"
              onClick={() => setSelectedFolderId(selectedFolderId === 'unfiled' ? null : 'unfiled')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 border ${
                selectedFolderId === 'unfiled'
                  ? 'bg-slate-700 text-white border-slate-500 font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span>Unfiled</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 font-mono">
                {unfiledCount}
              </span>
            </button>
          )}
        </div>
      )}

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

        {/* Sorting & Smart Distribute Controls */}
        <div className="flex items-center gap-2">
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
          <h3 className="text-sm font-semibold text-slate-300">
            {selectedFolderId
              ? `No lessons found in this folder`
              : 'No tasks found'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            {selectedFolderId
              ? 'Type in the box above to add lessons to this folder!'
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
                    folder={task.folder_id ? foldersMap.get(task.folder_id) : undefined}
                    onToggleDone={toggleTaskDone}
                    onToggleInProgress={toggleInProgress}
                    onEdit={openEditModal}
                    onDelete={deleteTask}
                    onSelectFolder={(fId) => setSelectedFolderId(fId)}
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
                    folder={task.folder_id ? foldersMap.get(task.folder_id) : undefined}
                    onToggleDone={toggleTaskDone}
                    onToggleInProgress={toggleInProgress}
                    onEdit={openEditModal}
                    onDelete={deleteTask}
                    onSelectFolder={(fId) => setSelectedFolderId(fId)}
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
                  folder={task.folder_id ? foldersMap.get(task.folder_id) : undefined}
                  onToggleDone={toggleTaskDone}
                  onToggleInProgress={toggleInProgress}
                  onEdit={openEditModal}
                  onDelete={deleteTask}
                  onSelectFolder={(fId) => setSelectedFolderId(fId)}
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
                      folder={task.folder_id ? foldersMap.get(task.folder_id) : undefined}
                      onToggleDone={toggleTaskDone}
                      onToggleInProgress={toggleInProgress}
                      onEdit={openEditModal}
                      onDelete={deleteTask}
                      onSelectFolder={(fId) => setSelectedFolderId(fId)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
            </div>
          )}
        </div>
      )}

      {/* ── UNIFIED TASK MODAL (ADD & EDIT - MATCHING IMAGE 2/3) ── */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[#0b1120] border border-slate-800 rounded-2xl w-full max-w-lg p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-semibold text-base text-white flex items-center gap-2">
                {taskModalMode === 'create' ? (
                  <>
                    <Plus className="w-4 h-4 text-blue-400" />
                    <span>Add Task</span>
                  </>
                ) : (
                  <>
                    <Edit3 className="w-4 h-4 text-blue-400" />
                    <span>Edit Task</span>
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setIsTaskModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={saveTaskModal} className="space-y-4 mt-4">
              {/* FOLDER / SUBJECT GROUP */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1 flex items-center justify-between">
                  <span>FOLDER / SUBJECT GROUP</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFolder(null);
                      setIsFolderModalOpen(true);
                    }}
                    className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 font-normal lowercase"
                  >
                    <Plus className="w-3 h-3" /> new folder
                  </button>
                </label>
                <div className="relative">
                  <select
                    value={taskModalFolderId}
                    onChange={(e) => setTaskModalFolderId(e.target.value)}
                    className="w-full bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer appearance-none pr-8"
                  >
                    <option value="">📁 General (No Folder)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        📁 {f.name} {f.due_date ? `(Exam: ${new Date(f.due_date).toLocaleDateString([], { month: 'short', day: 'numeric' })})` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
                </div>
              </div>

              {/* Task Title * */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  value={taskModalTitle}
                  onChange={(e) => setTaskModalTitle(e.target.value)}
                  placeholder="e.g. Lesson 3 - Grammar"
                  className="w-full bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                  required
                  autoFocus
                />
              </div>

              {/* Description (optional) */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={taskModalDescription}
                  onChange={(e) => setTaskModalDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder-slate-500"
                  placeholder="Notes, links, or context..."
                />
              </div>

              {/* Priority & Status Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Priority</label>
                  <div className="relative">
                    <select
                      value={taskModalPriority}
                      onChange={(e) => setTaskModalPriority(e.target.value as TaskPriority)}
                      className="w-full bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer appearance-none pr-7"
                    >
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Status</label>
                  <div className="relative">
                    <select
                      value={taskModalStatus}
                      onChange={(e) => setTaskModalStatus(e.target.value as TaskStatus)}
                      className="w-full bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer appearance-none pr-7"
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Completed</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
                  </div>
                </div>
              </div>

              {/* Difficulty & Est. Duration Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Difficulty (AI Planning)
                  </label>
                  <div className="relative">
                    <select
                      value={taskModalDifficulty}
                      onChange={(e) => setTaskModalDifficulty(e.target.value as TaskDifficulty)}
                      className="w-full bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer appearance-none pr-7"
                    >
                      <option value="medium">🔵 Medium (Standard focus)</option>
                      <option value="easy">🟢 Easy (Quick / Low effort)</option>
                      <option value="hard">🔴 Hard (High energy & deep focus)</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Est. Duration
                  </label>
                  <div className="relative">
                    <select
                      value={taskModalEstimatedDuration}
                      onChange={(e) => setTaskModalEstimatedDuration(Number(e.target.value))}
                      className="w-full bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer appearance-none pr-7"
                    >
                      <option value={15}>⏱️ 15 mins</option>
                      <option value={30}>⏱️ 30 mins</option>
                      <option value={45}>⏱️ 45 mins</option>
                      <option value={60}>⏱️ 60 mins (1 hr)</option>
                      <option value={90}>⏱️ 90 mins (1.5 hrs)</option>
                      <option value={120}>⏱️ 120 mins (2 hrs)</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" />
                  </div>
                </div>
              </div>

              {/* Due Date & Notification Reminder Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={taskModalDueDate}
                    onChange={(e) => setTaskModalDueDate(e.target.value)}
                    className="w-full bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                    <span>Notification Reminder</span>
                    {taskModalReminderAt && (
                      <button
                        type="button"
                        onClick={() => setTaskModalReminderAt('')}
                        className="text-[10px] text-red-400 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </label>
                  <input
                    type="datetime-local"
                    value={taskModalReminderAt}
                    onChange={(e) => {
                      setTaskModalReminderAt(e.target.value);
                      if (e.target.value && notifPermission !== 'granted') {
                        requestPermission();
                      }
                    }}
                    className="w-full bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!taskModalTitle.trim() || savingTaskModal}
                  className="px-4 py-2 rounded-xl text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 transition-colors shadow-md shadow-blue-500/20"
                >
                  {savingTaskModal ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : taskModalMode === 'create' ? (
                    <Plus className="w-3.5 h-3.5" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{taskModalMode === 'create' ? 'Add Task' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── FOLDER CREATE / EDIT MODAL ── */}
      <TaskFolderModal
        isOpen={isFolderModalOpen}
        onClose={() => {
          setIsFolderModalOpen(false);
          setEditingFolder(null);
        }}
        onSave={handleSaveFolder}
        initialFolder={editingFolder}
      />

      {/* ── FOLDER DELETE CONFIRMATION DIALOG ── */}
      <DeleteFolderDialog
        isOpen={Boolean(deletingFolder)}
        folder={deletingFolder}
        taskCount={
          deletingFolder ? folderStatsMap.get(deletingFolder.id)?.total || 0 : 0
        }
        onClose={() => setDeletingFolder(null)}
        onConfirm={handleDeleteFolder}
      />

      {/* ── NO SCHEDULE ALERT POPUP MODAL ── */}
      {isNoScheduleAlertOpen && (
        <div className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-amber-500/50 rounded-3xl w-full max-w-md p-6 shadow-2xl shadow-amber-500/10 space-y-5 animate-in zoom-in-95 text-center">
            {/* Warning Icon Badge */}
            <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
              <div className="absolute inset-0 rounded-2xl bg-amber-500/20 animate-ping opacity-40" />
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/30 to-yellow-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shadow-lg">
                <Calendar className="w-8 h-8" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold uppercase tracking-wider">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>AI Daily Planner</span>
              </div>

              {/* Exact user-requested message */}
              <div className="p-4 rounded-2xl bg-gradient-to-b from-amber-500/15 to-amber-500/5 border border-amber-500/30 shadow-inner">
                <p className="text-base sm:text-lg font-black text-amber-200 tracking-tight leading-snug">
                  &ldquo;there is no schadual for today go to the (ai daily planner) first.&rdquo;
                </p>
              </div>

              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                The AI needs to build your optimized day plan with smart study blocks and break intervals before generating your luxury schedule PDF.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsNoScheduleAlertOpen(false);
                  setActiveMainTab('planner');
                }}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:brightness-110 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 active:scale-[0.98] transition-all"
              >
                <Sparkles className="w-4 h-4 text-purple-200" />
                <span>Go to (AI Daily Planner)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsNoScheduleAlertOpen(false)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
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
  folder?: TaskFolder;
  onToggleDone: (task: Task) => void;
  onToggleInProgress: (task: Task, e: React.MouseEvent) => void;
  onEdit: (task: Task, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onSelectFolder?: (folderId: string) => void;
}

function TaskItem({
  task,
  folder,
  onToggleDone,
  onToggleInProgress,
  onEdit,
  onDelete,
  onSelectFolder,
}: TaskItemProps) {
  const overdue = isTaskOverdue(task, folder);
  const dueToday = isTaskDueToday(task, folder);
  const isDone = task.status === 'done';
  const isInProgress = task.status === 'in_progress';
  const daysOverdue = overdue ? getDaysOverdue(task, folder) : 0;
  const folderCountdown = folder?.due_date ? getFolderCountdown(folder.due_date) : null;

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
            {/* Folder Badge (if assigned to a folder/subject) */}
            {folder && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectFolder?.(folder.id);
                }}
                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-all hover:scale-105 ${
                  FOLDER_COLORS[folder.color]?.bg || 'bg-blue-500/15'
                } ${FOLDER_COLORS[folder.color]?.text || 'text-blue-300'} ${
                  FOLDER_COLORS[folder.color]?.border || 'border-blue-500/30'
                }`}
                title={`Filter by folder: ${folder.name}`}
              >
                {(() => {
                  const IconComp = FOLDER_ICONS[folder.icon]?.icon || Folder;
                  return <IconComp className="w-2.5 h-2.5" />;
                })()}
                <span className="truncate max-w-[120px]">{folder.name}</span>
              </button>
            )}

            {/* Priority Chip */}
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${PRIORITY_CONFIG[task.priority].badge
                }`}
            >
              {PRIORITY_CONFIG[task.priority].label}
            </span>

            {/* Due Date Indicator (Individual task due date) */}
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

            {/* Folder Exam Due Date Indicator (if task has no personal due date, but folder has exam date) */}
            {!task.due_date && folder?.due_date && folderCountdown && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${
                  folderCountdown.isOverdue
                    ? 'bg-red-500/15 text-red-300 border-red-500/30'
                    : folderCountdown.isToday
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                    : 'bg-slate-800/90 text-slate-300 border-slate-700/60'
                }`}
                title={`Exam date for ${folder.name}`}
              >
                <Calendar className="w-3 h-3 text-blue-400 shrink-0" />
                <span>Exam: {folderCountdown.formattedDate}</span>
                <span className="text-[10px] opacity-80">({folderCountdown.label})</span>
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
