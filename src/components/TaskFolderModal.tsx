'use client';

import React, { useState, useEffect } from 'react';
import type { TaskFolder } from '@/types';
import {
  X,
  Folder,
  BookOpen,
  GraduationCap,
  FileText,
  Award,
  Calendar,
  Clock,
  Sparkles,
  Check,
  Loader2,
} from 'lucide-react';

export const FOLDER_COLORS: Record<
  string,
  { label: string; bg: string; text: string; border: string; ring: string; gradient: string }
> = {
  blue: {
    label: 'Electric Blue',
    bg: 'bg-blue-500/20',
    text: 'text-blue-300',
    border: 'border-blue-500/40',
    ring: 'ring-blue-500/30',
    gradient: 'from-blue-600 to-cyan-500',
  },
  purple: {
    label: 'Royal Purple',
    bg: 'bg-purple-500/20',
    text: 'text-purple-300',
    border: 'border-purple-500/40',
    ring: 'ring-purple-500/30',
    gradient: 'from-purple-600 to-pink-500',
  },
  emerald: {
    label: 'Emerald Green',
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-300',
    border: 'border-emerald-500/40',
    ring: 'ring-emerald-500/30',
    gradient: 'from-emerald-600 to-lime-500',
  },
  amber: {
    label: 'Warm Amber',
    bg: 'bg-amber-500/20',
    text: 'text-amber-300',
    border: 'border-amber-500/40',
    ring: 'ring-amber-500/30',
    gradient: 'from-amber-600 to-orange-500',
  },
  rose: {
    label: 'Rose Red',
    bg: 'bg-rose-500/20',
    text: 'text-rose-300',
    border: 'border-rose-500/40',
    ring: 'ring-rose-500/30',
    gradient: 'from-rose-600 to-pink-500',
  },
  cyan: {
    label: 'Neon Cyan',
    bg: 'bg-cyan-500/20',
    text: 'text-cyan-300',
    border: 'border-cyan-500/40',
    ring: 'ring-cyan-500/30',
    gradient: 'from-cyan-600 to-blue-500',
  },
};

export const FOLDER_ICONS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  book: { label: 'Subject / Book', icon: BookOpen },
  'graduation-cap': { label: 'Exam / Academic', icon: GraduationCap },
  folder: { label: 'General Folder', icon: Folder },
  'file-text': { label: 'Lessons / Notes', icon: FileText },
  award: { label: 'Milestone / Goal', icon: Award },
};

interface TaskFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description: string;
    dueDate: string | null;
    color: string;
    icon: string;
  }) => Promise<void>;
  initialFolder?: TaskFolder | null;
}

