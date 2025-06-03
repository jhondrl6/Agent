// src/components/dashboard/MissionInput.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useAgentStore } from '@/lib/agent/StateManager';
import { Mission, Task } from '@/lib/types/agent'; // Make sure Task is imported if used in Mission type display

// Placeholder Button and Input components
// TODO: Replace these with actual components from src/components/ui/ when they are implemented
const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`border p-2 rounded mr-0 sm:mr-2 mb-2 sm:mb-0 flex-grow w-full sm:w-auto text-black focus:ring-2 focus:ring-blue-500 outline-none ${props.disabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-gray-100' } ${props.className || ''}`}
  />
);

const Button = (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...props}
    className={`bg-blue-600 hover:bg-blue-700 text-white font-semibold p-2 rounded disabled:bg-gray-500 flex items-center justify-center transition-colors duration-150 ease-in-out focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 outline-none min-w-[150px] ${props.className || ''}`}
  >
    {props.disabled && (
      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    )}
    {props.children}
  </button>
);


export function MissionInput() {
  const [missionGoal, setMissionGoal] = useState('');
  const [isLoading, setIsLoading] = useState(false); // Local loading for API call
  const [error, setError] = useState<string | null>(null); // Local error for API call
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);

  // Access store state if needed, e.g., to display global errors or loading state
  const agentErrorGlobal = useAgentStore((state) => state.agentState.error);
  const globalIsLoading = useAgentStore((state) => state.agentState.isLoading); // Example of accessing global loading

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!missionGoal.trim()) {
      setError('Mission goal cannot be empty.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setLastCreatedId(null);

    try {
      const response = await fetch('/api/agent/mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: missionGoal }),
      });

      // It's good practice to check content-type before parsing as JSON
      // For now, we assume it's always JSON or an error that JSON.parse can handle or fail predictably.
      const data: Mission | { error: string; details?: string } = await response.json();

      if (!response.ok) {
        const errorMsg = (data as { error: string; details?: string }).error || `Failed to create mission (status: ${response.status})`;
        const errorDetails = (data as { error: string; details?: string }).details;
        throw new Error(errorDetails ? `${errorMsg}: ${errorDetails}` : errorMsg);
      }

      // API call was successful, mission is now in the store via the API route
      // The API route itself calls createMission on the store.
      // The client-side store will not automatically update unless we implement a mechanism for it (e.g., re-fetching, websockets, or manual update).
      // For now, we just log it and show a success message with ID.
      console.log('Mission creation request successful:', data);
      setLastCreatedId((data as Mission).id);
      setMissionGoal('');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      console.error('Error creating mission:', errorMessage);
      setError(errorMessage);
      // Optionally, update global agent error state if appropriate
      // useAgentStore.getState().setAgentError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Optional: Display global agent error from the store
  useEffect(() => {
    if (agentErrorGlobal) {
      // Example: Prioritize local error, or append global error
      if (!error) {
        setError(`Global Agent Error: ${agentErrorGlobal}`);
      } else {
        console.warn("Local error exists, not overwriting with global agent error:", agentErrorGlobal)
      }
    }
  }, [agentErrorGlobal, error]); // Add error to dependency array

  return (
    <div className="p-6 my-4 bg-white border border-gray-200 rounded-xl shadow-lg space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">Launch New Mission</h2>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
        <Input
          type="text"
          value={missionGoal}
          onChange={(e) => {
            setMissionGoal(e.target.value);
            if (error && e.target.value.trim()) setError(null);
          }}
          placeholder="Enter your research mission goal..."
          disabled={isLoading || globalIsLoading} // Consider disabling if global agent is busy too
          aria-label="Mission Goal"
        />
        <Button type="submit" disabled={isLoading || globalIsLoading} className="w-full sm:w-auto">
          {isLoading ? 'Starting...' : 'Start Mission'}
        </Button>
      </form>
      {error && <p className="text-red-600 mt-2 text-sm bg-red-50 p-3 rounded-md">Error: {error}</p>}
      {lastCreatedId && !error && (
        <div className="mt-4 p-3 border border-green-400 rounded-lg bg-green-50 text-green-700">
          <h3 className="font-semibold">Mission Successfully Initiated!</h3>
          <p>ID: <span className="font-mono bg-green-100 px-1 py-0.5 rounded">{lastCreatedId}</span></p>
          <p className="text-xs text-green-600 mt-1">
            The mission has been sent for processing. Its status and tasks will be updated in the respective panels.
          </p>
        </div>
      )}
    </div>
  );
}
