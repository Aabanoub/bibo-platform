import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { initWebPush, checkVapidStatus } from '@/lib/vapid';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase admin environment variables.');
  }
  return createClient(url, serviceKey);
}

// ---------------------------------------------------------------------------
// GET or POST /api/cron/notifications — Background Notification Dispatcher
// Evaluates due items in `scheduled_notifications` and delivers in-app + push
// ---------------------------------------------------------------------------
async function processDueNotifications(req: NextRequest) {
  const startTime = Date.now();
  const cronSecret = process.env.CRON_SECRET;

  // Verify CRON authorization if configured (allow internal cron triggers)
  const authHeader = req.headers.get('authorization');
  if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized cron dispatch.' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const nowISO = new Date().toISOString();

  // 1. Fetch pending notifications scheduled for <= now
  const { data: dueItems, error: fetchErr } = await supabase
    .from('scheduled_notifications')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', nowISO)
    .order('scheduled_for', { ascending: true })
    .limit(50);

  if (fetchErr) {
    console.error('[cron/notifications] Fetch error:', fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!dueItems || dueItems.length === 0) {
    return NextResponse.json({
      message: 'No pending scheduled notifications due at this time.',
      processed: 0,
      timestamp: nowISO,
    });
  }

  // 2. Lock items atomically to 'processing' to prevent concurrent worker collisions
  const itemIds = dueItems.map((item) => item.id);
  await supabase
    .from('scheduled_notifications')
    .update({ status: 'processing', updated_at: nowISO })
    .in('id', itemIds);

  let vapidReady = false;
  try {
    if (checkVapidStatus().isConfigured) {
      initWebPush();
      vapidReady = true;
    }
  } catch {}

  const results: { id: string; status: 'sent' | 'skipped' | 'failed'; error?: string }[] = [];

  // 3. Process each due notification
  for (const item of dueItems) {
    try {
      // Check user preferences
      const { data: pref } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', item.user_id)
        .maybeSingle();

      const inAppAllowed = pref ? pref.in_app_enabled : true;
      const pushAllowed = pref ? pref.push_enabled : true;

      // Check category toggle
      let categoryAllowed = true;
      if (pref) {
        if (item.category === 'task' && !pref.task_reminders) categoryAllowed = false;
        if (item.category === 'countdown' && !pref.countdown_reminders) categoryAllowed = false;
        if (item.category === 'finance' && !pref.finance_alerts) categoryAllowed = false;
        if (item.category === 'salary' && !pref.salary_reminders) categoryAllowed = false;
        if (item.category === 'habit' && !pref.habit_reminders) categoryAllowed = false;
        if (item.category === 'ai' && !pref.ai_notifications) categoryAllowed = false;
      }

      if (!categoryAllowed) {
        await supabase
          .from('scheduled_notifications')
          .update({
            status: 'cancelled',
            last_error: 'User preference disabled for category',
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);
        results.push({ id: item.id, status: 'skipped', error: 'category_disabled' });
        continue;
      }

      // A. Deliver In-App Notification (Idempotent by event_id)
      if (inAppAllowed) {
        const { data: existingNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', item.user_id)
          .eq('event_id', item.idempotency_key)
          .maybeSingle();

        if (!existingNotif) {
          await supabase.from('notifications').insert({
            user_id: item.user_id,
            title: item.title,
            message: item.message,
            type: item.category === 'ai' ? 'ai' : 'reminder',
            action_url: item.action_url || '/',
            event_id: item.idempotency_key,
            is_read: false,
            created_at: new Date().toISOString(),
          });
        }
      }

      // B. Deliver Web Push Notification to active devices
      let pushSent = false;
      if (pushAllowed && vapidReady) {
        const { data: subscriptions } = await supabase
          .from('push_subscriptions')
          .select('*')
          .eq('user_id', item.user_id);

        if (subscriptions && subscriptions.length > 0) {
          const payload = JSON.stringify({
            title: item.title,
            body: item.message,
            url: item.action_url || '/',
            tag: `evolve-${item.category}-${item.idempotency_key}`,
            timestamp: Date.now(),
          });

          const staleIds: string[] = [];
          for (const sub of subscriptions) {
            try {
              await webpush.sendNotification(sub.subscription as webpush.PushSubscription, payload, {
                urgency: 'high',
                TTL: 86400,
              });
              pushSent = true;
            } catch (pErr: unknown) {
              const code = pErr instanceof webpush.WebPushError ? pErr.statusCode : undefined;
              if (code === 410 || code === 404) {
                staleIds.push(sub.id);
              }
            }
          }

          if (staleIds.length > 0) {
            await supabase.from('push_subscriptions').delete().in('id', staleIds);
          }
        }
      }

      // Mark scheduled notification as sent
      await supabase
        .from('scheduled_notifications')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      results.push({ id: item.id, status: 'sent' });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/notifications] Failed processing item ${item.id}:`, errorMsg);

      const nextRetry = (item.retry_count || 0) + 1;
      const nextStatus = nextRetry >= 3 ? 'failed' : 'pending';

      await supabase
        .from('scheduled_notifications')
        .update({
          status: nextStatus,
          retry_count: nextRetry,
          last_error: errorMsg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      results.push({ id: item.id, status: 'failed', error: errorMsg });
    }
  }

  const latencyMs = Date.now() - startTime;
  const sentCount = results.filter((r) => r.status === 'sent').length;

  return NextResponse.json({
    message: `Processed ${results.length} due notification(s). ${sentCount} successfully sent.`,
    sentCount,
    total: results.length,
    latencyMs,
    results,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  return processDueNotifications(req);
}

export async function POST(req: NextRequest) {
  return processDueNotifications(req);
}
