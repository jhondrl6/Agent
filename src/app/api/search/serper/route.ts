// src/app/api/search/serper/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SerperClient } from '@/lib/search/SerperClient';
import { SerperSearchParams } from '@/lib/types/search';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Destructure all expected SerperSearchParams for clarity and type safety
    const { q, num, page, location, gl, hl, autocorrect, type } = body as SerperSearchParams;

    if (!q) {
      return NextResponse.json({ error: 'Query (q) is required' }, { status: 400 });
    }

    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Serper API key is not configured. Please set SERPER_API_KEY in environment variables.' }, { status: 500 });
    }

    const client = new SerperClient(apiKey);

    // Construct searchParams object, passing only defined values
    const searchParams: SerperSearchParams = { q };
    if (num !== undefined) searchParams.num = num;
    if (page !== undefined) searchParams.page = page;
    if (location !== undefined) searchParams.location = location;
    if (gl !== undefined) searchParams.gl = gl;
    if (hl !== undefined) searchParams.hl = hl;
    if (autocorrect !== undefined) searchParams.autocorrect = autocorrect;
    if (type !== undefined) searchParams.type = type;

    const results = await client.search(searchParams);
    return NextResponse.json(results);

  } catch (error) {
    console.error('[Serper API Route] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to fetch from Serper API', details: errorMessage }, { status: 500 });
  }
}
