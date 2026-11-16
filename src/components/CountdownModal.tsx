'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  Bell,
  Sparkles,
  Trash2,
  Check,
  Tag,
  Palette,
  AlertCircle,
} from 'lucide-react';
import { requestNotificationPermission } from '@/lib/notifications';
import type { CountdownEvent, ReminderIntervalId } from '@/types';

interface CountdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: Omit<CountdownEvent, 'id' | 'created_at'>, existingId?: string) => void;
  onDelete?: (id: string) => void;
  initialEvent?: CountdownEvent | null;
}

const CATEGORIES = [
  { id: 'event', label: 'Event', defaultEmoji: '🎉' },
  { id: 'goal', label: 'Goal', defaultEmoji: '🎯' },
  { id: 'deadline', label: 'Deadline', defaultEmoji: '⏰' },
  { id: 'launch', label: 'Launch', defaultEmoji: '🚀' },
  { id: 'exam', label: 'Exam', defaultEmoji: '📚' },
  { id: 'travel', label: 'Travel', defaultEmoji: '✈️' },
  { id: 'birthday', label: 'Birthday', defaultEmoji: '🎂' },
  { id: 'other', label: 'Milestone', defaultEmoji: '⭐' },
] as const;

const POPULAR_EMOJIS = ['🎯', '🚀', '📚', '🏆', '✈️', '🎂', '💼', '💍', '🎉', '⭐', '🔥', '💡', '⏰', '🏖️', '💪'];

const COLOR_THEMES = [
  { id: 'blue', label: 'Blue', border: 'border-blue-500', bg: 'bg-blue-500/20', text: 'text-blue-400', ring: 'ring-blue-500' },
  { id: 'purple', label: 'Purple', border: 'border-purple-500', bg: 'bg-purple-500/20', text: 'text-purple-400', ring: 'ring-purple-500' },
  { id: 'pink', label: 'Pink', border: 'border-pink-500', bg: 'bg-pink-500/20', text: 'text-pink-400', ring: 'ring-pink-500' },
  { id: 'emerald', label: 'Emerald', border: 'border-emerald-500', bg: 'bg-emerald-500/20', text: 'text-emerald-400', ring: 'ring-emerald-500' },
  { id: 'amber', label: 'Amber', border: 'border-amber-500', bg: 'bg-amber-500/20', text: 'text-amber-400', ring: 'ring-amber-500' },
  { id: 'rose', label: 'Rose', border: 'border-rose-500', bg: 'bg-rose-500/20', text: 'text-rose-400', ring: 'ring-rose-500' },
  { id: 'cyan', label: 'Cyan', border: 'border-cyan-500', bg: 'bg-cyan-500/20', text: 'text-cyan-400', ring: 'ring-cyan-500' },
] as const;

export const REMINDER_OPTIONS: { id: ReminderIntervalId; label: string; minutes: number }[] = [
  { id: 'at_time', label: 'At time of event (0m)', minutes: 0 },
  { id: '15m', label: '15 minutes before', minutes: 15 },
  { id: '1h', label: '1 hour before', minutes: 60 },
  { id: '3h', label: '3 hours before', minutes: 180 },
  { id: '1d', label: '1 day before (24h)', minutes: 1440 },
  { id: '3d', label: '3 days before', minutes: 4320 },
  { id: '1w', label: '1 week before', minutes: 10080 },
];

