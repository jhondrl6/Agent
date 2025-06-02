import { NextRequest, NextResponse } from 'next/server';
import { Mission, Task } from '@/lib/types/agent';
import { TaskDecomposer } from '@/lib/agent/TaskDecomposer';
import { v4 as uuidv4 } from 'uuid'; // Using uuid for unique IDs
import { useAgentStore } from '@/lib/agent/StateManager';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { goal } = body;

    if (!goal || typeof goal !== 'string' || goal.trim() === '') {
      return NextResponse.json({ error: 'Goal is required and must be a non-empty string.' }, { status: 400 });
    }

    // 3. Create a unique id for the mission
    const missionId = uuidv4();

    // 4. Instantiate the TaskDecomposer
    // 4. Instantiate the TaskDecomposer with Gemini API Key
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error('[MissionRoute] Error: GEMINI_API_KEY is not defined in environment variables.');
      // Return a 500 error as this is a server configuration issue
      return NextResponse.json({ error: 'Server configuration error: Gemini API key is missing. Cannot decompose mission.' }, { status: 500 });
    }
    const taskDecomposer = new TaskDecomposer(geminiApiKey);

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
      console.log(`[MissionRoute] Mission ${missionId} decomposed into ${decomposedTasks.length} tasks.`);
    } catch (decompositionError) {
      console.error(`[MissionRoute] Error during task decomposition for mission ${missionId}:`, decompositionError);
      // Decide if mission should still be created or if it's a hard failure
      // For now, let's create it with no tasks and status 'failed' or 'pending' with error
      newMission.status = 'failed'; // Or some other status indicating decomposition failure
      newMission.result = decompositionError instanceof Error ? decompositionError.message : "Task decomposition failed";
      // Still return the mission object so the client knows an attempt was made
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
    // For Next.js serverless functions, this means the store instance is fresh per request,
    // which won't persist state across API calls without external storage.
    // This is suitable for our current step where the client will re-fetch or get updates.
    useAgentStore.getState().createMission(newMission);
    console.log(`[MissionRoute] Mission ${newMission.id} added to Zustand store (server-side instance).`);

    return NextResponse.json(newMission, { status: 201 });

  } catch (error) {
    console.error('[MissionRoute] General error creating mission:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to create mission', details: errorMessage }, { status: 500 });
  }
}
