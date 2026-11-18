'use client';

import { useEffect } from 'react';

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const registerSW = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(async (reg) => {
          // If a new worker is waiting, activate it immediately
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          // Register Periodic Background Sync if supported (Android Chrome / Edge)
          if ('periodicSync' in reg) {
            try {
              const status = await (navigator as any).permissions.query({
                name: 'periodic-background-sync',
              });
              if (status.state === 'granted') {
                await (reg as any).periodicSync.register('evolve-notifications-check', {
                  minInterval: 60 * 1000,
                });
              }
            } catch {}
          }
        })
        .catch((err) => console.warn('PWA ServiceWorker registration error:', err));
    };

    // Client heartbeat: dispatch due scheduled notifications every 60s while app is open
    const heartbeat = setInterval(() => {
      fetch('/api/cron/notifications').catch(() => {});
    }, 60000);

    // Initial check on page launch
    fetch('/api/cron/notifications').catch(() => {});

    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW);
      return () => {
        clearInterval(heartbeat);
        window.removeEventListener('load', registerSW);
      };
    }

    return () => {
      clearInterval(heartbeat);
    };
  }, []);

  return null;
}
