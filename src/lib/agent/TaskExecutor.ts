// src/lib/agent/TaskExecutor.ts
import { Task } from '@/lib/types/agent';
import { useAgentStore } from './StateManager'; 
import { TavilyClient } from '@/lib/search/TavilyClient';
import { SerperClient } from '@/lib/search/SerperClient';
// GeminiClient might be needed if DecisionEngine chooses it and we implement that path
// import { GeminiClient } from '@/lib/search/GeminiClient'; 
import { TavilySearchParams, SerperSearchParams } from '@/lib/types/search';
import { DecisionEngine, ChooseSearchProviderInput, SearchProviderOption } from './DecisionEngine'; // Ensure correct path and type import

export class TaskExecutor {

  constructor() {
    console.log('[TaskExecutor] Initialized');
  }

  private extractSearchQuery(description: string, keywords: string[]): string {
    const descriptionLower = description.toLowerCase();
    for (const keyword of keywords) {
      const keywordWithSpace = keyword.trim() + " "; // Ensure keyword is trimmed before adding space
      let keywordIndex = descriptionLower.indexOf(keywordWithSpace);
      
      if (keywordIndex === 0) {
        return description.substring(keywordWithSpace.length).trim();
      }
      // More complex extraction logic could be added here if needed
      // For instance, if keyword is not at the start but indicates the query follows.
      // This version prioritizes keywords at the beginning of the description.
    }
    // Fallback: If no keyword prefix is found, but task is identified as search,
    // the whole description might be the query.
    // A more refined approach could be to remove any matched keyword phrase from anywhere in string.
    // For now, if keyword is not a prefix, return original description, assuming it's the query.
    return description.trim(); 
  }

