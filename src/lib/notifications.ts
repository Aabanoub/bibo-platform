import { createClient } from '@/lib/supabase';
import type { NotificationPreference } from '@/types';

// ── Types ───────────────────────────────────────────────────────────────────

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'ai' | 'reminder';

export interface InAppNotification {
  id?: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  action_url?: string | null;
  event_id?: string | null;
  is_read: boolean;
  created_at?: string;
}

export interface ScheduleNotificationParams {
  userId: string;
  title: string;
  message: string;
  category: 'task' | 'countdown' | 'salary' | 'habit' | 'finance' | 'ai' | 'reminder';
  scheduledFor: Date | string;
  idempotencyKey: string;
  actionUrl?: string;
}

export interface DeviceDiagnostics {
  isSupported: boolean;
  permission: NotificationPermission;
  swSupported: boolean;
  swRegistered: boolean;
  pushSupported: boolean;
  isSubscribed: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isSecureContext: boolean;
  vapidPublicKeyPresent: boolean;
  endpoint?: string;
}

// ── VAPID helper ────────────────────────────────────────────────────────────

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

// ── Device Diagnostics ──────────────────────────────────────────────────────

/**
 * Perform a non-invasive capability inspection of the user's current device environment.
 */
export async function inspectNotificationCapabilities(): Promise<DeviceDiagnostics> {
  if (typeof window === 'undefined') {
    return {
      isSupported: false,
      permission: 'default',
      swSupported: false,
      swRegistered: false,
      pushSupported: false,
      isSubscribed: false,
      isStandalone: false,
      isIOS: false,
      isAndroid: false,
      isSecureContext: false,
      vapidPublicKeyPresent: false,
    };
  }

  const isSupported = 'Notification' in window;
  const permission = isSupported ? Notification.permission : 'default';
  const swSupported = 'serviceWorker' in navigator;
  const pushSupported = swSupported && 'PushManager' in window;
  const isSecureContext = window.isSecureContext ?? false;

  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);

  // Check PWA standalone mode
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  let swRegistered = false;
  let isSubscribed = false;
  let endpoint: string | undefined;

  if (swSupported) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        swRegistered = true;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          isSubscribed = true;
          endpoint = sub.endpoint;
        }
      }
    } catch {}
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  return {
    isSupported,
    permission,
    swSupported,
    swRegistered,
    pushSupported,
    isSubscribed,
    isStandalone,
    isIOS,
    isAndroid,
    isSecureContext,
    vapidPublicKeyPresent: Boolean(vapidKey),
    endpoint,
  };
}

// ── Authoritative Request Permission & Push Subscription ────────────────────

/**
 * Prompts user for browser notification permission, registers /sw.js,
 * subscribes via VAPID public key, and persists the subscription authoritatively
 * through /api/notifications with database-level uniqueness.
 */
export async function requestNotificationPermission(
  explicitUserId?: string
): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    console.warn('Notifications or Service Workers are not supported in this browser.');
    return null;
  }

  // 1. Explicit user permission prompt
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.info('Notification permission was not granted:', permission);
    return null;
  }

  try {
    // 2. Register Service Worker and await active state
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    // 3. Resolve VAPID Public Key
    let vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!vapidPublicKey) {
      // Query server public key dynamically if missing in client env
      try {
        const res = await fetch('/api/notifications');
        const data = await res.json();
        if (data?.vapid?.publicKey) {
          vapidPublicKey = data.vapid.publicKey;
        }
      } catch {}
    }

    if (!vapidPublicKey) {
      console.error('Cannot subscribe to Web Push: VAPID public key is missing.');
      return null;
    }

    // 4. Retrieve or create push subscription with PushManager
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
      console.warn('Renewing Web Push subscription:', subErr);
      try {
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          await existing.unsubscribe();
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
        });
      } catch (renewErr) {
        console.error('Failed to subscribe via pushManager:', renewErr);
        return null;
      }
    }

    if (!subscription) return null;

    // 5. Resolve target user ID
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

    // 6. Authoritative single persistence via backend API (no duplicate direct DB insert)
    if (targetUserId) {
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
        console.error('Failed to register subscription on server:', errData);
      }
    }

    return subscription;
  } catch (error) {
    console.error('Error during push notification setup:', error);
    return null;
  }
}

