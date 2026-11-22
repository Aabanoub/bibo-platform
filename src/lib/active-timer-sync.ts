// ============================================================================
// Cross-Device Active Study Timer Synchronization Service
// Synchronizes active timer state across phones, tablets, and desktops using
// Supabase database persistence, wall-clock time delta adjustment, and Realtime broadcast.
// ============================================================================

import { SupabaseClient } from '@supabase/supabase-js';
import type { ActiveStudyTimerState, ScheduleSessionType } from '@/types';

export interface AdjustedTimerState {
  sessionId: string;
  sessionType: ScheduleSessionType;
  title: string;
  durationMinutes: number;
  totalSeconds: number;
  secondsLeft: number;
  isRunning: boolean;
  isFinished: boolean;
}

/**
 * Calculates current seconds left based on elapsed real-world wall-clock time
 */
export function computeAdjustedTimerState(
  saved: ActiveStudyTimerState
): AdjustedTimerState {
  if (!saved.is_running) {
    return {
      sessionId: saved.session_id,
      sessionType: saved.session_type || 'task',
      title: saved.title,
      durationMinutes: saved.duration_minutes || Math.round(saved.total_seconds / 60),
      totalSeconds: saved.total_seconds,
      secondsLeft: saved.seconds_left,
      isRunning: false,
      isFinished: saved.seconds_left <= 0,
    };
  }

  // Timer was running: compute seconds elapsed since started_at timestamp
  const startedAtMs = new Date(saved.started_at).getTime();
  const nowMs = Date.now();
  const elapsedSec = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  const adjustedLeft = Math.max(0, saved.seconds_left - elapsedSec);

  return {
    sessionId: saved.session_id,
    sessionType: saved.session_type || 'task',
    title: saved.title,
    durationMinutes: saved.duration_minutes || Math.round(saved.total_seconds / 60),
    totalSeconds: saved.total_seconds,
    secondsLeft: adjustedLeft,
    isRunning: adjustedLeft > 0,
    isFinished: adjustedLeft <= 0,
  };
}

/**
 * Saves or updates the active study timer in Supabase for cross-device sync
 */
export async function saveActiveTimerToDb(
  supabase: SupabaseClient,
  userId: string,
  state: {
    sessionId: string;
    sessionType: ScheduleSessionType;
    title: string;
    durationMinutes: number;
    totalSeconds: number;
    secondsLeft: number;
    isRunning: boolean;
  }
): Promise<void> {
  const nowIso = new Date().toISOString();
  const payload: ActiveStudyTimerState = {
    session_id: state.sessionId,
    session_type: state.sessionType,
    title: state.title,
    duration_minutes: state.durationMinutes,
    total_seconds: state.totalSeconds,
    seconds_left: state.secondsLeft,
    is_running: state.isRunning,
    started_at: nowIso,
    updated_at: nowIso,
  };

  try {
    // 1. Primary write to dedicated active_study_timers table
    const { error: tableErr } = await supabase.from('active_study_timers').upsert({
      user_id: userId,
      ...payload,
    });

    if (tableErr) {
      console.warn('active_study_timers table write notice:', tableErr.message);
    }

    // 2. Fallback/caching write to profiles.active_study_timer
    await supabase
      .from('profiles')
      .update({
        active_study_timer: payload,
        updated_at: nowIso,
      })
      .eq('id', userId);
  } catch (err) {
    console.error('Error saving active timer to DB:', err);
  }
}

/**
 * Clears the active study timer from Supabase when session completes or is cancelled
 */
export async function clearActiveTimerFromDb(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  try {
    await Promise.allSettled([
      supabase.from('active_study_timers').delete().eq('user_id', userId),
      supabase
        .from('profiles')
        .update({
          active_study_timer: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId),
    ]);
  } catch (err) {
    console.error('Error clearing active timer from DB:', err);
  }
}

/**
 * Loads the active study timer from Supabase
 */
export async function loadActiveTimerFromDb(
  supabase: SupabaseClient,
  userId: string
): Promise<AdjustedTimerState | null> {
  try {
    // 1. Check active_study_timers table
    const { data: tableData, error: tableErr } = await supabase
      .from('active_study_timers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!tableErr && tableData && tableData.session_id) {
      return computeAdjustedTimerState(tableData as ActiveStudyTimerState);
    }

    // 2. Check profiles.active_study_timer fallback
    const { data: profileData } = await supabase
      .from('profiles')
      .select('active_study_timer')
      .eq('id', userId)
      .maybeSingle();

    if (profileData?.active_study_timer?.session_id) {
      return computeAdjustedTimerState(
        profileData.active_study_timer as ActiveStudyTimerState
      );
    }
  } catch (err) {
    console.error('Error loading active timer from DB:', err);
  }

  return null;
}
