'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench, RefreshCw, LogOut, Sparkles, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase';

export default function MaintenancePage() {
  const router = useRouter();
  const supabase = createClient();
  const [checking, setChecking] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleRefresh = () => {
    setChecking(true);
    setTimeout(() => {
      window.location.href = '/';
    }, 600);
  };

  const handleSignOut = async () => {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch {
      window.location.href = '/login';
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl">
        {/* Animated Icon */}
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500/20 via-orange-500/20 to-rose-500/20 border border-amber-500/30 text-amber-400 shadow-lg shadow-amber-500/10">
          <Wrench size={38} className="animate-bounce" />
          <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-slate-950 font-bold text-xs">
            !
          </div>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <span className="inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-400">
            Account Under Maintenance
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Sorry, we are working on it
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Your account is currently locked for system updates and performance enhancements.
            We are applying important changes to your data and features.
          </p>
        </div>

        {/* Info Box */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-left text-xs text-slate-400 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-slate-300">
            <Sparkles size={14} className="text-amber-400" />
            <span>What is happening?</span>
          </div>
          <p>
            Our team is performing scheduled maintenance on your account.
            Normal access will be restored once the update process completes.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            onClick={handleRefresh}
            disabled={checking}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
            <span>{checking ? 'Checking...' : 'Check Status'}</span>
          </button>

          <button
            onClick={handleSignOut}
            disabled={loggingOut}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-800/80 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition active:scale-95 disabled:opacity-50"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
