/// <reference lib="webworker" />

// ── Install — claim immediately on all platforms ───────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// ── Activate — claim clients immediately ────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ── Push Event ──────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  /** @type {PushEvent} */
  const pushEvent = event;

  let data = { title: 'AbanoubApp', body: 'You have a new notification', url: '/' };

  if (pushEvent.data) {
    try {
      data = { ...data, ...pushEvent.data.json() };
    } catch {
      data.body = pushEvent.data.text();
    }
  }

  // Mobile-safe notification options (avoid SVG badge which crashes Android NotificationManager)
  const options = {
    body: data.body,
    icon: '/icon.svg',
    tag: 'abanoubapp-notification',
    renotify: true,
    data: { url: data.url || '/' },
  };

  try {
    pushEvent.waitUntil(self.registration.showNotification(data.title, options));
  } catch (err) {
    // Ultra-safe fallback for older mobile engines
    pushEvent.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
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
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window with the target URL is already open, focus it
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // If any app window is open, navigate it
      if (windowClients.length > 0 && 'navigate' in windowClients[0]) {
        return windowClients[0].navigate(targetUrl).then((client) => client?.focus());
      }
      // Otherwise open a new window
      return clients.openWindow(targetUrl);
    })
  );
});
