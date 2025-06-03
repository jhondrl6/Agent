// src/integration_tests/agentWorkflow.test.ts
import { useAgentStore } from '@/lib/agent/StateManager';
import { TaskDecomposer } from '@/lib/agent/TaskDecomposer';
import { DecisionEngine } from '@/lib/agent/DecisionEngine';
import { TaskExecutor } from '@/lib/agent/TaskExecutor';
import { ResultValidator } from '@/lib/search/ResultValidator';
import { GeminiClient, GeminiRequestParams, GeminiResponse } from '@/lib/search/GeminiClient';
import { TavilyClient, TavilySearchParams, TavilySearchResponse } from '@/lib/search/TavilyClient';
import { SerperClient, SerperSearchParams, SerperSearchResponse } from '@/lib/search/SerperClient';
import { Mission, Task, LogLevel } from '@/lib/types/agent';

// --- Mock External Clients ---
jest.mock('@/lib/search/GeminiClient');
const MockedGeminiClient = GeminiClient as jest.MockedClass<typeof GeminiClient>;
let mockGeminiGenerate: jest.Mock<Promise<GeminiResponse>, [GeminiRequestParams]>;

jest.mock('@/lib/search/TavilyClient');
const MockedTavilyClient = TavilyClient as jest.MockedClass<typeof TavilyClient>;
let mockTavilySearch: jest.Mock<Promise<TavilySearchResponse>, [TavilySearchParams]>;

jest.mock('@/lib/search/SerperClient');
const MockedSerperClient = SerperClient as jest.MockedClass<typeof SerperClient>;
let mockSerperSearch: jest.Mock<Promise<SerperSearchResponse>, [SerperSearchParams]>;

// --- Store Management ---
let initialStoreStateJson: string; // Store the stringified initial state

// Helper to get a fresh addLog function that uses the current state of the store
const getAddLogFunc = () => useAgentStore.getState().addLog;

