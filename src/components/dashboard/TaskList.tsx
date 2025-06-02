// src/components/dashboard/TaskList.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useAgentStore } from '@/lib/agent/StateManager';
import { Mission, Task } from '@/lib/types/agent';
import { TaskExecutor } from '@/lib/agent/TaskExecutor';

export function TaskList() {
  const currentMissionId = useAgentStore((state) => state.agentState.currentMissionId);
  const mission = useAgentStore((state) => 
    state.agentState.currentMissionId ? state.missions[state.agentState.currentMissionId] : null
  );
  // Subscribe to global loading state, e.g., if TaskExecutor sets it.
  const agentIsGloballyLoading = useAgentStore((state) => state.agentState.isLoading);

  const [isExecutingTaskLocal, setIsExecutingTaskLocal] = useState(false); // Local loading state for the button

  // This effect helps reset the local button loading state if a global loading state
  // (potentially controlled by TaskExecutor) is also being used and indicates completion.
  useEffect(() => {
    if (!agentIsGloballyLoading && isExecutingTaskLocal) {
      setIsExecutingTaskLocal(false);
    }
  }, [agentIsGloballyLoading, isExecutingTaskLocal]);

  const handleRunNextTask = async () => {
    if (!mission || !mission.tasks) return;

    const pendingTask = mission.tasks.find(task => task.status === 'pending');

    if (pendingTask) {
      setIsExecutingTaskLocal(true);
      const executor = new TaskExecutor();
      try {
        console.log(`[TaskList] Triggering execution for task: ${pendingTask.id} from mission ${mission.id}`);
        await executor.executeTask(mission.id, pendingTask);
        // TaskExecutor updates the store. UI will react.
        // Local loading state (isExecutingTaskLocal) might be reset by useEffect if global loading changes,
        // or can be reset here if preferred after the await, though it might be premature
        // if other operations depend on the global state.
      } catch (error) {
        console.error("[TaskList] Error explicitly caught while triggering task execution:", error);
        // TaskExecutor is expected to set global error state.
        // Reset local button loading state in case of an error during the trigger.
        setIsExecutingTaskLocal(false);
      }
    } else {
      // This alert can be replaced with a more integrated UI notification.
      alert("No pending tasks available for this mission.");
    }
  };
  
  const getStatusPillClasses = (status: Task['status']) => {
    // Light theme consistent status pills
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'in-progress': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'completed': return 'bg-green-100 text-green-800 border-green-300';
      case 'failed': return 'bg-red-100 text-red-800 border-red-300';
      case 'retrying': return 'bg-orange-100 text-orange-800 border-orange-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (!currentMissionId || !mission) {
    return (
      <div className="p-6 my-4 bg-white border border-gray-200 rounded-xl shadow-lg">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Task Overview</h2>
        <p className="text-gray-600">No mission is currently active or selected. Start a new mission to see tasks here.</p>
      </div>
    );
  }
  
  const hasPendingTasks = mission.tasks && mission.tasks.some(t => t.status === 'pending');

  return (
    <div className="p-6 my-4 bg-white border border-gray-200 rounded-xl shadow-lg">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-1">Tasks for Mission:</h2>
          <p className="text-md text-blue-600 font-medium truncate" title={mission.goal}>"{mission.goal}"</p>
          <p className="text-xs text-gray-500 font-mono">ID: {mission.id}</p>
        </div>
        <button
          onClick={handleRunNextTask}
          disabled={isExecutingTaskLocal || !hasPendingTasks || agentIsGloballyLoading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center transition-colors duration-150 ease-in-out mt-3 sm:mt-0 w-full sm:w-auto"
          title={!hasPendingTasks ? "No pending tasks available" : agentIsGloballyLoading ? "Agent is busy" : "Run the next available task"}
        >
          {isExecutingTaskLocal || agentIsGloballyLoading ? (
            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          ) : null}
          {isExecutingTaskLocal || agentIsGloballyLoading ? 'Executing...' : 'Run Next Pending Task'}
        </button>
      </div>

      {!mission.tasks || mission.tasks.length === 0 ? (
         <p className="text-gray-600">
         {mission.status === 'pending' && mission.tasks.length === 0 
           ? "Tasks are being decomposed..."
           : "No tasks have been generated for this mission yet, or decomposition is complete with no tasks."}
       </p>
      ) : (
        <ul className="space-y-4">
          {mission.tasks.map((task) => (
            <li key={task.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50 shadow-sm hover:shadow-md transition-shadow duration-150 ease-in-out">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-2">
                <h3 className="text-lg font-medium text-gray-700 flex-grow pr-2 break-words">{task.description}</h3>
                <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getStatusPillClasses(task.status)} whitespace-nowrap mt-2 sm:mt-0`}>
                  {task.status.toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-gray-500 space-x-2 mb-1">
                <span>ID: <span className="font-mono text-gray-700">{task.id}</span></span>
                <span className="text-gray-300">|</span>
                <span>Retries: <span className="font-semibold text-gray-700">{task.retries}</span></span>
              </div>
              {task.result && (
                  <div className="mt-1 text-xs text-gray-500">
                      <strong>Result: </strong> 
                      <pre className="whitespace-pre-wrap bg-gray-100 p-2 rounded text-xs text-gray-600 max-h-20 overflow-y-auto">{String(task.result).substring(0,300)}{String(task.result).length > 300 ? '...' : ''}</pre>
                  </div>
              )}
               <div className="text-xs text-gray-400 mt-2 border-t border-gray-200 pt-2">
                  <span>Created: {new Date(task.createdAt).toLocaleString()}</span>
                  <span className="mx-1">|</span>
                  <span>Updated: {new Date(task.updatedAt).toLocaleString()}</span>
               </div>
               {task.status === 'failed' && task.failureDetails && (
                <div className="mt-2 p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs">
                  <p className="font-semibold mb-0.5">Failure Details (from {new Date(task.failureDetails.timestamp).toLocaleTimeString()}):</p>
                  <p><strong className="text-red-600">Reason:</strong> {task.failureDetails.reason}</p>
                  {task.failureDetails.suggestedAction && <p><strong className="text-red-600">Suggested Action:</strong> {task.failureDetails.suggestedAction}</p>}
                  {task.failureDetails.originalError && <p className="truncate"><strong className="text-red-600">Original Error:</strong> {task.failureDetails.originalError}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
