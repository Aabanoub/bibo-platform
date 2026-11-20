'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { Task, TaskFolder, TaskPriority } from '@/types';
import {
  calculateSmartDistribution,
  SmartDistributionPlan,
  TaskInput,
} from '@/lib/smart-distribution';
import { extractLessonSequence, sortTasksByLessonSequence } from '@/lib/lesson-sequencing';
import {
  X,
  Sparkles,
  Calendar,
  Clock,
  Check,
  CheckCircle2,
  Folder,
  ArrowRight,
  Loader2,
  Layers,
  AlertCircle,
  HelpCircle,
  Plus,
} from 'lucide-react';
import { FOLDER_COLORS } from './TaskFolderModal';

interface SmartDistributeModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: TaskFolder[];
  tasks: Task[];
  initialFolderId?: string | null;
  onApplyDistribution: (updates: { taskId: string; dueDate: string }[]) => Promise<void>;
  onCreateBatchDistributed?: (
    folderId: string | null,
    folderName: string,
    deadline: string,
    newTasks: { title: string; priority: TaskPriority; dueDate: string }[]
  ) => Promise<void>;
}

export default function SmartDistributeModal({
  isOpen,
  onClose,
  folders,
  tasks,
  initialFolderId,
  onApplyDistribution,
  onCreateBatchDistributed,
}: SmartDistributeModalProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [deadline, setDeadline] = useState<string>('');
  const [mode, setMode] = useState<'existing' | 'create'>('existing');
  const [batchText, setBatchText] = useState('');
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialize folder & deadline when modal opens or initialFolderId changes
  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setSuccessMessage(null);

    const folder = folders.find((f) => f.id === initialFolderId);
    if (folder) {
      setSelectedFolderId(folder.id);
      if (folder.due_date) {
        setDeadline(folder.due_date.slice(0, 10));
      } else {
        // default 10 days ahead
        const d = new Date();
        d.setDate(d.getDate() + 10);
        setDeadline(d.toISOString().slice(0, 10));
      }
    } else {
      setSelectedFolderId(folders[0]?.id || 'all');
      const d = new Date();
      d.setDate(d.getDate() + 10);
      setDeadline(d.toISOString().slice(0, 10));
    }
  }, [isOpen, initialFolderId, folders]);

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  // Update deadline if folder has one
  const handleSelectFolder = (folderId: string) => {
    setSelectedFolderId(folderId);
    const f = folders.find((item) => item.id === folderId);
    if (f?.due_date) {
      setDeadline(f.due_date.slice(0, 10));
    }
  };

  // Preset days helper
  const setPresetDays = (daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    setDeadline(d.toISOString().slice(0, 10));
  };

  // Get candidate tasks based on selected folder
  const candidateTasks: TaskInput[] = useMemo(() => {
    if (mode === 'create') {
      // Parse batch text lines (strip bullets, preserve numbers like "1. Grammar" or "Lesson 1")
      const lines = batchText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      return lines.map((line, idx) => ({
        id: `draft-${idx}`,
        title: line.replace(/^[-*•\s]+/, '').trim() || line,
        status: 'todo' as const,
        priority: 'medium' as const,
      }));
    }

    // Existing pending tasks in selected folder or all
    if (!selectedFolderId || selectedFolderId === 'all') {
      return tasks.filter((t) => t.status !== 'done');
    }
    return tasks.filter((t) => t.folder_id === selectedFolderId && t.status !== 'done');
  }, [mode, batchText, selectedFolderId, tasks]);

  // Calculate the smart distribution plan
  const plan: SmartDistributionPlan<TaskInput> = useMemo(() => {
    if (!deadline || candidateTasks.length === 0) {
      return {
        schedule: [],
        totalTasks: candidateTasks.length,
        totalDays: 0,
        studyDays: 0,
        reviewBufferDays: 0,
        tasksPerDay: 0,
        deadlineStr: deadline,
        deadlineFormatted: deadline,
        summary: 'Select a deadline and at least 1 task to distribute.',
      };
    }

    const folderMap = new Map(folders.map((f) => [f.id, f]));
    return calculateSmartDistribution<TaskInput>(candidateTasks, deadline, new Date(), folderMap);
  }, [candidateTasks, deadline, folders]);

  if (!isOpen) return null;

  const handleApply = async () => {
    if (!deadline || plan.schedule.length === 0 || applying) return;
    setApplying(true);
    setError(null);

    try {
      if (mode === 'existing') {
        const updates = plan.schedule.map((item) => ({
          taskId: item.task.id!,
          dueDate: item.suggestedDueDate,
        }));
        await onApplyDistribution(updates);
        setSuccessMessage(
          `🎉 Successfully distributed ${updates.length} tasks across ${plan.studyDays} days leading to ${plan.deadlineFormatted}!`
        );
      } else if (mode === 'create' && onCreateBatchDistributed) {
        const newTasks = plan.schedule.map((item) => ({
          title: item.task.title,
          priority: (item.task.priority || 'medium') as TaskPriority,
          dueDate: item.suggestedDueDate,
        }));
        await onCreateBatchDistributed(
          selectedFolderId === 'all' ? null : selectedFolderId,
          selectedFolder?.name || 'Exam Preparation',
          deadline,
          newTasks
        );
        setSuccessMessage(
          `🎉 Successfully created & distributed ${newTasks.length} lessons leading to ${plan.deadlineFormatted}!`
        );
      }

      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: unknown) {
      console.error('Failed to apply smart distribution:', err);
      setError(err instanceof Error ? err.message : 'Failed to apply schedule');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 relative">
        {/* Ambient Top Glow */}
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-20 bg-blue-500 pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 pb-4 border-b border-slate-800 shrink-0 relative z-10 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 border border-blue-400/30">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg text-white tracking-tight">
                  Smart Workload Distribution
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  AI Balancing
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Evenly distributes tasks across available days instead of dumping everything on the deadline.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Mode Tabs */}
          <div className="flex p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode('existing')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                mode === 'existing'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Balance Existing Tasks ({tasks.filter((t) => t.status !== 'done').length})</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('create')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                mode === 'create'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Batch Add & Distribute Lessons</span>
            </button>
          </div>

          {/* Folder & Deadline Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Target Folder */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1 flex items-center gap-1">
                <Folder className="w-3 h-3 text-blue-400" />
                Target Exam / Folder
              </label>
              <select
                value={selectedFolderId}
                onChange={(e) => handleSelectFolder(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
              >
                <option value="all">📂 All Unfiled / General Tasks</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name} {f.due_date ? `(Exam: ${new Date(f.due_date).toLocaleDateString([], { month: 'short', day: 'numeric' })})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Deadline Date */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-blue-400" />
                Exam / Deadline Date *
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500 cursor-pointer"
                required
              />
            </div>
          </div>

          {/* Quick Presets Strip */}
          <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
            <span className="text-slate-400 font-medium">Quick deadlines:</span>
            <button
              type="button"
              onClick={() => setPresetDays(3)}
              className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            >
              In 3 Days
            </button>
            <button
              type="button"
              onClick={() => setPresetDays(7)}
              className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            >
              In 1 Week
            </button>
            <button
              type="button"
              onClick={() => setPresetDays(10)}
              className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-blue-300"
            >
              In 10 Days
            </button>
            <button
              type="button"
              onClick={() => setPresetDays(14)}
              className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            >
              In 2 Weeks
            </button>
            <button
              type="button"
              onClick={() => setPresetDays(30)}
              className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            >
              In 1 Month
            </button>
          </div>

          {/* If Create Mode: Multiline Input */}
          {mode === 'create' && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Lessons / Tasks to Add (1 per line)
              </label>
              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder={'Lesson 1: Introduction\nLesson 2: Core Concepts\nLesson 3: Advanced Topics\nLesson 4: Practice Problems\nLesson 5: Mock Exam'}
                rows={4}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Type or paste lesson titles. Each line will become a separate task distributed across the days.
              </p>
            </div>
          )}

          {/* Distribution Plan Metrics Summary */}
          {plan.schedule.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-blue-500/20 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-blue-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Workload Blueprint
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {plan.totalDays} days available
                </span>
              </div>

              {/* Stat Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-base font-bold text-white font-mono">{plan.totalTasks}</div>
                  <div className="text-[10px] text-slate-400">Total Lessons</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-base font-bold text-emerald-400 font-mono">
                    ~{plan.tasksPerDay}
                  </div>
                  <div className="text-[10px] text-slate-400">Pace / Day</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-base font-bold text-sky-400 font-mono">{plan.studyDays}d</div>
                  <div className="text-[10px] text-slate-400">Study Window</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-base font-bold text-amber-400 font-mono">
                    {plan.reviewBufferDays}d
                  </div>
                  <div className="text-[10px] text-slate-400">Review Buffer</div>
                </div>
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed">{plan.summary}</p>
            </div>
          )}

          {/* Schedule Timeline Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                Scheduled Timeline Preview ({plan.schedule.length} items)
              </span>
              {plan.reviewBufferDays > 0 && (
                <span className="text-[10px] text-amber-300 font-medium bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                  Exam & Review: {plan.deadlineFormatted}
                </span>
              )}
            </div>

            {plan.schedule.some((i) => extractLessonSequence(i.task.title).sequenceNumber !== null) && (
              <div className="mb-2.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-[11px] text-emerald-300">
                <span>📚</span>
                <span>
                  <strong>Pedagogical Order Enforced:</strong> Lessons are arranged in ascending sequence (e.g. Lesson 1 → Lesson 5) so earlier material is always studied first.
                </span>
              </div>
            )}

            {plan.schedule.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-slate-950/40 border border-slate-800 text-slate-500">
                <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                <p className="text-xs">No tasks available to distribute in this selection.</p>
                {mode === 'existing' && (
                  <p className="text-[11px] text-slate-600 mt-1">
                    Try switching to "Batch Add Lessons" or pick a folder with pending tasks.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {plan.schedule.map((item, idx) => (
                  <div
                    key={item.task.id || idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-700 text-[10px] font-bold text-slate-300 font-mono">
                        {idx + 1}
                      </span>
                      <span className="text-xs text-white font-medium truncate">
                        {item.task.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-[10px] font-semibold text-blue-300 font-mono">
                        <Calendar className="w-3 h-3 text-blue-400" />
                        <span>{item.formattedWeekday}, {item.formattedDate}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-red-900/30 border border-red-800 text-red-300 text-xs">
              {error}
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-900/30 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-400 hidden sm:block">
            {plan.schedule.length > 0 && (
              <span>
                Pacing: <strong className="text-white">~{plan.tasksPerDay} task/day</strong> leading to {plan.deadlineFormatted}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={applying}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={plan.schedule.length === 0 || !deadline || applying}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 shadow-blue-500/25 hover:brightness-110 active:scale-95"
            >
              {applying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Applying Schedule...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Apply Smart Distribution</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
