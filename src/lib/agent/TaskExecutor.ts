// src/lib/agent/TaskExecutor.ts
import { Task as PrismaTask } from '@prisma/client'; // Renamed to avoid conflict with local Task type
import { Task } from '@/lib/types/agent';
import * as logger from '../utils/logger';
import { useAgentStore } from './StateManager';
import { TavilyClient } from '@/lib/search/TavilyClient';
import { SerperClient } from '@/lib/search/SerperClient';
import { TavilySearchParams, SerperSearchParams } from '@/lib/types/search';
import { DecisionEngine, ChooseSearchProviderInput, SearchProviderOption, HandleFailedTaskInput } from './DecisionEngine';
import { ResultValidator, ValidationInput, ValidationOutput } from '@/lib/search/ResultValidator';
import { LogLevel } from '@/lib/types/agent';

export interface BackendTaskCallbacks {
  updateTaskState: (
    missionId: string,
    taskId: string,
    updates: Partial<Omit<PrismaTask, 'id' | 'missionId' | 'createdAt' | 'updatedAt' | 'mission'>>
  ) => Promise<void>;
  setAgentFailure: (missionId: string, error: string) => Promise<void>;
  trackActiveTask?: (taskId: string) => void;
  untrackActiveTask?: (taskId: string) => void;
}

export class TaskExecutor {
  private addLog: (entryData: { level: LogLevel; message: string; details?: any }) => void;
  private backendCallbacks?: BackendTaskCallbacks;

  constructor(
    addLogFunction: (entryData: { level: LogLevel; message: string; details?: any }) => void,
    backendCallbacks?: BackendTaskCallbacks
  ) {
    this.addLog = addLogFunction;
    this.backendCallbacks = backendCallbacks;
    logger.debug('TaskExecutor Initialized.', 'TaskExecutor');
  }

  private extractSearchQuery(description: string, keywords: string[]): string {
    const descriptionLower = description.toLowerCase();
    for (const keyword of keywords) {
      const keywordWithSpace = keyword.trim() + " ";
      let keywordIndex = descriptionLower.indexOf(keywordWithSpace);
      if (keywordIndex === 0) return description.substring(keywordWithSpace.length).trim();
    }
    return description.trim();
  }

