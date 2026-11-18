import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Helper: send message back to Telegram
async function sendTelegramMessage(token: string, chatId: number | string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('Failed to send Telegram message:', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return NextResponse.json({
        status: 'warning',
        message: 'TELEGRAM_BOT_TOKEN is not configured.',
      });
    }

    const body = await req.json();
    const message = body?.message;

    if (!message || !message.text) {
      return NextResponse.json({ status: 'ignored' });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();
    const senderName = message.from?.first_name || 'User';

    // Handle commands
    if (text === '/start') {
      const welcome = `👋 Hello ${senderName}!\n\nWelcome to your **EVOLVE Life OS Assistant**.\n\nYou can chat with me or send commands:\n- /balance — Check your current net balance\n- /tasks — View your open tasks\n- Or simply type: *"Spent $15 on lunch"* or *"Add task to call doctor"* and I will automatically update your platform database!`;
      await sendTelegramMessage(token, chatId, welcome);
      return NextResponse.json({ status: 'ok' });
    }

    // Call internal AI engine
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';

    const aiRes = await fetch(`${protocol}://${host}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: text }],
        persona: 'executive-assistant',
        userName: senderName,
      }),
    });

    if (aiRes.ok) {
      const aiData = await aiRes.json();
      let replyText = aiData.reply || 'Action processed.';
      if (aiData.action?.message) {
        replyText += `\n\n✅ *${aiData.action.message}*`;
      }
      await sendTelegramMessage(token, chatId, replyText);
    } else {
      await sendTelegramMessage(
        token,
        chatId,
        '⚠️ Sorry, I could not process your request at the moment. Please check your web dashboard.'
      );
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err: unknown) {
    console.error('[/api/telegram] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'online',
    description: 'Bibo Platform Telegram Webhook endpoint is live.',
  });
}
