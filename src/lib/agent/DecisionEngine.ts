// src/lib/agent/DecisionEngine.ts
import { Task } from '@/lib/types/agent'; 
import { GeminiClient, GeminiRequestParams } from '@/lib/search/GeminiClient'; 
import { LogLevel } from '@/lib/types/agent'; 

// Define available search providers for decision making context
export type SearchProviderOption = 'tavily' | 'serper' | 'gemini' | 'none';

// Input for choosing a search provider
export interface ChooseSearchProviderInput {
  taskDescription: string;
  availableProviders: SearchProviderOption[]; 
}

// Output for choosing a search provider
export interface ChooseSearchProviderOutput {
  provider: SearchProviderOption;
  reason: string; 
}

// Define possible actions for a failed task
export type FailedTaskAction = 'retry' | 'abandon' | 're-plan' | 'escalate';

// Input for handling a failed task
export interface HandleFailedTaskInput {
  task: Task; 
  error: any; 
}

// Output for handling a failed task
export interface HandleFailedTaskOutput {
  action: FailedTaskAction;
  reason: string; 
  delayMs?: number; 
}

export class DecisionEngine {
  public static readonly MAX_TASK_RETRIES = 3;

  private geminiClient?: GeminiClient;
  private useLLMForDecisions: boolean = false;
  private addLog: (entryData: { level: LogLevel; message: string; details?: any }) => void;

  constructor(
    addLogFunction: (entryData: { level: LogLevel; message: string; details?: any }) => void,
    geminiApiKey?: string,
  ) {
    this.addLog = addLogFunction;
    if (geminiApiKey && geminiApiKey.trim() !== '') {
      try {
        this.geminiClient = new GeminiClient(geminiApiKey); 
        this.useLLMForDecisions = true;
        this.addLog({ level: 'info', message: '[DE] Initialized with GeminiClient. LLM-based decisions ENABLED.' });
      } catch (error: any) {
        this.addLog({ level: 'warn', message: '[DE] Failed to initialize GeminiClient. LLM-based decisions DISABLED.', details: { error: error.message } });
        this.useLLMForDecisions = false;
      }
    } else {
      this.addLog({ level: 'info', message: '[DE] Initialized without Gemini API key. Operating in rule-based mode only.' });
      this.useLLMForDecisions = false;
    }
  }

  public async chooseSearchProvider(input: ChooseSearchProviderInput): Promise<ChooseSearchProviderOutput> { 
    const { taskDescription, availableProviders } = input;
    this.addLog({ level: 'info', message: '[DE] Choosing search provider.', details: { task: taskDescription.substring(0,100)+"...", available: availableProviders } });

    if (this.useLLMForDecisions && this.geminiClient && availableProviders.length > 0 && !availableProviders.every(p => p === 'none')) {
      this.addLog({ level: 'debug', message: '[DE] Attempting LLM for provider choice for task.', details: { taskDescription: taskDescription.substring(0,100)+"..." } });
      const providerListString = availableProviders.filter(p => p !== 'none').join("', '"); 
      if (!providerListString) {
          this.addLog({ level: 'debug', message: '[DE] No suitable providers (excluding "none") to offer to LLM. Falling back to rules.' });
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
        const fullPrompt = `${systemPrompt}\n\nOkay, analyze the following task. Choose one provider from ['${providerListString}'].\n\n${userPrompt}`;
        try {
          const geminiParams: GeminiRequestParams = { prompt: fullPrompt, temperature: 0.2, maxOutputTokens: 150 };
          const response = await this.geminiClient.generate(geminiParams);
          const rawJsonResponse = response.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawJsonResponse) {
            this.addLog({level: 'debug', message: `[DE] LLM raw response for provider choice: ${rawJsonResponse.substring(0,100)}...`});
            let cleanedJson = rawJsonResponse.trim();
            if (cleanedJson.startsWith('```json')) cleanedJson = cleanedJson.substring(7).trim(); 
            if (cleanedJson.endsWith('```')) cleanedJson = cleanedJson.substring(0, cleanedJson.length - 3).trim();
            const llmChoice = JSON.parse(cleanedJson) as { provider: string; reason: string };
            if (llmChoice && llmChoice.provider && typeof llmChoice.reason === 'string') {
              const chosenProvider = llmChoice.provider.toLowerCase() as SearchProviderOption;
              if (availableProviders.includes(chosenProvider)) { 
                const output = { provider: chosenProvider, reason: `LLM choice: ${llmChoice.reason}` };
                this.addLog({ level: 'info', message: `[DE] LLM Chose provider: ${output.provider}`, details: { reason: output.reason } });
                return output;
              } else {
                this.addLog({level: 'warn', message: `[DE] LLM chose unavailable provider "${chosenProvider}". Falling back.`, details: { available: availableProviders }});
              }
            } else {
              this.addLog({level: 'warn', message: '[DE] LLM provider choice response invalid format. Falling back.', details: { response: llmChoice }});
            }
          } else {
            this.addLog({level: 'warn', message: '[DE] No content from LLM for provider choice. Falling back.'});
          }
        } catch (error: any) {
          this.addLog({level: 'error', message: '[DE] Error using LLM for provider choice. Falling back.', details: { error: error.message }});
        }
      }
    } else if (availableProviders.length === 0 || (availableProviders.length === 1 && availableProviders[0] === 'none')) {
        this.addLog({level: 'info', message: '[DE] No suitable search providers available (list empty or only "none").'});
        return { provider: 'none', reason: 'No suitable search providers available.' };
    }

