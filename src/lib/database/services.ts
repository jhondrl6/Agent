// src/lib/database/services.ts
import { PrismaClient, Mission, Task, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Utility to parse JSON string fields if they are strings
function parseJsonStringIfNeeded(jsonValue: Prisma.JsonValue | null): any {
  if (typeof jsonValue === 'string') {
    try {
      return JSON.parse(jsonValue);
    } catch (e) {
      // console.warn("Failed to parse JSON string, returning original string:", jsonValue, e);
      return jsonValue; // Return original string if parsing fails
    }
  }
  return jsonValue; // Return numbers, booleans, objects, arrays, null as is
}

// Mission Services
export async function createMission(missionData: {
  goal: string;
  status: string;
  result?: string;
  tasks?: { create: Prisma.TaskCreateWithoutMissionInput[] }; // For creating tasks along with mission
}): Promise<Prisma.MissionGetPayload<{ include: { tasks: true } }>> {
  return prisma.mission.create({
    data: {
      ...missionData,
      // tasks field is already part of missionData if provided, and correctly typed.
      // If missionData.tasks is undefined, it will just not be included in the spread, which is fine.
    },
    include: { tasks: true }, // Include tasks in the returned mission object
  }) as unknown as Promise<Prisma.MissionGetPayload<{ include: { tasks: true } }>>;
}

export async function getMissionById(missionId: string): Promise<Mission | null> {
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    include: { tasks: true },
  });
  if (mission && mission.tasks) {
    mission.tasks = mission.tasks.map(task => ({
      ...task,
      result: parseJsonStringIfNeeded(task.result),
      failureDetails: parseJsonStringIfNeeded(task.failureDetails),
      validationOutcome: parseJsonStringIfNeeded(task.validationOutcome),
    }));
  }
  return mission;
}

export async function updateMission(
  missionId: string,
  updates: Partial<Omit<Mission, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Mission | null> {
  return prisma.mission.update({
    where: { id: missionId },
    data: updates,
    include: { tasks: true },
  });
}

export async function deleteMission(missionId: string): Promise<Mission | null> {
  // Prisma requires related records (tasks) to be deleted first if there's a required relation.
  // Or, use cascaded deletes in the schema if appropriate (prisma.schema).
  // For now, we'll assume tasks should be deleted with their mission.
  // This can be handled by setting up cascading deletes in `schema.prisma`
  // by adding `onDelete: Cascade` to the mission field in the Task model.
  // Let's assume we will add that to the schema later.
  // If not, tasks must be deleted manually here first.
  await prisma.task.deleteMany({ where: { missionId } });
  return prisma.mission.delete({
    where: { id: missionId },
  });
}

export async function getMissionsByStatus(status: string): Promise<Mission[]> {
  const missions = await prisma.mission.findMany({
    where: { status: status },
    include: { tasks: true }, // Include tasks, consistent with getMissionById
  });

  // Post-process tasks to parse JSON fields, similar to getMissionById
  return missions.map(mission => {
    if (mission.tasks) {
      mission.tasks = mission.tasks.map(task => ({
        ...task,
        result: parseJsonStringIfNeeded(task.result),
        failureDetails: parseJsonStringIfNeeded(task.failureDetails),
        validationOutcome: parseJsonStringIfNeeded(task.validationOutcome),
      }));
    }
    return mission;
  });
}

export async function getProcessableMissionsForEngine(): Promise<Prisma.MissionGetPayload<{ include: { tasks: true } }>[]> {
  const missions = await prisma.mission.findMany({
    where: {
      OR: [
        { status: 'pending' },
        { status: 'in-progress' },
      ],
    },
    include: {
      tasks: {
        orderBy: {
          createdAt: 'asc'
        }
      },
    },
  });
  // Note: This function intentionally does NOT parse JSON fields within tasks (result, failureDetails, validationOutcome)
  // The AgentExecutionEngine's mapPrismaTaskToExecutorTask is responsible for handling Prisma.JsonValue from these fields.
  return missions;
}


// Task Services
export async function createTask(taskData: {
  missionId: string;
  description: string;
  status: string;
  result?: any;
  retries?: number;
  failureDetails?: any;
  validationOutcome?: any;
}): Promise<Task> {
  return prisma.task.create({
    data: {
      ...taskData,
      result: taskData.result ? JSON.stringify(taskData.result) : undefined,
      failureDetails: taskData.failureDetails ? JSON.stringify(taskData.failureDetails) : undefined,
      validationOutcome: taskData.validationOutcome ? JSON.stringify(taskData.validationOutcome) : undefined,
    },
  });
}

export async function getTaskById(taskId: string): Promise<Task | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });
  if (task) {
    return {
      ...task,
      result: parseJsonStringIfNeeded(task.result),
      failureDetails: parseJsonStringIfNeeded(task.failureDetails),
      validationOutcome: parseJsonStringIfNeeded(task.validationOutcome),
    };
  }
  return null;
}

export async function updateTask(
  taskId: string,
  updates: Partial<Omit<Task, 'id' | 'missionId' | 'createdAt' | 'updatedAt'>>
): Promise<Task | null> {
  const { result, failureDetails, validationOutcome, ...restOfUpdates } = updates;
  return prisma.task.update({
    where: { id: taskId },
    data: {
        ...restOfUpdates,
        result: result !== undefined ? JSON.stringify(result) : undefined,
        failureDetails: failureDetails !== undefined ? JSON.stringify(failureDetails) : undefined,
        validationOutcome: validationOutcome !== undefined ? JSON.stringify(validationOutcome) : undefined,
    },
  });
}

export async function deleteTask(taskId: string): Promise<Task | null> {
  return prisma.task.delete({
    where: { id: taskId },
  });
}

export async function getTasksByMissionId(missionId: string): Promise<Task[]> {
  const tasks = await prisma.task.findMany({
    where: { missionId: missionId },
  });
  return tasks.map(task => ({
    ...task,
    result: parseJsonStringIfNeeded(task.result),
    failureDetails: parseJsonStringIfNeeded(task.failureDetails),
    validationOutcome: parseJsonStringIfNeeded(task.validationOutcome),
  }));
}

// Optional: Add a function to disconnect Prisma client on application shutdown
export async function disconnectPrisma() {
  await prisma.$disconnect();
}

// Example of how to use these services (for testing purposes, not part of the file itself)
/*
async function main() {
  // Create a mission
  const newMission = await createMission({
    goal: 'Test mission',
    status: 'pending',
  });
  console.log('Created mission:', newMission);

  // Add a task to the mission
  if (newMission) {
    const newTask = await createTask({
      missionId: newMission.id,
      description: 'Test task 1 for mission ' + newMission.id,
      status: 'pending',
      result: { data: 'some initial data' },
    });
    console.log('Created task:', newTask);

    // Get mission by ID
    const fetchedMission = await getMissionById(newMission.id);
    console.log('Fetched mission with tasks:', fetchedMission);

    // Update task
    if (newTask) {
      const updatedTask = await updateTask(newTask.id, { status: 'completed', result: { data: 'updated data' } });
      console.log('Updated task:', updatedTask);
    }

    // Get tasks by mission ID
    const tasksForMission = await getTasksByMissionId(newMission.id);
    console.log('Tasks for mission:', tasksForMission);
  }
}

main().catch(e => {
  console.error(e);
  disconnectPrisma();
  process.exit(1);
});
*/
