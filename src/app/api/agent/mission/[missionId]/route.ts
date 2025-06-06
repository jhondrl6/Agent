// src/app/api/agent/mission/[missionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  getMissionById as dbGetMissionById,
  updateMission as dbUpdateMission,
  deleteMission as dbDeleteMission,
} from '@/lib/database/services';
import { Mission as PrismaMission, Task as PrismaTask } from '@prisma/client'; // Use Prisma type for DB interactions
import { useAgentStore } from '@/lib/agent/StateManager'; // For logging

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ missionId: string }> }
) {
  const addLog = useAgentStore.getState().addLog;
  const { missionId } = await context.params;
  try {
    const mission = await dbGetMissionById(missionId);
    if (!mission) {
      addLog({ level: 'warn', message: `[API] GET Mission: Mission ${missionId} not found.`});
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    }
    addLog({ level: 'info', message: `[API] GET Mission: Retrieved mission ${missionId}.`});
    return NextResponse.json(mission, { status: 200 });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    addLog({ level: 'error', message: `[API] GET Mission: Error retrieving mission ${missionId}.`, details: { error: errorMessage }});
    return NextResponse.json({ error: 'Failed to retrieve mission', details: errorMessage }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ missionId: string }> }
) {
  const addLog = useAgentStore.getState().addLog;
  const { missionId } = await context.params;
  try {
    const body = await request.json();
    // Ensure 'id', 'createdAt', 'updatedAt' are not in body or are ignored by dbUpdateMission
    const { id, createdAt, updatedAt, tasks, ...updateData } = body;

    if (Object.keys(updateData).length === 0) {
        addLog({ level: 'warn', message: `[API] PUT Mission: No update data provided for mission ${missionId}.`});
        return NextResponse.json({ error: 'No update data provided.' }, { status: 400 });
    }

    const updatedMission: PrismaMission | null = await dbUpdateMission(missionId, updateData);
    if (!updatedMission) {
      addLog({ level: 'warn', message: `[API] PUT Mission: Mission ${missionId} not found for update.`});
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    }

    // Explicitly cast to include tasks and ensure it's an array for processing
    const missionWithTasks = updatedMission as (PrismaMission & { tasks: PrismaTask[] });

    // Parse JSON string fields in tasks for the response
    if (missionWithTasks && missionWithTasks.tasks && Array.isArray(missionWithTasks.tasks)) {
      missionWithTasks.tasks = missionWithTasks.tasks.map((task: PrismaTask) => {
        const parseJsonIfNeeded = (jsonString: string | null | undefined) => {
          if (typeof jsonString === 'string') {
            try { return JSON.parse(jsonString); }
            catch (e) {
              // Ensure task.id is accessible; depends on PrismaTask structure
              const taskIdForLog = typeof task === 'object' && task !== null && 'id' in task ? task.id : 'unknown_task_id';
              addLog({level: 'warn', message: '[API] PUT Mission: Failed to parse JSON string from task field in response', details: { taskId: taskIdForLog, field: 'unknown', value: jsonString, error: (e as Error).message }});
              return jsonString;
            }
          }
          return jsonString;
        };
        return {
          ...task,
          result: parseJsonIfNeeded(task.result as string | null | undefined),
          failureDetails: parseJsonIfNeeded(task.failureDetails as string | null | undefined),
          validationOutcome: parseJsonIfNeeded(task.validationOutcome as string | null | undefined),
        };
      });
    }

    addLog({ level: 'info', message: `[API] PUT Mission: Updated mission ${missionId}.`, details: { updates: updateData }});
    return NextResponse.json(missionWithTasks, { status: 200 });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    addLog({ level: 'error', message: `[API] PUT Mission: Error updating mission ${missionId}.`, details: { error: errorMessage }});
    return NextResponse.json({ error: 'Failed to update mission', details: errorMessage }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ missionId: string }> }
) {
  const addLog = useAgentStore.getState().addLog;
  const { missionId } = await context.params;
  try {
    const deletedMission = await dbDeleteMission(missionId);
    // dbDeleteMission service was modified to delete related tasks first, then the mission.
    // If cascade delete is set up in schema.prisma, dbDeleteMission simply deletes the mission.
    // Prisma's delete throws an error (P2025) if the record to delete is not found.
    // The service `deleteMission` should ideally handle this or let it propagate.
    // The current `deleteMission` service in `services.ts` manually deletes tasks then mission. If mission not found, it will error.
    // If cascade is active, Prisma handles task deletion.

    // Assuming deletedMission will be null/undefined if not found, or error is thrown.
    // The prompt's code for dbDeleteMission implies it might return null if not found
    // (e.g. "await prisma.task.deleteMany({ where: { missionId } }); return prisma.mission.delete(...)")
    // However, prisma.mission.delete will throw P2025 if the mission itself is not found.
    // So, the `if (!deletedMission)` check might be optimistic if P2025 is thrown before it.
    // The catch block for P2025 is more robust.

    addLog({ level: 'info', message: `[API] DELETE Mission: Deleted mission ${missionId}.`});
    return NextResponse.json({ message: 'Mission deleted successfully' }, { status: 200 });
  } catch (error: any) {
    // Handle Prisma's P2025 error for "Record to delete not found"
    // @ts-ignore TODO: type check Prisma errors more robustly
    if (error.code === 'P2025') {
        addLog({ level: 'warn', message: `[API] DELETE Mission: Mission ${missionId} not found for deletion.`});
        return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
    }
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    addLog({ level: 'error', message: `[API] DELETE Mission: Error deleting mission ${missionId}.`, details: { error: errorMessage }});
    return NextResponse.json({ error: 'Failed to delete mission', details: errorMessage }, { status: 500 });
  }
}
