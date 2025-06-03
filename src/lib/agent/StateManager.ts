// src/lib/agent/StateManager.ts
import { create } from 'zustand';
import { Mission, Task, AgentState, LogEntry, LogLevel } from '@/lib/types/agent';
import * as logger from '../utils/logger';

interface StoreState {
  missions: Record<string, Mission>;
  agentState: AgentState; // Corresponds to AgentGlobalState
  logs: LogEntry[]; // New state for logs
}

interface StoreActions {
  createMission: (mission: Mission) => void;
  updateMission: (missionId: string, updates: Partial<Omit<Mission, 'id' | 'createdAt'>>) => void; // id and createdAt shouldn't change
  updateMissionState: (missionId: string, missionData: Mission) => void; // New action
  clearMissions: () => void; // Added for convenience
  addTask: (missionId: string, task: Task) => void;
  addTasks: (missionId: string, tasks: Task[]) => void; // For adding multiple tasks
  updateTask: (missionId: string, taskId: string, updates: Partial<Omit<Task, 'id' | 'missionId' | 'createdAt'>>) => void;
  setAgentState: (updates: Partial<AgentState>) => void; // New generic state updater
  setAgentLoading: (isLoading: boolean, message?: string) => void; // Modified signature
  setAgentError: (error: string | null) => void; // Modified signature
  clearAgentError: () => void; // New action
  setCurrentMissionId: (missionId?: string) => void; // Kept for now, but setAgentState is preferred
  addTaskToActive: (taskId: string) => void;
  removeTaskFromActive: (taskId: string) => void;
  addLog: (entryData: { level: LogLevel; message: string; details?: any }) => void;
  manualCompleteTask: (missionId: string, taskId: string, manualResultText?: string) => void;
  manualFailTask: (missionId: string, taskId: string, manualReason: string) => void;
}

const MAX_LOG_ENTRIES = 200; // Or any preferred number

