// src/lib/search/ResultValidator.ts
import { Task } from '@/lib/types/agent'; 
import { DecisionEngine } from '@/lib/agent/DecisionEngine'; // Import DecisionEngine for MAX_TASK_RETRIES

// Define possible actions based on validation, for future DecisionEngine use
export type ValidationSuggestedAction = 
  | 'accept' 
  | 'retry_task_new_params' // e.g., different query for the same task
  | 'refine_query'          // Similar to above, but more specific to query
  | 'alternative_source'    // Try a different search provider or method
  | 'escalate_issue';       // If result indicates a deeper problem

// Input for the validation method
export interface ValidationInput {
  task: Task;         // The task that produced the result
  result: any;        // The actual result content to validate (e.g., search result string)
  // We could add more context if needed, like original query, provider used, etc.
}

// Output of the validation method
export interface ValidationOutput {
  isValid: boolean;                  // Simple flag: does the result pass basic checks?
  qualityScore?: number;             // Optional: a numeric score (e.g., 0.0 to 1.0)
  critique?: string;                 // Explanation if not valid, or notes on quality/deficiencies
  suggestedAction?: ValidationSuggestedAction; // Optional: hint for how DecisionEngine might proceed
  // We can add more structured feedback later, e.g., identified issues, keywords missing etc.
}

export class ResultValidator {
  constructor() {
    console.log('[ResultValidator] Initialized.');
    // Constructor could take configuration for validation rules in the future
  }

  public validate(input: ValidationInput): ValidationOutput {
    const { task, result } = input;
    const resultString = String(result).trim(); // Convert result to string and trim whitespace

    console.log(`[ResultValidator] Validating result for task ${task.id}. Result preview: "${resultString.substring(0, 100)}..."`);

    // 1. Check for empty or missing results
    if (result === null || result === undefined || resultString === '') {
      return {
        isValid: false,
        qualityScore: 0.0,
        critique: 'Result is empty or missing.',
        // Use DecisionEngine's MAX_TASK_RETRIES to inform suggestion
        suggestedAction: task.retries < DecisionEngine.MAX_TASK_RETRIES ? 'retry_task_new_params' : 'alternative_source', 
      };
    }

    // 2. Check for common error messages within the result string
    const commonErrorSubstrings = [
      'api key invalid', 'api key not configured', 'authentication failed',
      'error occurred', 'failed to fetch', 'cannot connect', 'service unavailable',
      'no results found', 'search returned no results', 'query format incorrect',
      'parameter invalid', 'bad request', 'page not found', '400 bad request', '401 unauthorized', 
      '403 forbidden', '404 not found', '500 internal server error', '503 service unavailable',
      'configuration error:', // Custom error prefix from our system
      'execution error:', // Custom error prefix from our system
      'task execution failed', // Custom error message
      "search failed or no provider was executed", // from TaskExecutor
      "no search provider action taken", // from TaskExecutor
    ];
    const resultLower = resultString.toLowerCase();
    for (const errorMsg of commonErrorSubstrings) {
      if (resultLower.includes(errorMsg.toLowerCase())) { // Ensure errorMsg is also lowercased for comparison
        return {
          isValid: false,
          qualityScore: 0.1,
          critique: `Result contains a common error message or indicates no results: "${errorMsg}".`,
          suggestedAction: task.retries < DecisionEngine.MAX_TASK_RETRIES ? 'retry_task_new_params' : 'alternative_source',
        };
      }
    }
    
    // 4. Check for "placeholder" or "not implemented" style results from our own system (if applicable)
    // (Moved before length check, as placeholders can be short)
    const placeholderSubstrings = [
        "simulated success for:", 
        "gemini search chosen - execution path not fully implemented", // Specific placeholder
        "gemini search chosen - execution path is a placeholder", // Variation
        "search did not produce results" // Generic message from TaskExecutor for some paths
    ];
    for (const placeholder of placeholderSubstrings) {
        if (resultLower.includes(placeholder.toLowerCase())) {
            return {
                isValid: false,
                qualityScore: 0.05,
                critique: `Result appears to be a placeholder or simulated content: "${placeholder}".`,
                suggestedAction: task.retries < DecisionEngine.MAX_TASK_RETRIES ? 'retry_task_new_params' : 'alternative_source',
            };
        }
    }

    // 3. Check for very short results if substantial information was expected
    const minLengthThreshold = 50; // characters; configurable
    if (resultString.length < minLengthThreshold) {
      return {
        isValid: false, 
        qualityScore: 0.3,
        critique: `Result is very short (length: ${resultString.length} chars). May not be sufficient unless a specific, concise answer was expected.`,
        suggestedAction: task.retries < DecisionEngine.MAX_TASK_RETRIES ? 'refine_query' : 'alternative_source',
      };
    }


    // If all checks pass, consider it structurally valid for now
    return {
      isValid: true,
      qualityScore: 0.7, // Default score for passing basic heuristic checks
      critique: 'Result passed basic heuristic checks (not empty, no obvious errors, sufficient length).',
      suggestedAction: 'accept',
    };
  }

  // Future methods could include:
  // public async validateWithLLM(input: ValidationInput): Promise<ValidationOutput> { ... }
  // private checkRelevance(result: any, query: string): number { ... }
  // private checkForHallucinations(text: string): boolean { ... }
}
