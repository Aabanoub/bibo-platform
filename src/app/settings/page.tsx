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
} from 'lucide-react';
import { useNavigation, AVAILABLE_NAV_OPTIONS, NAV_OPTIONS_MAP } from '@/context/NavigationContext';

export default function SettingsPage() {
  const supabase = createClient();
  const { gender, setGender, theme, setTheme, isGirly, activeThemeConfig } = useTheme();
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
                    {activeThemeConfig.categoryLabel} • {activeThemeConfig.subtitle}
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
              <div className="px-5 sm:px-6 pb-6 pt-2 space-y-6 border-t border-zinc-800/80 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
                    Select your preferred aesthetic mode. When you choose <strong>Girl / Female</strong>, the two warm expressive themes appear. When you choose <strong>Boy / Male</strong>, the two cool futuristic themes appear.
                  </p>
                  <span className="text-[11px] text-zinc-500 shrink-0">
                    4 Premium Dark Themes Available
                  </span>
                </div>

                {/* Step 1: Gender / Category Filter Tabs */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Step 1: Choose Style Category
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      Active: {gender === 'female' ? 'Girl Themes' : 'Boy Themes'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setGender('female')}
                      className={`flex items-center gap-3.5 rounded-2xl border p-4 text-left transition-all duration-200 ${
                        gender === 'female'
                          ? 'border-pink-500/80 bg-gradient-to-br from-pink-500/15 via-purple-500/10 to-transparent text-pink-200 shadow-lg shadow-pink-500/15 ring-2 ring-pink-500/30'
                          : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-pink-500/40 hover:text-pink-300'
                      }`}
                    >
                      <span className="text-3xl filter drop-shadow">🌸</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white flex items-center justify-between">
                          <span>Girl / Female</span>
                          {gender === 'female' && (
                            <span className="rounded-full bg-pink-500/25 border border-pink-500/40 px-2 py-0.5 text-[9px] font-bold text-pink-300 uppercase tracking-wider">
                              ACTIVE MODE
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-pink-300/80 mt-0.5">
                          Warm & expressive: Violet Dream & Rose Aura
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setGender('male')}
                      className={`flex items-center gap-3.5 rounded-2xl border p-4 text-left transition-all duration-200 ${
                        gender === 'male' || gender === 'default'
                          ? 'border-blue-500/80 bg-gradient-to-br from-blue-500/15 via-cyan-500/10 to-transparent text-blue-200 shadow-lg shadow-blue-500/15 ring-2 ring-blue-500/30'
                          : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-blue-500/40 hover:text-blue-300'
                      }`}
                    >
                      <span className="text-3xl filter drop-shadow">⚡</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white flex items-center justify-between">
                          <span>Boy / Male</span>
                          {(gender === 'male' || gender === 'default') && (
                            <span className="rounded-full bg-blue-500/25 border border-blue-500/40 px-2 py-0.5 text-[9px] font-bold text-blue-300 uppercase tracking-wider">
                              ACTIVE MODE
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-blue-300/80 mt-0.5">
                          Cool & technological: Midnight Pulse & Forest Gravity
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Step 2: Dynamic Two Theme Selection Cards */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Step 2: Choose Your Theme ({gender === 'female' ? 'Girl Palettes' : 'Boy Palettes'})
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      Tap card to apply instantly
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Render the 2 themes corresponding to selected gender */}
                    {(gender === 'female'
                      ? (['violet-dream', 'rose-aura'] as ThemeId[])
                      : (['midnight-pulse', 'forest-gravity'] as ThemeId[])
                    ).map((tId) => {
                      const cfg = THEMES[tId];
                      const isSelected = theme === tId;

                      return (
                        <div
                          key={tId}
                          onClick={() => setTheme(tId)}
                          className={`group cursor-pointer rounded-2xl border p-4 sm:p-5 transition-all duration-300 flex flex-col justify-between relative overflow-hidden ${
                            isSelected
                              ? 'border-2 ring-2 ring-offset-2 ring-offset-zinc-950 shadow-2xl scale-[1.01]'
                              : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700 hover:bg-zinc-900/60'
                          }`}
                          style={{
                            borderColor: isSelected ? cfg.colors.primaryAccent : undefined,
                            backgroundColor: isSelected ? `${cfg.colors.secondaryBg}66` : undefined,
                          }}
                        >
                          {/* Ambient Glow Aura */}
                          {isSelected && (
                            <div
                              className="absolute -right-12 -top-12 h-36 w-36 rounded-full blur-3xl opacity-30 pointer-events-none"
                              style={{ backgroundColor: cfg.colors.primaryAccent }}
                            />
                          )}

                          <div className="space-y-3 relative z-10">
                            {/* Card Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="text-base font-bold text-white tracking-tight">
                                    {cfg.name}
                                  </h3>
                                  {isSelected && (
                                    <span
                                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm"
                                      style={{ backgroundColor: cfg.colors.primaryAccent }}
                                    >
                                      <Check size={10} strokeWidth={3} />
                                      Active
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-zinc-400 mt-0.5">
                                  {cfg.subtitle}
                                </p>
                              </div>

                              <span
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0"
                                style={{
                                  color: cfg.colors.secondaryAccent,
                                  borderColor: `${cfg.colors.secondaryAccent}40`,
                                  backgroundColor: `${cfg.colors.secondaryAccent}15`,
                                }}
                              >
                                {cfg.style}
                              </span>
                            </div>

                            {/* 5-Color Swatch Strip with Labels */}
                            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 p-2.5 space-y-1.5">
                              <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 block">
                                Color Palette:
                              </span>
                              <div className="grid grid-cols-5 gap-1.5">
                                {[
                                  { label: 'BG', hex: cfg.colors.background },
                                  { label: 'Surface', hex: cfg.colors.secondaryBg },
                                  { label: 'Primary', hex: cfg.colors.primaryAccent },
                                  { label: 'Accent', hex: cfg.colors.secondaryAccent },
                                  { label: 'Text', hex: cfg.colors.text },
                                ].map((swatch, idx) => (
                                  <div key={idx} className="flex flex-col items-center gap-1">
                                    <div
                                      className="h-6 w-full rounded-md border border-white/10 shadow-sm"
                                      style={{ backgroundColor: swatch.hex }}
                                    />
                                    <span className="text-[8px] font-mono text-zinc-400 truncate max-w-full">
                                      {swatch.hex}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Interactive Mini App Preview */}
                            <div
                              className="rounded-xl border p-3 space-y-2 text-xs transition-colors"
                              style={{
                                backgroundColor: cfg.colors.secondaryBg,
                                borderColor: `${cfg.colors.primaryAccent}40`,
                                color: cfg.colors.text,
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <div
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: cfg.colors.primaryAccent }}
                                  />
                                  <span className="font-semibold text-[11px]">Finance & Tasks</span>
                                </div>
                                <span
                                  className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                                  style={{
                                    backgroundColor: `${cfg.colors.primaryAccent}25`,
                                    color: cfg.colors.secondaryAccent,
                                  }}
                                >
                                  +80,000 EGP
                                </span>
                              </div>

                              {/* Mini Progress Bar */}
                              <div className="h-1.5 w-full rounded-full bg-black/40 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: '85%',
                                    background: `linear-gradient(90deg, ${cfg.colors.primaryAccent}, ${cfg.colors.secondaryAccent})`,
                                  }}
                                />
                              </div>

                              <div className="flex items-center justify-between text-[10px] opacity-80 pt-0.5">
                                <span>Streak: 7 Days</span>
                                <span>3 of 4 Done</span>
                              </div>
                            </div>
                          </div>

                          {/* Action Button */}
                          <div className="pt-4 relative z-10">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTheme(tId);
                              }}
                              className={`w-full flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-semibold transition shadow-md active:scale-95 ${
                                isSelected
                                  ? 'text-white'
                                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                              }`}
                              style={{
                                background: isSelected
                                  ? `linear-gradient(135deg, ${cfg.colors.primaryAccent}, ${cfg.colors.secondaryAccent})`
                                  : undefined,
                              }}
                            >
                              {isSelected ? (
                                <>
                                  <CheckCircle2 size={14} />
                                  <span>Currently Active Theme</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles size={14} />
                                  <span>Apply {cfg.name}</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
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
