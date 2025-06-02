// src/lib/agent/TaskExecutor.ts
import { Task } from '@/lib/types/agent';
import { useAgentStore } from './StateManager'; 
import { TavilyClient } from '@/lib/search/TavilyClient';
import { SerperClient } from '@/lib/search/SerperClient';
import { TavilySearchParams, SerperSearchParams } from '@/lib/types/search';
import { DecisionEngine, ChooseSearchProviderInput, SearchProviderOption, HandleFailedTaskInput } from './DecisionEngine';
import { ResultValidator, ValidationInput, ValidationOutput } from '@/lib/search/ResultValidator'; 
import { LogLevel } from '@/lib/types/agent'; 

export class TaskExecutor {
  private addLog: (entryData: { level: LogLevel; message: string; details?: any }) => void;

  constructor(addLogFunction: (entryData: { level: LogLevel; message: string; details?: any }) => void) {
    this.addLog = addLogFunction;
    this.addLog({ level: 'debug', message: '[TE] TaskExecutor Initialized.'}); // Changed to debug as per typical init log level
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
    const { 
      updateTask, 
      setAgentError, 
      addTaskToActive,
      removeTaskFromActive 
    } = useAgentStore.getState();
    
    // Log task start (very beginning)
    this.addLog({ 
      level: 'info', 
      message: `[TE] Starting task ${task.id} (Attempt: ${task.retries + 1} of ${DecisionEngine.MAX_TASK_RETRIES + 1})`, 
      details: { missionId, description: task.description, currentRetries: task.retries } 
    });

    let taskResultForValidation: any = null; 
    let validationOutcomeForUpdate: ValidationOutput | undefined = undefined;

    try {
      addTaskToActive(task.id);
      updateTask(missionId, task.id, { status: 'in-progress', failureDetails: undefined, validationOutcome: undefined }); 

      const descriptionLower = task.description.toLowerCase();
      const searchKeywords = ["search for", "find information on", "find information about", "research", "look up", "investigate", "google search for", "serper search for", "tavily search for"];
      const isSearchTask = searchKeywords.some(keyword => descriptionLower.includes(keyword.trim()));

      if (isSearchTask) {
        const geminiApiKeyForDecision = process.env.GEMINI_API_KEY;
        // Pass this.addLog to DecisionEngine constructor
        const decisionEngine = new DecisionEngine(this.addLog, geminiApiKeyForDecision);
        const availableProviders: SearchProviderOption[] = ['tavily', 'serper', 'gemini'];
        
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

        let searchProviderName: string = searchDecision.provider;
        
        switch (searchDecision.provider) {
          case 'tavily':
            const tavilyApiKey = process.env.TAVILY_API_KEY;
            if (!tavilyApiKey) {
              taskResultForValidation = 'Configuration error: Tavily API key not found.';
              setAgentError('Tavily API key (TAVILY_API_KEY) is not configured.');
            } else {
              const tavilyClient = new TavilyClient(tavilyApiKey); // Assuming TavilyClient doesn't need addLog
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
              } else {
                taskResultForValidation = `${searchProviderName} Search returned no meaningful results.`;
              }
            }
            break;
          case 'serper':
            const serperApiKey = process.env.SERPER_API_KEY;
            if (!serperApiKey) {
              taskResultForValidation = 'Configuration error: Serper API key not found.';
              setAgentError('Serper API key (SERPER_API_KEY) is not configured.');
            } else {
              const serperClient = new SerperClient(serperApiKey);  // Assuming SerperClient doesn't need addLog
              const serperResponse = await serperClient.search({ q: query, num: 3 });
              if (serperResponse && serperResponse.organic && serperResponse.organic.length > 0) {
                taskResultForValidation = `${searchProviderName} Search Results:\n` + serperResponse.organic.map(
                  (res, idx) => `${idx + 1}. ${res.title}\n   Link: ${res.link}\n   Snippet: ${res.snippet?.substring(0, 200)}...\n`
                ).join('\n');
              } else {
                taskResultForValidation = `${searchProviderName} Search returned no results.`;
              }
            }
            break;
          case 'gemini': 
            taskResultForValidation = `Gemini (as Search Provider) chosen. Placeholder result: Information about "${query}" would be generated here.`;
            break;
          case 'none':
          default:
            taskResultForValidation = `No suitable search provider action taken. Decision: ${searchDecision.reason}`;
            break;
        }
      } else { 
        this.addLog({ level: 'debug', message: `[TE] Task ${task.id} is not a search task. Using simulation.`});
        const executionTime = Math.random() * 1500 + 500;
        await new Promise(resolve => setTimeout(resolve, executionTime));
        const isSuccess = Math.random() > 0.2;
        if (isSuccess) {
          taskResultForValidation = `Simulated success for: ${task.description}. Detailed findings: Proin quis tortor orci. Etiam at risus et justo dignissim congue.`;
        } else {
          throw new Error(`Simulated failure for: ${task.description}. Could not retrieve necessary data.`);
        }
      }

      this.addLog({ level: 'debug', message: `[TE] Task ${task.id} obtained raw result, proceeding to validation.`, details: { resultSummary: String(taskResultForValidation).substring(0,100)+"..." } });
      const validator = new ResultValidator(); // Assuming ResultValidator doesn't need addLog
      const validationInput: ValidationInput = { task, result: taskResultForValidation };
      validationOutcomeForUpdate = validator.validate(validationInput);
      
      this.addLog({ 
        level: validationOutcomeForUpdate.isValid ? 'info' : 'warn', 
        message: `[TE] Result validation for task ${task.id}: Valid: ${validationOutcomeForUpdate.isValid}`, 
        details: { critique: validationOutcomeForUpdate.critique, score: validationOutcomeForUpdate.qualityScore, suggestedAction: validationOutcomeForUpdate.suggestedAction, resultPreview: String(taskResultForValidation).substring(0,100)+"..." }
      });

      if (!validationOutcomeForUpdate.isValid) {
        this.addLog({ level: 'warn', message: `[TE] Task ${task.id} result validation FAILED. Handing off to DecisionEngine for failure processing.`, details: { validationCritique: validationOutcomeForUpdate.critique }});
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
      
        this.addLog({
            level: 'warn',
            message: `[TE] Decision for validation failure of task ${task.id}: ${failureDecision.action}`,
            details: { reason: failureDecision.reason, delay: failureDecision.delayMs, originalResult: String(taskResultForValidation).substring(0,100)+"..." }
        });
      
        if (failureDecision.action === 'retry' && typeof failureDecision.delayMs === 'number') {
          const newRetryCountInStore = task.retries + 1;
          updateTask(missionId, task.id, {
            status: 'retrying', retries: newRetryCountInStore, result: taskResultForValidation, 
            validationOutcome: validationOutcomeForUpdate, 
            failureDetails: { 
              reason: `Validation Failed: ${validationOutcomeForUpdate.critique}. ${failureDecision.reason}`,
              suggestedAction: failureDecision.action, originalError: validationErrorPayload.message,
              timestamp: new Date(),
            },
          });
          this.addLog({ level: 'warn', message: `[TE] Retrying task ${task.id} (Attempt ${newRetryCountInStore + 1} of ${DecisionEngine.MAX_TASK_RETRIES + 1}) after ${failureDecision.delayMs}ms due to validation failure.`, details: { reason: failureDecision.reason } });
          await new Promise(resolve => setTimeout(resolve, failureDecision.delayMs));
          const taskForNextExecution: Task = { ...task, retries: newRetryCountInStore, status: 'pending', result: undefined, validationOutcome: undefined, failureDetails: undefined };
          return this.executeTask(missionId, taskForNextExecution);
        } else { 
          this.addLog({ level: 'error', message: `[TE] Task ${task.id} failed validation and will not be retried.`, details: { reason: failureDecision.reason, validationCritique: validationOutcomeForUpdate.critique }});
          updateTask(missionId, task.id, {
            status: 'failed', result: taskResultForValidation, validationOutcome: validationOutcomeForUpdate,
            failureDetails: {
              reason: `Validation Failed: ${validationOutcomeForUpdate.critique}. Final Action: ${failureDecision.action} - ${failureDecision.reason}`,
              suggestedAction: failureDecision.action, originalError: validationErrorPayload.message,
              timestamp: new Date(),
            },
          });
          return; 
        }
      } else { 
        this.addLog({level:'info', message:`[TE] Task ${task.id} completed successfully.`, details: { resultSummary: String(taskResultForValidation).substring(0,100)+"..." }});
        updateTask(missionId, task.id, { 
          status: 'completed', result: taskResultForValidation,
          validationOutcome: validationOutcomeForUpdate,
          failureDetails: undefined, 
        });
      }
    } catch (error) { 
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.addLog({level: 'error', message: `[TE] Execution error task ${task.id} (Retries: ${task.retries}): ${errorMessage.substring(0,150)}...`, details: { errorFull: error } });
      
      const geminiApiKeyForDecision = process.env.GEMINI_API_KEY;
      const decisionEngine = new DecisionEngine(this.addLog, geminiApiKeyForDecision); 
      const failureDecisionInput: HandleFailedTaskInput = { task, error }; 
      const failureDecision = await decisionEngine.handleFailedTask(failureDecisionInput);

      this.addLog({
        level: 'warn', 
        message: `[TE] DecisionEngine suggestion for task ${task.id} (execution error): ${failureDecision.action}`, 
        details: { reason: failureDecision.reason, delay: failureDecision.delayMs, retriesSoFar: task.retries }
      });
      const failureDetailsForUpdate: Task['failureDetails'] = {
        reason: failureDecision.reason, suggestedAction: failureDecision.action,
        originalError: errorMessage, timestamp: new Date(),
      };

      if (failureDecision.action === 'retry' && typeof failureDecision.delayMs === 'number') {
        const retriesForNextAttempt = task.retries + 1;
        this.addLog({ level: 'warn', message: `[TE] Retrying task ${task.id} (Attempt ${retriesForNextAttempt + 1} of ${DecisionEngine.MAX_TASK_RETRIES + 1}) after ${failureDecision.delayMs}ms due to execution error.`, details: { reason: failureDecision.reason } });
        updateTask(missionId, task.id, {
          status: 'retrying', retries: retriesForNextAttempt,
          failureDetails: failureDetailsForUpdate, validationOutcome: undefined, 
        });
        await new Promise(resolve => setTimeout(resolve, failureDecision.delayMs));
        const taskForNextExecution: Task = { ...task, retries: retriesForNextAttempt, status: 'pending', failureDetails: undefined, result: undefined, validationOutcome: undefined }; 
        return this.executeTask(missionId, taskForNextExecution); 
      } else { 
        this.addLog({ level: 'error', message: `[TE] Task ${task.id} failed permanently after ${task.retries} ${task.retries === 1 ? 'retry' : 'retries'}.`, details: { failureReason: failureDecision.reason, originalError: errorMessage }});
        updateTask(missionId, task.id, {
          status: 'failed',
          result: `Task failed after ${task.retries} ${task.retries === 1 ? 'retry' : 'retries'}. See 'failureDetails'.`,
          failureDetails: failureDetailsForUpdate, validationOutcome: undefined, 
        });
      }
    } finally {
      this.addLog({ level: 'debug', message: `[TE] Task ${task.id} (instance with retries=${task.retries}) finishing execution. Removing from active list.`});
      removeTaskFromActive(task.id);
    }
  }
}
