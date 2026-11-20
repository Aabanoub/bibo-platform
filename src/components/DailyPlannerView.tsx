'use client';

import React, { useState, useEffect, useRef } from 'react';
import type {
  Task,
  TaskFolder,
  DailyScheduleItem,
  DayWorkloadOverview,
  TaskDifficulty,
  TaskPriority,
} from '@/types';
import {
  generateDeterministicDailyPlan,
  SchedulingPreferences,
  DEFAULT_PREFERENCES,
  timeToMinutes,
  minutesToTime,
} from '@/lib/daily-planner';
import {
  adaptWhenSessionOverruns,
} from '@/lib/adaptive-scheduler';
import {
  Sparkles,
  Calendar,
  Clock,
  Play,
  Pause,
  CheckCircle2,
  Circle,
  Lock,
  Unlock,
  Coffee,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Sliders,
  ChevronRight,
  ChevronLeft,
  X,
  Check,
  Zap,
  Info,
  Loader2,
} from 'lucide-react';
import { FOLDER_COLORS } from './TaskFolderModal';

interface DailyPlannerViewProps {
  tasks: Task[];
  folders: TaskFolder[];
  scheduleItems: DailyScheduleItem[];
  currentDate: string; // YYYY-MM-DD
  onDateChange: (date: string) => void;
  onSaveSchedule: (items: DailyScheduleItem[]) => Promise<void>;
  onCompleteTask: (taskId: string, completed: boolean) => Promise<void>;
  userPreferences?: Partial<SchedulingPreferences>;
  onSavePreferences?: (prefs: SchedulingPreferences) => Promise<void>;
}

