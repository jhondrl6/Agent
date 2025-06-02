// src/lib/agent/TaskExecutor.ts
import { Task } from '@/lib/types/agent';
import { useAgentStore } from './StateManager'; 
import { TavilyClient } from '@/lib/search/TavilyClient';
import { SerperClient } from '@/lib/search/SerperClient';
// import { GeminiClient } from '@/lib/search/GeminiClient'; // Currently not used for search execution
import { TavilySearchParams, SerperSearchParams } from '@/lib/types/search';
import { DecisionEngine, ChooseSearchProviderInput, SearchProviderOption, HandleFailedTaskInput } from './DecisionEngine';
import { ResultValidator, ValidationInput, ValidationOutput } from '@/lib/search/ResultValidator'; // Added import

export class TaskExecutor {

  constructor() {
    console.log('[TaskExecutor] Initialized');
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
    
    let taskResultForValidation: any = null; // To hold the actual content result for validation
    let finalStatus: Task['status'] = 'completed'; // Assume success unless an exception is caught or validation fails content-wise
    let failureDetailsForUpdate: Task['failureDetails'] | undefined = undefined; // For errors caught in main try-catch
    let validationOutcomeForUpdate: ValidationOutput | undefined = undefined;

    try {
      console.log(`[TaskExecutor] Adding task ${task.id} to active tasks list.`);
      addTaskToActive(task.id);

      console.log(`[TaskExecutor] Executing task ${task.id} (Attempt: ${task.retries === 0 ? 'Initial' : 'Retry #' + task.retries}). Description: "${task.description}"`);
      updateTask(missionId, task.id, { status: 'in-progress', failureDetails: undefined, validationOutcome: undefined }); // Clear previous run's details

      const descriptionLower = task.description.toLowerCase();
      const searchKeywords = ["search for", "find information on", "find information about", "research", "look up", "investigate", "google search for", "serper search for", "tavily search for"];
      const isSearchTask = searchKeywords.some(keyword => descriptionLower.includes(keyword.trim()));

      if (isSearchTask) {
        const geminiApiKeyForDecision = process.env.GEMINI_API_KEY;
        const decisionEngine = new DecisionEngine(geminiApiKeyForDecision);
        const availableProviders: SearchProviderOption[] = ['tavily', 'serper', 'gemini'];
        
        const decisionInput: ChooseSearchProviderInput = { taskDescription: task.description, availableProviders };
        const searchDecision = await decisionEngine.chooseSearchProvider(decisionInput);
        console.log(`[TaskExecutor] DecisionEngine chose search provider: ${searchDecision.provider}. Reason: ${searchDecision.reason}`);

        let query = this.extractSearchQuery(task.description, searchKeywords);
        if (!query.trim()) query = task.description;
        console.log(`[TaskExecutor] Extracted search query: "${query}"`);

        let searchProviderName: string = searchDecision.provider;
        let searchAPISuccess = false; // Flag to indicate if the API call itself was successful

        switch (searchDecision.provider) {
          case 'tavily':
            const tavilyApiKey = process.env.TAVILY_API_KEY;
            if (!tavilyApiKey) {
              taskResultForValidation = 'Configuration error: Tavily API key not found.';
              setAgentError('Tavily API key (TAVILY_API_KEY) is not configured.'); // Set global error
              // No 'throw' here, let validation handle it
            } else {
              const tavilyClient = new TavilyClient(tavilyApiKey);
              const tavilyResponse = await tavilyClient.search({ query, search_depth: 'basic', max_results: 3, include_answer: true });
              searchAPISuccess = true; // API call was made
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
              const serperClient = new SerperClient(serperApiKey);
              console.log(`[TaskExecutor] Using Serper to search for: "${query}"`);
              const serperResponse = await serperClient.search({ q: query, num: 3 });
              searchAPISuccess = true;
              if (serperResponse && serperResponse.organic && serperResponse.organic.length > 0) {
                taskResultForValidation = `${searchProviderName} Search Results:\n` + serperResponse.organic.map(
                  (res, idx) => `${idx + 1}. ${res.title}\n   Link: ${res.link}\n   Snippet: ${res.snippet?.substring(0, 200)}...\n`
                ).join('\n');
              } else {
                taskResultForValidation = `${searchProviderName} Search returned no results.`;
              }
            }
            break;
          case 'gemini': // Placeholder for Gemini as a "searcher"
            taskResultForValidation = `Gemini (as Search Provider) chosen. Placeholder result: Information about "${query}" would be generated here.`;
            searchAPISuccess = true; // Simulated success of "API call"
            break;
          case 'none':
          default:
            taskResultForValidation = `No suitable search provider action taken. Decision: ${searchDecision.reason}`;
            searchAPISuccess = false; // No API call was made if provider is 'none'
            break;
        }
        // If searchAPISuccess is false AND taskResultForValidation contains config error, it's a setup issue.
        // The validator will catch the content of taskResultForValidation.

      } else { // Not a search task - use simulation
        console.log(`[TaskExecutor] Task ${task.id} is not a search task. Using simulation.`);
        const executionTime = Math.random() * 1500 + 500;
        await new Promise(resolve => setTimeout(resolve, executionTime));
        const isSuccess = Math.random() > 0.2;
        if (isSuccess) {
          taskResultForValidation = `Simulated success for: ${task.description}. Detailed findings: Proin quis tortor orci. Etiam at risus et justo dignissim congue.`;
        } else {
          // This 'else' for simulation failure should be an exception to be caught by the main catch block
          throw new Error(`Simulated failure for: ${task.description}. Could not retrieve necessary data.`);
        }
      }

      // === VALIDATION STEP for successfully executed operations (no exception thrown) ===
      const validator = new ResultValidator();
      const validationInput: ValidationInput = { task, result: taskResultForValidation };
      validationOutcomeForUpdate = validator.validate(validationInput);
      
      this.addLog({ 
        level: validationOutcomeForUpdate.isValid ? 'info' : 'warn', 
        message: `[TaskExecutor] Result validation for task ${task.id}: Valid: ${validationOutcomeForUpdate.isValid}`, 
        details: { critique: validationOutcomeForUpdate.critique, score: validationOutcomeForUpdate.qualityScore, suggestedAction: validationOutcomeForUpdate.suggestedAction }
      });
      // === END VALIDATION STEP ===

      if (!validationOutcomeForUpdate.isValid) {
        this.addLog({ level: 'warn', message: `[TaskExecutor] Task ${task.id} result validation FAILED. Handing off to DecisionEngine for failure processing.`});
        
        const validationErrorPayload = { 
          name: 'ValidationError',
          message: `Validation failed: ${validationOutcomeForUpdate.critique || 'No specific critique.'}`,
          details: validationOutcomeForUpdate // Pass the whole validation outcome for context
        };
      
        const geminiApiKeyForDecision = process.env.GEMINI_API_KEY;
        const decisionEngine = new DecisionEngine(geminiApiKeyForDecision, this.addLog);
        
        const failureDecisionInput: HandleFailedTaskInput = {
          // Pass the task state as it was when it "completed" its execution phase but failed validation
          task: { ...task, status: 'completed', result: taskResultForValidation, validationOutcome: validationOutcomeForUpdate }, 
          error: validationErrorPayload, 
        };
        const failureDecision = await decisionEngine.handleFailedTask(failureDecisionInput);
      
        this.addLog({
            level: 'warn',
            message: `[TaskExecutor] Decision for validation failure of task ${task.id}: ${failureDecision.action}`,
            details: { reason: failureDecision.reason, delay: failureDecision.delayMs }
        });
      
        if (failureDecision.action === 'retry' && typeof failureDecision.delayMs === 'number') {
          const newRetryCountInStore = task.retries + 1;
          // Update task state to 'retrying' and include original (problematic) result and validation outcome.
          updateTask(missionId, task.id, {
            status: 'retrying',
            retries: newRetryCountInStore,
            result: taskResultForValidation, 
            validationOutcome: validationOutcomeForUpdate, 
            failureDetails: { 
              reason: `Validation Failed: ${validationOutcomeForUpdate.critique}. ${failureDecision.reason}`,
              suggestedAction: failureDecision.action, // This should be 'retry'
              originalError: validationErrorPayload.message,
              timestamp: new Date(),
            },
          });
          await new Promise(resolve => setTimeout(resolve, failureDecision.delayMs));
          const taskForNextExecution: Task = { ...task, retries: newRetryCountInStore, status: 'pending', result: undefined, validationOutcome: undefined, failureDetails: undefined };
          this.addLog({level:'info', message:`[TaskExecutor] Re-executing task ${task.id} due to validation failure retry (Retry Attempt #${newRetryCountInStore}).`});
          return this.executeTask(missionId, taskForNextExecution);
        } else { // 'abandon' or other non-retry action for the validation failure
          updateTask(missionId, task.id, {
            status: 'failed', // Mark as failed due to unrecoverable validation issue
            result: taskResultForValidation, 
            validationOutcome: validationOutcomeForUpdate,
            failureDetails: {
              reason: `Validation Failed: ${validationOutcomeForUpdate.critique}. ${failureDecision.reason}`,
              suggestedAction: failureDecision.action,
              originalError: validationErrorPayload.message,
              timestamp: new Date(),
            },
          });
          // Task failed validation and decision is not to retry. Fall through to finally.
          return; // Exit after handling non-retryable validation failure.
        }
      } else { // validationOutcome.isValid === true
        // Task completed successfully AND passed validation
        this.addLog({level:'info', message:`[TaskExecutor] Task ${task.id} completed successfully and passed validation.`});
        updateTask(missionId, task.id, { 
          status: 'completed', 
          result: taskResultForValidation,
          validationOutcome: validationOutcomeForUpdate,
          failureDetails: undefined, // Clear previous failures
        });
      }

    } catch (error) { // Catches errors from API calls, simulation failures, or other unexpected issues
      finalStatus = 'failed'; // Mark for update in store (though already handled by DE path below)
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Log the initial error for this specific attempt
      this.addLog({level: 'error', message: `[TaskExecutor] Execution error task ${task.id} (Retries: ${task.retries}): ${errorMessage.substring(0,150)}...`, details: { error }});
      // console.error is less important if addLog handles error level appropriately
      
      const geminiApiKeyForDecision = process.env.GEMINI_API_KEY;
      const decisionEngine = new DecisionEngine(geminiApiKeyForDecision, this.addLog); 
      const failureDecisionInput: HandleFailedTaskInput = { task, error }; // task already has its current retries
      const failureDecision = await decisionEngine.handleFailedTask(failureDecisionInput);

      this.addLog({
        level: 'warn', 
        message: `[TaskExecutor] DecisionEngine suggestion for task ${task.id} (execution error): ${failureDecision.action}`, 
        details: { reason: failureDecision.reason, delay: failureDecision.delayMs, retries: task.retries }
      });

      failureDetailsForUpdate = {
        reason: failureDecision.reason,
        suggestedAction: failureDecision.action,
        originalError: errorMessage,
        timestamp: new Date(),
      };

      if (failureDecision.action === 'retry' && typeof failureDecision.delayMs === 'number') {
        const retriesForNextAttempt = task.retries + 1;
        setAgentError(`Task ${task.id} (attempt ${task.retries + 1}) failed. Retrying (will be attempt ${retriesForNextAttempt +1} of ${DecisionEngine.MAX_TASK_RETRIES +1} total attempts) after ${failureDecision.delayMs}ms. Error: ${errorMessage.substring(0,100)}...`);
        
        updateTask(missionId, task.id, {
          status: 'retrying',
          retries: retriesForNextAttempt,
          failureDetails: failureDetailsForUpdate,
          validationOutcome: undefined, // Clear previous validation
        });

        console.log(`[TaskExecutor] Task ${task.id} will be retried after ${failureDecision.delayMs}ms. New retry count: ${retriesForNextAttempt}.`);
        await new Promise(resolve => setTimeout(resolve, failureDecision.delayMs));

        const taskForNextExecution: Task = { ...task, retries: retriesForNextAttempt, status: 'pending', failureDetails: undefined, result: undefined, validationOutcome: undefined }; 
        console.log(`[TaskExecutor] Re-executing task ${task.id} (This is Retry Attempt #${taskForNextExecution.retries} of ${DecisionEngine.MAX_TASK_RETRIES}).`);
        return this.executeTask(missionId, taskForNextExecution); 
      } else { 
        setAgentError(`Task ${task.id} failed permanently after ${task.retries} retries. Error: ${errorMessage.substring(0,100)}... Final Action: ${failureDecision.action}. Reason: ${failureDecision.reason}`);
        updateTask(missionId, task.id, {
          status: 'failed',
          result: `Task failed after ${task.retries} ${task.retries === 1 ? 'retry' : 'retries'}. See 'failureDetails'.`,
          failureDetails: failureDetailsForUpdate,
          validationOutcome: undefined, // Clear previous validation
        });
      }
    } finally {
      // If a retry happened and returned, this finally is for the *original* call that led to retry.
      // The recursive call will have its own finally.
      console.log(`[TaskExecutor] Removing task ${task.id} (original instance with retries=${task.retries}) from active tasks list.`);
      removeTaskFromActive(task.id);
    }
  }
}
