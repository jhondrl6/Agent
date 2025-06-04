// src/hooks/useAgent.ts
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAgentStore } from '@/lib/agent/StateManager';
import { Mission } from '@/lib/types/agent'; // Assuming Mission type is available

const POLLING_INTERVAL = 5000; // Poll every 5 seconds

export function useAgent() {
  const { missions, agentState, updateMissionState, addLog, setAgentLoading, clearAgentError } = useAgentStore();
  const [activeMissionId, setActiveMissionId] = useState<string | null>(agentState.currentMissionId || null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentMission = activeMissionId ? missions[activeMissionId] : null;

  const fetchMissionStatus = useCallback(async (missionId: string) => {
    if (!missionId) return;

    setAgentLoading(true, `Fetching status for mission ${missionId}...`);
    try {
      const response = await fetch(`/api/agent/status/${missionId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch status: ${response.statusText}`);
      }
      const missionData: Mission = await response.json();
      updateMissionState(missionId, missionData);
      clearAgentError();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching mission status';
      console.error('Error fetching mission status:', error);
      useAgentStore.getState().setAgentError(errorMessage); // Use getState for errors in async callbacks
      addLog({
        level: 'error',
        message: `Failed to fetch status for mission ${missionId}.`,
        details: { error: errorMessage, missionId },
      });
    } finally {
      setAgentLoading(false);
    }
  }, [updateMissionState, addLog, setAgentLoading, clearAgentError]);

  // Effect to start/stop polling when activeMissionId changes
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (activeMissionId) {
      fetchMissionStatus(activeMissionId); // Fetch immediately when mission ID is set
      intervalRef.current = setInterval(() => {
        fetchMissionStatus(activeMissionId);
      }, POLLING_INTERVAL);
    }

    // Cleanup interval on component unmount or when activeMissionId changes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [activeMissionId, fetchMissionStatus]);

  // Effect to sync activeMissionId with global store's currentMissionId
  useEffect(() => {
    if (agentState.currentMissionId !== activeMissionId) {
      setActiveMissionId(agentState.currentMissionId || null);
    }
  }, [agentState.currentMissionId, activeMissionId]);

  const setCurrentMissionId = useCallback((missionId: string | null) => {
    // This function updates the Zustand store, which then triggers the effect above.
    useAgentStore.getState().setAgentState({ currentMissionId: missionId === null ? undefined : missionId });
    // No need to call setActiveMissionId here directly, effect will handle it.
  }, []);

  return {
    currentMission,
    isLoading: agentState.isLoading,
    error: agentState.error,
    logs: useAgentStore((state) => state.logs), // Expose logs if needed by components using this hook
    setCurrentMissionId, // Function to change the active mission
    activeMissionId, // Expose activeMissionId for transparency, if needed
  };
}
