// src/lib/agent/DecisionEngine.test.ts
import { DecisionEngine, ChooseSearchProviderInput, HandleFailedTaskInput, SearchProviderOption, FailedTaskAction } from './DecisionEngine';
import { Task, LogLevel, ValidationOutput } from '@/lib/types/agent';
// GeminiClient might not be needed if we only test rule-based path by not providing API key.

// Mock addLog function
const mockAddLog = jest.fn();

// Mock Task for testing
const mockTaskDefault: Task = {
  id: 'task-1',
  missionId: 'mission-1',
  description: 'Test task',
  status: 'pending',
  retries: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  result: undefined,
  failureDetails: undefined,
  validationOutcome: undefined,
};

describe('DecisionEngine (Rule-Based Logic)', () => {
  let decisionEngineRuleBased: DecisionEngine;
  let mockTask: Task;

  beforeEach(() => {
    // Instantiate DecisionEngine without a Gemini API key to force rule-based mode
    // Constructor: constructor(addLogFunction, geminiApiKey?)
    decisionEngineRuleBased = new DecisionEngine(mockAddLog, undefined);
    mockAddLog.mockClear();
    mockTask = {...mockTaskDefault}; // Reset task to default for each test
  });

  describe('chooseSearchProvider (Rule-Based)', () => {
    const availableProviders: SearchProviderOption[] = ['tavily', 'serper', 'gemini'];

    it('should prefer serper for "google search for" queries if available', async () => {
      const input: ChooseSearchProviderInput = {
        taskDescription: 'google search for next.js documentation',
        availableProviders,
      };
      const output = await decisionEngineRuleBased.chooseSearchProvider(input);
      expect(output.provider).toBe('serper');
      expect(output.reason).toContain('Rule: Task explicitly or implicitly suggests Google search');
    });

    it('should fallback to tavily if serper preferred but unavailable for "google search"', async () => {
      const input: ChooseSearchProviderInput = {
        taskDescription: 'google search for something',
        availableProviders: ['tavily', 'gemini'], // Serper not available
      };
      const output = await decisionEngineRuleBased.chooseSearchProvider(input);
      expect(output.provider).toBe('tavily');
      expect(output.reason).toContain('Rule: Google search suggested, but Serper unavailable');
    });

    it('should prefer tavily for general research queries if available', async () => {
      const input: ChooseSearchProviderInput = {
        taskDescription: 'research quantum computing',
        availableProviders,
      };
      const output = await decisionEngineRuleBased.chooseSearchProvider(input);
      expect(output.provider).toBe('tavily');
      expect(output.reason).toContain('Rule: General research query or Tavily specified');
    });

    it('should use default fallback (tavily -> serper -> gemini -> first available) if no specific rules match', async () => {
        const inputSerperNext: ChooseSearchProviderInput = { taskDescription: "what is the weather?", availableProviders: ['serper', 'gemini'] };
        const outputSerperNext = await decisionEngineRuleBased.chooseSearchProvider(inputSerperNext);
        expect(outputSerperNext.provider).toBe('serper');
        expect(outputSerperNext.reason).toContain('Rule Default: Tavily not available, Serper selected.');

        const inputGeminiNext: ChooseSearchProviderInput = { taskDescription: "what is the weather?", availableProviders: ['gemini'] };
        const outputGeminiNext = await decisionEngineRuleBased.chooseSearchProvider(inputGeminiNext);
        expect(outputGeminiNext.provider).toBe('gemini');
        expect(outputGeminiNext.reason).toContain('Rule Default: Only Gemini available');

        const inputTavilyFirst: ChooseSearchProviderInput = { taskDescription: "tell me a joke", availableProviders };
        const outputTavilyFirst = await decisionEngineRuleBased.chooseSearchProvider(inputTavilyFirst);
        expect(outputTavilyFirst.provider).toBe('tavily');
        expect(outputTavilyFirst.reason).toContain('Rule Default: Tavily is generally preferred');
    });

    it('should return "none" if no providers are available', async () => {
        const input: ChooseSearchProviderInput = { taskDescription: "anything", availableProviders: [] };
        const output = await decisionEngineRuleBased.chooseSearchProvider(input);
        expect(output.provider).toBe('none');
        // Based on the logic, the reason might be "No suitable search providers available." if LLM path isn't taken.
        // Or if rules run, it's "Rule Default: No suitable search providers available or "none" was the only option."
        expect(output.reason).toMatch(/No suitable search providers available|No providers available or only 'none' is available/i);
    });

     it('should return "none" if only "none" is an available provider', async () => {
      const input: ChooseSearchProviderInput = { taskDescription: "anything", availableProviders: ['none'] };
      const output = await decisionEngineRuleBased.chooseSearchProvider(input);
      expect(output.provider).toBe('none');
      expect(output.reason).toContain('No suitable search providers available'); // LLM path is skipped
    });
  });

  describe('handleFailedTask (Rule-Based Logic)', () => {
    it('should suggest retry for transient errors if retries < MAX_TASK_RETRIES', async () => {
      const input: HandleFailedTaskInput = {
        task: { ...mockTask, retries: 0 },
        error: { message: 'Network error: ETIMEDOUT', name: 'NetworkError' },
      };
      const output = await decisionEngineRuleBased.handleFailedTask(input);
      expect(output.action).toBe('retry');
      expect(output.reason).toContain('Rule-based: Transient error detected');
      expect(output.delayMs).toBeGreaterThan(0);
    });

    it('should suggest abandon for transient errors if retries >= MAX_TASK_RETRIES', async () => {
      const input: HandleFailedTaskInput = {
        task: { ...mockTask, retries: DecisionEngine.MAX_TASK_RETRIES },
        error: { message: 'Service unavailable', status: 503 },
      };
      const output = await decisionEngineRuleBased.handleFailedTask(input);
      expect(output.action).toBe('abandon');
      expect(output.reason).toContain('Rule-based: Transient error detected, but max retries reached');
    });

    it('should suggest abandon for configuration errors (e.g., invalid API key)', async () => {
      const input: HandleFailedTaskInput = {
        task: { ...mockTask, retries: 0 },
        error: { message: 'Invalid API Key provided', status: 401 },
      };
      const output = await decisionEngineRuleBased.handleFailedTask(input);
      expect(output.action).toBe('abandon');
      expect(output.reason).toContain('Rule-based: Configuration error detected');
    });

    it('should suggest abandon for bad request errors (e.g., 400)', async () => {
      const input: HandleFailedTaskInput = {
        task: { ...mockTask, retries: 0 },
        error: { message: 'Bad Request: query parameter missing', statusCode: 400 }, // Note: DE checks error.status
      };
      const output = await decisionEngineRuleBased.handleFailedTask(input);
      expect(output.action).toBe('abandon');
      expect(output.reason).toContain('Rule-based: Invalid input or bad request detected');
    });

    it('should handle validation failures (rule-based path) with retries available', async () => {
      const validationOutcome: ValidationOutput = {
        isValid: false,
        critique: 'Result was empty.',
        suggestedAction: 'retry_task_new_params', // Validator hint
        qualityScore: 0.1,
      };
      const input: HandleFailedTaskInput = {
        task: { ...mockTask, status: 'completed', validationOutcome, retries: 0 },
        error: null, // Explicitly null for validation failure where no execution error occurred
      };
      const output = await decisionEngineRuleBased.handleFailedTask(input);
      expect(output.action).toBe('retry');
      expect(output.reason).toContain('Rule-based: Validation failed ("Result was empty.")');
      expect(output.reason).toContain("Validator suggested retry_task_new_params. Suggesting retry #1.");
      expect(output.delayMs).toBeGreaterThan(0);
    });

    it('should suggest abandon for validation failures if max retries reached (rule-based path)', async () => {
      const validationOutcome: ValidationOutput = { isValid: false, critique: 'Result too short.' };
      const input: HandleFailedTaskInput = {
        task: { ...mockTask, status: 'completed', validationOutcome, retries: DecisionEngine.MAX_TASK_RETRIES },
        error: null,
      };
      const output = await decisionEngineRuleBased.handleFailedTask(input);
      expect(output.action).toBe('abandon');
      expect(output.reason).toContain('Rule-based: Validation failed ("Result too short."), and max retries reached.');
    });
  });
});
