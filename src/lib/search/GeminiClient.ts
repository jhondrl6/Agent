import { GoogleGenerativeAI, GenerativeModel, GenerationConfig, HarmCategory, HarmBlockThreshold, Content } from "@google/generative-ai";
import { LRUCache } from 'lru-cache';
import { GeminiRequestParams, GeminiResponse } from '@/lib/types/search';

// Default model to use if not specified in params
const DEFAULT_MODEL_NAME = "gemini-pro";

// Default Cache Configuration
const DEFAULT_CACHE_TTL_MS = process.env.GEMINI_CACHE_TTL_MS ? parseInt(process.env.GEMINI_CACHE_TTL_MS, 10) : 1000 * 60 * 60; // 1 hour
const DEFAULT_CACHE_MAX_SIZE = process.env.GEMINI_CACHE_MAX_SIZE ? parseInt(process.env.GEMINI_CACHE_MAX_SIZE, 10) : 100;

export interface GeminiCacheOptions {
  ttl?: number; // Time in milliseconds
  maxSize?: number;
}
export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private cache: LRUCache<string, GeminiResponse>;
  private cacheEnabled: boolean;

  constructor(apiKey: string, cacheOptions?: GeminiCacheOptions) {
    if (!apiKey) {
      throw new Error('Gemini API key is required.');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    console.log('[GeminiClient] Initialized with GoogleGenerativeAI SDK.');

    const ttl = cacheOptions?.ttl ?? DEFAULT_CACHE_TTL_MS;
    const maxSize = cacheOptions?.maxSize ?? DEFAULT_CACHE_MAX_SIZE;
    this.cacheEnabled = maxSize > 0 && ttl > 0;

    if (this.cacheEnabled) {
      this.cache = new LRUCache<string, GeminiResponse>({
        max: maxSize,
        ttl: ttl,
      });
      console.log(`[GeminiClient] Response cache enabled with maxSize=${maxSize}, ttl=${ttl}ms.`);
    } else {
      console.log('[GeminiClient] Response cache is disabled.');
      // Provide a dummy cache that does nothing if caching is disabled
      this.cache = {
        get: () => undefined,
        set: () => false,
        delete: () => false,
        clear: () => {},
        has: () => false,
        dump: () => [],
        load: () => {},
        size: 0,
        maxSize: 0,
        ttl: 0,
        reset: () => {},
        keys: () => new Set<string>().values(),
        values: () => new Set<GeminiResponse>().values(),
        rkeys: () => new Set<string>().values(),
        rvalues: () => new Set<GeminiResponse>().values(),
        // Add any other methods from LRUCache if needed for type compatibility
      } as any as LRUCache<string, GeminiResponse>; // Type assertion for disabled cache
    }
  }

  private generateCacheKey(params: GeminiRequestParams): string {
    const keyParts: Record<string, any> = {
      prompt: params.prompt,
      model: params.model || DEFAULT_MODEL_NAME,
      temperature: params.temperature,
      maxOutputTokens: params.maxOutputTokens,
      // Only include topK and topP if they are explicitly provided,
      // as their default values might not be consistent or known here.
    };
    if (params.topK !== undefined) keyParts.topK = params.topK;
    if (params.topP !== undefined) keyParts.topP = params.topP;

    // Sort keys for a stable JSON string
    const sortedKeys = Object.keys(keyParts).sort();
    const sortedKeyParts: Record<string, any> = {};
    for (const key of sortedKeys) {
      sortedKeyParts[key] = keyParts[key];
    }
    return JSON.stringify(sortedKeyParts);
  }

  async generate(params: GeminiRequestParams): Promise<GeminiResponse> {
    if (!this.cacheEnabled) {
      console.log('[GeminiClient] Cache disabled, proceeding with API call for prompt:', params.prompt);
      return this.directGenerate(params);
    }

    const cacheKey = this.generateCacheKey(params);
    const cachedResponse = this.cache.get(cacheKey);

    if (cachedResponse) {
      console.log('[GeminiClient] Cache hit for key:', cacheKey);
      // Return a deep copy to prevent modification of cached object by callers
      return JSON.parse(JSON.stringify(cachedResponse));
    }

    console.log('[GeminiClient] Cache miss for key:', cacheKey, '. Generating content for prompt:', params.prompt);
    const response = await this.directGenerate(params);

    if (response) { // Only cache successful responses
        this.cache.set(cacheKey, JSON.parse(JSON.stringify(response))); // Store a deep copy
        console.log('[GeminiClient] Response cached for key:', cacheKey);
    }
    return response;
  }

  private async directGenerate(params: GeminiRequestParams): Promise<GeminiResponse> {
    try {
      const modelName = params.model || DEFAULT_MODEL_NAME;
      const model: GenerativeModel = this.genAI.getGenerativeModel({ model: modelName });

      const generationConfig: GenerationConfig = {
        temperature: params.temperature || 0.9, // Default from example, adjust as needed
        // topK: params.topK || 1, // SDK might have different defaults or structure
        // topP: params.topP || 1,
        maxOutputTokens: params.maxOutputTokens || 2048, // Default from example
      };

      // Basic safety settings, consider making these configurable
      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ];

      // Construct the content for the API
      const contents: Content[] = [{ role: "user", parts: [{ text: params.prompt }] }];

      const result = await model.generateContent({
        contents: contents,
        generationConfig: generationConfig,
        safetySettings: safetySettings,
      });

      const sdkResponse = result.response;

      if (!sdkResponse) {
        console.error('[GeminiClient] SDK response is undefined. Full result:', result);
        // Check for blocked prompt or other issues
        if (result.response === undefined && result.promptFeedback?.blockReason) {
            throw new Error(`Prompt was blocked: ${result.promptFeedback.blockReason}. ${result.promptFeedback.blockReasonMessage || ''}`);
        }
        throw new Error('No response received from Gemini API or prompt was blocked.');
      }

      // Adapt the SDK response to our GeminiResponse type
      // This is a simplified adaptation. The actual SDK response might be more complex.
      const adaptedResponse: GeminiResponse = {
        candidates: sdkResponse.candidates?.map(candidate => ({
          content: {
            parts: candidate.content.parts.map(part => ({ text: part.text || '' })),
            role: candidate.content.role,
          },
          // You might need to map other fields like finishReason, safetyRatings, etc.
          // finishReason: candidate.finishReason,
          // safetyRatings: candidate.safetyRatings,
        })) || [],
        // The SDK's main response text can be found using response.text()
        // We'll put it in the first candidate's part for simplicity if candidates array is empty but text() exists
        // This part needs careful handling based on how you want to structure GeminiResponse
      };

      // If candidates array is empty but response.text() provides content, populate it.
      if (adaptedResponse.candidates.length === 0 && sdkResponse.text) {
        try {
            const text = sdkResponse.text();
            if (text) {
                adaptedResponse.candidates.push({
                    content: {
                        parts: [{ text: text }],
                        role: 'model'
                    }
                });
            }
        } catch (e) {
            console.warn("[GeminiClient] Could not call response.text() or response was empty", e)
        }
      }


      return adaptedResponse;

    } catch (error) {
      console.error('[GeminiClient] Error generating content with SDK:', error);
      if (error instanceof Error) {
        // Re-throw with more context or handle specific SDK errors
         throw new Error(`Gemini SDK error: ${error.message}`);
      }
      throw new Error('An unknown error occurred while fetching from Gemini API using SDK.');
    }
  }
}

// Example Usage (for testing purposes, can be removed or kept for local dev testing)
/*
async function testGeminiSdk() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set in environment variables.");
    return;
  }
  const client = new GeminiClient(apiKey);
  try {
    const response = await client.generate({
      prompt: 'Tell me a fun fact about the Roman Empire.',
      maxOutputTokens: 150
    });

    if (response.candidates && response.candidates.length > 0 && response.candidates[0].content.parts.length > 0) {
      console.log('[GeminiClient Test SDK] Response text:', response.candidates[0].content.parts[0].text);
    } else {
      console.log('[GeminiClient Test SDK] No content in response or response structure is unexpected:', response);
    }
  } catch (e) {
    console.error('[GeminiClient Test SDK] Error during test:', e);
  }
}

// To run the test:
// 1. Make sure GEMINI_API_KEY is in your .env.local
// 2. Uncomment the next line
// testGeminiSdk();
*/
