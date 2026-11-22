'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { loadActiveTimerFromDb } from '@/lib/active-timer-sync';
import { useNavigation } from '@/context/NavigationContext';
import { Lock, Loader2 } from 'lucide-react';

/**
 * GlobalActiveStudyGuard
 * Enforces website freeze lockdown across all pages:
 * 1. If an active study timer is running in Supabase and the user opens or visits
 *    any other route (e.g. /notes, /finance, /habits, /), this guard immediately
 *    freezes the screen and redirects them straight to /tasks.
 * 2. Intercepts all clicks on navigation links, sidebar, and bottom bar while
 *    lockdown is active, permitting only timer controls (pause, complete).
 */
export default function GlobalActiveStudyGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  const { isStudyLockdownActive } = useNavigation();
  const [isLockedOnOtherRoute, setIsLockedOnOtherRoute] = useState(false);
  const [sessionTitle, setSessionTitle] = useState<string>('');

  // Intercept any click across the website during active lockdown
  useEffect(() => {
    if (!isStudyLockdownActive) return;

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Allow clicks on study timer controls (pause, complete, resume, dialogs)
      if (target.closest('[data-timer-control="true"]')) {
        return;
      }

      // Block all links, navigation items, and external buttons
      const link = target.closest('a');
      const nav = target.closest('nav, aside, header');
      const button = target.closest('button');

      if (link || nav || button) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('click', handleGlobalClick, true);
    return () => {
      window.removeEventListener('click', handleGlobalClick, true);
    };
  }, [isStudyLockdownActive]);

  useEffect(() => {
    let isMounted = true;
    let realtimeChannel: any = null;

    const checkActiveTimer = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          if (isMounted) setIsLockedOnOtherRoute(false);
          return;
        }

        const adjusted = await loadActiveTimerFromDb(supabase, session.user.id);
        if (adjusted && adjusted.isRunning && !adjusted.isFinished) {
          if (pathname !== '/tasks') {
            if (isMounted) {
              setSessionTitle(adjusted.title || 'Study Session');
              setIsLockedOnOtherRoute(true);
            }
            router.replace('/tasks');
          } else {
            if (isMounted) setIsLockedOnOtherRoute(false);
          }
          return;
        }
        if (isMounted) setIsLockedOnOtherRoute(false);
      } catch (err) {
        console.warn('GlobalActiveStudyGuard check error:', err);
      }
    };

    checkActiveTimer();

    // Listen for realtime timer changes across devices
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.id || !isMounted) return;
      const userId = session.user.id;

      realtimeChannel = supabase
        .channel(`global-study-guard-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'active_study_timers',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              if (isMounted) setIsLockedOnOtherRoute(false);
            } else if (payload.new && (payload.new as any).is_running) {
              const row = payload.new as any;
              if (pathname !== '/tasks') {
                if (isMounted) {
                  setSessionTitle(row.title || 'Study Session');
                  setIsLockedOnOtherRoute(true);
                }
                router.replace('/tasks');
              }
            } else {
              if (isMounted) setIsLockedOnOtherRoute(false);
            }
          }
        )
        .subscribe();
    });

    return () => {
      isMounted = false;
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, [pathname, router, supabase]);

  if (!isLockedOnOtherRoute || pathname === '/tasks') {
    return null;
  }

  return (
    <div
      data-timer-control="true"
      className="fixed inset-0 top-0 left-0 w-screen h-screen z-[999999] bg-[#070b14] flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in"
    >
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-3xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-2xl shadow-blue-500/20 animate-pulse">
          <Lock className="w-10 h-10" />
        </div>
      </div>
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-bold uppercase tracking-wider mb-4">
        <span>Deep Study Lockdown Active</span>
      </div>
      <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
        {sessionTitle || 'Active Study Session'}
      </h2>
      <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
        The entire website is frozen so you can concentrate 100% on studying without distractions.
        Taking you to your study session now...
      </p>
      <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 bg-slate-900/80 border border-slate-800 px-4 py-2 rounded-xl">
        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
        <span>Loading Focus Mode...</span>
      </div>
    </div>
  );
}
