'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
import { toLocalDateStr } from '@/lib/weekly-forecast';
import {
  adaptWhenSessionOverruns,
} from '@/lib/adaptive-scheduler';
import {
  sampleAmbientNoise,
  playNoiseAlertSound,
} from '@/lib/noise-detector';
import {
  playStudyFinishedAlarm,
  playBreakFinishedAlarm,
} from '@/lib/study-sound';
import { createClient } from '@/lib/supabase';
import {
  saveActiveTimerToDb,
  clearActiveTimerFromDb,
  loadActiveTimerFromDb,
  computeAdjustedTimerState,
} from '@/lib/active-timer-sync';
import { generateDailySchedulePdf } from '@/lib/daily-schedule-pdf';
import { lockScreenTimerWidget } from '@/lib/lockscreen-timer-widget';
import {
  Sparkles,
  Calendar,
  Clock,
  Play,
  Pause,
  CheckCircle2,
  Circle,
  FileDown,
  Lock,
  Unlock,
  Coffee,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Sliders,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Edit2,
  X,
  Check,
  Zap,
  Info,
  Loader2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  AlertOctagon,
  Radio,
  Bell,
  Globe,
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
  onToggleSessionComplete?: (session: DailyScheduleItem, completed: boolean) => Promise<void>;
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
  onToggleSessionComplete,
  userPreferences,
  onSavePreferences,
}: DailyPlannerViewProps) {
  const [preferences, setPreferences] = useState<SchedulingPreferences>({
    ...DEFAULT_PREFERENCES,
    ...userPreferences,
  });

  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, boolean>>({});
  const [activeTimerSessionId, setActiveTimerSessionId] = useState<string | null>(null);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerTotalDuration, setTimerTotalDuration] = useState<number>(0);
  const [isFreezeMinimized, setIsFreezeMinimized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [overloadNotice, setOverloadNotice] = useState<string | null>(null);
  const [deferredList, setDeferredList] = useState<{ task: Task; reason: string }[]>([]);
  const [isNoScheduleAlertOpen, setIsNoScheduleAlertOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Rearranging & Drag-Drop State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Time Adjustment Modal State
  const [timeEditingSession, setTimeEditingSession] = useState<DailyScheduleItem | null>(null);
  const [customStartTime, setCustomStartTime] = useState<string>('');
  const [customDuration, setCustomDuration] = useState<number>(30);

  // Ambient Noise Detection State (10-minute check during active study timer)
  const [isCheckingNoise, setIsCheckingNoise] = useState(false);
  const [isNoisyAlertOpen, setIsNoisyAlertOpen] = useState(false);
  const [detectedNoiseScore, setDetectedNoiseScore] = useState<number>(0);
  const [lastNoiseCheckStatus, setLastNoiseCheckStatus] = useState<string | null>(null);
  const [micPermissionState, setMicPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');

  // Completed Session Alarm & Next Step Modal State
  const [completedTimerModal, setCompletedTimerModal] = useState<{
    type: 'study' | 'break';
    sessionTitle: string;
    nextSession?: DailyScheduleItem;
  } | null>(null);

  // Supabase Client & User Authentication for Cross-Device Sync
  const supabase = useRef(createClient()).current;
  const [userId, setUserId] = useState<string | null>(null);

  const activeTimerElapsedSecondsRef = useRef<number>(0);
  const lastNoiseCheckedSecondRef = useRef<number>(0);
  const isCheckingNoiseRef = useRef<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync preferences if userPreferences prop changes
  useEffect(() => {
    if (userPreferences) {
      setPreferences((prev) => ({ ...prev, ...userPreferences }));
    }
  }, [userPreferences]);

  // Mount flag & clean timer on unmount
  useEffect(() => {
    setIsMounted(true);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── STUDY LOCKDOWN: FREEZE ENTIRE WEBSITE SCROLLING WHILE TIMER IS WORKING ──
  useEffect(() => {
    if (activeTimerSessionId && timerRunning && !isFreezeMinimized) {
      const originalOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
      };
    }
  }, [activeTimerSessionId, timerRunning, isFreezeMinimized]);

  // ── STUDY LOCKDOWN: BROADCAST FREEZE TO SIDEBAR & MOBILE BOTTOM NAV ──
  useEffect(() => {
    const isLockdown = Boolean(activeTimerSessionId && timerRunning);
    window.dispatchEvent(
      new CustomEvent('study_lockdown_change', {
        detail: { active: isLockdown },
      })
    );
  }, [activeTimerSessionId, timerRunning]);

  // Clean lockdown broadcast on unmount
  useEffect(() => {
    return () => {
      window.dispatchEvent(
        new CustomEvent('study_lockdown_change', {
          detail: { active: false },
        })
      );
    };
  }, []);

  // ── CROSS-DEVICE ACTIVE TIMER SYNCHRONIZATION ──
  useEffect(() => {
    async function initAuthAndTimer() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        // Load active timer state from Supabase (e.g. started on phone or another tab)
        const remoteTimer = await loadActiveTimerFromDb(supabase, user.id);
        if (remoteTimer && remoteTimer.sessionId) {
          if (remoteTimer.isFinished) {
            // Finished while device was away: play alarm and show completion modal
            if (remoteTimer.sessionType === 'break') {
              playBreakFinishedAlarm();
              setCompletedTimerModal({
                type: 'break',
                sessionTitle: remoteTimer.title,
              });
            } else {
              playStudyFinishedAlarm();
              setCompletedTimerModal({
                type: 'study',
                sessionTitle: remoteTimer.title,
              });
            }
            await clearActiveTimerFromDb(supabase, user.id);
          } else {
            // Restore active timer from synchronized wall-clock state
            setActiveTimerSessionId(remoteTimer.sessionId);
            setTimerTotalDuration(remoteTimer.totalSeconds);
            setTimerSecondsLeft(remoteTimer.secondsLeft);
            setTimerRunning(remoteTimer.isRunning);
            if (remoteTimer.isRunning) {
              setIsFreezeMinimized(false);
            }
          }
        }
      } catch (e) {
        console.error('Failed to init cross-device timer:', e);
      }
    }

    initAuthAndTimer();
  }, [supabase]);

  // Realtime Broadcast across other open devices
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`active-timer-realtime-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'active_study_timers',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          if (payload.eventType === 'DELETE') {
            setActiveTimerSessionId(null);
            setTimerRunning(false);
          } else if (payload.new) {
            const adjusted = computeAdjustedTimerState(payload.new as any);
            if (adjusted.isFinished) {
              if (adjusted.sessionType === 'break') {
                playBreakFinishedAlarm();
                setCompletedTimerModal({
                  type: 'break',
                  sessionTitle: adjusted.title,
                });
              } else {
                playStudyFinishedAlarm();
                setCompletedTimerModal({
                  type: 'study',
                  sessionTitle: adjusted.title,
                });
              }
              setActiveTimerSessionId(null);
              setTimerRunning(false);
            } else {
              setActiveTimerSessionId(adjusted.sessionId);
              setTimerTotalDuration(adjusted.totalSeconds);
              setTimerSecondsLeft(adjusted.secondsLeft);
              setTimerRunning(adjusted.isRunning);
              if (adjusted.isRunning) {
                setIsFreezeMinimized(false);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, supabase]);

  const getThresholdForSensitivity = useCallback(
    (sensitivity?: 'relaxed' | 'normal' | 'strict') => {
      switch (sensitivity) {
        case 'relaxed':
          return 46;
        case 'strict':
          return 22;
        case 'normal':
        default:
          return 32;
      }
    },
    []
  );

  const performNoiseCheck = useCallback(async () => {
    if (isCheckingNoiseRef.current) return;
    isCheckingNoiseRef.current = true;
    setIsCheckingNoise(true);

    const threshold = getThresholdForSensitivity(preferences.noiseSensitivity);

    try {
      const result = await sampleAmbientNoise({
        sampleDurationMs: 3500,
        thresholdScore: threshold,
        noisySamplesRatio: 0.25,
      });

      if (result.error === 'permission_denied') {
        setMicPermissionState('denied');
        setLastNoiseCheckStatus('Mic blocked');
        return;
      }

      setMicPermissionState('granted');
      setDetectedNoiseScore(result.score);

      if (result.isNoisy) {
        // Automatically pause the study timer!
        setTimerRunning(false);
        setIsNoisyAlertOpen(true);
        setLastNoiseCheckStatus(`Noisy (${result.score}%)`);
        playNoiseAlertSound();

        // Sync pause state across devices
        if (userId && activeTimerSessionId) {
          const s = currentDaySessions.find((item) => item.id === activeTimerSessionId);
          if (s) {
            saveActiveTimerToDb(supabase, userId, {
              sessionId: s.id,
              sessionType: s.session_type,
              title: s.title,
              durationMinutes: s.duration_minutes,
              totalSeconds: timerTotalDuration,
              secondsLeft: timerSecondsLeft,
              isRunning: false,
            });
          }
        }
      } else {
        setLastNoiseCheckStatus(`Quiet (${result.score}%)`);
      }
    } catch (err) {
      console.error('Ambient noise check error:', err);
    } finally {
      isCheckingNoiseRef.current = false;
      setIsCheckingNoise(false);
    }
  }, [preferences.noiseSensitivity, getThresholdForSensitivity]);

  // Folders lookup map
  const foldersMap = new Map(folders.map((f) => [f.id, f]));

  // Calculate Overview Stats for currentDate with instant optimistic feedback
  const currentDaySessions = React.useMemo(() => {
    return scheduleItems
      .filter((s) => s.date === currentDate)
      .map((s) => {
        let isDone = s.is_completed;
        if (optimisticOverrides[s.id] !== undefined) {
          isDone = optimisticOverrides[s.id];
        } else if (s.task_id && optimisticOverrides[s.task_id] !== undefined) {
          isDone = optimisticOverrides[s.task_id];
        }
        return {
          ...s,
          is_completed: isDone,
        };
      });
  }, [scheduleItems, currentDate, optimisticOverrides]);

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

  // Export AI planned schedule as premium luxury PDF
  const handleExportPdf = async () => {
    if (currentDaySessions.length === 0) {
      setIsNoScheduleAlertOpen(true);
      return;
    }

    try {
      setIsExportingPdf(true);
      let userName = 'Evolve User';
      if (userId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle();
        if (profile?.full_name) userName = profile.full_name;
      }

      await generateDailySchedulePdf({
        userName,
        date: currentDate,
        sessions: currentDaySessions,
        tasks,
        folders,
        preferences,
      });
    } catch (err) {
      console.error('Failed to export daily schedule PDF:', err);
    } finally {
      setIsExportingPdf(false);
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
    const currentCompleted =
      optimisticOverrides[session.id] !== undefined
        ? optimisticOverrides[session.id]
        : (session.task_id && optimisticOverrides[session.task_id] !== undefined)
        ? optimisticOverrides[session.task_id]
        : session.is_completed;
    const nextCompleted = !currentCompleted;

    // Instant local optimistic UI (0ms visual toggle feedback)
    setOptimisticOverrides((prev) => {
      const next = { ...prev, [session.id]: nextCompleted };
      if (session.task_id) next[session.task_id] = nextCompleted;
      return next;
    });

    try {
      if (onToggleSessionComplete) {
        await onToggleSessionComplete(session, nextCompleted);
      } else {
        const updated = currentDaySessions.map((s) =>
          s.id === session.id
            ? {
                ...s,
                is_completed: nextCompleted,
                actual_duration_minutes:
                  s.actual_duration_minutes > 0
                    ? s.actual_duration_minutes
                    : s.duration_minutes,
              }
            : s
        );

        await onSaveSchedule(updated);

        if (session.task_id) {
          await onCompleteTask(session.task_id, nextCompleted);
        }
      }
    } catch (err) {
      console.error('Failed to toggle session complete:', err);
      // Rollback optimistic override on failure
      setOptimisticOverrides((prev) => {
        const next = { ...prev, [session.id]: currentCompleted };
        if (session.task_id) next[session.task_id] = currentCompleted;
        return next;
      });
    }
  };

  // Start live study session timer (with cross-device database synchronization)
  const handleStartTimer = (session: DailyScheduleItem) => {
    if (activeTimerSessionId === session.id && timerRunning) {
      setTimerRunning(false);
      if (userId) {
        saveActiveTimerToDb(supabase, userId, {
          sessionId: session.id,
          sessionType: session.session_type,
          title: session.title,
          durationMinutes: session.duration_minutes,
          totalSeconds: timerTotalDuration,
          secondsLeft: timerSecondsLeft,
          isRunning: false,
        });
      }
      return;
    }

    setIsFreezeMinimized(false);
    setActiveTimerSessionId(session.id);
    const initialSeconds = session.duration_minutes * 60;
    setTimerTotalDuration(initialSeconds);
    setTimerSecondsLeft(initialSeconds);
    setTimerRunning(true);
    activeTimerElapsedSecondsRef.current = 0;
    lastNoiseCheckedSecondRef.current = 0;

    if (userId) {
      saveActiveTimerToDb(supabase, userId, {
        sessionId: session.id,
        sessionType: session.session_type,
        title: session.title,
        durationMinutes: session.duration_minutes,
        totalSeconds: initialSeconds,
        secondsLeft: initialSeconds,
        isRunning: true,
      });
    }

    // Launch Live Lock Screen & Notification Center Widget on Phone
    lockScreenTimerWidget.start({
      title: session.title,
      sessionType: session.session_type,
      secondsLeft: initialSeconds,
      totalSeconds: initialSeconds,
      isRunning: true,
      onPause: () => {
        setTimerRunning(false);
      },
      onResume: () => {
        setTimerRunning(true);
        setIsFreezeMinimized(false);
      },
      onComplete: () => {
        handleFinishTimer(session);
      },
    });
  };

  // Finish study timer early or on time and log actual duration
  const handleFinishTimer = useCallback(
    async (session: DailyScheduleItem) => {
      const secondsSpent = timerTotalDuration - timerSecondsLeft;
      const actualMinutes = Math.max(1, Math.round(secondsSpent / 60));

      setTimerRunning(false);
      setActiveTimerSessionId(null);
      lockScreenTimerWidget.stop();

      // Clear from database across all devices
      if (userId) {
        await clearActiveTimerFromDb(supabase, userId);
      }

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
    },
    [
      timerTotalDuration,
      timerSecondsLeft,
      currentDaySessions,
      preferences.endTime,
      onSaveSchedule,
      onCompleteTask,
    ]
  );

  // When active timer countdown finishes naturally
  const handleTimerCompleted = useCallback(
    async (session: DailyScheduleItem) => {
      const isBreak = session.session_type === 'break';

      if (isBreak) {
        // Break finished alarm sound
        playBreakFinishedAlarm();
        const nextTask = currentDaySessions.find(
          (s) => !s.is_completed && s.session_type === 'task'
        );
        setCompletedTimerModal({
          type: 'break',
          sessionTitle: session.title,
          nextSession: nextTask,
        });
      } else {
        // Study finished alarm sound
        playStudyFinishedAlarm();
        const nextSession = currentDaySessions.find(
          (s) => !s.is_completed && s.id !== session.id
        );
        setCompletedTimerModal({
          type: 'study',
          sessionTitle: session.title,
          nextSession,
        });
      }

      await handleFinishTimer(session);
    },
    [currentDaySessions, handleFinishTimer]
  );

  // Timer Tick handler + 10-Minute Noise Check
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        activeTimerElapsedSecondsRef.current += 1;

        // Check if 10 minutes (600 seconds) have elapsed since last noise check
        // Only run noise check during study sessions, not break sessions
        const activeSession = currentDaySessions.find(
          (s) => s.id === activeTimerSessionId
        );
        const isStudySession = activeSession?.session_type === 'task';

        const elapsedSinceLastCheck =
          activeTimerElapsedSecondsRef.current - lastNoiseCheckedSecondRef.current;
        const NOISE_CHECK_INTERVAL_SECONDS = 600; // 10 minutes

        if (
          isStudySession &&
          preferences.noiseGuardEnabled !== false &&
          elapsedSinceLastCheck >= NOISE_CHECK_INTERVAL_SECONDS &&
          !isCheckingNoiseRef.current
        ) {
          lastNoiseCheckedSecondRef.current = activeTimerElapsedSecondsRef.current;
          performNoiseCheck();
        }

        setTimerSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setTimerRunning(false);
            lockScreenTimerWidget.stop();

            if (activeSession) {
              handleTimerCompleted(activeSession);
            }
            return 0;
          }
          const nextLeft = prev - 1;
          lockScreenTimerWidget.update(nextLeft, true);
          return nextLeft;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [
    timerRunning,
    preferences.noiseGuardEnabled,
    performNoiseCheck,
    currentDaySessions,
    activeTimerSessionId,
    handleTimerCompleted,
  ]);

  // Remove a session from the daily schedule (NEVER deletes the underlying task!)
  const handleRemoveSession = async (sessionId: string) => {
    const filtered = currentDaySessions.filter((s) => s.id !== sessionId);
    await onSaveSchedule(filtered);
  };

  // Move task to tomorrow
  const handleMoveToTomorrow = async (session: DailyScheduleItem) => {
    const parts = currentDate.split('-').map(Number);
    const tomorrow = new Date(parts[0], parts[1] - 1, parts[2]);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = toLocalDateStr(tomorrow);

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

  // ---------------------------------------------------------------------------
  // Rearrange Tasks Along the Day (Reordering & Drag-Drop)
  // ---------------------------------------------------------------------------

  const handleMoveSession = async (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= currentDaySessions.length || fromIndex === toIndex) return;

    const list = [...currentDaySessions];
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);

    // Recalculate start and end times sequentially
    let cursor = timeToMinutes(preferences.startTime);
    const updated: DailyScheduleItem[] = list.map((item, idx) => {
      let startMin = cursor;
      if (item.is_locked) {
        startMin = Math.max(cursor, timeToMinutes(item.start_time));
      }
      const endMin = startMin + item.duration_minutes;
      cursor = endMin;
      return {
        ...item,
        start_time: minutesToTime(startMin),
        end_time: minutesToTime(endMin),
        sort_order: idx,
      };
    });

    await onSaveSchedule(updated);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = async (dropIndex: number) => {
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const fromIndex = draggedIndex;
    setDraggedIndex(null);
    setDragOverIndex(null);
    await handleMoveSession(fromIndex, dropIndex);
  };

  const handleOpenTimeEdit = (session: DailyScheduleItem) => {
    setTimeEditingSession(session);
    setCustomStartTime(session.start_time);
    setCustomDuration(session.duration_minutes);
  };

  const handleSaveCustomTime = async () => {
    if (!timeEditingSession || !customStartTime) return;

    const newStartMin = timeToMinutes(customStartTime);
    const newEndMin = newStartMin + customDuration;

    const updated = currentDaySessions.map((s) => {
      if (s.id === timeEditingSession.id) {
        return {
          ...s,
          start_time: minutesToTime(newStartMin),
          end_time: minutesToTime(newEndMin),
          duration_minutes: customDuration,
          is_locked: true,
        };
      }
      return s;
    });

    // Re-sort by start time
    updated.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
    const finalSessions = updated.map((s, idx) => ({ ...s, sort_order: idx }));

    await onSaveSchedule(finalSessions);
    setTimeEditingSession(null);
  };

  const sessionIdSafe = (id: string) => id;

  // Navigate Days
  const handleStepDay = (step: number) => {
    const parts = currentDate.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + step);
    onDateChange(toLocalDateStr(d));
  };

  const isToday = currentDate === toLocalDateStr(new Date());
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
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            title="Export this day's planned schedule as a luxury PDF"
          >
            {isExportingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
            ) : (
              <FileDown className="w-3.5 h-3.5 text-purple-400" />
            )}
            <span className="hidden sm:inline">Export PDF</span>
            <span className="sm:hidden">PDF</span>
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

      {/* ── FULLSCREEN WEBSITE FREEZE LOCKDOWN (When Active Study/Break Timer is Working or Active) ── */}
      {activeTimerSessionId && (!isFreezeMinimized || timerRunning) && (() => {
        const activeSession = currentDaySessions.find((s) => s.id === activeTimerSessionId);
        const isBreakSession = activeSession?.session_type === 'break';
        const progressPercent = timerTotalDuration > 0
          ? Math.min(100, Math.max(0, ((timerTotalDuration - timerSecondsLeft) / timerTotalDuration) * 100))
          : 0;

        const minutesLeft = Math.floor(timerSecondsLeft / 60);
        const secondsLeft = timerSecondsLeft % 60;
        const formattedTime = `${String(minutesLeft).padStart(2, '0')}:${String(secondsLeft).padStart(2, '0')}`;

        if (!isMounted) return null;

        return createPortal(
          <div
            data-timer-control="true"
            className="fixed inset-0 top-0 left-0 w-screen h-screen z-[999999] overflow-y-auto bg-[#070b14] flex flex-col items-center justify-center p-4 sm:p-8 select-none animate-in fade-in duration-200"
            style={{ touchAction: 'manipulation' }}
          >
            {/* Ambient background glow */}
            <div
              className={`absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full blur-[140px] pointer-events-none opacity-40 ${
                isBreakSession
                  ? 'bg-gradient-to-br from-amber-600/30 via-yellow-600/20 to-transparent'
                  : 'bg-gradient-to-br from-blue-600/30 via-indigo-600/20 to-transparent'
              }`}
            />

            {/* Main Focus Card Container */}
            <div className="relative z-10 w-full max-w-2xl flex flex-col items-center text-center space-y-6">
              {/* Top Focus Badge */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase shadow-xl transition-all ${
                    isBreakSession
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-amber-500/10'
                      : 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-blue-500/10'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5 animate-pulse text-current" />
                  <span>{isBreakSession ? 'Break Lockdown Active' : 'Deep Study Lockdown Active'}</span>
                </div>

                <p className="text-xs sm:text-sm text-slate-400 max-w-md font-medium">
                  {timerRunning
                    ? 'All website pages, buttons, and navigation are frozen so you can concentrate 100% on studying.'
                    : 'Study session is paused. Click Resume to continue and lock the website again.'}
                </p>
              </div>

              {/* Session Title & Metadata */}
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-md">
                  {activeSession?.title || 'Active Session'}
                </h1>
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800">
                    Planned Duration: {activeSession?.duration_minutes || Math.round(timerTotalDuration / 60)}m
                  </span>
                  {activeSession?.start_time && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800">
                      Scheduled: {activeSession.start_time} - {activeSession.end_time}
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-blue-400" />
                    <span>Cloud Synced</span>
                  </span>
                </div>
              </div>

              {/* Digital Countdown Timer Display */}
              <div
                className={`w-full max-w-lg p-6 sm:p-8 rounded-3xl border shadow-2xl backdrop-blur-xl transition-all ${
                  isBreakSession
                    ? 'bg-gradient-to-b from-amber-950/40 to-slate-900/90 border-amber-500/30 shadow-amber-950/40'
                    : 'bg-gradient-to-b from-blue-950/40 to-slate-900/90 border-blue-500/30 shadow-blue-950/40'
                }`}
              >
                {/* Big Monospace Digits */}
                <div className="text-7xl sm:text-8xl md:text-9xl font-black font-mono tracking-tight text-white drop-shadow-[0_0_40px_rgba(59,130,246,0.35)] select-none">
                  {formattedTime}
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-800/80 rounded-full h-3 mt-6 overflow-hidden border border-slate-700/60 p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                      isBreakSession
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                        : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="flex justify-between items-center text-xs text-slate-400 font-mono mt-2.5">
                  <span>{Math.round(progressPercent)}% elapsed</span>
                  <span>{Math.ceil(timerSecondsLeft / 60)} min remaining</span>
                </div>

                {/* Ambient Noise Guard Status (During Study Sessions) */}
                {!isBreakSession && preferences.noiseGuardEnabled !== false && (
                  <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-2">
                    {isCheckingNoise ? (
                      <span className="text-xs font-semibold px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 animate-pulse">
                        <Radio className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                        <span>Checking room noise level...</span>
                      </span>
                    ) : micPermissionState === 'denied' ? (
                      <span className="text-xs font-medium px-3 py-1 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5">
                        <MicOff className="w-3.5 h-3.5 text-rose-400" />
                        <span>Mic Blocked • Noise check unavailable</span>
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Noise Guard Active (checks room silence every 10 min)</span>
                        {lastNoiseCheckStatus && (
                          <span className="text-slate-400 text-[11px]">• {lastNoiseCheckStatus}</span>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* ── THE ONLY WORKING BUTTONS: (PAUSE , COMPLETE SESSION) ── */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-md pt-2">
                {/* Button 1: Pause / Resume Button */}
                <button
                  type="button"
                  onClick={() => {
                    const nextRunning = !timerRunning;
                    setTimerRunning(nextRunning);
                    lockScreenTimerWidget.update(timerSecondsLeft, nextRunning);
                    if (nextRunning) {
                      setIsFreezeMinimized(false);
                    }
                    if (userId && activeSession) {
                      saveActiveTimerToDb(supabase, userId, {
                        sessionId: activeSession.id,
                        sessionType: activeSession.session_type,
                        title: activeSession.title,
                        durationMinutes: activeSession.duration_minutes,
                        totalSeconds: timerTotalDuration,
                        secondsLeft: timerSecondsLeft,
                        isRunning: nextRunning,
                      });
                    }
                  }}
                  className={`w-full sm:w-1/2 py-4 px-6 rounded-2xl font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all shadow-xl active:scale-95 ${
                    timerRunning
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/30 ring-2 ring-blue-400 animate-pulse'
                  }`}
                  title={timerRunning ? 'Pause Session' : 'Resume Session'}
                >
                  {timerRunning ? (
                    <>
                      <Pause className="w-5 h-5 fill-current" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current" />
                      <span>Resume</span>
                    </>
                  )}
                </button>

                {/* Button 2: Complete Session Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (activeSession) handleFinishTimer(activeSession);
                  }}
                  className={`w-full sm:w-1/2 py-4 px-6 rounded-2xl font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 text-white transition-all shadow-xl active:scale-95 ${
                    isBreakSession
                      ? 'bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 shadow-amber-500/25 border border-amber-400/30'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/25 border border-emerald-400/30'
                  }`}
                  title="Complete Session"
                >
                  <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                  <span>{isBreakSession ? 'End Break' : 'Complete Session'}</span>
                </button>
              </div>

              {/* When Paused: Subtle option to view schedule while paused */}
              {!timerRunning && (
                <div className="pt-2 animate-in fade-in">
                  <button
                    type="button"
                    onClick={() => setIsFreezeMinimized(true)}
                    className="text-xs text-slate-400 hover:text-slate-200 underline decoration-slate-600 underline-offset-4 hover:decoration-slate-400 transition-colors"
                  >
                    View schedule while paused
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ── INLINE ACTIVE TIMER BANNER (Shown ONLY when user minimized while paused) ── */}
      {activeTimerSessionId && isFreezeMinimized && !timerRunning && (() => {
        const activeSession = currentDaySessions.find((s) => s.id === activeTimerSessionId);
        const isBreakSession = activeSession?.session_type === 'break';

        return (
          <div
            data-timer-control="true"
            className={`p-4 rounded-2xl border shadow-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in ${
              isBreakSession
                ? 'bg-gradient-to-r from-amber-950/70 via-slate-900 to-yellow-950/70 border-amber-500/40'
                : 'bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border-blue-500/40'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl border ${
                  isBreakSession
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                }`}
              >
                {isBreakSession ? <Coffee className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                      isBreakSession
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-blue-500/20 text-blue-300'
                    }`}
                  >
                    {isBreakSession ? 'Active Break Timer (Paused)' : 'Active Study Timer (Paused)'}
                  </span>
                  <span className="text-xs text-slate-400">
                    {activeSession?.title}
                  </span>
                  <span
                    className="text-[10px] text-blue-300/90 font-medium px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center gap-1"
                  >
                    <Globe className="w-3 h-3 text-blue-400" />
                    <span>Cloud Synced</span>
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
                onClick={() => {
                  setTimerRunning(true);
                  setIsFreezeMinimized(false);
                  lockScreenTimerWidget.update(timerSecondsLeft, true);
                  if (userId && activeSession) {
                    saveActiveTimerToDb(supabase, userId, {
                      sessionId: activeSession.id,
                      sessionType: activeSession.session_type,
                      title: activeSession.title,
                      durationMinutes: activeSession.duration_minutes,
                      totalSeconds: timerTotalDuration,
                      secondsLeft: timerSecondsLeft,
                      isRunning: true,
                    });
                  }
                }}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all ring-2 ring-blue-400/50 animate-pulse"
                title="Resume Study Focus Lockdown"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Resume (Lockdown Focus)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activeSession) handleFinishTimer(activeSession);
                }}
                className={`px-3.5 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-all ${
                  isBreakSession
                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'
                }`}
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>{isBreakSession ? 'End Break' : 'Complete Session'}</span>
              </button>
            </div>
          </div>
        );
      })()}

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
                  draggable={!session.is_locked}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={`group relative p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                    draggedIndex === index
                      ? 'opacity-40 scale-[0.99] border-dashed border-blue-500'
                      : dragOverIndex === index
                      ? 'border-t-2 border-t-blue-400 bg-blue-950/20'
                      : ''
                  } ${
                    session.is_completed
                      ? 'bg-slate-950/40 border-slate-800/60 opacity-75'
                      : isBreak
                      ? 'bg-slate-900/40 border-slate-800/60 border-dashed'
                      : isSessionActive
                      ? 'bg-blue-950/20 border-blue-500/50 ring-2 ring-blue-500/20 shadow-lg'
                      : 'bg-slate-900/85 border-slate-800 hover:border-slate-700 hover:bg-slate-900 shadow-sm'
                  }`}
                >
                  {/* Left: Reorder Stepper & Drag Handle */}
                  <div className="flex sm:flex-col items-center justify-center gap-0.5 text-slate-500 shrink-0 self-start sm:self-center mr-0.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveSession(index, index - 1)}
                      className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-200 disabled:opacity-20 disabled:hover:bg-transparent transition"
                      title="Move task earlier in the day"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <div
                      className="cursor-grab active:cursor-grabbing p-1 text-slate-500 hover:text-slate-300 transition"
                      title="Drag to rearrange along the day"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                    <button
                      type="button"
                      disabled={index === currentDaySessions.length - 1}
                      onClick={() => handleMoveSession(index, index + 1)}
                      className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-200 disabled:opacity-20 disabled:hover:bg-transparent transition"
                      title="Move task later in the day"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Content & Checkbox */}
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
                        <button
                          type="button"
                          onClick={() => handleOpenTimeEdit(session)}
                          className="group/time flex items-center gap-1 font-mono text-xs font-bold text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 rounded-md border border-blue-500/20 transition cursor-pointer"
                          title="Click to adjust time slot or start time"
                        >
                          <Clock className="w-3 h-3 text-blue-400 group-hover/time:rotate-45 transition-transform" />
                          <span>{session.start_time} – {session.end_time}</span>
                        </button>

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
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                            : isSessionActive
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                            : 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30'
                        }`}
                        title="Start Study Timer"
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

                    {isBreak && !session.is_completed && (
                      <button
                        type="button"
                        onClick={() => handleStartTimer(session)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
                          isSessionActive && timerRunning
                            ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20'
                            : isSessionActive
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30'
                        }`}
                        title="Start Break Timer"
                      >
                        {isSessionActive && timerRunning ? (
                          <>
                            <Pause className="w-3 h-3" />
                            <span>Pause Break</span>
                          </>
                        ) : (
                          <>
                            <Coffee className="w-3 h-3" />
                            <span>Start Break</span>
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

              {/* 10-Minute Study Noise Guard Setting */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-200 font-semibold text-xs flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-blue-400" />
                    <span>10-Minute Study Noise Guard</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={preferences.noiseGuardEnabled !== false}
                    onChange={(e) =>
                      setPreferences({ ...preferences, noiseGuardEnabled: e.target.checked })
                    }
                    className="accent-blue-600 rounded cursor-pointer w-4 h-4"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Checks your microphone every 10 minutes. If in a noisy area, it pauses the study timer until you move to a quiet spot.
                </p>

                {preferences.noiseGuardEnabled !== false && (
                  <div className="pt-1 flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Sensitivity:</span>
                    {(['relaxed', 'normal', 'strict'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setPreferences({ ...preferences, noiseSensitivity: lvl })}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                          (preferences.noiseSensitivity || 'normal') === lvl
                            ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                )}
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
      {/* ── TIME ADJUSTMENT MODAL ── */}
      {timeEditingSession && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                Adjust Session Time
              </h3>
              <button
                onClick={() => setTimeEditingSession(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <p className="text-slate-300 font-semibold mb-1 truncate">
                  {timeEditingSession.title}
                </p>
                <p className="text-slate-500 text-[11px]">
                  Setting a custom time will lock this session to that exact slot.
                </p>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Start Time</label>
                <input
                  type="time"
                  value={customStartTime}
                  onChange={(e) => setCustomStartTime(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  max="240"
                  step="5"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(Math.max(5, Number(e.target.value)))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setTimeEditingSession(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCustomTime}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white"
              >
                Save Time Slot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NO SCHEDULE ALERT POPUP MODAL ── */}
      {isNoScheduleAlertOpen && isMounted && createPortal(
        <div
          data-timer-control="true"
          className="fixed inset-0 z-[1000000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
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
                  handleGeneratePlan();
                }}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:brightness-110 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 active:scale-[0.98] transition-all"
              >
                <Sparkles className="w-4 h-4 text-purple-200" />
                <span>Generate Plan for This Day Now</span>
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
        </div>,
        document.body
      )}

      {/* ── NOISY STUDY AREA ALERT POPUP MODAL ── */}
      {isNoisyAlertOpen && isMounted && createPortal(
        <div
          data-timer-control="true"
          className="fixed inset-0 z-[1000000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-amber-500/50 rounded-3xl w-full max-w-md p-6 shadow-2xl shadow-amber-500/10 space-y-5 animate-in zoom-in-95 text-center">
            {/* Warning Icon Badge */}
            <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
              <div className="absolute inset-0 rounded-2xl bg-amber-500/20 animate-ping opacity-50" />
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/30 via-red-500/20 to-amber-600/30 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg">
                <VolumeX className="w-8 h-8" />
              </div>
            </div>

            {/* Header & Exact User Quote */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Noisy Area Detected</span>
              </div>

              {/* Exact user-requested message */}
              <div className="p-4 rounded-2xl bg-gradient-to-b from-amber-500/15 to-amber-500/5 border border-amber-500/30 shadow-inner">
                <p className="text-base sm:text-lg font-black text-amber-200 tracking-tight leading-snug">
                  “this is not a study mood don&apos;t trick your self go to better place”
                </p>
              </div>

              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                The 10-minute noise check detected high ambient sound via your microphone.
                Your study timer has been automatically <span className="text-white font-semibold">paused</span> so your focus stats and study streak stay honest.
              </p>
            </div>

            {/* Noise Level Gauge */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs space-y-2 text-left">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                  <Mic className="w-3.5 h-3.5 text-amber-400" />
                  <span>Detected Ambient Volume</span>
                </span>
                <span className="font-mono font-bold text-amber-400">
                  {detectedNoiseScore}% (Limit: {getThresholdForSensitivity(preferences.noiseSensitivity)}%)
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(12, detectedNoiseScore))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>Quiet Study Zone</span>
                <span className="text-amber-400 font-semibold">Noisy Environment</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsNoisyAlertOpen(false);
                  // Reset countdown so user gets a fresh 10-minute quiet study window
                  lastNoiseCheckedSecondRef.current = activeTimerElapsedSecondsRef.current;
                  setTimerRunning(true);
                  setIsFreezeMinimized(false);
                  lockScreenTimerWidget.update(timerSecondsLeft, true);
                  if (userId && activeTimerSessionId) {
                    const s = currentDaySessions.find((item) => item.id === activeTimerSessionId);
                    if (s) {
                      saveActiveTimerToDb(supabase, userId, {
                        sessionId: s.id,
                        sessionType: s.session_type,
                        title: s.title,
                        durationMinutes: s.duration_minutes,
                        totalSeconds: timerTotalDuration,
                        secondsLeft: timerSecondsLeft,
                        isRunning: true,
                      });
                    }
                  }
                }}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>I&apos;m in a Quiet Place (Resume Timer)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsNoisyAlertOpen(false);
                  // Remains paused!
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-colors"
              >
                Keep Timer Paused
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── TIMER FINISHED ALARM & TRANSITION MODAL ── */}
      {completedTimerModal && isMounted && createPortal(
        <div
          data-timer-control="true"
          className="fixed inset-0 z-[1000000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            className={`bg-slate-900 border rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-in zoom-in-95 text-center ${
              completedTimerModal.type === 'study'
                ? 'border-blue-500/50 shadow-blue-500/10'
                : 'border-amber-500/50 shadow-amber-500/10'
            }`}
          >
            {/* Animated Alarm Icon */}
            <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
              <div
                className={`absolute inset-0 rounded-2xl animate-ping opacity-40 ${
                  completedTimerModal.type === 'study' ? 'bg-blue-500' : 'bg-amber-500'
                }`}
              />
              <div
                className={`relative w-16 h-16 rounded-2xl border flex items-center justify-center shadow-lg ${
                  completedTimerModal.type === 'study'
                    ? 'bg-gradient-to-br from-blue-600/30 to-indigo-600/30 border-blue-500/50 text-blue-300'
                    : 'bg-gradient-to-br from-amber-600/30 to-yellow-600/30 border-amber-500/50 text-amber-300'
                }`}
              >
                {completedTimerModal.type === 'study' ? (
                  <Bell className="w-8 h-8 animate-bounce" />
                ) : (
                  <Coffee className="w-8 h-8 animate-bounce" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                  completedTimerModal.type === 'study'
                    ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {completedTimerModal.type === 'study'
                    ? 'Study Timer Finished!'
                    : 'Break Time Finished!'}
                </span>
              </div>

              <h3 className="text-lg font-black text-white">
                {completedTimerModal.type === 'study'
                  ? 'Session Complete! Great Job 🎉'
                  : 'Time to Refocus! ⏰'}
              </h3>

              <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                {completedTimerModal.type === 'study'
                  ? `You successfully finished "${completedTimerModal.sessionTitle}". Take a well-deserved break to rest your mind.`
                  : 'Your break has finished. Jump back into your next scheduled study session!'}
              </p>
            </div>

            {/* Sound replay button */}
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() =>
                  completedTimerModal.type === 'study'
                    ? playStudyFinishedAlarm()
                    : playBreakFinishedAlarm()
                }
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition"
                title="Play alarm sound again"
              >
                <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Replay Alarm Sound</span>
              </button>
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              {completedTimerModal.type === 'study' &&
                completedTimerModal.nextSession?.session_type === 'break' && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = completedTimerModal.nextSession!;
                      setCompletedTimerModal(null);
                      handleStartTimer(next);
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:brightness-110 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all"
                  >
                    <Coffee className="w-4 h-4" />
                    <span>
                      Start Planned Break ({completedTimerModal.nextSession.duration_minutes}m)
                    </span>
                  </button>
                )}

              {completedTimerModal.type === 'break' && completedTimerModal.nextSession && (
                <button
                  type="button"
                  onClick={() => {
                    const next = completedTimerModal.nextSession!;
                    setCompletedTimerModal(null);
                    handleStartTimer(next);
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>
                    Start Next Study Session: &quot;{completedTimerModal.nextSession.title}&quot;
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setCompletedTimerModal(null)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
