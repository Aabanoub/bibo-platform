'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import ResetDataModal from '@/components/ResetDataModal';
import { useTheme, THEMES, ThemeId } from '@/context/ThemeContext';
import {
  Settings,
  User,
  Shield,
  Trash2,
  Check,
  AlertTriangle,
  Lock,
  Palette,
  RotateCcw,
  ChevronDown,
  LogOut,
  Smartphone,
  Home,
  Sparkles,
  CheckCircle2,
  Bell,
  BellRing,
  Loader2,
  Share2,
  RefreshCw,
  Clock,
  Wallet,
  Activity,
  CheckSquare,
} from 'lucide-react';
import { useNavigation, AVAILABLE_NAV_OPTIONS, NAV_OPTIONS_MAP } from '@/context/NavigationContext';
import {
  inspectNotificationCapabilities,
  requestNotificationPermission,
  unsubscribePushNotifications,
  fetchNotificationPreferences,
  updateNotificationPreferences,
  DeviceDiagnostics,
} from '@/lib/notifications';
import type { NotificationPreference } from '@/types';

export default function SettingsPage() {
  const supabase = createClient();
  const { gender, setGender, theme, setTheme, isGirly, activeThemeConfig } = useTheme();
  const { slots, updateSlot, resetSlots } = useNavigation();

  // Accordion open/close state for settings sections (all collapsed by default)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    profile: false,
    theme: false,
    tasksView: false,
    nav: false,
    notifications: false,
    danger: false,
  });

  // Tasks Workspace layout preference ('ai_folders' vs 'classic')
  const [tasksViewMode, setTasksViewMode] = useState<'ai_folders' | 'classic'>('ai_folders');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tasks_view_mode') as 'ai_folders' | 'classic' | null;
      if (saved) setTasksViewMode(saved);
    }
  }, []);

  const handleSetTasksViewMode = async (mode: 'ai_folders' | 'classic') => {
    setTasksViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tasks_view_mode', mode);
      window.dispatchEvent(new CustomEvent('tasks_view_mode_changed', { detail: mode }));
    }
    if (user?.id) {
      try {
        await supabase.auth.updateUser({
          data: { tasks_view_mode: mode },
        });
      } catch (err) {
        console.warn('Failed to save tasks_view_mode to user profile:', err);
      }
    }
  };

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const [user, setUser] = useState<{
    id: string;
    email: string;
    name: string;
    createdAt: string;
  } | null>(null);

  const [fullName, setFullName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  // Notification Diagnostics & Preferences State
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreference | null>(null);
  const [savingPref, setSavingPref] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DeviceDiagnostics | null>(null);
  const [serverVapid, setServerVapid] = useState<{ isConfigured: boolean; publicKey?: string } | null>(null);
  const [requestingPerm, setRequestingPerm] = useState(false);

  // Refresh live device & server diagnostics
  const refreshDiagnostics = async () => {
    try {
      const diag = await inspectNotificationCapabilities();
      setDiagnostics(diag);

      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setServerVapid(data.vapid);
      }
    } catch (err) {
      console.warn('Diagnostics query error:', err);
    }
  };

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (authUser) {
        const name =
          authUser.user_metadata?.full_name ||
          authUser.user_metadata?.name ||
          authUser.email?.split('@')[0] ||
          'User';

        setUser({
          id: authUser.id,
          email: authUser.email || '',
          name,
          createdAt: authUser.created_at
            ? new Date(authUser.created_at).toLocaleDateString()
            : 'Unknown',
        });
        setFullName(name);

        // Load user notification preferences & inspect capabilities
        try {
          const prefs = await fetchNotificationPreferences(authUser.id);
          setNotifPrefs(prefs);
        } catch {}

        await refreshDiagnostics();
      }
    }

    loadUser();
  }, [supabase]);

  const handleTogglePref = async (key: keyof NotificationPreference) => {
    if (!user?.id || !notifPrefs || savingPref) return;
    const currentVal = Boolean(notifPrefs[key]);
    const updatedVal = !currentVal;
    setNotifPrefs((prev) => (prev ? { ...prev, [key]: updatedVal } : null));

    setSavingPref(true);
    try {
      await updateNotificationPreferences(user.id, { [key]: updatedVal });
    } catch (err) {
      console.error('Failed to update preference:', err);
    } finally {
      setSavingPref(false);
    }
  };

  const handleRequestPermission = async () => {
    setRequestingPerm(true);
    try {
      const sub = await requestNotificationPermission(user?.id);
      await refreshDiagnostics();
      if (sub && user?.id) {
        await updateNotificationPreferences(user.id, { push_enabled: true, browser_enabled: true });
        setNotifPrefs((prev) => (prev ? { ...prev, push_enabled: true, browser_enabled: true } : null));
      }
    } finally {
      setRequestingPerm(false);
    }
  };

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !fullName.trim() || savingName) return;

    setSavingName(true);
    try {
      // 1. Update user metadata
      await supabase.auth.updateUser({
        data: { full_name: fullName.trim() },
      });

      // 2. Update profiles table
      await supabase.from('profiles').upsert(
        {
          id: user.id,
          full_name: fullName.trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    } catch (err) {
      console.error('Failed to update name:', err);
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-zinc-800 text-white shadow-md">
            <Settings size={18} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">Settings & Account</h1>
            <p className="text-[11px] sm:text-xs text-zinc-400">Manage account credentials, preferences & data</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-0 sm:p-2">
        <div className="mx-auto max-w-4xl space-y-4">
          {/* Account Profile Card (Collapsible) */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden transition-all duration-200">
            <button
              type="button"
              onClick={() => toggleSection('profile')}
              className="w-full flex items-center justify-between p-5 sm:p-6 text-left transition hover:bg-zinc-800/40 select-none"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl shadow-md transition-all ${
                    isGirly
                      ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}
                >
                  <User size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">Profile Information</h2>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        openSections.profile
                          ? isGirly
                            ? 'bg-pink-500/20 text-pink-300'
                            : 'bg-blue-500/20 text-blue-300'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {openSections.profile ? 'Open' : 'Manage'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    {fullName || user?.name || 'Account details'} • {user?.email || 'Authenticated'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-400 transition-transform duration-200 ${
                    openSections.profile ? 'rotate-180 text-white' : ''
                  }`}
                >
                  <ChevronDown size={16} />
                </div>
              </div>
            </button>

            {openSections.profile && (
              <div className="px-5 sm:px-6 pb-6 pt-2 space-y-4 border-t border-zinc-800/80 animate-fade-in">
                <form onSubmit={handleUpdateName} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">Display Name:</label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-xs text-zinc-100 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">Account Email:</label>
                      <input
                        type="email"
                        disabled
                        value={user?.email || ''}
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs text-zinc-400 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60">
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-3.5 py-2 text-xs font-semibold text-red-400 transition active:scale-95"
                    >
                      <LogOut size={14} />
                      <span>Log Out</span>
                    </button>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-zinc-500 hidden sm:inline">
                        Member since: {user?.createdAt || 'Active'}
                      </span>
                      <button
                        type="submit"
                        disabled={savingName || !fullName.trim()}
                        className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition disabled:opacity-50"
                      >
                        {nameSaved ? <Check size={14} className="text-emerald-300" /> : null}
                        <span>{nameSaved ? 'Saved!' : savingName ? 'Saving...' : 'Update Name'}</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Theme & Visual Style Card (Collapsible) */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden transition-all duration-200">
            <button
              type="button"
              onClick={() => toggleSection('theme')}
              className="w-full flex items-center justify-between p-5 sm:p-6 text-left transition hover:bg-zinc-800/40 select-none"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl shadow-md transition-all ${
                    isGirly
                      ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}
                >
                  <Palette size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-white">Platform Theme & Visual Style</h2>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${activeThemeConfig.badgeBg} ${activeThemeConfig.badgeText} ${activeThemeConfig.borderColor}`}
                    >
                      {activeThemeConfig.name}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    {gender === 'female' ? 'Female' : 'Male'} • {activeThemeConfig.name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-400 transition-transform duration-200 ${
                    openSections.theme ? 'rotate-180 text-white' : ''
                  }`}
                >
                  <ChevronDown size={16} />
                </div>
              </div>
            </button>

            {openSections.theme && (
              <div className="px-5 sm:px-6 pb-6 pt-3 space-y-4 border-t border-zinc-800/80 animate-fade-in">
                {/* Category Selection: Male / Female */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Category
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setGender('male')}
                      className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-semibold border transition-all duration-200 ${
                        gender === 'male' || gender === 'default'
                          ? 'border-blue-500/80 bg-blue-500/15 text-blue-200 shadow-sm ring-1 ring-blue-500/30'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <span className="text-base">⚡</span>
                      <span>Male</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setGender('female')}
                      className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-semibold border transition-all duration-200 ${
                        gender === 'female'
                          ? 'border-pink-500/80 bg-pink-500/15 text-pink-200 shadow-sm ring-1 ring-pink-500/30'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <span className="text-base">🌸</span>
                      <span>Female</span>
                    </button>
                  </div>
                </div>

                {/* Theme Selection: Only Name & Color preview */}
                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Theme
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {(gender === 'female'
                      ? (['violet-dream', 'rose-aura', 'ios-glass'] as ThemeId[])
                      : (['ios-glass', 'midnight-pulse', 'forest-gravity'] as ThemeId[])
                    ).map((tId) => {
                      const cfg = THEMES[tId];
                      const isSelected = theme === tId;

                      return (
                        <button
                          key={tId}
                          type="button"
                          onClick={() => setTheme(tId)}
                          className={`group relative flex items-center justify-between rounded-xl border p-3.5 text-left transition-all duration-200 ${
                            isSelected
                              ? 'border-blue-500/80 bg-blue-500/15 shadow-sm ring-1 ring-blue-500/30 text-white'
                              : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700 hover:bg-zinc-900/50 text-zinc-300'
                          }`}
                          style={{
                            borderColor: isSelected ? cfg.colors.primaryAccent : undefined,
                            backgroundColor: isSelected ? `${cfg.colors.secondaryBg}66` : undefined,
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Color Preview Swatch */}
                            <div className="flex items-center -space-x-1.5 shrink-0">
                              <span
                                className="w-4 h-4 rounded-full border border-black/40 shadow-sm"
                                style={{ backgroundColor: cfg.colors.primaryAccent }}
                              />
                              <span
                                className="w-4 h-4 rounded-full border border-black/40 shadow-sm"
                                style={{ backgroundColor: cfg.colors.secondaryAccent }}
                              />
                            </div>

                            {/* ONLY Theme Name */}
                            <span className="text-xs font-semibold tracking-tight truncate">
                              {cfg.name}
                            </span>
                          </div>

                          {/* Selected Checkmark */}
                          {isSelected ? (
                            <div
                              className="flex h-5 w-5 items-center justify-center rounded-full text-white shadow-sm shrink-0 ml-2"
                              style={{ backgroundColor: cfg.colors.primaryAccent }}
                            >
                              <Check size={11} strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="h-5 w-5 rounded-full border border-zinc-700/60 shrink-0 ml-2 group-hover:border-zinc-500 transition-colors" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tasks Workspace & View Mode Card (Collapsible) */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden transition-all duration-200">
            <button
              type="button"
              onClick={() => toggleSection('tasksView')}
              className="w-full flex items-center justify-between p-5 sm:p-6 text-left transition hover:bg-zinc-800/40 select-none"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl shadow-md transition-all ${
                    isGirly
                      ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                      : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  }`}
                >
                  <CheckSquare size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-white">Tasks Workspace Layout</h2>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border bg-blue-500/15 text-blue-300 border-blue-500/30">
                      {tasksViewMode === 'classic' ? 'Classic List' : 'AI Subject Folders'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    {tasksViewMode === 'classic'
                      ? 'Classic flat task manager with quick-add bar & filter pills'
                      : 'AI-guided subject folders, exam countdowns & lesson sequencing'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-400 transition-transform duration-200 ${
                    openSections.tasksView ? 'rotate-180 text-white' : ''
                  }`}
                >
                  <ChevronDown size={16} />
                </div>
              </div>
            </button>

            {openSections.tasksView && (
              <div className="px-5 sm:px-6 pb-6 pt-2 space-y-4 border-t border-zinc-800/80 animate-fade-in">
                <p className="text-xs text-zinc-400">
                  Select your preferred workspace layout for managing tasks and study lessons. You can switch between them anytime:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option 1: AI Subject Folders */}
                  <div
                    onClick={() => handleSetTasksViewMode('ai_folders')}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      tasksViewMode === 'ai_folders'
                        ? 'bg-blue-600/15 border-blue-500 text-white shadow-md shadow-blue-500/10'
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-bold text-white">AI Subject Folders (New)</span>
                      </div>
                      {tasksViewMode === 'ai_folders' ? (
                        <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs">
                          ✓
                        </span>
                      ) : (
                        <span className="w-5 h-5 rounded-full border border-zinc-700" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Folder-first study workspace with exam countdowns, subject grouping (Arabic, Math, etc.), pedagogical lesson ordering, and full AI Daily Planner integration.
                    </p>
                  </div>

                  {/* Option 2: Classic Flat Tasks */}
                  <div
                    onClick={() => handleSetTasksViewMode('classic')}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      tasksViewMode === 'classic'
                        ? 'bg-blue-600/15 border-blue-500 text-white shadow-md shadow-blue-500/10'
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm font-bold text-white">Classic Task List (Original)</span>
                      </div>
                      {tasksViewMode === 'classic' ? (
                        <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs">
                          ✓
                        </span>
                      ) : (
                        <span className="w-5 h-5 rounded-full border border-zinc-700" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Classic minimalist layout with instant Quick-Add input bar, filter pills, segmented tabs (All, Today, Upcoming, Completed), and Smart Algorithm sorting.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Bottom Navigation Bar Customization (Collapsible) */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden transition-all duration-200">
            {/* Clickable Header / Icon Row */}
            <button
              type="button"
              onClick={() => toggleSection('nav')}
              className="w-full flex items-center justify-between p-5 sm:p-6 text-left transition hover:bg-zinc-800/40 select-none"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl shadow-md transition-all ${
                    isGirly
                      ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  <Smartphone size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">Mobile Bottom Navigation Bar</h2>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        openSections.nav
                          ? isGirly
                            ? 'bg-pink-500/20 text-pink-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {openSections.nav ? 'Open' : 'Configure'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    {NAV_OPTIONS_MAP[slots[0]]?.label || 'Slot 1'} • {NAV_OPTIONS_MAP[slots[1]]?.label || 'Slot 2'} • 🏠 Home • {NAV_OPTIONS_MAP[slots[2]]?.label || 'Slot 3'} • {NAV_OPTIONS_MAP[slots[3]]?.label || 'Slot 4'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-400 transition-transform duration-200 ${
                    openSections.nav ? 'rotate-180 text-white' : ''
                  }`}
                >
                  <ChevronDown size={16} />
                </div>
              </div>
            </button>

            {/* Collapsible Content */}
            {openSections.nav && (
              <div className="px-5 sm:px-6 pb-6 pt-2 space-y-5 border-t border-zinc-800/80 animate-fade-in">
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={resetSlots}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition py-1 px-2.5 rounded-lg border border-zinc-800 bg-zinc-800/40"
                  >
                    <RotateCcw size={13} />
                    <span>Reset to Defaults</span>
                  </button>
                </div>

                {/* Interactive Preview of Bottom Bar Layout */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3 text-center">
                    Live Bottom Bar Preview
                  </div>
                  <div className="grid grid-cols-5 gap-2 items-end max-w-md mx-auto">
                    {/* Slot 1 */}
                    <div className="flex flex-col items-center gap-1 p-2 rounded-xl border border-slate-800 bg-slate-900 text-center">
                      {(() => {
                        const OptIcon = NAV_OPTIONS_MAP[slots[0]]?.icon;
                        return OptIcon ? <OptIcon size={18} className="text-blue-400" /> : null;
                      })()}
                      <span className="text-[10px] font-medium text-slate-300 truncate max-w-full">
                        {NAV_OPTIONS_MAP[slots[0]]?.label}
                      </span>
                      <span className="text-[8px] text-slate-500 uppercase">Slot 1</span>
                    </div>

                    {/* Slot 2 */}
                    <div className="flex flex-col items-center gap-1 p-2 rounded-xl border border-slate-800 bg-slate-900 text-center">
                      {(() => {
                        const OptIcon = NAV_OPTIONS_MAP[slots[1]]?.icon;
                        return OptIcon ? <OptIcon size={18} className="text-blue-400" /> : null;
                      })()}
                      <span className="text-[10px] font-medium text-slate-300 truncate max-w-full">
                        {NAV_OPTIONS_MAP[slots[1]]?.label}
                      </span>
                      <span className="text-[8px] text-slate-500 uppercase">Slot 2</span>
                    </div>

                    {/* Center Home - Permanently Locked */}
                    <div className="flex flex-col items-center gap-1 p-2 -mt-3 rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-tr from-emerald-600/30 to-blue-600/20 text-center shadow-lg shadow-emerald-500/10">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-slate-950 font-bold shadow-md">
                        <Home size={18} />
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400">Home</span>
                      <span className="text-[8px] font-semibold text-emerald-300/70 uppercase">LOCKED</span>
                    </div>

                    {/* Slot 3 */}
                    <div className="flex flex-col items-center gap-1 p-2 rounded-xl border border-slate-800 bg-slate-900 text-center">
                      {(() => {
                        const OptIcon = NAV_OPTIONS_MAP[slots[2]]?.icon;
                        return OptIcon ? <OptIcon size={18} className="text-blue-400" /> : null;
                      })()}
                      <span className="text-[10px] font-medium text-slate-300 truncate max-w-full">
                        {NAV_OPTIONS_MAP[slots[2]]?.label}
                      </span>
                      <span className="text-[8px] text-slate-500 uppercase">Slot 3</span>
                    </div>

                    {/* Slot 4 */}
                    <div className="flex flex-col items-center gap-1 p-2 rounded-xl border border-slate-800 bg-slate-900 text-center">
                      {(() => {
                        const OptIcon = NAV_OPTIONS_MAP[slots[3]]?.icon;
                        return OptIcon ? <OptIcon size={18} className="text-blue-400" /> : null;
                      })()}
                      <span className="text-[10px] font-medium text-slate-300 truncate max-w-full">
                        {NAV_OPTIONS_MAP[slots[3]]?.label}
                      </span>
                      <span className="text-[8px] text-slate-500 uppercase">Slot 4</span>
                    </div>
                  </div>
                </div>

                {/* Slot Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  {/* Slot 1 Selection */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300">
                        Slot 1 (Far Left):
                      </label>
                      <span className="text-[10px] text-zinc-500">Left Position 1</span>
                    </div>
                    <select
                      value={slots[0]}
                      onChange={(e) => updateSlot(0, e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500"
                    >
                      {AVAILABLE_NAV_OPTIONS.map((opt) => (
                        <option key={`slot0-${opt.id}`} value={opt.id}>
                          {opt.label} ({opt.description})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Slot 2 Selection */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300">
                        Slot 2 (Near Left):
                      </label>
                      <span className="text-[10px] text-zinc-500">Left Position 2</span>
                    </div>
                    <select
                      value={slots[1]}
                      onChange={(e) => updateSlot(1, e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500"
                    >
                      {AVAILABLE_NAV_OPTIONS.map((opt) => (
                        <option key={`slot1-${opt.id}`} value={opt.id}>
                          {opt.label} ({opt.description})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Slot 3 Selection */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300">
                        Slot 3 (Near Right):
                      </label>
                      <span className="text-[10px] text-zinc-500">Right Position 1</span>
                    </div>
                    <select
                      value={slots[2]}
                      onChange={(e) => updateSlot(2, e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500"
                    >
                      {AVAILABLE_NAV_OPTIONS.map((opt) => (
                        <option key={`slot2-${opt.id}`} value={opt.id}>
                          {opt.label} ({opt.description})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Slot 4 Selection */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300">
                        Slot 4 (Far Right):
                      </label>
                      <span className="text-[10px] text-zinc-500">Right Position 2</span>
                    </div>
                    <select
                      value={slots[3]}
                      onChange={(e) => updateSlot(3, e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500"
                    >
                      {AVAILABLE_NAV_OPTIONS.map((opt) => (
                        <option key={`slot3-${opt.id}`} value={opt.id}>
                          {opt.label} ({opt.description})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notifications & System Diagnostics (Collapsible) */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden transition-all duration-200">
            <button
              type="button"
              onClick={() => toggleSection('notifications')}
              className="w-full flex items-center justify-between p-5 sm:p-6 text-left transition hover:bg-zinc-800/40 select-none"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl shadow-md transition-all ${
                    isGirly
                      ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                      : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  }`}
                >
                  <BellRing size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-white">Notifications & System Diagnostics</h2>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        diagnostics?.isSubscribed
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : diagnostics?.permission === 'granted'
                          ? 'bg-blue-500/20 text-blue-300'
                          : diagnostics?.permission === 'denied'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {diagnostics?.isSubscribed
                        ? '🔔 Active & Subscribed'
                        : diagnostics?.permission === 'granted'
                        ? '⚡ Permission Allowed'
                        : diagnostics?.permission === 'denied'
                        ? '🔕 Blocked'
                        : '⚠️ Action Required'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    In-app bell, browser push alerts, background WebPush & free scheduler
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-400 transition-transform duration-200 ${
                    openSections.notifications ? 'rotate-180 text-white' : ''
                  }`}
                >
                  <ChevronDown size={16} />
                </div>
              </div>
            </button>

            {openSections.notifications && (
              <div className="px-5 sm:px-6 pb-6 pt-2 space-y-6 border-t border-zinc-800/80 animate-fade-in">
                {/* Intro summary */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <p className="text-xs text-zinc-400">
                    Manage push alerts, task reminders, and sound settings.
                  </p>
                  <button
                    type="button"
                    onClick={refreshDiagnostics}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition py-1 px-2.5 rounded-lg border border-zinc-800 bg-zinc-800/40 shrink-0 self-start sm:self-auto"
                  >
                    <RefreshCw size={12} />
                    <span>Refresh Diagnostics</span>
                  </button>
                </div>

                {/* 1. Notification Preferences & Channel Controls */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Channel Delivery & Category Preferences
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      Synchronized across all your devices
                    </span>
                  </div>

                  {/* Master Channel Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-white block">In-App Notifications</span>
                        <span className="text-[10px] text-zinc-500 block">Notification bell & badge</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePref('in_app_enabled')}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          notifPrefs?.in_app_enabled ? 'bg-blue-600' : 'bg-zinc-800'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            notifPrefs?.in_app_enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-white block">Browser Popups</span>
                        <span className="text-[10px] text-zinc-500 block">Native OS banner alerts</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePref('browser_enabled')}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          notifPrefs?.browser_enabled ? 'bg-blue-600' : 'bg-zinc-800'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            notifPrefs?.browser_enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-white block">Background WebPush</span>
                        <span className="text-[10px] text-zinc-500 block">Deliver when tabs are closed</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePref('push_enabled')}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          notifPrefs?.push_enabled ? 'bg-blue-600' : 'bg-zinc-800'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            notifPrefs?.push_enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Granular Category Toggles */}
                  <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950 p-4 space-y-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block">
                      Feature Notification Categories:
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      {[
                        { key: 'task_reminders' as const, label: 'Task Deadlines & Reminders', icon: CheckSquare, desc: 'Overdue & scheduled task finish alerts' },
                        { key: 'countdown_reminders' as const, label: 'Countdown Milestones', icon: Clock, desc: '1-day, 1-hour & exact event alarms' },
                        { key: 'finance_alerts' as const, label: 'Personal Finance Alerts', icon: Wallet, desc: 'Discreet recorded transaction & budget notices' },
                        { key: 'salary_reminders' as const, label: 'Salary Distribution Reminders', icon: Wallet, desc: 'Upcoming payday & checklist prompts' },
                        { key: 'habit_reminders' as const, label: 'Habit Streaks & Daily Reminders', icon: Activity, desc: 'Streak milestone celebrations' },
                        { key: 'ai_notifications' as const, label: 'AI Operations & Briefings', icon: Sparkles, desc: 'Background generation & daily AI summaries' },
                      ].map((item) => {
                        const Icon = item.icon;
                        const isEnabled = notifPrefs ? Boolean(notifPrefs[item.key]) : true;

                        return (
                          <div
                            key={item.key}
                            onClick={() => handleTogglePref(item.key)}
                            className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition cursor-pointer ${
                              isEnabled
                                ? 'border-zinc-700 bg-zinc-900/60 text-zinc-100'
                                : 'border-zinc-800/60 bg-zinc-950 text-zinc-500 opacity-60'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <Icon size={16} className={`mt-0.5 shrink-0 ${isEnabled ? 'text-blue-400' : 'text-zinc-600'}`} />
                              <div className="min-w-0">
                                <div className="font-semibold text-xs truncate">{item.label}</div>
                                <div className="text-[10px] text-zinc-500 leading-tight mt-0.5">{item.desc}</div>
                              </div>
                            </div>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                                isEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-500'
                              }`}
                            >
                              {isEnabled ? 'ON' : 'OFF'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 2. Device & Hardware Diagnostics Status Bar */}
                <div className="space-y-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 block">
                    Device Environment Diagnostics
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    {/* Permission Status */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 flex flex-col justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block">
                          Notification Permission
                        </span>
                        <div className="flex items-center justify-between mt-1">
                          <span className="font-semibold text-zinc-200 capitalize">
                            {diagnostics?.permission || 'Default'}
                          </span>
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              diagnostics?.permission === 'granted'
                                ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                                : diagnostics?.permission === 'denied'
                                ? 'bg-red-400 shadow-sm shadow-red-400/50'
                                : 'bg-amber-400 shadow-sm shadow-amber-400/50'
                            }`}
                          />
                        </div>
                      </div>
                      {diagnostics?.permission !== 'granted' && (
                        <button
                          type="button"
                          onClick={handleRequestPermission}
                          disabled={requestingPerm}
                          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold py-1 transition disabled:opacity-50"
                        >
                          {requestingPerm ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
                          <span>Enable Now</span>
                        </button>
                      )}
                    </div>

                    {/* Service Worker Status */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-1">
                      <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block">
                        Service Worker (/sw.js)
                      </span>
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-semibold text-zinc-200">
                          {diagnostics?.swRegistered ? 'Active & Ready' : 'Registering...'}
                        </span>
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            diagnostics?.swRegistered
                              ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                              : 'bg-zinc-600'
                          }`}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-500 block">
                        Scope: &apos;/&apos; • v2.1.0 hardened
                      </span>
                    </div>

                    {/* WebPush Subscription Status */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-1">
                      <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block">
                        WebPush (VAPID) Status
                      </span>
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-semibold text-zinc-200">
                          {diagnostics?.isSubscribed ? 'Device Registered' : 'Not Subscribed'}
                        </span>
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            diagnostics?.isSubscribed
                              ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                              : 'bg-amber-400'
                          }`}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-500 block truncate">
                        Server: {serverVapid?.isConfigured ? 'VAPID Ready' : 'Verifying...'}
                      </span>
                    </div>
                  </div>

                  {/* iOS / iPhone Web Push Guidance */}
                  {diagnostics?.isIOS && !diagnostics.isStandalone && (
                    <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 to-purple-950/40 border border-indigo-500/30 text-xs space-y-2.5 animate-fade-in">
                      <div className="flex items-center gap-2 font-bold text-indigo-300">
                        <Smartphone className="w-4 h-4 text-indigo-400" />
                        <span>iPhone / iOS Web Push Requirement (Apple Policy)</span>
                      </div>
                      <p className="text-zinc-300 text-[11px] leading-relaxed">
                        Apple Safari on iOS (16.4+) strictly requires web applications to be added to your <strong>Home Screen</strong> before it allows background push notifications:
                      </p>
                      <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-800 space-y-2 text-zinc-300 text-[11px]">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                          <span>Tap the <strong>Share</strong> button (<Share2 className="w-3.5 h-3.5 inline mx-0.5 text-blue-400" />) in your Safari toolbar at the bottom.</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                          <span>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong>.</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                          <span>Open <strong>Evolve</strong> from your Home Screen icon and click &quot;Enable Now&quot;!</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Android Notice */}
                  {diagnostics?.isAndroid && (
                    <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-800/30 text-[11px] text-blue-300 flex items-start gap-2.5">
                      <Smartphone className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <span>
                        <strong>Android Notice:</strong> If notification popups do not appear on your phone, ensure Chrome notifications are allowed in your Android System Settings: <em>Settings &gt; Apps &gt; Chrome &gt; Notifications &gt; Allowed</em>.
                      </span>
                    </div>
                  )}

                  {/* Standalone PWA confirmation */}
                  {diagnostics?.isStandalone && (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Running in standalone Home Screen App mode — Mobile WebPush fully supported.</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Reset Data (Collapsible) */}
          <div className="rounded-2xl border border-red-500/30 bg-red-950/10 overflow-hidden transition-all duration-200">
            <button
              type="button"
              onClick={() => toggleSection('danger')}
              className="w-full flex items-center justify-between p-5 sm:p-6 text-left transition hover:bg-red-900/10 select-none"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 shadow-md">
                  <AlertTriangle size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-red-400">Reset Data</h2>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        openSections.danger
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {openSections.danger ? 'Open' : 'Reset'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    Permanently wipe account financial, task, note & habit records
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-400 transition-transform duration-200 ${
                    openSections.danger ? 'rotate-180 text-white' : ''
                  }`}
                >
                  <ChevronDown size={16} />
                </div>
              </div>
            </button>

            {openSections.danger && (
              <div className="px-5 sm:px-6 pb-6 pt-2 space-y-4 border-t border-red-500/20 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Reset All Platform Data</h3>
                    <p className="mt-1 text-xs text-zinc-400 max-w-xl">
                      Permanently wipe all your financial transactions, salary distribution plans and cycles,
                      tasks, notes, habits, countdowns, notifications, and AI conversations back to a fresh
                      starting state. Requires your account password to confirm.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setResetModalOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-xl bg-red-600/90 hover:bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-600/20 transition shrink-0"
                  >
                    <Lock size={14} />
                    <span>Reset All Data...</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Password Verification Modal */}
      <ResetDataModal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
      />
    </div>
  );
}
