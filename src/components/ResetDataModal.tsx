'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  Trash2,
  Loader2,
  CheckCircle2,
  X,
  ShieldAlert,
} from 'lucide-react';

interface ResetDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ResetDataModal({
  isOpen,
  onClose,
  onSuccess,
}: ResetDataModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/user/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset data');
      }

      // Purge all client-side cached data in browser localStorage (preserve user theme preference)
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            key.startsWith('bibo_') &&
            key !== 'bibo_user_theme' &&
            key !== 'bibo_user_gender'
          ) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch (storageErr) {
        console.warn('Could not clear local storage cache:', storageErr);
      }

      // Dismiss any open notification banners in browser/SW
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.getNotifications().then((notifs) => {
              notifs.forEach((n) => n.close());
            });
          });
        }
      } catch {}

      setSuccess(true);
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        } else {
          window.location.href = '/';
        }
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Incorrect password or server error');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setPassword('');
    setError(null);
    setSuccess(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-red-500/30 bg-zinc-900 shadow-2xl">
        {/* Header Banner */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-red-950/20 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Reset All Platform Data</h2>
              <p className="text-xs text-red-400">Security Password Verification Required</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {success ? (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 size={32} />
              </div>
              <p className="text-base font-semibold text-white">All Data Cleared Successfully</p>
              <p className="text-xs text-zinc-400">
                Your account is fresh and ready. Reloading dashboard…
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Warning Notice */}
              <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-200 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-red-300">
                  <AlertTriangle size={15} />
                  <span>Warning: This action is permanent!</span>
                </div>
                <p className="text-[11px] text-zinc-300">
                  The following data will be permanently wiped from your account:
                </p>
                <ul className="list-disc pl-4 text-[11px] text-zinc-400 space-y-0.5">
                  <li>All Financial Transactions, Salary Plans & Distribution Cycles</li>
                  <li>All Tasks (Todo, In-Progress, Done) & Reminders</li>
                  <li>All Saved Notes, Documents & Scanned Receipts</li>
                  <li>All Habits & Daily Consistency Logs</li>
                  <li>All AI Chat History & Daily Summaries</li>
                  <li>All Countdowns & Milestone Events</li>
                  <li>All Notifications, Preferences & Scheduled Alerts</li>
                </ul>
                <p className="text-[10px] text-zinc-500 pt-1">
                  *Your account email and login credentials will remain intact.
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400 flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Password Input */}
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                  Enter your account password to authorize reset:
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                    <Lock size={15} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Account password"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-10 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="rounded-xl px-4 py-2.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white transition disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !password.trim()}
                  className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-600/20 hover:bg-red-500 transition disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Verifying & Wiping...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>Confirm & Wipe All Data</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