  public async executeTask(missionId: string, task: Task): Promise<void> {
    // Log task start (very beginning)
    this.addLog({
      level: 'info',
      message: `[TE] Starting task ${task.id} (Attempt: ${task.retries + 1} of ${DecisionEngine.MAX_TASK_RETRIES + 1})`,
      details: { missionId, description: task.description, currentRetries: task.retries }
    });
    logger.info(
      `Starting task ${task.id} (Attempt: ${task.retries + 1} of ${DecisionEngine.MAX_TASK_RETRIES + 1})`,
      'TaskExecutor',
      { missionId, taskId: task.id, description: task.description, currentRetries: task.retries }
    );

    let taskResultForValidation: any = null;
    let validationOutcomeForUpdate: ValidationOutput | undefined = undefined;

    try {
      if (this.backendCallbacks?.trackActiveTask) {
        await this.backendCallbacks.trackActiveTask(task.id);
      } else {
        useAgentStore.getState().addTaskToActive(task.id);
      }

      // Update task status to 'in-progress' and clear fields from previous attempts
      const initialUpdatePayload: Partial<Omit<PrismaTask, 'id' | 'missionId' | 'createdAt' | 'updatedAt' | 'mission'>> = {
        status: 'in-progress',
        result: null, // Using null for Prisma
        failureDetails: null, // Using null for Prisma
        validationOutcome: null // Using null for Prisma
      };
      if (this.backendCallbacks?.updateTaskState) {
        await this.backendCallbacks.updateTaskState(missionId, task.id, initialUpdatePayload);
      } else {
        useAgentStore.getState().updateTask(missionId, task.id, {
          status: 'in-progress',
          result: undefined,
          failureDetails: undefined,
          validationOutcome: undefined
        });
      }

      const descriptionLower = task.description.toLowerCase();
      const searchKeywords = ["search for", "find information on", "find information about", "research", "look up", "investigate", "google search for", "serper search for", "tavily search for"];
      const isSearchTask = searchKeywords.some(keyword => descriptionLower.includes(keyword.trim()));

      if (isSearchTask) {
        const geminiApiKeyForDecision = process.env.GEMINI_API_KEY;
        // Pass this.addLog to DecisionEngine constructor
        const decisionEngine = new DecisionEngine(this.addLog, geminiApiKeyForDecision); // DecisionEngine uses its own logger calls internally now
        const availableProviders: SearchProviderOption[] = ['tavily', 'serper', 'gemini'];
        logger.debug(`Task ${task.id} is a search task. Choosing provider.`, 'TaskExecutor', { availableProviders });

        const decisionInput: ChooseSearchProviderInput = { taskDescription: task.description, availableProviders };
        const searchDecision = await decisionEngine.chooseSearchProvider(decisionInput);

        let query = this.extractSearchQuery(task.description, searchKeywords);
        if (!query.trim()) query = task.description;

        // Log query and chosen provider
        this.addLog({
          level: 'info',
          message: `[TE] Task ${task.id} using '${searchDecision.provider}' for query: "${query}"`,
          details: { missionId, taskId: task.id, reason: searchDecision.reason }
        });
        logger.info(`Task ${task.id} using '${searchDecision.provider}' for query: "${query}"`, 'TaskExecutor', { provider: searchDecision.provider, query, reason: searchDecision.reason });

        let searchProviderName: string = searchDecision.provider;

        switch (searchDecision.provider) {
          case 'tavily':
            const tavilyApiKey = process.env.TAVILY_API_KEY;
            if (!tavilyApiKey) {
              taskResultForValidation = 'Configuration error: Tavily API key not found.';
              logger.error('Tavily API key (TAVILY_API_KEY) is not configured.', 'TaskExecutor', { taskId: task.id });
              if (this.backendCallbacks?.setAgentFailure) {
                await this.backendCallbacks.setAgentFailure(missionId, 'Tavily API key (TAVILY_API_KEY) is not configured.');
              } else {
                useAgentStore.getState().setAgentError('Tavily API key (TAVILY_API_KEY) is not configured.');
              }
              // This will flow to validation, fail, and be handled by DecisionEngine.
            } else {
              const tavilyClient = new TavilyClient(tavilyApiKey);
              try {
                const tavilyResponse = await tavilyClient.search({ query, search_depth: 'basic', max_results: 3, include_answer: true });
                if (tavilyResponse && (tavilyResponse.answer || (tavilyResponse.results && tavilyResponse.results.length > 0))) {
                  let combinedResults = "";
                if (tavilyResponse.answer) combinedResults += `Tavily Answer: ${tavilyResponse.answer}\n\n`;
                if (tavilyResponse.results && tavilyResponse.results.length > 0) {
                  combinedResults += "Search Results:\n" + tavilyResponse.results.map(
                    (res, idx) => `${idx+1}. ${res.title}\n   URL: ${res.url}\n   Snippet: ${res.content.substring(0, 200)}...\n`
                  ).join('\n');
                }
                  taskResultForValidation = `${searchProviderName} Search Results:\n${combinedResults.trim()}`;
                  logger.debug(`Tavily search for task ${task.id} successful.`, 'TaskExecutor', { resultSummary: String(taskResultForValidation).substring(0,100)+"..." });
                } else {
                  taskResultForValidation = `${searchProviderName} Search returned no meaningful results.`;
                  logger.warn(`Tavily search for task ${task.id} returned no meaningful results.`, 'TaskExecutor', { query, response: tavilyResponse });
                }
              } catch (searchError: any) {
                logger.error('Error during Tavily search execution', 'TaskExecutor', searchError, { taskId: task.id, provider: searchProviderName, query });
                this.addLog({ level: 'error', message: `Task ${task.id} failed during ${searchProviderName} execution: ${searchError.message}`, details: { error: searchError } });
                throw searchError; // Re-throw to be caught by main try-catch for DecisionEngine handling
              }
            }
            break;
          case 'serper':
            const serperApiKey = process.env.SERPER_API_KEY;
            if (!serperApiKey) {
              taskResultForValidation = 'Configuration error: Serper API key not found.';
              logger.error('Serper API key (SERPER_API_KEY) is not configured.', 'TaskExecutor', { taskId: task.id });
              if (this.backendCallbacks?.setAgentFailure) {
                await this.backendCallbacks.setAgentFailure(missionId, 'Serper API key (SERPER_API_KEY) is not configured.');
              } else {
                useAgentStore.getState().setAgentError('Serper API key (SERPER_API_KEY) is not configured.');
              }
            } else {
              const serperClient = new SerperClient(serperApiKey);
              try {
                const serperResponse = await serperClient.search({ q: query, num: 3 });
                if (serperResponse && serperResponse.organic && serperResponse.organic.length > 0) {
                  taskResultForValidation = `${searchProviderName} Search Results:\n` + serperResponse.organic.map(
                    (res, idx) => `${idx + 1}. ${res.title}\n   Link: ${res.link}\n   Snippet: ${res.snippet?.substring(0, 200)}...\n`
                  ).join('\n');
                  logger.debug(`Serper search for task ${task.id} successful.`, 'TaskExecutor', { resultSummary: String(taskResultForValidation).substring(0,100)+"..." });
                } else {
                  taskResultForValidation = `${searchProviderName} Search returned no results.`;
                  logger.warn(`Serper search for task ${task.id} returned no results.`, 'TaskExecutor', { query, response: serperResponse });
                }
              } catch (searchError: any) {
                logger.error('Error during Serper search execution', 'TaskExecutor', searchError, { taskId: task.id, provider: searchProviderName, query });
                this.addLog({ level: 'error', message: `Task ${task.id} failed during ${searchProviderName} execution: ${searchError.message}`, details: { error: searchError } });
                throw searchError; // Re-throw
              }
            }
            break;
          case 'gemini': // Placeholder for using Gemini as a direct search/info provider
            try {
              // Example: const geminiClient = new GeminiClient(process.env.GEMINI_API_KEY);
              // const response = await geminiClient.generate({ prompt: query });
              // taskResultForValidation = response.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini returned no result.";
              taskResultForValidation = `Gemini (as Search Provider) chosen. Placeholder result: Information about "${query}" would be generated here.`;
              logger.debug(`Gemini (as Search Provider) for task ${task.id} processed.`, 'TaskExecutor', { query });
            } catch (searchError: any) {
              logger.error('Error during Gemini (as Search Provider) execution', 'TaskExecutor', searchError, { taskId: task.id, provider: searchProviderName, query });
              this.addLog({ level: 'error', message: `Task ${task.id} failed during ${searchProviderName} execution: ${searchError.message}`, details: { error: searchError } });
              throw searchError; // Re-throw
            }
            break;
          case 'none':
          default:
            taskResultForValidation = `No suitable search provider action taken. Decision: ${searchDecision.reason}`;
            logger.info(`No search provider action taken for task ${task.id}.`, 'TaskExecutor', { decision: searchDecision.reason });
            break;
        }
      } else {
        this.addLog({ level: 'warn', message: `[TE] Task ${task.id} ('${task.description}') is not a recognized search task and no other execution logic is implemented. Marking as failed.`});
        logger.warn(`Task ${task.id} ('${task.description}') is not a recognized search task and no other execution logic is implemented. Marking as failed.`, 'TaskExecutor');
        throw new Error(`Task type not implemented: ${task.description}`);
      }

      this.addLog({ level: 'debug', message: `[TE] Task ${task.id} obtained raw result, proceeding to validation.`, details: { resultSummary: String(taskResultForValidation).substring(0,100)+"..." } });
      logger.debug(`Task ${task.id} obtained raw result, proceeding to validation.`, 'TaskExecutor', { resultSummary: String(taskResultForValidation).substring(0,100)+"..." });

      const validator = new ResultValidator();
      const validationInput: ValidationInput = { task, result: taskResultForValidation };
      try {
        validationOutcomeForUpdate = validator.validate(validationInput);
      } catch (validationError: any) {
        logger.error('Error during result validation', 'TaskExecutor', validationError, { taskId: task.id });
        this.addLog({ level: 'error', message: `Task ${task.id} failed during result validation: ${validationError.message}`, details: { error: validationError } });
        throw validationError; // Re-throw to be caught by main try-catch
      }

      const validationLogDetails = { critique: validationOutcomeForUpdate.critique, score: validationOutcomeForUpdate.qualityScore, suggestedAction: validationOutcomeForUpdate.suggestedAction, resultPreview: String(taskResultForValidation).substring(0,100)+"..." };
      this.addLog({
        level: validationOutcomeForUpdate.isValid ? 'info' : 'warn',
        message: `[TE] Result validation for task ${task.id}: Valid: ${validationOutcomeForUpdate.isValid}`,
        details: validationLogDetails
      });
      if (validationOutcomeForUpdate.isValid) {
        logger.info(`Result validation for task ${task.id}: Valid.`, 'TaskExecutor', validationLogDetails);
      } else {
        logger.warn(`Result validation for task ${task.id}: Invalid.`, 'TaskExecutor', validationLogDetails);
      }

      if (!validationOutcomeForUpdate.isValid) {
        this.addLog({ level: 'warn', message: `[TE] Task ${task.id} result validation FAILED. Handing off to DecisionEngine for failure processing.`, details: { validationCritique: validationOutcomeForUpdate.critique }});
        logger.warn(`Task ${task.id} result validation FAILED. Handing off to DecisionEngine for failure processing.`, 'TaskExecutor', { validationCritique: validationOutcomeForUpdate.critique });
        const validationErrorPayload = {
          name: 'ValidationError',
          message: `Validation failed: ${validationOutcomeForUpdate.critique || 'No specific critique.'}`,
          details: validationOutcomeForUpdate
        };
        const geminiApiKeyForDecision = process.env.GEMINI_API_KEY;
        const decisionEngine = new DecisionEngine(this.addLog, geminiApiKeyForDecision);
        const failureDecisionInput: HandleFailedTaskInput = {
          task: { ...task, status: 'completed', result: taskResultForValidation, validationOutcome: validationOutcomeForUpdate },
          error: validationErrorPayload,
        };
        const failureDecision = await decisionEngine.handleFailedTask(failureDecisionInput);

        const failureDecisionLogDetails = { reason: failureDecision.reason, delay: failureDecision.delayMs, originalResult: String(taskResultForValidation).substring(0,100)+"..." };
        this.addLog({
            level: 'warn',
            message: `[TE] Decision for validation failure of task ${task.id}: ${failureDecision.action}`,
            details: failureDecisionLogDetails
        });
        logger.warn(`Decision for validation failure of task ${task.id}: ${failureDecision.action}`, 'TaskExecutor', failureDecisionLogDetails);

        if (failureDecision.action === 'retry' && typeof failureDecision.delayMs === 'number') {
          const newRetryCountInStore = task.retries + 1;
          const retryUpdatePayload: Partial<Omit<PrismaTask, 'id' | 'missionId' | 'createdAt' | 'updatedAt' | 'mission'>> = {
            status: 'retrying', retries: newRetryCountInStore, result: taskResultForValidation as string, // Assuming result is string for Prisma
            validationOutcome: validationOutcomeForUpdate as any, // Prisma expects Json
            failureDetails: {
              reason: `Validation Failed: ${validationOutcomeForUpdate.critique}. ${failureDecision.reason}`,
              suggestedAction: failureDecision.action, originalError: validationErrorPayload.message,
              timestamp: new Date().toISOString(),
            } as any, // Prisma expects Json
          };
          if (this.backendCallbacks?.updateTaskState) {
            await this.backendCallbacks.updateTaskState(missionId, task.id, retryUpdatePayload);
          } else {
            useAgentStore.getState().updateTask(missionId, task.id, {
              status: 'retrying', retries: newRetryCountInStore, result: taskResultForValidation,
              validationOutcome: validationOutcomeForUpdate,
              failureDetails: {
                reason: `Validation Failed: ${validationOutcomeForUpdate.critique}. ${failureDecision.reason}`,
                suggestedAction: failureDecision.action, originalError: validationErrorPayload.message,
                timestamp: new Date(),
              },
            });
          }
          const retryLogMsg = `Retrying task ${task.id} (Attempt ${newRetryCountInStore + 1} of ${DecisionEngine.MAX_TASK_RETRIES + 1}) after ${failureDecision.delayMs}ms due to validation failure.`;
          this.addLog({ level: 'warn', message: `[TE] ${retryLogMsg}`, details: { reason: failureDecision.reason } });
          logger.warn(retryLogMsg, 'TaskExecutor', { taskId: task.id, reason: failureDecision.reason, delay: failureDecision.delayMs });
          await new Promise(resolve => setTimeout(resolve, failureDecision.delayMs));
          const taskForNextExecution: Task = { ...task, retries: newRetryCountInStore, status: 'pending', result: undefined, validationOutcome: undefined, failureDetails: undefined };
          return this.executeTask(missionId, taskForNextExecution);
        } else {
          const noRetryLogMsg = `Task ${task.id} failed validation and will not be retried.`;
          this.addLog({ level: 'error', message: `[TE] ${noRetryLogMsg}`, details: { reason: failureDecision.reason, validationCritique: validationOutcomeForUpdate.critique }});
          logger.error(noRetryLogMsg, 'TaskExecutor', { taskId: task.id, reason: failureDecision.reason, validationCritique: validationOutcomeForUpdate.critique });
          const failedUpdatePayload: Partial<Omit<PrismaTask, 'id' | 'missionId' | 'createdAt' | 'updatedAt' | 'mission'>> = {
            status: 'failed', result: taskResultForValidation as string, validationOutcome: validationOutcomeForUpdate as any,
            failureDetails: {
              reason: `Validation Failed: ${validationOutcomeForUpdate.critique}. Final Action: ${failureDecision.action} - ${failureDecision.reason}`,
              suggestedAction: failureDecision.action, originalError: validationErrorPayload.message,
              timestamp: new Date().toISOString(),
            } as any,
          };
          if (this.backendCallbacks?.updateTaskState) {
            await this.backendCallbacks.updateTaskState(missionId, task.id, failedUpdatePayload);
          } else {
            useAgentStore.getState().updateTask(missionId, task.id, {
              status: 'failed', result: taskResultForValidation, validationOutcome: validationOutcomeForUpdate,
              failureDetails: {
                reason: `Validation Failed: ${validationOutcomeForUpdate.critique}. Final Action: ${failureDecision.action} - ${failureDecision.reason}`,
                suggestedAction: failureDecision.action, originalError: validationErrorPayload.message,
                timestamp: new Date(),
              },
            });
          }
          return;
        }
      } else {
        const successMsg = `Task ${task.id} completed successfully.`;
        this.addLog({level:'info', message:`[TE] ${successMsg}`, details: { resultSummary: String(taskResultForValidation).substring(0,100)+"..." }});
        logger.info(successMsg, 'TaskExecutor', { taskId: task.id, resultSummary: String(taskResultForValidation).substring(0,100)+"..."});
        const successUpdatePayload: Partial<Omit<PrismaTask, 'id' | 'missionId' | 'createdAt' | 'updatedAt' | 'mission'>> = {
          status: 'completed', result: taskResultForValidation as string,
          validationOutcome: validationOutcomeForUpdate as any,
          failureDetails: null, // Prisma expects null
        };
        if (this.backendCallbacks?.updateTaskState) {
          await this.backendCallbacks.updateTaskState(missionId, task.id, successUpdatePayload);
        } else {
          useAgentStore.getState().updateTask(missionId, task.id, {
            status: 'completed', result: taskResultForValidation,
            validationOutcome: validationOutcomeForUpdate,
            failureDetails: undefined,
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.addLog({level: 'error', message: `[TE] Execution error task ${task.id} (Retries: ${task.retries}): ${errorMessage.substring(0,150)}...`, details: { errorFull: error } });
      logger.error(`Execution error in task ${task.id} (Retries: ${task.retries})`, 'TaskExecutor', error);

      const geminiApiKeyForDecision = process.env.GEMINI_API_KEY;
      const decisionEngine = new DecisionEngine(this.addLog, geminiApiKeyForDecision);
      const failureDecisionInput: HandleFailedTaskInput = { task, error };
      const failureDecision = await decisionEngine.handleFailedTask(failureDecisionInput);

      const deSuggestionDetails = { reason: failureDecision.reason, delay: failureDecision.delayMs, retriesSoFar: task.retries };
      this.addLog({
        level: 'warn',
        message: `[TE] DecisionEngine suggestion for task ${task.id} (execution error): ${failureDecision.action}`,
        details: deSuggestionDetails
      });
      logger.warn(`DecisionEngine suggestion for task ${task.id} (execution error): ${failureDecision.action}`, 'TaskExecutor', deSuggestionDetails);

      const failureDetailsForUpdatePrisma: Partial<Omit<PrismaTask, 'id' | 'missionId' | 'createdAt' | 'updatedAt' | 'mission'>>['failureDetails'] = {
        reason: failureDecision.reason, suggestedAction: failureDecision.action,
        originalError: errorMessage, timestamp: new Date().toISOString(),
      } as any; // Prisma expects Json

      if (failureDecision.action === 'retry' && typeof failureDecision.delayMs === 'number') {
        const retriesForNextAttempt = task.retries + 1;
        const retryExecErrorMsg = `Retrying task ${task.id} (Attempt ${retriesForNextAttempt + 1} of ${DecisionEngine.MAX_TASK_RETRIES + 1}) after ${failureDecision.delayMs}ms due to execution error.`;
        this.addLog({ level: 'warn', message: `[TE] ${retryExecErrorMsg}`, details: { reason: failureDecision.reason } });
        logger.warn(retryExecErrorMsg, 'TaskExecutor', { taskId: task.id, reason: failureDecision.reason, delay: failureDecision.delayMs });

        const retryErrorUpdatePayload: Partial<Omit<PrismaTask, 'id' | 'missionId' | 'createdAt' | 'updatedAt' | 'mission'>> = {
          status: 'retrying', retries: retriesForNextAttempt,
          failureDetails: failureDetailsForUpdatePrisma, validationOutcome: null, // Prisma expects null
        };
        if (this.backendCallbacks?.updateTaskState) {
          await this.backendCallbacks.updateTaskState(missionId, task.id, retryErrorUpdatePayload);
        } else {
          useAgentStore.getState().updateTask(missionId, task.id, {
            status: 'retrying', retries: retriesForNextAttempt,
            failureDetails: { // For Zustand store
              reason: failureDecision.reason, suggestedAction: failureDecision.action,
              originalError: errorMessage, timestamp: new Date(),
            },
            validationOutcome: undefined,
          });
        }
        await new Promise(resolve => setTimeout(resolve, failureDecision.delayMs));
        const taskForNextExecution: Task = { ...task, retries: retriesForNextAttempt, status: 'pending', failureDetails: undefined, result: undefined, validationOutcome: undefined };
        return this.executeTask(missionId, taskForNextExecution);
      } else {
        const permFailureMsg = `Task ${task.id} failed permanently after ${task.retries} ${task.retries === 1 ? 'retry' : 'retries'}.`;
        this.addLog({ level: 'error', message: `[TE] ${permFailureMsg}`, details: { failureReason: failureDecision.reason, originalError: errorMessage }});
        logger.error(permFailureMsg, 'TaskExecutor', { taskId: task.id, failureReason: failureDecision.reason, originalError: errorMessage, retries: task.retries });

        const permFailureUpdatePayload: Partial<Omit<PrismaTask, 'id' | 'missionId' | 'createdAt' | 'updatedAt' | 'mission'>> = {
          status: 'failed',
          result: `Task failed after ${task.retries} ${task.retries === 1 ? 'retry' : 'retries'}. See 'failureDetails'.`,
          failureDetails: failureDetailsForUpdatePrisma, validationOutcome: null, // Prisma expects null
        };
        if (this.backendCallbacks?.updateTaskState) {
          await this.backendCallbacks.updateTaskState(missionId, task.id, permFailureUpdatePayload);
        } else {
          useAgentStore.getState().updateTask(missionId, task.id, {
            status: 'failed',
            result: `Task failed after ${task.retries} ${task.retries === 1 ? 'retry' : 'retries'}. See 'failureDetails'.`,
            failureDetails: { // For Zustand store
              reason: failureDecision.reason, suggestedAction: failureDecision.action,
              originalError: errorMessage, timestamp: new Date(),
            },
            validationOutcome: undefined,
          });
        }
      }
    } finally {
      this.addLog({ level: 'debug', message: `[TE] Task ${task.id} (instance with retries=${task.retries}) finishing execution. Removing from active list.`});
      logger.debug(`Task ${task.id} (instance with retries=${task.retries}) finishing execution. Removing from active list.`, 'TaskExecutor', { taskId: task.id, finalRetries: task.retries });
      if (this.backendCallbacks?.untrackActiveTask) {
        await this.backendCallbacks.untrackActiveTask(task.id);
      } else {
        useAgentStore.getState().removeTaskFromActive(task.id);
      }
    }
  }
}