    this.addLog({level: 'debug', message: '[DE] Using rule-based provider choice.', details: { taskDescription: taskDescription.substring(0,100)+"..." }});
    const descriptionLower = taskDescription.toLowerCase();
    let chosenProviderByRules: SearchProviderOption = 'none';
    let reasonByRules = 'No specific provider matched by rules; default selection.';
    if (descriptionLower.includes('google search for') || descriptionLower.includes('serper search for')) {
      if (availableProviders.includes('serper')) chosenProviderByRules = 'serper';
      else if (availableProviders.includes('tavily')) chosenProviderByRules = 'tavily';
      reasonByRules = 'Rule: Explicit Google/Serper search. Chosen: ' + chosenProviderByRules;
    } else if (descriptionLower.includes('research') || descriptionLower.includes('find information on') || descriptionLower.includes('look up') || descriptionLower.includes('tavily search for')) {
      if (availableProviders.includes('tavily')) chosenProviderByRules = 'tavily';
      else if (availableProviders.includes('serper')) chosenProviderByRules = 'serper';
      reasonByRules = 'Rule: General research. Chosen: ' + chosenProviderByRules;
    }
    if (chosenProviderByRules === 'none' || !availableProviders.includes(chosenProviderByRules)) {
      if (availableProviders.includes('tavily')) chosenProviderByRules = 'tavily';
      else if (availableProviders.includes('serper')) chosenProviderByRules = 'serper';
      else if (availableProviders.includes('gemini')) chosenProviderByRules = 'gemini';
      else if (availableProviders.length > 0 && availableProviders[0] !== 'none' && availableProviders.includes(availableProviders[0])) chosenProviderByRules = availableProviders[0]; 
      else chosenProviderByRules = 'none'; 
      reasonByRules = 'Rule Default: Default selection process. Chosen: ' + chosenProviderByRules;
    }
    if (!availableProviders.includes(chosenProviderByRules) && chosenProviderByRules !== 'none') {
        this.addLog({level:'warn', message:`[DE Rule-Based] Chosen provider '${chosenProviderByRules}' is not in available list. Setting to 'none'.`, details: { availableProviders }});
        chosenProviderByRules = 'none';
        reasonByRules = `Rule Error: Initial rule choice '${chosenProviderByRules}' not available. No suitable provider found.`;
    }
     if (chosenProviderByRules === 'none' && !(availableProviders.length === 0 || (availableProviders.length === 1 && availableProviders[0] === 'none'))) {
        const firstValidProvider = availableProviders.find(p => p !== 'none');
        if (firstValidProvider) {
            this.addLog({level:'warn', message:`[DE Rule-Based] Rules resulted in 'none', but valid providers exist. Defaulting to "none" as per conservative fallback.`});
            reasonByRules = "Rule Default: No specific rule matched, and default selection process also resulted in 'none'.";
        } else {
             reasonByRules = "Rule Default: No providers available or only 'none' is available.";
        }
    }
    this.addLog({ level: 'info', message: `[DE] Rule-based Chose provider: ${chosenProviderByRules}`, details: { reason: reasonByRules } });
    return { provider: chosenProviderByRules, reason: reasonByRules };
  }

  public async handleFailedTask(input: HandleFailedTaskInput): Promise<HandleFailedTaskOutput> { 
    const { task, error } = input; 
    const validationOutcome = task.validationOutcome; 

    let effectiveErrorMessage = (typeof error === 'string' ? error : (error?.message || 'Unknown execution error')).toLowerCase();
    let isValidationFailure = false;
    const originalErrorForPrompt = typeof error === 'string' ? error : (error?.message || 'Unknown execution error'); 
    const errorStack = typeof error !== 'string' && error?.stack ? error.stack : 'No stack available.';
    const errorStatusCode = (typeof error === 'object' && error !== null && 'status' in error) ? (error as any).status : undefined;
    
    this.addLog({ 
        level: 'warn', 
        message: `[DE] Handling failure for task ${task.id}. Initial error: ${effectiveErrorMessage.substring(0,100)}...`, 
        details: { taskId: task.id, error: originalErrorForPrompt, validationOutcome, retries: task.retries }
    });

    if (task.status === 'completed' && validationOutcome && !validationOutcome.isValid) {
      effectiveErrorMessage = `Validation failed: ${validationOutcome.critique || 'No critique provided.'}`.toLowerCase();
      isValidationFailure = true;
      this.addLog({level: 'debug', message: `[DE] Task ${task.id} confirmed as validation failure. Critique: ${validationOutcome.critique}`});
    } else if (error) {
      this.addLog({level: 'debug', message: `[DE] Task ${task.id} confirmed as execution error: ${effectiveErrorMessage.substring(0,100)}...`});
    } else if (validationOutcome && !validationOutcome.isValid) {
      effectiveErrorMessage = `Validation failed: ${validationOutcome.critique || 'No critique provided.'}`.toLowerCase();
      isValidationFailure = true;
      this.addLog({level: 'debug', message: `[DE] Task ${task.id} (status: ${task.status}) confirmed as validation failure. Critique: ${validationOutcome.critique}`});
    } else {
        this.addLog({level: 'error', message: `[DE] handleFailedTask for ${task.id}: No primary error and no validation failure. Unusual. Defaulting to abandon.`});
        return { action: 'abandon', reason: 'Task failure unclear (no primary error or validation critique).', delayMs: undefined };
    }

    if (this.useLLMForDecisions && this.geminiClient) {
      this.addLog({level: 'debug', message: `[DE] Attempting LLM for failure handling task ${task.id}. Type: ${isValidationFailure ? 'ValidationFailure' : 'ExecutionError'}`});
      const availableActions: FailedTaskAction[] = ['retry', 'abandon', 're-plan', 'escalate'];
      const actionsString = availableActions.join("', '");
      let failureHistoryContext = "";
      if (task.failureDetails && task.failureDetails.originalError) {
          failureHistoryContext = `The task previously failed with: "${task.failureDetails.originalError}". Suggested action then was: ${task.failureDetails.suggestedAction || 'N/A'}. This is retry number ${task.retries} (0-indexed).`;
      } else if (task.retries > 0) {
          failureHistoryContext = `This is retry number ${task.retries} (0-indexed) for this task. Previous attempts also failed.`;
      }
      const systemPrompt = `You are an expert AI system diagnosing task failures for a research agent. Your goal is to analyze the failed task, the error message (or validation critique), and suggest the best course of action. Available actions are: '${actionsString}'. Consider the following:
- 'retry': If error is transient (network, rate limits like 429) OR validation critique suggests content might improve (e.g., validator suggested 'retry_task_new_params', 'refine_query', 'alternative_source'). Task must not exceed max retries (${DecisionEngine.MAX_TASK_RETRIES}). Suggest 'delayMs' (e.g., 1000 for 1st retry, 2000 for 2nd, etc.).
- 'abandon': If error is persistent (API key 401/403, fatal error, content safety, malformed request 400, max retries met) OR validation critique indicates unfixable content or validator suggested 'escalate_issue'.
- 're-plan': If task seems ill-defined, or error/validation critique suggests fundamental rethinking (e.g. validator suggested 'refine_query' for a complex issue).
- 'escalate': For critical, unrecoverable system errors or if human intervention is needed.
Return JSON: {"action": "...", "reason": "...", "delayMs": ... (optional, only for retry)}. Output only raw JSON. Max retries for a task is ${DecisionEngine.MAX_TASK_RETRIES}. Current retries: ${task.retries}.`;
      const userPrompt = `Failed Task Details:
ID: ${task.id}, Description: "${task.description}", Status: ${task.status}, Retries so far: ${task.retries}
Is this a validation failure?: ${isValidationFailure}
Primary Error/Critique: "${effectiveErrorMessage}"
${isValidationFailure && validationOutcome?.suggestedAction ? `Validator Suggested: ${validationOutcome.suggestedAction}` : ""}
Original Execution Error (if different): "${originalErrorForPrompt}"
Status Code (if applicable): ${errorStatusCode || 'N/A'}, Stack (if available): ${errorStack}
${failureHistoryContext}`;
      const fullPrompt = `${systemPrompt}\n\nOkay, analyze the following failed task.\n\n${userPrompt}`;
      try {
        const geminiParams: GeminiRequestParams = { prompt: fullPrompt, temperature: 0.3, maxOutputTokens: 250 };
        const response = await this.geminiClient.generate(geminiParams);
        const rawJsonResponse = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJsonResponse) {
          this.addLog({level: 'debug', message: `[DE] LLM raw response for task ${task.id} failure: ${rawJsonResponse.substring(0,100)}...`});
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
                    const overrideReason = `LLM suggested retry, but max retries (${task.retries}/${DecisionEngine.MAX_TASK_RETRIES}) reached. Overriding to 'abandon'. LLM Reason: ${llmChoice.reason}`;
                    this.addLog({level: 'warn', message: `[DE] LLM retry override for task ${task.id}`, details: { originalReason: llmChoice.reason, overrideReason }});
                    return { action: 'abandon', reason: overrideReason, delayMs: undefined };
                }
                if (typeof delay !== 'number' || delay <= 0) {
                  const defaultDelay = 1000 * Math.pow(2, task.retries);
                  this.addLog({level: 'warn', message: `[DE] LLM retry for task ${task.id} had invalid delayMs (${delay}). Defaulting.`, details: { defaultDelay }});
                  delay = defaultDelay; 
                }
              } else { delay = undefined; }
              this.addLog({level: 'info', message: `[DE] LLM decision for task ${task.id} failure: ${action}. Reason: ${llmChoice.reason}`});
              return { action, reason: `LLM Decision: ${llmChoice.reason}`, delayMs: delay };
            } else { this.addLog({level: 'warn', message: `[DE] LLM chose invalid action "${action}" for task ${task.id}. Falling back to rules.`}); }
          } else { this.addLog({level: 'warn', message: `[DE] LLM response for task ${task.id} failure not in expected format. Falling back.`, details: {response: llmChoice}}); }
        } else { this.addLog({level: 'warn', message: `[DE] No content from LLM for task ${task.id} failure. Falling back.`}); }
      } catch (llmError: any) { this.addLog({level: 'error', message: `[DE] Error using LLM for task ${task.id} failure. Falling back.`, details: {error: llmError.message}}); }
    }

    this.addLog({level: 'debug', message: `[DE] Using rule-based logic for task ${task.id} failure. IsValidationFailure: ${isValidationFailure}`});
    const currentRuleErrorMessage = effectiveErrorMessage; 
    let action_rule: FailedTaskAction = 'abandon'; 
    let reason_rule = 'Default: Unknown error or max retries exceeded.';
    let delayMs_rule: number | undefined = undefined;

    if (isValidationFailure) {
      this.addLog({level: 'debug', message: `[DE] Applying rules for validation failure for task ${task.id}. Validator critique: ${validationOutcome?.critique}`});
      const validatorSuggestedAction = validationOutcome?.suggestedAction;
      if (task.retries < DecisionEngine.MAX_TASK_RETRIES) {
        action_rule = 'retry'; 
        delayMs_rule = 1000 * Math.pow(2, task.retries); 
        reason_rule = `Rule-based: Validation failed ("${validationOutcome?.critique || 'No critique.'}"). `;
        if (validatorSuggestedAction === 'refine_query' || validatorSuggestedAction === 'retry_task_new_params') reason_rule += `Validator suggested ${validatorSuggestedAction}. Suggesting retry #${task.retries + 1}.`;
        else if (validatorSuggestedAction === 'alternative_source') reason_rule += `Validator suggested trying an alternative source. Suggesting retry (caller might try different source/params).`;
        else reason_rule += `Suggesting retry #${task.retries + 1}.`;
      } else {
        action_rule = 'abandon';
        reason_rule = `Rule-based: Validation failed ("${validationOutcome?.critique || 'No critique.'}"), and max retries reached.`;
      }
      this.addLog({level: 'info', message: `[DE] Rule-based decision for task ${task.id} (validation failure): ${action_rule}. Reason: ${reason_rule}`});
      return { action: action_rule, reason: reason_rule, delayMs: delayMs_rule }; 
    }

    if (currentRuleErrorMessage.includes('network error') || currentRuleErrorMessage.includes('socket hang up') || currentRuleErrorMessage.includes('timeout') || currentRuleErrorMessage.includes('etimedout') || currentRuleErrorMessage.includes('econnreset') || currentRuleErrorMessage.includes('service unavailable') || currentRuleErrorMessage.includes('rate limit exceeded') || currentRuleErrorMessage.includes('tavily api rate limit exceeded') || currentRuleErrorMessage.includes('gemini sdk error: 429') || (errorStatusCode === 429 || errorStatusCode === 503 || errorStatusCode === 504)) {
      if (task.retries < DecisionEngine.MAX_TASK_RETRIES) { 
        action_rule = 'retry'; delayMs_rule = 1000 * Math.pow(2, task.retries); 
        reason_rule = `Rule-based: Transient error detected ("${currentRuleErrorMessage}"). Suggesting retry #${task.retries + 1} after ${delayMs_rule/1000}s.`;
      } else { action_rule = 'abandon'; reason_rule = `Rule-based: Transient error detected, but max retries (${DecisionEngine.MAX_TASK_RETRIES}) reached. Original error: "${currentRuleErrorMessage}"`;}
    } else if (currentRuleErrorMessage.includes('api key not configured') || currentRuleErrorMessage.includes('invalid api key') || currentRuleErrorMessage.includes('api key invalid') || currentRuleErrorMessage.includes('authentication failed') || currentRuleErrorMessage.includes('unauthorized') || (errorStatusCode === 401 || errorStatusCode === 403)) {
      action_rule = 'abandon'; reason_rule = `Rule-based: Configuration error ("${currentRuleErrorMessage}"). Suggesting abandon.`;
    } else if (currentRuleErrorMessage.includes('bad request') || currentRuleErrorMessage.includes('invalid parameter') || currentRuleErrorMessage.includes('query format incorrect') || currentRuleErrorMessage.includes('invalid input') || (errorStatusCode === 400)) {
      action_rule = 'abandon'; reason_rule = `Rule-based: Invalid input/bad request ("${currentRuleErrorMessage}"). Suggesting abandon.`;
    } else if (currentRuleErrorMessage.includes('blocked due to safety settings') || currentRuleErrorMessage.includes('prompt blocked') || currentRuleErrorMessage.includes('promptfeedback.blockreason')) { 
      action_rule = 'abandon'; reason_rule = `Rule-based: Content safety restriction ("${currentRuleErrorMessage}"). Suggesting abandon.`;
    } else if (task.retries >= DecisionEngine.MAX_TASK_RETRIES) {
      action_rule = 'abandon'; reason_rule = `Rule-based: Max retries (${DecisionEngine.MAX_TASK_RETRIES}) reached with unclassified error: "${currentRuleErrorMessage}"`;
    } else if (task.retries < DecisionEngine.MAX_TASK_RETRIES) {
      action_rule = 'retry'; delayMs_rule = 1000 * Math.pow(2, task.retries); 
      reason_rule = `Rule-based: Unclassified error ("${currentRuleErrorMessage}"), retries remaining. Suggesting retry #${task.retries + 1} after ${delayMs_rule/1000}s.`;
    }
    this.addLog({level: 'info', message: `[DE] Rule-based decision for task ${task.id} failure: ${action_rule}. Reason: ${reason_rule}`});
    return { action: action_rule, reason: reason_rule, delayMs: delayMs_rule };
  }

  // Future methods:
  // public shouldDecomposeFurther(task: Task, currentDepth: number): boolean { ... }
  // public determineNextAction(missionStatus: Mission['status'], tasks: Task[]): string { ... }
  // public synthesizeResults(taskResults: any[]): string { ... }
}
