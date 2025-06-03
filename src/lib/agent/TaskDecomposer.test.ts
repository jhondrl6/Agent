// src/lib/agent/TaskDecomposer.test.ts
import { TaskDecomposer } from './TaskDecomposer'; 
import { Mission, Task, LogLevel } from '@/lib/types/agent'; 
import { GeminiClient } from '@/lib/search/GeminiClient'; 

// Mock GeminiClient
// jest.mock('@/lib/search/GeminiClient'); // Auto-mocks all methods - this path might be tricky with class constructor
// Manual mock:
const mockGenerate = jest.fn();
jest.mock('@/lib/search/GeminiClient', () => {
  return {
    GeminiClient: jest.fn().mockImplementation(() => {
      return { generate: mockGenerate };
    }),
  };
});


// Mock addLog function
const mockAddLog = jest.fn();

const mockMission: Mission = {
  id: 'mission-test-1',
  goal: 'Test goal for decomposition',
  tasks: [],
  status: 'pending',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TaskDecomposer', () => {
  let decomposer: TaskDecomposer;

  beforeEach(() => {
    // Clear all instances and calls to constructor and all methods:
    (GeminiClient as jest.Mock).mockClear(); // Clear constructor calls if GeminiClient itself is mocked
    mockGenerate.mockClear(); // Clear calls to the generate method
    mockAddLog.mockClear();

    // Instantiate TaskDecomposer with a dummy API key (as GeminiClient is mocked)
    // and the mocked addLog function.
    decomposer = new TaskDecomposer('dummy-gemini-key', mockAddLog);
  });

  it('should decompose a mission into tasks based on valid LLM JSON response', async () => {
    const mockLLMResponse = {
      candidates: [{ content: { parts: [{ text: '[{"description": "Sub-task 1"}, {"description": "Sub-task 2"}]' }] } }],
    };
    mockGenerate.mockResolvedValue(mockLLMResponse);

    const tasks = await decomposer.decomposeMission(mockMission);

    expect(tasks).toHaveLength(2);
    expect(tasks[0].description).toBe('Sub-task 1');
    expect(tasks[1].description).toBe('Sub-task 2');
    expect(tasks[0].missionId).toBe(mockMission.id);
    expect(tasks[0].status).toBe('pending');
    expect(tasks[0].id).toMatch(/^mission-test-1-task-\d{3}$/); // Check ID format e.g. mission-test-1-task-001
    expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'info', message: expect.stringContaining(`[TD] Mission ${mockMission.id} decomposed into 2 tasks.`) }));
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('should handle LLM response wrapped in markdown backticks', async () => {
    const mockLLMResponse = {
      candidates: [{ content: { parts: [{ text: '```json\n[{"description": "Cleaned task"}]\n```' }] } }],
    };
    mockGenerate.mockResolvedValue(mockLLMResponse);

    const tasks = await decomposer.decomposeMission(mockMission);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toBe('Cleaned task');
  });
  
  it('should handle LLM response with only ``` prefix', async () => {
    const mockLLMResponse = {
      candidates: [{ content: { parts: [{ text: '```\n[{"description": "Cleaned task"}]\n' }] } }],
    };
    mockGenerate.mockResolvedValue(mockLLMResponse);
    const tasks = await decomposer.decomposeMission(mockMission);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toBe('Cleaned task');
  });


  it('should return a fallback task if LLM response is malformed JSON', async () => {
    const mockLLMResponse = {
      candidates: [{ content: { parts: [{ text: 'This is not JSON' }] } }],
    };
    mockGenerate.mockResolvedValue(mockLLMResponse);

    const tasks = await decomposer.decomposeMission(mockMission);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toContain('Fallback: Could not decompose mission');
    expect(tasks[0].id).toContain('-fallback');
    expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', message: expect.stringContaining(`[TD] Error decomposing mission ${mockMission.id}`) }));
  });

  it('should return a fallback task if LLM response content is missing', async () => {
    const mockLLMResponse = { candidates: [{ content: { parts: [] } }] }; // Missing text part
    mockGenerate.mockResolvedValue(mockLLMResponse);

    const tasks = await decomposer.decomposeMission(mockMission);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toContain('Fallback: Could not decompose mission');
    expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', message: expect.stringContaining(`No content from Gemini API or unexpected response structure for mission ${mockMission.id}`) }));
  });
  
  it('should return a fallback task if LLM response is not an array of descriptions', async () => {
    const mockLLMResponse = {
      candidates: [{ content: { parts: [{ text: '{"description": "Not an array"}' }] } }], // Object, not array
    };
    mockGenerate.mockResolvedValue(mockLLMResponse);

    const tasks = await decomposer.decomposeMission(mockMission);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toContain('Fallback: Could not decompose mission');
    expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', message: expect.stringContaining('Gemini response is not a valid JSON array after cleaning.') }));
  });


  it('should return a fallback task if GeminiClient.generate call fails', async () => {
    mockGenerate.mockRejectedValue(new Error('LLM API Error'));

    const tasks = await decomposer.decomposeMission(mockMission);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toContain('Fallback: Could not decompose mission');
    expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', message: expect.stringContaining(`[TD] Error decomposing mission ${mockMission.id}: LLM API Error`) }));
  });
  
  it('should log prompt and response summaries with debug level', async () => {
    const mockLLMResponse = {
      candidates: [{ content: { parts: [{ text: '[{"description": "Debug task"}]' }] } }],
    };
    mockGenerate.mockResolvedValue(mockLLMResponse);

    await decomposer.decomposeMission(mockMission);

    expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({
      level: 'debug',
      message: expect.stringContaining(`[TD] Sending prompt to LLM for task decomposition for mission ${mockMission.id}.`),
      details: expect.objectContaining({ promptSummary: expect.any(String) })
    }));
    expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({
      level: 'debug',
      message: expect.stringContaining(`[TD] Received LLM response for mission ${mockMission.id}.`),
      details: expect.objectContaining({ summary: expect.any(String) })
    }));
  });

});
