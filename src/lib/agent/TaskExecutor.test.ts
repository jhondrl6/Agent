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


// Mock Search Clients
jest.mock('@/lib/search/TavilyClient');
const MockedTavilyClient = TavilyClient as jest.MockedClass<typeof TavilyClient>;
let mockTavilySearch: jest.Mock<Promise<TavilySearchResponse>, [TavilySearchParams]>;

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
  let executor: TaskExecutor;
  let currentTestTask: Task;
  const missionId = 'test-mission-1';

  beforeEach(() => {
    mockUpdateTask.mockClear();
    mockSetAgentError.mockClear();
    mockAddTaskToActive.mockClear();
    mockRemoveTaskFromActive.mockClear();
    mockAddLogExecutor.mockClear();
    mockAddLogGlobal.mockClear();

    MockedDecisionEngine.mockClear();
    MockedTavilyClient.mockClear();
    MockedSerperClient.mockClear();
    MockedResultValidator.mockClear();

    mockChooseSearchProvider = jest.fn();
    MockedDecisionEngine.prototype.chooseSearchProvider = mockChooseSearchProvider;

    mockHandleFailedTask = jest.fn();
    MockedDecisionEngine.prototype.handleFailedTask = mockHandleFailedTask;

    mockTavilySearch = jest.fn();
    MockedTavilyClient.prototype.search = mockTavilySearch;

    mockSerperSearch = jest.fn();
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
    executor = new TaskExecutor(mockAddLogExecutor);
  });

  it('Scenario 1: should successfully execute a Tavily search task', async () => {
    currentTestTask.description = "search for AI impact on jobs";
    mockChooseSearchProvider.mockResolvedValue({ provider: 'tavily', reason: 'Test choice' });
    mockTavilySearch.mockResolvedValue({ query: "AI impact on jobs", results: [{ title: 'AI Impact', url: 'http://example.com/ai', content: 'Significant impact...', score: 0.9 }] });
    mockValidate.mockReturnValue({ isValid: true, critique: 'Looks good', qualityScore: 0.8, suggestedAction: 'accept' });

    await executor.executeTask(missionId, currentTestTask);

    expect(mockAddTaskToActive).toHaveBeenCalledWith(currentTestTask.id);
    expect(mockUpdateTask).toHaveBeenCalledWith(missionId, currentTestTask.id, expect.objectContaining({ status: 'in-progress' }));
    expect(mockChooseSearchProvider).toHaveBeenCalled();
    expect(mockTavilySearch).toHaveBeenCalledWith(expect.objectContaining({ query: 'AI impact on jobs' }));
    expect(mockValidate).toHaveBeenCalledWith({ task: currentTestTask, result: expect.stringContaining("AI Impact") });
    expect(mockUpdateTask).toHaveBeenCalledWith(missionId, currentTestTask.id, expect.objectContaining({
      status: 'completed',
      result: expect.stringContaining("tavily Search Results:\n1. AI Impact"),
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
      result: expect.stringContaining("serper Search Results:\n1. Weather Today")
    }));
  });

  it('Scenario 3: should successfully execute a non-search (simulated) task', async () => {
    currentTestTask.description = "Summarize provided documents";
    mockValidate.mockReturnValue({ isValid: true, critique: 'Simulated output looks good' });

    await executor.executeTask(missionId, currentTestTask);

    expect(mockChooseSearchProvider).not.toHaveBeenCalled();
    expect(mockUpdateTask).toHaveBeenCalledWith(missionId, currentTestTask.id, expect.objectContaining({
      status: 'completed',
      result: expect.stringContaining("Simulated success for: Summarize provided documents")
    }));
  });

  it('Scenario 4: should handle poor validation after successful search, leading to abandon', async () => {
    currentTestTask.description = "search for obscure data";
    mockChooseSearchProvider.mockResolvedValue({ provider: 'tavily', reason: 'Test choice' });
    mockTavilySearch.mockResolvedValue({ query: "obscure data", results: [{ title: 'Obscure', url: 'http://example.com/obscure', content: 'Found something minimal.', score: 0.5 }] });
    mockValidate.mockReturnValue({ isValid: false, critique: 'Result too short', suggestedAction: 'refine_query' });
    // Forcing DecisionEngine to suggest abandon for this validation failure
    mockHandleFailedTask.mockResolvedValue({ action: 'abandon', reason: 'DE: Abandon due to consistently poor validation' });

    await executor.executeTask(missionId, currentTestTask);

    expect(mockValidate).toHaveBeenCalled();
    expect(mockHandleFailedTask).toHaveBeenCalledWith(expect.objectContaining({
      // Task state passed to DE should reflect it 'completed' execution phase but failed validation
      task: expect.objectContaining({ status: 'completed', validationOutcome: expect.objectContaining({ isValid: false }) }),
      error: expect.objectContaining({ name: 'ValidationError', message: expect.stringContaining('Validation failed: Result too short') })
    }));
    expect(mockUpdateTask).toHaveBeenCalledWith(missionId, currentTestTask.id, expect.objectContaining({
      status: 'failed',
      failureDetails: expect.objectContaining({ reason: expect.stringContaining('Validation Failed: Result too short. DE: Abandon due to consistently poor validation') })
    }));
     expect(mockAddLogExecutor).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', message: expect.stringContaining('failed validation and will not be retried') }));
  });

  it('Scenario 5: should handle execution error during search, retry once, then succeed', async () => {
    currentTestTask.description = "search for something needing retry";
    mockChooseSearchProvider.mockResolvedValue({ provider: 'tavily', reason: 'Test choice' });

    mockTavilySearch
      .mockRejectedValueOnce(new Error('Network Error - First Call'))
      .mockResolvedValueOnce({ query: "something needing retry", results: [{ title: 'Success on Retry', url: 'http://example.com/retry', content: 'Data found.', score: 0.9 }] });

    mockHandleFailedTask.mockResolvedValueOnce({ action: 'retry', delayMs: 1, reason: 'DE: Transient error, retry' }); // Note: delayMs 1ms for fast tests
    mockValidate.mockReturnValue({ isValid: true, critique: 'Good result on retry' });

    await executor.executeTask(missionId, currentTestTask);

    expect(mockTavilySearch).toHaveBeenCalledTimes(2);
    expect(mockHandleFailedTask).toHaveBeenCalledTimes(1);
    expect(mockUpdateTask).toHaveBeenCalledWith(missionId, currentTestTask.id, expect.objectContaining({ status: 'retrying', retries: 1 }));
    expect(mockUpdateTask).toHaveBeenCalledWith(missionId, currentTestTask.id, expect.objectContaining({ status: 'completed', result: expect.stringContaining('Success on Retry') }));
    expect(mockAddLogExecutor).toHaveBeenCalledWith(expect.objectContaining({level: 'warn', message: expect.stringContaining(`Retrying task ${currentTestTask.id} (Attempt 2 of ${DecisionEngine.MAX_TASK_RETRIES + 1})` )}));
  });

  it('Scenario 6: should handle execution error, exhaust retries, and abandon', async () => {
    currentTestTask.description = "search that always fails";
    mockChooseSearchProvider.mockResolvedValue({ provider: 'tavily', reason: 'Test choice' });
    mockTavilySearch.mockRejectedValue(new Error('Persistent API Error'));

    mockHandleFailedTask
      .mockResolvedValueOnce({ action: 'retry', delayMs: 1, reason: 'DE: Retry 1' })
      .mockResolvedValueOnce({ action: 'retry', delayMs: 1, reason: 'DE: Retry 2' })
      .mockResolvedValueOnce({ action: 'retry', delayMs: 1, reason: 'DE: Retry 3' })
      .mockResolvedValueOnce({ action: 'abandon', reason: 'DE: Max retries reached' });

    await executor.executeTask(missionId, currentTestTask);

    expect(mockTavilySearch).toHaveBeenCalledTimes(DecisionEngine.MAX_TASK_RETRIES + 1);
    expect(mockHandleFailedTask).toHaveBeenCalledTimes(DecisionEngine.MAX_TASK_RETRIES + 1);
    const finalRetriesCount = DecisionEngine.MAX_TASK_RETRIES; // Retries are 0, 1, 2, then 3 (final attempt)
    expect(mockUpdateTask).toHaveBeenCalledWith(missionId, currentTestTask.id, expect.objectContaining({ status: 'failed', retries: finalRetriesCount }));
    expect(mockUpdateTask).toHaveBeenCalledWith(missionId, currentTestTask.id, expect.objectContaining({failureDetails: expect.objectContaining({reason: 'DE: Max retries reached'})}));
    expect(mockAddLogExecutor).toHaveBeenCalledWith(expect.objectContaining({level: 'error', message: expect.stringContaining(`Task ${currentTestTask.id} failed permanently after ${DecisionEngine.MAX_TASK_RETRIES} retries`)}));
  });

  it('Scenario 7: should fail task if chosen search provider is "gemini" (placeholder path)', async () => {
    currentTestTask.description = "search using gemini";
    mockChooseSearchProvider.mockResolvedValue({ provider: 'gemini', reason: 'LLM chose Gemini for complex query' });
    // No mock for GeminiClient.search needed as it's a placeholder path in TaskExecutor
    mockValidate.mockReturnValue({ isValid: false, critique: 'Placeholder result not useful' }); // Assume validation fails for placeholder
    mockHandleFailedTask.mockResolvedValue({ action: 'abandon', reason: 'DE: Gemini placeholder path not useful' });


    await executor.executeTask(missionId, currentTestTask);

    // It will go through validation, validation will fail, then DE will suggest abandon
    expect(mockValidate).toHaveBeenCalledWith(expect.objectContaining({ task: currentTestTask, result: expect.stringContaining('Gemini (as Search Provider) chosen. Placeholder result:') }));
    expect(mockHandleFailedTask).toHaveBeenCalled();
    expect(mockUpdateTask).toHaveBeenCalledWith(missionId, currentTestTask.id, expect.objectContaining({
      status: 'failed',
      failureDetails: expect.objectContaining({ originalError: expect.stringContaining('Validation failed: Placeholder result not useful') })
    }));
  });

  it('Scenario 7b: should fail task if chosen search provider is "none"', async () => {
    currentTestTask.description = "search with no provider";
    mockChooseSearchProvider.mockResolvedValue({ provider: 'none', reason: 'No suitable provider' });
    mockValidate.mockReturnValue({ isValid: false, critique: 'No provider executed' }); // Assume validation fails
    mockHandleFailedTask.mockResolvedValue({ action: 'abandon', reason: 'DE: No provider was chosen' });


    await executor.executeTask(missionId, currentTestTask);

    expect(mockValidate).toHaveBeenCalledWith(expect.objectContaining({task: currentTestTask, result: expect.stringContaining('No suitable search provider action taken')}));
    expect(mockHandleFailedTask).toHaveBeenCalled();
    expect(mockUpdateTask).toHaveBeenCalledWith(missionId, currentTestTask.id, expect.objectContaining({
      status: 'failed',
      failureDetails: expect.objectContaining({ originalError: expect.stringContaining('Validation failed: No provider executed') })
    }));
  });
});