export default function DailyPlannerView({
  tasks,
  folders,
  scheduleItems,
  currentDate,
  onDateChange,
  onSaveSchedule,
  onCompleteTask,
  userPreferences,
  onSavePreferences,
}: DailyPlannerViewProps) {
  const [preferences, setPreferences] = useState<SchedulingPreferences>({
    ...DEFAULT_PREFERENCES,
    ...userPreferences,
  });

  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [activeTimerSessionId, setActiveTimerSessionId] = useState<string | null>(null);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerTotalDuration, setTimerTotalDuration] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [overloadNotice, setOverloadNotice] = useState<string | null>(null);
  const [deferredList, setDeferredList] = useState<{ task: Task; reason: string }[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync preferences if userPreferences prop changes
  useEffect(() => {
    if (userPreferences) {
      setPreferences((prev) => ({ ...prev, ...userPreferences }));
    }
  }, [userPreferences]);

  // Clean timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Timer Tick handler
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimerSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setTimerRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning]);

  // Folders lookup map
  const foldersMap = new Map(folders.map((f) => [f.id, f]));

  // Calculate Overview Stats for currentDate
  const currentDaySessions = scheduleItems.filter((s) => s.date === currentDate);
  const taskSessions = currentDaySessions.filter((s) => s.session_type === 'task');
  const totalTasks = taskSessions.length;
  const completedTasks = taskSessions.filter((s) => s.is_completed).length;
  const remainingTasks = totalTasks - completedTasks;
  const totalPlannedMinutes = taskSessions.reduce((sum, s) => sum + s.duration_minutes, 0);

  const windowMinutes = Math.max(
    60,
    timeToMinutes(preferences.endTime) - timeToMinutes(preferences.startTime)
  );

  let workloadStatus: 'light' | 'balanced' | 'heavy' | 'overloaded' = 'balanced';
  if (totalPlannedMinutes > windowMinutes * 0.95 || deferredList.length > 0) {
    workloadStatus = 'overloaded';
  } else if (totalPlannedMinutes > windowMinutes * 0.75) {
    workloadStatus = 'heavy';
  } else if (totalPlannedMinutes < windowMinutes * 0.4) {
    workloadStatus = 'light';
  }

  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------

  // Generate / Regenerate AI Plan for this day
  const handleGeneratePlan = async () => {
    setIsSaving(true);
    try {
      const plan = generateDeterministicDailyPlan({
        tasks,
        folders,
        existingSessions: currentDaySessions,
        targetDate: currentDate,
        preferences,
      });

      setOverloadNotice(plan.overloadNotice || null);
      setDeferredList(plan.overview.deferredTasks);

      await onSaveSchedule(plan.sessions);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle session locked state (protects from auto-rescheduling)
  const handleToggleLock = async (sessionId: string) => {
    const updated = currentDaySessions.map((s) =>
      s.id === sessionId ? { ...s, is_locked: !s.is_locked } : s
    );
    await onSaveSchedule(updated);
  };

  // Toggle complete session & linked task
  const handleToggleComplete = async (session: DailyScheduleItem) => {
    const nextCompleted = !session.is_completed;
    const updated = currentDaySessions.map((s) =>
      s.id === session.id
        ? {
            ...s,
            is_completed: nextCompleted,
            actual_duration_minutes:
              session.actual_duration_minutes > 0
                ? session.actual_duration_minutes
                : session.duration_minutes,
          }
        : s
    );

    await onSaveSchedule(updated);

    if (session.task_id) {
      await onCompleteTask(session.task_id, nextCompleted);
    }
  };

  // Start live study session timer
  const handleStartTimer = (session: DailyScheduleItem) => {
    if (activeTimerSessionId === session.id && timerRunning) {
      setTimerRunning(false);
      return;
    }

    setActiveTimerSessionId(session.id);
    const initialSeconds = session.duration_minutes * 60;
    setTimerTotalDuration(initialSeconds);
    setTimerSecondsLeft(initialSeconds);
    setTimerRunning(true);
  };

  // Finish study timer early or on time and log actual duration
  const handleFinishTimer = async (session: DailyScheduleItem) => {
    const secondsSpent = timerTotalDuration - timerSecondsLeft;
    const actualMinutes = Math.max(1, Math.round(secondsSpent / 60));

    setTimerRunning(false);
    setActiveTimerSessionId(null);

    // If session overran, adapt subsequent unlocked sessions
    if (actualMinutes > session.duration_minutes) {
      const adapted = adaptWhenSessionOverruns(
        currentDaySessions,
        session.id,
        actualMinutes,
        preferences.endTime
      );
      await onSaveSchedule(adapted.updatedSessions);
    } else {
      const updated = currentDaySessions.map((s) =>
        s.id === session.id
          ? {
              ...s,
              is_completed: true,
              actual_duration_minutes: actualMinutes,
            }
          : s
      );
      await onSaveSchedule(updated);
    }

    if (session.task_id) {
      await onCompleteTask(session.task_id, true);
    }
  };

  // Remove a session from the daily schedule (NEVER deletes the underlying task!)
  const handleRemoveSession = async (sessionId: string) => {
    const filtered = currentDaySessions.filter((s) => s.id !== sessionId);
    await onSaveSchedule(filtered);
  };

  // Move task to tomorrow
  const handleMoveToTomorrow = async (session: DailyScheduleItem) => {
    const tomorrow = new Date(currentDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Remove from today, and add to tomorrow
    const remainingToday = currentDaySessions.filter((s) => s.id !== sessionIdSafe(session.id));
    const movedSession: DailyScheduleItem = {
      ...session,
      id: `sched-${session.task_id || 'custom'}-${Date.now()}`,
      date: tomorrowStr,
      is_completed: false,
      start_time: preferences.startTime,
      end_time: minutesToTime(timeToMinutes(preferences.startTime) + session.duration_minutes),
    };

    await onSaveSchedule([...remainingToday, movedSession]);
  };

  const sessionIdSafe = (id: string) => id;

  // Navigate Days
  const handleStepDay = (step: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + step);
    onDateChange(d.toISOString().split('T')[0]);
  };

  const isToday = currentDate === new Date().toISOString().split('T')[0];
  const formattedHeaderDate = new Date(currentDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* ── TOP ACTION BAR & DATE PICKER ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg">
        {/* Date Selector with step buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleStepDay(-1)}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Previous Day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-sm sm:text-base text-white">
              {formattedHeaderDate}
            </span>
            {isToday && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Today
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleStepDay(1)}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Next Day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Schedule Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsPreferencesOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Configure working hours & breaks"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Preferences</span>
          </button>

          <button
            type="button"
            onClick={handleGeneratePlan}
            disabled={isSaving}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white text-xs font-bold shadow-md shadow-blue-500/20 hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Optimizing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                <span>{currentDaySessions.length > 0 ? 'Regenerate Plan' : 'Generate Daily Plan'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── DAILY OVERVIEW KPI CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Planned Study Time */}
        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/90 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Planned Time</span>
            <Clock className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="mt-2">
            <span className="text-xl sm:text-2xl font-extrabold text-white font-mono">
              {(totalPlannedMinutes / 60).toFixed(1)}
            </span>
            <span className="text-xs text-slate-400 font-mono ml-1">hrs</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Window: {preferences.startTime} – {preferences.endTime}
          </p>
        </div>

        {/* Total Tasks vs Completed */}
        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/90 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Tasks Today</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-2">
            <span className="text-xl sm:text-2xl font-extrabold text-white font-mono">
              {completedTasks}/{totalTasks}
            </span>
            <span className="text-xs text-slate-400 ml-1">done</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {remainingTasks} session{remainingTasks === 1 ? '' : 's'} remaining
          </p>
        </div>

        {/* Workload Status */}
        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/90 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Workload Health</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={`text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded-lg border ${
                workloadStatus === 'overloaded'
                  ? 'bg-red-500/20 text-red-300 border-red-500/30'
                  : workloadStatus === 'heavy'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : workloadStatus === 'light'
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              }`}
            >
              {workloadStatus}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {workloadStatus === 'overloaded'
              ? 'Capacity capped at safe limit'
              : 'Sustainable pace'}
          </p>
        </div>

        {/* Daily Progress */}
        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/90 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Day Progress</span>
            <span className="text-xs font-bold text-white font-mono">{progressPercent}%</span>
          </div>
          <div className="mt-2.5 h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-blue-500 to-emerald-400"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {completedTasks === totalTasks && totalTasks > 0
              ? '🎉 Day completed!'
              : `${remainingTasks} tasks left to finish`}
          </p>
        </div>
      </div>

      {/* ── OVERLOAD & DEFERRAL BANNER ── */}
      {overloadNotice && (
        <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">{overloadNotice}</p>
            {deferredList.length > 0 && (
              <p className="text-[11px] text-amber-300/80">
                Deferred: {deferredList.map((d) => `"${d.task.title}"`).join(', ')}.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── ACTIVE LIVE TIMER PANEL (When session active) ── */}
      {activeTimerSessionId && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border border-blue-500/40 shadow-xl flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-300 animate-pulse">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300">
                  Active Study Timer
                </span>
                <span className="text-xs text-slate-400">
                  {currentDaySessions.find((s) => s.id === activeTimerSessionId)?.title}
                </span>
              </div>
              <div className="text-2xl font-black text-white font-mono tracking-tight mt-0.5">
                {String(Math.floor(timerSecondsLeft / 60)).padStart(2, '0')}:
                {String(timerSecondsLeft % 60).padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTimerRunning(!timerRunning)}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors"
              title={timerRunning ? 'Pause Session' : 'Resume Session'}
            >
              {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => {
                const s = currentDaySessions.find((item) => item.id === activeTimerSessionId);
                if (s) handleFinishTimer(s);
              }}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Complete Session</span>
            </button>
          </div>
        </div>
      )}

      {/* ── DAILY TIMELINE LIST ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>Timeline Schedule ({currentDaySessions.length} blocks)</span>
          </h3>
          <span className="text-[11px] text-slate-500">
            {preferences.startTime} to {preferences.endTime}
          </span>
        </div>

        {currentDaySessions.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 text-slate-500 space-y-3">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-slate-800/80 text-blue-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-200">No Schedule Built for this Day</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                The AI Daily Planner will automatically analyze your pending tasks, deadlines, and working hours to generate a balanced timeline.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGeneratePlan}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-500/20 transition-all"
            >
              ✨ Generate AI Daily Plan
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {currentDaySessions.map((session, index) => {
              const isBreak = session.session_type === 'break';
              const isSessionActive = activeTimerSessionId === session.id;
              const folder = session.folder || (session.task?.folder_id ? foldersMap.get(session.task.folder_id) : undefined);
              const folderColorCfg = folder ? FOLDER_COLORS[folder.color] || FOLDER_COLORS.blue : null;

              return (
                <div
                  key={session.id || index}
                  className={`group relative p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                    session.is_completed
                      ? 'bg-slate-950/40 border-slate-800/60 opacity-75'
                      : isBreak
                      ? 'bg-slate-900/40 border-slate-800/60 border-dashed'
                      : isSessionActive
                      ? 'bg-blue-950/20 border-blue-500/50 ring-2 ring-blue-500/20 shadow-lg'
                      : 'bg-slate-900/85 border-slate-800 hover:border-slate-700 hover:bg-slate-900 shadow-sm'
                  }`}
                >
                  {/* Left: Time & Content */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Checkbox / Break Icon */}
                    {isBreak ? (
                      <div className="mt-0.5 p-2 rounded-xl bg-slate-800 text-slate-400 border border-slate-700/60">
                        <Coffee className="w-4 h-4" />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleComplete(session)}
                        className="mt-1 transition-transform active:scale-90"
                        title={session.is_completed ? 'Mark incomplete' : 'Mark completed'}
                      >
                        {session.is_completed ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-400/20" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-500 hover:text-blue-400" />
                        )}
                      </button>
                    )}

                    {/* Time Slot Badge & Title */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs font-bold text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                          {session.start_time} – {session.end_time}
                        </span>

                        <span className="text-[10px] text-slate-400 font-medium">
                          {session.duration_minutes}m
                        </span>

                        {folder && folderColorCfg && (
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${folderColorCfg.bg} ${folderColorCfg.border} ${folderColorCfg.text}`}
                          >
                            {folder.name}
                          </span>
                        )}

                        {session.difficulty && !isBreak && (
                          <span
                            className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.2 rounded-md ${
                              session.difficulty === 'hard'
                                ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                                : session.difficulty === 'easy'
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                            }`}
                          >
                            {session.difficulty}
                          </span>
                        )}

                        {session.is_locked && (
                          <span className="text-[10px] text-amber-300 flex items-center gap-0.5 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                            <Lock className="w-2.5 h-2.5" /> Locked
                          </span>
                        )}
                      </div>

                      <h4
                        className={`text-sm font-semibold truncate ${
                          session.is_completed
                            ? 'line-through text-slate-500'
                            : isBreak
                            ? 'text-slate-400 italic'
                            : 'text-white'
                        }`}
                      >
                        {session.title}
                      </h4>

                      {session.notes && (
                        <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                          {session.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions (Timer, Lock, Move, Remove) */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    {!isBreak && !session.is_completed && (
                      <button
                        type="button"
                        onClick={() => handleStartTimer(session)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
                          isSessionActive && timerRunning
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30'
                        }`}
                        title="Start Pomodoro/Study Session Timer"
                      >
                        {isSessionActive && timerRunning ? (
                          <>
                            <Pause className="w-3 h-3" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3" />
                            <span>Start</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Lock toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleLock(session.id)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        session.is_locked
                          ? 'text-amber-400 bg-amber-500/10'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                      title={session.is_locked ? 'Unlock session' : 'Lock session time'}
                    >
                      {session.is_locked ? (
                        <Lock className="w-3.5 h-3.5" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
                      )}
                    </button>

                    {/* Move to tomorrow */}
                    {!session.is_completed && !isBreak && (
                      <button
                        type="button"
                        onClick={() => handleMoveToTomorrow(session)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-sky-500/10 transition-colors"
                        title="Move session to tomorrow"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Remove from day */}
                    <button
                      type="button"
                      onClick={() => handleRemoveSession(session.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remove from today's plan (keeps original task intact)"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── PREFERENCES MODAL ── */}
      {isPreferencesOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-400" />
                Working Hours & Study Limits
              </h3>
              <button
                onClick={() => setIsPreferencesOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Day Start Time</label>
                  <input
                    type="time"
                    value={preferences.startTime}
                    onChange={(e) => setPreferences({ ...preferences, startTime: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Day End Time</label>
                  <input
                    type="time"
                    value={preferences.endTime}
                    onChange={(e) => setPreferences({ ...preferences, endTime: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Preferred Break Duration: {preferences.preferredBreakDuration} mins
                </label>
                <input
                  type="range"
                  min="5"
                  max="30"
                  step="5"
                  value={preferences.preferredBreakDuration}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      preferredBreakDuration: Number(e.target.value),
                    })
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Max Daily Study Limit: {(preferences.maxDailyStudyMinutes / 60).toFixed(1)} hours
                </label>
                <input
                  type="range"
                  min="60"
                  max="600"
                  step="30"
                  value={preferences.maxDailyStudyMinutes}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      maxDailyStudyMinutes: Number(e.target.value),
                    })
                  }
                  className="w-full accent-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsPreferencesOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300"
              >
                Close
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (onSavePreferences) await onSavePreferences(preferences);
                  setIsPreferencesOpen(false);
                  await handleGeneratePlan();
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white"
              >
                Save & Re-Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
