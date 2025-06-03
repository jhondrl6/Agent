// src/lib/agent/TaskExecutor.test.ts
import { TaskExecutor } from './TaskExecutor';
import { Task, LogLevel, ValidationOutput } from '@/lib/types/agent';
import { DecisionEngine, ChooseSearchProviderInput, ChooseSearchProviderOutput, HandleFailedTaskInput, HandleFailedTaskOutput, SearchProviderOption } from './DecisionEngine';
import { TavilyClient, TavilySearchParams, TavilySearchResponse } from '@/lib/search/TavilyClient';
import { SerperClient, SerperSearchParams, SerperSearchResponse } from '@/lib/search/SerperClient';
import { ResultValidator, ValidationInput } from '@/lib/search/ResultValidator';
import { useAgentStore } from '@/lib/agent/StateManager';

// Mock DecisionEngine
jest.mock('./DecisionEngine');
const MockedDecisionEngine = DecisionEngine as jest.MockedClass<typeof DecisionEngine>;
let mockChooseSearchProvider: jest.Mock<Promise<ChooseSearchProviderOutput>, [ChooseSearchProviderInput]>;
let mockHandleFailedTask: jest.Mock<Promise<HandleFailedTaskOutput>, [HandleFailedTaskInput]>;


import { mockTavilySearchGlobal, clearMockTavilySearchGlobal } from '../../../jest.setup'; // Adjust path as needed

// Mock Search Clients
// TavilyClient is now globally mocked in jest.setup.js
const mockTavilySearch = mockTavilySearchGlobal; // Use the global mock
const MockedTavilyClient = TavilyClient as jest.MockedClass<typeof TavilyClient>; // Keep for type-checking

jest.mock('@/lib/search/SerperClient');
const MockedSerperClient = SerperClient as jest.MockedClass<typeof SerperClient>;
let mockSerperSearch: jest.Mock<Promise<SerperSearchResponse>, [SerperSearchParams]>;


// Mock ResultValidator
jest.mock('@/lib/search/ResultValidator');
const MockedResultValidator = ResultValidator as jest.MockedClass<typeof ResultValidator>;
let mockValidate: jest.Mock<ValidationOutput, [ValidationInput]>;


// Mock StateManager actions (useAgentStore.getState())
const mockUpdateTask = jest.fn();
const mockSetAgentError = jest.fn();
const mockAddTaskToActive = jest.fn();
const mockRemoveTaskFromActive = jest.fn();
const mockAddLogGlobal = jest.fn();

jest.mock('@/lib/agent/StateManager', () => ({
  __esModule: true,
  useAgentStore: {
    getState: jest.fn(() => ({
      updateTask: mockUpdateTask,
      setAgentError: mockSetAgentError,
      addTaskToActive: mockAddTaskToActive,
      removeTaskFromActive: mockRemoveTaskFromActive,
      addLog: mockAddLogGlobal,
    })),
  },
}));

const mockAddLogExecutor = jest.fn();

export const mockTaskTemplate: Task = {
  id: 'test-task-1', // Will be overridden in beforeEach
  missionId: 'test-mission-1',
  description: 'Test task description',
  status: 'pending',
  retries: 0,
  createdAt: new Date('2023-01-01T10:00:00.000Z'),
  updatedAt: new Date('2023-01-01T10:00:00.000Z'),
  result: undefined,
  failureDetails: undefined,
  validationOutcome: undefined,
};

