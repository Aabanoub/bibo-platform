// ============================================================================
// Smart Task Distribution Engine
// Distributes workload evenly across the timeframe preceding a deadline/exam.
// ============================================================================

export interface TaskInput {
  id?: string;
  title: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low';
  description?: string | null;
  status?: 'todo' | 'in_progress' | 'done';
  due_date?: string | null;
  folder_id?: string | null;
}

export interface ScheduledDistributionItem<T extends TaskInput = TaskInput> {
  task: T;
  suggestedDueDate: string; // YYYY-MM-DD
  dayOffset: number; // 1, 2, 3...
  formattedDate: string; // e.g. "Nov 21, 2026"
  formattedWeekday: string; // e.g. "Saturday"
  isReviewDay?: boolean;
}

export interface SmartDistributionPlan<T extends TaskInput = TaskInput> {
  schedule: ScheduledDistributionItem<T>[];
  totalTasks: number;
  totalDays: number;
  studyDays: number;
  reviewBufferDays: number;
  tasksPerDay: number;
  deadlineStr: string;
  deadlineFormatted: string;
  summary: string;
}

/**
 * Calculates an even distribution of tasks across the available timeframe
 * preceding a deadline (e.g., an exam date).
 *
 * Example:
 * If 10 tasks are due on Dec 2nd and today is Nov 20th (12 days total),
 * the algorithm allocates ~1 task per day across the 10 preceding days (Nov 21 - Nov 30),
 * leaving the final days (Dec 1 - Dec 2) for comprehensive review.
 */
export function calculateSmartDistribution<T extends TaskInput>(
  tasks: T[],
  deadlineInput: string | Date,
  startDateInput: Date = new Date()
): SmartDistributionPlan<T> {
  const pendingTasks = tasks.filter((t) => t.status !== 'done');
  const totalTasks = pendingTasks.length;

  // Normalize startDate to midnight
  const start = new Date(startDateInput);
  start.setHours(0, 0, 0, 0);

  // Normalize deadline to midnight
  const deadline = new Date(deadlineInput);
  deadline.setHours(0, 0, 0, 0);

  const diffMs = deadline.getTime() - start.getTime();
  const totalDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));

  const deadlineStr = deadline.toISOString().split('T')[0];
  const deadlineFormatted = deadline.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (totalTasks === 0 || totalDays <= 0) {
    const todayStr = start.toISOString().split('T')[0];
    return {
      schedule: pendingTasks.map((task) => ({
        task,
        suggestedDueDate: deadlineStr || todayStr,
        dayOffset: 0,
        formattedDate: deadlineFormatted,
        formattedWeekday: deadline.toLocaleDateString('en-US', { weekday: 'short' }),
      })),
      totalTasks,
      totalDays,
      studyDays: 0,
      reviewBufferDays: 0,
      tasksPerDay: totalTasks,
      deadlineStr,
      deadlineFormatted,
      summary: 'Due immediately or on deadline day.',
    };
  }

  // Determine review buffer:
  // If we have generous timeframe (totalDays >= totalTasks + 2), reserve 1-2 days buffer for exam review
  let reviewBufferDays = 0;
  if (totalDays >= totalTasks + 3) {
    reviewBufferDays = 2; // e.g. 1 review day + exam day
  } else if (totalDays >= totalTasks + 1) {
    reviewBufferDays = 1; // exam day reserved
  }

  const studyDays = Math.max(1, totalDays - reviewBufferDays);
  const tasksPerDay = Number((totalTasks / studyDays).toFixed(1));

  // Determine starting offset:
  // If totalDays > 1, start tomorrow (dayOffset = 1) so user has time to prepare today.
  // If totalDays === 1, start today (dayOffset = 0).
  const startDayOffset = totalDays > 1 ? 1 : 0;
  const effectiveStudyDays = totalDays > 1 ? Math.max(1, studyDays) : 1;

  const schedule: ScheduledDistributionItem<T>[] = pendingTasks.map((task, index) => {
    // Distribute index evenly across study days
    // fraction from 0 to 1
    const progress = totalTasks === 1 ? 0 : index / (totalTasks - 1 || 1);
    const dayOffset = startDayOffset + Math.round(progress * (effectiveStudyDays - 1));

    const assignedDate = new Date(start);
    assignedDate.setDate(assignedDate.getDate() + dayOffset);

    // Ensure it never exceeds the day before the deadline if reviewBufferDays > 0
    if (reviewBufferDays > 0 && assignedDate >= deadline) {
      assignedDate.setDate(deadline.getDate() - 1);
    }

    const assignedIso = assignedDate.toISOString().split('T')[0];

    return {
      task,
      suggestedDueDate: assignedIso,
      dayOffset,
      formattedDate: assignedDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      formattedWeekday: assignedDate.toLocaleDateString('en-US', {
        weekday: 'short',
      }),
    };
  });

  const summary =
    totalDays === 1
      ? `${totalTasks} task${totalTasks === 1 ? '' : 's'} scheduled for deadline day (${deadlineFormatted}).`
      : `${totalTasks} task${totalTasks === 1 ? '' : 's'} evenly distributed at ~${tasksPerDay} per day over ${studyDays} day${studyDays === 1 ? '' : 's'}, leaving ${reviewBufferDays} review buffer day${reviewBufferDays === 1 ? '' : 's'} before ${deadlineFormatted}.`;

  return {
    schedule,
    totalTasks,
    totalDays,
    studyDays,
    reviewBufferDays,
    tasksPerDay,
    deadlineStr,
    deadlineFormatted,
    summary,
  };
}
