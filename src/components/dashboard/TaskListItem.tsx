// src/components/dashboard/TaskListItem.tsx
'use client';
import React from 'react';
import { Task } from '@/lib/types/agent';
import { useAgentStore } from '@/lib/agent/StateManager';
import { getStatusPillClasses } from './utils';
import { DecisionEngine } from '@/lib/agent/DecisionEngine'; // For MAX_TASK_RETRIES

interface TaskListItemProps {
  task: Task;
  onTaskClick: (task: Task) => void;
}

const TaskListItemInternal = ({ task, onTaskClick }: TaskListItemProps) => {
  const storeManualCompleteTask = useAgentStore((state) => state.manualCompleteTask);
  const storeManualFailTask = useAgentStore((state) => state.manualFailTask);

  const handleMarkComplete = () => {
    const resultText = window.prompt("Enter optional result text for manual completion:", "Manually completed.");
    if (resultText !== null) { // User did not cancel prompt
      storeManualCompleteTask(task.missionId, task.id, resultText);
    }
  };

  const handleMarkFailed = () => {
    const reason = window.prompt("Enter reason for manual failure:", "");
    if (reason !== null && reason.trim() !== "") { // User did not cancel and provided a reason
      storeManualFailTask(task.missionId, task.id, reason.trim());
    } else if (reason !== null) { // User submitted an empty reason
        alert("Reason cannot be empty for manual failure.");
    }
  };

  // console.log(`[TaskListItem] Rendering ${task.id} - Status: ${task.status}`); // For debugging memoization

  let previewText = "";
  let previewTitle = "";

  if (task.status === 'completed') {
    if (task.validationOutcome && !task.validationOutcome.isValid) {
      previewText = `Validation: ${task.validationOutcome.critique?.substring(0, 70)}...`;
      previewTitle = task.validationOutcome.critique || "Validation critique unavailable";
    } else if (task.result) {
      previewText = `Result: ${String(task.result).substring(0, 70)}...`;
      previewTitle = String(task.result);
    } else {
      previewText = "Completed (No result preview)";
      previewTitle = "Task completed without a displayable result.";
    }
  } else if (task.status === 'failed' && task.failureDetails) {
      previewText = `Failed: ${task.failureDetails.reason.substring(0, 70)}...`;
      previewTitle = task.failureDetails.reason;
  } else if (task.status === 'retrying' && task.failureDetails) {
      previewText = `Retrying (${task.retries}/${DecisionEngine.MAX_TASK_RETRIES}): ${task.failureDetails.reason.substring(0,50)}...`;
      previewTitle = task.failureDetails.reason;
  } else if (task.status === 'in-progress') {
      previewText = "Execution currently in progress...";
      previewTitle = "Task is being executed by the agent.";
  } else if (task.status === 'pending') {
      previewText = "Pending execution...";
      previewTitle = "Task is awaiting execution.";
  }


  return (
    <li
      className="p-3 border border-gray-200 rounded-lg bg-white shadow-sm hover:shadow-md hover:border-blue-400 transition-all duration-150 ease-in-out cursor-pointer group"
      onClick={() => onTaskClick(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onTaskClick(task)}
      aria-label={`View details for task: ${task.description.substring(0,50)}...`}
    >
      <div className="flex justify-between items-start mb-1">
        <h3 className="text-base font-medium text-gray-700 group-hover:text-blue-600 break-words pr-2" title={task.description}>
          {task.description}
        </h3>
        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusPillClasses(task.status)} ml-2 flex-shrink-0`}>
          {task.status.toUpperCase()}
        </span>
      </div>
      <div className="text-xs text-gray-500 mb-2">
        ID: <span className="font-mono text-gray-600">{task.id.slice(-8)}</span> | Retries: <span className="font-semibold">{task.retries}</span>/{DecisionEngine.MAX_TASK_RETRIES}
      </div>
      {previewText && (
        <p className="text-xs text-gray-500 truncate italic" title={previewTitle}>
          {previewText}
        </p>
      )}

      {/* Manual Actions */}
      { (task.status === 'pending' || task.status === 'in-progress' || task.status === 'failed' || task.status === 'retrying') && (
      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center space-x-2">
        <span className="text-xs font-medium text-gray-500">Manual:</span>
        <button
          onClick={(e) => { e.stopPropagation(); handleMarkComplete(); }}
          disabled={task.status === 'completed'}
          className="px-2 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 disabled:opacity-60 disabled:cursor-not-allowed"
          title="Manually mark task as completed"
        >
          ✔️ Complete
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleMarkFailed(); }}
          disabled={task.status === 'completed'} // Already completed tasks can't be failed. Failed tasks can be re-failed (e.g. new reason)
          className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 disabled:opacity-60 disabled:cursor-not-allowed"
          title="Manually mark task as failed"
        >
          ❌ Fail
        </button>
      </div>
      )}
    </li>
  );
};

export const TaskListItem = React.memo(TaskListItemInternal);
TaskListItem.displayName = 'TaskListItem';
