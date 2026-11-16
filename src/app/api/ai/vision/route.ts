import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    if (!geminiKey) {
      return NextResponse.json(
        { error: 'Gemini API key is not configured for vision analysis.' },
        { status: 500 }
      );
    }

    let base64Data = '';
    let mimeType = 'image/jpeg';
    let mode: 'receipt' | 'document' = 'receipt';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('image') as Blob | null;
      mode = (formData.get('mode') as 'receipt' | 'document') || 'receipt';

      if (!file) {
        return NextResponse.json({ error: 'No image file uploaded.' }, { status: 400 });
      }

      mimeType = file.type || 'image/jpeg';
      const buffer = Buffer.from(await file.arrayBuffer());
      base64Data = buffer.toString('base64');
    } else {
      const body = await req.json();
      base64Data = body.image;
      mimeType = body.mimeType || 'image/jpeg';
      mode = body.mode || 'receipt';
    }

    if (!base64Data) {
      return NextResponse.json({ error: 'Missing image data.' }, { status: 400 });
    }

    // Clean base64 prefix if provided (e.g. data:image/png;base64,...)
    if (base64Data.includes('base64,')) {
      const parts = base64Data.split('base64,');
      base64Data = parts[1];
    }

    const genAI = new GoogleGenerativeAI(geminiKey);

    const candidateModels = Array.from(
      new Set(
        [
          process.env.GEMINI_MODEL,
          'gemini-flash-lite-latest',
          'gemini-3.1-flash-lite',
          'gemini-3.5-flash-lite',
          'gemini-3.8-flash',
          'gemini-flash-latest',
        ].filter(Boolean) as string[]
      )
    );

    let systemPrompt = '';
    if (mode === 'receipt') {
      systemPrompt = `
You are an expert financial receipt scanner. Analyze this receipt or bill image and extract the key financial data.
Return ONLY a valid JSON object matching this schema without any markdown backticks or commentary:
{
  "vendor": "Merchant or store name",
  "amount": 25.50,
  "currency": "$",
  "date": "YYYY-MM-DD",
  "category": "Food" | "Groceries" | "Transport" | "Utilities" | "Shopping" | "Health" | "Entertainment" | "Other",
  "description": "Short description of items purchased",
  "tax": null or number
}
If any field cannot be found, make a reasonable estimate or leave it null (or today's date for date).
`;
    } else {
      systemPrompt = `
You are an intelligent document reader. Analyze this document, page, or whiteboard note and extract structured notes.
Return ONLY a valid JSON object matching this schema without any markdown backticks or commentary:
{
  "title": "Concise descriptive title of document",
  "summary": "Executive summary of the document",
  "action_items": ["Action item 1", "Action item 2"],
  "tags": ["tag1", "tag2"],
  "markdown_content": "Full formatted markdown notes capturing all critical information from the document"
}
`;
    }

    let parsedResult = null;
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: 'application/json' },
        });

        const imagePart = {
          inlineData: {
            data: base64Data,
            mimeType,
          },
        };

        const result = await model.generateContent([systemPrompt, imagePart]);
        const responseText = result.response.text().trim();

        try {
          parsedResult = JSON.parse(responseText);
          if (parsedResult) break;
        } catch {
          // If wrapped in markdown code blocks
          const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
          parsedResult = JSON.parse(cleaned);
          if (parsedResult) break;
        }
      } catch (err) {
        lastError = err;
        console.warn(`[Gemini Vision] Model ${modelName} failed:`, err);
      }
    }

    if (!parsedResult) {
      throw lastError || new Error('Failed to analyze image with Gemini Vision');
    }

    return NextResponse.json({
      mode,
      data: parsedResult,
    });
  } catch (err: unknown) {
    console.error('[/api/ai/vision] Fatal Error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
