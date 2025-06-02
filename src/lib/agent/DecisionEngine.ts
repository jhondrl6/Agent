// src/lib/agent/DecisionEngine.ts
import { Task } from '@/lib/types/agent'; // Assuming Task is correctly defined

// Define available search providers for decision making context
// Renamed to SearchProviderOption to avoid potential naming conflicts if
// SearchProvider from '@/lib/types/search.ts' (which refers to actual client instances) is imported.
export type SearchProviderOption = 'tavily' | 'serper' | 'gemini' | 'none';

// Input for choosing a search provider
export interface ChooseSearchProviderInput {
  taskDescription: string;
  availableProviders: SearchProviderOption[]; // e.g., ['tavily', 'serper']
  // We could add more context later, like mission goal, previous task results, etc.
}

// Output for choosing a search provider
export interface ChooseSearchProviderOutput {
  provider: SearchProviderOption;
  reason: string; // Explanation for the choice
  // We could add confidence score or alternative providers later
}

// Define possible actions for a failed task
export type FailedTaskAction = 'retry' | 'abandon' | 're-plan' | 'escalate'; // 'escalate' for human review

// Input for handling a failed task
export interface HandleFailedTaskInput {
  task: Task; // The task that failed
  error: any; // The error object or message
  // task.retries is part of the Task type
}

// Output for handling a failed task
export interface HandleFailedTaskOutput {
  action: FailedTaskAction;
  reason: string; // Explanation for the suggested action
  delayMs?: number; // Suggested delay in milliseconds if action is 'retry'
  // We could add more details, e.g., modified task parameters if re-planning
}

export class DecisionEngine {
  // private llmClient: any; // Example for future LLM integration (e.g., GeminiClient)

  constructor(/* llmClient?: any */) {
    // if (llmClient) this.llmClient = llmClient;
    console.log('[DecisionEngine] Initialized.');
    // For rule-based, constructor might be simple.
    // For LLM-based, it would initialize the LLM client for more complex decisions.
  }

