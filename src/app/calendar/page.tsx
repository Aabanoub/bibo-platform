'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { Task } from '@/types';
import { CalendarEvent } from '@/app/api/calendar/ics/route';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Link as LinkIcon,
  CheckCircle2,
  Clock,
  Tag,
  AlertCircle,
  HelpCircle,
  X,
  List,
  Grid,
} from 'lucide-react';

interface DayItem {
  id: string;
  type: 'task' | 'external' | 'habit';
  title: string;
  time?: string;
  priority?: string;
  status?: string;
  location?: string;
  description?: string;
}

export default function CalendarPage() {
  const supabase = createClient();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [externalEvents, setExternalEvents] = useState<CalendarEvent[]>([]);
  const [habitLogs, setHabitLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Sync Modal state
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [icalUrl, setIcalUrl] = useState('');
  const [syncError, setSyncError] = useState<string | null>(null);

  // New Event/Task Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState<string>('');
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');

  // Filter state
  const [filter, setFilter] = useState<'all' | 'tasks' | 'events'>('all');

  // Load stored iCal URL on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem('bibo_ical_url');
    if (savedUrl) {
      setIcalUrl(savedUrl);
      fetchExternalEvents(savedUrl);
    }
  }, []);

  // Fetch Tasks and Habits
  const loadPlatformData = useCallback(async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // 1. Fetch Tasks
      const { data: taskData } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id);

      if (taskData) setTasks(taskData);

      // 2. Fetch Habit Logs for month
      const { data: habitsData } = await supabase
        .from('habit_logs')
        .select('*, habits(name, color)')
        .eq('user_id', user.id);

      if (habitsData) setHabitLogs(habitsData);
    } catch (err) {
      console.error('Failed to load calendar data:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadPlatformData();
  }, [loadPlatformData]);

  // Fetch External iCal Events
  const fetchExternalEvents = async (url: string) => {
    if (!url.trim()) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/calendar/ics?url=${encodeURIComponent(url.trim())}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to fetch calendar feed');
      }
      const data = await res.json();
      setExternalEvents(data.events || []);
      localStorage.setItem('bibo_ical_url', url.trim());
    } catch (err: any) {
      console.error('iCal sync error:', err);
      setSyncError(err.message || 'Could not parse calendar feed');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveFeed = (e: React.FormEvent) => {
    e.preventDefault();
    fetchExternalEvents(icalUrl);
    setSyncModalOpen(false);
  };

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Month calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  // Create calendar grid cells
  const calendarCells = useMemo(() => {
    const cells: { dateStr: string; dayNumber: number; isCurrentMonth: boolean; isToday: boolean }[] = [];

    // Preceding month days
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const prevDate = new Date(year, month - 1, d);
      const dateStr = prevDate.toISOString().split('T')[0];
      cells.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    // Current month days
    const todayStr = new Date().toISOString().split('T')[0];
    for (let d = 1; d <= daysInMonth; d++) {
      const currentD = new Date(year, month, d);
      // Format YYYY-MM-DD in local time
      const yyyy = currentD.getFullYear();
      const mm = String(currentD.getMonth() + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      cells.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
      });
    }

    // Following month days to fill 35 or 42 cells
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d);
      const dateStr = nextDate.toISOString().split('T')[0];
      cells.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    return cells;
  }, [year, month, daysInMonth, firstDayIndex]);

  // Aggregate items by date (YYYY-MM-DD)
  const itemsByDate = useMemo(() => {
    const map = new Map<string, DayItem[]>();

    const addItem = (date: string, item: DayItem) => {
      const list = map.get(date) || [];
      list.push(item);
      map.set(date, list);
    };

    // 1. Tasks
    if (filter === 'all' || filter === 'tasks') {
      tasks.forEach((t) => {
        if (!t.due_date) return;
        const datePart = t.due_date.split('T')[0];
        addItem(datePart, {
          id: t.id,
          type: 'task',
          title: t.title,
          priority: t.priority,
          status: t.status,
          description: t.description || undefined,
        });
      });
    }

    // 2. External Events (Google/Samsung Calendar)
    if (filter === 'all' || filter === 'events') {
      externalEvents.forEach((ev) => {
        addItem(ev.start, {
          id: ev.id,
          type: 'external',
          title: ev.title,
          time: ev.startTime,
          location: ev.location,
          description: ev.description,
        });
      });
    }

    // 3. Habit logs
    habitLogs.forEach((hl) => {
      if (!hl.completed_at) return;
      const datePart = hl.completed_at.split('T')[0];
      addItem(datePart, {
        id: hl.id,
        type: 'habit',
        title: hl.habits?.name || 'Habit completed',
      });
    });

    return map;
  }, [tasks, externalEvents, habitLogs, filter]);

  // Quick-create task for a day
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !selectedDateStr) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: user.id,
          title: newTitle.trim(),
          priority: newPriority,
          status: 'todo',
          due_date: new Date(selectedDateStr).toISOString(),
        })
        .select()
        .single();

      if (!error && data) {
        setTasks((prev) => [...prev, data]);
        setCreateModalOpen(false);
        setNewTitle('');
      }
    } catch (err) {
      console.error('Error creating task from calendar:', err);
    }
  };

  // Toggle task status
  const handleToggleTask = async (taskId: string, currentStatus?: string) => {
    const nextStatus = currentStatus === 'done' ? 'todo' : 'done';
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus as any } : t))
    );

    await supabase
      .from('tasks')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', taskId);
  };

  const priorityColor = (priority?: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      case 'high':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'medium':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  return (
    <div className="text-zinc-100">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20">
            <CalendarIcon size={18} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">Smart Calendar</h1>
            <p className="text-[11px] sm:text-xs text-zinc-400">
              Tasks, Habits & Calendar Sync
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Navigation Controls */}
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
            <button
              onClick={prevMonth}
              className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
              title="Previous Month"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={goToToday}
              className="px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white transition"
            >
              Today
            </button>
            <button
              onClick={nextMonth}
              className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
              title="Next Month"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <span className="font-semibold text-xs sm:text-sm px-1.5 text-zinc-200">
            {monthNames[month]} {year}
          </span>

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
            <button
              onClick={() => setViewMode('month')}
              className={`rounded p-1.5 transition ${
                viewMode === 'month'
                  ? 'bg-zinc-800 text-blue-400'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Month Grid"
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`rounded p-1.5 transition ${
                viewMode === 'agenda'
                  ? 'bg-zinc-800 text-blue-400'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Agenda List"
            >
              <List size={16} />
            </button>
          </div>

          {/* Sync iCal Button */}
          <button
            onClick={() => setSyncModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800 transition"
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin text-purple-400' : ''} />
            <span className="hidden sm:inline">Sync</span>
          </button>

          {/* Quick Add */}
          <button
            onClick={() => {
              setSelectedDateStr(new Date().toISOString().split('T')[0]);
              setCreateModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition shadow-sm active:scale-95"
          >
            <Plus size={14} />
            <span>Add Task</span>
          </button>
        </div>
      </header>

      {/* Filter Tabs & Month Info */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 mb-4">
        <div className="flex items-center gap-1.5">
          {(['all', 'tasks', 'events'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                filter === mode
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="hidden sm:flex items-center gap-3 text-xs text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span>Tasks</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-purple-500" />
            <span>Calendar Feed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Habits</span>
          </div>
        </div>
      </div>

      {/* Main Calendar Area */}
      <main className="p-0 sm:p-2">
        {viewMode === 'month' ? (
          <div className="mx-auto max-w-7xl">
            {/* Days of week header */}
            <div className="grid grid-cols-7 gap-px border border-zinc-800 bg-zinc-800 rounded-t-xl overflow-hidden text-center text-xs font-semibold text-zinc-400">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="bg-zinc-900/90 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-px border-x border-b border-zinc-800 bg-zinc-800 rounded-b-xl overflow-hidden">
              {calendarCells.map((cell, idx) => {
                const items = itemsByDate.get(cell.dateStr) || [];
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setSelectedDateStr(cell.dateStr);
                      setCreateModalOpen(true);
                    }}
                    className={`group relative min-h-[110px] sm:min-h-[130px] p-1.5 sm:p-2 transition cursor-pointer flex flex-col ${
                      cell.isCurrentMonth
                        ? 'bg-zinc-950 hover:bg-zinc-900/70'
                        : 'bg-zinc-950/40 text-zinc-600'
                    }`}
                  >
                    {/* Date label */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                          cell.isToday
                            ? 'bg-blue-600 text-white font-bold'
                            : cell.isCurrentMonth
                            ? 'text-zinc-300'
                            : 'text-zinc-600'
                        }`}
                      >
                        {cell.dayNumber}
                      </span>
                      {items.length > 0 && (
                        <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 sm:hidden">
                          {items.length}
                        </span>
                      )}
                    </div>

                    {/* Day items */}
                    <div className="flex-1 space-y-1 overflow-y-auto max-h-[85px] scrollbar-none">
                      {items.map((item) => {
                        if (item.type === 'task') {
                          const isDone = item.status === 'done';
                          return (
                            <div
                              key={item.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleTask(item.id, item.status);
                              }}
                              className={`flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-medium leading-tight transition ${priorityColor(
                                item.priority
                              )} ${isDone ? 'opacity-40 line-through' : ''}`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                  isDone ? 'bg-zinc-500' : 'bg-blue-400'
                                }`}
                              />
                              <span className="truncate">{item.title}</span>
                            </div>
                          );
                        }

                        if (item.type === 'external') {
                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-1 rounded border border-purple-500/30 bg-purple-500/15 px-1.5 py-0.5 text-[11px] font-medium text-purple-200"
                              title={`${item.title} ${item.time ? `(${item.time})` : ''}`}
                            >
                              <Clock size={10} className="text-purple-400 shrink-0" />
                              <span className="truncate">
                                {item.time && <span className="opacity-75 mr-1">{item.time}</span>}
                                {item.title}
                              </span>
                            </div>
                          );
                        }

                        if (item.type === 'habit') {
                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300"
                            >
                              <CheckCircle2 size={10} className="text-emerald-400 shrink-0" />
                              <span className="truncate">{item.title}</span>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Agenda / List View */
          <div className="mx-auto max-w-3xl space-y-4">
            {calendarCells
              .filter((cell) => cell.isCurrentMonth)
              .map((cell) => {
                const items = itemsByDate.get(cell.dateStr) || [];
                if (items.length === 0) return null;

                return (
                  <div
                    key={cell.dateStr}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                      <span className="text-sm font-semibold text-zinc-200">
                        {cell.dateStr}
                      </span>
                      {cell.isToday && (
                        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
                          TODAY
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-lg bg-zinc-950/70 p-2.5 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            {item.type === 'task' ? (
                              <input
                                type="checkbox"
                                checked={item.status === 'done'}
                                onChange={() => handleToggleTask(item.id, item.status)}
                                className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-0"
                              />
                            ) : item.type === 'external' ? (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20 text-purple-400">
                                <Clock size={12} />
                              </div>
                            ) : (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                                <CheckCircle2 size={12} />
                              </div>
                            )}
                            <div>
                              <p
                                className={`font-medium ${
                                  item.status === 'done'
                                    ? 'line-through text-zinc-500'
                                    : 'text-zinc-200'
                                }`}
                              >
                                {item.title}
                              </p>
                              {item.time && (
                                <p className="text-[10px] text-zinc-500">{item.time}</p>
                              )}
                            </div>
                          </div>

                          {item.priority && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] uppercase font-semibold ${priorityColor(
                                item.priority
                              )}`}
                            >
                              {item.priority}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </main>

      {/* Sync Calendar Modal */}
      {syncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
                  <LinkIcon size={18} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Sync External Calendar</h3>
                  <p className="text-xs text-zinc-400">Google Calendar, Samsung Calendar, Outlook</p>
                </div>
              </div>
              <button
                onClick={() => setSyncModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveFeed} className="mt-4 space-y-4">
              {syncError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                  {syncError}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                  iCal (.ics) Feed URL:
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                  value={icalUrl}
                  onChange={(e) => setIcalUrl(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-purple-500"
                />
              </div>

              {/* Instructions Accordion */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400 space-y-2">
                <div className="flex items-center gap-1.5 text-zinc-200 font-medium">
                  <HelpCircle size={14} className="text-purple-400" />
                  <span>How to get your Calendar iCal link:</span>
                </div>
                <p>
                  <strong>Google Calendar:</strong> Open Google Calendar Settings &gt; select your
                  calendar &gt; scroll down to <em>&quot;Integrate calendar&quot;</em> &gt; copy{' '}
                  <em>&quot;Secret address in iCal format&quot;</em>.
                </p>
                <p>
                  <strong>Samsung Calendar:</strong> Samsung Calendar syncs automatically with your
                  Google account, so pasting your Google Calendar iCal link above will sync all your
                  Samsung Calendar events!
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSyncModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={syncing || !icalUrl.trim()}
                  className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-medium text-white hover:bg-purple-500 transition disabled:opacity-50"
                >
                  {syncing ? 'Connecting...' : 'Save & Sync Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Task Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-base font-semibold text-white">
                Add Task for {selectedDateStr}
              </h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Task Title:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Doctor appointment, Submit tax report"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1">Priority:</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewPriority(p)}
                      className={`rounded-lg py-1.5 text-xs font-medium capitalize border transition ${
                        newPriority === p
                          ? priorityColor(p)
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 transition disabled:opacity-50"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
