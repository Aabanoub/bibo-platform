/**
 * Salary Distribution System - Utilities & Calculations
 * Implements deterministic occurrence keying, exact Largest Remainder allocation,
 * and flexible multi-frequency payday scheduling.
 */

export type SalaryFrequency = 'monthly' | 'biweekly' | 'weekly' | 'custom';

export interface SalaryCategoryAllocation {
  id: string;
  name: string;
  emoji: string;
  percentage: number;
}

export interface ScheduleConfig {
  day_of_month?: number; // 1-31
  is_end_of_month?: boolean;
  day_of_week?: number; // 0 (Sun) - 6 (Sat)
  anchor_date?: string; // YYYY-MM-DD reference start date for biweekly
  interval_days?: number; // for custom interval
  manual_only?: boolean;
}

export interface SalaryPlan {
  id: string;
  user_id: string;
  salary_amount: number;
  currency: string;
  frequency: SalaryFrequency;
  schedule_config: ScheduleConfig;
  timezone: string;
  is_active: boolean;
  allocations: SalaryCategoryAllocation[];
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem {
  id: string;
  name: string;
  emoji: string;
  percentage: number;
  allocated_amount: number;
  is_checked: boolean;
  checked_at: string | null;
}

export type SalaryCycleStatus = 'in_progress' | 'completed' | 'archived_incomplete' | 'dismissed';

export interface SalaryCycle {
  id: string;
  user_id: string;
  plan_id: string | null;
  source_transaction_id: string | null;
  occurrence_key: string;
  cycle_date: string;
  cycle_label: string;
  salary_amount: number;
  status: SalaryCycleStatus;
  checklist: ChecklistItem[];
  created_at: string;
  completed_at: string | null;
}

// Default category distribution template for fresh setups
export const DEFAULT_PLAN_ALLOCATIONS: SalaryCategoryAllocation[] = [
  { id: 'giving', name: 'Giving / Charity', emoji: '🤝', percentage: 10 },
  { id: 'food', name: 'Food & Groceries', emoji: '🍔', percentage: 30 },
  { id: 'entertainment', name: 'Entertainment & Outings', emoji: '🎬', percentage: 20 },
  { id: 'bills', name: 'Bills & Utilities', emoji: '📄', percentage: 20 },
  { id: 'other', name: 'Savings & Other', emoji: '📦', percentage: 20 },
];

/**
 * Largest Remainder (Hamilton-Hare) Allocation Algorithm
 * Computes exact monetary amounts such that:
 * 1. Base amounts are proportional to percentages.
 * 2. Leftover fractional currency units are distributed strictly by highest fractional remainder.
 * 3. Sum of all allocated amounts EXACTLY equals the salary.
 */
export function calculateExactAllocations(
  salary: number,
  allocations: SalaryCategoryAllocation[]
): ChecklistItem[] {
  if (salary <= 0 || allocations.length === 0) return [];

  // Determine if working with integer or decimal currency amounts
  // For most currencies, round to nearest whole unit if salary is integer, or 2 decimal places if salary has cents.
  const hasDecimals = salary % 1 !== 0;
  const factor = hasDecimals ? 100 : 1;

  const totalCents = Math.round(salary * factor);

  const baseCalculations = allocations.map((item) => {
    const rawVal = (totalCents * item.percentage) / 100;
    const baseVal = Math.floor(rawVal);
    const remainder = rawVal - baseVal;
    return {
      item,
      baseVal,
      remainder,
    };
  });

  const sumBase = baseCalculations.reduce((acc, c) => acc + c.baseVal, 0);
  let leftovers = totalCents - sumBase;

  // Sort by fractional remainder descending
  const sorted = [...baseCalculations].sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < leftovers; i++) {
    const target = sorted[i % sorted.length];
    target.baseVal += 1;
  }

  return baseCalculations.map(({ item, baseVal }) => ({
    id: item.id,
    name: item.name,
    emoji: item.emoji || '💰',
    percentage: item.percentage,
    allocated_amount: baseVal / factor,
    is_checked: false,
    checked_at: null,
  }));
}

/**
 * Computes deterministic occurrence keys to guarantee database-level idempotency
 * and prevent duplicate cycles across income triggers and scheduled paydays.
 */
