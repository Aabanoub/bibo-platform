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
const DEFAULT_VAPID_PUBLIC_KEY =
  'BIxGd6n4Vp17qTxzxLJCE4VxdJgbX3FEt28UtDXyT3I7czJLDzJVFFdfiNyDDqLj1OVMgm74ii-cT-exXN-MnRk';
const DEFAULT_VAPID_PRIVATE_KEY = 'm7dG_YFOY7qyTwsIaevYkvQaSt4PXmE0nMFFBG17q68';
const DEFAULT_VAPID_SUBJECT = 'mailto:admin@abanoub.app';

function configureWebPush() {
  const publicKey =
    process.env.VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    DEFAULT_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;

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

    // Check if this user already has this subscription stored by matching endpoint in JSONB
    const { data: existingRows } = await supabase
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', userId);

    const existingMatch = existingRows?.find((row: any) => {
      const subObj =
        typeof row.subscription === 'string'
          ? JSON.parse(row.subscription)
          : row.subscription;
      return subObj?.endpoint === subscription.endpoint;
    });

    let saveError = null;

    if (existingMatch) {
      // Update existing record
      const { error } = await supabase
        .from('push_subscriptions')
        .update({ subscription })
        .eq('id', existingMatch.id);
      saveError = error;
    } else {
      // Insert new subscription record
      const { error } = await supabase
        .from('push_subscriptions')
        .insert({
          user_id: userId,
          subscription,
        });
      saveError = error;
    }

    if (saveError) {
      console.error('[POST /api/notifications] Supabase error:', saveError);
      return NextResponse.json(
        { error: `Failed to save subscription: ${saveError.message}` },
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
              .eq('id', sub.id);
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
