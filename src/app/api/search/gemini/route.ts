// In src/app/api/search/gemini/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GeminiClient } from '@/lib/search/GeminiClient';
import { GeminiRequestParams } from '@/lib/types/search';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, ...restParams } = body as GeminiRequestParams;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured. Please set GEMINI_API_KEY environment variable.' }, { status: 500 });
    }

    const client = new GeminiClient(apiKey);
    const params: GeminiRequestParams = { prompt, ...restParams };
    
    const response = await client.generate(params);

    return NextResponse.json(response);

  } catch (error) {
    console.error('[Gemini API Route] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    // It's good practice to avoid sending detailed internal error messages to the client in production.
    // Consider logging the details and sending a more generic message.
    return NextResponse.json({ error: 'Failed to fetch from Gemini API', details: errorMessage }, { status: 500 });
  }
}