// ── Unsubscribe push notifications ──────────────────────────────────────────

export async function unsubscribePushNotifications(userId?: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;

    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;

    const endpoint = sub.endpoint;
    await sub.unsubscribe();

    if (userId) {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, endpoint }),
      });
    }

    return true;
  } catch (err) {
    console.error('Error unsubscribing push notifications:', err);
    return false;
  }
}

// ── Native Browser Notification (Mobile-safe via SW) ────────────────────────

/**
 * Display a native browser notification safely through the active Service Worker.
 * Guaranteed mobile compatibility (avoids broken `new Notification()` constructor on Android).
 */
export async function sendLocalNotification(
  title: string,
  body: string,
  tag = 'evolve-local',
  actionUrl = '/'
): Promise<void> {
  if (typeof window === 'undefined') return;

  if (!('Notification' in window)) {
    console.warn('Notifications not supported in this browser window.');
    return;
  }

  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
  }

  // 1. Primary path: Service Worker showNotification (Android & Desktop compliant)
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/favicon-32x32.png',
        tag,
        renotify: true,
        data: { url: actionUrl },
      } as NotificationOptions);
      return;
    } catch (swErr) {
      console.warn('Service Worker showNotification fallback:', swErr);
    }
  }

  // 2. Secondary fallback for desktop browsers without active SW
  try {
    new Notification(title, {
      body,
      icon: '/icon-192.png',
      tag,
    });
  } catch (winErr) {
    console.warn('Window Notification fallback error:', winErr);
  }
}

// ── In-App Notification Creation (Idempotent) ───────────────────────────────

/**
 * Persist an in-app notification row in the `notifications` table.
 * If `eventId` is provided, deduplicates against existing records.
 */
export async function createInAppNotification(
  userId: string,
  title: string,
  message: string,
  type: NotificationType = 'info',
  actionUrl?: string | null,
  eventId?: string
): Promise<InAppNotification | null> {
  const supabase = createClient();

  // Deduplication check: if eventId already logged, return existing
  if (eventId) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .maybeSingle();

    if (existing) {
      return existing as InAppNotification;
    }
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      title,
      message,
      type,
      action_url: actionUrl ?? null,
      event_id: eventId ?? null,
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

// ── Background Scheduling System ────────────────────────────────────────────

/**
 * Schedules a background notification in `scheduled_notifications`.
 * The free server-side cron runner dispatches this at `scheduledFor` even when the app is closed.
 */
export async function scheduleBackgroundNotification(
  params: ScheduleNotificationParams
): Promise<boolean> {
  try {
    const supabase = createClient();
    const scheduledISO =
      params.scheduledFor instanceof Date
        ? params.scheduledFor.toISOString()
        : new Date(params.scheduledFor).toISOString();

    const { error } = await supabase.from('scheduled_notifications').upsert(
      {
        user_id: params.userId,
        idempotency_key: params.idempotencyKey,
        title: params.title,
        message: params.message,
        category: params.category,
        action_url: params.actionUrl || '/',
        scheduled_for: scheduledISO,
        status: 'pending',
        retry_count: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,idempotency_key' }
    );

    if (error) {
      console.error('Error scheduling background notification:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Failed to schedule background notification:', err);
    return false;
  }
}

// ── Notification Preferences Management ─────────────────────────────────────

export async function fetchNotificationPreferences(
  userId: string
): Promise<NotificationPreference> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    // Return sensible defaults
    return {
      user_id: userId,
      in_app_enabled: true,
      browser_enabled: true,
      push_enabled: true,
      task_reminders: true,
      countdown_reminders: true,
      finance_alerts: true,
      salary_reminders: true,
      habit_reminders: true,
      ai_notifications: true,
      quiet_hours_enabled: false,
      quiet_hours_start: '22:00',
      quiet_hours_end: '08:00',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    };
  }

  return data as NotificationPreference;
}

export async function updateNotificationPreferences(
  userId: string,
  updates: Partial<NotificationPreference>
): Promise<NotificationPreference | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: userId,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('Error updating notification preferences:', error);
    return null;
  }

  return data as NotificationPreference;
}
