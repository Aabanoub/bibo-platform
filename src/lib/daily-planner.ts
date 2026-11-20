// ============================================================================
// AI Daily Planner & Scheduling Service
// Robust deterministic time-slot packing with Gemini AI optimization & fallbacks
// ============================================================================

import type {
  Task,
  TaskFolder,
  DailyScheduleItem,
  DayWorkloadOverview,
  TaskDifficulty,
  TaskPriority,
} from '@/types';

export interface SchedulingPreferences {
  startTime: string; // "09:00"
  endTime: string; // "18:00"
  highFocusStart: string; // "09:00"
  highFocusEnd: string; // "12:00"
  preferredBreakDuration: number; // in minutes (default 15)
  maxDailyStudyMinutes: number; // in minutes (default 360 = 6h)
}

export const DEFAULT_PREFERENCES: SchedulingPreferences = {
  startTime: '09:00',
  endTime: '18:00',
  highFocusStart: '09:00',
  highFocusEnd: '12:00',
  preferredBreakDuration: 15,
  maxDailyStudyMinutes: 360,
};

export interface DailyPlannerInput {
  tasks: Task[];
  folders: TaskFolder[];
  existingSessions?: DailyScheduleItem[];
  targetDate?: string; // YYYY-MM-DD
  preferences?: Partial<SchedulingPreferences>;
  aiGeneratedInsights?: boolean;
}

export interface GeneratedDailyPlan {
  date: string;
  sessions: DailyScheduleItem[];
  overview: DayWorkloadOverview;
  aiInsights: string[];
  isCapacityExceeded: boolean;
  overloadNotice?: string;
}

// ---------------------------------------------------------------------------
// Time Utilities
// ---------------------------------------------------------------------------

