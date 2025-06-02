// In src/lib/types/search.ts

export interface TavilySearchRequest {
  query: string;
  search_depth?: 'basic' | 'advanced';
  include_answer?: boolean;
  include_raw_content?: boolean;
  max_results?: number;
  // Add other Tavily-specific parameters if needed
}

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  raw_content?: string;
  // Add other fields from Tavily response if needed
}

export interface TavilySearchResponse {
  answer?: string;
  query?: string;
  response_time?: number;
  results: TavilySearchResult[];
}


export interface SerperSearchRequest {
  q: string;
  num?: number; // Number of results
  page?: number;
  // Add other Serper-specific parameters
}

export interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  position?: number;
  // Add other fields from Serper response
}

export interface SerperSearchResponse {
  organic: SerperSearchResult[];
  // Add other fields like relatedSearches, etc.
}


// Gemini Types
export interface GeminiRequestParams {
  prompt: string;
  // Add other relevant parameters for Gemini API
  maxOutputTokens?: number;
  temperature?: number;
}

export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    // Add other relevant fields from Gemini response
  }>;
  // Add other relevant fields
}

// General Search Strategy Types
export type SearchProvider = 'tavily' | 'serper' | 'gemini'; // Add 'gemini'

export interface SearchParams {
  query: string;
  provider: SearchProvider;
  // Add other common parameters, or use a union type for provider-specific params
  tavilyParams?: Omit<TavilySearchRequest, 'query'>;
  serperParams?: Omit<SerperSearchRequest, 'q'>;
  geminiParams?: Omit<GeminiRequestParams, 'prompt'>;
}

export interface SearchResult {
  title?: string; // Optional as Gemini response might not have a 'title'
  url?: string;   // Optional as Gemini response might not have a 'url'
  snippet?: string; // For text snippets or Gemini text part
  content?: string; // For longer content or Gemini text part
  provider: SearchProvider;
  // Raw response from the provider for more detailed use if needed
  raw?: any;
}
