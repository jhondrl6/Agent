// src/integration_tests/agentWorkflow.test.ts
import { useAgentStore } from '@/lib/agent/StateManager';
import { TaskDecomposer } from '@/lib/agent/TaskDecomposer';
import { DecisionEngine } from '@/lib/agent/DecisionEngine';
import { TaskExecutor } from '@/lib/agent/TaskExecutor';
import { ResultValidator } from '@/lib/search/ResultValidator';
import { GeminiClient, GeminiRequestParams, GeminiResponse } from '@/lib/search/GeminiClient';
import { TavilyClient, TavilySearchParams, TavilySearchResponse } from '@/lib/search/TavilyClient';
import { SerperClient, SerperSearchParams, SerperSearchResponse } from '@/lib/search/SerperClient';
import { Mission, Task, LogLevel, LogEntry } from '@/lib/types/agent'; // Added LogEntry

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
const mockStoreLogs: LogEntry[] = []; // Changed to LogEntry[]
const mockAddLogFnIntegration = jest.fn((logEntry: LogEntry) => { // Changed to LogEntry
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
        const missionWithTimestamps = {
          ...mission,
          createdAt: mission.createdAt || new Date(),
          updatedAt: new Date(),
          tasks: mission.tasks ? mission.tasks.map(t => ({ ...t, createdAt: t.createdAt || new Date(), updatedAt: new Date() })) : [],
        };
        useAgentStore.setState((prev) => ({
          ...prev,
          missions: { ...prev.missions, [mission.id]: missionWithTimestamps },
          agentState: { ...prev.agentState, currentMissionId: mission.id, isLoading: false, error: undefined }
        }));
        // Simulate log entry that might be created by a route handler or service
        mockAddLogFnIntegration({ level: 'info', message: `Mission ${mission.id} created with goal: ${mission.goal}`, id: `${Date.now()}-log`, timestamp: new Date() });
      }),
      // Added addTasks mock
      addTasks: jest.fn((missionId: string, tasks: Task[]) => {
        useAgentStore.setState(prev => {
          const mission = prev.missions[missionId];
          if (mission) {
            const tasksWithTimestamps = tasks.map(task => ({
                ...task,
                createdAt: task.createdAt || new Date(),
                updatedAt: new Date(),
            }));
            const updatedMission = {
              ...mission,
              tasks: [...(mission.tasks || []), ...tasksWithTimestamps],
              updatedAt: new Date(),
            };
            // Simulate log entry
            mockAddLogFnIntegration({ level: 'info', message: `Tasks added to mission ${missionId}. Count: ${tasks.length}`, id: `${Date.now()}-log`, timestamp: new Date() });
            return {
                ...prev,
                missions: { ...prev.missions, [missionId]: updatedMission },
            };
          }
          return prev;
        });
      }),
      updateTask: jest.fn((missionId: string, taskId: string, updates: Partial<Task>) => {
        useAgentStore.setState((prev) => {
          const mission = prev.missions[missionId];
          if (mission && mission.tasks) {
            const taskIndex = mission.tasks.findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
              const newTasks = [...mission.tasks];
              newTasks[taskIndex] = { ...newTasks[taskIndex], ...updates, updatedAt: new Date() };
              const updatedMission = { ...mission, tasks: newTasks, updatedAt: new Date() };

              // Simulate log for task status update
              if(updates.status) {
                mockAddLogFnIntegration({ level: 'info', message: `Task ${taskId} status updated to ${updates.status}`, id: `${Date.now()}-log`, timestamp: new Date() });
              }
              return {
                ...prev,
                missions: { ...prev.missions, [missionId]: updatedMission },
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
                // Simulate log for mission status update
                mockAddLogFnIntegration({ level: 'info', message: `Mission ${missionId} status updated to ${status}`, id: `${Date.now()}-log`, timestamp: new Date() });
                return {...prev, missions: {...prev.missions, [missionId]: {...mission, status, updatedAt: new Date() }}};
            }
            return prev;
         });
      }),
      addTaskToActive: jest.fn((taskId) => useAgentStore.setState(prev => ({...prev, agentState: {...prev.agentState, isLoading: true, activeTasks: [...prev.agentState.activeTasks, taskId]}}))),
      removeTaskFromActive: jest.fn((taskId) => useAgentStore.setState(prev => {
        const newActiveTasks = prev.agentState.activeTasks.filter(id => id !== taskId);
        return ({...prev, agentState: {...prev.agentState, activeTasks: newActiveTasks, isLoading: newActiveTasks.length > 0 }});
      })),
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

    addLog({level: 'info', message: 'Test log during setup test', id: 'setup-log-1', timestamp: new Date()} as LogEntry); // Cast to LogEntry and add id/timestamp
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
    // expect(logs.some(log => log.message.includes(`[DE] DecisionEngine suggestion for task ${taskToExecute.id} (execution error): retry`))).toBe(true);
    // Corrected based on actual log output from previous test run. This specific log is not being captured by mockAddLogFnIntegration,
    // likely due to how DecisionEngine handles logging internally (possibly not using the passed addLog instance for all its logs).
    // Other logs from TaskExecutor are captured, indicating the general mechanism is working.
    expect(logs.some(log => log.message.includes(`[DecisionEngine]: Rule-based decision for task ${taskToExecute.id} (execution error): retry`))).toBe(true);

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

  it('Scenario 3: should run a full mission lifecycle from creation to completion simulating UI interactions', async () => {
    const missionId = 'mission-lifecycle-test-1';
    const missionGoal = "Research and summarize the impact of quantum computing on cryptography.";

    // --- Mock Store Actions (spies to check calls) ---
    // Most store actions are already mocked in beforeEach to update state.
    // We can spy on them if we need to assert they were called with specific params.
    const createMissionSpy = jest.spyOn(useAgentStore.getState(), 'createMission');
    const addTasksSpy = jest.spyOn(useAgentStore.getState(), 'addTasks');
    const updateTaskSpy = jest.spyOn(useAgentStore.getState(), 'updateTask');
    const addTaskToActiveSpy = jest.spyOn(useAgentStore.getState(), 'addTaskToActive');
    const removeTaskFromActiveSpy = jest.spyOn(useAgentStore.getState(), 'removeTaskFromActive');
    const setMissionStatusSpy = jest.spyOn(useAgentStore.getState(), 'setMissionStatus');


    // --- 1. Mission Creation ---
    const newMissionDraft: Mission = {
      id: missionId,
      goal: missionGoal,
      tasks: [],
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    useAgentStore.getState().createMission(newMissionDraft);

    expect(createMissionSpy).toHaveBeenCalledWith(newMissionDraft);
    let missionState = useAgentStore.getState().missions[missionId];
    expect(missionState).toBeDefined();
    expect(missionState.goal).toBe(missionGoal);
    expect(missionState.status).toBe('pending');
    expect(useAgentStore.getState().agentState.currentMissionId).toBe(missionId);
    // Log assertion for createMission is now implicitly handled by the mock in beforeEach
    expect(mockAddLogFnIntegration).toHaveBeenCalledWith(expect.objectContaining({ message: `Mission ${missionId} created with goal: ${missionGoal}` }));

    // --- 2. Task Decomposition (Simulated) ---
    // Normally, an agent process would decompose. Here, we simulate adding tasks post-decomposition.
    const decomposedTasks: Task[] = [
      { id: 'task-1-search', missionId, description: "Search for impact of quantum computing on current encryption methods", tool: 'tavily', status: 'pending', createdAt: new Date(), updatedAt: new Date(), retries:0,  toolParameters: { query: "impact of quantum computing on cryptography" } },
      { id: 'task-2-summarize', missionId, description: "Summarize the findings from the search", tool: 'gemini', status: 'pending', createdAt: new Date(), updatedAt: new Date(), retries:0, toolParameters: { prompt: "Summarize the following text: {search_task_1_result}" } },
    ];
    useAgentStore.getState().addTasks(missionId, decomposedTasks);
    // Update mission status to in_progress as tasks are added (common pattern)
    useAgentStore.getState().setMissionStatus(missionId, 'in_progress');


    expect(addTasksSpy).toHaveBeenCalledWith(missionId, decomposedTasks);
    missionState = useAgentStore.getState().missions[missionId];
    expect(missionState.tasks).toHaveLength(2);
    expect(missionState.tasks[0].description).toBe(decomposedTasks[0].description);
    expect(missionState.status).toBe('in_progress');
    // Log assertion for addTasks is now implicitly handled by the mock in beforeEach
    expect(mockAddLogFnIntegration).toHaveBeenCalledWith(expect.objectContaining({ message: `Tasks added to mission ${missionId}. Count: ${decomposedTasks.length}` }));
    // Log for setMissionStatus 'in_progress' also implicitly handled by its mock
    expect(setMissionStatusSpy).toHaveBeenCalledWith(missionId, 'in_progress');
    expect(mockAddLogFnIntegration).toHaveBeenCalledWith(expect.objectContaining({ message: `Mission ${missionId} status updated to in_progress` }));


    // --- 3. Task Execution ---
    // ** Task 1: Search **
    const task1 = missionState.tasks[0];
    useAgentStore.getState().addTaskToActive(task1.id);
    expect(addTaskToActiveSpy).toHaveBeenCalledWith(task1.id);
    expect(useAgentStore.getState().agentState.activeTasks).toContain(task1.id);
    expect(useAgentStore.getState().agentState.isLoading).toBe(true);

    useAgentStore.getState().updateTask(missionId, task1.id, { status: 'in_progress' });
    expect(updateTaskSpy).toHaveBeenCalledWith(missionId, task1.id, { status: 'in_progress' });
    expect(useAgentStore.getState().missions[missionId].tasks[0].status).toBe('in_progress');
    // Log for updateTask to 'in_progress' is implicitly handled by its mock
    expect(mockAddLogFnIntegration).toHaveBeenCalledWith(expect.objectContaining({ message: `Task ${task1.id} status updated to in_progress` }));

    // Simulate Tavily search
    const tavilySearchResponse: TavilySearchResponse = {
      query: task1.toolParameters.query as string,
      results: [{ title: "Quantum Impact Study", url: "http://example.com/quantum-study", content: "Quantum computers will break RSA.", score: 0.95 }],
    };
    mockTavilySearch.mockResolvedValueOnce(tavilySearchResponse); // From existing setup

    // Simulate task completion by an executor (which would call updateTask)
    const task1Result = `Tavily Search Results:\n[1] Quantum Impact Study (http://example.com/quantum-study): Quantum computers will break RSA.`;
    useAgentStore.getState().updateTask(missionId, task1.id, {
      status: 'completed',
      result: task1Result,
      validationOutcome: { isValid: true, critique: 'Looks good', validatedAt: new Date() }
    });
    useAgentStore.getState().removeTaskFromActive(task1.id);

    expect(updateTaskSpy).toHaveBeenCalledWith(missionId, task1.id, expect.objectContaining({ status: 'completed', result: task1Result }));
    expect(removeTaskFromActiveSpy).toHaveBeenCalledWith(task1.id);
    missionState = useAgentStore.getState().missions[missionId];
    expect(missionState.tasks[0].status).toBe('completed');
    expect(missionState.tasks[0].result).toBe(task1Result);
    expect(useAgentStore.getState().agentState.activeTasks).not.toContain(task1.id);
    // isLoading might still be true if other tasks are active, or become false if this was the only one.
    // For this simulation, let's assume agent picks up next task immediately.

    // ** Task 2: Summarize **
    const task2 = missionState.tasks[1];
    useAgentStore.getState().addTaskToActive(task2.id);
    expect(addTaskToActiveSpy).toHaveBeenCalledWith(task2.id);
    expect(useAgentStore.getState().agentState.activeTasks).toContain(task2.id);

    useAgentStore.getState().updateTask(missionId, task2.id, { status: 'in_progress' });
    expect(updateTaskSpy).toHaveBeenCalledWith(missionId, task2.id, { status: 'in_progress' });
    expect(useAgentStore.getState().missions[missionId].tasks[1].status).toBe('in_progress');
    // Log for updateTask to 'in_progress' is implicitly handled by its mock
    expect(mockAddLogFnIntegration).toHaveBeenCalledWith(expect.objectContaining({ message: `Task ${task2.id} status updated to in_progress` }));

    // Simulate Gemini summarization
    const geminiSummarizationResponse: GeminiResponse = {
      candidates: [{ content: { parts: [{ text: "Summary: Quantum computing poses a significant threat to current cryptographic standards like RSA." }] } }],
    };
    mockGeminiGenerate.mockResolvedValueOnce(geminiSummarizationResponse); // From existing setup

    // Simulate task completion
    const task2Result = "Summary: Quantum computing poses a significant threat to current cryptographic standards like RSA.";
    useAgentStore.getState().updateTask(missionId, task2.id, {
      status: 'completed',
      result: task2Result,
      validationOutcome: { isValid: true, critique: 'Accurate summary.', validatedAt: new Date() }
    });
    useAgentStore.getState().removeTaskFromActive(task2.id);

    expect(updateTaskSpy).toHaveBeenCalledWith(missionId, task2.id, expect.objectContaining({ status: 'completed', result: task2Result }));
    expect(removeTaskFromActiveSpy).toHaveBeenCalledWith(task2.id);
    missionState = useAgentStore.getState().missions[missionId];
    expect(missionState.tasks[1].status).toBe('completed');
    expect(missionState.tasks[1].result).toBe(task2Result);
    expect(useAgentStore.getState().agentState.activeTasks).not.toContain(task2.id);
    expect(useAgentStore.getState().agentState.isLoading).toBe(false); // All tasks done

    // --- 4. Mission Completion ---
    useAgentStore.getState().setMissionStatus(missionId, 'completed');
    expect(setMissionStatusSpy).toHaveBeenCalledWith(missionId, 'completed');
    missionState = useAgentStore.getState().missions[missionId];
    expect(missionState.status).toBe('completed');
    // Log for setMissionStatus to 'completed' is implicitly handled by its mock
    expect(mockAddLogFnIntegration).toHaveBeenCalledWith(expect.objectContaining({ message: `Mission ${missionId} status updated to completed` }));

    // --- Final State Checks ---
    const finalAgentState = useAgentStore.getState().agentState;
    // currentMissionId might be cleared or kept, depending on desired agent behavior post-completion.
    // For now, assume it's kept until a new mission is created or it's explicitly cleared.
    // expect(finalAgentState.currentMissionId).toBeNull();
    expect(finalAgentState.isLoading).toBe(false);
    expect(finalAgentState.activeTasks).toHaveLength(0);

    // Check logs for key events (these logs are now generated by the mocked store actions)
    const logs = useAgentStore.getState().logs as LogEntry[]; // Cast to LogEntry[]
    expect(logs.some(log => log.message.includes(`Mission ${missionId} created with goal: ${missionGoal}`))).toBe(true);
    expect(logs.some(log => log.message.includes(`Tasks added to mission ${missionId}. Count: ${decomposedTasks.length}`))).toBe(true);
    expect(logs.some(log => log.message.includes(`Task ${task1.id} status updated to in_progress`))).toBe(true);
    // The mock for updateTask now logs for 'completed' status updates
    expect(logs.some(log => log.message.includes(`Task ${task1.id} status updated to completed`))).toBe(true);
    expect(logs.some(log => log.message.includes(`Task ${task2.id} status updated to in_progress`))).toBe(true);
    expect(logs.some(log => log.message.includes(`Task ${task2.id} status updated to completed`))).toBe(true);
    expect(logs.some(log => log.message.includes(`Mission ${missionId} status updated to completed`))).toBe(true);

    // Clear spies
    createMissionSpy.mockRestore();
    addTasksSpy.mockRestore();
    updateTaskSpy.mockRestore();
    addTaskToActiveSpy.mockRestore();
    removeTaskFromActiveSpy.mockRestore();
    setMissionStatusSpy.mockRestore();
  });
});