export default function CountdownModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialEvent,
}: CountdownModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [category, setCategory] = useState<CountdownEvent['category']>('event');
  const [emoji, setEmoji] = useState('🎯');
  const [color, setColor] = useState<CountdownEvent['color']>('blue');
  const [isPinned, setIsPinned] = useState(true);
  const [selectedReminders, setSelectedReminders] = useState<ReminderIntervalId[]>([
    'at_time',
    '1h',
    '1d',
  ]);
  const [notifPermission, setNotifPermission] = useState<string>('default');

  // Check notification permission status
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    }
  }, [isOpen]);

  // Load initial data when editing or opening
  useEffect(() => {
    if (initialEvent) {
      setTitle(initialEvent.title);
      setDescription(initialEvent.description || '');
      // Format to datetime-local format: YYYY-MM-DDTHH:MM
      try {
        const d = new Date(initialEvent.target_date);
        const offset = d.getTimezoneOffset() * 60000;
        const localISOTime = new Date(d.getTime() - offset).toISOString().slice(0, 16);
        setTargetDate(localISOTime);
      } catch {
        setTargetDate('');
      }
      setCategory(initialEvent.category);
      setEmoji(initialEvent.emoji || '🎯');
      setColor(initialEvent.color || 'blue');
      setIsPinned(initialEvent.is_pinned ?? true);
      setSelectedReminders(initialEvent.reminder_intervals || ['at_time', '1h', '1d']);
    } else {
      // Default: Target date set to 7 days from now at 12:00 PM
      const future = new Date();
      future.setDate(future.getDate() + 7);
      future.setHours(12, 0, 0, 0);
      const offset = future.getTimezoneOffset() * 60000;
      const localISOTime = new Date(future.getTime() - offset).toISOString().slice(0, 16);

      setTitle('');
      setDescription('');
      setTargetDate(localISOTime);
      setCategory('event');
      setEmoji('🎯');
      setColor('blue');
      setIsPinned(true);
      setSelectedReminders(['at_time', '1h', '1d']);
    }
  }, [initialEvent, isOpen]);

  if (!isOpen) return null;

  const toggleReminder = async (id: ReminderIntervalId) => {
    // If selecting a reminder and permission is not granted, ask for permission
    if (!selectedReminders.includes(id) && notifPermission !== 'granted') {
      try {
        const sub = await requestNotificationPermission();
        if (sub || Notification.permission === 'granted') {
          setNotifPermission('granted');
        }
      } catch (e) {
        console.warn('Could not request notification permission:', e);
      }
    }

    setSelectedReminders((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const handlePresetDate = (daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(12, 0, 0, 0);
    const offset = d.getTimezoneOffset() * 60000;
    setTargetDate(new Date(d.getTime() - offset).toISOString().slice(0, 16));
  };

  const handleNewYear = () => {
    const nextYear = new Date().getFullYear() + 1;
    const d = new Date(nextYear, 0, 1, 0, 0, 0);
    const offset = d.getTimezoneOffset() * 60000;
    setTargetDate(new Date(d.getTime() - offset).toISOString().slice(0, 16));
    setTitle(title || `New Year ${nextYear}`);
    setEmoji('🎉');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetDate) return;

    // Convert local targetDate string into full ISO string
    const targetISO = new Date(targetDate).toISOString();

    onSave(
      {
        title: title.trim(),
        description: description.trim() || null,
        target_date: targetISO,
        category,
        emoji,
        color,
        is_pinned: isPinned,
        reminder_intervals: selectedReminders,
        triggered_reminders: initialEvent?.triggered_reminders || [],
      },
      initialEvent?.id
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-700/70 bg-slate-900/95 shadow-2xl shadow-blue-500/10 p-5 sm:p-7 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/20">
              <Clock size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {initialEvent ? 'Edit Countdown Event' : 'Create Countdown Event'}
              </h2>
              <p className="text-xs text-slate-400">
                Anchored live countdown with configurable push notifications
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Title & Emoji */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Event Title <span className="text-rose-400">*</span>
            </label>
            <div className="flex gap-2">
              {/* Emoji quick display */}
              <div className="relative flex-shrink-0">
                <span className="flex h-11 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-xl shadow-inner">
                  {emoji}
                </span>
              </div>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Product Launch, Final Exam, Vacation"
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {/* Quick Emoji selection */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {POPULAR_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm transition ${
                    emoji === e
                      ? 'bg-blue-600/30 border border-blue-500 scale-110 shadow-sm'
                      : 'bg-slate-800/50 hover:bg-slate-800 border border-transparent'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Target Date & Time */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Target Date & Time <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type="datetime-local"
                required
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Quick date presets */}
            <div className="flex flex-wrap gap-1.5 pt-1 text-xs">
              <button
                type="button"
                onClick={() => handlePresetDate(1)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => handlePresetDate(3)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                In 3 Days
              </button>
              <button
                type="button"
                onClick={() => handlePresetDate(7)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                In 1 Week
              </button>
              <button
                type="button"
                onClick={() => handlePresetDate(30)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                In 1 Month
              </button>
              <button
                type="button"
                onClick={handleNewYear}
                className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-900/50 to-pink-900/50 hover:from-purple-800/50 hover:to-pink-800/50 text-pink-300 border border-purple-500/30 transition"
              >
                🎉 New Year
              </button>
            </div>
          </div>

          {/* Category & Color Theme */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Category */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Tag size={13} /> Category
              </label>
              <select
                value={category}
                onChange={(e) => {
                  const cat = e.target.value as CountdownEvent['category'];
                  setCategory(cat);
                  const found = CATEGORIES.find((c) => c.id === cat);
                  if (found) setEmoji(found.defaultEmoji);
                }}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.defaultEmoji} {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Color Accent */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Palette size={13} /> Color Accent
              </label>
              <div className="flex items-center gap-2 pt-1.5">
                {COLOR_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setColor(theme.id as any)}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      theme.border
                    } ${theme.bg} ${
                      color === theme.id ? 'scale-125 ring-2 ' + theme.ring : 'hover:scale-110'
                    }`}
                    title={theme.label}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Reminder Intervals Config (Push Notifications) */}
          <div className="space-y-2 rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Bell size={14} className="text-yellow-400" />
                Push Notification Reminders
              </label>
              {notifPermission === 'granted' ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Push Active
                </span>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    const sub = await requestNotificationPermission();
                    if (sub || Notification.permission === 'granted') {
                      setNotifPermission('granted');
                    }
                  }}
                  className="text-[11px] text-blue-400 hover:text-blue-300 underline"
                >
                  Enable Browser Push
                </button>
              )}
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Select specific intervals before the event. You will receive an instant push notification
              and an in-app alert when each interval arrives:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {REMINDER_OPTIONS.map((opt) => {
                const isSelected = selectedReminders.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleReminder(opt.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-medium transition text-left ${
                      isSelected
                        ? 'border-blue-500/60 bg-blue-600/15 text-blue-200'
                        : 'border-slate-700/70 bg-slate-800/40 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <div
                      className={`flex h-4 w-4 items-center justify-center rounded border transition ${
                        isSelected
                          ? 'border-blue-500 bg-blue-600 text-white'
                          : 'border-slate-600 bg-slate-700/50'
                      }`}
                    >
                      {isSelected && <Check size={11} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description (Optional) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Notes or Description <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add key milestones, location, or preparatory tasks..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Pin as primary countdown */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-300 select-none">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0"
              />
              <span>Set as active hero countdown on Dashboard</span>
            </label>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            {initialEvent && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Are you sure you want to delete this countdown event?')) {
                    onDelete(initialEvent.id);
                    onClose();
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition"
              >
                <Trash2 size={15} />
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition active:scale-95"
              >
                <Sparkles size={14} />
                <span>{initialEvent ? 'Save Changes' : 'Start Countdown'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
