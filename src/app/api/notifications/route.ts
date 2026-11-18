import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { initWebPush, checkVapidStatus } from '@/lib/vapid';

export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key =
    serviceKey && serviceKey.startsWith('eyJ') && serviceKey !== 'placeholder-service-key'
      ? serviceKey
      : anonKey;

  if (!url || !key) {
    throw new Error('Missing Supabase admin environment variables.');
  }
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// GET /api/notifications — Safe diagnostic check & public key delivery
// ---------------------------------------------------------------------------
export async function GET() {
  const status = checkVapidStatus();
  return NextResponse.json({
    status: status.isConfigured ? 'healthy' : 'misconfigured',
    vapid: {
      isConfigured: status.isConfigured,
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || null,
      subject: status.subject,
      error: status.error || null,
    },
    timestamp: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// POST /api/notifications — Authoritative push subscription registration
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    let body: {
      userId?: string;
      subscription?: {
        endpoint?: string;
        expirationTime?: number | null;
        keys?: {
          p256dh?: string;
          auth?: string;
        };
      };
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
    }

    const { userId, subscription } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: '`userId` is required.' }, { status: 400 });
    }

    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json(
        { error: 'Valid subscription object containing endpoint and keys (p256dh, auth) is required.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Check if endpoint already exists for this user to ensure idempotency
    const { data: existingRows } = await supabase
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', userId);

    const existingMatch = existingRows?.find((row: any) => {
      const subObj = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
      return subObj?.endpoint === subscription.endpoint;
    });

    if (existingMatch) {
      // Update existing subscription record with fresh keys/expiration
      const { error: updateErr } = await supabase
        .from('push_subscriptions')
        .update({
          subscription,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingMatch.id);

      if (updateErr) {
        console.error('[POST /api/notifications] Update error:', updateErr);
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        action: 'updated',
        endpoint: subscription.endpoint,
      });
    }

    // Insert new subscription
    const { error: insertErr } = await supabase
      .from('push_subscriptions')
      .insert({
        user_id: userId,
        subscription,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertErr) {
      console.error('[POST /api/notifications] Insert error:', insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      action: 'created',
      endpoint: subscription.endpoint,
    });
  } catch (err: unknown) {
    console.error('[POST /api/notifications] Fatal error:', err);
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PUT /api/notifications — Dispatch Web Push message to user devices
// ---------------------------------------------------------------------------
export async function PUT(req: NextRequest) {
  try {
    initWebPush();

    let body: {
      userId?: string;
      title?: string;
      message?: string;
      actionUrl?: string;
      tag?: string;
      category?: string;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
    }

    const { userId, title, message, actionUrl, tag, category } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: '`userId` is required.' }, { status: 400 });
    }

    if (!title || !message) {
      return NextResponse.json({ error: '`title` and `message` are required.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Check user preferences before sending push
    const { data: pref } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (pref) {
      if (!pref.push_enabled) {
        return NextResponse.json({
          skipped: true,
          reason: 'push_disabled_in_preferences',
        });
      }

      // Check category-specific preferences if category is passed
      if (category === 'task' && !pref.task_reminders) {
        return NextResponse.json({ skipped: true, reason: 'task_reminders_disabled' });
      }
      if (category === 'countdown' && !pref.countdown_reminders) {
        return NextResponse.json({ skipped: true, reason: 'countdown_reminders_disabled' });
      }
      if (category === 'finance' && !pref.finance_alerts) {
        return NextResponse.json({ skipped: true, reason: 'finance_alerts_disabled' });
      }
      if (category === 'salary' && !pref.salary_reminders) {
        return NextResponse.json({ skipped: true, reason: 'salary_reminders_disabled' });
      }
      if (category === 'habit' && !pref.habit_reminders) {
        return NextResponse.json({ skipped: true, reason: 'habit_reminders_disabled' });
      }
      if (category === 'ai' && !pref.ai_notifications) {
        return NextResponse.json({ skipped: true, reason: 'ai_notifications_disabled' });
      }
    }

    // Fetch all active push subscriptions for the user
    const { data: subscriptions, error: fetchErr } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (fetchErr) {
      console.error('[PUT /api/notifications] Fetch error:', fetchErr);
      return NextResponse.json({ error: 'Failed to query user subscriptions.' }, { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json(
        { error: 'No active push subscriptions found for this user.' },
        { status: 404 }
      );
    }

    const payload = JSON.stringify({
      title,
      body: message,
      url: actionUrl ?? '/',
      tag: tag || 'evolve-general',
      timestamp: Date.now(),
    });

    const staleIds: string[] = [];

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSub = sub.subscription as webpush.PushSubscription;
        try {
          await webpush.sendNotification(pushSub, payload, {
            urgency: 'high',
            TTL: 86400, // 24 hours
          });
          return { endpoint: pushSub.endpoint, success: true };
        } catch (err: unknown) {
          const statusCode = err instanceof webpush.WebPushError ? err.statusCode : undefined;
          // HTTP 410 Gone or 404 Not Found indicates subscription expired / uninstalled
          if (statusCode === 410 || statusCode === 404) {
            staleIds.push(sub.id);
          }
          throw err;
        }
      })
    );

    // Prune stale subscriptions asynchronously
    if (staleIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', staleIds);
    }

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    return NextResponse.json({
      success: sent > 0,
      sent,
      failed,
      pruned: staleIds.length,
      total: subscriptions.length,
    });
  } catch (err: unknown) {
    console.error('[PUT /api/notifications] Fatal error:', err);
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/notifications — Unsubscribe a specific device/endpoint
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  try {
    let body: { userId?: string; endpoint?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
    }

    const { userId, endpoint } = body;
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: '`userId` is required.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (endpoint) {
      const { data: rows } = await supabase
        .from('push_subscriptions')
        .select('id, subscription')
        .eq('user_id', userId);

      const match = rows?.find((r: any) => {
        const sub = typeof r.subscription === 'string' ? JSON.parse(r.subscription) : r.subscription;
        return sub?.endpoint === endpoint;
      });

      if (match) {
        await supabase.from('push_subscriptions').delete().eq('id', match.id);
      }
    } else {
      // Remove all subscriptions for user if no endpoint specified
      await supabase.from('push_subscriptions').delete().eq('user_id', userId);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[DELETE /api/notifications] Error:', err);
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
