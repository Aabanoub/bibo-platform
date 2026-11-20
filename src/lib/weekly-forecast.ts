// ============================================================================
// Weekly Workload Forecast Engine
// Projects 7-day workloads, highlights overloaded days, and recommends rebalancing
// ============================================================================

import type {
  Task,
  TaskFolder,
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
 * Calculates a 7-day workload forecast starting from `weekStartDate`.
 */
export function calculateWeeklyForecast(
  tasks: Task[],
  folders: TaskFolder[],
  weekStartDate: Date = new Date()
): WeeklyForecastResult {
  // Normalize to beginning of week (Monday) or selected start date
  const start = new Date(weekStartDate);
  start.setHours(0, 0, 0, 0);

  const foldersMap = new Map(folders.map((f) => [f.id, f]));
  const days: WeeklyForecastDay[] = [];

  const todayStr = new Date().toISOString().split('T')[0];

  let totalWeeklyMinutes = 0;
  let totalWeeklyTasks = 0;
  const overloadedDays: string[] = [];

  for (let i = 0; i < 7; i++) {
    const currentDay = new Date(start);
    currentDay.setDate(start.getDate() + i);
    const dateStr = currentDay.toISOString().split('T')[0];

    const dayName = currentDay.toLocaleDateString('en-US', { weekday: 'short' });
    const isToday = dateStr === todayStr;

    // Find tasks due or scheduled on this day
    const dayTasks = tasks.filter((t) => {
      const folder = t.folder_id ? foldersMap.get(t.folder_id) : undefined;
      const effectiveDueDate = t.due_date ? t.due_date.slice(0, 10) : folder?.due_date?.slice(0, 10);
      return effectiveDueDate === dateStr;
    });

    // Find folder exams on this day
    const dayExams = folders
      .filter((f) => f.due_date && f.due_date.slice(0, 10) === dateStr)
      .map((f) => f.name);

    // Sum estimated study minutes
    const dayMinutes = dayTasks.reduce((sum, t) => {
      const duration =
        t.estimated_duration && t.estimated_duration > 0
          ? t.estimated_duration
          : getDefaultDurationForDifficulty(t.difficulty);
      return sum + duration;
    }, 0);

    const estimatedHours = Number((dayMinutes / 60).toFixed(1));
    totalWeeklyMinutes += dayMinutes;
    totalWeeklyTasks += dayTasks.length;

    // Thresholds: >5 hours or >6 tasks is heavy; >7 hours or >8 tasks is overloaded
    let workloadStatus: 'light' | 'balanced' | 'heavy' | 'overloaded' = 'balanced';
    let isOverloaded = false;

    if (dayMinutes > 360 || dayTasks.length >= 8) {
      workloadStatus = 'overloaded';
      isOverloaded = true;
      overloadedDays.push(dayName);
    } else if (dayMinutes > 240 || dayTasks.length >= 5) {
      workloadStatus = 'heavy';
    } else if (dayMinutes < 60 && dayTasks.length <= 1) {
      workloadStatus = 'light';
    }

    let suggestedAction: string | undefined;
    if (isOverloaded) {
      suggestedAction = `Consider shifting 1–2 tasks from ${dayName} to lighter adjacent days.`;
    } else if (dayExams.length > 0) {
      suggestedAction = `Exam day (${dayExams.join(', ')}). Reserve for review and calm focus.`;
    }

    days.push({
      date: dateStr,
      dayName,
      isToday,
      totalTasks: dayTasks.length,
      estimatedHours,
      exams: dayExams,
      deadlines: dayTasks.map((t) => t.title),
      workloadStatus,
      isOverloaded,
      suggestedAction,
    });
  }

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  let recommendation: string | undefined;
  if (overloadedDays.length > 0) {
    recommendation = `Workload spike detected on ${overloadedDays.join(', ')}. Use Smart Distribution to balance lessons across earlier weekdays.`;
  } else {
    recommendation = `Your weekly study load is well-balanced across all 7 days with consistent daily study blocks.`;
  }

  return {
    weekStart: start.toISOString().split('T')[0],
    weekEnd: end.toISOString().split('T')[0],
    days,
    totalWeeklyHours: Number((totalWeeklyMinutes / 60).toFixed(1)),
    totalWeeklyTasks,
    overloadedDayNames: overloadedDays,
    recommendation,
  };
}