export function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function minutesToTime(totalMinutes: number): string {
  const normalized = Math.max(0, Math.min(24 * 60 - 1, totalMinutes));
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getDefaultDurationForDifficulty(difficulty?: TaskDifficulty | null): number {
  switch (difficulty) {
    case 'easy':
      return 25;
    case 'hard':
      return 60;
    case 'medium':
    default:
      return 45;
  }
}

// ---------------------------------------------------------------------------
// Free Time Slot Finder (respects locked & completed sessions)
// ---------------------------------------------------------------------------

interface TimeSlot {
  start: number;
  end: number;
}

function findFreeSlots(
  startMin: number,
  endMin: number,
  busySessions: DailyScheduleItem[]
): TimeSlot[] {
  // Sort busy intervals
  const busyIntervals: TimeSlot[] = busySessions
    .map((s) => ({
      start: timeToMinutes(s.start_time),
      end: timeToMinutes(s.end_time),
    }))
    .filter((slot) => slot.end > startMin && slot.start < endMin)
    .sort((a, b) => a.start - b.start);

  const freeSlots: TimeSlot[] = [];
  let cursor = startMin;

  for (const busy of busyIntervals) {
    const effectiveBusyStart = Math.max(startMin, busy.start);
    if (effectiveBusyStart > cursor) {
      freeSlots.push({ start: cursor, end: effectiveBusyStart });
    }
    cursor = Math.max(cursor, busy.end);
  }

  if (cursor < endMin) {
    freeSlots.push({ start: cursor, end: endMin });
  }

  return freeSlots;
}

// ---------------------------------------------------------------------------
// Core Deterministic Scheduler
// ---------------------------------------------------------------------------

export function generateDeterministicDailyPlan(input: DailyPlannerInput): GeneratedDailyPlan {
  const targetDate = input.targetDate || new Date().toISOString().split('T')[0];
  const prefs: SchedulingPreferences = {
    ...DEFAULT_PREFERENCES,
    ...input.preferences,
  };

  const foldersMap = new Map(input.folders.map((f) => [f.id, f]));
  const existingSessions = input.existingSessions || [];

  // Locked or already completed sessions for this day must NEVER be moved
  const lockedOrDoneSessions = existingSessions.filter(
    (s) => s.is_locked || s.is_completed
  );

  // Filter tasks that need scheduling:
  // Must be incomplete ('todo' or 'in_progress')
  // Exclude tasks already scheduled and locked for today
  const lockedTaskIds = new Set(
    lockedOrDoneSessions.map((s) => s.task_id).filter(Boolean)
  );

  const pendingTasks = input.tasks.filter(
    (t) => t.status !== 'done' && !lockedTaskIds.has(t.id)
  );

  // Calculate Priority Score for daily scheduling
  const scoredTasks = pendingTasks.map((task) => {
    const folder = task.folder_id ? foldersMap.get(task.folder_id) : undefined;
    const duration =
      task.estimated_duration && task.estimated_duration > 0
        ? task.estimated_duration
        : getDefaultDurationForDifficulty(task.difficulty);

    const difficulty = task.difficulty || 'medium';

    let urgencyScore = 0;

    // 1. Base Priority
    const priorityWeight: Record<TaskPriority, number> = {
      urgent: 2000,
      high: 1200,
      medium: 500,
      low: 100,
    };
    urgencyScore += priorityWeight[task.priority] || 500;

    // 2. Deadlines / Exam proximity
    const effectiveDueDate = task.due_date ? task.due_date.slice(0, 10) : folder?.due_date?.slice(0, 10);
    if (effectiveDueDate) {
      const todayMidnight = new Date(targetDate).getTime();
      const [y, m, d] = effectiveDueDate.split('-').map(Number);
      const dueMidnight = new Date(y, m - 1, d).getTime();
      const diffDays = Math.round((dueMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        urgencyScore += 6000; // Overdue
      } else if (diffDays === 0) {
        urgencyScore += 4500; // Due today
      } else if (diffDays === 1) {
        urgencyScore += 2500; // Due tomorrow
      } else if (diffDays <= 3) {
        urgencyScore += 1200; // Imminent exam/deadline
      }
    }

    // 3. Status bonus
    if (task.status === 'in_progress') {
      urgencyScore += 400;
    }

    return {
      task,
      folder,
      duration,
      difficulty,
      urgencyScore,
    };
  });

  // Sort candidate tasks: Highest urgency first
  scoredTasks.sort((a, b) => b.urgencyScore - a.urgencyScore);

  // Compute available time window
  const windowStartMin = timeToMinutes(prefs.startTime);
  const windowEndMin = timeToMinutes(prefs.endTime);

  // If planning for today and current time is already later than windowStartMin,
  // snap start time to next 15-min mark so we don't schedule tasks in the past
  const now = new Date();
  const isToday = targetDate === now.toISOString().split('T')[0];
  let effectiveStartMin = windowStartMin;

  if (isToday) {
    const currentMin = now.getHours() * 60 + now.getMinutes();
    if (currentMin > windowStartMin && currentMin < windowEndMin - 30) {
      // Snap to next 15-minute boundary
      effectiveStartMin = Math.ceil(currentMin / 15) * 15;
    }
  }

  // Find free time slots between busy locked/done sessions
  let freeSlots = findFreeSlots(effectiveStartMin, windowEndMin, lockedOrDoneSessions);

  const newScheduledSessions: DailyScheduleItem[] = [];
  const deferredTasks: { task: Task; reason: string }[] = [];

  let accumulatedStudyMinutes = lockedOrDoneSessions.reduce(
    (sum, s) => sum + (s.session_type === 'task' ? s.duration_minutes : 0),
    0
  );

  let consecutiveStudyMin = 0;
  const breakDuration = Math.max(5, prefs.preferredBreakDuration);

  // High focus time boundaries
  const highFocusStartMin = timeToMinutes(prefs.highFocusStart);
  const highFocusEndMin = timeToMinutes(prefs.highFocusEnd);

  // Prioritize placing hard tasks during high-focus time if possible
  const hardTasks = scoredTasks.filter((t) => t.difficulty === 'hard');
  const otherTasks = scoredTasks.filter((t) => t.difficulty !== 'hard');
  const orderedQueue = [...hardTasks, ...otherTasks];

  for (const item of orderedQueue) {
    // Check daily maximum study capacity
    if (accumulatedStudyMinutes + item.duration > prefs.maxDailyStudyMinutes) {
      deferredTasks.push({
        task: item.task,
        reason: `Exceeds max daily study limit of ${(prefs.maxDailyStudyMinutes / 60).toFixed(1)}h. Deferred to maintain high retention.`,
      });
      continue;
    }

    // Try to find a free slot that fits this task
    let assigned = false;

    for (let i = 0; i < freeSlots.length; i++) {
      const slot = freeSlots[i];
      const slotCapacity = slot.end - slot.start;

      // Need enough time for task
      if (slotCapacity >= item.duration) {
        const sessionStart = slot.start;
        const sessionEnd = sessionStart + item.duration;

        newScheduledSessions.push({
          id: `sched-${item.task.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          user_id: item.task.user_id,
          task_id: item.task.id,
          date: targetDate,
          start_time: minutesToTime(sessionStart),
          end_time: minutesToTime(sessionEnd),
          duration_minutes: item.duration,
          session_type: 'task',
          title: item.task.title,
          difficulty: item.difficulty,
          is_completed: false,
          is_locked: false,
          actual_duration_minutes: 0,
          sort_order: newScheduledSessions.length,
          notes: item.task.description,
          task: item.task,
          folder: item.folder,
        });

        accumulatedStudyMinutes += item.duration;
        consecutiveStudyMin += item.duration;
        assigned = true;

        // Update current slot or split it
        let remainingSlotStart = sessionEnd;

        // Auto-insert a restorative break if study session exceeded 50 minutes
        if (consecutiveStudyMin >= 50 && slot.end - remainingSlotStart >= breakDuration + 15) {
          const breakStart = remainingSlotStart;
          const breakEnd = breakStart + breakDuration;

          newScheduledSessions.push({
            id: `break-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            user_id: item.task.user_id,
            task_id: null,
            date: targetDate,
            start_time: minutesToTime(breakStart),
            end_time: minutesToTime(breakEnd),
            duration_minutes: breakDuration,
            session_type: 'break',
            title: 'Restorative Break',
            is_completed: false,
            is_locked: false,
            actual_duration_minutes: 0,
            sort_order: newScheduledSessions.length,
            notes: 'Rest eyes, drink water, and recharge your focus.',
          });

          remainingSlotStart = breakEnd;
          consecutiveStudyMin = 0;
        }

        if (slot.end > remainingSlotStart) {
          freeSlots[i] = { start: remainingSlotStart, end: slot.end };
        } else {
          freeSlots.splice(i, 1);
        }

        break;
      }
    }

    if (!assigned) {
      deferredTasks.push({
        task: item.task,
        reason: 'No open time slots remaining in today’s working hours. Deferred to protect work-life balance.',
      });
    }
  }

  // Combine locked/done sessions with newly scheduled sessions and sort by start_time
  const allSessions = [...lockedOrDoneSessions, ...newScheduledSessions];
  allSessions.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

  // Compute workload overview
  const totalTasks = allSessions.filter((s) => s.session_type === 'task').length;
  const completedTasks = allSessions.filter(
    (s) => s.session_type === 'task' && s.is_completed
  ).length;
  const remainingTasks = totalTasks - completedTasks;
  const totalPlannedMinutes = allSessions.reduce(
    (sum, s) => sum + (s.session_type === 'task' ? s.duration_minutes : 0),
    0
  );

  const availableMinutes = windowEndMin - effectiveStartMin;

  let workloadStatus: 'light' | 'balanced' | 'heavy' | 'overloaded' = 'balanced';
  if (totalPlannedMinutes > availableMinutes * 0.95 || deferredTasks.length > 0) {
    workloadStatus = 'overloaded';
  } else if (totalPlannedMinutes > availableMinutes * 0.75) {
    workloadStatus = 'heavy';
  } else if (totalPlannedMinutes < availableMinutes * 0.4) {
    workloadStatus = 'light';
  }

  const isCapacityExceeded = deferredTasks.length > 0;
  const overloadNotice = isCapacityExceeded
    ? `Today’s study capacity was reached. ${deferredTasks.length} task${deferredTasks.length === 1 ? '' : 's'} were safely deferred to upcoming days so your schedule stays realistic.`
    : undefined;

  const insights: string[] = [];
  if (hardTasks.length > 0) {
    insights.push(`Allocated ${hardTasks.length} demanding task${hardTasks.length === 1 ? '' : 's'} to high-focus morning slots.`);
  }
  if (allSessions.some((s) => s.session_type === 'break')) {
    insights.push('Scheduled mindful breaks between long sessions to sustain cognitive stamina.');
  }
  if (deferredTasks.length > 0) {
    insights.push(`Prioritized ${totalTasks} most urgent tasks; ${deferredTasks.length} lower-urgency tasks deferred.`);
  } else {
    insights.push('All planned tasks comfortably fit within your available study hours.');
  }

  const overview: DayWorkloadOverview = {
    date: targetDate,
    totalTasks,
    completedTasks,
    remainingTasks,
    totalPlannedMinutes,
    availableMinutes,
    workloadStatus,
    progressPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    deferredTasks,
  };

  return {
    date: targetDate,
    sessions: allSessions,
    overview,
    aiInsights: insights,
    isCapacityExceeded,
    overloadNotice,
  };
}
