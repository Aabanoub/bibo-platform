/// <reference lib="webworker" />
// Service Worker Version: 2.1.0-notifications-hardened

// ── Install — claim immediately on all platforms ───────────────────────────
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ── Activate — claim clients immediately ────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Push Event ──────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  /** @type {PushEvent} */
  const pushEvent = event;

  let data = {
    title: 'Evolve',
    body: 'You have a new update in your Life OS.',
    url: '/',
    tag: 'evolve-notification',
  };

  if (pushEvent.data) {
    try {
      data = { ...data, ...pushEvent.data.json() };
    } catch {
      data.body = pushEvent.data.text();
    }
  }

  // Mobile & desktop compliant notification options using verified raster PNG assets
  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/favicon-32x32.png',
    tag: data.tag || 'evolve-notification',
    renotify: true,
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      timestamp: data.timestamp || Date.now(),
    },
  };

  try {
    pushEvent.waitUntil(self.registration.showNotification(data.title, options));
  } catch (err) {
    // Ultra-safe fallback for older engines
    pushEvent.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon-192.png',
      })
    );
  }
});

// ── Notification Click ──────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  /** @type {NotificationEvent} */
  const clickEvent = event;

  clickEvent.notification.close();

  if (clickEvent.action === 'dismiss') return;

  const targetUrl = clickEvent.notification.data?.url || '/';

  clickEvent.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. If an exact matching window is already open, focus it
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }

      // 2. If any Evolve tab is open, navigate it to target and focus
      if (windowClients.length > 0 && 'navigate' in windowClients[0]) {
        return windowClients[0].navigate(targetUrl).then((c) => c?.focus());
      }

      // 3. Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Notification Close (Optional Analytics / Clean-up) ──────────────────────
self.addEventListener('notificationclose', () => {
  // Gracefully handled
});