export default function TaskFolderModal({
  isOpen,
  onClose,
  onSave,
  initialFolder,
}: TaskFolderModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [color, setColor] = useState('blue');
  const [icon, setIcon] = useState('book');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialFolder) {
      setName(initialFolder.name);
      setDescription(initialFolder.description || '');
      setColor(initialFolder.color || 'blue');
      setIcon(initialFolder.icon || 'book');

      if (initialFolder.due_date) {
        const d = new Date(initialFolder.due_date);
        const offset = d.getTimezoneOffset() * 60000;
        setDueDate(new Date(d.getTime() - offset).toISOString().slice(0, 16));
      } else {
        setDueDate('');
      }
    } else {
      setName('');
      setDescription('');
      setDueDate('');
      setColor('blue');
      setIcon('book');
    }
    setError(null);
  }, [initialFolder, isOpen]);

  if (!isOpen) return null;

  // Preset helper for Exam Date
  const setDatePreset = (daysAhead: number) => {
    const target = new Date();
    target.setDate(target.getDate() + daysAhead);
    target.setHours(9, 0, 0, 0); // default 9:00 AM for exams
    const offset = target.getTimezoneOffset() * 60000;
    setDueDate(new Date(target.getTime() - offset).toISOString().slice(0, 16));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    setError(null);

    try {
      const dueDateISO = dueDate ? new Date(dueDate).toISOString() : null;
      await onSave({
        name: name.trim(),
        description: description.trim(),
        dueDate: dueDateISO,
        color,
        icon,
      });
      onClose();
    } catch (err: unknown) {
      console.error('Save folder error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save folder');
    } finally {
      setSaving(false);
    }
  };

  const isEditing = Boolean(initialFolder);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Ambient Top Glow */}
        <div
          className="absolute -top-16 -right-16 w-36 h-36 rounded-full blur-3xl opacity-25 pointer-events-none"
          style={{
            backgroundColor:
              color === 'blue'
                ? '#0A84FF'
                : color === 'purple'
                ? '#9333ea'
                : color === 'emerald'
                ? '#10b981'
                : color === 'amber'
                ? '#f59e0b'
                : color === 'rose'
                ? '#f43f5e'
                : '#06b6d4',
          }}
        />

        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800/80 relative z-10">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl border ${FOLDER_COLORS[color]?.bg} ${FOLDER_COLORS[color]?.border} ${FOLDER_COLORS[color]?.text}`}>
              {(() => {
                const IconComponent = FOLDER_ICONS[icon]?.icon || Folder;
                return <IconComponent className="w-5 h-5 sm:w-6 sm:h-6" />;
              })()}
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white tracking-tight">
                {isEditing ? 'Edit Task Folder' : 'Create Exam / Subject Folder'}
              </h3>
              <p className="text-xs text-slate-400">
                Group lessons and set an exam due date with countdown.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="my-3 p-3 rounded-xl bg-red-900/30 border border-red-800 text-red-300 text-xs">
            {error}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4 mt-4 relative z-10">
          {/* Folder Name (e.g. English) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Folder / Subject Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. English, Physics Exam, Calculus..."
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
              required
              autoFocus
            />
          </div>

          {/* Exam / Due Date with Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                Exam / Due Date & Time
              </label>
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate('')}
                  className="text-[11px] text-red-400 hover:underline"
                >
                  Clear date
                </button>
              )}
            </div>

            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
            />

            {/* Quick Presets Strip */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[11px]">
              <span className="text-slate-400 text-[10px] font-medium mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => setDatePreset(3)}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
              >
                In 3 Days
              </button>
              <button
                type="button"
                onClick={() => setDatePreset(7)}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
              >
                In 1 Week
              </button>
              <button
                type="button"
                onClick={() => setDatePreset(14)}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
              >
                In 2 Weeks
              </button>
              <button
                type="button"
                onClick={() => setDatePreset(30)}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
              >
                In 1 Month
              </button>
            </div>
          </div>

          {/* Icon & Color Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Icon Picker */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Folder Icon
              </label>
              <div className="flex items-center gap-2">
                {Object.entries(FOLDER_ICONS).map(([key, item]) => {
                  const IconComp = item.icon;
                  const isSelected = icon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setIcon(key)}
                      title={item.label}
                      className={`p-2.5 rounded-xl border transition-all flex items-center justify-center flex-1 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500/20 text-white ring-2 ring-blue-500/30 scale-105'
                          : 'border-slate-700 bg-slate-800/80 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                      }`}
                    >
                      <IconComp className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Color Picker */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Accent Theme
              </label>
              <div className="flex items-center gap-2">
                {Object.entries(FOLDER_COLORS).map(([key, item]) => {
                  const isSelected = color === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setColor(key)}
                      title={item.label}
                      className={`h-9 flex-1 rounded-xl border transition-all flex items-center justify-center relative ${
                        isSelected
                          ? `${item.border} ring-2 ${item.ring} scale-105`
                          : 'border-slate-700 hover:scale-105'
                      }`}
                      style={{
                        background:
                          key === 'blue'
                            ? '#0A84FF'
                            : key === 'purple'
                            ? '#9333ea'
                            : key === 'emerald'
                            ? '#10b981'
                            : key === 'amber'
                            ? '#f59e0b'
                            : key === 'rose'
                            ? '#f43f5e'
                            : '#06b6d4',
                      }}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Description / Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Description / Included Lessons (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="e.g. Lessons 1 to 6 included in this exam, grammar rules & vocabulary..."
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none bg-gradient-to-r ${FOLDER_COLORS[color]?.gradient || 'from-blue-600 to-cyan-500'} shadow-blue-500/25`}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isEditing ? 'Saving Changes...' : 'Creating Folder...'}</span>
                </>
              ) : isEditing ? (
                <>
                  <Check className="w-4 h-4" />
                  Save Changes
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Create Folder
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
