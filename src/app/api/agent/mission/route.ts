import { NextRequest, NextResponse } from 'next/server';
import { Mission, Task } from '@/lib/types/agent';
import { TaskDecomposer } from '@/lib/agent/TaskDecomposer';
import { v4 as uuidv4 } from 'uuid';
import { useAgentStore } from '@/lib/agent/StateManager';
import { LogLevel } from '@/lib/types/agent'; // For LogLevel type

import { createMission as dbCreateMission } from '@/lib/database/services'; // New import

export async function POST(req: NextRequest) {
  const addLog = useAgentStore.getState().addLog;
  try {
    const body = await req.json();
    const { goal } = body;
    addLog({ level: 'system', message: '[API] Received new mission request.', details: { goal } });

    if (!goal || typeof goal !== 'string' || goal.trim() === '') {
      return NextResponse.json({ error: 'Goal is required and must be a non-empty string.' }, { status: 400 });
    }

    // Gemini API Key Check
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      const errorMsg = 'Server configuration error: Gemini API key is missing. Cannot decompose mission.';
      addLog({ level: 'error', message: '[API] Mission creation failed due to missing Gemini API key.', details: { goal } });
      console.error('[MissionRoute] Error: GEMINI_API_KEY is not defined in environment variables.');
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
    const taskDecomposer = new TaskDecomposer(geminiApiKey, addLog);

    // Preliminary mission object (some fields will be set by the DB)
    // We don't need to generate missionId with uuidv4() anymore if Prisma handles it.
    // The `Mission` type from `@prisma/client` will be used by the db service.
    // The `Mission` type from `lib/types/agent` is for the API response and Zustand.

    let missionToCreateInDb = {
      goal: goal,
      status: 'pending', // Initial status
      // result: undefined, // Handled by Prisma default
    };

    addLog({ level: 'info', message: `[API] Preparing to decompose mission for goal: "${goal}"`});

    let decomposedTasksData: Omit<Task, 'id' | 'missionId' | 'createdAt' | 'updatedAt'>[] = [];
    try {
      // Create a temporary mission object for the decomposer, as it might expect an ID or full mission structure.
      // The ID generated here is temporary and won't be the one stored in the DB.
      const tempMissionForDecomposition: Mission = {
        id: uuidv4(), // Temporary ID for decomposition context if needed
        goal: goal,
        tasks: [],
        status: 'pending',
        createdAt: new Date(), // Temporary
        updatedAt: new Date(), // Temporary
      };
      const tasksFromDecomposer = await taskDecomposer.decomposeMission(tempMissionForDecomposition);

      // Adapt decomposed tasks for Prisma's nested create
      decomposedTasksData = tasksFromDecomposer.map(t => {
        // Explicitly construct the object for Prisma's TaskCreateManyMissionInput-like type
        // This structure is Omit<PrismaTask, 'id' | 'missionId' | 'createdAt' | 'updatedAt' | 'mission'>
        // PrismaTask fields: description, status, result?, retries, failureDetails?, validationOutcome?
        return {
          description: t.description,
          status: t.status,
          // Ensure result, failureDetails, and validationOutcome are stringified or null
          result: t.result !== undefined ? JSON.stringify(t.result) : null,
          // Retries should default to 0 if not present from decomposer, as Prisma expects an Int.
          retries: t.retries !== undefined ? t.retries : 0,
          failureDetails: t.failureDetails !== undefined ? JSON.stringify(t.failureDetails) : null,
          validationOutcome: t.validationOutcome !== undefined ? JSON.stringify(t.validationOutcome) : null,
        };
      });
      addLog({ level: 'info', message: `[API] Mission for goal "${goal}" decomposed into ${decomposedTasksData.length} tasks.`});

    } catch (decompositionError: any) {
      const errorMsg = decompositionError instanceof Error ? decompositionError.message : "Task decomposition failed critically.";
      addLog({ level: 'error', message: `[API] Critical error during task decomposition for goal "${goal}".`, details: { error: errorMsg, goal } });
      // No mission created in DB yet, so just return error
      return NextResponse.json({ error: 'Task decomposition failed', details: errorMsg }, { status: 500 });
    }

    let persistedMission; // This will hold the mission object from the database

    if (decomposedTasksData.length === 0) {
        addLog({ level: 'warn', message: `[API] Mission for goal "${goal}" resulted in 0 tasks after decomposition. Creating mission without tasks.` });
    }

    try {
      // Create mission and its tasks in the database
      persistedMission = await dbCreateMission({
        ...missionToCreateInDb,
        tasks: decomposedTasksData.length > 0 ? { create: decomposedTasksData } : undefined,
      });
      addLog({ level: 'system', message: `[API] Mission ${persistedMission.id} and its tasks successfully saved to database.`, details: { missionId: persistedMission.id, goal: persistedMission.goal, taskCount: persistedMission.tasks.length } });
    } catch (dbError: any) {
      const errorMsg = dbError instanceof Error ? dbError.message : "Database operation failed.";
      addLog({ level: 'error', message: `[API] Failed to save mission for goal "${goal}" to database.`, details: { error: errorMsg, goal } });
      // Potentially store a "failed" mission in an alternative way or just error out
      return NextResponse.json({ error: 'Failed to save mission to database', details: errorMsg }, { status: 500 });
    }

    // Ensure the persistedMission object matches the structure expected by Zustand and the API response
    // The `Mission` type from `lib/types/agent` includes `createdAt` and `updatedAt` as Date objects.
    // Prisma returns them as Date objects by default.
    // The tasks within `persistedMission.tasks` also need to conform to the `Task` type from `lib/types/agent`.
    // JSON string fields (result, failureDetails, validationOutcome) are already parsed by `getMissionById`
    // but `createMission` in services currently returns them as string.
    // For simplicity here, we'll assume the structure is compatible or adjust if type errors occur during testing.
    // Let's refine the tasks from persistedMission to ensure they match the `Task` type from `lib/types/agent`
    // This is important because `useAgentStore.createMission` expects `Mission` from `lib/types/agent`.

    const apiMissionResponse: Mission = {
        ...persistedMission,
        // Prisma's Date objects are fine.
        // Tasks might need parsing if JSON fields were stringified and not parsed back by create service
        // The createMission service was updated to include tasks, but it doesn't parse JSON fields from tasks.
        // Let's adjust this part. The `persistedMission` from `dbCreateMission` includes tasks.
        // We need to ensure those tasks have their JSON fields parsed if they are strings.
        tasks: persistedMission.tasks.map(task => {
            const { result, failureDetails, validationOutcome, ...restOfTask } = task;
            // Ensure parsing only happens on actual strings, and handle nulls gracefully.
            // Prisma will return `null` for fields not set, not the string "null".
            const parseJsonIfNeeded = (jsonString: string | null | undefined) => {
                if (typeof jsonString === 'string') {
                    try {
                        return JSON.parse(jsonString);
                    } catch (e) {
                        // Log parsing error, return original string or handle as error
                        addLog({level: 'warn', message: '[API] Failed to parse JSON string from task field', details: { fieldValue: jsonString, error: (e as Error).message }});
                        return jsonString; // Or throw, or return a specific error structure
                    }
                }
                return jsonString; // Return null, undefined, or already parsed object as is
            };

            return {
                ...restOfTask,
                result: parseJsonIfNeeded(task.result),
                failureDetails: parseJsonIfNeeded(task.failureDetails),
                validationOutcome: parseJsonIfNeeded(task.validationOutcome),
            };
        })
    };


    // Update the Zustand store with the mission object from the database
    useAgentStore.getState().createMission(apiMissionResponse);
    addLog({ level: 'system', message: `[API] Mission ${apiMissionResponse.id} synced with Zustand store.`, details: { missionId: apiMissionResponse.id } });

    return NextResponse.json(apiMissionResponse, { status: 201 });

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    // Check if req.json() itself failed
    let goalAttempt = "unknown";
    try {
        // Try to get body again, but it might have been consumed or be malformed
        // This is a best-effort to get goal for logging if initial req.json() failed
        const bodyForError = await req.json().catch(() => ({ goal: "unavailable" }));
        goalAttempt = bodyForError.goal || "unknown";
    } catch (jsonError) {
        // silent catch if req.json() fails again
    }
    addLog({ level: 'error', message: '[API] General error creating mission.', details: { error: errorMessage, goalAttempt } });
    return NextResponse.json({ error: 'Failed to create mission', details: errorMessage }, { status: 500 });
  }
}
