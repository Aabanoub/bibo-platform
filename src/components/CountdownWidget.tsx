'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock,
  Plus,
  Edit2,
  Bell,
  Sparkles,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  List,
  AlertCircle,
  Flame,
  Cloud,
  CloudOff,
  RefreshCw,
} from 'lucide-react';
import CountdownModal, { REMINDER_OPTIONS } from '@/components/CountdownModal';
import { sendLocalNotification, createInAppNotification } from '@/lib/notifications';
import { createClient } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import type { CountdownEvent, ReminderIntervalId } from '@/types';

const STORAGE_KEY = 'bibo_countdown_events';
const ACTIVE_ID_KEY = 'bibo_active_countdown_id';

const COLOR_CLASSES: Record<
  CountdownEvent['color'],
  { border: string; bg: string; text: string; gradient: string; glow: string; bar: string }
> = {
  blue: {
    border: 'border-blue-500/30',
    bg: 'bg-blue-950/20',
    text: 'text-blue-400',
    gradient: 'from-blue-600 to-cyan-500',
    glow: 'shadow-blue-500/15',
    bar: 'from-blue-500 via-cyan-400 to-blue-400',
  },
  purple: {
    border: 'border-purple-500/30',
    bg: 'bg-purple-950/20',
    text: 'text-purple-400',
    gradient: 'from-purple-600 to-indigo-500',
    glow: 'shadow-purple-500/15',
    bar: 'from-purple-500 via-indigo-400 to-purple-400',
  },
  pink: {
    border: 'border-pink-500/30',
    bg: 'bg-pink-950/20',
    text: 'text-pink-400',
    gradient: 'from-pink-600 to-rose-500',
    glow: 'shadow-pink-500/15',
    bar: 'from-pink-500 via-rose-400 to-pink-400',
  },
  emerald: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-950/20',
    text: 'text-emerald-400',
    gradient: 'from-emerald-600 to-teal-500',
    glow: 'shadow-emerald-500/15',
    bar: 'from-emerald-500 via-teal-400 to-emerald-400',
  },
  amber: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-950/20',
    text: 'text-amber-400',
    gradient: 'from-amber-600 to-yellow-500',
    glow: 'shadow-amber-500/15',
    bar: 'from-amber-500 via-yellow-400 to-amber-400',
  },
  rose: {
    border: 'border-rose-500/30',
    bg: 'bg-rose-950/20',
    text: 'text-rose-400',
    gradient: 'from-rose-600 to-red-500',
    glow: 'shadow-rose-500/15',
    bar: 'from-rose-500 via-red-400 to-rose-400',
  },
  cyan: {
    border: 'border-cyan-500/30',
    bg: 'bg-cyan-950/20',
    text: 'text-cyan-400',
    gradient: 'from-cyan-600 to-blue-500',
    glow: 'shadow-cyan-500/15',
    bar: 'from-cyan-500 via-blue-400 to-cyan-400',
  },
};

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPassed: boolean;
  progress: number; // 0 to 100
}

