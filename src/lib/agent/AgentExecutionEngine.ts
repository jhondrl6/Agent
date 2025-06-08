import { Mission, Task as PrismaTask, Prisma } from '@prisma/client'; // Renamed to avoid conflict, import Prisma
import * as dbService from '@/lib/database/services';
import { TaskExecutor, BackendTaskCallbacks } from './TaskExecutor';
import { Task as ExecutorTask, LogLevel } from '@/lib/types/agent'; // Import ExecutorTask and LogLevel
import * as logger from '@/lib/utils/logger';


// Define LogEntry structure, using LogLevel from your types
interface LogEntry {
  level: LogLevel;
  message: string;
  details?: any;
  timestamp: string;
}

export class AgentExecutionEngine {
  private backendCallbacks: BackendTaskCallbacks;
  private taskLogs: Map<string, LogEntry[]> = new Map();

  constructor() {
    this.backendCallbacks = {
      updateTaskState: async (missionId, taskId, updates) => {
        let result = updates.result;
        let failureDetails = updates.failureDetails;
        const taskSpecificLogs = this.taskLogs.get(taskId) || [];

        if (updates.status === 'completed' || updates.status === 'failed') {
          const logOutput = { logs: taskSpecificLogs };

          let currentResultObject: object;
          if (typeof result === 'object' && result !== null) {
            currentResultObject = result;
          } else if (result === null || result === undefined) {
            currentResultObject = { content: null };
          } else { // string, number, boolean
            currentResultObject = { content: String(result) };
          }

          let currentFailureDetailsObject: object;
          if (typeof failureDetails === 'object' && failureDetails !== null) {
            currentFailureDetailsObject = failureDetails;
          } else if (failureDetails === null || failureDetails === undefined) {
            currentFailureDetailsObject = { reason: null };
          } else { // string, number, boolean
            currentFailureDetailsObject = { reason: String(failureDetails) };
          }

          if (updates.status === 'completed') {
            result = JSON.stringify({ ...currentResultObject, ...logOutput  });
          } else { // 'failed'
            failureDetails = JSON.stringify({ ...currentFailureDetailsObject, ...logOutput });
          }
          this.taskLogs.delete(taskId);
        }

        await this.updateTaskStatus(
          taskId,
          updates.status as string,
          result as Prisma.JsonValue, // Cast to Prisma.JsonValue
          failureDetails as Prisma.JsonValue, // Cast to Prisma.JsonValue
          updates.validationOutcome as Prisma.JsonValue, // Cast to Prisma.JsonValue
        );
      },
      setAgentFailure: async (missionId, agentError) => {
        logger.error(`Agent failure for mission ${missionId}: ${agentError}`, 'AgentExecutionEngine');
        await this.updateMissionStatus(missionId, 'failed', JSON.stringify({ error: agentError, agentFailure: true }));
      },
    };
    logger.info('AgentExecutionEngine initialized.', 'AgentExecutionEngine');
  }

  private mapPrismaTaskToExecutorTask(prismaTask: PrismaTask): ExecutorTask {
    // Assuming `result`, `failureDetails`, and `validationOutcome` from Prisma are already parsed
    // from JSON strings to JS objects by the time they are fetched by `dbService`.
    // If they are Prisma.JsonValue, they might need further specific parsing if TaskExecutor expects richer types.
    // For now, we assume they are structurally compatible or `any` is acceptable for `result`.
    return {
      id: prismaTask.id,
      missionId: prismaTask.missionId,
      description: prismaTask.description,
      status: prismaTask.status as ExecutorTask['status'], // Cast status
      retries: prismaTask.retries,
      createdAt: prismaTask.createdAt,
      updatedAt: prismaTask.updatedAt,
      // Ensure these JSON fields are correctly handled. If dbService doesn't parse them,
      // we might need JSON.parse here, but typically Prisma handles this.
      result: prismaTask.result as any, // ExecutorTask.result is `any`
      failureDetails: prismaTask.failureDetails ? prismaTask.failureDetails as unknown as ExecutorTask['failureDetails'] : undefined,
      validationOutcome: prismaTask.validationOutcome ? prismaTask.validationOutcome as unknown as ExecutorTask['validationOutcome'] : undefined,
    };
  }

