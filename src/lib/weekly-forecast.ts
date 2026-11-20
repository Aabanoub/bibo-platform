// ============================================================================
// Weekly Workload Forecast Engine
// Projects 7-day workloads, highlights overloaded days, and recommends rebalancing
// Seamlessly merges AI Daily Plan schedules & tasks with deadlines
// ============================================================================

import type {
  Task,
  TaskFolder,
  DailyScheduleItem,
  WeeklyForecastDay,
} from '@/types';
import { getDefaultDurationForDifficulty } from './daily-planner';

export interface WeeklyForecastResult {
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  days: WeeklyForecastDay[];
  totalWeeklyHours: number;
  totalWeeklyTasks: number;
  overloadedDayNames: string[];
  recommendation?: string;
}

/**
 * Formats a Date object to local YYYY-MM-DD without UTC timezone slippage.
 */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Calculates a 7-day workload forecast starting from `weekStartDate`.
 * Integrates both AI Daily Planner sessions (`daily_schedule_items`) and task due dates.
 */
export function calculateWeeklyForecast(
  tasks: Task[] = [],
  folders: TaskFolder[] = [],
  weekStartDate: Date = new Date(),
  scheduleItems: DailyScheduleItem[] = []
): WeeklyForecastResult {
  const start = new Date(weekStartDate);
  start.setHours(0, 0, 0, 0);

  const foldersMap = new Map(folders.map((f) => [f.id, f]));
  const days: WeeklyForecastDay[] = [];

  const todayStr = toLocalDateStr(new Date());

  let totalWeeklyMinutes = 0;
  let totalWeeklyTasks = 0;
  const overloadedDays: string[] = [];

  for (let i = 0; i < 7; i++) {
    const currentDay = new Date(start);
    currentDay.setDate(start.getDate() + i);
    const dateStr = toLocalDateStr(currentDay);

    const dayName = currentDay.toLocaleDateString('en-US', { weekday: 'short' });
    const isToday = dateStr === todayStr;

    // 1. Find AI daily planner sessions scheduled for this date (excluding breaks)
    const daySessions = scheduleItems.filter(
      (s) => s.date === dateStr && s.session_type !== 'break'
    );
    const scheduledTaskIds = new Set(daySessions.map((s) => s.task_id).filter(Boolean));

    // 2. Find tasks with an explicit due date on this date (not already in daily schedule items)
    const pendingTasks = tasks.filter((t) => t.status !== 'done');
    const dayDueTasks = pendingTasks.filter((t) => {
      const explicitDueDate = t.due_date ? t.due_date.slice(0, 10) : null;
      return explicitDueDate === dateStr && !scheduledTaskIds.has(t.id);
    });

    // 3. Find folder exams on this day
    const dayExams = folders
      .filter((f) => f.due_date && f.due_date.slice(0, 10) === dateStr)
      .map((f) => f.name);

    // 4. Calculate total study minutes
    let dayMinutes = 0;

    // Minutes from scheduled sessions
    for (const session of daySessions) {
      dayMinutes += session.duration_minutes || 30;
    }

    // Minutes from due tasks
    for (const task of dayDueTasks) {
      const duration =
        task.estimated_duration && task.estimated_duration > 0
          ? task.estimated_duration
          : getDefaultDurationForDifficulty(task.difficulty);
      dayMinutes += duration;
    }

    const estimatedHours = Number((dayMinutes / 60).toFixed(1));
    const dayTotalTasks = daySessions.length + dayDueTasks.length;

    totalWeeklyMinutes += dayMinutes;
    totalWeeklyTasks += dayTotalTasks;

    // 5. Workload Classification
    // >5 hours (300 min) or >5 tasks is heavy; >6.5 hours (390 min) or >7 tasks is overloaded
    let workloadStatus: 'light' | 'balanced' | 'heavy' | 'overloaded' = 'balanced';
    let isOverloaded = false;

    if (dayMinutes >= 390 || dayTotalTasks >= 8) {
      workloadStatus = 'overloaded';
      isOverloaded = true;
      overloadedDays.push(dayName);
    } else if (dayMinutes >= 240 || dayTotalTasks >= 5) {
      workloadStatus = 'heavy';
    } else if (dayMinutes === 0 && dayTotalTasks === 0) {
      workloadStatus = 'light';
    } else if (dayMinutes < 90 && dayTotalTasks <= 2) {
      workloadStatus = 'light';
    }

    let suggestedAction: string | undefined;
    if (isOverloaded) {
      suggestedAction = `Workload alert: ${estimatedHours}h scheduled on ${dayName}. Consider redistributing 1–2 tasks to lighter days.`;
    } else if (dayExams.length > 0) {
      suggestedAction = `Exam day (${dayExams.join(', ')}). Reserve for review and calm focus.`;
    }

    // 6. Preview Items
    const previewItems: { title: string; difficulty?: string; duration_minutes: number }[] = [
      ...daySessions.map((s) => ({
        title: s.title,
        difficulty: s.difficulty,
        duration_minutes: s.duration_minutes,
      })),
      ...dayDueTasks.map((t) => ({
        title: t.title,
        difficulty: t.difficulty,
        duration_minutes:
          t.estimated_duration && t.estimated_duration > 0
            ? t.estimated_duration
            : getDefaultDurationForDifficulty(t.difficulty),
      })),
    ];

    days.push({
      date: dateStr,
      dayName,
      isToday,
      totalTasks: dayTotalTasks,
      estimatedHours,
      exams: dayExams,
      deadlines: previewItems.map((p) => p.title),
      items: previewItems,
      workloadStatus,
      isOverloaded,
      suggestedAction,
    });
  }

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  let recommendation: string | undefined;
  if (overloadedDays.length > 0) {
    recommendation = `Workload spike detected on ${overloadedDays.join(', ')}. Use Smart Distribution to balance sessions across lighter weekdays.`;
  } else if (totalWeeklyTasks > 0) {
    recommendation = `Your weekly study load is well-balanced across all 7 days with consistent daily study blocks.`;
  } else {
    recommendation = `No tasks scheduled for this week. Use "Generate Daily Plan" or Smart Distribution to plan your study week.`;
  }

  return {
    weekStart: toLocalDateStr(start),
    weekEnd: toLocalDateStr(end),
    days,
    totalWeeklyHours: Number((totalWeeklyMinutes / 60).toFixed(1)),
    totalWeeklyTasks,
    overloadedDayNames: overloadedDays,
    recommendation,
  };
}
