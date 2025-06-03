// src/lib/agent/DecisionEngine.test.ts
import {
  DecisionEngine,
  ChooseSearchProviderInput,
  HandleFailedTaskInput,
  SearchProviderOption, // Corrected type name
  FailedTaskAction
} from './DecisionEngine';
import { Task, LogLevel, ValidationOutput } from '@/lib/types/agent';
import { GeminiClient, GeminiRequestParams, GeminiResponse } from '@/lib/search/GeminiClient';

// Mock GeminiClient
jest.mock('@/lib/search/GeminiClient');
const MockedGeminiClient = GeminiClient as jest.MockedClass<typeof GeminiClient>;
let mockGeminiGenerate: jest.Mock<Promise<GeminiResponse>, [GeminiRequestParams]>; // Typed mock for generate

// Mock addLog function
const mockAddLog = jest.fn();

const mockTaskDefault: Task = {
  id: 'task-1',
  missionId: 'mission-1',
  description: 'Test task',
  status: 'pending',
  retries: 0,
  createdAt: new Date('2023-01-01T10:00:00.000Z'),
  updatedAt: new Date('2023-01-01T10:00:00.000Z'),
  result: undefined,
  failureDetails: undefined,
  validationOutcome: undefined,
};

describe('DecisionEngine', () => {
  let mockTask: Task; // To be reset for each test

  // Section for RULE-BASED tests
  describe('Rule-Based Logic', () => {
    let decisionEngineRuleBased: DecisionEngine;

    beforeEach(() => {
      mockAddLog.mockClear();
      // Instantiate DecisionEngine without a Gemini API key for rule-based mode
      // Constructor: constructor(addLogFunction, geminiApiKey?)
      decisionEngineRuleBased = new DecisionEngine(mockAddLog, undefined);
      mockTask = {...mockTaskDefault, id: `task-${Date.now()}`}; // Fresh task with unique ID
    });

    // --- Existing rule-based tests for chooseSearchProvider go here ---
    describe('chooseSearchProvider (Rule-Based)', () => {
      const availableProviders: SearchProviderOption[] = ['tavily', 'serper', 'gemini'];

      it('should prefer serper for "google search for" queries if available', async () => {
        const input: ChooseSearchProviderInput = {
          taskDescription: 'google search for next.js documentation',
          availableProviders,
        };
        const output = await decisionEngineRuleBased.chooseSearchProvider(input);
        expect(output.provider).toBe('serper');
        expect(output.reason).toContain("Rule: Explicit Google/Serper search. Chosen: serper");
      });

      it('should fallback to tavily if serper preferred but unavailable for "google search"', async () => {
        const input: ChooseSearchProviderInput = {
          taskDescription: 'google search for something',
          availableProviders: ['tavily', 'gemini'],
        };
        const output = await decisionEngineRuleBased.chooseSearchProvider(input);
        expect(output.provider).toBe('tavily');
        expect(output.reason).toContain("Rule: Explicit Google/Serper search. Chosen: tavily");
      });

      it('should prefer tavily for general research queries if available', async () => {
        const input: ChooseSearchProviderInput = {
          taskDescription: 'research quantum computing',
          availableProviders,
        };
        const output = await decisionEngineRuleBased.chooseSearchProvider(input);
        expect(output.provider).toBe('tavily');
        expect(output.reason).toContain("Rule: General research. Chosen: tavily");
      });

      it('should use default fallback (tavily -> serper -> gemini -> first available) if no specific rules match', async () => {
          const inputSerperNext: ChooseSearchProviderInput = { taskDescription: "what is the weather?", availableProviders: ['serper', 'gemini'] };
          const outputSerperNext = await decisionEngineRuleBased.chooseSearchProvider(inputSerperNext);
          expect(outputSerperNext.provider).toBe('serper');
          expect(outputSerperNext.reason).toContain("Rule Default: Default selection process. Chosen: serper");

          const inputGeminiNext: ChooseSearchProviderInput = { taskDescription: "what is the weather?", availableProviders: ['gemini'] };
          const outputGeminiNext = await decisionEngineRuleBased.chooseSearchProvider(inputGeminiNext);
          expect(outputGeminiNext.provider).toBe('gemini');
          expect(outputGeminiNext.reason).toContain("Rule Default: Default selection process. Chosen: gemini"); // Corrected again

          const inputTavilyFirst: ChooseSearchProviderInput = { taskDescription: "tell me a joke", availableProviders };
          const outputTavilyFirst = await decisionEngineRuleBased.chooseSearchProvider(inputTavilyFirst);
          expect(outputTavilyFirst.provider).toBe('tavily');
          expect(outputTavilyFirst.reason).toContain('Rule Default: Tavily is generally preferred');
      });

      it('should return "none" if no providers are available', async () => {
          const input: ChooseSearchProviderInput = { taskDescription: "anything", availableProviders: [] };
          const output = await decisionEngineRuleBased.chooseSearchProvider(input);
          expect(output.provider).toBe('none');
          expect(output.reason).toMatch(/No suitable search providers available/i);
      });

       it('should return "none" if only "none" is an available provider', async () => {
        const input: ChooseSearchProviderInput = { taskDescription: "anything", availableProviders: ['none'] };
        const output = await decisionEngineRuleBased.chooseSearchProvider(input);
        expect(output.provider).toBe('none');
        expect(output.reason).toContain('No suitable search providers available');
      });
    });

    // --- Existing rule-based tests for handleFailedTask go here ---
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
        expect(output.reason).toContain("Rule-based: Transient error detected, but max retries (3) reached");
      });

      it('should suggest abandon for configuration errors (e.g., invalid API key)', async () => {
        const input: HandleFailedTaskInput = {
          task: { ...mockTask, retries: 0 },
          error: { message: 'Invalid API Key provided', status: 401 },
        };
        const output = await decisionEngineRuleBased.handleFailedTask(input);
        expect(output.action).toBe('abandon');
        expect(output.reason).toContain("Rule-based: Configuration error");
      });

      it('should suggest abandon for bad request errors (e.g., 400)', async () => {
        const input: HandleFailedTaskInput = {
          task: { ...mockTask, retries: 0 },
          error: { message: 'Bad Request: query parameter missing', status: 400 }, // Corrected: DE checks error.status
        };
        const output = await decisionEngineRuleBased.handleFailedTask(input);
        expect(output.action).toBe('abandon');
        expect(output.reason).toContain('Rule-based: Invalid input or bad request detected');
      });

      it('should handle validation failures (rule-based path) with retries available', async () => {
        const validationOutcome: ValidationOutput = {
          isValid: false,
          critique: 'Result was empty.',
          suggestedAction: 'retry_task_new_params',
          qualityScore: 0.1,
        };
        const input: HandleFailedTaskInput = {
          task: { ...mockTask, status: 'completed', validationOutcome, retries: 0 },
          error: null,
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
        expect(output.reason).toContain("Rule-based: Invalid input/bad request (\"bad request: query parameter missing\"). Suggesting abandon.");
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


  // Section for LLM-BASED tests
  describe('LLM-Driven Logic', () => {
    let decisionEngineLLM: DecisionEngine;

    beforeEach(() => {
      mockAddLog.mockClear();
      MockedGeminiClient.mockClear(); // Clear constructor calls

      // Setup the mock for the GeminiClient's 'generate' method
      mockGeminiGenerate = jest.fn();
      MockedGeminiClient.prototype.generate = mockGeminiGenerate;

      // Instantiate DecisionEngine WITH a dummy Gemini API key to enable LLM path
      // Constructor: constructor(addLogFunction, geminiApiKey?)
      decisionEngineLLM = new DecisionEngine(mockAddLog, 'dummy-gemini-api-key');
      mockTask = {...mockTaskDefault, id: `task-${Date.now()}`}; // Fresh task with unique ID
    });

    it('should initialize for LLM logic and log enabling', () => {
        expect(decisionEngineLLM).toBeInstanceOf(DecisionEngine);
        expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({
            level: 'info',
            message: '[DE] Initialized with GeminiClient. LLM-based decisions ENABLED.'
        }));
    });

    describe('chooseSearchProvider (LLM Path)', () => {
      const availableProviders: SearchProviderOption[] = ['tavily', 'serper', 'gemini'];
      let testInput: ChooseSearchProviderInput;

      beforeEach(() => {
        // Reset mock for each specific test in this sub-describe too
        mockGeminiGenerate.mockReset();
        testInput = {
          taskDescription: 'Some complex research task requiring LLM decision.',
          availableProviders,
        };
      });

      it('should use LLM choice if valid and provider is available', async () => {
        const llmResponseJson = { provider: 'tavily', reason: 'LLM: Tavily is suitable for this research.' };
        mockGeminiGenerate.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: JSON.stringify(llmResponseJson) }] } }],
        });

        const output = await decisionEngineLLM.chooseSearchProvider(testInput);

        expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
        expect(output.provider).toBe('tavily');
        expect(output.reason).toBe(`LLM Decision: ${llmResponseJson.reason}`);
        expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'debug', message: expect.stringContaining('Attempting LLM for provider choice for task') }));
        expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({
          level: 'info',
          message: expect.stringContaining(`[DE] LLM Decision for provider choice: tavily. Reason: ${llmResponseJson.reason}`)
        }));
      });

      it('should fall back to rules if LLM chooses an unavailable provider', async () => {
        const llmResponseJson = { provider: 'unavailable_provider', reason: 'LLM made a boo-boo' };
        mockGeminiGenerate.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: JSON.stringify(llmResponseJson) }] } }],
        });

        const output = await decisionEngineLLM.chooseSearchProvider(testInput);

        expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
        expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn', message: expect.stringContaining('LLM chose unavailable provider "unavailable_provider"')}));
        expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'debug', message: expect.stringContaining('[DE] Using rule-based provider choice') }));
        expect(output.provider).toBe('tavily'); // Rule-based default for "Some complex research task..."
        expect(output.reason).toContain("Rule: General research. Chosen: tavily");
      });

      it('should fall back to rules if LLM returns malformed JSON', async () => {
        mockGeminiGenerate.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: 'This is not JSON' }] } }],
        });
        const output = await decisionEngineLLM.chooseSearchProvider(testInput);
        expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn', message: expect.stringContaining('[DE] LLM provider choice response invalid format. Falling back to rule-based.')}));
        expect(output.provider).toBe('tavily');
        expect(output.reason).toContain("Rule: General research. Chosen: tavily");
      });

      it('should fall back to rules if LLM call fails (promise rejects)', async () => {
        mockGeminiGenerate.mockRejectedValue(new Error('LLM API Error'));
        const output = await decisionEngineLLM.chooseSearchProvider(testInput);
        expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', message: expect.stringContaining('[DE] Error using LLM for provider choice. Falling back to rule-based.'), details: expect.objectContaining({ errorDetails: 'LLM API Error'}) }));
        expect(output.provider).toBe('tavily');
        expect(output.reason).toContain("Rule: General research. Chosen: tavily");
      });

      it('should fall back to rules if LLM returns JSON missing required "provider" field', async () => {
        const llmResponseJson = { reason: 'LLM forgot the provider field' };
        mockGeminiGenerate.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: JSON.stringify(llmResponseJson) }] } }],
        });
        const output = await decisionEngineLLM.chooseSearchProvider(testInput);
        expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn', message: expect.stringContaining('[DE] LLM provider choice response invalid format. Falling back to rule-based.')}));
        expect(output.provider).toBe('tavily');
        expect(output.reason).toContain("Rule: General research. Chosen: tavily");
      });

      it('should correctly parse LLM JSON response wrapped in markdown backticks', async () => {
        const llmResponseJson = { provider: 'serper', reason: 'LLM: Explicitly for Google-like search.' };
        const markdownWrappedJson = `\`\`\`json
        ${JSON.stringify(llmResponseJson)}
        \`\`\``;
        mockGeminiGenerate.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: markdownWrappedJson }] } }],
        });
        testInput.taskDescription = "google search for specific terms";

        const output = await decisionEngineLLM.chooseSearchProvider(testInput);
        expect(output.provider).toBe('serper');
        expect(output.reason).toBe(`LLM Decision: ${llmResponseJson.reason}`); // Changed to LLM Decision
      });
    });

    describe('handleFailedTask (LLM Path)', () => {
      let testTask: Task; // Use a fresh task for this describe block's tests

      beforeEach(() => {
        mockGeminiGenerate.mockReset(); // Reset for each specific test in this sub-describe too
        // Create a fresh task for each test to avoid side-effects on retries, status, etc.
        testTask = { ...mockTaskDefault, id: `task-llm-fail-${Date.now()}-${Math.random().toString(16).slice(2)}`, retries: 0, failureDetails: undefined, validationOutcome: undefined, result: undefined };
      });

      it('should use LLM suggestion for retry on a transient-like error', async () => {
        const llmResponseJson = { action: 'retry', reason: 'LLM: Transient issue, suggest retry.', delayMs: 1500 };
        mockGeminiGenerate.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: JSON.stringify(llmResponseJson) }] } }],
        });
        const input: HandleFailedTaskInput = { task: testTask, error: { message: 'Network timeout' } };

        const output = await decisionEngineLLM.handleFailedTask(input);

        expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
        const calledWithPrompt = (mockGeminiGenerate.mock.calls[0][0] as GeminiRequestParams).prompt;
        expect(calledWithPrompt).toContain("Primary Error/Critique: \"network timeout\""); // This was okay
        expect(output.action).toBe('retry');
        expect(output.reason).toBe(`LLM Decision: ${llmResponseJson.reason}`);
        expect(output.delayMs).toBe(1500);
        expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'debug', message: expect.stringContaining(`[DE] Attempting LLM for failure handling task ${testTask.id}`)}));
      });

      it('should use LLM suggestion for abandon on a critical-like error', async () => {
        const llmResponseJson = { action: 'abandon', reason: 'LLM: Critical API key error.' };
        mockGeminiGenerate.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: JSON.stringify(llmResponseJson) }] } }],
        });
        const input: HandleFailedTaskInput = { task: testTask, error: { message: 'Invalid API Key', status: 401 } };

        const output = await decisionEngineLLM.handleFailedTask(input);

        expect(output.action).toBe('abandon');
        expect(output.reason).toBe(`LLM Decision: ${llmResponseJson.reason}`);
        expect(output.delayMs).toBeUndefined();
      });

      it('should override LLM "retry" to "abandon" if MAX_RETRIES reached', async () => {
        testTask.retries = DecisionEngine.MAX_TASK_RETRIES;
        const llmResponseJson = { action: 'retry', reason: 'LLM wants to retry anyway', delayMs: 1000 };
        mockGeminiGenerate.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: JSON.stringify(llmResponseJson) }] } }],
        });
        const input: HandleFailedTaskInput = { task: testTask, error: { message: 'Persistent error' } };

        const output = await decisionEngineLLM.handleFailedTask(input);

        expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
        expect(output.action).toBe('abandon');
        expect(output.reason).toContain("LLM suggested retry, but max retries (3/3) reached. Overriding to 'abandon'"); // Matched
        expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn', message: expect.stringContaining('LLM suggested retry, but task has already reached max retries (3/3). Overriding to abandon.') }));
      });

      it('should use default delay if LLM suggests retry with invalid delayMs', async () => {
        const llmResponseJson = { action: 'retry', reason: 'LLM forgot delay format', delayMs: 'অনেক দেরী' }; // "অনেক দেরী" is not a number
        mockGeminiGenerate.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: JSON.stringify(llmResponseJson) }] } }],
        });
        testTask.retries = 0; // Ensure retries is 0 for predictable default delay
        const input: HandleFailedTaskInput = { task: testTask, error: { message: 'Some error' } };

        const output = await decisionEngineLLM.handleFailedTask(input);

        expect(output.action).toBe('retry');
        expect(output.delayMs).toBe(1000 * Math.pow(2, 0)); // Expected default delay for 0 prior retries
        expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn', message: expect.stringContaining('LLM suggested retry but provided invalid delayMs')}));
      });

      it('should fall back to rules if LLM suggests an invalid action', async () => {
        const llmResponseJson = { action: 'meditate', reason: 'LLM needs a break' };
        mockGeminiGenerate.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: JSON.stringify(llmResponseJson) }] } }],
        });
        const input: HandleFailedTaskInput = { task: testTask, error: { message: 'Confusing error' } };

        const output = await decisionEngineLLM.handleFailedTask(input);
        expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn', message: expect.stringContaining('LLM chose invalid action "meditate". Falling back to rule-based.')}));
        expect(output.action).toBe('retry');
        expect(output.reason).toMatch(/^Rule-based: Unclassified error/);
      });

      it('should fall back to rules if LLM response is malformed JSON for handleFailedTask', async () => {
        mockGeminiGenerate.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: 'Not proper JSON for failure handling' }] } }],
        });
        const input: HandleFailedTaskInput = { task: testTask, error: { message: 'Another error' } };
        const output = await decisionEngineLLM.handleFailedTask(input);
        expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn', message: expect.stringContaining('[DE] LLM response for failure handling was not in the expected format')}));
        expect(output.action).toBe('retry');
        expect(output.reason).toMatch(/^Rule-based: Unclassified error/);
      });

      it('should fall back to rules if LLM call fails for handleFailedTask', async () => {
        mockGeminiGenerate.mockRejectedValue(new Error('LLM API Error for handleFailedTask'));
        const input: HandleFailedTaskInput = { task: testTask, error: { message: 'Network issue during task' } };
        const output = await decisionEngineLLM.handleFailedTask(input);
        expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', message: expect.stringContaining('[DE] Error using LLM for failure handling. Falling back to rule-based.'), details: expect.objectContaining({ errorDetails: 'LLM API Error for handleFailedTask'}) }));
        expect(output.action).toBe('retry');
        expect(output.reason).toMatch(/^Rule-based: Unclassified error/);
      });

      it('should correctly handle LLM response for a validation failure', async () => {
        const validationOutcome: ValidationOutput = { isValid: false, critique: "Result is nonsensical.", suggestedAction: "refine_query" };
        testTask.status = 'completed';
        testTask.validationOutcome = validationOutcome;

        const llmResponseJson = { action: 're-plan', reason: 'LLM: Validation critique suggests task needs re-planning.' };
        mockGeminiGenerate.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: JSON.stringify(llmResponseJson) }] } }],
        });
        const input: HandleFailedTaskInput = {
            task: testTask,
            // When it's a validation failure, TaskExecutor sends a synthetic error object
            error: { name: 'ValidationError', message: `Validation failed: ${validationOutcome.critique}` }
        };

        const output = await decisionEngineLLM.handleFailedTask(input);
        expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
        const calledWithPrompt = (mockGeminiGenerate.mock.calls[0][0] as GeminiRequestParams).prompt;
        expect(calledWithPrompt).toContain("Is this a validation failure?: true");
        expect(calledWithPrompt).toContain("Primary Error/Critique: \"validation failed: result is nonsensical.\"");
        expect(calledWithPrompt).toContain("Validator Suggested: refine_query");

        expect(output.action).toBe('re-plan');
        expect(output.reason).toBe(`LLM Decision: ${llmResponseJson.reason}`); // Kept "LLM Decision"
      });
    });
  });
});
