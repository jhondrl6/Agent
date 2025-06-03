// src/components/dashboard/LogsPanel.tsx
'use client';

import React, { useRef, useEffect } from 'react';
import { useAgentStore } from '@/lib/agent/StateManager';
import { LogEntry } from '@/lib/types/agent'; // LogLevel not needed directly here anymore
import { LogListItem } from './LogListItem'; // Import LogListItem
// getLogLevelClasses and formatLogTimestamp are now used by LogListItem from utils.ts

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
        <div className="overflow-y-auto flex-grow pr-2 space-y-2 text-sm font-mono custom-scrollbar"> {/* Adjusted space-y */}
           {/* Invisible div at the top for auto-scrolling to newest log */}
          <div ref={logsEndRef} />
          {logs.map((log) => (
            <LogListItem key={log.id} log={log} />
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
