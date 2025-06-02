// src/components/dashboard/LogsPanel.tsx
'use client';

import React, { useRef, useEffect } from 'react';
import { useAgentStore } from '@/lib/agent/StateManager';
import { LogEntry, LogLevel } from '@/lib/types/agent'; 

const getLogLevelClasses = (level: LogLevel): string => {
  switch (level) {
    case 'error':
      return 'text-red-400 border-red-500';
    case 'warn':
      return 'text-yellow-400 border-yellow-500';
    case 'info':
      return 'text-blue-300 border-blue-500';
    case 'system':
      return 'text-green-400 border-green-500';
    case 'debug':
      return 'text-gray-400 border-gray-500'; // Adjusted for better visibility on dark bg
    default:
      return 'text-gray-300 border-gray-600';
  }
};

const formatLogTimestamp = (timestamp: Date): string => {
  // Ensure timestamp is a Date object before calling toLocaleTimeString
  const dateObject = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return dateObject.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
};

export function LogsPanel() {
  const logs = useAgentStore((state) => state.logs);
  const logsEndRef = useRef<HTMLDivElement | null>(null); // For auto-scrolling

  // Auto-scroll to the bottom (newest log) when logs change
  // Since logs are prepended, we scroll to top (index 0).
  // If logs were appended, we'd scroll to bottom.
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [logs]); // Dependency on logs array itself, not just its length

  return (
    <div className="p-4 my-4 bg-white border border-gray-200 rounded-xl shadow-lg h-96 flex flex-col">
      <h2 className="text-xl font-semibold text-gray-800 mb-3 border-b border-gray-200 pb-2">Agent Activity Logs</h2>
      {logs.length === 0 ? (
        <p className="text-gray-500 italic text-center py-10">No log entries yet. Start a mission to see logs.</p>
      ) : (
        <div className="overflow-y-auto flex-grow pr-2 space-y-1.5 text-sm font-mono custom-scrollbar">
           {/* Invisible div at the top for auto-scrolling to newest log */}
          <div ref={logsEndRef} />
          {logs.map((log) => (
            <div key={log.id} className={`p-2 rounded-md bg-gray-50 border-l-4 ${getLogLevelClasses(log.level)}`}>
              <span className="text-gray-500 mr-2 select-none">{formatLogTimestamp(log.timestamp)}</span>
              <span className={`font-bold mr-1 select-none ${getLogLevelClasses(log.level).split(' ')[0]}`}> {/* Use only text color for level itself */}
                [{log.level.toUpperCase()}]
              </span>
              <span className="text-gray-700 break-words">{log.message}</span>
              {log.details && (
                <pre className="mt-1 ml-6 p-1.5 bg-gray-100 border border-gray-200 rounded text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap break-all">
                  {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Basic CSS for custom scrollbar (optional, can be added to globals.css)
/*
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: #f1f1f1; 
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #888; 
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #555; 
}
*/