  public async executeTask(missionId: string, task: Task): Promise<void> {
    const { 
      updateTask, 
      setAgentError, 
      addTaskToActive,
      removeTaskFromActive 
    } = useAgentStore.getState();
    
    try {
      console.log(`[TaskExecutor] Adding task ${task.id} to active tasks list.`);
      addTaskToActive(task.id);

      console.log(`[TaskExecutor] Attempting execution for task: ${task.id} - "${task.description}" under mission ${missionId}`);
      // It's important to update the status to 'in-progress' AFTER adding to activeTasks,
      // or ensure both are part of a single conceptual state update if possible.
      // For UI reactivity, having it in activeTasks then seeing status change might be fine.
      updateTask(missionId, task.id, { status: 'in-progress' });
      console.log(`[TaskExecutor] Task ${task.id} status updated to 'in-progress'.`);

      // Main task execution logic starts here
      const descriptionLower = task.description.toLowerCase();
      // Keywords to identify if it's a search task AND for query extraction
      const searchKeywords = ["search for", "find information on", "find information about", "research", "look up", "investigate", "google search for", "serper search for", "tavily search for"];
      const isSearchTask = searchKeywords.some(keyword => descriptionLower.includes(keyword.trim())); // Trim keyword for include check

      if (isSearchTask) {
        console.log(`[TaskExecutor] Task ${task.id} identified as a search task.`);
        
        const decisionEngine = new DecisionEngine();
        // Define available search providers for this executor. Could be from config.
        const availableProviders: SearchProviderOption[] = ['tavily', 'serper']; 
        // if Gemini is to be used for search-like queries by TaskExecutor, add 'gemini'
        
        const decisionInput: ChooseSearchProviderInput = {
          taskDescription: task.description,
          availableProviders: availableProviders,
        };
        const searchDecision = decisionEngine.chooseSearchProvider(decisionInput);
        console.log(`[TaskExecutor] DecisionEngine chose provider: ${searchDecision.provider}. Reason: ${searchDecision.reason}`);

        let query = this.extractSearchQuery(task.description, searchKeywords);
        if (!query.trim()) {
            console.warn(`[TaskExecutor] Query extraction for task "${task.description}" resulted in an empty query. Falling back to full description.`);
            query = task.description; // Fallback to full description if extraction is empty
        }
        console.log(`[TaskExecutor] Extracted query for search: "${query}"`);

        let searchResultsText: string | null = null;
        let searchProviderName: string = searchDecision.provider;
        let success = false;

        switch (searchDecision.provider) {
          case 'tavily':
            const tavilyApiKey = process.env.TAVILY_API_KEY;
            if (!tavilyApiKey) {
              console.error('[TaskExecutor] Tavily API key (TAVILY_API_KEY) is not configured.');
              searchResultsText = 'Configuration error: Tavily API key not found.';
              // storeActions.setAgentError('Tavily API key not configured.'); // setAgentError is done in main catch
              break; 
            }
            const tavilyClient = new TavilyClient(tavilyApiKey);
            const tavilyResponse = await tavilyClient.search({ query, search_depth: 'basic', max_results: 3, include_answer: true });
            if (tavilyResponse && (tavilyResponse.answer || (tavilyResponse.results && tavilyResponse.results.length > 0))) {
              searchResultsText = "";
              if (tavilyResponse.answer) {
                searchResultsText += `Tavily Answer: ${tavilyResponse.answer}\n\n`;
              }
              if (tavilyResponse.results && tavilyResponse.results.length > 0) {
                searchResultsText += "Search Results:\n" + tavilyResponse.results.map(
                  (res, idx) => `${idx+1}. ${res.title}\n   URL: ${res.url}\n   Snippet: ${res.content.substring(0, 200)}...\n`
                ).join('\n');
              }
              success = true;
            } else {
              searchResultsText = 'Tavily Search returned no meaningful results.';
            }
            break;

          case 'serper':
            const serperApiKey = process.env.SERPER_API_KEY;
            if (!serperApiKey) {
              console.error('[TaskExecutor] Serper API key (SERPER_API_KEY) is not configured.');
              searchResultsText = 'Configuration error: Serper API key not found.';
              // storeActions.setAgentError('Serper API key not configured.'); // setAgentError is done in main catch
              break;
            }
            const serperClient = new SerperClient(serperApiKey);
            console.log(`[TaskExecutor] Using Serper to search for: "${query}"`);
            const serperResponse = await serperClient.search({ q: query, num: 3 }); // Using num:3 for brevity
            if (serperResponse && serperResponse.organic && serperResponse.organic.length > 0) {
              searchResultsText = serperResponse.organic.map(
                (res, idx) => `${idx + 1}. ${res.title}\n   Link: ${res.link}\n   Snippet: ${res.snippet?.substring(0, 200)}...\n`
              ).join('\n');
              success = true;
            } else {
              searchResultsText = 'Serper Search returned no results.';
            }
            break;

          case 'gemini':
            searchProviderName = 'Gemini (Search via LLM)';
            console.log('[TaskExecutor] Gemini chosen for search. This path requires specific implementation (e.g., re-prompting Gemini to find info). Placeholder.');
            // Example: const geminiApiKey = process.env.GEMINI_API_KEY; ... new GeminiClient ... generate()
            // For now, this will be treated as a "no result" or specific message scenario.
            searchResultsText = 'Gemini was chosen for search, but this execution path is a placeholder. No direct web search performed by Gemini here.';
            // To make it a failure for now:
            // success = false; // or let it fall through if searchResultsText is handled as a "result"
            // If you want to explicitly mark as not a true success for search:
            // storeActions.updateTask(missionId, task.id, { status: 'failed', result: searchResultsText });
            // return; 
            break;

          case 'none':
          default:
            console.warn(`[TaskExecutor] No suitable search provider was chosen by DecisionEngine for task: ${task.description}. Reason: ${searchDecision.reason}`);
            searchResultsText = `No search provider action taken. Decision: ${searchDecision.reason}`;
            // This is effectively a failure to perform a search.
            success = false; 
            break;
        }

        // Update task based on search outcome
        if (success && searchResultsText) {
          console.log(`[TaskExecutor] Task ${task.id} (${searchProviderName} Search) completed successfully.`);
          storeActions.updateTask(missionId, task.id, { 
            status: 'completed', 
            result: `${searchProviderName} Search Results:\n${searchResultsText.trim()}`,
          });
        } else {
          console.warn(`[TaskExecutor] Task ${task.id} (${searchProviderName} Search) did not return successful results. Result/Error: ${searchResultsText}`);
          storeActions.updateTask(missionId, task.id, { 
            status: 'failed', 
            result: searchResultsText || 'Search failed or no provider was executed.',
          });
        }

      } else {
        // Existing simulation logic for non-search tasks
        console.log(`[TaskExecutor] Task ${task.id} is not a search task. Using simulation.`);
        const executionTime = Math.random() * 1500 + 500; // 0.5-2 seconds
        await new Promise(resolve => setTimeout(resolve, executionTime));
        const isSuccess = Math.random() > 0.2; // 80% chance of success

        if (isSuccess) {
          storeActions.updateTask(missionId, task.id, { status: 'completed', result: `Simulated success for: ${task.description}. Detailed findings: Proin quis tortor orci. Etiam at risus et justo dignissim congue.` });
        } else {
          storeActions.updateTask(missionId, task.id, { status: 'failed', result: `Simulated failure for: ${task.description}. Could not retrieve necessary data.` });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[TaskExecutor] Error executing task ${task.id}:`, errorMessage, error);

      // Consult DecisionEngine for how to handle the failure
      const decisionEngine = new DecisionEngine();
      // Create a snapshot of the task as it was when it failed, for the decision process
      const failedTaskSnapshot: Task = { 
        ...task, 
        status: 'failed', // Mark as failed for context to DecisionEngine
        // result property will be overwritten based on error and decision
      }; 

      const failureDecisionInput: HandleFailedTaskInput = {
        task: failedTaskSnapshot, 
        error: error, // The caught error object
      };
      const failureDecision = decisionEngine.handleFailedTask(failureDecisionInput);

      console.log(`[TaskExecutor] DecisionEngine suggestion for failed task ${task.id}: 
        Action: ${failureDecision.action}, 
        Reason: "${failureDecision.reason}", 
        Delay: ${failureDecision.delayMs || 'N/A'}`);

      // Update global agent error - include decision summary
      storeActions.setAgentError(`Task ${task.id} ("${task.description.substring(0,50)}...") failed. Error: "${errorMessage.substring(0,100)}...". Suggested Action: ${failureDecision.action}.`);
      
      const failureDetailsObject = {
        reason: failureDecision.reason, // This is the detailed reason from DecisionEngine
        suggestedAction: failureDecision.action,
        originalError: errorMessage, // The simplified original error message for this attempt
        timestamp: new Date(),
      };

      // The task's status is 'failed'. The 'failureDecision.action' (e.g. 'retry') is advisory at this stage.
      // The actual 'retries' count on the task object is NOT incremented here.
      // It should be incremented only when a retry attempt is actually made by the orchestrator.
      try {
        storeActions.updateTask(missionId, task.id, { 
          status: 'failed', // Status is definitely 'failed' for this attempt
          result: `Task execution failed. See 'failureDetails' for more information.`, // Concise result
          failureDetails: failureDetailsObject,
          // retries: task.retries // Retries count is not modified here by TaskExecutor
        });
      } catch (storeUpdateError) {
        console.error(`[TaskExecutor] CRITICAL: Failed to update task ${task.id} status to 'failed' with details in store after an execution error. Store error:`, storeUpdateError);
      }
    } finally {
      // This block executes whether the try succeeded or an error was caught and handled.
      console.log(`[TaskExecutor] Removing task ${task.id} from active tasks list.`);
      removeTaskFromActive(task.id);
    }
  }
}
