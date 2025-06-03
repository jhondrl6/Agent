import { NextRequest, NextResponse } from 'next/server';
import { Mission, Task } from '@/lib/types/agent';
import { TaskDecomposer } from '@/lib/agent/TaskDecomposer';
import { v4 as uuidv4 } from 'uuid';
import { useAgentStore } from '@/lib/agent/StateManager';
import { LogLevel } from '@/lib/types/agent'; // For LogLevel type

export async function POST(req: NextRequest) {
  const addLog = useAgentStore.getState().addLog; // Get addLog function once
  try {
    const body = await req.json();
    const { goal } = body;
    addLog({ level: 'system', message: '[API] Received new mission request.', details: { goal } });

    if (!goal || typeof goal !== 'string' || goal.trim() === '') {
      return NextResponse.json({ error: 'Goal is required and must be a non-empty string.' }, { status: 400 });
    }

    // 3. Create a unique id for the mission
    const missionId = uuidv4();

    // 4. Instantiate the TaskDecomposer
    // 4. Instantiate the TaskDecomposer with Gemini API Key
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      const errorMsg = 'Server configuration error: Gemini API key is missing. Cannot decompose mission.';
      addLog({ level: 'error', message: '[API] Mission creation failed due to missing Gemini API key.', details: { goal } });
      console.error('[MissionRoute] Error: GEMINI_API_KEY is not defined in environment variables.');
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
    // Pass addLog to TaskDecomposer
    const taskDecomposer = new TaskDecomposer(geminiApiKey, addLog);

    // 5. Create a preliminary Mission object
    let newMission: Mission = {
      id: missionId,
      goal: goal,
      tasks: [],
      status: 'pending', // Initial status
      result: undefined,
    };

    console.log(`[MissionRoute] Created preliminary mission: ${missionId} for goal: "${goal}"`);

    // 6. Call taskDecomposer.decomposeMission(newMission)
    let decomposedTasks: Task[] = [];
    try {
      decomposedTasks = await taskDecomposer.decomposeMission(newMission);
      // Log already happens inside decomposeMission for success/failure of that step
    } catch (decompositionError: any) {
      // This catch block might be redundant if decomposeMission handles its own errors and returns a fallback.
      // However, if decomposeMission itself throws an unhandled exception, this will catch it.
      const errorMsg = decompositionError instanceof Error ? decompositionError.message : "Task decomposition failed critically.";
      addLog({ level: 'error', message: `[API] Critical error during task decomposition for mission ${missionId}.`, details: { error: errorMsg, goal } });
      newMission.status = 'failed';
      newMission.result = errorMsg;
      useAgentStore.getState().createMission(newMission); // Store the failed mission attempt
      return NextResponse.json(newMission, { status: 500 });
    }

    // 7. Update newMission.tasks with the decomposed tasks
    newMission.tasks = decomposedTasks;

    // 8. Update newMission.status
    //    If tasks are generated, it's ready to be picked up or is 'in-progress' if auto-started.
    //    For now, let's set to 'pending' implying it's ready for execution.
    if (decomposedTasks.length > 0) {
      newMission.status = 'pending'; // Or 'in-progress' if tasks are immediately queued/run
    } else {
      // If no tasks were generated (e.g., decomposition returned empty but no error)
      // This might be a valid scenario or an issue with decomposition logic
      console.warn(`[MissionRoute] Mission ${missionId} resulted in 0 tasks after decomposition.`);
      newMission.status = 'pending'; // Or handle as an error/special case
    }

    // 9. (Skipping StateManager for now)

    // 10. Return the newMission object
    // Use 201 Created status code for successful creation

    // Update the Zustand store
    // Note: API routes are server-side, Zustand is typically client-side.
    // Calling getState() here works because it's a direct, synchronous state update on the server instance
    // if this API route were part of a long-running server process.
    // For Next.js serverless functions, this means the store instance is fresh per request, etc.
    useAgentStore.getState().createMission(newMission); // This adds mission with tasks to store
    addLog({ level: 'system', message: `[API] Mission ${newMission.id} created and stored.`, details: { missionId: newMission.id, goal: newMission.goal, taskCount: newMission.tasks.length } });
    // console.log(`[MissionRoute] Mission ${newMission.id} added to Zustand store (server-side instance).`); // Replaced by addLog

    return NextResponse.json(newMission, { status: 201 });

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    addLog({ level: 'error', message: '[API] General error creating mission.', details: { error: errorMessage, goal: req.url } }); // req.url might show the goal if it was a GET, for POST use body
    // console.error('[MissionRoute] General error creating mission:', error); // Replaced by addLog
    return NextResponse.json({ error: 'Failed to create mission', details: errorMessage }, { status: 500 });
  }
}