export function computeOccurrenceKey(
  frequency: SalaryFrequency,
  scheduleConfig: ScheduleConfig,
  timezone: string = 'UTC',
  referenceDate: Date = new Date()
): string {
  // Use Intl to get local year, month, day in target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(referenceDate);
  const year = parts.find((p) => p.type === 'year')?.value || '2026';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';

  if (frequency === 'monthly') {
    return `monthly:${year}-${month}`;
  }

  if (frequency === 'weekly') {
    // ISO week number calculation
    const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `weekly:${year}-W${String(weekNo).padStart(2, '0')}`;
  }

  if (frequency === 'biweekly') {
    // If anchor_date provided, calculate biweekly cycle offset
    const anchor = scheduleConfig.anchor_date ? new Date(scheduleConfig.anchor_date) : new Date(Date.UTC(Number(year), 0, 1));
    const current = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const diffDays = Math.floor((current.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
    const cycleIndex = Math.floor(diffDays / 14);
    return `biweekly:${year}-B${cycleIndex}`;
  }

  // Custom / on-demand
  return `custom:${year}-${month}-${day}`;
}

/**
 * Generates an intuitive human-readable label for a distribution cycle.
 */
export function generateCycleLabel(
  frequency: SalaryFrequency,
  occurrenceKey: string,
  cycleDate: string = new Date().toISOString().split('T')[0]
): string {
  const [year, month, day] = cycleDate.split('-');
  const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
  const monthName = dateObj.toLocaleString('en-US', { month: 'long' });

  if (frequency === 'monthly') {
    return `${monthName} ${year} Salary`;
  }

  if (frequency === 'weekly') {
    return `Weekly Payout (${monthName} ${day})`;
  }

  if (frequency === 'biweekly') {
    return `Bi-weekly Payout (${monthName} ${day})`;
  }

  return `Salary Distribution (${monthName} ${day})`;
}

/**
 * Evaluates whether a scheduled payday is due for a plan in its configured timezone.
 * Handles month-length clamping (e.g. Feb 28/29, April 30, or end-of-month toggle).
 */
export function isPaydayDue(
  plan: SalaryPlan,
  now: Date = new Date()
): { isDue: boolean; occurrenceKey: string; expectedDateStr: string } {
  if (!plan.is_active || plan.frequency === 'custom') {
    const key = computeOccurrenceKey('custom', plan.schedule_config, plan.timezone, now);
    return { isDue: false, occurrenceKey: key, expectedDateStr: '' };
  }

  const tz = plan.timezone || 'UTC';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const currentDay = Number(parts.find((p) => p.type === 'day')?.value);

  const occurrenceKey = computeOccurrenceKey(plan.frequency, plan.schedule_config, tz, now);

  if (plan.frequency === 'monthly') {
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const targetDay = plan.schedule_config.is_end_of_month
      ? lastDayOfMonth
      : Math.min(plan.schedule_config.day_of_month || 25, lastDayOfMonth);

    const isDue = currentDay >= targetDay;
    const expectedDateStr = `${year}-${String(month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
    return { isDue, occurrenceKey, expectedDateStr };
  }

  if (plan.frequency === 'weekly') {
    // Check day of week
    const targetWeekday = plan.schedule_config.day_of_week ?? 5; // default Friday (5)
    // Local weekday in target timezone
    const weekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'narrow' });
    const localDate = new Date(Date.UTC(year, month - 1, currentDay));
    const currentWeekday = localDate.getUTCDay();

    const isDue = currentWeekday >= targetWeekday;
    const expectedDateStr = `${year}-${String(month).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
    return { isDue, occurrenceKey, expectedDateStr };
  }

  if (plan.frequency === 'biweekly') {
    const expectedDateStr = `${year}-${String(month).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
    return { isDue: true, occurrenceKey, expectedDateStr };
  }

  return { isDue: false, occurrenceKey, expectedDateStr: '' };
}

/**
 * Format currency amount with currency code or symbol
 */
export function formatCurrency(amount: number, currency: string = 'EGP'): string {
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

  if (currency === '$' || currency === 'USD') return `$${formatted}`;
  if (currency === '€' || currency === 'EUR') return `€${formatted}`;
  if (currency === '£' || currency === 'GBP') return `£${formatted}`;
  return `${formatted} ${currency}`;
}
