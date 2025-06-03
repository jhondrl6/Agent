import { useAgentStore } from './StateManager';
import { Mission, Task, LogLevel, AgentState } from '@/lib/types/agent';
import * as logger from '../utils/logger'; // To mock logger.warn

// Mock the logger module
jest.mock('../utils/logger', () => ({
  ...jest.requireActual('../utils/logger'), // Import and retain default behavior
  warn: jest.fn(), // Mock logger.warn
  info: jest.fn(), // Mock logger.info for state manager calls
}));


describe('StateManager Manual Override Actions', () => {
  const missionId = 'test-mission-manual';
  const taskId1 = 'test-task-manual-1';
  const taskId2 = 'test-task-manual-2';

  const initialTask1: Task = {
    id: taskId1,
    missionId: missionId,
    description: 'Test task 1 for manual override',
    status: 'pending',
    retries: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    // result and failureDetails are initially undefined
  };

  const initialTask2: Task = {
    id: taskId2,
    missionId: missionId,
    description: 'Test task 2, will be active',
    status: 'in-progress', // Mark as in-progress to test activeTasks
    retries: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const initialMission: Mission = {
    id: missionId,
    goal: 'Test Mission for Manual Overrides',
    tasks: [initialTask1, initialTask2],
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const initialAgentGlobalState: AgentState = {
    isLoading: true, // Since one task is in-progress
    activeTasks: [taskId2], // task2 is active
    currentMissionId: missionId,
    error: undefined,
  };

  const getInitialState = () => JSON.parse(JSON.stringify({ // Deep clone
    missions: { [missionId]: initialMission },
    agentState: initialAgentGlobalState,
    logs: [],
  }));


  beforeEach(() => {
    // Reset the store to a known initial state before each test
    useAgentStore.setState(getInitialState(), true);
    // Clear mock call counts
    (logger.warn as jest.Mock).mockClear();
    (logger.info as jest.Mock).mockClear();
  });

  describe('manualCompleteTask', () => {
    it('should successfully complete a task with custom result text', () => {
      const customResult = 'Task manually completed with flying colors!';
      useAgentStore.getState().manualCompleteTask(missionId, taskId1, customResult);

      const state = useAgentStore.getState();
      const mission = state.missions[missionId];
      const task = mission.tasks.find(t => t.id === taskId1);

      expect(task?.status).toBe('completed');
      expect(task?.result).toBe(customResult);
      expect(task?.validationOutcome?.isValid).toBe(true);
      expect(task?.validationOutcome?.critique).toBe('Manually approved by user.');
      expect(task?.updatedAt).not.toEqual(initialTask1.updatedAt);
      expect(task?.failureDetails).toBeUndefined();

      expect(state.logs.length).toBe(1);
      expect(state.logs[0].level).toBe(LogLevel.INFO);
      expect(state.logs[0].message).toContain(`Task '${taskId1}' in mission '${missionId}' manually marked as COMPLETED.`);
      expect(state.logs[0].details).toEqual({ missionId, taskId: taskId1, result: customResult });
      expect(logger.info).toHaveBeenCalledWith(`Task '${taskId1}' manually marked as COMPLETED.`, 'StateManager', { missionId, taskId: taskId1, result: customResult });


      // Check activeTasks and isLoading (task1 was not active, task2 still is)
      expect(state.agentState.activeTasks).toEqual([taskId2]);
      expect(state.agentState.isLoading).toBe(true);
    });

    it('should successfully complete an active task and update isLoading', () => {
        useAgentStore.getState().manualCompleteTask(missionId, taskId2, 'Active task completed');

        const state = useAgentStore.getState();
        const task = state.missions[missionId].tasks.find(t => t.id === taskId2);

        expect(task?.status).toBe('completed');
        expect(state.agentState.activeTasks).toEqual([]); // taskId2 should be removed
        expect(state.agentState.isLoading).toBe(false); // No more active tasks
        expect(logger.info).toHaveBeenCalled();
      });

    it('should use default result text if none provided', () => {
      useAgentStore.getState().manualCompleteTask(missionId, taskId1);
      const task = useAgentStore.getState().missions[missionId].tasks.find(t => t.id === taskId1);
      expect(task?.result).toBe('Manually completed by user.');
      expect(logger.info).toHaveBeenCalled();
    });

    it('should not change state and log warning if task is not found', () => {
      const nonExistentTaskId = 'non-existent-task';
      const originalState = JSON.parse(JSON.stringify(useAgentStore.getState())); // Deep clone

      useAgentStore.getState().manualCompleteTask(missionId, nonExistentTaskId, 'Should not apply');

      const finalState = useAgentStore.getState();
      expect(finalState.missions).toEqual(originalState.missions); // Check a few key parts
      expect(finalState.logs.length).toBe(0); // No UI log should be added
      expect(logger.warn).toHaveBeenCalledWith('Task not found for manual completion.', 'StateManager', { missionId, taskId: nonExistentTaskId });
    });

    it('should not change state and log warning if mission is not found', () => {
        const nonExistentMissionId = 'non-existent-mission';
        const originalState = JSON.parse(JSON.stringify(useAgentStore.getState()));

        useAgentStore.getState().manualCompleteTask(nonExistentMissionId, taskId1, 'Should not apply');

        const finalState = useAgentStore.getState();
        expect(finalState.missions).toEqual(originalState.missions);
        expect(finalState.logs.length).toBe(0);
        expect(logger.warn).toHaveBeenCalledWith('Mission or tasks not found for manual completion.', 'StateManager', { missionId: nonExistentMissionId, taskId: taskId1 });
      });
  });

  describe('manualFailTask', () => {
    it('should successfully fail a task with a custom reason', () => {
      const failureReason = 'Manually failed due to external factor.';
      useAgentStore.getState().manualFailTask(missionId, taskId1, failureReason);

      const state = useAgentStore.getState();
      const mission = state.missions[missionId];
      const task = mission.tasks.find(t => t.id === taskId1);

      expect(task?.status).toBe('failed');
      expect(task?.result).toBe('Manually failed by user.');
      expect(task?.failureDetails?.originalError).toBe(failureReason);
      expect(task?.failureDetails?.isManualFailure).toBe(true);
      expect(task?.failureDetails?.suggestedAction).toBe('abandon');
      expect(task?.validationOutcome).toBeUndefined();
      expect(task?.updatedAt).not.toEqual(initialTask1.updatedAt);

      expect(state.logs.length).toBe(1);
      expect(state.logs[0].level).toBe(LogLevel.WARN);
      expect(state.logs[0].message).toContain(`Task '${taskId1}' in mission '${missionId}' manually marked as FAILED.`);
      expect(state.logs[0].details).toEqual({ missionId, taskId: taskId1, reason: failureReason });
      expect(logger.warn).toHaveBeenCalledWith(`Task '${taskId1}' manually marked as FAILED.`, 'StateManager', { missionId, taskId: taskId1, reason: failureReason });

      // Check activeTasks and isLoading (task1 was not active, task2 still is)
      expect(state.agentState.activeTasks).toEqual([taskId2]);
      expect(state.agentState.isLoading).toBe(true);
    });

    it('should successfully fail an active task and update isLoading', () => {
        useAgentStore.getState().manualFailTask(missionId, taskId2, 'Active task failed');

        const state = useAgentStore.getState();
        const task = state.missions[missionId].tasks.find(t => t.id === taskId2);

        expect(task?.status).toBe('failed');
        expect(state.agentState.activeTasks).toEqual([]); // taskId2 should be removed
        expect(state.agentState.isLoading).toBe(false); // No more active tasks
        expect(logger.warn).toHaveBeenCalled();
      });


    it('should not change state and log warning if task is not found', () => {
      const nonExistentTaskId = 'non-existent-task-fail';
      const originalState = JSON.parse(JSON.stringify(useAgentStore.getState()));

      useAgentStore.getState().manualFailTask(missionId, nonExistentTaskId, 'Should not apply');

      const finalState = useAgentStore.getState();
      expect(finalState.missions).toEqual(originalState.missions);
      expect(finalState.logs.length).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith('Task not found for manual failure.', 'StateManager', { missionId, taskId: nonExistentTaskId });
    });

    it('should not change state and log warning if mission is not found for fail', () => {
        const nonExistentMissionId = 'non-existent-mission-fail';
        const originalState = JSON.parse(JSON.stringify(useAgentStore.getState()));

        useAgentStore.getState().manualFailTask(nonExistentMissionId, taskId1, 'Should not apply');

        const finalState = useAgentStore.getState();
        expect(finalState.missions).toEqual(originalState.missions);
        expect(finalState.logs.length).toBe(0);
        expect(logger.warn).toHaveBeenCalledWith('Mission or tasks not found for manual failure.', 'StateManager', { missionId: nonExistentMissionId, taskId: taskId1 });
      });
  });
});
