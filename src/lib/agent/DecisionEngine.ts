// src/lib/agent/DecisionEngine.ts
import { Task } from '@/lib/types/agent'; 
import { GeminiClient, GeminiRequestParams } from '@/lib/search/GeminiClient'; // Import GeminiClient and GeminiRequestParams

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
  public static readonly MAX_TASK_RETRIES = 3;

  private geminiClient?: GeminiClient;
  private useLLMForDecisions: boolean = false;

  constructor(geminiApiKey?: string) {
    if (geminiApiKey && geminiApiKey.trim() !== '') {
      try {
        this.geminiClient = new GeminiClient(geminiApiKey);
        this.useLLMForDecisions = true;
        console.log('[DecisionEngine] Initialized with GeminiClient. LLM-based decisions enabled.');
      } catch (error) {
        console.warn('[DecisionEngine] Failed to initialize GeminiClient, LLM-based decisions will be disabled. Error:', error);
        this.useLLMForDecisions = false;
      }
    } else {
      console.log('[DecisionEngine] Initialized without Gemini API key. Operating in rule-based mode only.');
      this.useLLMForDecisions = false;
    }
  }

  public async chooseSearchProvider(input: ChooseSearchProviderInput): Promise<ChooseSearchProviderOutput> { // Made async
    const { taskDescription, availableProviders } = input;

    if (this.useLLMForDecisions && this.geminiClient && availableProviders.length > 0 && !availableProviders.every(p => p === 'none')) {
      console.log('[DecisionEngine] Attempting to use LLM to choose search provider for task:', `"${taskDescription}"`);

      const providerListString = availableProviders.filter(p => p !== 'none').join("', '"); // Don't offer 'none' to LLM
      // If only 'none' is available after filtering, LLM won't be helpful.
      if (!providerListString) {
          console.log('[DecisionEngine] No suitable providers (excluding "none") to offer to LLM. Falling back to rules.');
      } else {
        const systemPrompt = `You are an expert system helping an AI research agent decide which search provider to use for a given task.
Your goal is to choose the single most suitable provider from the available options.
Available providers: '${providerListString}'.

Consider the following about the providers:
- 'tavily': Best for comprehensive web research, finding diverse sources, and tasks requiring information for Retrieval Augmented Generation (RAG). Good for general "research X" or "find information about Y" tasks.
- 'serper': Best for direct, quick Google searches. Use if the task implies needing Google-specific results or a very targeted web lookup (e.g., "Google search for official documentation...").
- 'gemini': This is a powerful generative model. While not a traditional search engine, it can be used for tasks that require understanding, synthesis, complex question answering, or if the query itself is a complex question rather than a keyword search. Only choose 'gemini' if the task seems to directly ask for explanation, generation, or complex reasoning that a search engine might not provide directly, AND if 'gemini' is listed as available. It should generally be a lower preference if 'tavily' or 'serper' seem appropriate for direct information retrieval.

Analyze the following task description and choose the single best provider.
Return your choice as a VALID JSON object with two keys: "provider" (string, must be one of: '${providerListString}') and "reason" (string, a brief explanation for your choice).
Do NOT output markdown (e.g., \`\`\`json ... \`\`\`). Output only the raw JSON object.

Example Task: "Find recent scientific papers on the effects of microplastics on marine life."
Example Output (if Tavily is available): {"provider": "tavily", "reason": "The task requires finding scientific papers, which is best handled by a comprehensive research provider like Tavily."}

Example Task: "Google search for the current weather in London."
Example Output (if Serper is available): {"provider": "serper", "reason": "The task explicitly requests a Google search for specific, real-time information."}
`;

        const userPrompt = `Task Description: "${taskDescription}"`;
        const fullPrompt = `${systemPrompt}

Okay, analyze the following task. Choose one provider from ['${providerListString}'].

${userPrompt}`;

        try {
          const geminiParams: GeminiRequestParams = { prompt: fullPrompt, temperature: 0.2, maxOutputTokens: 150 };
          const response = await this.geminiClient.generate(geminiParams);
          const rawJsonResponse = response.candidates?.[0]?.content?.parts?.[0]?.text;

          if (rawJsonResponse) {
            console.log('[DecisionEngine] Raw JSON response from LLM for provider choice:', rawJsonResponse);
            let cleanedJson = rawJsonResponse.trim();
            if (cleanedJson.startsWith('```json')) {
              cleanedJson = cleanedJson.substring(7).trim(); 
            }
            if (cleanedJson.endsWith('```')) {
              cleanedJson = cleanedJson.substring(0, cleanedJson.length - 3).trim();
            }
            
            const llmChoice = JSON.parse(cleanedJson) as { provider: string; reason: string };

            if (llmChoice && llmChoice.provider && typeof llmChoice.reason === 'string') {
              const chosenProvider = llmChoice.provider.toLowerCase() as SearchProviderOption;
              if (availableProviders.includes(chosenProvider)) { // Validate against original availableProviders
                console.log(`[DecisionEngine] LLM chose provider: ${chosenProvider}. Reason: ${llmChoice.reason}`);
                return { provider: chosenProvider, reason: `LLM choice: ${llmChoice.reason}` };
              } else {
                console.warn(`[DecisionEngine] LLM chose provider "${chosenProvider}", which is not in the available list: [${availableProviders.join(', ')}]. Falling back to rules.`);
              }
            } else {
              console.warn('[DecisionEngine] LLM response for provider choice was not in the expected format. Falling back to rules. Response:', llmChoice);
            }
          } else {
            console.warn('[DecisionEngine] No content received from LLM for provider choice. Falling back to rules.');
          }
        } catch (error) {
          console.error('[DecisionEngine] Error using LLM for provider choice, falling back to rules. Error:', error);
        }
      }
    } else if (availableProviders.length === 0 || (availableProviders.length === 1 && availableProviders[0] === 'none')) {
        console.log('[DecisionEngine] No suitable search providers available (list empty or only contains "none").');
        return { provider: 'none', reason: 'No suitable search providers available.' };
    }


    // Fallback to rule-based logic if LLM not used, fails, or returns invalid choice
    console.log('[DecisionEngine] Using rule-based logic to choose search provider for task:', `"${taskDescription}"`);
    const descriptionLower = taskDescription.toLowerCase();
    let chosenProviderByRules: SearchProviderOption = 'none';
    let reasonByRules = 'No specific provider matched by rules; default selection.';

    // Rule 1: Prefer Serper for specific "Google search for..." queries
    if (descriptionLower.includes('google search for') || descriptionLower.includes('serper search for')) {
      if (availableProviders.includes('serper')) {
        chosenProviderByRules = 'serper';
        reasonByRules = 'Rule: Task explicitly or implicitly suggests Google search; Serper chosen.';
      } else if (availableProviders.includes('tavily')) { // Fallback if Serper not available
        chosenProviderByRules = 'tavily';
        reasonByRules = 'Rule: Google search suggested, but Serper unavailable; falling back to Tavily.';
      }
    } 
    // Rule 2: Prefer Tavily for general research, broad queries, or if it's the only specific one available
    else if (descriptionLower.includes('research') || descriptionLower.includes('find information on') || descriptionLower.includes('look up') || descriptionLower.includes('tavily search for')) {
      if (availableProviders.includes('tavily')) {
        chosenProviderByRules = 'tavily';
        reasonByRules = 'Rule: General research query or Tavily specified; Tavily chosen for its RAG focus.';
      } else if (availableProviders.includes('serper')) { // Fallback if Tavily not available
        chosenProviderByRules = 'serper';
        reasonByRules = 'Rule: General research query, but Tavily unavailable; falling back to Serper.';
      }
    }
    // Rule 3 is commented out as per prompt

    // Default/Fallback for rule-based logic:
    if (chosenProviderByRules === 'none' || !availableProviders.includes(chosenProviderByRules)) {
      if (availableProviders.includes('tavily')) {
        chosenProviderByRules = 'tavily';
        reasonByRules = 'Rule Default: Tavily is generally preferred for research tasks.';
      } else if (availableProviders.includes('serper')) {
        chosenProviderByRules = 'serper';
        reasonByRules = 'Rule Default: Tavily not available, Serper selected.';
      } else if (availableProviders.includes('gemini')) {
        chosenProviderByRules = 'gemini';
        reasonByRules = 'Rule Default: Only Gemini available for a search-like task.';
      } else if (availableProviders.length > 0 && availableProviders[0] !== 'none' && availableProviders.includes(availableProviders[0])) {
        chosenProviderByRules = availableProviders[0]; 
        reasonByRules = `Rule Default: Picked first available provider: ${chosenProviderByRules}.`;
      } else {
        chosenProviderByRules = 'none'; 
        reasonByRules = 'Rule Default: No suitable search providers available or "none" was the only option.';
      }
    }
    
    // Final safety net for rule-based decision
    if (!availableProviders.includes(chosenProviderByRules) && chosenProviderByRules !== 'none') {
        console.warn(`[DecisionEngine Rule-Based] Chosen provider '${chosenProviderByRules}' is not in the available list: [${availableProviders.join(', ')}]. Setting to 'none'.`);
        chosenProviderByRules = 'none';
        reasonByRules = `Rule Error: Initial rule choice '${chosenProviderByRules}' not available. No suitable provider found.`;
    }
     if (chosenProviderByRules === 'none' && !(availableProviders.length === 0 || (availableProviders.length === 1 && availableProviders[0] === 'none'))) {
        // If rules resulted in 'none', but there are other valid providers, this is a gap in rules.
        // For safety, pick the first valid one if any, or stick to 'none'.
        const firstValidProvider = availableProviders.find(p => p !== 'none');
        if (firstValidProvider) {
            // This situation should ideally be avoided by more comprehensive rules or a final default choice.
            console.warn(`[DecisionEngine Rule-Based] Rules resulted in 'none', but valid providers exist. Picking first valid: ${firstValidProvider}.`);
            // chosenProviderByRules = firstValidProvider;
            // reasonByRules = `Rule Warning: Rules defaulted to 'none', picked first valid provider '${firstValidProvider}' as a last resort.`;
            // Sticking to 'none' if rules couldn't decide might be safer than arbitrary pick here.
            // Forcing 'none' if rules are exhausted and didn't pick a specific provider.
            reasonByRules = "Rule Default: No specific rule matched, and default selection process also resulted in 'none' or unavailable choice.";
        } else {
             reasonByRules = "Rule Default: No providers available or only 'none' is available.";
        }
    }


    console.log(`[DecisionEngine] Rule-based choice for task "${taskDescription}": Provider '${chosenProviderByRules}'. Reason: ${reasonByRules}`);
    return { provider: chosenProviderByRules, reason: reasonByRules };
  }

  public async handleFailedTask(input: HandleFailedTaskInput): Promise<HandleFailedTaskOutput> { // Made async
    const { task, error } = input;
    const errorMessage = typeof error === 'string' ? error.toLowerCase() : (error?.message || 'Unknown error').toLowerCase();
    const errorStack = typeof error !== 'string' && error?.stack ? error.stack : 'No stack available.';
    const errorStatusCode = (typeof error === 'object' && error !== null && 'status' in error) ? (error as any).status : undefined;


    if (this.useLLMForDecisions && this.geminiClient) {
      console.log(`[DecisionEngine] Attempting to use LLM to handle failure for task ${task.id}: "${task.description}"`);

      const availableActions: FailedTaskAction[] = ['retry', 'abandon', 're-plan', 'escalate'];
      const actionsString = availableActions.join("', '"); // For prompt construction

      // Prepare context about past failures for this task, if any
      let failureHistoryContext = "";
      if (task.failureDetails && task.failureDetails.originalError) {
          failureHistoryContext = `The task previously failed with: "${task.failureDetails.originalError}". Suggested action then was: ${task.failureDetails.suggestedAction || 'N/A'}. This is retry number ${task.retries} (0-indexed).`;
      } else if (task.retries > 0) {
          failureHistoryContext = `This is retry number ${task.retries} (0-indexed) for this task. Previous attempts also failed.`;
      }


      const systemPrompt = `You are an expert AI system diagnosing task failures for a research agent.
Your goal is to analyze the failed task, the error message, and suggest the best course of action.
Available actions are: '${actionsString}'.

Consider the following when making your decision:
- 'retry': Choose if the error seems transient (network issues, temporary API unavailability, rate limits like 429) and the task has not exceeded max retries (max is ${DecisionEngine.MAX_TASK_RETRIES} retries, meaning ${DecisionEngine.MAX_TASK_RETRIES + 1} total attempts). If suggesting 'retry', also suggest a 'delayMs' (e.g., 1000 for 1st retry, 2000 for 2nd, 4000 for 3rd based on retry count).
- 'abandon': Choose if the error is persistent (invalid API key (401/403), fatal error, content safety block, malformed request (400), or if max retries are met).
- 're-plan': Choose if the task itself seems ill-defined, too broad, or if the error suggests the approach needs fundamental rethinking. This might involve breaking the task down further or changing its goal.
- 'escalate': Choose for critical, unrecoverable system errors or if human intervention is clearly needed (rarely use this).

Analyze the following failed task details and recommend an action.
Return your choice as a VALID JSON object with three keys:
1. "action" (string, must be one of: '${actionsString}')
2. "reason" (string, a brief explanation for your choice and diagnosis)
3. "delayMs" (number, an optional integer, REQUIRED and > 0 if action is 'retry'. Otherwise, it can be omitted or null.)
Do NOT output markdown (e.g., \`\`\`json ... \`\`\`). Output only the raw JSON object.

Max retries for a task (number of times it can be retried after the first failure) is ${DecisionEngine.MAX_TASK_RETRIES}. Current retry count for this task (number of past failures/retry attempts made): ${task.retries}.
`;

      const userPrompt = `Failed Task:
ID: ${task.id}
Description: "${task.description}"
Status at failure: ${task.status} 
Retries so far: ${task.retries} 
Error Message: "${errorMessage}"
Error Status Code (if applicable): ${errorStatusCode || 'N/A'}
Error Stack (if available): ${errorStack}
${failureHistoryContext ? `Failure History Context: ${failureHistoryContext}` : ""}
`;
      const fullPrompt = `${systemPrompt}

Okay, analyze the following failed task.

${userPrompt}`;

      try {
        const geminiParams: GeminiRequestParams = { prompt: fullPrompt, temperature: 0.3, maxOutputTokens: 250 }; // Increased maxOutputTokens slightly
        const response = await this.geminiClient.generate(geminiParams);
        const rawJsonResponse = response.candidates?.[0]?.content?.parts?.[0]?.text;

        if (rawJsonResponse) {
          console.log('[DecisionEngine] Raw JSON response from LLM for failure handling:', rawJsonResponse);
          let cleanedJson = rawJsonResponse.trim();
          if (cleanedJson.startsWith('```json')) cleanedJson = cleanedJson.substring(7).trim();
          if (cleanedJson.endsWith('```')) cleanedJson = cleanedJson.substring(0, cleanedJson.length - 3).trim();
          
          const llmChoice = JSON.parse(cleanedJson) as { action: string; reason: string; delayMs?: number };

          if (llmChoice && typeof llmChoice.action === 'string' && typeof llmChoice.reason === 'string') {
            const action = llmChoice.action.toLowerCase() as FailedTaskAction;
            if (availableActions.includes(action)) {
              let delay = llmChoice.delayMs;
              if (action === 'retry') {
                if (task.retries >= DecisionEngine.MAX_TASK_RETRIES) {
                    console.warn(`[DecisionEngine] LLM suggested retry for task ${task.id}, but it has already reached max retries (${task.retries}/${DecisionEngine.MAX_TASK_RETRIES}). Overriding to 'abandon'. LLM Reason: ${llmChoice.reason}`);
                    return { action: 'abandon', reason: `LLM suggested retry, but max retries reached. LLM Reason: ${llmChoice.reason}`, delayMs: undefined };
                }
                if (typeof delay !== 'number' || delay <= 0) {
                  console.warn(`[DecisionEngine] LLM suggested retry for task ${task.id} but provided invalid delayMs (${delay}). Defaulting to exponential backoff.`);
                  delay = 1000 * Math.pow(2, task.retries); 
                }
              } else {
                  delay = undefined; // Ensure delay is undefined if not a retry action
              }
              
              console.log(`[DecisionEngine] LLM handled failure for task ${task.id}: Action: ${action}, Reason: ${llmChoice.reason}, Delay: ${delay}`);
              return { action, reason: `LLM Decision: ${llmChoice.reason}`, delayMs: delay };
            } else {
              console.warn(`[DecisionEngine] LLM chose invalid action "${action}" for task ${task.id}. Falling back to rules.`);
            }
          } else {
            console.warn(`[DecisionEngine] LLM response for failure handling (task ${task.id}) was not in the expected format. Falling back to rules. Response:`, llmChoice);
          }
        } else {
          console.warn(`[DecisionEngine] No content received from LLM for failure handling (task ${task.id}). Falling back to rules.`);
        }
      } catch (llmError) {
        console.error(`[DecisionEngine] Error using LLM for failure handling (task ${task.id}), falling back to rules. Error:`, llmError);
      }
    }


    // Fallback to rule-based logic
    console.log(`[DecisionEngine] Using rule-based logic to handle failure for task ${task.id}`);
    // Note: errorMessage and errorStatusCode are already defined above.
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
      if (task.retries < DecisionEngine.MAX_TASK_RETRIES) {
        action = 'retry';
        delayMs = 1000 * Math.pow(2, task.retries); // Exponential backoff: 1s, 2s, 4s
        reason = `Transient error detected ("${errorMessage}"). Suggesting retry #${task.retries + 1} after ${delayMs/1000}s.`;
      } else {
        action = 'abandon';
        reason = `Transient error detected, but max retries (${DecisionEngine.MAX_TASK_RETRIES}) reached for task ${task.id}. Suggesting abandon. Original error: "${errorMessage}"`;
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
    else if (task.retries >= DecisionEngine.MAX_TASK_RETRIES) {
      action = 'abandon';
      reason = `Max retries (${DecisionEngine.MAX_TASK_RETRIES}) reached for task ${task.id} with unclassified error. Suggesting abandon. Error: "${errorMessage}"`;
    }
    // Rule 6: Default for other errors with retries remaining (less common, but possible)
    else if (task.retries < DecisionEngine.MAX_TASK_RETRIES) {
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
