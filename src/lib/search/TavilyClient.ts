// src/lib/search/TavilyClient.ts
import Tavily from 'tavily'; // The Tavily SDK
import { TavilySearchParams, TavilySearchResponse, TavilySearchResultItem } from '@/lib/types/search';

export class TavilyClient {
  private client: Tavily;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Tavily API key is required.');
    }
    this.client = new Tavily(apiKey);
    console.log('[TavilyClient] Initialized with Tavily SDK.');
  }

  async search(params: TavilySearchParams): Promise<TavilySearchResponse> {
    console.log('[TavilyClient] Performing search with query:', params.query);
    try {
      // Map our TavilySearchParams to the options expected by tavily-js SDK
      // The SDK's search method takes (query: string, options?: SearchOptions)
      // SearchOptions include: searchDepth, maxResults, includeDomains, excludeDomains, includeAnswer, includeRawContent, etc.
      const { query, ...options } = params;

      // Ensure options are correctly named as per SDK if they differ from our param names
      const searchOptions = {
        searchDepth: options.search_depth,
        maxResults: options.max_results,
        includeDomains: options.include_domains,
        excludeDomains: options.exclude_domains,
        includeAnswer: options.include_answer,
        includeRawContent: options.include_raw_content,
        // any other options that the SDK supports and we want to pass
      };

      // Remove undefined properties from searchOptions so they don't override SDK defaults unintentionally
      Object.keys(searchOptions).forEach(key => {
        if ((searchOptions as any)[key] === undefined) {
          delete (searchOptions as any)[key];
        }
      });

      // The Tavily SDK's search method might return a slightly different structure.
      // We need to adapt it to our TavilySearchResponse and TavilySearchResultItem.
      // Based on typical Tavily API responses:
      const sdkResponse = await this.client.search(query, searchOptions);

      // Assuming sdkResponse has fields like: query, answer, response_time, results (array)
      // And each item in results has: title, url, content, score, raw_content

      if (!sdkResponse || !sdkResponse.results) {
        console.warn('[TavilyClient] Received an unexpected or empty response from Tavily SDK:', sdkResponse);
        // Return a valid empty response structure
        return {
            query: query,
            results: [],
            response_time: 0,
        };
      }

      const adaptedResults: TavilySearchResultItem[] = sdkResponse.results.map((item: any) => ({
        title: item.title,
        url: item.url,
        content: item.content, // This is usually the snippet or summary
        score: item.score,
        raw_content: item.raw_content, // if includeRawContent was true
      }));

      return {
        query: sdkResponse.query || query,
        answer: sdkResponse.answer, // if includeAnswer was true
        response_time: sdkResponse.response_time,
        results: adaptedResults,
      };

    } catch (error) {
      console.error('[TavilyClient] Error during Tavily search:', error);
      if (error instanceof Error) {
        throw new Error(`Tavily SDK error: ${error.message}`);
      }
      throw new Error('An unknown error occurred while searching with Tavily.');
    }
  }
}

// Example Usage (for testing purposes, can be removed or kept for local dev testing)
/*
async function testTavilySearch() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.error("TAVILY_API_KEY is not set in environment variables.");
    return;
  }
  const client = new TavilyClient(apiKey);
  try {
    const response = await client.search({
      query: 'What are the latest advancements in AI?',
      search_depth: 'advanced',
      max_results: 3,
      include_answer: true,
    });

    console.log('[TavilyClient Test] Search Response:', JSON.stringify(response, null, 2));
    if (response.answer) {
        console.log('[TavilyClient Test] Answer:', response.answer);
    }
    response.results.forEach(result => {
        console.log(`[TavilyClient Test] - ${result.title} (${result.url}): ${result.score}`);
    });

  } catch (e) {
    console.error('[TavilyClient Test] Error during test:', e);
  }
}

// To run the test:
// 1. Make sure TAVILY_API_KEY is in your .env.local
// 2. Uncomment the next line
// testTavilySearch();
*/
