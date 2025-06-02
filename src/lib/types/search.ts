// In src/lib/types/search.ts

export interface TavilySearchParams { // Renamed from TavilySearchRequest
  query: string;
  search_depth?: "basic" | "advanced";
  include_answer?: boolean; // Keep if useful
  include_raw_content?: boolean; // Keep if useful
  max_results?: number;
  include_domains?: string[]; // Added from prompt example
  exclude_domains?: string[]; // Added from prompt example
  // other relevant Tavily params
}

export interface TavilySearchResultItem { // Renamed from TavilySearchResult
  title: string;
  url: string;
  content: string; // This is often the main snippet or summary
  score: number; // Tavily provides this
  raw_content?: string; // If requested and useful
  // other fields provided by Tavily
}

export interface TavilySearchResponse {
  query?: string; // The original query
  answer?: string; // If include_answer was true
  response_time?: number;
  results: TavilySearchResultItem[];
  // other summary fields
}

// Serper Types
export interface SerperSearchParams {
  q: string; // Query
  num?: number; // Number of results (e.g., 10, 20, 30)
  page?: number; // Page number for pagination
  location?: string; // Location for search, e.g., "Austin, Texas, United States"
  gl?: string; // Geolocation (country code, e.g., "US")
  hl?: string; // Host language (e.g., "en" for English)
  autocorrect?: boolean;
  type?: 'search' | 'images' | 'news' | 'videos'; // Type of search
  // other relevant Serper params
}

export interface SerperSearchResultItem {
  title: string;
  link: string;
  snippet: string;
  position?: number;
  source?: string; // e.g., "www.example.com"
  imageUrl?: string; // For image results
  // other fields like attributes, sitelinks, etc.
}

export interface SerperSearchResponse {
  searchParameters?: { // Serper often includes the parameters used
    q: string;
    type: string;
    // ... and others
  };
  organic: SerperSearchResultItem[]; // Main search results
  relatedSearches?: Array<{ query: string }>;
  knowledgeGraph?: { title: string; type: string; description: string; imageUrl?: string; [key: string]: any };
  // other potential fields like answerBox, videos, images, news etc.
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
  tavilyParams?: Omit<TavilySearchParams, 'query'>; 
  serperParams?: Omit<SerperSearchParams, 'q'>; // Updated reference
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