describe('Agent Workflow Integration Tests', () => {

  beforeAll(() => {
    // Capture the initial state of the store once by serializing it
    initialStoreStateJson = JSON.stringify(useAgentStore.getState());
  });

  beforeEach(() => {
    // Reset the store to its initial state before each test
    useAgentStore.setState(JSON.parse(initialStoreStateJson), true);

    // Reset mocks and setup default implementations for external clients
    mockGeminiGenerate = jest.fn();
    MockedGeminiClient.mockImplementation(() => ({
        generate: mockGeminiGenerate,
        // Add any other methods of GeminiClient that might be called, if necessary
    } as any));


    mockTavilySearch = jest.fn();
    MockedTavilyClient.mockImplementation(() => ({
        search: mockTavilySearch,
    } as any));

    mockSerperSearch = jest.fn();
    MockedSerperClient.mockImplementation(() => ({
        search: mockSerperSearch,
    }as any));

    // DecisionEngine and ResultValidator will use their actual implementations.
    // To ensure DecisionEngine runs in rule-based mode for tests not specifically testing its LLM path,
    // we need to control its access to process.env.GEMINI_API_KEY when TaskExecutor instantiates it.
    // For now, tests will proceed assuming it might try to use LLM if key is in environment,
    // or specific tests can mock process.env for DecisionEngine's rule-based paths.
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Placeholder for test cases
  it('should have mocks and store reset correctly (setup test)', () => {
    const parsedInitialState = JSON.parse(initialStoreStateJson);
    const initialLogsLength = parsedInitialState.logs?.length || 0;
    // Verify that after beforeEach reset, logs are at initial captured length
    expect(useAgentStore.getState().logs).toHaveLength(initialLogsLength);

    const addLog = getAddLogFunc();
    addLog({level: 'info', message: 'Test log during setup test'});
    expect(useAgentStore.getState().logs).toHaveLength(initialLogsLength + 1);

    // Simulate reset again to double-check
    useAgentStore.setState(JSON.parse(initialStoreStateJson), true);
    expect(useAgentStore.getState().logs).toHaveLength(initialLogsLength);
  });

  it('Scenario 1: should successfully create a mission, decompose, execute one search task, and complete', async () => {
    // --- Test-Specific Mock Configuration ---

    // 1. TaskDecomposer (GeminiClient mock for decomposition)
    const decompositionResponse: GeminiResponse = {
      candidates: [{ content: { parts: [{ text: JSON.stringify([{ description: "search for AI in healthcare" }]) }] } }],
    };
    mockGeminiGenerate.mockResolvedValueOnce(decompositionResponse);

    // 2. DecisionEngine will be rule-based due to process.env mock below.
    // Rule-based DE should choose 'tavily' for "search for AI in healthcare"

    // 3. TavilyClient (mock for search execution)
    const tavilySearchResponse: TavilySearchResponse = {
      query: "AI in healthcare",
      results: [{ title: "AI in HC Study", url: "http://example.com/study", content: "AI is revolutionizing healthcare...", score: 0.9 }],
    };
    mockTavilySearch.mockResolvedValueOnce(tavilySearchResponse);

    // 4. ResultValidator will use its real implementation.

    // --- Setup & Mock process.env for DecisionEngine in TaskExecutor ---
    const originalEnv = { ...process.env }; // Shallow copy original env
    // Modify process.env for the scope of this test
    process.env.GEMINI_API_KEY = undefined;


    // --- Agent Workflow ---

    // 1. Create Mission (simulating parts of mission/route.ts)
    const missionGoal = "Understand AI impact on healthcare";
    const addLog = getAddLogFunc();

    const decomposer = new TaskDecomposer('dummy-gemini-key-for-decomposer', addLog);
    const decomposedTasksArray = await decomposer.decomposeMission({
      id: 'mission-integ-1',
      goal: missionGoal,
      tasks: [],
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(decomposedTasksArray).toHaveLength(1);
    expect(decomposedTasksArray[0].description).toBe("search for AI in healthcare");

    const newMission: Mission = {
      id: 'mission-integ-1',
      goal: missionGoal,
      tasks: decomposedTasksArray,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    useAgentStore.getState().createMission(newMission);

    let missionState = useAgentStore.getState().missions['mission-integ-1'];
    expect(missionState).toBeDefined();
    expect(missionState.tasks).toHaveLength(1);
    const taskToExecute = missionState.tasks[0];
    expect(taskToExecute.status).toBe('pending');

    // 2. Execute Task
    const executor = new TaskExecutor(addLog);
    await executor.executeTask(missionState.id, taskToExecute);

    // --- Assertions ---
    missionState = useAgentStore.getState().missions['mission-integ-1'];
    const executedTask = missionState.tasks.find(t => t.id === taskToExecute.id);

    expect(executedTask).toBeDefined();
    expect(executedTask?.status).toBe('completed');
    expect(executedTask?.result).toContain("tavily Search Results"); // DecisionEngine rule-based default
    expect(executedTask?.result).toContain("AI in HC Study");
    expect(executedTask?.validationOutcome?.isValid).toBe(true);
    expect(mockTavilySearch).toHaveBeenCalledWith(expect.objectContaining({ query: "AI in healthcare" }));

    const logs = useAgentStore.getState().logs;
    expect(logs.some(log => log.message.includes(`[TD] Mission mission-integ-1 decomposed into 1 tasks.`))).toBe(true);
    expect(logs.some(log => log.message.includes(`[TE] Task ${taskToExecute.id} using 'tavily' for query: AI in healthcare`))).toBe(true);
    expect(logs.some(log => log.message.includes(`[TE] Task ${taskToExecute.id} completed successfully.`))).toBe(true);

    // Restore original process.env
    process.env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY; // Restore specifically
  });

  it('Scenario 2: should handle a task with an execution error, retry, and then succeed', async () => {
    // --- Test-Specific Mock Configuration ---

    // 1. TaskDecomposer (GeminiClient mock for decomposition)
    const decompositionResponse: GeminiResponse = {
      candidates: [{ content: { parts: [{ text: JSON.stringify([{ description: "search for data that fails then succeeds" }]) }] } }],
    };
    mockGeminiGenerate.mockResolvedValueOnce(decompositionResponse);

    // 2. DecisionEngine will be rule-based.

    // 3. TavilyClient (mock for search execution)
    const transientError = new Error("Network Error - First Attempt");
    const successfulTavilyResponse: TavilySearchResponse = {
      query: "data that fails then succeeds",
      results: [{ title: "Success on Retry", url: "http://example.com/success", content: "Data found after initial failure.", score: 0.9 }],
    };
    mockTavilySearch
      .mockRejectedValueOnce(transientError)      // First call fails
      .mockResolvedValueOnce(successfulTavilyResponse); // Second call succeeds

    // --- Setup & Mock process.env for DecisionEngine in TaskExecutor ---
    const originalEnv = { ...process.env };
    process.env.GEMINI_API_KEY = undefined; // Ensure DecisionEngine in TaskExecutor is rule-based

    // --- Agent Workflow ---
    const missionGoal = "Test retry mechanism";
    const addLog = getAddLogFunc();

    const decomposer = new TaskDecomposer('dummy-gemini-key-for-decomposer', addLog);
    const decomposedTasksArray = await decomposer.decomposeMission({
      id: 'mission-integ-retry',
      goal: missionGoal,
      tasks: [], status: 'pending', createdAt: new Date(), updatedAt: new Date(),
    });

    const newMission: Mission = {
      id: 'mission-integ-retry',
      goal: missionGoal,
      tasks: decomposedTasksArray,
      status: 'pending', createdAt: new Date(), updatedAt: new Date(),
    };
    useAgentStore.getState().createMission(newMission);

    let missionState = useAgentStore.getState().missions['mission-integ-retry'];
    const taskToExecute = missionState.tasks[0];

    // Execute Task
    const executor = new TaskExecutor(addLog);
    await executor.executeTask(missionState.id, taskToExecute);

    // --- Assertions ---
    missionState = useAgentStore.getState().missions['mission-integ-retry'];
    const executedTask = missionState.tasks.find(t => t.id === taskToExecute.id);

    expect(executedTask).toBeDefined();
    expect(mockTavilySearch).toHaveBeenCalledTimes(2);

    const logs = useAgentStore.getState().logs;
    expect(logs.some(log => log.level === 'warn' && log.message.includes('[TE] Retrying task'))).toBe(true);
    // Check if DecisionEngine suggested retry for the specific task. The log for DE is made by DE itself.
    // We check if it was logged, indicating DE was called.
    expect(logs.some(log => log.message.includes(`[DE] DecisionEngine suggestion for task ${taskToExecute.id} (execution error): retry`))).toBe(true);

    expect(executedTask?.status).toBe('completed');
    expect(executedTask?.retries).toBe(1);
    expect(executedTask?.failureDetails).toBeDefined();
    expect(executedTask?.failureDetails?.originalError).toBe(transientError.message);
    expect(executedTask?.result).toContain("tavily Search Results"); // DE rule-based default is tavily
    expect(executedTask?.result).toContain("Success on Retry");
    expect(executedTask?.validationOutcome?.isValid).toBe(true);

    expect(logs.some(log => log.message.includes(`[TE] Task ${taskToExecute.id} completed successfully.`))).toBe(true);

    // Restore original process.env
    process.env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY;
  });
});
