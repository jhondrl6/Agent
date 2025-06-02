export interface Mission {
  id: string;
  goal: string;
  tasks: Task[];
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  result?: string; // To store the final synthesized result
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  missionId: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'retrying';
  result?: any; // Can be text, data, or a link to a resource
  retries: number;
  createdAt: Date;
  updatedAt: Date;
  failureDetails?: {
    reason: string; // Reason for failure from DecisionEngine or direct error
    suggestedAction?: FailedTaskAction; // Suggested action from DecisionEngine
    originalError?: string; // Simplified original error message
    timestamp: Date; // When the failure was processed
  };
}

// Import FailedTaskAction at the top of the file or ensure it's resolvable
import type { FailedTaskAction } from '@/lib/agent/DecisionEngine';

export interface AgentState {
  currentMissionId?: string;
  activeTasks: string[]; // IDs of tasks currently being executed
  isLoading: boolean;
  error?: string;
  // Potentially add more state details like API usage, tokens consumed, etc.
}

// You can add other related types here as the project grows
// For example, types for different kinds of task results
