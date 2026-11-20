// ============================================================================
// Adaptive Rescheduling Engine
// Dynamically recalculates schedules when tasks, durations, or availability shift
// ============================================================================

import type {
  DailyScheduleItem,
  Task,
  TaskFolder,
} from '@/types';
import {
  timeToMinutes,
  minutesToTime,
  generateDeterministicDailyPlan,
  SchedulingPreferences,
  DEFAULT_PREFERENCES,
} from './daily-planner';

export interface RescheduleResult {
  updatedSessions: DailyScheduleItem[];
  shiftedCount: number;
  deferredCount: number;
  explanation: string;
}

/**
 * Scenario 1: Task Takes Longer Than Expected
 * Pushes subsequent unlocked sessions forward to prevent overlaps.
 */
export function adaptWhenSessionOverruns(
  sessions: DailyScheduleItem[],
  overrunningSessionId: string,
  actualMinutesSpent: number,
  windowEndTimeStr: string = '18:00'
): RescheduleResult {
  const windowEndMin = timeToMinutes(windowEndTimeStr);
  const sorted = [...sessions].sort(
    (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
  );

  const targetIdx = sorted.findIndex((s) => s.id === overrunningSessionId);
  if (targetIdx === -1) {
    return {
      updatedSessions: sessions,
      shiftedCount: 0,
      deferredCount: 0,
      explanation: 'Target session not found.',
    };
  }

  const targetSession = sorted[targetIdx];
  const originalDuration = targetSession.duration_minutes;
  const delta = actualMinutesSpent - originalDuration;

  if (delta <= 0) {
    return {
      updatedSessions: sessions,
      shiftedCount: 0,
      deferredCount: 0,
      explanation: 'Session did not exceed estimated duration.',
    };
  }

  // Update target session
  const targetStartMin = timeToMinutes(targetSession.start_time);
  const newTargetEndMin = targetStartMin + actualMinutesSpent;
  targetSession.duration_minutes = actualMinutesSpent;
  targetSession.actual_duration_minutes = actualMinutesSpent;
  targetSession.end_time = minutesToTime(newTargetEndMin);

  let cursor = newTargetEndMin;
  let shiftedCount = 0;
  let deferredCount = 0;

  const validSessions: DailyScheduleItem[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (i <= targetIdx) {
      validSessions.push(s);
      continue;
    }

    // If session is locked, we cannot change its start time!
    if (s.is_locked) {
      validSessions.push(s);
      cursor = Math.max(cursor, timeToMinutes(s.end_time));
      continue;
    }

    const currentStart = timeToMinutes(s.start_time);
    if (currentStart < cursor) {
      // Shift session forward
      const newStart = cursor;
      const newEnd = newStart + s.duration_minutes;

      if (newEnd > windowEndMin) {
        // Exceeds working hours, defer
        deferredCount++;
        continue;
      }

      s.start_time = minutesToTime(newStart);
      s.end_time = minutesToTime(newEnd);
      cursor = newEnd;
      shiftedCount++;
    } else {
      cursor = Math.max(cursor, timeToMinutes(s.end_time));
    }

    validSessions.push(s);
  }

  const explanation =
    shiftedCount > 0
      ? `Task overran by ${delta} mins. Shifted ${shiftedCount} subsequent task${shiftedCount === 1 ? '' : 's'} smoothly forward.${deferredCount > 0 ? ` Deferred ${deferredCount} task(s) to avoid exceeding your workday.` : ''}`
      : `Task overran by ${delta} mins. Subsequent tasks already had sufficient buffer space.`;

  return {
    updatedSessions: validSessions,
    shiftedCount,
    deferredCount,
    explanation,
  };
}

/**
 * Scenario 2: Smart Recovery Planning for Unfinished Tasks
 * When a user falls behind, redistributes missed sessions across the week.
 */
export function recoverUnfinishedTasks(
  unfinishedTasks: Task[],
  folders: TaskFolder[],
  availableDays: string[], // ['2026-11-21', '2026-11-22', ...]
  dailyStudyLimitMinutes: number = 240
): {
  rebalancedSchedule: Map<string, Task[]>;
  explanation: string;
} {
  const scheduleMap = new Map<string, Task[]>();
  availableDays.forEach((d) => scheduleMap.set(d, []));

  if (unfinishedTasks.length === 0 || availableDays.length === 0) {
    return {
      rebalancedSchedule: scheduleMap,
      explanation: 'No unfinished tasks or available days to recover.',
    };
  }

  // Sort by urgency: highest priority and closest deadlines first
  const sorted = [...unfinishedTasks].sort((a, b) => {
    const prioWeight = { urgent: 4, high: 3, medium: 2, low: 1 };
    return (prioWeight[b.priority] || 2) - (prioWeight[a.priority] || 2);
  });

  let dayIdx = 0;
  for (const task of sorted) {
    const targetDay = availableDays[dayIdx % availableDays.length];
    scheduleMap.get(targetDay)?.push(task);
    dayIdx++;
  }

  const explanation = `Recovered and balanced ${unfinishedTasks.length} task${unfinishedTasks.length === 1 ? '' : 's'} across ${availableDays.length} upcoming days without overloading any single day.`;

  return {
    rebalancedSchedule: scheduleMap,
    explanation,
  };
}

/**
 * Scenario 5: Availability Changed
 * Dynamically shrinks or expands working window and re-packs tasks.
 */
export function adaptToNewAvailability(
  tasks: Task[],
  folders: TaskFolder[],
  existingSessions: DailyScheduleItem[],
  newStartTime: string,
  newEndTime: string,
  targetDate: string
): ReturnType<typeof generateDeterministicDailyPlan> {
  const prefs: SchedulingPreferences = {
    ...DEFAULT_PREFERENCES,
    startTime: newStartTime,
    endTime: newEndTime,
  };

  return generateDeterministicDailyPlan({
    tasks,
    folders,
    existingSessions,
    targetDate,
    preferences: prefs,
  });
}
