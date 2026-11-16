import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const groqKey = process.env.GROQ_API_KEY;

    if (!groqKey) {
      return NextResponse.json(
        { error: 'Groq API key is not configured for voice transcription.' },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as Blob | null;

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided.' }, { status: 400 });
    }

    // Prepare FormData for Groq Whisper
    const groqFormData = new FormData();
    // Groq requires a filename with an extension like .webm, .wav, or .mp4
    const filename = (file as any).name || 'recording.webm';
    groqFormData.append('file', file, filename);
    groqFormData.append('model', 'whisper-large-v3-turbo');
    groqFormData.append('response_format', 'json');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
      },
      body: groqFormData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[Whisper API Error]:', res.status, errorText);
      return NextResponse.json(
        { error: `Transcription failed: ${errorText || res.statusText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const text = data?.text?.trim() || '';

    return NextResponse.json({ text });
  } catch (err: unknown) {
    console.error('[/api/ai/transcribe] Fatal Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
