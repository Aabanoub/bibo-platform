'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import ResetDataModal from '@/components/ResetDataModal';
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
} from 'lucide-react';

export default function SettingsPage() {
  const supabase = createClient();

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
            <p className="text-[11px] sm:text-xs text-zinc-400">Manage account credentials, AI preferences & data</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-0 sm:p-2">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Account Profile Card */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-800">
              <User size={18} className="text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Profile Information</h2>
            </div>

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

          {/* AI Engines & System Status */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-zinc-800">
              <Cpu size={18} className="text-purple-400" />
              <h2 className="text-sm font-semibold text-white">AI Engine & Capabilities</h2>
            </div>

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

          {/* Danger Zone: Reset All Data */}
          <div className="rounded-2xl border border-red-500/30 bg-red-950/10 p-6 space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-red-500/20">
              <AlertTriangle size={18} className="text-red-400" />
              <h2 className="text-sm font-semibold text-red-400">Danger Zone</h2>
            </div>

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
