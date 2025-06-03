// src/hooks/useGlobalAgentStatus.ts
import { useState, useEffect } from 'react';

export interface AgentStatusData {
  isActive: boolean;
  activeMissionIds: string[];
  activeMissionsCount: number;
}

const POLLING_INTERVAL_MS = process.env.NEXT_PUBLIC_AGENT_STATUS_POLLING_INTERVAL_MS
  ? parseInt(process.env.NEXT_PUBLIC_AGENT_STATUS_POLLING_INTERVAL_MS, 10)
  : 5000; // Default to 5 seconds

export function useGlobalAgentStatus() {
  const [statusData, setStatusData] = useState<AgentStatusData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Initially true as we fetch on mount
  const [error, setError] = useState<Error | null>(null);

  const fetchStatus = async () => {
    // console.log('[useGlobalAgentStatus] Fetching agent status...');
    setIsLoading(true); // Set loading true at the beginning of a fetch attempt
    try {
      const response = await fetch('/api/agent/status');
      if (!response.ok) {
        let errorMsg = `Error fetching agent status: ${response.status} ${response.statusText}`;
        try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
        } catch (jsonError) {
            // Could not parse JSON, stick with the status text
        }
        throw new Error(errorMsg);
      }
      const data: AgentStatusData = await response.json();
      setStatusData(data);
      setError(null); // Clear any previous error
    } catch (err) {
      console.error('[useGlobalAgentStatus] Error during fetch:', err);
      if (err instanceof Error) {
        setError(err);
      } else {
        setError(new Error('An unknown error occurred while fetching agent status.'));
      }
      // Optionally, you might want to clear statusData or set it to a default error state:
      // setStatusData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus(); // Initial fetch

    const intervalId = setInterval(fetchStatus, POLLING_INTERVAL_MS);

    // Cleanup function to clear the interval when the component unmounts
    return () => {
      clearInterval(intervalId);
      // console.log('[useGlobalAgentStatus] Cleared polling interval.');
    };
  }, []); // Empty dependency array means this effect runs once on mount and cleanup on unmount

  return { statusData, isLoading, error };
}

// Example usage (not part of the hook itself):
/*
function MyComponentUsingStatus() {
  const { statusData, isLoading, error } = useGlobalAgentStatus();

  if (isLoading && !statusData) { // Show loading only on initial load or if data is cleared during loading
    return <p>Loading agent status...</p>;
  }

  if (error) {
    return <p>Error loading agent status: {error.message}</p>;
  }

  if (!statusData) {
    return <p>No agent status data available.</p>;
  }

  return (
    <div>
      <h1>Global Agent Status</h1>
      <p>Is Active: {statusData.isActive ? 'Yes' : 'No'}</p>
      <p>Active Missions Count: {statusData.activeMissionsCount}</p>
      {statusData.isActive && (
        <>
          <p>Active Mission IDs:</p>
          <ul>
            {statusData.activeMissionIds.map(id => <li key={id}>{id}</li>)}
          </ul>
        </>
      )}
      {isLoading && <p><em>(Refreshing status...)</em></p>}
    </div>
  );
}
*/
