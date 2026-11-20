'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  AlertTriangle,
  GraduationCap,
  ArrowRight,
  TrendingUp,
  BarChart2,
  CheckCircle2,
} from 'lucide-react';
import type { Task, TaskFolder, DailyScheduleItem } from '@/types';
import { calculateWeeklyForecast } from '@/lib/weekly-forecast';

interface WeeklyForecastViewProps {
  tasks: Task[];
  folders: TaskFolder[];
  scheduleItems?: DailyScheduleItem[];
  onSelectDate?: (dateStr: string) => void;
  onNavigateToPlanner?: () => void;
}

export default function WeeklyForecastView({
  tasks,
  folders,
  scheduleItems = [],
  onSelectDate,
  onNavigateToPlanner,
}: WeeklyForecastViewProps) {
  // Start date for the 7-day window (defaults to today)
  const [currentStartOffset, setCurrentStartOffset] = useState<number>(0);

  const windowStartDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + currentStartOffset * 7);
    return d;
  }, [currentStartOffset]);

  const forecast = useMemo(() => {
    return calculateWeeklyForecast(tasks, folders, windowStartDate, scheduleItems);
  }, [tasks, folders, windowStartDate, scheduleItems]);

  function handlePrevWeek() {
    setCurrentStartOffset((prev) => prev - 1);
  }

  function handleNextWeek() {
    setCurrentStartOffset((prev) => prev + 1);
  }

  function handleCurrentWeek() {
    setCurrentStartOffset(0);
  }

  const formatShortDate = (isoDate: string) => {
    const parts = isoDate.split('-');
    if (parts.length < 3) return isoDate;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getWorkloadStyle = (status: 'light' | 'balanced' | 'heavy' | 'overloaded') => {
    switch (status) {
      case 'overloaded':
        return {
          badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          border: 'border-rose-500/40 hover:border-rose-500/70',
          bar: 'bg-rose-500',
          glow: 'shadow-rose-500/10',
          label: 'Overloaded',
        };
      case 'heavy':
        return {
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          border: 'border-amber-500/30 hover:border-amber-500/60',
          bar: 'bg-amber-500',
          glow: 'shadow-amber-500/10',
          label: 'Heavy',
        };
      case 'light':
        return {
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          border: 'border-slate-800 hover:border-slate-700',
          bar: 'bg-emerald-500',
          glow: '',
          label: 'Light',
        };
      case 'balanced':
      default:
        return {
          badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
          border: 'border-slate-800 hover:border-blue-500/40',
          bar: 'bg-blue-500',
          glow: 'shadow-blue-500/5',
          label: 'Balanced',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <BarChart2 size={18} />
            </span>
            <h2 className="text-lg font-bold text-white">7-Day Workload Forecast</h2>
            {currentStartOffset === 0 && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                This Week
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {formatShortDate(forecast.weekStart)} – {formatShortDate(forecast.weekEnd)} &bull;{' '}
            <span className="text-slate-200 font-semibold">{forecast.totalWeeklyTasks} tasks scheduled</span> &bull;{' '}
            <span className="text-slate-200 font-semibold">{forecast.totalWeeklyHours} total study hours</span>
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {currentStartOffset !== 0 && (
            <button
              type="button"
              onClick={handleCurrentWeek}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition"
            >
              Current Week
            </button>
          )}

          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5">
            <button
              type="button"
              onClick={handlePrevWeek}
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Previous Week"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2 text-xs font-medium text-slate-300">
              {currentStartOffset === 0
                ? 'Week 1'
                : currentStartOffset > 0
                ? `+${currentStartOffset} wks`
                : `${currentStartOffset} wks`}
            </span>
            <button
              type="button"
              onClick={handleNextWeek}
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Next Week"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Overloaded Alert / Recommendation Banner */}
      {forecast.overloadedDayNames.length > 0 && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 backdrop-blur-md flex items-start gap-3">
          <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 shrink-0 mt-0.5">
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-rose-200 flex items-center gap-2">
              <span>Workload Alert: {forecast.overloadedDayNames.join(', ')}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/30 text-rose-300 uppercase">
                Exceeds Capacity
              </span>
            </h4>
            <p className="text-xs text-rose-300/80 mt-0.5 leading-relaxed">
              {forecast.recommendation ||
                'Heavy task concentration detected. Consider redistributing 1–2 tasks across lighter days to avoid burnout.'}
            </p>
          </div>
        </div>
      )}

      {/* 7-Day Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {forecast.days.map((day) => {
          const style = getWorkloadStyle(day.workloadStatus);

          return (
            <div
              key={day.date}
              onClick={() => {
                if (onSelectDate) onSelectDate(day.date);
                if (onNavigateToPlanner) onNavigateToPlanner();
              }}
              className={`group relative rounded-2xl border ${style.border} ${style.glow} bg-slate-900/60 hover:bg-slate-900/90 p-3.5 sm:p-4 transition-all duration-200 flex flex-col justify-between cursor-pointer min-h-[250px] shadow-sm`}
            >
              <div>
                {/* Day Header */}
                <div className="flex items-start justify-between gap-1 mb-2.5">
                  <div>
                    <div className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors leading-tight">
                      {day.dayName}
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium">
                      {formatShortDate(day.date)}
                    </div>
                  </div>
                  {day.isToday && (
                    <span className="shrink-0 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-sm">
                      Today
                    </span>
                  )}
                </div>

                {/* Workload Status Pill */}
                <div className="mb-2">
                  <span
                    className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${style.badge}`}
                  >
                    {style.label}
                  </span>
                </div>

                {/* Exams badge if any */}
                {day.exams.length > 0 && (
                  <div
                    className="mb-2.5 px-2 py-1 rounded-lg bg-purple-950/60 border border-purple-500/40 text-purple-200 text-[10px] font-semibold flex items-center gap-1.5"
                    title={`Exam: ${day.exams.join(', ')}`}
                  >
                    <GraduationCap size={12} className="text-purple-400 shrink-0" />
                    <span className="truncate">{day.exams.join(', ')}</span>
                  </div>
                )}

                {/* Metrics */}
                <div className="space-y-1 text-xs mt-1">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Tasks:</span>
                    <span className="font-bold text-white font-mono">{day.totalTasks}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400">Est. Time:</span>
                    <span className="font-bold text-slate-200 font-mono">{day.estimatedHours}h</span>
                  </div>
                </div>

                {/* Mini Workload Gauge Bar */}
                <div className="mt-2.5 w-full h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
                  <div
                    className={`h-full ${style.bar} transition-all duration-300`}
                    style={{
                      width: `${day.estimatedHours > 0 ? Math.min(100, Math.max(10, (day.estimatedHours / 6) * 100)) : 0}%`,
                    }}
                  />
                </div>

                {/* Tasks Preview */}
                {day.items && day.items.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1">
                    {day.items.slice(0, 3).map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1.5 text-[10px] text-slate-300 truncate"
                        title={item.title}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            item.difficulty === 'hard'
                              ? 'bg-rose-400'
                              : item.difficulty === 'easy'
                              ? 'bg-emerald-400'
                              : 'bg-blue-400'
                          }`}
                        />
                        <span className="truncate font-medium">{item.title}</span>
                      </div>
                    ))}
                    {day.items.length > 3 && (
                      <p className="text-[9px] text-slate-500 font-medium pl-3">
                        +{day.items.length - 3} more tasks
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Navigation Link */}
              <div className="mt-auto pt-3 border-t border-slate-800/40 flex items-center justify-between text-[11px] text-slate-400 group-hover:text-blue-400 transition-colors">
                <span>View daily plan</span>
                <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
