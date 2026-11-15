'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import type { Task, TaskPriority, TaskStatus } from '@/types';
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Filter,
  AlertCircle,
  Loader2,
  X,
  Calendar,
  ClipboardList,
  ArrowRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];
const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: 'bg-red-600 text-red-100',
  high: 'bg-orange-600 text-orange-100',
  medium: 'bg-yellow-600 text-yellow-100',
  low: 'bg-green-600 text-green-100',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'border-slate-600',
  in_progress: 'border-blue-600',
  done: 'border-emerald-600',
};

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === 'done') return false;
  return new Date(task.due_date) < new Date(new Date().toDateString());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TasksPage() {
  const supabase = createClient();

  // ---- state --------------------------------------------------------------
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPriority, setFormPriority] = useState<TaskPriority>('medium');
  const [formDue, setFormDue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // filters
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('');
  const [filterStatus, setFilterStatus] = useState<TaskStatus | ''>('');
  const [showFilters, setShowFilters] = useState(false);

  // ---- fetch --------------------------------------------------------------
  const fetchTasks = useCallback(async () => {
    try {
      setError(null);
      const { data, error: err } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setTasks((data as Task[]) ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // ---- create task --------------------------------------------------------
  const createTask = async () => {
    if (!formTitle.trim()) return;
    setSubmitting(true);
    try {
      setError(null);
      const { data, error: err } = await supabase
        .from('tasks')
        .insert({
          title: formTitle.trim(),
          description: formDesc.trim() || null,
          priority: formPriority,
          status: 'todo' as TaskStatus,
          due_date: formDue || null,
        })
        .select()
        .single();
      if (err) throw err;
      const task = data as Task;
      setTasks((prev) => [task, ...prev]);

      // create notification
      await supabase.from('notifications').insert({
        title: 'New Task Created',
        message: `Task "${task.title}" has been added to your To Do list.`,
        type: 'task',
        is_read: false,
        action_url: '/tasks',
      });

      // reset form
      setFormTitle('');
      setFormDesc('');
      setFormPriority('medium');
      setFormDue('');
      setShowForm(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- move task ----------------------------------------------------------
  const moveTask = async (task: Task, direction: 'forward' | 'back') => {
    const order: TaskStatus[] = ['todo', 'in_progress', 'done'];
    const idx = order.indexOf(task.status);
    const next = direction === 'forward' ? order[idx + 1] : order[idx - 1];
    if (!next) return;

    try {
      setError(null);
      const { error: err } = await supabase
        .from('tasks')
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq('id', task.id);
      if (err) throw err;
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to move task');
    }
  };

  // ---- delete task --------------------------------------------------------
  const deleteTask = async (id: string) => {
    try {
      setError(null);
      const { error: err } = await supabase.from('tasks').delete().eq('id', id);
      if (err) throw err;
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete task');
    }
  };

  const deleteCompleted = async () => {
    const completed = tasks.filter((t) => t.status === 'done');
    if (completed.length === 0) return;
    try {
      setError(null);
      const { error: err } = await supabase
        .from('tasks')
        .delete()
        .in('id', completed.map((t) => t.id));
      if (err) throw err;
      setTasks((prev) => prev.filter((t) => t.status !== 'done'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete completed tasks');
    }
  };

  // ---- filtering ----------------------------------------------------------
  const filtered = tasks.filter((t) => {
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    return true;
  });

  const columns: Record<TaskStatus, Task[]> = {
    todo: filtered.filter((t) => t.status === 'todo'),
    in_progress: filtered.filter((t) => t.status === 'in_progress'),
    done: filtered.filter((t) => t.status === 'done'),
  };

  // ---- render -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-blue-400" />
            Tasks
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors ${
                showFilters || filterPriority || filterStatus
                  ? 'bg-blue-600 hover:bg-blue-500'
                  : 'bg-slate-800 hover:bg-slate-700'
              }`}
            >
              <Filter className="w-4 h-4" /> Filters
            </button>
            {columns.done.length > 0 && (
              <button
                onClick={deleteCompleted}
                className="px-3 py-2 rounded-lg text-sm bg-slate-800 hover:bg-red-600/80 transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> Clear Done
              </button>
            )}
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-3 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add Task
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Filters */}
        {showFilters && (
          <div className="mb-4 p-4 rounded-lg bg-slate-900 border border-slate-800 flex flex-wrap gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value as TaskPriority | '')}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as TaskStatus | '')}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            {(filterPriority || filterStatus) && (
              <button
                onClick={() => { setFilterPriority(''); setFilterStatus(''); }}
                className="self-end text-xs text-slate-400 hover:text-white underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Add Task Form */}
        {showForm && (
          <div className="mb-6 p-4 rounded-lg bg-slate-900 border border-slate-800">
            <h2 className="text-lg font-semibold mb-3">New Task</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Task title *"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
              />
              <select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value as TaskPriority)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
              <input
                type="date"
                value={formDue}
                onChange={(e) => setFormDue(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createTask}
                disabled={!formTitle.trim() || submitting}
                className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create
              </button>
            </div>
          </div>
        )}

        {/* Kanban */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STATUSES.map((status) => (
              <div key={status} className={`rounded-xl bg-slate-900 border-t-2 ${STATUS_COLORS[status]}`}>
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h2 className="font-semibold text-sm">{STATUS_LABELS[status]}</h2>
                  <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">
                    {columns[status].length}
                  </span>
                </div>
                <div className="p-3 space-y-2 min-h-[200px]">
                  {columns[status].length === 0 ? (
                    <p className="text-xs text-slate-600 text-center py-8">No tasks</p>
                  ) : (
                    columns[status].map((task) => (
                      <div
                        key={task.id}
                        className={`p-3 rounded-lg bg-slate-800/60 border transition-colors ${
                          isOverdue(task) ? 'border-red-700 bg-red-900/10' : 'border-slate-700/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{task.title}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${PRIORITY_COLORS[task.priority]}`}>
                            {task.priority}
                          </span>
                        </div>
                        {task.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>
                        )}
                        {task.due_date && (
                          <p className={`text-xs mt-1.5 flex items-center gap-1 ${isOverdue(task) ? 'text-red-400' : 'text-slate-500'}`}>
                            <Calendar className="w-3 h-3" />
                            {new Date(task.due_date).toLocaleDateString()}
                            {isOverdue(task) && ' (overdue)'}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
                          <div className="flex items-center gap-1">
                            {status !== 'todo' && (
                              <button
                                onClick={() => moveTask(task, 'back')}
                                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                                title={`Move to ${STATUS_LABELS[STATUSES[STATUSES.indexOf(status) - 1]]}`}
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                            )}
                            {status !== 'done' && (
                              <button
                                onClick={() => moveTask(task, 'forward')}
                                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center gap-0.5 text-xs"
                                title={`Move to ${STATUS_LABELS[STATUSES[STATUSES.indexOf(status) + 1]]}`}
                              >
                                <ArrowRight className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="p-1 rounded hover:bg-red-600/30 text-slate-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
