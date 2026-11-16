import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  end?: string;
  endTime?: string;
  description?: string;
  location?: string;
  source: 'external';
}

function parseICSDate(rawStr: string): { date: string; time?: string } {
  // Can be 20261118T140000Z or 20261118 or TZID=...:20261118T140000
  const clean = rawStr.replace(/^.*:/, '').trim();

  if (clean.length >= 8) {
    const year = clean.substring(0, 4);
    const month = clean.substring(4, 6);
    const day = clean.substring(6, 8);
    const date = `${year}-${month}-${day}`;

    if (clean.includes('T') && clean.length >= 13) {
      const timePart = clean.split('T')[1];
      const hours = timePart.substring(0, 2);
      const minutes = timePart.substring(2, 4);
      return { date, time: `${hours}:${minutes}` };
    }

    return { date };
  }

  return { date: new Date().toISOString().split('T')[0] };
}

function parseICSText(icsText: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const lines = icsText.split(/\r\n|\n|\r/);

  let currentEvent: Partial<CalendarEvent> | null = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Handle multiline unfold (lines starting with space or tab)
    while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
      line += lines[i + 1].substring(1);
      i++;
    }

    if (line.startsWith('BEGIN:VEVENT')) {
      currentEvent = { source: 'external' };
      continue;
    }

    if (line.startsWith('END:VEVENT')) {
      if (currentEvent && currentEvent.title && currentEvent.start) {
        events.push({
          id: currentEvent.id || crypto.randomUUID(),
          title: currentEvent.title,
          start: currentEvent.start,
          startTime: currentEvent.startTime,
          end: currentEvent.end,
          endTime: currentEvent.endTime,
          description: currentEvent.description,
          location: currentEvent.location,
          source: 'external',
        });
      }
      currentEvent = null;
      continue;
    }

    if (!currentEvent) continue;

    if (line.startsWith('UID:')) {
      currentEvent.id = line.substring(4).trim();
    } else if (line.startsWith('SUMMARY:')) {
      currentEvent.title = line.substring(8).trim().replace(/\\,/g, ',').replace(/\\;/g, ';');
    } else if (line.startsWith('DESCRIPTION:')) {
      currentEvent.description = line.substring(12).trim().replace(/\\n/g, '\n').replace(/\\,/g, ',');
    } else if (line.startsWith('LOCATION:')) {
      currentEvent.location = line.substring(9).trim().replace(/\\,/g, ',');
    } else if (line.startsWith('DTSTART')) {
      const parsed = parseICSDate(line);
      currentEvent.start = parsed.date;
      currentEvent.startTime = parsed.time;
    } else if (line.startsWith('DTEND')) {
      const parsed = parseICSDate(line);
      currentEvent.end = parsed.date;
      currentEvent.endTime = parsed.time;
    }
  }

  return events;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const feedUrl = searchParams.get('url');

    if (!feedUrl) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    // Convert webcal:// to https://
    const normalizedUrl = feedUrl.replace(/^webcal:\/\//i, 'https://');

    const res = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'BiboPlatform-CalendarSync/1.0',
        Accept: 'text/calendar, text/plain, */*',
      },
      next: { revalidate: 300 }, // Cache 5 min
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not fetch calendar feed: ${res.statusText}` },
        { status: res.status }
      );
    }

    const icsText = await res.text();
    const events = parseICSText(icsText);

    return NextResponse.json({ events });
  } catch (err: unknown) {
    console.error('[/api/calendar/ics] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { icsContent } = await req.json();

    if (!icsContent || typeof icsContent !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid icsContent' }, { status: 400 });
    }

    const events = parseICSText(icsContent);
    return NextResponse.json({ events });
  } catch (err: unknown) {
    console.error('[/api/calendar/ics POST] Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