  private getTaskLogger(taskId: string): (entryData: { level: LogLevel; message: string; details?: any }) => void {
    if (!this.taskLogs.has(taskId)) {
      this.taskLogs.set(taskId, []);
    }
    return (entryData) => {
      const logs = this.taskLogs.get(taskId);
      if (logs) { // Should always be true due to the check above
        logs.push({ ...entryData, timestamp: new Date().toISOString() });
      }
       // Optional: Log to console as well, or rely on TaskExecutor's internal logging
      // logger.log(entryData.level, `Task[${taskId}]: ${entryData.message}`, 'TaskLogger', entryData.details);
    };
  }

  async getProcessableMissions(): Promise<Prisma.MissionGetPayload<{ include: { tasks: true } }>[]> {
    logger.debug('Fetching processable missions...', 'AgentExecutionEngine');
    const missions = await dbService.getProcessableMissionsForEngine();
    logger.debug(`Found ${missions.length} processable missions.`, 'AgentExecutionEngine', { count: missions.length });
    return missions;
  }

  async updateTaskStatus(
    taskId: string,
    status: string,
    result?: any,
    failureDetails?: any,
    validationOutcome?: any,
  ): Promise<void> {
    await dbService.updateTask(taskId, {
      status,
      result: result, // dbService.updateTask handles undefined and stringification
      failureDetails: failureDetails, // dbService.updateTask handles undefined and stringification
      validationOutcome: validationOutcome, // dbService.updateTask handles undefined and stringification
      // updatedAt is handled by dbService.updateTask if it's part of its logic, or automatically by Prisma
    });
  }

  async updateMissionStatus(
    missionId: string,
    status: string,
    result?: string, // Result is expected to be a string summary
  ): Promise<void> {
    await dbService.updateMission(missionId, {
      status,
      result: result, // dbService.updateMission handles undefined
      // updatedAt is handled by dbService.updateMission or automatically by Prisma
    });
  }

