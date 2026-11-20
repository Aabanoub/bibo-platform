'use client';

import React from 'react';
import type { TaskFolder } from '@/types';
import {
  FOLDER_COLORS,
  FOLDER_ICONS,
} from '@/components/TaskFolderModal';
import {
  Calendar,
  Clock,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  ChevronRight,
  Folder,
  Sparkles,
} from 'lucide-react';

export function getFolderCountdown(dueDateStr: string | null) {
  if (!dueDateStr) return null;
  const now = new Date();
  const due = new Date(dueDateStr);

  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  const isOverdue = diffMs < 0 && Math.abs(diffHours) >= 1;
  const isToday =
    !isOverdue &&
    now.getFullYear() === due.getFullYear() &&
    now.getMonth() === due.getMonth() &&
    now.getDate() === due.getDate();
  const isTomorrow = !isOverdue && !isToday && diffDays === 1;

  let label = '';
  let badgeColor = '';

  if (isOverdue) {
    const overdueDays = Math.max(1, Math.abs(diffDays));
    label = `Exam Passed (${overdueDays}d ago)`;
    badgeColor = 'bg-red-500/20 text-red-300 border-red-500/40';
  } else if (isToday) {
    label = diffHours > 0 ? `Exam in ${diffHours}h today!` : `Exam Today!`;
    badgeColor = 'bg-amber-500/25 text-amber-300 border-amber-500/40 animate-pulse';
  } else if (isTomorrow) {
    label = `Exam Tomorrow`;
    badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  } else if (diffDays <= 7) {
    label = `${diffDays} days left`;
    badgeColor = 'bg-sky-500/20 text-sky-300 border-sky-500/30';
  } else {
    label = `${diffDays} days left`;
    badgeColor = 'bg-slate-800 text-slate-300 border-slate-700';
  }

  const formattedDate = due.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: due.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });

  const hasTime =
    dueDateStr.includes('T') &&
    !dueDateStr.endsWith('T00:00:00') &&
    !dueDateStr.endsWith('T00:00:00.000Z');
  const formattedTime = hasTime
    ? due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  return { label, badgeColor, formattedDate, formattedTime, isOverdue, isToday, diffDays };
}

interface TaskFolderCardProps {
  folder: TaskFolder;
  totalTasks: number;
  completedTasks: number;
  isSelected: boolean;
  onSelect: (folderId: string) => void;
  onEdit: (folder: TaskFolder, e: React.MouseEvent) => void;
  onDelete: (folder: TaskFolder, e: React.MouseEvent) => void;
  onAddLesson: (folder: TaskFolder, e: React.MouseEvent) => void;
}

export default function TaskFolderCard({
  folder,
  totalTasks,
  completedTasks,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onAddLesson,
}: TaskFolderCardProps) {
  const colorCfg = FOLDER_COLORS[folder.color] || FOLDER_COLORS.blue;
  const IconComponent = FOLDER_ICONS[folder.icon]?.icon || Folder;
  const countdown = getFolderCountdown(folder.due_date);
  const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const isAllDone = totalTasks > 0 && completedTasks === totalTasks;

  return (
    <div
      onClick={() => onSelect(folder.id)}
      className={`group relative rounded-2xl border p-4 sm:p-4.5 transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden ${
        isSelected
          ? `${colorCfg.border} bg-slate-900/95 ring-2 ${colorCfg.ring} shadow-xl scale-[1.01]`
          : 'border-slate-800/90 bg-slate-900/75 hover:border-slate-700 hover:bg-slate-900/90 hover:shadow-lg'
      }`}
    >
      {/* Ambient Glow Aura */}
      {isSelected && (
        <div
          className="absolute -right-8 -top-8 w-28 h-28 rounded-full blur-2xl opacity-20 pointer-events-none"
          style={{
            backgroundColor:
              folder.color === 'purple'
                ? '#9333ea'
                : folder.color === 'emerald'
                ? '#10b981'
                : folder.color === 'amber'
                ? '#f59e0b'
                : folder.color === 'rose'
                ? '#f43f5e'
                : '#0A84FF',
          }}
        />
      )}

      <div>
        {/* Top Header: Icon, Name & Action Menu */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-2 rounded-xl border shrink-0 transition-transform group-hover:scale-105 ${colorCfg.bg} ${colorCfg.border} ${colorCfg.text}`}
            >
              <IconComponent className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h4 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                  {folder.name}
                </h4>
                {isSelected && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-blue-500/25 border border-blue-500/40 text-blue-300">
                    Active
                  </span>
                )}
                {isAllDone && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-500/40 text-emerald-300">
                    Done
                  </span>
                )}
              </div>

              {folder.description && (
                <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                  {folder.description}
                </p>
              )}
            </div>
          </div>

          {/* Action buttons (Edit & Delete) */}
          <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => onEdit(folder, e)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Edit folder"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => onDelete(folder, e)}
              className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Delete folder"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Exam Due Date & Countdown Pill */}
        {countdown ? (
          <div className="flex items-center gap-2 flex-wrap mt-2 mb-3">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-300 bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 rounded-lg">
              <Calendar className="w-3 h-3 text-blue-400 shrink-0" />
              <span>Exam: {countdown.formattedDate}</span>
              {countdown.formattedTime && (
                <span className="text-slate-400 font-normal">({countdown.formattedTime})</span>
              )}
            </span>

            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${countdown.badgeColor}`}
            >
              <Clock className="w-2.5 h-2.5" />
              {countdown.label}
            </span>
          </div>
        ) : (
          <div className="mt-1 mb-2.5 text-[11px] text-slate-500 italic">
            No exam date set
          </div>
        )}
      </div>

      {/* Progress & Bottom Controls */}
      <div className="mt-2 pt-2.5 border-t border-slate-800/80 space-y-2">
        {/* Progress Bar & Ratio */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">
              {totalTasks === 0
                ? 'No lessons yet'
                : `${completedTasks} of ${totalTasks} lesson${totalTasks === 1 ? '' : 's'} done`}
            </span>
            <span className="font-semibold text-slate-300 font-mono text-[11px]">
              {percent}%
            </span>
          </div>

          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${colorCfg.gradient}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Direct Action: + Add Lesson button */}
        <div className="flex items-center justify-between pt-1 flex-wrap gap-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => onAddLesson(folder, e)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 py-1 px-2 rounded-lg hover:bg-blue-500/10 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Add Lesson</span>
            </button>
          </div>

          <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 group-hover:text-slate-200 transition-colors ml-auto">
            {isSelected ? 'Viewing' : 'View'}
            <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
