// src/app/api/agent/task/[taskId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  getTaskById as dbGetTaskById,
  updateTask as dbUpdateTask,
  deleteTask as dbDeleteTask,
} from '@/lib/database/services';
import { Task, Prisma } from '@prisma/client'; // Use Prisma type for DB interactions
import { useAgentStore } from '@/lib/agent/StateManager'; // For logging

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  const addLog = useAgentStore.getState().addLog;
  const { taskId } = await context.params;
  try {
    const task = await dbGetTaskById(taskId); // This service already handles JSON parsing for GET
    if (!task) {
      addLog({ level: 'warn', message: `[API] GET Task: Task ${taskId} not found.`});
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    addLog({ level: 'info', message: `[API] GET Task: Retrieved task ${taskId}.`});
    return NextResponse.json(task, { status: 200 });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    addLog({ level: 'error', message: `[API] GET Task: Error retrieving task ${taskId}.`, details: { error: errorMessage }});
    return NextResponse.json({ error: 'Failed to retrieve task', details: errorMessage }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  const addLog = useAgentStore.getState().addLog;
  const { taskId } = await context.params;
  try {
    const body = await request.json();
    // Ensure 'id', 'missionId', 'createdAt', 'updatedAt' are not in body or are ignored
    const { id, missionId, createdAt, updatedAt, ...updateData } = body;

    if (Object.keys(updateData).length === 0) {
        addLog({ level: 'warn', message: `[API] PUT Task: No update data provided for task ${taskId}.`});
        return NextResponse.json({ error: 'No update data provided.' }, { status: 400 });
    }

    // dbUpdateTask service handles JSON stringification for result, failureDetails, validationOutcome
    const updatedTask = await dbUpdateTask(taskId, updateData);
    if (!updatedTask) {
      addLog({ level: 'warn', message: `[API] PUT Task: Task ${taskId} not found for update.`});
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Parse JSON string fields for the response
    let responseTask = updatedTask;
    if (responseTask) {
        const parseJsonIfNeeded = (jsonValue: Prisma.JsonValue | null) => {
          if (typeof jsonValue === 'string') {
            try { return JSON.parse(jsonValue); }
            catch (e) {
              addLog({level: 'warn', message: '[API] PUT Task: Failed to parse JSON string from task field in response', details: { taskId: responseTask.id, field: 'unknown', value: jsonValue, error: (e as Error).message }});
              return jsonValue;
            }
          }
          return jsonValue;
        };
        responseTask = {
            ...responseTask,
            result: parseJsonIfNeeded(responseTask.result) as any, // Cast needed if result in responseTask is expected to be specific object
            failureDetails: parseJsonIfNeeded(responseTask.failureDetails) as any, // Cast needed for same reason
            validationOutcome: parseJsonIfNeeded(responseTask.validationOutcome) as any, // Cast needed for same reason
        }
    }

    addLog({ level: 'info', message: `[API] PUT Task: Updated task ${taskId}.`, details: { updates: updateData }});
    return NextResponse.json(responseTask, { status: 200 });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    addLog({ level: 'error', message: `[API] PUT Task: Error updating task ${taskId}.`, details: { error: errorMessage }});
    return NextResponse.json({ error: 'Failed to update task', details: errorMessage }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  const addLog = useAgentStore.getState().addLog;
  const { taskId } = await context.params;
  try {
    const deletedTask = await dbDeleteTask(taskId);
    // Prisma's delete throws P2025 if not found.
    // Service dbDeleteTask returns the deleted task object or throws error.
    // If it returns null on "not found" (custom behavior), then !deletedTask is fine.
    // More robust to catch P2025.

    addLog({ level: 'info', message: `[API] DELETE Task: Deleted task ${taskId}.`});
    return NextResponse.json({ message: 'Task deleted successfully' }, { status: 200 });
  } catch (error: any) {
    // Handle Prisma's P2025 error for "Record to delete not found"
    // @ts-ignore TODO: type check Prisma errors more robustly
    if (error.code === 'P2025') {
        addLog({ level: 'warn', message: `[API] DELETE Task: Task ${taskId} not found for deletion.`});
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    addLog({ level: 'error', message: `[API] DELETE Task: Error deleting task ${taskId}.`, details: { error: errorMessage }});
    return NextResponse.json({ error: 'Failed to delete task', details: errorMessage }, { status: 500 });
  }
}
