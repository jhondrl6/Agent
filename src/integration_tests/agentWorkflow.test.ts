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

// Use the global mock for TavilyClient from jest.setup.js
import { mockTavilySearchGlobal, clearMockTavilySearchGlobal } from '../../jest.setup'; // Adjust path if needed
const mockTavilySearch = mockTavilySearchGlobal;
const MockedTavilyClient = TavilyClient as jest.MockedClass<typeof TavilyClient>; // For type assistance if still needed

jest.mock('@/lib/search/SerperClient');
const MockedSerperClient = SerperClient as jest.MockedClass<typeof SerperClient>;
let mockSerperSearch: jest.Mock<Promise<SerperSearchResponse>, [SerperSearchParams]>;

// --- Store Management ---
// Mock the entire store state including functions for each test
const mockStoreLogs: LogLevel[] = [];
const mockAddLogFnIntegration = jest.fn((logEntry: LogLevel) => {
  mockStoreLogs.push(logEntry);
});

// Helper to get a fresh addLog function that uses the current state of the store
// This will now consistently get the mockAddLogFnIntegration from the mocked store state
const getAddLogFunc = () => useAgentStore.getState().addLog;

describe('Agent Workflow Integration Tests', () => {

  beforeEach(() => {
    // Clear collected logs and mock function calls
    mockStoreLogs.length = 0;
    mockAddLogFnIntegration.mockClear();

    // Define a fresh initial state for the store for each test
    const initialMissionState: Mission = {
        id: 'mission-integ-test',
        goal: 'Initial Goal',
        tasks: [],
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const initialAgentState = {
        currentMissionId: null,
        isLoading: false,
        error: null,
        activeTasks: [],
    };

    useAgentStore.setState({
      missions: { [initialMissionState.id]: initialMissionState },
      agentState: initialAgentState,
      logs: mockStoreLogs, // Use our array to track logs
      addLog: mockAddLogFnIntegration, // Use our dedicated mock function
      createMission: jest.fn((mission: Mission) => {
        useAgentStore.setState((prev) => ({
          ...prev,
          missions: { ...prev.missions, [mission.id]: mission },
          agentState: { ...prev.agentState, currentMissionId: mission.id }
        }));
      }),
      updateTask: jest.fn((missionId: string, taskId: string, updates: Partial<Task>) => {
        useAgentStore.setState((prev) => {
          const mission = prev.missions[missionId];
          if (mission) {
            const taskIndex = mission.tasks.findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
              const newTasks = [...mission.tasks];
              newTasks[taskIndex] = { ...newTasks[taskIndex], ...updates, updatedAt: new Date() };
              return {
                ...prev,
                missions: { ...prev.missions, [missionId]: { ...mission, tasks: newTasks, updatedAt: new Date() } },
              };
            }
          }
          return prev;
        });
      }),
      setMissionStatus: jest.fn((missionId: string, status: Mission['status']) => {
         useAgentStore.setState(prev => {
            const mission = prev.missions[missionId];
            if (mission) {
                return {...prev, missions: {...prev.missions, [missionId]: {...mission, status, updatedAt: new Date() }}};
            }
            return prev;
         });
      }),
      addTaskToActive: jest.fn((taskId) => useAgentStore.setState(prev => ({...prev, agentState: {...prev.agentState, activeTasks: [...prev.agentState.activeTasks, taskId]}}))),
      removeTaskFromActive: jest.fn((taskId) => useAgentStore.setState(prev => ({...prev, agentState: {...prev.agentState, activeTasks: prev.agentState.activeTasks.filter(id => id !== taskId)}}))),
      setAgentError: jest.fn((error) => useAgentStore.setState(prev => ({...prev, agentState: {...prev.agentState, error }}))),

    }, true); // `true` replaces the entire state

    // Reset mocks and setup default implementations for external clients
    mockGeminiGenerate = jest.fn();
    MockedGeminiClient.mockImplementation(() => ({
        generate: mockGeminiGenerate,
        // Add any other methods of GeminiClient that might be called, if necessary
    } as any));

    // Reset Tavily mock for each test
    clearMockTavilySearchGlobal();
    // mockTavilySearch.mockClear(); // Done by clearMockTavilySearchGlobal

    mockSerperSearch = jest.fn();
    MockedSerperClient.mockImplementation(() => ({
        search: mockSerperSearch,
    }as any));

    // DecisionEngine and ResultValidator will use their actual implementations.
    // To ensure DecisionEngine runs in rule-based mode for tests not specifically testing its LLM path,
    // we need to control its access to process.env.GEMINI_API_KEY when TaskExecutor instantiates it.
  });

  afterEach(() => {
    jest.clearAllMocks(); // Clears all mocks, including our store function mocks like mockAddLogFnIntegration
  });

  // Placeholder for test cases
  it('should have store reset with functional addLog (setup test)', () => {
    const currentLogs = useAgentStore.getState().logs;
    expect(currentLogs).toEqual(mockStoreLogs); // Should be the same array instance initially
    expect(currentLogs).toHaveLength(0);

    const addLog = getAddLogFunc(); // This should get mockAddLogFnIntegration
    expect(addLog).toBe(mockAddLogFnIntegration); // Ensure it's the correct mock function

    addLog({level: 'info', message: 'Test log during setup test'} as LogLevel);
    expect(mockStoreLogs).toHaveLength(1); // Check our manually tracked array
    expect(mockStoreLogs[0].message).toBe('Test log during setup test');

    // Also check the store's logs if it's being updated by the mock correctly
    expect(useAgentStore.getState().logs).toHaveLength(1);
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

    const logs = useAgentStore.getState().logs; // This now correctly refers to mockStoreLogs
    expect(logs.some(log => log.message.includes(`[TD] Mission mission-integ-1 decomposed into 1 tasks.`))).toBe(true);
    // Make the below assertion more flexible to check for key parts
    expect(logs.some(log => log.message.includes(`[TE] Task ${taskToExecute.id}`) && log.message.includes('using \'tavily\'') && log.message.includes('AI in healthcare'))).toBe(true);
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
