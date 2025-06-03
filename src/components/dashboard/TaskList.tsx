// src/components/dashboard/TaskList.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useAgentStore } from '@/lib/agent/StateManager';
import { Mission, Task, LogLevel } from '@/lib/types/agent';
import { TaskExecutor } from '@/lib/agent/TaskExecutor';
import { Modal } from '@/components/ui/modal'; 
import { DecisionEngine } from '@/lib/agent/DecisionEngine'; // For MAX_TASK_RETRIES
import { TaskListItem } from './TaskListItem'; // Import TaskListItem
// getStatusPillClasses will be used by the Modal section in this file.
// TaskListItem will import it from utils.ts itself.
// Alternatively, pass getStatusPillClasses as a prop to TaskListItem or Modal.
import { getStatusPillClasses } from './utils';


export function TaskList() {
  const currentMissionId = useAgentStore((state) => state.agentState.currentMissionId);
  const mission = useAgentStore((state) => 
    state.agentState.currentMissionId ? state.missions[state.agentState.currentMissionId] : null
  );
  const agentIsGloballyLoading = useAgentStore((state) => state.agentState.isLoading);
  const activeTasksGlobalCount = useAgentStore((state) => state.agentState.activeTasks.length);
  const { addLog, manualCompleteTask, manualFailTask, updateTask } = useAgentStore.getState();

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

  const handleManualComplete = () => {
    if (!selectedTask || !mission) return;
    const manualResultText = prompt("Optional: Enter a brief result or reason for manual completion:", "Manually completed via UI.");
    if (manualResultText === null) return; 

    manualCompleteTask(mission.id, selectedTask.id, manualResultText || "Manually completed via UI.");
    addLog({ level: 'system', message: `[UI] Task ${selectedTask.id} manually marked COMPLETED.`, details: { missionId: mission.id, taskId: selectedTask.id, manualResult: manualResultText } });
    closeModal();
  };

  const handleManualFail = () => {
    if (!selectedTask || !mission) return;
    const manualFailureReason = prompt("Enter a reason for manually failing this task:", "Manually failed via UI.");
    if (manualFailureReason === null) return; 

    manualFailTask(mission.id, selectedTask.id, manualFailureReason || "Manually failed via UI.");
    addLog({ level: 'system', message: `[UI] Task ${selectedTask.id} manually marked FAILED.`, details: { missionId: mission.id, taskId: selectedTask.id, reason: manualFailureReason } });
    closeModal();
  };

  const handleForceRetry = async () => {
    if (!selectedTask || !mission) return;
    addLog({ level: 'system', message: `[UI] Force retry triggered for task ${selectedTask.id}.`, details: { missionId: mission.id, taskId: selectedTask.id } });
    const executor = new TaskExecutor(addLog); 
    const taskToRetry: Task = {
      ...selectedTask, status: 'pending', result: undefined, failureDetails: undefined,
      validationOutcome: undefined, updatedAt: new Date(), 
    };
    updateTask(mission.id, selectedTask.id, { 
      status: 'pending', retries: taskToRetry.retries, result: undefined, 
      failureDetails: undefined, validationOutcome: undefined, updatedAt: new Date() 
    });
    closeModal(); 
    try {
      executor.executeTask(mission.id, taskToRetry)
        .then(() => { addLog({ level: 'info', message: `[UI] Forced retry for task ${taskToRetry.id} initiated and has run its course.` }); })
        .catch(err => { addLog({ level: 'error', message: `[UI] Error during forced retry for task ${taskToRetry.id}.`, details: { error: (err as Error).message } }); });
    } catch (err: any) { addLog({ level: 'error', message: `[UI] Error initiating forced retry for ${taskToRetry.id}.`, details: { error: err.message } }); }
  };

  const handleExecutePendingTasks = async () => {
    if (!mission || !mission.tasks) return;
    const pendingTasks = mission.tasks.filter(task => task.status === 'pending');
    if (pendingTasks.length === 0) {
      alert("No pending tasks to run."); return;
    }
    addLog({ level: 'system', message: `[UI] Triggering execution for ${pendingTasks.length} pending tasks for mission ${mission.id}.`});
    const executor = new TaskExecutor(addLog); 
    const taskPromises = pendingTasks.map(task => 
      executor.executeTask(mission.id, task)
        .catch(err => { 
          console.error(`[TaskList] Critical error from executeTask promise for ${task.id}:`, err);
          addLog({level: 'error', message: `[TaskList] Critical error from executeTask promise for ${task.id}`, details: { error: (err as Error).message }});
          return { status: 'rejected', reason: err, taskId: task.id }; 
        })
    );
    try {
      const results = await Promise.allSettled(taskPromises);
      addLog({level: 'debug', message: `[TaskList] All triggered task promises for mission ${mission.id} have settled.`, details: {resultsCount: results.length}});
      results.forEach((result, index) => {
        const task = pendingTasks[index]; 
        if (result.status === 'fulfilled') { /* Logged by TaskExecutor */ } 
        else { addLog({level: 'error', message:`[TaskList] Task ${task.id} promise was rejected:`, details: {reason: result.reason}}); }
      });
    } catch (error: any) {
      addLog({level: 'error', message:"[TaskList] Error during Promise.allSettled execution:", details: {error: error.message}});
    }
  };
  
  // getStatusPillClasses is kept here because the Modal section below uses it.
  // TaskListItem imports its own copy from utils.ts.
  // This could be refactored so Modal also imports from utils.ts or gets classes as props.

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
          disabled={agentIsGloballyLoading || !hasPendingTasks} 
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center transition-colors duration-150 ease-in-out mt-3 sm:mt-0 w-full sm:w-auto"
          title={!hasPendingTasks ? "No pending tasks available" : agentIsGloballyLoading ? "Tasks are currently executing" : "Run all pending tasks"}
        >
          {agentIsGloballyLoading && activeTasksGlobalCount > 0 && ( 
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
        <ul className="space-y-3"> {/* Adjusted space-y */}
          {mission.tasks.map((task) => (
            <TaskListItem key={task.id} task={task} onTaskClick={handleTaskClick} />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
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
            <div className={`p-3 rounded border ${selectedTask.validationOutcome.isValid ? 'bg-green-50 border-green-200 text-green-800' : 'bg-yellow-50 border-yellow-300 text-yellow-800'}`}>
              <strong className="text-gray-600 block mb-1">Validation Outcome:</strong>
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
              <strong className="text-gray-600 block mb-1">Failure Details:</strong>
              <div className="space-y-1">
                <p><strong>Reason:</strong> {selectedTask.failureDetails.reason}</p>
                {selectedTask.failureDetails.suggestedAction && <p><strong>Engine Suggested Action:</strong> {selectedTask.failureDetails.suggestedAction}</p>}
                {selectedTask.failureDetails.originalError && <p><strong>Original Error:</strong> <span className="font-mono text-xs">{selectedTask.failureDetails.originalError}</span></p>}
                <p><strong>Timestamp:</strong> {new Date(selectedTask.failureDetails.timestamp).toLocaleString()}</p>
              </div>
            </div>
          )}
          <div className="mt-6 pt-4 border-t border-gray-200 flex flex-wrap gap-3 justify-end">
            <button
              onClick={handleManualComplete}
              disabled={selectedTask.status === 'completed'}
              className="px-4 py-2 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400 disabled:text-gray-700 disabled:cursor-not-allowed"
            >
              Mark Completed
            </button>
            <button
              onClick={handleManualFail}
              disabled={selectedTask.status === 'failed' && !!selectedTask.failureDetails?.reason.includes('Manually failed by user')}
              className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400 disabled:text-gray-700 disabled:cursor-not-allowed"
            >
              Mark Failed
            </button>
            <button
              onClick={handleForceRetry}
              disabled={selectedTask.status === 'in-progress' || selectedTask.status === 'retrying'} 
              className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-700 disabled:cursor-not-allowed"
            >
              Force Retry
            </button>
            <button 
              onClick={closeModal} 
              className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
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
