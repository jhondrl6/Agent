// src/app/api/agent/summarize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GeminiClient } from '@/lib/search/GeminiClient';
import { SummarizeRequest, SummarizeResponse } from '@/lib/types/summarize';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { textToSummarize, targetLength } = body as SummarizeRequest;

    if (!textToSummarize || typeof textToSummarize !== 'string' || textToSummarize.trim() === '') {
      return NextResponse.json({ error: 'textToSummarize is required and must be a non-empty string' }, { status: 400 });
    }

    if (targetLength && !['short', 'medium', 'long'].includes(targetLength)) {
      return NextResponse.json({ error: "targetLength must be one of 'short', 'medium', or 'long'" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[Summarize API Route] Gemini API key is not configured.');
      return NextResponse.json({ error: 'Server configuration error: Gemini API key is missing.' }, { status: 500 });
    }

    const client = new GeminiClient(apiKey);
    const params: SummarizeRequest = { textToSummarize, targetLength };

    console.log('[Summarize API Route] Calling GeminiClient.summarize with params:', params);
    // Corrected typo from const_response to response
    const response: SummarizeResponse = await client.summarize(params);

    return NextResponse.json(response);

  } catch (error) {
    console.error('[Summarize API Route] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during summarization.';
    // Avoid sending detailed internal error messages to the client in production for security.
    // Log the details and send a more generic message.
    return NextResponse.json({ error: 'Failed to generate summary', details: errorMessage }, { status: 500 });
  }
}
