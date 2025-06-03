import { AgentExecutionEngine } from './AgentExecutionEngine';
import * as dbService from '$lib/database/services';
import { TaskExecutor } from './TaskExecutor';
import * as logger from '$lib/utils/logger';
import { Mission, Task as PrismaTask } from '@prisma/client';
import { Task as ExecutorTask, LogLevel } from '$lib/types/agent';


// Mocking the database services
jest.mock('$lib/database/services', () => ({
  prisma: {
    mission: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    task: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mocking TaskExecutor
jest.mock('./TaskExecutor');
const mockExecuteTask = jest.fn();
TaskExecutor.prototype.executeTask = mockExecuteTask;

// Mocking logger
jest.mock('$lib/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
}));

const mockDbService = dbService as {
  prisma: {
    mission: {
      findMany: jest.MockedFunction<typeof dbService.prisma.mission.findMany>;
      update: jest.MockedFunction<typeof dbService.prisma.mission.update>;
    };
    task: {
      findMany: jest.MockedFunction<typeof dbService.prisma.task.findMany>;
      update: jest.MockedFunction<typeof dbService.prisma.task.update>;
    };
  };
};


describe('AgentExecutionEngine', () => {
  let engine: AgentExecutionEngine;

  beforeEach(() => {
    jest.clearAllMocks(); // Clear all mocks before each test
    engine = new AgentExecutionEngine(); // Create a new engine instance

    // Default mock implementations
    mockDbService.prisma.mission.findMany.mockResolvedValue([]);
    mockDbService.prisma.task.findMany.mockResolvedValue([]);
    mockDbService.prisma.mission.update.mockImplementation(async (args: any) => ({ ...args.data, id: args.where.id, tasks: [] } as any));
    mockDbService.prisma.task.update.mockImplementation(async (args: any) => ({ ...args.data, id: args.where.id } as any));
    mockExecuteTask.mockReset(); // Reset executeTask mock specifically
  });

  describe('constructor', () => {
    it('should initialize backendCallbacks', () => {
      expect((engine as any).backendCallbacks).toBeDefined();
      expect((engine as any).backendCallbacks.updateTaskState).toBeInstanceOf(Function);
      expect((engine as any).backendCallbacks.setAgentFailure).toBeInstanceOf(Function);
    });
  });

  describe('getTaskLogger', () => {
    it('should return a logger function that stores logs', () => {
      const taskId = 'task-log-test-1';
      const loggerFunc = (engine as any).getTaskLogger(taskId);
      const logEntry = { level: LogLevel.INFO, message: 'Test log', details: { data: 123 } };
      loggerFunc(logEntry);

      const logs = (engine as any).taskLogs.get(taskId);
      expect(logs).toBeDefined();
      expect(logs.length).toBe(1);
      expect(logs[0].message).toBe('Test log');
      expect(logs[0].level).toBe(LogLevel.INFO);
      expect(logs[0].details).toEqual({ data: 123 });
      expect(logs[0].timestamp).toBeDefined();
    });
  });

  describe('runOnce', () => {
    const missionId = 'mission-1';
    const taskId = 'task-1';

    const createMockMission = (status: string, tasks: PrismaTask[]): Mission & { tasks: PrismaTask[] } => ({
      id: missionId,
      goal: 'Test Goal',
      status,
      result: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tasks,
      agentId: 'agent-test-id',
      userId: 'user-test-id',
      totalTokens: 0,
      logFilePath: null,
    });

    const createMockTask = (id: string, status: string, missionId: string): PrismaTask => ({
      id,
      description: `Test task ${id}`,
      status,
      result: null,
      retries: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      missionId,
      failureDetails: null,
      validationOutcome: null,
      type: 'search',
      toolName: null,
      toolInput: null,
      expectedOutput: null,
      context: null,
      dependsOn: [],
      logs: null,
    });

    it('Test 1: should do nothing if no processable missions are found', async () => {
      mockDbService.prisma.mission.findMany.mockResolvedValue([]);
      await engine.runOnce();
      expect(mockDbService.prisma.mission.update).not.toHaveBeenCalled();
      expect(mockExecuteTask).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('No processable missions found in this cycle.', 'AgentExecutionEngine');
    });

    it('Test 2: should process a mission with one task that completes successfully', async () => {
      const pendingTask = createMockTask(taskId, 'pending', missionId);
      const mission = createMockMission('pending', [pendingTask]);
      mockDbService.prisma.mission.findMany.mockResolvedValue([mission]);
      mockDbService.prisma.task.findMany.mockResolvedValueOnce([ // For final status check
         { ...pendingTask, status: 'completed', result: { content: 'Task success', logs:[] } }
      ]);

      mockExecuteTask.mockImplementation(async (mId, t) => {
        // Simulate TaskExecutor calling updateTaskState
        const backendCallbacks = (engine as any).backendCallbacks;
        await backendCallbacks.updateTaskState(mId, t.id, {
          status: 'completed',
          result: { content: 'Task success' }
        });
      });

      await engine.runOnce();

      expect(logger.info).toHaveBeenCalledWith(`Processing mission ${missionId} (pending).`, 'AgentExecutionEngine', { missionId });
      expect(mockDbService.prisma.mission.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: missionId },
        data: { status: 'in-progress', result: 'Mission processing started.' },
      }));

      expect(mockExecuteTask).toHaveBeenCalledTimes(1);
      expect(mockExecuteTask).toHaveBeenCalledWith(missionId, expect.objectContaining({ id: taskId, status: 'pending' }));

      // Check if task status was updated to completed
      expect(mockDbService.prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: taskId },
        data: { status: 'completed', result: { content: 'Task success', logs: [] } }, // Logs get embedded
      }));

      // Check final mission status update
      expect(mockDbService.prisma.mission.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: missionId },
        data: {
          status: 'completed',
          result: 'Mission completed successfully. Tasks: 1 completed, 0 failed, 0 pending/active.'
        },
      }));
    });

    it('Test 3: should process a mission with one task that fails', async () => {
      const pendingTask = createMockTask(taskId, 'pending', missionId);
      const mission = createMockMission('pending', [pendingTask]);
      mockDbService.prisma.mission.findMany.mockResolvedValue([mission]);
      mockDbService.prisma.task.findMany.mockResolvedValueOnce([ // For final status check
         { ...pendingTask, status: 'failed', failureDetails: { reason: 'Task failed', logs: [] } }
      ]);

      mockExecuteTask.mockImplementation(async (mId, t) => {
        const backendCallbacks = (engine as any).backendCallbacks;
        await backendCallbacks.updateTaskState(mId, t.id, {
          status: 'failed',
          failureDetails: { reason: 'Task failed' }
        });
      });

      await engine.runOnce();

      expect(mockDbService.prisma.mission.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: missionId },
        data: { status: 'in-progress', result: 'Mission processing started.' },
      }));
      expect(mockExecuteTask).toHaveBeenCalledTimes(1);
      expect(mockDbService.prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: taskId },
        data: { status: 'failed', failureDetails: { reason: 'Task failed', logs: [] } },
      }));
      expect(mockDbService.prisma.mission.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: missionId },
        data: {
          status: 'failed',
          result: 'Mission failed. Tasks: 0 completed, 1 failed, 0 pending/active.'
        },
      }));
    });

    it('Test 4: should handle TaskExecutor.executeTask throwing an error', async () => {
      const pendingTask = createMockTask(taskId, 'pending', missionId);
      const mission = createMockMission('pending', [pendingTask]);
      mockDbService.prisma.mission.findMany.mockResolvedValue([mission]);
      // No need to mock task.findMany for final status as mission fails before that specific logic path.

      const criticalError = new Error('Critical executor error');
      mockExecuteTask.mockRejectedValueOnce(criticalError);

      await engine.runOnce();

      expect(mockDbService.prisma.mission.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: missionId },
        data: { status: 'in-progress', result: 'Mission processing started.' },
      }));
      expect(mockExecuteTask).toHaveBeenCalledTimes(1);

      // TaskExecutor error should mark task as failed
      expect(mockDbService.prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: taskId },
        data: {
          status: 'failed',
          failureDetails: {
            reason: 'TaskExecutor crashed unexpectedly.',
            originalError: criticalError.message,
            timestamp: expect.any(String), // ISOString
          }
        },
      }));

      // Mission should be marked as failed due to critical task error
      expect(mockDbService.prisma.mission.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: missionId },
        data: {
          status: 'failed',
          result: `Mission failed due to critical error in task ${taskId}.`
        },
      }));
       expect(logger.error).toHaveBeenCalledWith(`Unhandled error during TaskExecutor.executeTask for task ${taskId}: ${criticalError.message}`, 'AgentExecutionEngine', { error: criticalError, taskId });
    });

    it('Test 5: should handle agent-level failure via setAgentFailure callback', async () => {
      const pendingTask = createMockTask(taskId, 'pending', missionId);
      const mission = createMockMission('pending', [pendingTask]);
      mockDbService.prisma.mission.findMany.mockResolvedValue([mission]);

      const agentErrorMessage = "Global Agent Failure";
      mockExecuteTask.mockImplementation(async (mId, t) => {
        const backendCallbacks = (engine as any).backendCallbacks;
        await backendCallbacks.setAgentFailure(mId, agentErrorMessage);
        // In a real scenario, TaskExecutor might stop or throw after this.
        // For this test, we assume it might continue or other tasks might be skipped.
        // The crucial part is that setAgentFailure is called.
      });

      await engine.runOnce();

      expect(mockDbService.prisma.mission.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: missionId },
        data: { status: 'in-progress', result: 'Mission processing started.' },
      }));

      expect(mockExecuteTask).toHaveBeenCalledTimes(1);

      // The mission should be marked as failed directly by setAgentFailure
      expect(mockDbService.prisma.mission.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: missionId },
        data: {
          status: 'failed',
          result: JSON.stringify({ error: agentErrorMessage, agentFailure: true })
        },
      }));
       expect(logger.error).toHaveBeenCalledWith(`Agent failure for mission ${missionId}: ${agentErrorMessage}`, 'AgentExecutionEngine');

      // Depending on exact flow after setAgentFailure, further assertions might be needed.
      // For example, if tasks are still processed for status update after agent failure.
      // Based on current runOnce, the loop continues, and then final status is determined.
      // If setAgentFailure immediately stops all processing for that mission, the final task status check
      // might show tasks as they were. Let's assume for now the failure is catastrophic for the mission.
      // The final status determination will run again, but the mission is already failed.
       mockDbService.prisma.task.findMany.mockResolvedValueOnce([
         { ...pendingTask, status: 'pending' } // Task was not updated as mission failed before it could complete
      ]);
       await engine.runOnce(); // Call again to simulate the cycle where the mission is already failed.
       // The above call might be redundant if the first runOnce already handles the final state.
       // The key is that the mission.update to failed due to setAgentFailure is caught.
    });

  });
});
