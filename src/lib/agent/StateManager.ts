// src/lib/agent/StateManager.ts
import { create } from 'zustand';
import { Mission, Task, AgentState } from '@/lib/types/agent';

interface StoreState {
  missions: Record<string, Mission>;
  agentState: AgentState;
}

interface StoreActions {
  createMission: (mission: Mission) => void;
  updateMission: (missionId: string, updates: Partial<Omit<Mission, 'id' | 'createdAt'>>) => void; // id and createdAt shouldn't change
  clearMissions: () => void; // Added for convenience
  addTask: (missionId: string, task: Task) => void;
  addTasks: (missionId: string, tasks: Task[]) => void; // For adding multiple tasks
  updateTask: (missionId: string, taskId: string, updates: Partial<Omit<Task, 'id' | 'missionId' | 'createdAt'>>) => void;
  setAgentLoading: (isLoading: boolean) => void;
  setAgentError: (error?: string) => void;
  setCurrentMissionId: (missionId?: string) => void;
  addTaskToActive: (taskId: string) => void;
  removeTaskFromActive: (taskId: string) => void;
  // Potentially add more actions as needed
}

export const useAgentStore = create<StoreState & StoreActions>((set, get) => ({
  // Initial State
  missions: {},
  agentState: {
    isLoading: false,
    activeTasks: [],
    currentMissionId: undefined,
    error: undefined,
  },

  // Actions
  createMission: (mission) => {
    const missionWithTimestamps = {
      ...mission,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    set((state) => ({
      missions: { ...state.missions, [mission.id]: missionWithTimestamps },
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
  
  setAgentLoading: (isLoading) =>
    set((state) => ({ agentState: { ...state.agentState, isLoading } })),

  setAgentError: (error) =>
    set((state) => ({
      agentState: {
        ...state.agentState,
        error,
        // isLoading is managed by activeTasks count. An error in one task doesn't mean all stop loading.
        // If a critical error requires stopping all activity, it should also clear activeTasks.
      },
    })),

  setCurrentMissionId: (missionId) =>
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