  public chooseSearchProvider(input: ChooseSearchProviderInput): ChooseSearchProviderOutput {
    const { taskDescription, availableProviders } = input;
    const descriptionLower = taskDescription.toLowerCase();
    let chosenProvider: SearchProviderOption = 'none'; // Use SearchProviderOption here
    let reason = 'No specific provider matched; default selection.';

    // Rule 1: Prefer Serper for specific "Google search for..." queries
    if (descriptionLower.includes('google search for') || descriptionLower.includes('serper search for')) {
      if (availableProviders.includes('serper')) {
        chosenProvider = 'serper';
        reason = 'Task description explicitly or implicitly suggests Google search; Serper chosen.';
      } else if (availableProviders.includes('tavily')) { // Fallback if Serper not available
        chosenProvider = 'tavily';
        reason = 'Google search suggested, but Serper unavailable; falling back to Tavily.';
      }
    } 
    // Rule 2: Prefer Tavily for general research, broad queries, or if it's the only specific one available
    else if (descriptionLower.includes('research') || descriptionLower.includes('find information on') || descriptionLower.includes('look up') || descriptionLower.includes('tavily search for')) {
      if (availableProviders.includes('tavily')) {
        chosenProvider = 'tavily';
        reason = 'General research query or Tavily specified; Tavily chosen for its RAG focus.';
      } else if (availableProviders.includes('serper')) { // Fallback if Tavily not available
        chosenProvider = 'serper';
        reason = 'General research query, but Tavily unavailable; falling back to Serper.';
      }
    }
    // Rule 3: Consider Gemini for complex queries or synthesis IF it's adapted for search-like tasks
    // For now, this rule is a placeholder as Gemini is primarily generative.
    // else if (descriptionLower.includes('analyze and summarize') || descriptionLower.includes('explain in detail')) {
    //   if (availableProviders.includes('gemini')) {
    //     chosenProvider = 'gemini';
    //     reason = 'Complex query requiring synthesis; Gemini chosen (if adapted for search).';
    //   }
    // }

    // Default/Fallback: If no specific rules matched, or preferred provider not available
    if (chosenProvider === 'none' || !availableProviders.includes(chosenProvider)) { 
      // This check ensures that if a provider was tentatively chosen by a rule (e.g. Tavily for 'research')
      // but that provider is NOT in availableProviders, we fall into this default logic.
      // Also, if no rules matched at all (chosenProvider is still 'none'), this block is entered.
      
      if (availableProviders.includes('tavily')) {
        chosenProvider = 'tavily';
        reason = 'Default selection or previous choice unavailable: Tavily is generally preferred for research tasks.';
      } else if (availableProviders.includes('serper')) {
        chosenProvider = 'serper';
        reason = 'Default selection or previous choice unavailable: Tavily not available, Serper selected.';
      } else if (availableProviders.includes('gemini')) {
        // Only choose Gemini as a last resort if it's the only one left and we have a search-like task.
        // This assumes Gemini might be used for some direct Q&A that feels like search.
        chosenProvider = 'gemini';
        reason = 'Default selection or previous choice unavailable: Only Gemini available for a search-like task.';
      } else if (availableProviders.length > 0 && availableProviders[0] !== 'none' && availableProviders.includes(availableProviders[0])) {
        // This condition is a bit redundant if the above specific fallbacks (tavily, serper, gemini) are comprehensive.
        // It would only hit if availableProviders contains something not 'tavily', 'serper', or 'gemini'.
        chosenProvider = availableProviders[0]; 
        reason = `Default selection or previous choice unavailable: No specific match, picked first available provider: ${chosenProvider}.`;
      } else {
        // This is the ultimate fallback: no providers available, or only 'none' is available.
        chosenProvider = 'none'; 
        reason = 'No search providers available or suitable for the query.';
      }
    }
    
    // Final safety check: if chosenProvider is somehow not in availableProviders OR if availableProviders is empty, it must be 'none'.
    if (!availableProviders.includes(chosenProvider)) {
        console.warn(`[DecisionEngine] Chosen provider '${chosenProvider}' is not in the available list: [${availableProviders.join(', ')}]. Setting to 'none'.`);
        chosenProvider = 'none';
        // Update reason only if it was not already set to a "no provider" reason
        if (reason !== 'No search providers available or suitable for the query.' && reason !== `Initial choice '${chosenProvider}' was not available or list is empty. No suitable provider found.`) {
             reason = `Initial choice '${chosenProvider}' was not available or list is empty. No suitable provider found.`;
        }
    }

    console.log(`[DecisionEngine] chooseSearchProvider: For task "${taskDescription}", chose '${chosenProvider}'. Reason: ${reason}`);
    return {
      provider: chosenProvider,
      reason,
    };
  }

