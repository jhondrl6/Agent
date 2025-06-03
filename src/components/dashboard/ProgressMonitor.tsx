// src/components/dashboard/ProgressMonitor.tsx
'use client';

import React from 'react';
import { useAgentStore } from '@/lib/agent/StateManager';
import { Task } from '@/lib/types/agent'; // Import Task type
import { ProgressBar } from '@/components/ui/progress';


export function ProgressMonitor() {
  const mission = useAgentStore((state) =>
    state.agentState.currentMissionId ? state.missions[state.agentState.currentMissionId] : null
  );
  const agentState = useAgentStore((state) => state.agentState);

  let progressPercent = 0;
  let completedTasksCount = 0;
  let totalTasksCount = 0;
  let activeTasks: Task[] = [];
  let missionStatusMessage = "No active mission.";

  if (mission) {
    missionStatusMessage = `Current Mission: "${mission.goal}" (Status: ${mission.status})`;
    if (mission.tasks && mission.tasks.length > 0) {
      totalTasksCount = mission.tasks.length;
      completedTasksCount = mission.tasks.filter(task => task.status === 'completed').length;
      progressPercent = totalTasksCount > 0 ? (completedTasksCount / totalTasksCount) * 100 : 0;
      activeTasks = mission.tasks.filter(task => task.status === 'in-progress');
    } else if (mission.status === 'pending') {
        missionStatusMessage = `Mission "${mission.goal}" is pending, tasks are being decomposed...`;
    } else {
        missionStatusMessage = `Mission "${mission.goal}" has no tasks. (Status: ${mission.status})`;
    }
  }

  return (
    <div className="p-6 my-4 bg-white border border-gray-200 rounded-xl shadow-lg">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Agent Activity Monitor</h2>

      {mission ? (
        <div className="mb-4">
          <h3 className="text-lg font-medium text-gray-700 mb-1 truncate" title={mission.goal}>
             {mission.goal}
          </h3>
          <p className="text-xs text-gray-500 font-mono mb-2">ID: {mission.id}</p>

          {totalTasksCount > 0 ? (
            <div className="mb-3">
              <ProgressBar value={progressPercent} />
              <p className="text-sm text-gray-600 mt-1">
                {completedTasksCount} of {totalTasksCount} tasks completed ({progressPercent.toFixed(1)}%)
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic mb-3">
              {mission.status === 'pending' ? 'Awaiting task decomposition...' : 'No tasks defined for this mission.'}
            </p>
          )}

          {/* Active Tasks Display Enhancement */}
          <div className="mt-3">
            <h4 className="font-semibold text-gray-700">Active Tasks ({activeTasks.length}):</h4>
            {activeTasks.length > 0 ? (
              <ul className="list-disc list-inside pl-2 text-sm space-y-0.5 max-h-24 overflow-y-auto pr-1 custom-scrollbar">
                {activeTasks.map(task => (
                  <li key={task.id} className="text-blue-600 truncate" title={task.description}>
                    {task.description} (ID: <span className="font-mono text-xs">{task.id.slice(-6)}</span>)
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 italic">No tasks currently in progress.</p>
            )}
          </div>

        </div>
      ) : (
        <p className="text-gray-500 italic">{missionStatusMessage}</p>
      )}

      <div className={`mt-4 pt-4 border-t border-gray-200 ${!mission ? 'mt-0 pt-0 border-none' : ''}`}>
        <h4 className="font-semibold text-gray-700 mb-1">Agent Status:</h4>
        {agentState.isLoading ? ( // Combined isLoading check
            <div className="flex items-center text-yellow-600">
                <svg data-testid="loading-spinner" className="animate-spin -ml-1 mr-2 h-5 w-5 text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Agent is busy... ({agentState.activeTasks.length > 0 ? `${agentState.activeTasks.length} active task(s)` : 'Initializing...'})
            </div>
        ) : agentState.error ? (
            <p className="text-red-600 bg-red-50 p-2 rounded-md text-sm">Error: {agentState.error}</p>
        ) : (
            <p className="text-green-600">Agent is idle.</p>
        )}
      </div>
    </div>
  );
}
