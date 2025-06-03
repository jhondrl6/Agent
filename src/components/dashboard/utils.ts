// src/components/dashboard/utils.ts
import { Task } from '@/lib/types/agent'; // Adjust path if needed

export const getStatusPillClasses = (status: Task['status']): string => {
  // Light theme consistent status pills (from TaskList.tsx)
  switch (status) {
    case 'pending': return 'bg-yellow-100 text-yellow-800 border border-yellow-300';
    case 'in-progress': return 'bg-blue-100 text-blue-800 border border-blue-300';
    case 'completed': return 'bg-green-100 text-green-800 border border-green-300';
    case 'failed': return 'bg-red-100 text-red-800 border border-red-300';
    case 'retrying': return 'bg-orange-100 text-orange-800 border border-orange-300';
    default: return 'bg-gray-100 text-gray-800 border border-gray-300';
  }
};

// We can also move getLogLevelClasses and formatLogTimestamp here later if LogsPanel also uses them
// For now, just getStatusPillClasses as requested by TaskListItem's prompt
import { LogLevel } from '@/lib/types/agent'; // For LogLevel type

export const getLogLevelTailwindClasses = (level: LogLevel): { text: string; border: string; bg: string } => {
  // Classes for light theme LogsPanel (text color for the [LEVEL] text, border for the left border)
  switch (level) {
    case 'error':
      return { text: 'text-red-600', border: 'border-red-500', bg: 'bg-red-50' };
    case 'warn':
      return { text: 'text-yellow-600', border: 'border-yellow-500', bg: 'bg-yellow-50' };
    case 'info':
      return { text: 'text-blue-600', border: 'border-blue-500', bg: 'bg-blue-50' };
    case 'system':
      return { text: 'text-green-600', border: 'border-green-500', bg: 'bg-green-50' };
    case 'debug':
      return { text: 'text-gray-500', border: 'border-gray-400', bg: 'bg-gray-50' };
    default:
      return { text: 'text-gray-600', border: 'border-gray-300', bg: 'bg-gray-50' };
  }
};

export const formatLogTimestamp = (timestamp: Date): string => {
  const dateObject = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return dateObject.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });
};
