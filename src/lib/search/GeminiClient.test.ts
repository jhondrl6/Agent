// src/lib/search/GeminiClient.test.ts
import { GeminiClient } from './GeminiClient';
import { SummarizeRequest, SummarizeResponse } from '../types/summarize';
import { GeminiResponse } from '../types/search'; // Adjust path if needed, assuming it's in ../types/search relative to GeminiClient.ts
import { LRUCache } from 'lru-cache'; // Import LRUCache if it's part of constructor or other methods tested

// Mock LRUCache if its methods are called during GeminiClient instantiation or tested methods
// jest.mock('lru-cache'); // Only if needed for these specific tests

describe('GeminiClient', () => {
  // Mock actual API key for tests
  const MOCK_API_KEY = 'test-gemini-api-key';

  // Potentially mock other dependencies if they interfere or are not relevant to summarize
  // For example, if the constructor does complex things not needed for summarize unit tests.

  describe('summarize', () => {
    let client: GeminiClient;
    let mockGenerate: jest.Mock;

    beforeEach(() => {
      // Instantiate client with caching disabled for simplicity in these unit tests,
      // unless cache interaction with summarize is specifically being tested.
      client = new GeminiClient(MOCK_API_KEY, { maxSize: 0 }); // Disable cache

      // Replace the 'generate' method with a Jest mock
      // It's crucial to mock the method on the *instance* if 'generate' is a class method
      // and not a static method, or if it's not easily mockable via prototype for all instances.
      // If 'generate' is called as 'this.generate', this approach is fine.
      mockGenerate = jest.fn();
      client.generate = mockGenerate;
    });

    it('should construct a concise prompt for targetLength "short"', async () => {
      const mockGeminiResponse: GeminiResponse = {
        candidates: [{ content: { parts: [{ text: 'Short summary.' }], role: 'model' } }]
      };
      mockGenerate.mockResolvedValue(mockGeminiResponse);

      await client.summarize({ textToSummarize: 'Some long text', targetLength: 'short' });

      expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({
        prompt: expect.stringContaining('Summarize the following text concisely (1-2 sentences)'),
        maxOutputTokens: 100,
        temperature: 0.7
      }));
    });

    it('should construct a detailed prompt for targetLength "long"', async () => {
      const mockGeminiResponse: GeminiResponse = {
        candidates: [{ content: { parts: [{ text: 'Long summary.' }], role: 'model' } }]
      };
      mockGenerate.mockResolvedValue(mockGeminiResponse);

      await client.summarize({ textToSummarize: 'Some long text', targetLength: 'long' });

      expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({
        prompt: expect.stringContaining('in detail (multiple paragraphs if necessary)'),
        maxOutputTokens: 500,
        temperature: 0.7 // Ensure temperature is also checked here
      }));
    });

    it('should use default prompt and tokens for targetLength "medium"', async () => {
      const mockGeminiResponse: GeminiResponse = {
        candidates: [{ content: { parts: [{ text: 'Medium summary.' }], role: 'model' } }]
      };
      mockGenerate.mockResolvedValue(mockGeminiResponse);

      await client.summarize({ textToSummarize: 'Some long text', targetLength: 'medium' });

      expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({
        prompt: expect.stringContaining('(around 3-5 sentences)'),
        maxOutputTokens: 250,
        temperature: 0.7 // Ensure temperature is also checked here
      }));
    });

    it('should use default prompt and tokens if targetLength is undefined', async () => {
        const mockGeminiResponse: GeminiResponse = {
          candidates: [{ content: { parts: [{ text: 'Medium summary (undefined targetLength).' }], role: 'model' } }]
        };
        mockGenerate.mockResolvedValue(mockGeminiResponse);

        await client.summarize({ textToSummarize: 'Some long text' }); // targetLength undefined

        expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({
          prompt: expect.stringContaining('(around 3-5 sentences)'),
          maxOutputTokens: 250,
          temperature: 0.7
        }));
      });

    it('should return the summary from GeminiResponse', async () => {
      const expectedSummary = 'This is the generated summary.';
      const mockGeminiResponse: GeminiResponse = {
        candidates: [{ content: { parts: [{ text: expectedSummary }], role: 'model' } }]
      };
      mockGenerate.mockResolvedValue(mockGeminiResponse);

      const result: SummarizeResponse = await client.summarize({ textToSummarize: 'Text to summarize' });

      expect(result.summary).toBe(expectedSummary);
    });

    it('should correctly join parts if multiple are present in GeminiResponse', async () => {
        const parts = [{ text: 'Part 1.' }, { text: 'Part 2.' }];
        const expectedSummary = 'Part 1.\nPart 2.'; // Joined with newline by the summarize method
        const mockGeminiResponse: GeminiResponse = {
          candidates: [{ content: { parts: parts, role: 'model' } }]
        };
        mockGenerate.mockResolvedValue(mockGeminiResponse);

        const result: SummarizeResponse = await client.summarize({ textToSummarize: 'Text with multiple parts' });

        expect(result.summary).toBe(expectedSummary);
      });

    it('should throw an error if generate fails', async () => {
      mockGenerate.mockRejectedValue(new Error('API failure'));

      await expect(client.summarize({ textToSummarize: 'Text' })).rejects.toThrow('Summarization failed: API failure');
    });

    it('should throw an error if no candidates are found in Gemini response', async () => {
        const mockGeminiResponse: GeminiResponse = { candidates: [] }; // Empty candidates
        mockGenerate.mockResolvedValue(mockGeminiResponse);

        await expect(client.summarize({ textToSummarize: 'Text' })).rejects.toThrow('Summarization failed: No text content found in Gemini response structure.');
      });

    it('should throw an error if no content parts are found in Gemini response candidate', async () => {
        const mockGeminiResponse: GeminiResponse = {
            candidates: [{ content: { parts: [], role: 'model' } }] // Candidate with empty parts
        };
        mockGenerate.mockResolvedValue(mockGeminiResponse);

        await expect(client.summarize({ textToSummarize: 'Text' })).rejects.toThrow('Summarization failed: No text content found in Gemini response structure.');
    });

    it('should trim the summary', async () => {
        const summaryWithSpaces = '  Summary with leading/trailing spaces.  ';
        const expectedSummary = 'Summary with leading/trailing spaces.';
        const mockGeminiResponse: GeminiResponse = {
          candidates: [{ content: { parts: [{ text: summaryWithSpaces }], role: 'model' } }]
        };
        mockGenerate.mockResolvedValue(mockGeminiResponse);

        const result = await client.summarize({ textToSummarize: 'Text to summarize' });

        expect(result.summary).toBe(expectedSummary);
      });

  });
});
