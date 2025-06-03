// src/components/dashboard/LogListItem.tsx
'use client';
import React from 'react';
import { LogEntry } from '@/lib/types/agent';
import { getLogLevelTailwindClasses, formatLogTimestamp } from './utils';

interface LogListItemProps {
  log: LogEntry;
}

const LogListItemInternal = ({ log }: LogListItemProps) => {
  // console.log(`[LogListItem] Rendering ${log.id}`); // For debugging memoization
  const levelClasses = getLogLevelTailwindClasses(log.level);

  return (
    <div
      className={`p-2 rounded-md border-l-4 ${levelClasses.border} ${levelClasses.bg}`}
    >
      <div className="flex items-center text-xs mb-0.5">
        <span className="text-gray-500 mr-2 select-none">{formatLogTimestamp(log.timestamp)}</span>
        <span className={`font-semibold ${levelClasses.text}`}>
          [{log.level.toUpperCase()}]
        </span>
      </div>
      <p className={`text-sm ${levelClasses.text} break-words`}>{log.message}</p>
      {log.details && (
        <pre className="mt-1 ml-4 p-1.5 bg-gray-100 border border-gray-200 rounded text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap break-all custom-scrollbar">
          {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
        </pre>
      )}
    </div>
  );
};

export const LogListItem = React.memo(LogListItemInternal);
LogListItem.displayName = 'LogListItem';
