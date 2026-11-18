'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import ResetDataModal from '@/components/ResetDataModal';
import { useTheme } from '@/context/ThemeContext';
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
} from 'lucide-react';
import { useNavigation, AVAILABLE_NAV_OPTIONS, NAV_OPTIONS_MAP } from '@/context/NavigationContext';

export default function SettingsPage() {
  const supabase = createClient();
  const { gender, setGender, isGirly } = useTheme();
  const { slots, updateSlot, resetSlots } = useNavigation();

  // Accordion open/close state for settings sections (all collapsed by default)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    profile: false,
    theme: false,
    nav: false,
    danger: false,
  });

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
      }
    }

    loadUser();
  }, [supabase]);

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

          {/* Theme & Gender Preference Card (Collapsible) */}
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
                      : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  }`}
                >
                  <Palette size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">Platform Theme & Visual Style</h2>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        openSections.theme
                          ? isGirly
                            ? 'bg-pink-500/20 text-pink-300'
                            : 'bg-purple-500/20 text-purple-300'
                          : isGirly
                            ? 'bg-pink-500/10 text-pink-400'
                            : 'bg-blue-500/10 text-blue-400'
                      }`}
                    >
                      {openSections.theme ? 'Open' : gender === 'female' ? '🌸 Girl Theme' : '⚡ Boy Theme'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    {gender === 'female'
                      ? '🌸 Girly state: Soft rose, pink gradients & aesthetic accents'
                      : '⚡ Tech state: Electric blue, cyan gradients & dark slate'}
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
              <div className="px-5 sm:px-6 pb-6 pt-2 space-y-4 border-t border-zinc-800/80 animate-fade-in">
                <p className="text-xs text-zinc-400">
                  Personalize your platform&apos;s colors and visual aesthetic based on your preference.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
                      gender === 'female'
                        ? 'border-pink-500 bg-pink-500/20 text-pink-200 shadow-lg shadow-pink-500/20 ring-2 ring-pink-500/40'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-pink-500/50 hover:text-pink-300'
                    }`}
                  >
                    <span className="text-3xl">🌸</span>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        Girl / Female
                        {gender === 'female' && (
                          <span className="rounded-full bg-pink-500/30 px-2 py-0.5 text-[10px] font-semibold text-pink-300">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-pink-300/80 mt-0.5">
                        Girly state: Soft rose, pink gradients, plum night & aesthetic accents
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
                      gender === 'male' || gender === 'default'
                        ? 'border-blue-500 bg-blue-500/20 text-blue-200 shadow-lg shadow-blue-500/20 ring-2 ring-blue-500/40'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-blue-500/50 hover:text-blue-300'
                    }`}
                  >
                    <span className="text-3xl">⚡</span>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        Boy / Male
                        {(gender === 'male' || gender === 'default') && (
                          <span className="rounded-full bg-blue-500/30 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-blue-300/80 mt-0.5">
                        Tech state: Electric blue, cyan gradients & deep slate aesthetic
                      </div>
                    </div>
                  </button>
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
                    Personalize the 4 shortcuts on your mobile navigation bar. The <strong>Home</strong> button is elevated and permanently anchored in the center for quick one-thumb reachability.
                  </p>
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
                      Permanently wipe all your financial transactions, tasks, notes, habits, and chat
                      conversations back to a fresh starting state. Requires your account password to confirm.
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
