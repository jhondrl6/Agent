// src/app/api/search/tavily/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { TavilyClient } from '@/lib/search/TavilyClient';
import { TavilySearchParams } from '@/lib/types/search';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // It's good to validate the body structure more thoroughly in a real app
    const { query, search_depth, include_answer, include_raw_content, max_results, include_domains, exclude_domains } = body as TavilySearchParams;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Tavily API key is not configured. Please set TAVILY_API_KEY in environment variables.' }, { status: 500 });
    }

    const client = new TavilyClient(apiKey);

    // Construct the search parameters, only including defined values to avoid overriding SDK defaults with undefined
    const searchParams: TavilySearchParams = { query };
    if (search_depth !== undefined) searchParams.search_depth = search_depth;
    if (include_answer !== undefined) searchParams.include_answer = include_answer;
    if (include_raw_content !== undefined) searchParams.include_raw_content = include_raw_content;
    if (max_results !== undefined) searchParams.max_results = max_results;
    if (include_domains !== undefined) searchParams.include_domains = include_domains;
    if (exclude_domains !== undefined) searchParams.exclude_domains = exclude_domains;

    const results = await client.search(searchParams);
    return NextResponse.json(results);

  } catch (error) {
    console.error('[Tavily API Route] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to fetch from Tavily API', details: errorMessage }, { status: 500 });
  }
}
