'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import ResetDataModal from '@/components/ResetDataModal';
import { useTheme } from '@/context/ThemeContext';
import {
  Settings,
  User,
  Shield,
  Key,
  Trash2,
  Check,
  AlertTriangle,
  Cpu,
  Mail,
  Calendar,
  Lock,
  Sparkles,
  Palette,
  Smartphone,
  RotateCcw,
  Home,
  ChevronDown,
  Bell,
  BellRing,
  Send,
  Timer,
  Radio,
  CheckCircle2,
  Volume2,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useNavigation, AVAILABLE_NAV_OPTIONS, NAV_OPTIONS_MAP } from '@/context/NavigationContext';
import {
  requestNotificationPermission,
  sendLocalNotification,
  createInAppNotification,
} from '@/lib/notifications';

export default function SettingsPage() {
  const supabase = createClient();
  const { gender, setGender, isGirly } = useTheme();
  const { slots, updateSlot, resetSlots } = useNavigation();

  // Accordion open/close state for all settings sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    profile: false,
    theme: false,
    nav: false,
    notifications: false,
    ai: false,
    danger: false,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const areAllOpen = Object.values(openSections).every(Boolean);
  const toggleAll = () => {
    const nextState = !areAllOpen;
    setOpenSections({
      profile: nextState,
      theme: nextState,
      nav: nextState,
      notifications: nextState,
      ai: nextState,
      danger: nextState,
    });
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

  // ── Notification Test States & Handlers ─────────────────────────────────────
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [swRegistered, setSwRegistered] = useState<boolean>(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    details?: string;
  } | null>(null);
  const [delayedCountdown, setDelayedCountdown] = useState<number | null>(null);

  useEffect(() => {
    async function checkNotificationHealth() {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotifPermission(Notification.permission);
      }
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          setSwRegistered(!!reg);
        } catch {
          setSwRegistered(false);
        }
      }
    }
    checkNotificationHealth();
  }, []);

  const handleRequestPermission = async () => {
    setTestingChannel('perm');
    setTestResult(null);
    try {
      const sub = await requestNotificationPermission(user?.id);
      const status = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
      setNotifPermission(status);
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        setSwRegistered(!!reg);
      }

      if (status === 'granted') {
        setTestResult({
          type: 'success',
          message: 'Notifications Allowed!',
          details: sub ? 'Subscribed to Web Push service worker successfully.' : 'Permission granted in browser.',
        });
      } else {
        setTestResult({
          type: 'error',
          message: 'Permission Not Granted',
          details: `Current permission status: "${status}". Please allow notifications in site settings.`,
        });
      }
    } catch (err: unknown) {
      setTestResult({
        type: 'error',
        message: 'Permission Request Failed',
        details: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTestingChannel(null);
    }
  };

  const handleTestDesktopPush = async () => {
    setTestingChannel('desktop');
    setTestResult(null);
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        throw new Error('This browser does not support the Notification API.');
      }

      let currentPerm: string = Notification.permission;
      if (currentPerm !== 'granted') {
        await handleRequestPermission();
        currentPerm = Notification.permission;
        if (currentPerm !== 'granted') return;
      }

      await sendLocalNotification(
        '🔔 Test Alert — AbanoubApp',
        `Browser notification dispatched at ${new Date().toLocaleTimeString()}! Your system push alerts are active.`
      );

      setTestResult({
        type: 'success',
        message: 'Desktop Push Dispatched!',
        details: 'You should see a system banner/popup notification right now.',
      });
    } catch (err: unknown) {
      setTestResult({
        type: 'error',
        message: 'Desktop Push Failed',
        details: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTestingChannel(null);
    }
  };

  const handleTestInAppNotification = async () => {
    if (!user) return;
    setTestingChannel('inapp');
    setTestResult(null);
    try {
      const created = await createInAppNotification(
        user.id,
        '🎉 Test In-App Notification',
        `Realtime test notification generated at ${new Date().toLocaleTimeString()}. Notice the unread badge on your Bell!`,
        'info',
        '/settings'
      );

      if (created) {
        setTestResult({
          type: 'success',
          message: 'In-App Notification Created!',
          details: 'Row inserted in Supabase notifications table. Look at the Bell icon in your sidebar/header.',
        });
      } else {
        throw new Error('Could not insert notification into database.');
      }
    } catch (err: unknown) {
      setTestResult({
        type: 'error',
        message: 'In-App Test Failed',
        details: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTestingChannel(null);
    }
  };

  const handleTestWebPush = async () => {
    if (!user) return;
    setTestingChannel('webpush');
    setTestResult(null);
    try {
      // 1. Ensure the browser is actively subscribed and recorded in database
      const sub = await requestNotificationPermission(user.id);
      if (!sub) {
        throw new Error(
          'Could not retrieve browser push subscription. Please ensure notifications are allowed in your browser address bar.'
        );
      }

      // Small tick to ensure DB commit is visible
      await new Promise((r) => setTimeout(r, 400));

      // 2. Trigger WebPush via API
      const res = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          title: '⚡ Test WebPush via VAPID',
          message: `Server-to-client background push verified at ${new Date().toLocaleTimeString()}!`,
          actionUrl: '/settings',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setTestResult({
          type: 'success',
          message: 'WebPush Sent via Backend!',
          details: `Sent to ${data.sent} device subscription(s) (Total active: ${data.total}).`,
        });
      } else if (res.status === 404) {
        setTestResult({
          type: 'info',
          message: 'Subscription Pending',
          details: 'Your device subscription was just registered. Click "Test WebPush API" once more to dispatch.',
        });
      } else {
        throw new Error(data.error || 'Failed to dispatch web push');
      }
    } catch (err: unknown) {
      setTestResult({
        type: 'error',
        message: 'WebPush Test Error',
        details: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTestingChannel(null);
    }
  };

  const handleTestDelayedReminder = () => {
    if (delayedCountdown !== null) return;
    setTestResult({
      type: 'info',
      message: 'Countdown Started (5s)',
      details: 'You can switch tabs now! A notification will fire in 5 seconds to test background delivery.',
    });

    let count = 5;
    setDelayedCountdown(count);

    const interval = setInterval(async () => {
      count -= 1;
      if (count <= 0) {
        clearInterval(interval);
        setDelayedCountdown(null);

        try {
          await sendLocalNotification(
            '⏰ 5s Timer Test Fired!',
            `Simulated finish reminder alarm delivered at ${new Date().toLocaleTimeString()}!`
          );

          if (user) {
            await createInAppNotification(
              user.id,
              '⏰ 5s Delayed Reminder Fired',
              'Simulated background alarm triggered successfully.',
              'reminder',
              '/settings'
            );
          }

          setTestResult({
            type: 'success',
            message: 'Delayed Alarm Fired!',
            details: 'The 5-second simulated reminder was dispatched successfully.',
          });
        } catch (e: unknown) {
          setTestResult({
            type: 'error',
            message: 'Delayed Test Error',
            details: e instanceof Error ? e.message : String(e),
          });
        }
      } else {
        setDelayedCountdown(count);
      }
    }, 1000);
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
            <p className="text-[11px] sm:text-xs text-zinc-400">Manage account credentials, AI preferences & data</p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 transition"
        >
          <span>{areAllOpen ? 'Collapse All' : 'Expand All'}</span>
        </button>
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

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-zinc-500">
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

          {/* Push & In-App Notification Test Card (Collapsible) */}
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
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">Notifications & Test Bench</h2>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        notifPermission === 'granted'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : notifPermission === 'denied'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {notifPermission === 'granted'
                        ? '🔔 Active'
                        : notifPermission === 'denied'
                        ? '🔕 Blocked'
                        : '⚠️ Action Required'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    Browser push alerts, in-app bell, WebPush & real-time test simulator
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
              <div className="px-5 sm:px-6 pb-6 pt-2 space-y-4 border-t border-zinc-800/80 animate-fade-in">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Verify and test that your device is properly configured to receive task finish reminders, countdown event alerts, and daily AI briefings.
                </p>

                {/* Status Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-1">
                    <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Browser Permission</span>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-200 capitalize">{notifPermission}</span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          notifPermission === 'granted'
                            ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                            : notifPermission === 'denied'
                            ? 'bg-red-400 shadow-sm shadow-red-400/50'
                            : 'bg-amber-400 shadow-sm shadow-amber-400/50'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-1">
                    <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Service Worker</span>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-200">{swRegistered ? 'Active & Ready' : 'Not Registered'}</span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          swRegistered ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-zinc-600'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block">Permission Prompt</span>
                      <span className="text-zinc-300 font-medium text-xs">
                        {notifPermission === 'granted' ? 'Allowed' : 'Not Enabled'}
                      </span>
                    </div>
                    {notifPermission !== 'granted' && (
                      <button
                        type="button"
                        onClick={handleRequestPermission}
                        disabled={testingChannel === 'perm'}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition disabled:opacity-50"
                      >
                        {testingChannel === 'perm' ? 'Prompting...' : 'Enable Now'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Test Feedback Alert Box */}
                {testResult && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 animate-fade-in ${
                      testResult.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : testResult.type === 'error'
                        ? 'bg-red-500/10 border-red-500/30 text-red-300'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">{testResult.message}</div>
                      {testResult.details && (
                        <div className="text-[11px] opacity-90 mt-0.5">{testResult.details}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Interactive Test Bench Grid */}
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-blue-400" />
                    <span>Run Notification Diagnostics:</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Test 1: Desktop Push */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-white font-semibold text-xs">
                          <Volume2 className="w-4 h-4 text-blue-400" />
                          <span>1. Test Desktop Push Alert</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1">
                          Immediately triggers a native system banner and sound through your browser.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleTestDesktopPush}
                        disabled={testingChannel === 'desktop'}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-1.5 text-xs transition"
                      >
                        {testingChannel === 'desktop' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Bell className="w-3.5 h-3.5" />
                        )}
                        <span>Send Desktop Alert</span>
                      </button>
                    </div>

                    {/* Test 2: In-App Bell */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-white font-semibold text-xs">
                          <BellRing className="w-4 h-4 text-indigo-400" />
                          <span>2. Test In-App Notification Bell</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1">
                          Inserts a live notification into Supabase to increment the bell badge counter in real-time.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleTestInAppNotification}
                        disabled={testingChannel === 'inapp'}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-1.5 text-xs transition"
                      >
                        {testingChannel === 'inapp' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        <span>Send In-App Bell Notice</span>
                      </button>
                    </div>

                    {/* Test 3: WebPush API */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-white font-semibold text-xs">
                          <Send className="w-4 h-4 text-purple-400" />
                          <span>3. Test Backend WebPush (VAPID)</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1">
                          Tests server-to-client push routing via /api/notifications across all your registered devices.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleTestWebPush}
                        disabled={testingChannel === 'webpush'}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium py-1.5 text-xs transition"
                      >
                        {testingChannel === 'webpush' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>Test WebPush API</span>
                      </button>
                    </div>

                    {/* Test 4: 5-Second Delayed Reminder */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-white font-semibold text-xs">
                          <Timer className="w-4 h-4 text-amber-400" />
                          <span>4. Test 5s Delayed Reminder</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1">
                          Simulates a scheduled task finish alarm. Switch tabs after clicking to test background delivery!
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleTestDelayedReminder}
                        disabled={delayedCountdown !== null}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium py-1.5 text-xs transition"
                      >
                        <Timer className="w-3.5 h-3.5" />
                        <span>
                          {delayedCountdown !== null
                            ? `Firing in ${delayedCountdown}s...`
                            : 'Start 5s Delayed Test'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Troubleshooting help */}
                {notifPermission === 'denied' && (
                  <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/40 text-[11px] text-red-300 space-y-1">
                    <span className="font-semibold block">⚠️ How to unblock notifications in your browser:</span>
                    <p className="text-zinc-400">
                      1. Click the lock or settings icon on the left side of your browser address bar.<br />
                      2. Locate <strong>Notifications</strong> and change it from <em>Blocked</em> to <em>Allow</em>.<br />
                      3. Refresh this page and click &quot;Enable Now&quot; above.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Engines & System Status (Collapsible) */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden transition-all duration-200">
            <button
              type="button"
              onClick={() => toggleSection('ai')}
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
                  <Cpu size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">AI Engine & Capabilities</h2>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        openSections.ai
                          ? isGirly
                            ? 'bg-pink-500/20 text-pink-300'
                            : 'bg-purple-500/20 text-purple-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {openSections.ai ? 'Open' : 'Active (2)'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    Groq LPU Engine (Online) • Google Gemini Multimodal (Online)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-400 transition-transform duration-200 ${
                    openSections.ai ? 'rotate-180 text-white' : ''
                  }`}
                >
                  <ChevronDown size={16} />
                </div>
              </div>
            </button>

            {openSections.ai && (
              <div className="px-5 sm:px-6 pb-6 pt-2 space-y-4 border-t border-zinc-800/80 animate-fade-in">
                <p className="text-xs text-zinc-400">
                  Platform machine intelligence backend services, models, and real-time inference status.
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-200">Groq LPU Engine</span>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        ONLINE
                      </span>
                    </div>
                    <p className="text-zinc-500 text-[11px]">
                      Powering conversational AI and Whisper Large V3 Turbo speech transcription.
                    </p>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-200">Google Gemini Multimodal</span>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        ONLINE
                      </span>
                    </div>
                    <p className="text-zinc-500 text-[11px]">
                      Powering receipt OCR scanning, document analysis, and fallback reasoning.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Danger Zone: Reset All Data (Collapsible) */}
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
                    <h2 className="text-sm font-semibold text-red-400">Danger Zone</h2>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        openSections.danger
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {openSections.danger ? 'Open' : 'Restricted'}
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
