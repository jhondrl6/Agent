/** @jest-environment node */
// src/lib/database/services.test.ts
import { PrismaClient } from '@prisma/client';
import {
  createMission,
  getMissionById,
  updateMission,
  deleteMission,
  createTask,
  getTaskById,
  updateTask,
  deleteTask,
  getTasksByMissionId,
  disconnectPrisma,
} from './services'; // Adjust path as needed

// It's recommended to use a separate test database or reset data between tests.
// For this example, we'll assume a Prisma client instance.
// In a real setup, you might use a library like `prisma-mock` or set up a test DB environment.
const prisma = new PrismaClient();

describe('Database Services', () => {
  let missionId: string;
  let taskId: string;

  beforeAll(async () => {
    // Optional: Clear database before tests if not using transactions or per-test DBs
    // await prisma.task.deleteMany({});
    // await prisma.mission.deleteMany({});
  });

  afterAll(async () => {
    // Optional: Clean up created test data
    // await prisma.task.deleteMany({});
    // await prisma.mission.deleteMany({});
    await disconnectPrisma(); // Disconnect Prisma client
  });

  describe('Mission Services', () => {
    it('should create a new mission', async () => {
      const missionData = {
        goal: 'Unit Test Mission',
        status: 'pending',
      };
      const mission = await createMission(missionData);
      expect(mission).toHaveProperty('id');
      expect(mission.goal).toBe(missionData.goal);
      expect(mission.status).toBe(missionData.status);
      missionId = mission.id; // Save for later tests
    });

    it('should create a new mission with tasks', async () => {
        const missionDataWithTasks = {
            goal: 'Unit Test Mission with Tasks',
            status: 'pending',
            tasks: {
                create: [
                    { description: 'Task 1 for unit test', status: 'pending', result: JSON.stringify({info: "task1"}) },
                    { description: 'Task 2 for unit test', status: 'pending' }
                ]
            }
        };
        const mission = await createMission(missionDataWithTasks);
        expect(mission).toHaveProperty('id');
        expect(mission.goal).toBe(missionDataWithTasks.goal);
        expect(mission.tasks).toHaveLength(2);
        expect(mission.tasks[0].description).toBe('Task 1 for unit test');
        // createMission service does not parse JSON fields from tasks on return, it returns what DB stores.
        // getMissionById *does* parse them.
        // So, for tasks created via nested create, the 'result' field will be a string if it was stringified by Prisma.
        // The service `createTask` (and by extension, nested task creation in `createMission`) stringifies JSON.
        // So, we expect a string here.
        expect(mission.tasks[0].result).toBe(JSON.stringify({info: "task1"}));

        // To verify parsing, one would typically fetch this mission via getMissionById
        const fetchedMission = await getMissionById(mission.id);
        expect(fetchedMission?.tasks[0].result).toEqual({info: "task1"});
    });


    it('should retrieve a mission by its ID', async () => {
      const mission = await getMissionById(missionId);
      expect(mission).not.toBeNull();
      expect(mission?.id).toBe(missionId);
    });

    it('should update an existing mission', async () => {
      const updates = { status: 'completed', result: 'Mission Accomplished' };
      const updatedMission = await updateMission(missionId, updates);
      expect(updatedMission).not.toBeNull();
      expect(updatedMission?.status).toBe(updates.status);
      expect(updatedMission?.result).toBe(updates.result);
    });
  });

  describe('Task Services', () => {
    beforeAll(async () => {
      // Ensure a mission exists to associate tasks with
      if (!missionId) {
        const mission = await createMission({ goal: 'Task Test Mission', status: 'pending' });
        missionId = mission.id;
      }
    });

    it('should create a new task for a mission', async () => {
      const taskData = {
        missionId: missionId,
        description: 'Unit Test Task',
        status: 'pending',
        result: { detail: 'some data' }, // Service will stringify
      };
      const task = await createTask(taskData);
      expect(task).toHaveProperty('id');
      expect(task.description).toBe(taskData.description);
      expect(task.missionId).toBe(missionId);
      // The createTask service stringifies result, so it will be a string in the direct return.
      // The getTaskById service parses it back.
      expect(task.result).toBe(JSON.stringify({ detail: 'some data' }));
      taskId = task.id; // Save for later tests
    });

    it('should retrieve a task by its ID (and parse JSON fields)', async () => {
      const task = await getTaskById(taskId);
      expect(task).not.toBeNull();
      expect(task?.id).toBe(taskId);
      expect(task?.result).toEqual({ detail: 'some data' }); // Parsed back to object
    });

    it('should retrieve all tasks for a given mission ID', async () => {
      // Create another task for the same mission to test retrieval of multiple tasks
      await createTask({ missionId: missionId, description: 'Another Task', status: 'pending', result: {detail: "another task data"} });
      const tasks = await getTasksByMissionId(missionId);
      expect(tasks.length).toBeGreaterThanOrEqual(2); // At least the two created in this test context
      tasks.forEach(task => {
        expect(task.missionId).toBe(missionId);
        if (task.id === taskId) {
            expect(task.result).toEqual({ detail: 'some data' });
        } else {
            expect(task.result).toEqual({detail: "another task data"});
        }
      });
    });

    it('should update an existing task', async () => {
      const updates = { status: 'in-progress', retries: 1, failureDetails: { reason: 'minor issue' } };
      const updatedTask = await updateTask(taskId, updates);
      expect(updatedTask).not.toBeNull();
      expect(updatedTask?.status).toBe(updates.status);
      expect(updatedTask?.retries).toBe(updates.retries);
      // The updateTask service stringifies JSON fields.
      expect(updatedTask?.failureDetails).toBe(JSON.stringify({ reason: 'minor issue' }));

      // Verify with getTaskById to see parsed value
      const fetchedTask = await getTaskById(taskId);
      expect(fetchedTask?.failureDetails).toEqual({ reason: 'minor issue' });
    });
  });

  describe('Delete Operations', () => {
    let tempMissionId: string;
    let tempTaskId: string;

    beforeEach(async () => {
        // Create a fresh mission and task for each delete test to avoid interference
        const mission = await createMission({ goal: 'To Be Deleted Mission', status: 'pending' });
        tempMissionId = mission.id;
        const task = await createTask({ missionId: tempMissionId, description: 'To Be Deleted Task', status: 'pending' });
        tempTaskId = task.id;
    });

    it('should delete an existing task', async () => {
      await deleteTask(tempTaskId);
      const task = await getTaskById(tempTaskId);
      expect(task).toBeNull();
    });

    it('should delete an existing mission and its tasks (due to cascade)', async () => {
      // First, verify task exists
      let task = await getTaskById(tempTaskId);
      expect(task).not.toBeNull();

      await deleteMission(tempMissionId);
      const mission = await getMissionById(tempMissionId);
      expect(mission).toBeNull();

      // Verify task associated with the deleted mission is also deleted (cascade)
      task = await getTaskById(tempTaskId); // Re-fetch task after mission deletion
      expect(task).toBeNull();
    });
  });
});