  public handleFailedTask(input: HandleFailedTaskInput): HandleFailedTaskOutput {
    const { task, error } = input;
    const MAX_TASK_RETRIES = 3; // Define max retries, could be configurable at class/instance level

    let action: FailedTaskAction = 'abandon'; // Default to abandon
    let reason = 'Default: Unknown error or max retries exceeded.';
    let delayMs: number | undefined = undefined;

    // Safely convert error to a lowercase string for matching
    let errorMessage = '';
    if (typeof error === 'string') {
      errorMessage = error.toLowerCase();
    } else if (error && typeof error.message === 'string') {
      errorMessage = error.message.toLowerCase();
    } else if (error && typeof error.toString === 'function') {
      errorMessage = error.toString().toLowerCase();
    }
    
    // Extract status code if error is an object with a status property (like a fetch response error)
    const errorStatusCode = (typeof error === 'object' && error !== null && 'status' in error) ? (error as any).status : undefined;


    console.log(`[DecisionEngine] Handling failed task: ${task.id} (Retries: ${task.retries}). Error message: "${errorMessage}", Status code: ${errorStatusCode || 'N/A'}`);

    // Rule 1: Network errors or specific transient API errors (like rate limits)
    if (errorMessage.includes('network error') || 
        errorMessage.includes('socket hang up') ||
        errorMessage.includes('timeout') || // General timeout
        errorMessage.includes('etimedout') || // More specific timeout
        errorMessage.includes('econnreset') ||
        errorMessage.includes('service unavailable') || 
        errorMessage.includes('rate limit exceeded') ||
        errorMessage.includes('tavily api rate limit exceeded') || // Specific for Tavily if it has unique message
        errorMessage.includes('gemini sdk error: 429') || // Specific for Gemini if SDK formats it this way
        (errorStatusCode === 429 || errorStatusCode === 503 || errorStatusCode === 504)) {
      if (task.retries < MAX_TASK_RETRIES) {
        action = 'retry';
        delayMs = 1000 * Math.pow(2, task.retries); // Exponential backoff: 1s, 2s, 4s
        reason = `Transient error detected ("${errorMessage}"). Suggesting retry #${task.retries + 1} after ${delayMs/1000}s.`;
      } else {
        action = 'abandon';
        reason = `Transient error detected, but max retries (${MAX_TASK_RETRIES}) reached for task ${task.id}. Suggesting abandon. Original error: "${errorMessage}"`;
      }
    }
    // Rule 2: Configuration errors (e.g., invalid API key)
    else if (errorMessage.includes('api key not configured') || 
             errorMessage.includes('invalid api key') || 
             errorMessage.includes('api key invalid') || // Common variation
             errorMessage.includes('authentication failed') ||
             errorMessage.includes('unauthorized') || // Common for 401/403
             (errorStatusCode === 401 || errorStatusCode === 403)) {
      action = 'abandon'; // No point retrying if config is bad
      reason = `Configuration error detected ("${errorMessage}"). API key might be invalid or missing. Suggesting abandon.`;
      // Potentially could suggest 'escalate' for human review of configuration
    }
    // Rule 3: Bad request or invalid input errors (e.g., query too long, unsupported format)
    else if (errorMessage.includes('bad request') || 
             errorMessage.includes('invalid parameter') ||
             errorMessage.includes('query format incorrect') ||
             errorMessage.includes('invalid input') || // General invalid input
             (errorStatusCode === 400)) {
      action = 'abandon'; // Retrying with the same input likely won't help
      reason = `Invalid input or bad request detected ("${errorMessage}"). Task parameters may need correction. Suggesting abandon.`;
      // Could also suggest 're-plan' if the task itself seems malformed
    }
    // Rule 4: LLM content safety violations (if error indicates this, e.g. from Gemini)
    else if (errorMessage.includes('blocked due to safety settings') || 
             errorMessage.includes('prompt blocked') || 
             errorMessage.includes('promptfeedback.blockreason')) { // From Gemini SDK
        action = 'abandon';
        reason = `Task failed due to content safety restrictions by the LLM/API ("${errorMessage}"). Suggesting abandon.`;
    }
    // Rule 5: If retries are exhausted for any other reason not caught above
    else if (task.retries >= MAX_TASK_RETRIES) {
      action = 'abandon';
      reason = `Max retries (${MAX_TASK_RETRIES}) reached for task ${task.id} with unclassified error. Suggesting abandon. Error: "${errorMessage}"`;
    }
    // Rule 6: Default for other errors with retries remaining (less common, but possible)
    else if (task.retries < MAX_TASK_RETRIES) {
        action = 'retry';
        delayMs = 1000 * Math.pow(2, task.retries);
        reason = `Unclassified error ("${errorMessage}"), but retries remaining. Suggesting retry #${task.retries + 1} after ${delayMs/1000}s.`;
    }


    console.log(`[DecisionEngine] handleFailedTask: For task ${task.id}, suggested action: '${action}'. Reason: ${reason}` + (delayMs ? ` Delay: ${delayMs}ms.` : ''));
    return {
      action,
      reason,
      delayMs,
    };
  }

  // Future methods:
  // public shouldDecomposeFurther(task: Task, currentDepth: number): boolean { ... }
  // public determineNextAction(missionStatus: Mission['status'], tasks: Task[]): string { ... }
  // public synthesizeResults(taskResults: any[]): string { ... }
}
