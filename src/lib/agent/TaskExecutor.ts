// src/lib/agent/TaskExecutor.ts
import { Task } from '@/lib/types/agent';
import { useAgentStore } from './StateManager'; 

export class TaskExecutor {
  // No need to store the hook if we call useAgentStore.getState() directly inside methods
  // This avoids potential issues with hook rules if the class instance lifetime is complex.

  constructor() {
    console.log('[TaskExecutor] Initialized');
    // In a more complex scenario, you might pass dependencies here
  }

  public async executeTask(missionId: string, task: Task): Promise<void> {
    // Access store's methods directly via getState() when needed.
    // This ensures we are getting the latest state and actions without managing a store instance member.
    const storeActions = useAgentStore.getState();
    
    console.log(`[TaskExecutor] Attempting execution for task: ${task.id} - "${task.description}" under mission ${missionId}`);

    try {
      // 1. Update task status to 'in-progress'
      // Ensure that the task object passed to updateTask contains all necessary fields or that updateTask handles partials correctly.
      // The current updateTask in StateManager expects Partial<Omit<Task, 'id' | 'missionId' | 'createdAt'>>
      storeActions.updateTask(missionId, task.id, { status: 'in-progress' }); // updatedAt will be set by updateTask
      console.log(`[TaskExecutor] Task ${task.id} status updated to 'in-progress'.`);

      // 2. Simulate task execution (e.g., API call, processing)
      // This could involve calls to other services like Tavily, Gemini, etc.
      // For now, it's a simple timeout.
      const executionTime = Math.random() * 2000 + 1000; // Simulate 1-3 seconds of work
      console.log(`[TaskExecutor] Task ${task.id} simulating work for ${executionTime.toFixed(0)}ms.`);
      await new Promise(resolve => setTimeout(resolve, executionTime));

      // 3. Simulate outcome
      const isSuccess = Math.random() > 0.2; // 80% chance of success for placeholder

      if (isSuccess) {
        const mockResult = `Successfully executed: ${task.description}. Found relevant data. More details: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`;
        console.log(`[TaskExecutor] Task ${task.id} completed successfully.`);
        storeActions.updateTask(missionId, task.id, { 
          status: 'completed', 
          result: mockResult,
          // `updatedAt` is handled by `updateTask` in the store
        });
      } else {
        const failureReason = 'Simulated failure: API endpoint returned an error or data processing failed.';
        console.warn(`[TaskExecutor] Task ${task.id} failed. Reason: ${failureReason}`);
        storeActions.updateTask(missionId, task.id, { 
          status: 'failed', 
          result: failureReason,
          // `updatedAt` is handled by `updateTask` in the store
        });
        // In a real system, you might want to check task.retries and potentially set to 'retrying'
        // if task.retries < MAX_RETRIES. This logic would be part of a more complex DecisionEngine/Orchestrator.
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during task execution.';
      console.error(`[TaskExecutor] Critical error executing task ${task.id}:`, errorMessage);
      
      // Use setAgentError from the store for global error feedback
      storeActions.setAgentError(`Task ${task.id} execution failed: ${errorMessage}`);
      
      try {
        // Attempt to update the task status to 'failed' even if an unexpected error occurred
        storeActions.updateTask(missionId, task.id, { 
          status: 'failed', 
          result: `Execution error: ${errorMessage}`,
          // `updatedAt` is handled by `updateTask` in the store
        });
      } catch (storeUpdateError) {
        console.error(`[TaskExecutor] CRITICAL: Failed to update task ${task.id} status to 'failed' in store after an execution error. Store error:`, storeUpdateError);
        // This is a severe situation. The application state might be inconsistent.
        // Consider more robust recovery or logging mechanisms here for production.
      }
    }
  }
}

// Example of how it might be instantiated and used elsewhere (for conceptualization only):
/*
async function runExample() {
  const executor = new TaskExecutor();
  
  // Mock mission and task for the example
  const missionIdExample = "mission-example-123";
  const taskExample: Task = {
    id: "task-example-001",
    missionId: missionIdExample,
    description: "Test task execution flow",
    status: 'pending',
    retries: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    result: null,
  };

  // You'd typically get the mission and task from the store or props
  // For this example, we'll simulate adding it to the store first so updateTask can find it.
  const { createMission, addTask } = useAgentStore.getState();
  createMission({ 
    id: missionIdExample, 
    goal: "Test Mission Execution", 
    tasks: [], 
    status: 'pending', 
    createdAt: new Date(), 
    updatedAt: new Date() 
  });
  addTask(missionIdExample, taskExample);

  console.log(`[TaskExecutor Example] Executing task ${taskExample.id} for mission ${missionIdExample}`);
  await executor.executeTask(missionIdExample, taskExample);
  console.log(`[TaskExecutor Example] Finished execution attempt for task ${taskExample.id}. Check store for status.`);

  const finalTaskState = useAgentStore.getState().missions[missionIdExample]?.tasks.find(t => t.id === taskExample.id);
  console.log("[TaskExecutor Example] Final task state in store:", finalTaskState);
}

// To run this example:
// 1. Ensure your environment is set up (e.g., Next.js dev server running if this were part of a UI interaction)
// 2. Uncomment the line below. You might need to place this in a context where hooks can be called if you weren't using getState().
// runExample();
*/
