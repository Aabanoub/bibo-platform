/// <reference lib="webworker" />

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

  const options = {
    body: data.body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: 'abanoubapp-notification',
    renotify: true,
    data: { url: data.url || '/' },
    vibrate: [100, 50, 100],
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  pushEvent.waitUntil(self.registration.showNotification(data.title, options));
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

// ── Activate — claim clients immediately ────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
