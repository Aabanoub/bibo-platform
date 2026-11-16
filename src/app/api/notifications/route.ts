import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Supabase admin client (service role – server-side only)
// ---------------------------------------------------------------------------
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase environment variables.');
  }
  return createClient(url, serviceKey);
}

// ---------------------------------------------------------------------------
// Configure web-push VAPID credentials once at module level
// ---------------------------------------------------------------------------
function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:abanoub@example.com';

  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID keys in environment variables.');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

// ---------------------------------------------------------------------------
// POST /api/notifications — Register push subscription
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    let body: {
      userId?: string;
      subscription?: PushSubscriptionJSON;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { userId, subscription } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: '`userId` is required.' },
        { status: 400 },
      );
    }

    if (
      !subscription ||
      typeof subscription !== 'object' ||
      !subscription.endpoint
    ) {
      return NextResponse.json(
        { error: 'A valid `subscription` object with an `endpoint` is required.' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    // Upsert so re-subscribing the same endpoint just updates the record
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          subscription: subscription,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' },
      );

    if (error) {
      console.error('[POST /api/notifications] Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to save subscription.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[POST /api/notifications] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PUT /api/notifications — Send push notification to a user
// ---------------------------------------------------------------------------
export async function PUT(req: NextRequest) {
  try {
    configureWebPush();

    let body: {
      userId?: string;
      title?: string;
      message?: string;
      actionUrl?: string;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { userId, title, message, actionUrl } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: '`userId` is required.' }, { status: 400 });
    }

    if (!title || !message) {
      return NextResponse.json(
        { error: '`title` and `message` are required.' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    // Fetch all active subscriptions for the user
    const { data: subscriptions, error: fetchError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (fetchError) {
      console.error('[PUT /api/notifications] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch subscriptions.' },
        { status: 500 },
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json(
        { error: 'No push subscriptions found for this user.' },
        { status: 404 },
      );
    }

    const payload = JSON.stringify({
      title,
      body: message,
      url: actionUrl ?? '/',
      timestamp: Date.now(),
    });

    // Send to every registered device; collect failures
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSub = sub.subscription as webpush.PushSubscription;
        try {
          await webpush.sendNotification(pushSub, payload);
          return { endpoint: pushSub.endpoint, success: true };
        } catch (err: unknown) {
          const statusCode =
            err instanceof webpush.WebPushError ? err.statusCode : undefined;

          // 410 Gone or 404 means the subscription is stale — clean it up
          if (statusCode === 410 || statusCode === 404) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', pushSub.endpoint);
          }

          throw err;
        }
      }),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    return NextResponse.json({ sent, failed, total: subscriptions.length });
  } catch (err: unknown) {
    console.error('[PUT /api/notifications] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
