// src/lib/search/ResultValidator.test.ts
import { ResultValidator, ValidationInput } from './ResultValidator'; 
import { Task } from '@/lib/types/agent'; 
import { DecisionEngine } from '@/lib/agent/DecisionEngine'; // For MAX_TASK_RETRIES

// Mock Task for testing
const mockTaskDefault: Task = {
  id: 'test-task-1',
  missionId: 'test-mission-1',
  description: 'Test task description',
  status: 'completed', // Assume task completed its execution for validation phase
  retries: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  // result, validationOutcome, failureDetails will be set by tests or not relevant for basic mock
};

describe('ResultValidator', () => {
  let validator: ResultValidator;
  let mockTask: Task; // To allow modification per test if needed

  beforeEach(() => {
    validator = new ResultValidator();
    // Reset mockTask before each test to ensure clean state if a test modifies it
    mockTask = { ...mockTaskDefault }; 
  });

  it('should invalidate null or undefined results', () => {
    const inputNull: ValidationInput = { task: mockTask, result: null };
    const outputNull = validator.validate(inputNull);
    expect(outputNull.isValid).toBe(false);
    expect(outputNull.critique).toBe('Result is empty or missing.');
    expect(outputNull.qualityScore).toBe(0.0);

    const inputUndefined: ValidationInput = { task: mockTask, result: undefined };
    const outputUndefined = validator.validate(inputUndefined);
    expect(outputUndefined.isValid).toBe(false);
    expect(outputUndefined.critique).toBe('Result is empty or missing.');
  });

  it('should invalidate empty string results (including whitespace only)', () => {
    const input: ValidationInput = { task: mockTask, result: '   ' }; 
    const output = validator.validate(input);
    expect(output.isValid).toBe(false);
    expect(output.critique).toBe('Result is empty or missing.');
  });

  it('should invalidate results containing common error substrings', () => {
    const errorMessages = [
      'Some text about API KEY INVALID here',
      'Search returned no results for your query.',
      '500 internal server error occurred',
      'failed to fetch content',
      'Configuration error: API key not found.', // Test our own custom messages
      'Execution error: Simulated failure.',
      "search failed or no provider was executed",
      "no search provider action taken",
    ];
    errorMessages.forEach(errMsg => {
      const input: ValidationInput = { task: mockTask, result: errMsg };
      const output = validator.validate(input);
      expect(output.isValid).toBe(false);
      expect(output.critique).toContain('Result contains a common error message or indicates no results:');
      expect(output.qualityScore).toBe(0.1);
    });
  });
  
  it('should correctly use task.retries for suggestedAction on error/empty results', () => {
    // Case 1: Retries maxed out
    const taskWithMaxRetries: Task = { ...mockTask, retries: DecisionEngine.MAX_TASK_RETRIES };
    const inputMaxRetries: ValidationInput = { task: taskWithMaxRetries, result: 'no results found' };
    const outputMaxRetries = validator.validate(inputMaxRetries);
    expect(outputMaxRetries.isValid).toBe(false);
    expect(outputMaxRetries.suggestedAction).toBe('alternative_source'); 

    // Case 2: Retries not maxed out
    const taskLowRetries: Task = { ...mockTask, retries: 0 };
    const inputLowRetries: ValidationInput = { task: taskLowRetries, result: 'no results found' };
    const outputLowRetries = validator.validate(inputLowRetries);
    expect(outputLowRetries.isValid).toBe(false);
    expect(outputLowRetries.suggestedAction).toBe('retry_task_new_params'); 
    
    // Case 3: Empty result, retries not maxed out
    const inputEmptyLowRetries: ValidationInput = { task: taskLowRetries, result: '' };
    const outputEmptyLowRetries = validator.validate(inputEmptyLowRetries);
    expect(outputEmptyLowRetries.isValid).toBe(false);
    expect(outputEmptyLowRetries.suggestedAction).toBe('retry_task_new_params');
  });

  it('should invalidate results containing placeholder substrings', () => {
    const placeholders = [
      'This is a simulated success for: some task',
      'Gemini search chosen - execution path not fully implemented by agent.',
      'Search did not produce results as per executor.',
    ];
    placeholders.forEach(placeholder => {
      const input: ValidationInput = { task: mockTask, result: placeholder };
      const output = validator.validate(input);
      expect(output.isValid).toBe(false);
      expect(output.critique).toContain('Result appears to be a placeholder or simulated content:');
      expect(output.qualityScore).toBe(0.05);
    });
  });

  it('should invalidate very short results (below threshold)', () => {
    const shortResult = 'Too short.'; // Length 10, default threshold is 50
    const input: ValidationInput = { task: mockTask, result: shortResult };
    const output = validator.validate(input);
    expect(output.isValid).toBe(false);
    expect(output.critique).toContain(`Result is very short (length: ${shortResult.length} chars).`);
    expect(output.qualityScore).toBe(0.3); // As per current logic in ResultValidator for short results
    expect(output.suggestedAction).toBe('refine_query');
  });
  
  it('should correctly use task.retries for suggestedAction on short results', () => {
    const shortResult = 'Too short.';
     // Case 1: Retries maxed out for short result
    const taskWithMaxRetries: Task = { ...mockTask, retries: DecisionEngine.MAX_TASK_RETRIES };
    const inputMaxRetries: ValidationInput = { task: taskWithMaxRetries, result: shortResult };
    const outputMaxRetries = validator.validate(inputMaxRetries);
    expect(outputMaxRetries.isValid).toBe(false);
    expect(outputMaxRetries.suggestedAction).toBe('alternative_source'); 

    // Case 2: Retries not maxed out for short result
    const taskLowRetries: Task = { ...mockTask, retries: 0 };
    const inputLowRetries: ValidationInput = { task: taskLowRetries, result: shortResult };
    const outputLowRetries = validator.validate(inputLowRetries);
    expect(outputLowRetries.isValid).toBe(false);
    expect(outputLowRetries.suggestedAction).toBe('refine_query'); 
  });


  it('should validate good, substantial results', () => {
    const goodResult = 'This is a good, substantial result that is longer than fifty characters and does not contain any known error messages or placeholders content from the system.';
    const input: ValidationInput = { task: mockTask, result: goodResult };
    const output = validator.validate(input);
    expect(output.isValid).toBe(true);
    expect(output.critique).toContain('Result passed basic heuristic checks');
    expect(output.qualityScore).toBe(0.7);
    expect(output.suggestedAction).toBe('accept');
  });
  
  it('should handle results that are numbers or other non-string types by stringifying them for length check', () => {
    const numberResultInput: ValidationInput = { task: mockTask, result: 12345 }; 
    const numberOutput = validator.validate(numberResultInput);
    // String(12345).length = 5, so it's "too short" by default threshold 50
    expect(numberOutput.isValid).toBe(false);
    expect(numberOutput.critique).toContain('Result is very short');

    const booleanResultInput: ValidationInput = { task: mockTask, result: true };
    const booleanOutput = validator.validate(booleanResultInput);
    // String(true).length = 4
    expect(booleanOutput.isValid).toBe(false); 
    expect(booleanOutput.critique).toContain('Result is very short');
  });

});