export const useAgentStore = create<StoreState & StoreActions>((set, get) => ({
  // Initial State
  missions: {},
  agentState: {
    isLoading: false,
    activeTasks: [],
    currentMissionId: undefined,
    error: undefined,
  },
  logs: [], // Initialize logs as an empty array

  // Actions
  updateMissionState: (missionId: string, missionData: Mission) =>
    set((state) => ({
      missions: {
        ...state.missions,
        [missionId]: {
          ...(state.missions[missionId] || {}),
          ...missionData,
          tasks: missionData.tasks ? [...missionData.tasks] : (state.missions[missionId]?.tasks || []),
        },
      },
    })),

  createMission: (mission: Mission) => { // Added Mission type for clarity
    const missionWithEnsuredTimestamps = {
      ...mission,
      createdAt: mission.createdAt || new Date(), // Use existing or set new
      updatedAt: mission.updatedAt || new Date(), // Use existing or set new
      // Ensure tasks also have timestamps if they are being created here for the first time
      // However, tasks are now created via DB and should have timestamps.
      // If tasks are part of the mission object, their timestamps should be preserved.
      tasks: mission.tasks ? mission.tasks.map(task => ({
        ...task,
        createdAt: task.createdAt || new Date(),
        updatedAt: task.updatedAt || new Date(),
      })) : [],
    };
    set((state) => ({
      missions: { ...state.missions, [mission.id]: missionWithEnsuredTimestamps },
      // Optionally, set currentMissionId only if it's not already set, or based on specific logic
      // For now, keeping original logic: last created mission becomes current.
      agentState: { ...state.agentState, currentMissionId: mission.id, isLoading: false, error: undefined },
    }));
  },

  updateMission: (missionId, updates) =>
    set((state) => {
      const mission = state.missions[missionId];
      if (mission) {
        return {
          missions: {
            ...state.missions,
            [missionId]: { ...mission, ...updates, updatedAt: new Date() },
          },
        };
      }
      console.warn(`[StateManager] Mission with ID ${missionId} not found for update.`);
      return state;
    }),

  clearMissions: () => set({ missions: {} }),

  addTask: (missionId, task) =>
    set((state) => {
      const mission = state.missions[missionId];
      if (mission) {
        // Ensure task has timestamps if not provided
        const taskWithTimestamps = {
            ...task,
            createdAt: task.createdAt || new Date(),
            updatedAt: task.updatedAt || new Date(),
        };
        return {
          missions: {
            ...state.missions,
            [missionId]: {
              ...mission,
              tasks: [...(mission.tasks || []), taskWithTimestamps],
              updatedAt: new Date(), // Also update mission's updatedAt timestamp
            },
          },
        };
      }
      console.warn(`[StateManager] Mission with ID ${missionId} not found for adding task.`);
      return state;
    }),

  addTasks: (missionId, tasks) =>
    set((state) => {
        const mission = state.missions[missionId];
        if (mission) {
            const tasksWithTimestamps = tasks.map(task => ({
                ...task,
                createdAt: task.createdAt || new Date(),
                updatedAt: task.updatedAt || new Date(),
            }));
            return {
                missions: {
                    ...state.missions,
                    [missionId]: {
                        ...mission,
                        tasks: [...(mission.tasks || []), ...tasksWithTimestamps],
                        updatedAt: new Date(),
                    },
                },
            };
        }
        console.warn(`[StateManager] Mission with ID ${missionId} not found for adding tasks.`);
        return state;
    }),

  updateTask: (missionId, taskId, updates) =>
    set((state) => {
      const mission = state.missions[missionId];
      if (mission && mission.tasks) {
        const taskExists = mission.tasks.some(task => task.id === taskId);
        if (!taskExists) {
            console.warn(`[StateManager] Task with ID ${taskId} not found in mission ${missionId} for update.`);
            return state;
        }
        return {
          missions: {
            ...state.missions,
            [missionId]: {
              ...mission,
              tasks: mission.tasks.map((task) =>
                task.id === taskId ? { ...task, ...updates, updatedAt: new Date() } : task
              ),
              updatedAt: new Date(), // Also update mission's updatedAt timestamp
            },
          },
        };
      }
      console.warn(`[StateManager] Mission (${missionId}) or its tasks not found for updating task ${taskId}.`);
      return state;
    }),

  setAgentState: (updates: Partial<AgentState>) =>
    set((state) => ({
      agentState: { ...state.agentState, ...updates },
    })),

  setAgentLoading: (isLoading: boolean, message?: string) =>
    set((state) => ({
      agentState: {
        ...state.agentState,
        isLoading,
        loadingMessage: message || (isLoading ? 'Loading...' : undefined),
      },
    })),

  setAgentError: (error: string | null) =>
    set((state) => ({
      agentState: { ...state.agentState, error: error },
    })),

  clearAgentError: () =>
    set((state) => ({
      agentState: { ...state.agentState, error: null },
    })),

  setCurrentMissionId: (missionId) => // This can still be used or phased out in favor of setAgentState
    set((state) => ({ agentState: { ...state.agentState, currentMissionId: missionId } })),

  addTaskToActive: (taskId) =>
    set((state) => {
      if (!state.agentState.activeTasks.includes(taskId)) {
        return {
          agentState: {
            ...state.agentState,
            activeTasks: [...state.agentState.activeTasks, taskId],
            isLoading: true, // Set loading to true when a task becomes active
          },
        };
      }
      // If task is already active, ensure isLoading reflects this (might be redundant if always set by first add)
      return { agentState: { ...state.agentState, isLoading: true } };
    }),

  removeTaskFromActive: (taskId) =>
    set((state) => {
      const newActiveTasks = state.agentState.activeTasks.filter((id) => id !== taskId);
      return {
        agentState: {
          ...state.agentState,
          activeTasks: newActiveTasks,
          isLoading: newActiveTasks.length > 0, // Update loading based on remaining active tasks
        },
      };
    }),

  addLog: ({ level, message, details }) =>
    set((state) => {
      const newLogEntry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // Simple unique ID
        timestamp: new Date(),
        level,
        message,
        details,
      };
      const updatedLogs = [newLogEntry, ...state.logs]; // Add new logs to the beginning
      if (updatedLogs.length > MAX_LOG_ENTRIES) {
        updatedLogs.splice(MAX_LOG_ENTRIES); // Remove oldest logs if limit exceeded
      }
      return { logs: updatedLogs };
    }),

  manualCompleteTask: (missionId, taskId, manualResultText) => {
    const state = get();
    const mission = state.missions[missionId];

    if (!mission || !mission.tasks) {
      logger.warn(`Mission or tasks not found for manual completion.`, 'StateManager', { missionId, taskId });
      return;
    }

    const taskIndex = mission.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      logger.warn(`Task not found for manual completion.`, 'StateManager', { missionId, taskId });
      return;
    }

    const updatedTask: Task = {
      ...mission.tasks[taskIndex],
      status: 'completed',
      result: manualResultText || 'Manually completed by user.',
      validationOutcome: {
        isValid: true,
        critique: 'Manually approved by user.',
        suggestedAction: 'none',
        validatedAt: new Date(),
      },
      updatedAt: new Date(),
      failureDetails: undefined,
    };

    const updatedTasks = [...mission.tasks];
    updatedTasks[taskIndex] = updatedTask;

    set((currentState) => ({
      missions: {
        ...currentState.missions,
        [missionId]: {
          ...mission,
          tasks: updatedTasks,
          updatedAt: new Date(),
        },
      },
      agentState: {
        ...currentState.agentState,
        activeTasks: currentState.agentState.activeTasks.filter(id => id !== taskId),
        isLoading: currentState.agentState.activeTasks.filter(id => id !== taskId).length > 0,
      },
    }));

    state.addLog({
      level: 'info',
      message: `Task '${taskId}' in mission '${missionId}' manually marked as COMPLETED.`,
      details: { missionId, taskId, result: manualResultText },
    });
    logger.info(`Task '${taskId}' manually marked as COMPLETED.`, 'StateManager', { missionId, taskId, result: manualResultText });
  },

  manualFailTask: (missionId, taskId, manualReason) => {
    const state = get();
    const mission = state.missions[missionId];

    if (!mission || !mission.tasks) {
      logger.warn(`Mission or tasks not found for manual failure.`, 'StateManager', { missionId, taskId });
      return;
    }

    const taskIndex = mission.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      logger.warn(`Task not found for manual failure.`, 'StateManager', { missionId, taskId });
      return;
    }

    const updatedTask: Task = {
      ...mission.tasks[taskIndex],
      status: 'failed',
      result: 'Manually failed by user.', // Or keep undefined, or use part of manualReason
      failureDetails: {
        originalError: manualReason,
        suggestedAction: 'abandon',
        handledAt: new Date(),
        isManualFailure: true,
      },
      validationOutcome: undefined,
      updatedAt: new Date(),
    };

    const updatedTasks = [...mission.tasks];
    updatedTasks[taskIndex] = updatedTask;

    set((currentState) => ({
      missions: {
        ...currentState.missions,
        [missionId]: {
          ...mission,
          tasks: updatedTasks,
          updatedAt: new Date(),
        },
      },
      agentState: {
        ...currentState.agentState,
        activeTasks: currentState.agentState.activeTasks.filter(id => id !== taskId),
        isLoading: currentState.agentState.activeTasks.filter(id => id !== taskId).length > 0,
      },
    }));

    state.addLog({
      level: 'warn',
      message: `Task '${taskId}' in mission '${missionId}' manually marked as FAILED.`,
      details: { missionId, taskId, reason: manualReason },
    });
    logger.warn(`Task '${taskId}' manually marked as FAILED.`, 'StateManager', { missionId, taskId, reason: manualReason });
  },
}));

// Log store changes in development for debugging
if (process.env.NODE_ENV === 'development') {
  useAgentStore.subscribe(
    (state, prevState) => console.log('[StateManager DEV] State changed:', { newState: state, prevState }),
    // You might want to use a selector here to only log parts of the state if it's too noisy
    // state => state.missions // Example selector
  );
}

// Optional: Persist to localStorage (if needed later)
// import { persist, createJSONStorage } from 'zustand/middleware';
// export const useAgentStore = create(
//   persist<StoreState & StoreActions>(
//     (set, get) => ({ ... }), // your store definition
//     {
//       name: 'agent-storage', // name of the item in the storage (must be unique)
//       storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
//     }
//   )
// );
