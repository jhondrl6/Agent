import { GoogleGenerativeAI, GenerativeModel, GenerationConfig, HarmCategory, HarmBlockThreshold, Content } from "@google/generative-ai";
import { GeminiRequestParams, GeminiResponse } from '@/lib/types/search';

// Default model to use if not specified in params
const DEFAULT_MODEL_NAME = "gemini-pro"; 

export class GeminiClient {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Gemini API key is required.');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    console.log('[GeminiClient] Initialized with GoogleGenerativeAI SDK.');
  }

  async generate(params: GeminiRequestParams): Promise<GeminiResponse> {
    console.log('[GeminiClient] Generating content for prompt:', params.prompt);
    
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