  async runOnce(): Promise<void> {
    logger.info('Starting AgentExecutionEngine runOnce cycle.', 'AgentExecutionEngine');
    const missions = await this.getProcessableMissions();
    logger.info(`[AgentEngine] Fetched ${missions.length} processable mission(s) in this cycle.`, 'AgentExecutionEngine', { count: missions.length });

    if (missions.length === 0) {
      logger.info('No processable missions found in this cycle.', 'AgentExecutionEngine');
      return;
    }

    for (const mission of missions) {
      logger.info(`[AgentEngine] Processing mission: ${mission.id}, Status: ${mission.status}, Task count: ${mission.tasks.length}`, 'AgentExecutionEngine', { missionId: mission.id, status: mission.status, taskCount: mission.tasks.length });
      logger.info(`Processing mission ${mission.id} (${mission.status}).`, 'AgentExecutionEngine', { missionId: mission.id });

      if (mission.status === 'pending') {
        await this.updateMissionStatus(mission.id, 'in-progress', 'Mission processing started.');
        logger.info(`Mission ${mission.id} status updated to in-progress.`, 'AgentExecutionEngine', { missionId: mission.id });
      }

      // Tasks should already be sorted by createdAt from getProcessableMissions
      const tasksToProcess = mission.tasks as PrismaTask[]; // Type assertion if tasks is not strictly PrismaTask[]

      for (const task of tasksToProcess) {
        if (task.status === 'pending' || task.status === 'retrying') {
          logger.info(`Executing task ${task.id} for mission ${mission.id}. Status: ${task.status}`, 'AgentExecutionEngine', { taskId: task.id, missionId: mission.id });
          const taskExecutor = new TaskExecutor(this.getTaskLogger(task.id), this.backendCallbacks);
          try {
            // The Task type for TaskExecutor might be different from PrismaTask.
            // Assuming TaskExecutor is adapted or we map PrismaTask to its expected Task type.
            // For now, we'll pass it directly if the structure is compatible.
            // If TaskExecutor expects a specific 'Task' type from '@/lib/types/agent',
            // we might need to map fields from 'PrismaTask' to that structure.
            const executorTask = this.mapPrismaTaskToExecutorTask(task);
            await taskExecutor.executeTask(mission.id, executorTask);
            logger.info(`Task ${task.id} execution attempt completed.`, 'AgentExecutionEngine', { taskId: task.id });
          } catch (e: any) {
            logger.error(`Unhandled error during TaskExecutor.executeTask for task ${task.id}: ${e.message}`, 'AgentExecutionEngine', { error: e, taskId: task.id });
            // This error is from TaskExecutor itself, not an execution failure handled within it.
            // Mark task as failed due to system error.
            await this.updateTaskStatus(task.id, 'failed', undefined, {
              reason: 'TaskExecutor crashed unexpectedly.',
              originalError: e.message,
              timestamp: new Date().toISOString(),
            });
            // This critical failure might warrant failing the mission immediately.
            await this.updateMissionStatus(mission.id, 'failed', `Mission failed due to critical error in task ${task.id}.`);
            logger.error(`Mission ${mission.id} failed due to critical error in task ${task.id}.`, 'AgentExecutionEngine');
            break; // Stop processing further tasks for this mission
          }
        }
      }

      // After all tasks for the current mission have been processed (or one failed critically)
      // Fetch the latest state of all tasks for that mission
      logger.debug(`All tasks for mission ${mission.id} have been processed in this cycle. Determining final mission status.`, 'AgentExecutionEngine');
      const finalTasks = await dbService.getTasksByMissionId(mission.id); // Use service function

      let completedTasks = 0;
      let failedTasks = 0;
      let pendingOrRetryingTasks = 0;

      for (const t of finalTasks) {
        if (t.status === 'completed') completedTasks++;
        else if (t.status === 'failed') failedTasks++;
        else if (t.status === 'pending' || t.status === 'retrying' || t.status === 'in-progress') pendingOrRetryingTasks++;
      }

      let determinedStatus = mission.status; // Default to current status
      let missionSummary = `Tasks: ${completedTasks} completed, ${failedTasks} failed, ${pendingOrRetryingTasks} pending/active.`;

      if (pendingOrRetryingTasks > 0) {
        determinedStatus = 'in-progress'; // Still ongoing
      } else if (failedTasks > 0) {
        determinedStatus = 'failed';
        missionSummary = `Mission failed. ${missionSummary}`;
      } else if (completedTasks === finalTasks.length && finalTasks.length > 0) {
        determinedStatus = 'completed';
        missionSummary = `Mission completed successfully. ${missionSummary}`;
      } else if (finalTasks.length === 0 && mission.status !== 'pending') { // No tasks, but was in-progress
        determinedStatus = 'completed'; // Or 'failed' if no tasks is an error condition
        missionSummary = 'Mission completed: No tasks to execute.';
         logger.warn(`Mission ${mission.id} has no tasks. Marking as ${determinedStatus}.`, 'AgentExecutionEngine');
      }


      if (determinedStatus !== mission.status || determinedStatus === 'completed' || determinedStatus === 'failed') {
         logger.info(`Updating final status for mission ${mission.id} to ${determinedStatus}. Summary: ${missionSummary}`, 'AgentExecutionEngine');
        await this.updateMissionStatus(mission.id, determinedStatus, missionSummary);
      } else {
        logger.info(`Mission ${mission.id} remains ${mission.status}. Summary: ${missionSummary}`, 'AgentExecutionEngine');
      }
      logger.info(`Finished processing mission ${mission.id}.`, 'AgentExecutionEngine', { missionId: mission.id, finalStatus: determinedStatus });
    }
    logger.info('AgentExecutionEngine runOnce cycle finished.', 'AgentExecutionEngine');
  }
}
