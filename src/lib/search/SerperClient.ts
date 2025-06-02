// src/lib/search/SerperClient.ts
import { SerperSearchParams, SerperSearchResponse, SerperSearchResultItem } from '@/lib/types/search';

const SERPER_API_URL = 'https://google.serper.dev/search';

export class SerperClient {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Serper API key is required.');
    }
    this.apiKey = apiKey;
    console.log('[SerperClient] Initialized.');
  }

  async search(params: SerperSearchParams): Promise<SerperSearchResponse> {
    console.log('[SerperClient] Performing search with query:', params.q);
    try {
      const requestOptions: RequestInit = {
        method: 'POST', // Serper API uses POST for /search endpoint
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params), // Send all params in the body
      };

      const response = await fetch(SERPER_API_URL, requestOptions);

      if (!response.ok) {
        let errorBody;
        try {
          errorBody = await response.json();
        } catch (e) {
          // If response is not JSON, use text
          errorBody = await response.text();
        }
        console.error('[SerperClient] API Error Response:', { status: response.status, body: errorBody });
        throw new Error(`Serper API request failed with status ${response.status}: ${errorBody?.message || response.statusText}`);
      }

      const data: any = await response.json();

      // Adapt the Serper API response to our defined types
      // This is a basic adaptation, Serper can return many more fields
      const adaptedResponse: SerperSearchResponse = {
        searchParameters: data.searchParameters,
        organic: (data.organic || []).map((item: any): SerperSearchResultItem => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          position: item.position,
          source: item.source,
          imageUrl: item.imageUrl,
          // Map other fields if needed
        })),
        relatedSearches: data.relatedSearches,
        knowledgeGraph: data.knowledgeGraph,
        // Map other top-level fields like videos, images, etc. if present and needed
      };
      
      return adaptedResponse;

    } catch (error) {
      console.error('[SerperClient] Error during Serper search:', error);
      if (error instanceof Error && error.message.startsWith('Serper API request failed')) {
        throw error; // Re-throw already specific error
      } else if (error instanceof Error) {
        throw new Error(`Serper Client error: ${error.message}`);
      }
      throw new Error('An unknown error occurred while searching with Serper.');
    }
  }
}

// Example Usage (for testing purposes)
/*
async function testSerperSearch() {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.error("SERPER_API_KEY is not set in environment variables.");
    return;
  }
  const client = new SerperClient(apiKey);
  try {
    const response = await client.search({ 
      q: 'Latest news on renewable energy',
      num: 5,
      location: 'London, United Kingdom',
      type: 'news'
    });
    
    console.log('[SerperClient Test] Search Response:', JSON.stringify(response, null, 2));
    if (response.organic.length > 0) {
        response.organic.forEach(result => {
            console.log(`[SerperClient Test] - ${result.title} (${result.link})`);
        });
    }
    if (response.relatedSearches) {
        console.log('[SerperClient Test] Related Searches:', response.relatedSearches.map(rs => rs.query));
    }

  } catch (e) {
    console.error('[SerperClient Test] Error during test:', e);
  }
}

// To run test:
// 1. Ensure SERPER_API_KEY is in .env.local
// 2. Uncomment:
// testSerperSearch();
*/
