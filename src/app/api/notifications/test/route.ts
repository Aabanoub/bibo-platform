import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { initWebPush, checkVapidStatus } from '@/lib/vapid';

export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase admin environment variables.');
  }
  return createClient(url, serviceKey);
}

// ---------------------------------------------------------------------------
// POST /api/notifications/test — Comprehensive push diagnostics test trigger
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const vapidCheck = checkVapidStatus();
    if (!vapidCheck.isConfigured) {
      return NextResponse.json(
        {
          success: false,
          error: `Server VAPID misconfigured: ${vapidCheck.error}`,
          diagnostics: vapidCheck,
        },
        { status: 500 }
      );
    }

    initWebPush();

    let body: {
      userId?: string;
      title?: string;
      message?: string;
      targetEndpoint?: string;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { userId, title, message, targetEndpoint } = body;

    if (!userId) {
      return NextResponse.json({ error: '`userId` is required.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (subError) {
      return NextResponse.json(
        { success: false, error: `Database error querying subscriptions: ${subError.message}` },
        { status: 500 }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No active push subscriptions found in database for your user account. Please tap "Enable Now" to register this device first.',
          subscriptionCount: 0,
        },
        { status: 404 }
      );
    }

    // Filter to specific endpoint if provided, or broadcast to all user devices
    let targetSubs = subscriptions;
    if (targetEndpoint) {
      const match = subscriptions.filter((s: any) => {
        const sub = typeof s.subscription === 'string' ? JSON.parse(s.subscription) : s.subscription;
        return sub?.endpoint === targetEndpoint;
      });
      if (match.length > 0) targetSubs = match;
    }

    const payload = JSON.stringify({
      title: title || '🧪 Evolve Push Test',
      body: message || 'Real-time Web Push delivered successfully via VAPID server!',
      url: '/settings',
      tag: 'evolve-test-bench',
      timestamp: Date.now(),
    });

    const dispatchResults = await Promise.allSettled(
      targetSubs.map(async (row) => {
        const sub = row.subscription as webpush.PushSubscription;
        await webpush.sendNotification(sub, payload, {
          urgency: 'high',
          TTL: 60, // 1 minute test TTL
        });
        return { endpoint: sub.endpoint };
      })
    );

    const sent = dispatchResults.filter((r) => r.status === 'fulfilled').length;
    const errors = dispatchResults
      .filter((r) => r.status === 'rejected')
      .map((r: any) => r.reason?.message || String(r.reason));

    const latencyMs = Date.now() - startTime;

    if (sent === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Push delivery failed: ${errors.join(', ')}`,
          sent: 0,
          total: targetSubs.length,
          latencyMs,
          diagnostics: {
            vapid: vapidCheck,
            registeredDevices: subscriptions.length,
          },
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      sent,
      failed: errors.length,
      total: targetSubs.length,
      latencyMs,
      message: `Successfully delivered push to ${sent} active device(s)!`,
      diagnostics: {
        vapid: vapidCheck,
        registeredDevices: subscriptions.length,
      },
    });
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    console.error('[POST /api/notifications/test] Error:', err);
    const msg = err instanceof Error ? err.message : 'Internal test error';
    return NextResponse.json({ success: false, error: msg, latencyMs }, { status: 500 });
  }
}