describe('TaskExecutor', () => {
  jest.setTimeout(15000); // Increase timeout for this test suite

  let originalTavilyApiKey: string | undefined;
  let originalSerperApiKey: string | undefined;
  let originalGeminiApiKey: string | undefined;

  beforeAll(() => {
    originalTavilyApiKey = process.env.TAVILY_API_KEY;
    originalSerperApiKey = process.env.SERPER_API_KEY;
    originalGeminiApiKey = process.env.GEMINI_API_KEY_FOR_DECISIONS; // Assuming this is the one for DE
  });

  afterAll(() => {
    process.env.TAVILY_API_KEY = originalTavilyApiKey;
    process.env.SERPER_API_KEY = originalSerperApiKey;
    process.env.GEMINI_API_KEY_FOR_DECISIONS = originalGeminiApiKey;
  });

  let executor: TaskExecutor;
  let currentTestTask: Task;
  const missionId = 'test-mission-1';

  beforeEach(() => {
    // Ensure API keys are set for client instantiation within TaskExecutor
    process.env.TAVILY_API_KEY = 'dummy-tavily-key-for-test';
    process.env.SERPER_API_KEY = 'dummy-serper-key-for-test';
    // process.env.GEMINI_API_KEY_FOR_DECISIONS might also be needed if DE uses it by default

    mockUpdateTask.mockClear();
    mockSetAgentError.mockClear();
    mockAddTaskToActive.mockClear();
    mockRemoveTaskFromActive.mockClear();
    mockAddLogExecutor.mockClear();
    mockAddLogGlobal.mockClear();

    MockedDecisionEngine.mockClear();

    // Clear the global Tavily mock's calls for this test suite
    clearMockTavilySearchGlobal();
    // mockTavilySearch.mockClear(); // Done by clearMockTavilySearchGlobal

    MockedSerperClient.mockClear();
    mockSerperSearch.mockClear(); // Clear the search method mock itself
    MockedResultValidator.mockClear();
    mockValidate.mockClear(); // Clear the validate method mock

    mockChooseSearchProvider = jest.fn();
    MockedDecisionEngine.prototype.chooseSearchProvider = mockChooseSearchProvider;

    mockHandleFailedTask = jest.fn();
    // Provide a default implementation for mockHandleFailedTask to prevent TypeErrors if it's unexpectedly called
    mockHandleFailedTask.mockResolvedValue({ action: 'abandon', reason: 'Default mock response for unhandled failure' });
    MockedDecisionEngine.prototype.handleFailedTask = mockHandleFailedTask;

    // mockTavilySearch is already defined and used in the factory function for the mock

    mockSerperSearch = jest.fn(); // Re-initialize for Serper as well
    MockedSerperClient.prototype.search = mockSerperSearch;

    mockValidate = jest.fn();
    MockedResultValidator.prototype.validate = mockValidate;

    (useAgentStore.getState as jest.Mock).mockReturnValue({
        updateTask: mockUpdateTask,
        setAgentError: mockSetAgentError,
        addTaskToActive: mockAddTaskToActive,
        removeTaskFromActive: mockRemoveTaskFromActive,
        addLog: mockAddLogGlobal, // Ensure addLog is available if DE tries to call it via store
    });

    currentTestTask = { ...mockTaskTemplate, id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`, retries: 0, failureDetails: undefined, validationOutcome: undefined, result: undefined };
    executor = new TaskExecutor(mockAddLogExecutor); // TaskExecutor will now use dummy API keys for client instantiation
  });

  it('Scenario 1: should successfully execute a Tavily search task', async () => {
    currentTestTask.description = "search for AI impact on jobs";
    mockChooseSearchProvider.mockResolvedValue({ provider: 'tavily', reason: 'Test choice' });
    mockTavilySearch.mockResolvedValue({ query: "AI impact on jobs", results: [{ title: 'AI Impact', url: 'http://example.com/ai', content: 'Significant impact...', score: 0.9 }] });
    mockValidate.mockReturnValue({ isValid: true, critique: 'Looks good', qualityScore: 0.8, suggestedAction: 'accept' });

    await executor.executeTask(missionId, currentTestTask);

    expect(mockAddTaskToActive).toHaveBeenCalledWith(currentTestTask.id);
    // First call: status 'in-progress'
    expect(mockUpdateTask).toHaveBeenNthCalledWith(1, missionId, currentTestTask.id, expect.objectContaining({ status: 'in-progress' }));
    expect(mockChooseSearchProvider).toHaveBeenCalled();
    expect(mockTavilySearch).toHaveBeenCalledWith(expect.objectContaining({ query: 'AI impact on jobs' }));
    expect(mockValidate).toHaveBeenCalledWith({ task: expect.objectContaining({id: currentTestTask.id, description: "search for AI impact on jobs"}), result: expect.stringContaining("AI Impact") });
    // Second call: status 'completed'
    expect(mockUpdateTask).toHaveBeenNthCalledWith(2, missionId, currentTestTask.id, expect.objectContaining({
      status: 'completed',
      result: expect.stringContaining("tavily Search Results:\n1. AI Impact"), // Exact match might be fragile, considertoContain
      validationOutcome: expect.objectContaining({ isValid: true })
    }));
    expect(mockRemoveTaskFromActive).toHaveBeenCalledWith(currentTestTask.id);
    expect(mockAddLogExecutor).toHaveBeenCalledWith(expect.objectContaining({ level: 'info', message: expect.stringContaining('Task completed successfully') }));
  });

  it('Scenario 2: should successfully execute a Serper search task', async () => {
    currentTestTask.description = "google search for current weather";
    mockChooseSearchProvider.mockResolvedValue({ provider: 'serper', reason: 'Test choice' });
    mockSerperSearch.mockResolvedValue({ searchParameters: {q: "current weather", type: "search"}, organic: [{ title: 'Weather Today', link: 'http://example.com/weather', snippet: 'Sunny...' }] });
    mockValidate.mockReturnValue({ isValid: true, critique: 'Looks good' });

    await executor.executeTask(missionId, currentTestTask);

    expect(mockSerperSearch).toHaveBeenCalledWith(expect.objectContaining({ q: 'current weather' }));
    expect(mockUpdateTask).toHaveBeenCalledWith(missionId, currentTestTask.id, expect.objectContaining({
      status: 'completed',
      result: expect.stringContaining("serper Search Results:\n1. Weather Today") // Consider toContain
    }));
  });

  it('Scenario 3: should successfully execute a non-search (simulated) task', async () => {
    currentTestTask.description = "Summarize provided documents";
    mockValidate.mockReturnValue({ isValid: true, critique: 'Simulated output looks good' });
    // Ensure handleFailedTask is not expected to be called for a successful non-search task
    // If it were called, it would use the default mock from beforeEach which is { action: 'abandon' }

    await executor.executeTask(missionId, currentTestTask);

    expect(mockChooseSearchProvider).not.toHaveBeenCalled(); // No search provider needed
    expect(mockHandleFailedTask).not.toHaveBeenCalled(); // Should not be called on success
    expect(mockUpdateTask).toHaveBeenCalledWith(missionId, currentTestTask.id, expect.objectContaining({
      status: 'completed',
      result: expect.stringContaining("Simulated success for: Summarize provided documents") // Consider toContain
    }));
  });

  it('Scenario 4: should handle poor validation after successful search, leading to abandon', async () => {
    currentTestTask.description = "search for obscure data";
    mockChooseSearchProvider.mockResolvedValue({ provider: 'tavily', reason: 'Test choice' });
    mockTavilySearch.mockResolvedValue({ query: "obscure data", results: [{ title: 'Obscure', url: 'http://example.com/obscure', content: 'Found something minimal.', score: 0.5 }] });
    mockValidate.mockReturnValue({ isValid: false, critique: 'Result too short', suggestedAction: 'refine_query' });
    mockHandleFailedTask.mockResolvedValueOnce({ action: 'abandon', reason: 'DE: Abandon due to consistently poor validation' });

    await executor.executeTask(missionId, currentTestTask);

    expect(mockValidate).toHaveBeenCalled();
    expect(mockHandleFailedTask).toHaveBeenCalledWith(expect.objectContaining({
      task: expect.objectContaining({ status: 'completed', validationOutcome: expect.objectContaining({ isValid: false }) }),
      error: expect.objectContaining({ name: 'ValidationError', message: expect.stringContaining('Validation failed: Result too short') })
    }));
    // Check the final updateTask call for 'failed' status
    expect(mockUpdateTask).toHaveBeenLastCalledWith(missionId, currentTestTask.id, expect.objectContaining({
      status: 'failed',
      failureDetails: expect.objectContaining({ reason: expect.stringContaining('Validation Failed: Result too short. Final Action: abandon - DE: Abandon due to consistently poor validation') })
    }));
     expect(mockAddLogExecutor).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', message: expect.stringContaining('failed validation and will not be retried') }));
  });

  it('Scenario 5: should handle execution error during search, retry once, then succeed', async () => {
    currentTestTask.description = "search for something needing retry";
    mockChooseSearchProvider.mockResolvedValue({ provider: 'tavily', reason: 'Test choice' });

    mockTavilySearch
      .mockRejectedValueOnce(new Error('Network Error - First Call'))
      .mockResolvedValueOnce({ query: "something needing retry", results: [{ title: 'Success on Retry', url: 'http://example.com/retry', content: 'Data found.', score: 0.9 }] });

    mockHandleFailedTask.mockResolvedValueOnce({ action: 'retry', delayMs: 1, reason: 'DE: Transient error, retry' });
    mockValidate.mockReturnValue({ isValid: true, critique: 'Good result on retry' });

    await executor.executeTask(missionId, currentTestTask);

    expect(mockTavilySearch).toHaveBeenCalledTimes(2);
    expect(mockHandleFailedTask).toHaveBeenCalledTimes(1);
    expect(mockUpdateTask).toHaveBeenCalledWith(missionId, currentTestTask.id, expect.objectContaining({ status: 'retrying', retries: 1 }));
    expect(mockUpdateTask).toHaveBeenLastCalledWith(missionId, currentTestTask.id, expect.objectContaining({ status: 'completed', result: expect.stringContaining('Success on Retry') }));
    expect(mockAddLogExecutor).toHaveBeenCalledWith(expect.objectContaining({level: 'warn', message: expect.stringContaining(`Retrying task ${currentTestTask.id} (Attempt 2 of ${DecisionEngine.MAX_TASK_RETRIES + 1})` )}));
  });

  it('Scenario 6: should handle execution error, exhaust retries, and abandon', async () => {
    currentTestTask.description = "search that always fails";
    mockChooseSearchProvider.mockResolvedValue({ provider: 'tavily', reason: 'Test choice' });
    mockTavilySearch.mockRejectedValue(new Error('Persistent API Error')); // All search attempts will fail

    // Setup mockHandleFailedTask to suggest retry for the first few, then abandon
    mockHandleFailedTask
      .mockResolvedValueOnce({ action: 'retry', delayMs: 1, reason: 'DE: Retry 1' })
      .mockResolvedValueOnce({ action: 'retry', delayMs: 1, reason: 'DE: Retry 2' })
      .mockResolvedValueOnce({ action: 'retry', delayMs: 1, reason: 'DE: Retry 3' }) // Assuming MAX_TASK_RETRIES = 3
      .mockResolvedValueOnce({ action: 'abandon', reason: 'DE: Max retries reached after final attempt' }); // This is for the failure after the last retry attempt

    await executor.executeTask(missionId, currentTestTask);

    expect(mockTavilySearch).toHaveBeenCalledTimes(DecisionEngine.MAX_TASK_RETRIES + 1); // Initial attempt + MAX_TASK_RETRIES retries
    expect(mockHandleFailedTask).toHaveBeenCalledTimes(DecisionEngine.MAX_TASK_RETRIES + 1); // Called after each of the 4 failures
    const finalRetriesCount = DecisionEngine.MAX_TASK_RETRIES;
    // The last call to updateTask should mark it as 'failed'
    expect(mockUpdateTask).toHaveBeenLastCalledWith(missionId, currentTestTask.id, expect.objectContaining({
        status: 'failed',
        retries: finalRetriesCount, // Retries counter would have been incremented up to MAX_TASK_RETRIES
        failureDetails: expect.objectContaining({ reason: 'DE: Max retries reached after final attempt' })
    }));
    expect(mockAddLogExecutor).toHaveBeenCalledWith(expect.objectContaining({level: 'error', message: expect.stringContaining(`Task ${currentTestTask.id} failed permanently after ${DecisionEngine.MAX_TASK_RETRIES} retries`)}));
  });

  it('Scenario 7: should fail task if chosen search provider is "gemini" (placeholder path)', async () => {
    currentTestTask.description = "search using gemini";
    mockChooseSearchProvider.mockResolvedValue({ provider: 'gemini', reason: 'LLM chose Gemini for complex query' });
    mockValidate.mockReturnValue({ isValid: false, critique: 'Placeholder result not useful' });
    mockHandleFailedTask.mockResolvedValueOnce({ action: 'abandon', reason: 'DE: Gemini placeholder path not useful' });


    await executor.executeTask(missionId, currentTestTask);

    expect(mockValidate).toHaveBeenCalledWith(expect.objectContaining({ task: expect.objectContaining({id: currentTestTask.id}), result: expect.stringContaining('Gemini (as Search Provider) chosen. Placeholder result:') }));
    expect(mockHandleFailedTask).toHaveBeenCalledTimes(1); // Called due to validation failure
    expect(mockUpdateTask).toHaveBeenLastCalledWith(missionId, currentTestTask.id, expect.objectContaining({
      status: 'failed',
      failureDetails: expect.objectContaining({ originalError: expect.stringContaining('Validation failed: Placeholder result not useful') })
    }));
  });

  it('Scenario 7b: should fail task if chosen search provider is "none"', async () => {
    currentTestTask.description = "search with no provider";
    mockChooseSearchProvider.mockResolvedValue({ provider: 'none', reason: 'No suitable provider' });
    mockValidate.mockReturnValue({ isValid: false, critique: 'No provider executed' });
    mockHandleFailedTask.mockResolvedValueOnce({ action: 'abandon', reason: 'DE: No provider was chosen' });


    await executor.executeTask(missionId, currentTestTask);

    expect(mockValidate).toHaveBeenCalledWith(expect.objectContaining({task: expect.objectContaining({id: currentTestTask.id}), result: expect.stringContaining('No suitable search provider action taken')}));
    expect(mockHandleFailedTask).toHaveBeenCalledTimes(1); // Called due to validation failure
    expect(mockUpdateTask).toHaveBeenLastCalledWith(missionId, currentTestTask.id, expect.objectContaining({
      status: 'failed',
      failureDetails: expect.objectContaining({ originalError: expect.stringContaining('Validation failed: No provider executed') })
    }));
  });
});