export default function CountdownWidget() {
  const supabase = createClient();
  const { isGirly } = useTheme();

  const [events, setEvents] = useState<CountdownEvent[]>([]);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CountdownEvent | null>(null);
  const [showEventList, setShowEventList] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // Live countdown state for active event
  const [time, setTime] = useState<TimeRemaining>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isPassed: false,
    progress: 0,
  });

  // 1. Initial Load & Bidirectional Sync with Supabase
  const loadData = useCallback(async () => {
    setIsSyncing(true);
    setDbError(null);
    let localEvents: CountdownEvent[] = [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        localEvents = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[CountdownWidget] Could not read local countdowns:', e);
    }

    // Set local state immediately for instant rendering
    if (localEvents.length > 0) {
      setEvents(localEvents);
    }

    // Check current authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let finalEvents = localEvents;

    if (user) {
      setCurrentUser(user);
      try {
        const { data: dbEvents, error } = await supabase
          .from('countdown_events')
          .select('*')
          .eq('user_id', user.id)
          .order('target_date', { ascending: true });

        if (error) {
          console.warn('[CountdownWidget] Supabase countdown_events error:', error.message);
          setDbError(error.message);
        } else if (dbEvents) {
          let merged = [...(dbEvents as CountdownEvent[])];

          // Check if local cache has any events not yet pushed to Supabase (created offline or before migration)
          const unsynced = localEvents.filter(
            (le) => !merged.some((de) => de.id === le.id)
          );

          if (unsynced.length > 0) {
            console.log(`[CountdownWidget] Auto-syncing ${unsynced.length} unsynced local countdown(s) to cloud database...`);
            for (const item of unsynced) {
              await supabase.from('countdown_events').upsert({
                id: item.id,
                user_id: user.id,
                title: item.title,
                description: item.description || null,
                target_date: item.target_date,
                category: item.category || 'event',
                emoji: item.emoji || '⏳',
                color: item.color || 'blue',
                is_pinned: !!item.is_pinned,
                reminder_intervals: item.reminder_intervals || ['at_time', '1h', '1d'],
                triggered_reminders: item.triggered_reminders || [],
              });
              merged.push(item);
            }
          }

          finalEvents = merged;
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(finalEvents));
          } catch {}
          setDbError(null);
        }
      } catch (err: any) {
        console.warn('[CountdownWidget] Database sync failed:', err);
      }
    }

    setEvents(finalEvents);

    // Determine active event
    const storedActiveId = localStorage.getItem(ACTIVE_ID_KEY);
    if (storedActiveId && finalEvents.some((e) => e.id === storedActiveId)) {
      setActiveEventId(storedActiveId);
    } else {
      const pinned = finalEvents.find((e) => e.is_pinned);
      setActiveEventId(pinned ? pinned.id : finalEvents[0]?.id || null);
    }
    setIsSyncing(false);
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime subscription for live sync across devices and browser tabs
  useEffect(() => {
    const channel = supabase
      .channel('countdown_events_realtime_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'countdown_events' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadData]);

  const activeEvent = events.find((e) => e.id === activeEventId) || events[0] || null;

  // 2. High-precision 1-second countdown ticker
  useEffect(() => {
    if (!activeEvent) return;

    function calculate() {
      if (!activeEvent) return;
      const now = Date.now();
      const target = new Date(activeEvent.target_date).getTime();
      const created = new Date(activeEvent.created_at).getTime();

      const diff = target - now;

      if (diff <= 0) {
        // Event arrived or passed
        const passedMs = Math.abs(diff);
        setTime({
          days: Math.floor(passedMs / (1000 * 60 * 60 * 24)),
          hours: Math.floor((passedMs / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((passedMs / (1000 * 60)) % 60),
          seconds: Math.floor((passedMs / 1000) % 60),
          isPassed: true,
          progress: 100,
        });
        return;
      }

      const totalSpan = Math.max(1, target - created);
      const elapsed = Math.max(0, now - created);
      const progress = Math.min(100, Math.max(0, (elapsed / totalSpan) * 100));

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTime({
        days,
        hours,
        minutes,
        seconds,
        isPassed: false,
        progress,
      });
    }

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [activeEvent]);

  // 3. Automated Reminder Trigger & Push Notification Dispatcher
  // Runs every 15 seconds to evaluate all events for configured reminder intervals
  useEffect(() => {
    if (events.length === 0) return;

    async function checkReminders() {
      const now = Date.now();
      let hasUpdates = false;

      const updatedEvents = await Promise.all(
        events.map(async (ev) => {
          const targetTime = new Date(ev.target_date).getTime();
          const triggered = new Set(ev.triggered_reminders || []);

          for (const intervalId of ev.reminder_intervals || []) {
            if (triggered.has(intervalId)) continue;

            const opt = REMINDER_OPTIONS.find((o) => o.id === intervalId);
            if (!opt) continue;

            const reminderTime = targetTime - opt.minutes * 60 * 1000;

            // Trigger when now is at or past reminderTime, up to 1 hour past event
            if (now >= reminderTime && now <= targetTime + 60 * 60 * 1000) {
              triggered.add(intervalId);
              hasUpdates = true;

              // Format notification message
              const timeLabel = opt.minutes === 0 ? 'is happening NOW' : `is in ${opt.label.replace(' before', '')}`;
              const notifTitle = `⏰ ${ev.emoji} ${ev.title}`;
              const notifMsg = `Reminder: "${ev.title}" ${timeLabel}! Target: ${new Date(
                ev.target_date
              ).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;

              // 1. Send native browser local push
              try {
                await sendLocalNotification(notifTitle, notifMsg);
              } catch (err) {
                console.warn('Local push failed:', err);
              }

              // 2. If logged in, create in-app notification row (rings bell) and trigger server push
              if (currentUser?.id) {
                try {
                  await createInAppNotification(currentUser.id, notifTitle, notifMsg, 'reminder', '/');
                  // Trigger backend webpush to other registered devices
                  fetch('/api/notifications', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      userId: currentUser.id,
                      title: notifTitle,
                      message: notifMsg,
                      actionUrl: '/',
                    }),
                  }).catch(() => {});
                } catch (e) {
                  console.warn('In-app notification error:', e);
                }
              }
            }
          }

          if (triggered.size !== (ev.triggered_reminders?.length || 0)) {
            return { ...ev, triggered_reminders: Array.from(triggered) };
          }
          return ev;
        })
      );

      if (hasUpdates) {
        setEvents(updatedEvents);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedEvents));

        // Sync to Supabase if available
        if (currentUser?.id) {
          try {
            for (const ev of updatedEvents) {
              await supabase
                .from('countdown_events')
                .update({ triggered_reminders: ev.triggered_reminders })
                .eq('id', ev.id);
            }
          } catch {}
        }
      }
    }

    checkReminders();
    const interval = setInterval(checkReminders, 15000);
    return () => clearInterval(interval);
  }, [events, currentUser]);

  // 4. Persistence Handlers (Create / Update / Delete)
  const saveEvents = async (newEvents: CountdownEvent[]) => {
    setEvents(newEvents);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newEvents));
    } catch {}
  };

  const handleSaveEvent = async (
    data: Omit<CountdownEvent, 'id' | 'created_at'>,
    existingId?: string
  ) => {
    // Ensure we have current authenticated user
    let user = currentUser;
    if (!user) {
      const { data: authData } = await supabase.auth.getUser();
      user = authData?.user || null;
      if (user) setCurrentUser(user);
    }

    let updatedList: CountdownEvent[] = [];

    if (existingId) {
      // Update existing
      updatedList = events.map((e) =>
        e.id === existingId
          ? {
              ...e,
              ...data,
              updated_at: new Date().toISOString(),
            }
          : data.is_pinned
          ? { ...e, is_pinned: false }
          : e
      );

      if (data.is_pinned) {
        setActiveEventId(existingId);
        try {
          localStorage.setItem(ACTIVE_ID_KEY, existingId);
        } catch {}
      }

      // Supabase update
      if (user?.id) {
        try {
          if (data.is_pinned) {
            await supabase
              .from('countdown_events')
              .update({ is_pinned: false })
              .eq('user_id', user.id);
          }

          const { error: updateErr } = await supabase
            .from('countdown_events')
            .update({
              title: data.title,
              description: data.description || null,
              target_date: data.target_date,
              category: data.category,
              emoji: data.emoji,
              color: data.color,
              is_pinned: !!data.is_pinned,
              reminder_intervals: data.reminder_intervals,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingId)
            .eq('user_id', user.id);

          if (updateErr) {
            console.error('[CountdownWidget] Error updating countdown in Supabase:', updateErr.message);
            setDbError(updateErr.message);
          } else {
            console.log('[CountdownWidget] Updated countdown event in Supabase successfully.');
            setDbError(null);
          }
        } catch (err: any) {
          console.error('[CountdownWidget] Supabase update failed:', err);
        }
      }
    } else {
      // Create new event
      const newId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `cd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const newEvent: CountdownEvent = {
        ...data,
        id: newId,
        user_id: user?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      updatedList = data.is_pinned
        ? [newEvent, ...events.map((e) => ({ ...e, is_pinned: false }))]
        : [newEvent, ...events];

      setActiveEventId(newEvent.id);
      try {
        localStorage.setItem(ACTIVE_ID_KEY, newEvent.id);
      } catch {}

      // Supabase insert
      if (user?.id) {
        try {
          // Ensure profile row exists for foreign key constraint
          try {
            await supabase.from('profiles').upsert(
              {
                id: user.id,
                full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
              },
              { onConflict: 'id' }
            );
          } catch {}

          if (data.is_pinned) {
            await supabase
              .from('countdown_events')
              .update({ is_pinned: false })
              .eq('user_id', user.id);
          }

          const { error: insertErr } = await supabase.from('countdown_events').insert({
            id: newEvent.id,
            user_id: user.id,
            title: newEvent.title,
            description: newEvent.description || null,
            target_date: newEvent.target_date,
            category: newEvent.category,
            emoji: newEvent.emoji,
            color: newEvent.color,
            is_pinned: !!newEvent.is_pinned,
            reminder_intervals: newEvent.reminder_intervals,
            triggered_reminders: [],
          });

          if (insertErr) {
            console.error('[CountdownWidget] Error inserting countdown to Supabase:', insertErr.message);
            setDbError(insertErr.message);
          } else {
            console.log('[CountdownWidget] Inserted countdown event to Supabase successfully:', newEvent.id);
            setDbError(null);
          }
        } catch (err: any) {
          console.error('[CountdownWidget] Supabase insert failed:', err);
        }
      }
    }

    saveEvents(updatedList);
  };

  const handleDeleteEvent = async (id: string) => {
    let user = currentUser;
    if (!user) {
      const { data: authData } = await supabase.auth.getUser();
      user = authData?.user || null;
      if (user) setCurrentUser(user);
    }

    const updated = events.filter((e) => e.id !== id);
    saveEvents(updated);

    if (activeEventId === id) {
      const nextActive = updated[0]?.id || null;
      setActiveEventId(nextActive);
      try {
        if (nextActive) localStorage.setItem(ACTIVE_ID_KEY, nextActive);
        else localStorage.removeItem(ACTIVE_ID_KEY);
      } catch {}
    }

    if (user?.id) {
      try {
        const { error: delErr } = await supabase
          .from('countdown_events')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id);

        if (delErr) {
          console.error('[CountdownWidget] Error deleting countdown from Supabase:', delErr.message);
        } else {
          console.log('[CountdownWidget] Deleted countdown event from Supabase successfully:', id);
        }
      } catch (err: any) {
        console.error('[CountdownWidget] Supabase delete failed:', err);
      }
    }
  };

  const handleSelectActive = (id: string) => {
    setActiveEventId(id);
    localStorage.setItem(ACTIVE_ID_KEY, id);
    setShowEventList(false);
  };

  const colorStyle = activeEvent ? COLOR_CLASSES[activeEvent.color] || COLOR_CLASSES.blue : COLOR_CLASSES.blue;

  // Format target date for display
  const targetFormatted = activeEvent
    ? new Date(activeEvent.target_date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

  // ── Render: Empty State ───────────────────────────────────────────────────
  if (!activeEvent) {
    return (
      <>
        <section className="relative overflow-hidden rounded-2xl border border-dashed border-slate-700/80 bg-slate-900/60 p-6 sm:p-7 backdrop-blur-md transition-all hover:border-slate-600">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/20">
                <Clock size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">Anchored Countdown & Push Reminders</h3>
                  <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
                    New
                  </span>
                </div>
                <p className="mt-1 text-xs sm:text-sm text-slate-400 max-w-xl leading-relaxed">
                  Anchor a live ticking countdown timer to the top of your dashboard. Set custom deadlines,
                  exams, project launches, or personal milestones, and configure automated push reminders.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setEditingEvent(null);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition active:scale-95 shrink-0"
            >
              <Plus size={16} />
              <span>Create Countdown</span>
            </button>
          </div>

          {/* Database sync note if error */}
          {dbError && (
            <div className="mt-4 flex items-center justify-between gap-2 p-2.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-amber-300 text-xs">
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0 text-amber-400" />
                <span>
                  Supabase database sync: <strong>countdown_events</strong> table not found. Countdowns are stored in local storage until Section 9 of <code>supabase/schema.sql</code> is executed in your Supabase SQL Editor.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDbError(null)}
                className="text-amber-400 hover:text-white px-2 py-0.5 rounded text-[10px]"
              >
                Dismiss
              </button>
            </div>
          )}
        </section>

        <CountdownModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveEvent}
        />
      </>
    );
  }

  // ── Render: Active Countdown Hero Card ────────────────────────────────────
  return (
    <>
      <section
        className={`relative overflow-hidden rounded-2xl border ${
          isGirly ? 'border-pink-500/30 bg-pink-950/20 shadow-pink-500/10' : `${colorStyle.border} ${colorStyle.bg} ${colorStyle.glow}`
        } p-5 sm:p-6 backdrop-blur-md shadow-xl transition-all duration-300`}
      >
        {/* Background glow decoration */}
        <div
          className={`absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br ${
            isGirly ? 'from-pink-500/15' : colorStyle.gradient
          } opacity-15 blur-3xl pointer-events-none`}
        />

        {/* Top Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4">
          {/* Left: Emoji, Title, Category */}
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl text-2xl shadow-md border ${
                isGirly
                  ? 'border-pink-500/40 bg-pink-900/40 ring-2 ring-pink-500/20'
                  : `${colorStyle.border} bg-slate-800/80 ring-2 ring-blue-500/20`
              }`}
            >
              {activeEvent.emoji}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-white truncate tracking-tight">
                  {activeEvent.title}
                </h2>
                <span
                  className={`capitalize px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    isGirly
                      ? 'border-pink-500/30 bg-pink-500/15 text-pink-300'
                      : `${colorStyle.border} ${colorStyle.bg} ${colorStyle.text}`
                  }`}
                >
                  {activeEvent.category}
                </span>
                {time.isPassed && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                    <CheckCircle2 size={11} /> Milestone Reached!
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Calendar size={12} className="text-slate-500" />
                <span>{targetFormatted}</span>
                {activeEvent.reminder_intervals && activeEvent.reminder_intervals.length > 0 && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-amber-400/90 ml-2">
                    <Bell size={11} />
                    <span>{activeEvent.reminder_intervals.length} Push Reminders</span>
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Right: Controls & Actions */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Cloud Sync Status / Refresh button */}
            <button
              type="button"
              onClick={() => loadData()}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-medium transition ${
                dbError
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : currentUser
                  ? 'border-slate-700/80 bg-slate-800/70 hover:bg-slate-700 text-slate-300'
                  : 'border-slate-800 bg-slate-900/50 text-slate-500'
              }`}
              title={
                dbError
                  ? `Supabase sync error: ${dbError}. Run section 9 in schema.sql.`
                  : currentUser
                  ? 'Click to sync with Supabase cloud database'
                  : 'Sign in to sync countdowns to cloud database'
              }
            >
              <RefreshCw size={12} className={isSyncing ? 'animate-spin text-blue-400' : 'text-slate-400'} />
              <span className="hidden sm:inline">
                {isSyncing ? 'Syncing...' : dbError ? 'DB Pending' : currentUser ? 'Cloud Synced' : 'Local Cache'}
              </span>
            </button>
            {/* Multiple events selector */}
            {events.length > 1 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEventList(!showEventList)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700/80 bg-slate-800/70 hover:bg-slate-700/80 text-xs font-medium text-slate-300 transition"
                  title="Switch Active Countdown"
                >
                  <List size={13} />
                  <span>
                    {events.findIndex((e) => e.id === activeEvent.id) + 1} of {events.length}
                  </span>
                  <ChevronDown size={13} className={showEventList ? 'rotate-180 transition' : 'transition'} />
                </button>

                {/* Dropdown list of events */}
                {showEventList && (
                  <div className="absolute right-0 mt-1 w-64 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-1.5 z-40 animate-fade-in">
                    <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Your Countdowns
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {events.map((ev) => (
                        <button
                          key={ev.id}
                          onClick={() => handleSelectActive(ev.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition text-left ${
                            ev.id === activeEvent.id
                              ? isGirly
                                ? 'bg-pink-500/20 text-pink-300 font-bold'
                                : 'bg-blue-600/20 text-blue-300 font-bold'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="truncate flex items-center gap-1.5">
                            <span>{ev.emoji}</span>
                            <span className="truncate">{ev.title}</span>
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(ev.target_date).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Edit Event Button */}
            <button
              type="button"
              onClick={() => {
                setEditingEvent(activeEvent);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-700/80 bg-slate-800/70 hover:bg-slate-700/80 text-xs font-medium text-slate-300 transition"
              title="Edit Event & Reminder Intervals"
            >
              <Edit2 size={13} />
              <span className="hidden sm:inline">Edit</span>
            </button>

            {/* Add New Event Button */}
            <button
              type="button"
              onClick={() => {
                setEditingEvent(null);
                setIsModalOpen(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition active:scale-95 shadow-md ${
                isGirly
                  ? 'bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 shadow-pink-500/20'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 shadow-blue-500/20'
              }`}
            >
              <Plus size={14} />
              <span>New</span>
            </button>
          </div>
        </div>

        {/* Database sync note if error */}
        {dbError && (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-amber-500/30 bg-amber-950/30 text-amber-300 text-xs mb-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-amber-400" />
              <span>
                Database sync note: <strong>countdown_events</strong> ({dbError}). Countdowns are cached in local storage. Execute Section 9 of <code>supabase/schema.sql</code> in your Supabase SQL editor to enable cloud syncing.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDbError(null)}
              className="text-amber-400 hover:text-white px-2 py-0.5 rounded text-[10px]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── DIGITAL COUNTDOWN FLIPPER CARDS ───────────────────────────── */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 my-2">
          {/* Days */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-900/80 p-2.5 sm:p-4 shadow-inner">
            <span
              className={`font-mono text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight ${
                isGirly ? 'text-pink-400' : colorStyle.text
              }`}
            >
              {String(time.days).padStart(2, '0')}
            </span>
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mt-1">
              Days
            </span>
          </div>

          {/* Hours */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-900/80 p-2.5 sm:p-4 shadow-inner">
            <span
              className={`font-mono text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight ${
                isGirly ? 'text-pink-400' : colorStyle.text
              }`}
            >
              {String(time.hours).padStart(2, '0')}
            </span>
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mt-1">
              Hours
            </span>
          </div>

          {/* Minutes */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-900/80 p-2.5 sm:p-4 shadow-inner">
            <span
              className={`font-mono text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight ${
                isGirly ? 'text-pink-400' : colorStyle.text
              }`}
            >
              {String(time.minutes).padStart(2, '0')}
            </span>
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mt-1">
              Minutes
            </span>
          </div>

          {/* Seconds */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-900/80 p-2.5 sm:p-4 shadow-inner">
            <span
              className={`font-mono text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight ${
                isGirly ? 'text-pink-400' : colorStyle.text
              } animate-pulse`}
            >
              {String(time.seconds).padStart(2, '0')}
            </span>
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mt-1">
              Seconds
            </span>
          </div>
        </div>

        {/* ── PROGRESS BAR TOWARDS TARGET ───────────────────────────────── */}
        <div className="mt-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1 font-medium">
              <Flame size={12} className={isGirly ? 'text-pink-400' : 'text-blue-400'} />
              <span>Time Elapsed to Target</span>
            </span>
            <span className="font-semibold text-slate-300">{Math.round(time.progress)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800 border border-slate-700/50">
            <div
              className={`h-full bg-gradient-to-r transition-all duration-500 ease-out ${
                isGirly ? 'from-pink-500 via-rose-400 to-pink-400' : colorStyle.bar
              }`}
              style={{ width: `${time.progress}%` }}
            />
          </div>
        </div>

        {/* Description or Notes (if available) */}
        {activeEvent.description && (
          <p className="mt-3 text-xs text-slate-400 bg-slate-900/50 border border-slate-800/60 rounded-xl px-3 py-2 leading-relaxed">
            {activeEvent.description}
          </p>
        )}
      </section>

      {/* Modal for Creating or Editing */}
      <CountdownModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        initialEvent={editingEvent}
      />
    </>
  );
}
