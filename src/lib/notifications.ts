import { createClient } from '@/lib/supabase';

// ── Types ───────────────────────────────────────────────────────────────────

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'ai' | 'reminder';

export interface InAppNotification {
  id?: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  action_url?: string | null;
  is_read: boolean;
  created_at?: string;
}

// ── VAPID helper ────────────────────────────────────────────────────────────

const DEFAULT_VAPID_PUBLIC_KEY =
  'BIxGd6n4Vp17qTxzxLJCE4VxdJgbX3FEt28UtDXyT3I7czJLDzJVFFdfiNyDDqLj1OVMgm74ii-cT-exXN-MnRk';

/**
 * Convert a Base64-URL-encoded VAPID public key to a Uint8Array
 * suitable for `applicationServerKey` in pushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ── Request permission & subscribe ──────────────────────────────────────────

/**
 * 1. Asks the browser for notification permission.
 * 2. Registers the service worker (`/sw.js`).
 * 3. Subscribes to web-push using the VAPID public key.
 * 4. POSTs the PushSubscription JSON to `/api/notifications` so the
 *    server can send pushes later.
 *
 * Returns the PushSubscription on success, or `null` if denied / unsupported.
 */
export async function requestNotificationPermission(
  explicitUserId?: string
): Promise<PushSubscription | null> {
  // Guard: browser support
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    console.warn('Push notifications are not supported in this browser.');
    return null;
  }

  // 1. Ask permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.info('Notification permission denied by user.');
    return null;
  }

  try {
    // 2. Register service worker
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready; // wait until active

    // 3. Subscribe to push
    const vapidPublicKey =
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;

    let subscription: PushSubscription | null = null;
    try {
      subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
        });
      }
    } catch (subErr) {
      console.warn('Renewing push subscription:', subErr);
      try {
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          await existing.unsubscribe();
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
        });
      } catch (retryErr) {
        console.error('Failed to subscribe to pushManager:', retryErr);
        return null;
      }
    }

    if (!subscription) {
      return null;
    }

    // 4. Resolve user ID and save subscription to backend & database
    let targetUserId = explicitUserId;
    if (!targetUserId) {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        targetUserId = user?.id;
      } catch {}
    }

    if (targetUserId) {
      // 1. Save via backend API
      try {
        const response = await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: targetUserId,
            subscription: subscription.toJSON(),
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          console.error('Failed to save push subscription on server:', errData);
        }
      } catch (apiErr) {
        console.warn('Backend API subscription post warning:', apiErr);
      }

      // 2. Also save directly to Supabase with user auth context
      try {
        const supabase = createClient();
        await supabase.from('push_subscriptions').insert({
          user_id: targetUserId,
          subscription: subscription.toJSON(),
        });
      } catch {}
    }

    return subscription;
  } catch (error) {
    console.error('Error setting up push notifications:', error);
    return null;
  }
}

// ── Local (browser-level) notification ──────────────────────────────────────

/**
 * Immediately show a browser notification without going through push.
 * Useful for in-app events that the user should see right away
 * (e.g. "AI task completed", "Reminder fired").
 */
export async function sendLocalNotification(title: string, body: string): Promise<void> {
  if (typeof window === 'undefined') return;

  if (!('Notification' in window)) {
    console.warn('Notifications not supported in this browser window.');
    return;
  }

  // Ensure we have permission
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
  }

  // 1. Try via active service-worker registration (required on mobile browsers)
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        icon: '/logo.png',
        tag: 'evolve-local',
        renotify: true,
      } as NotificationOptions);
      return;
    } catch (swErr) {
      console.warn('Service worker showNotification error, falling back:', swErr);
    }
  }

  // 2. Fallback to standard window Notification
  try {
    new Notification(title, {
      body,
      icon: '/icon.svg',
    });
  } catch (windowNotifErr) {
    console.warn('Window Notification error:', windowNotifErr);
  }
}

// ── In-app (Supabase-persisted) notification ────────────────────────────────

/**
 * Persist a notification row in the `notifications` table so the user
 * can see it in-app (notification centre / bell icon).
 *
 * Returns the inserted row or `null` on failure.
 */
export async function createInAppNotification(
  userId: string,
  title: string,
  message: string,
  type: NotificationType = 'info',
  actionUrl?: string | null,
): Promise<InAppNotification | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      title,
      message,
      type,
      action_url: actionUrl ?? null,
      is_read: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create in-app notification:', error.message);
    return null;
  }

  return data as InAppNotification;
}
