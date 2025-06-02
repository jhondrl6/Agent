// src/components/dashboard/TaskList.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useAgentStore } from '@/lib/agent/StateManager';
import { Mission, Task } from '@/lib/types/agent';
import { TaskExecutor } from '@/lib/agent/TaskExecutor';
import { Modal } from '@/components/ui/modal'; // Import Modal

export function TaskList() {
  const currentMissionId = useAgentStore((state) => state.agentState.currentMissionId);
  const mission = useAgentStore((state) => 
    state.agentState.currentMissionId ? state.missions[state.agentState.currentMissionId] : null
  );
  // Subscribe to global loading state, e.g., if TaskExecutor sets it.
  const agentIsGloballyLoading = useAgentStore((state) => state.agentState.isLoading);
  const activeTasksGlobalCount = useAgentStore((state) => state.agentState.activeTasks.length);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedTask(null);
  };

  // No local 'areTasksExecuting' state or useEffect for it anymore

  const handleExecutePendingTasks = async () => {
    if (!mission || !mission.tasks) return;

    const pendingTasks = mission.tasks.filter(task => task.status === 'pending');

    if (pendingTasks.length === 0) {
      alert("No pending tasks to run for this mission."); // Consider a more integrated notification
      return;
    }

    // setAreTasksExecuting(true); // REMOVED - global isLoading will be set by TaskExecutor via StateManager
    console.log(`[TaskList] Triggering execution for ${pendingTasks.length} pending tasks for mission ${mission.id}.`);
    
    const addLog = useAgentStore.getState().addLog;
    const executor = new TaskExecutor(addLog); // Instantiate once for this batch with addLog
    
    // Create an array of promises. executeTask is async but we don't await each one here.
    const taskPromises = pendingTasks.map(task => 
      executor.executeTask(mission.id, task)
        .catch(err => { 
          // This catch is for unexpected errors *before* executeTask's own try/catch handles it.
          // executeTask is designed to always handle its errors and update the store.
          // So, a rejection here would be highly unusual unless executeTask itself throws before its try block.
          console.error(`[TaskList] Critical error from executeTask promise for ${task.id} (this indicates an issue in executeTask's error handling):`, err);
          // Return a specific shape to identify failure if needed by Promise.allSettled's results,
          // though executeTask should prevent this by design.
          return { status: 'rejected', reason: err, taskId: task.id }; 
        })
    );

    try {
      const results = await Promise.allSettled(taskPromises);
      console.log('[TaskList] All triggered task promises have settled. Results:', results);
      
      // Optionally, iterate through results to log successes/failures specific to this batch run
      // This can be useful for debugging the Promise.allSettled part itself.
      results.forEach((result, index) => {
        const task = pendingTasks[index]; // Assuming order is preserved
        if (result.status === 'fulfilled') {
          // Fulfillment here means executeTask completed its own logic (which includes updating the store for success/failure).
          // It does NOT mean the task *succeeded*.
          console.log(`[TaskList] executeTask for ${task.id} ("${task.description.substring(0,50)}...") completed its execution run (check store for actual success/failure).`);
        } else {
          // This means the promise returned by executor.executeTask was rejected.
          // This should be rare if executeTask's internal try/catch is robust.
          console.error(`[TaskList] Promise for task ${task.id} ("${task.description.substring(0,50)}...") was rejected:`, result.reason);
        }
      });

    } catch (error) {
      // This catch is for errors in Promise.allSettled itself, which is highly unlikely.
      console.error("[TaskList] Error during Promise.allSettled execution:", error);
    } finally {
      // setAreTasksExecuting(false); // REMOVED - global isLoading will be managed by StateManager
    }
  };
  
  const getStatusPillClasses = (status: Task['status']) => { // Keep this function as it's used below
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-300'; // Adjusted for light theme
      case 'in-progress': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'completed': return 'bg-green-100 text-green-800 border-green-300';
      case 'failed': return 'bg-red-100 text-red-800 border-red-300';
      case 'retrying': return 'bg-orange-100 text-orange-800 border-orange-300'; // Ensure this matches your desired style for orange
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
          onClick={handleExecutePendingTasks}
          disabled={agentIsGloballyLoading || !hasPendingTasks} // Use global loading state
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center transition-colors duration-150 ease-in-out mt-3 sm:mt-0 w-full sm:w-auto"
          title={!hasPendingTasks ? "No pending tasks available" : agentIsGloballyLoading ? "Tasks are currently executing" : "Run all pending tasks"}
        >
          {agentIsGloballyLoading && activeTasksGlobalCount > 0 && ( // Show spinner if globally loading and tasks are active
            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          )}
          {agentIsGloballyLoading && activeTasksGlobalCount > 0 ? `Executing (${activeTasksGlobalCount} Active)...` : 'Run All Pending Tasks'}
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
            <li 
              key={task.id} 
              className="p-4 border border-gray-200 rounded-lg bg-gray-50 shadow-sm hover:shadow-lg hover:border-blue-300 transition-all duration-150 ease-in-out cursor-pointer"
              onClick={() => handleTaskClick(task)}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTaskClick(task); }}
            >
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
              {/* Minimal result preview, full result in modal */}
              {task.result && (
                  <div className="mt-1 text-xs text-gray-500">
                      <strong>Result Preview: </strong> 
                      <span className="italic text-gray-600">{String(task.result).substring(0,100)}{String(task.result).length > 100 ? '...' : ''}</span>
                  </div>
              )}
               <div className="text-xs text-gray-400 mt-2 border-t border-gray-200 pt-2">
                  <span>Last Updated: {new Date(task.updatedAt).toLocaleString()}</span>
               </div>
               {task.status === 'failed' && task.failureDetails && (
                <div className="mt-2 p-1.5 rounded bg-red-50 border border-red-200 text-red-600 text-xs">
                  <p className="font-medium truncate">Failed: {task.failureDetails.reason.substring(0,100)}...</p>
                </div>
              )}
               {task.validationOutcome && !task.validationOutcome.isValid && (
                 <div className="mt-2 p-1.5 rounded bg-yellow-50 border border-yellow-300 text-yellow-700 text-xs">
                   <p className="font-medium truncate">Validation: {task.validationOutcome.critique?.substring(0,100)}...</p>
                 </div>
               )}
            </li>
          ))}
        </ul>
      )}

      {selectedTask && (
      <Modal isOpen={isModalOpen} onClose={closeModal} title={`Task Details: ${selectedTask.id.substring(0,15)}...`} size="2xl">
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <strong className="text-gray-500 block mb-0.5">Full Description:</strong>
            <p className="whitespace-pre-wrap bg-gray-50 p-2 border rounded">{selectedTask.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div><strong className="text-gray-500">Status:</strong>
              <span className={`ml-2 px-2 py-0.5 text-xs font-semibold rounded-full border ${getStatusPillClasses(selectedTask.status)}`}>
                {selectedTask.status.toUpperCase()}
              </span>
            </div>
            <div><strong className="text-gray-500">Retries:</strong> {selectedTask.retries} / {DecisionEngine.MAX_TASK_RETRIES}</div>
            <div><strong className="text-gray-500">Created:</strong> {new Date(selectedTask.createdAt).toLocaleString()}</div>
            <div><strong className="text-gray-500">Last Updated:</strong> {new Date(selectedTask.updatedAt).toLocaleString()}</div>
          </div>

          {selectedTask.result && (
            <div>
              <strong className="text-gray-500 block mb-0.5">Result:</strong>
              <pre className="mt-1 p-3 bg-gray-50 border rounded text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap max-h-60 custom-scrollbar">
                {typeof selectedTask.result === 'object' ? JSON.stringify(selectedTask.result, null, 2) : String(selectedTask.result)}
              </pre>
            </div>
          )}

          {selectedTask.validationOutcome && (
            <div className={`p-3 rounded border ${selectedTask.validationOutcome.isValid ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-300'}`}>
              <strong className="text-gray-500 block mb-1">Validation Outcome:</strong>
              <div className="space-y-1">
                <p><strong>Valid:</strong> {selectedTask.validationOutcome.isValid ? 'Yes' : 'No'}</p>
                {selectedTask.validationOutcome.qualityScore !== undefined && <p><strong>Quality Score:</strong> {selectedTask.validationOutcome.qualityScore.toFixed(2)}</p>}
                {selectedTask.validationOutcome.critique && <p><strong>Critique:</strong> {selectedTask.validationOutcome.critique}</p>}
                {selectedTask.validationOutcome.suggestedAction && <p><strong>Validator Suggested Action:</strong> {selectedTask.validationOutcome.suggestedAction}</p>}
              </div>
            </div>
          )}

          {selectedTask.failureDetails && (
            <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700">
              <strong className="text-gray-500 block mb-1">Failure Details:</strong>
              <div className="space-y-1">
                <p><strong>Reason:</strong> {selectedTask.failureDetails.reason}</p>
                {selectedTask.failureDetails.suggestedAction && <p><strong>Engine Suggested Action:</strong> {selectedTask.failureDetails.suggestedAction}</p>}
                {selectedTask.failureDetails.originalError && <p><strong>Original Error:</strong> <span className="font-mono text-xs">{selectedTask.failureDetails.originalError}</span></p>}
                <p><strong>Timestamp:</strong> {new Date(selectedTask.failureDetails.timestamp).toLocaleString()}</p>
              </div>
            </div>
          )}
          <div className="pt-3 mt-3 border-t border-gray-200 flex justify-end">
             <button 
                onClick={closeModal} 
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
          </div>
        </div>
      </Modal>
    )}
    </div>
  );
}
