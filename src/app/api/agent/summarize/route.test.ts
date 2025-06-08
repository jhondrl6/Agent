// src/app/api/agent/summarize/route.test.ts
import { POST } from './route'; // Adjust if your export is different
import { NextRequest } from 'next/server';
import { GeminiClient } from '@/lib/search/GeminiClient';
import { SummarizeResponse } from '@/lib/types/summarize';

// Mock GeminiClient
jest.mock('@/lib/search/GeminiClient');

const MockGeminiClient = GeminiClient as jest.MockedClass<typeof GeminiClient>;

describe('/api/agent/summarize POST', () => {
  let mockRequest: NextRequest;

  beforeEach(() => {
    // Reset mocks before each test
    MockGeminiClient.mockClear();
    // Mock the constructor and methods
    MockGeminiClient.prototype.summarize = jest.fn();
  });

  it('should return 400 if textToSummarize is missing', async () => {
    mockRequest = {
      json: async () => ({}),
    } as NextRequest;

    const response = await POST(mockRequest);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('textToSummarize is required');
  });

  it('should return 400 if targetLength is invalid', async () => {
    mockRequest = {
      json: async () => ({ textToSummarize: 'Some text', targetLength: 'invalidLength' }),
    } as NextRequest;

    const response = await POST(mockRequest);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('targetLength must be one of');
  });

  it('should return 500 if GEMINI_API_KEY is not set', async () => {
    const originalApiKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY; // Temporarily remove API key

    mockRequest = {
      json: async () => ({ textToSummarize: 'Some valid text' }),
    } as NextRequest;

    const response = await POST(mockRequest);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain('Gemini API key is missing');

    process.env.GEMINI_API_KEY = originalApiKey; // Restore API key
  });

  it('should call GeminiClient.summarize and return its response on success', async () => {
    const mockSummary: SummarizeResponse = { summary: 'This is a summary.' };
    (MockGeminiClient.prototype.summarize as jest.Mock).mockResolvedValue(mockSummary);

    process.env.GEMINI_API_KEY = 'test-key'; // Ensure API key is set

    mockRequest = {
      json: async () => ({ textToSummarize: 'A long piece of text to summarize.', targetLength: 'short' }),
    } as NextRequest;

    const response = await POST(mockRequest);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(mockSummary);
    expect(MockGeminiClient.prototype.summarize).toHaveBeenCalledWith({
      textToSummarize: 'A long piece of text to summarize.',
      targetLength: 'short',
    });
  });

  it('should return 500 if GeminiClient.summarize throws an error', async () => {
    (MockGeminiClient.prototype.summarize as jest.Mock).mockRejectedValue(new Error('Summarization failed'));
    process.env.GEMINI_API_KEY = 'test-key'; // Ensure API key is set

    mockRequest = {
      json: async () => ({ textToSummarize: 'Another text.' }),
    } as NextRequest;

    const response = await POST(mockRequest);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain('Failed to generate summary');
    expect(body.details).toContain('Summarization failed');
  });
});
