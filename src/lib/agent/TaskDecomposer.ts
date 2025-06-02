import { Mission, Task } from '@/lib/types/agent';
import { GeminiClient } from '@/lib/search/GeminiClient';
import { GeminiRequestParams } from '@/lib/types/search'; // Ensure this is imported for params

import { LogLevel } from '@/lib/types/agent'; // For addLog type

export class TaskDecomposer {
  private geminiClient: GeminiClient;
  private addLog: (entryData: { level: LogLevel; message: string; details?: any }) => void;

  constructor(
    geminiApiKey: string, 
    addLogFunction: (entryData: { level: LogLevel; message: string; details?: any }) => void
  ) {
    if (!geminiApiKey) {
      // This error should ideally be logged before throwing if addLog is available,
      // but constructor failure means we might not have it.
      // Consider logging from the caller if constructor fails.
      throw new Error('Gemini API key is required for TaskDecomposer.');
    }
    this.geminiClient = new GeminiClient(geminiApiKey);
    this.addLog = addLogFunction;
    this.addLog({ level: 'info', message: '[TaskDecomposer] Initialized with GeminiClient.' });
  }

  async decomposeMission(mission: Mission): Promise<Task[]> {
    console.log(`[TaskDecomposer] Decomposing mission with Gemini: "${mission.goal}" (ID: ${mission.id})`);

    // System prompt defining the expected behavior and JSON output format
    const systemPrompt = `You are an expert task decomposition AI. Your role is to break down a complex research mission into a series of actionable, distinct, and parallelizable sub-tasks.

Return the tasks as a valid JSON array of objects. Each object in the array must have ONLY a "description" field detailing the sub-task.
Do NOT include any other fields like id, status, etc.
Do NOT output markdown (e.g., \`\`\`json ... \`\`\`). Output only the raw JSON array.

Example Input Mission: "Research the impact of AI on climate change."
Example Output JSON:
[
  {"description": "Identify key areas where AI intersects with climate change (e.g., energy, agriculture, monitoring)."},
  {"description": "Search for recent scientific papers and reports on AI applications in climate change mitigation."},
  {"description": "Analyze data on the carbon footprint of AI model training and inference."},
  {"description": "Investigate policy recommendations for leveraging AI to combat climate change."},
  {"description": "Synthesize findings into a summary report."}
]`;

    const userPrompt = `Mission: "${mission.goal}"`;

    // Combine system and user prompts into a single string for the current GeminiClient structure
    const fullPrompt = `${systemPrompt}

Okay, now decompose the following user request. Ensure your output is ONLY the JSON array as specified.

User Request:
${userPrompt}`;
    
    const geminiParams: GeminiRequestParams = {
        prompt: fullPrompt,
        temperature: 0.3, // Lower temperature for more deterministic, structured output
        maxOutputTokens: 1024, // Adjust based on expected number of tasks / length of descriptions
        // Consider adding stop sequences if the model tends to add extra text after JSON.
    };

    try {
      const response = await this.geminiClient.generate(geminiParams);
      
      // Assuming GeminiClient returns structure: response.candidates[0].content.parts[0].text
      const rawJsonResponse = response.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawJsonResponse) {
        console.error('[TaskDecomposer] No content received from Gemini API or unexpected response structure.');
        throw new Error('No content from Gemini API or unexpected response structure.');
      }
      
      console.log('[TaskDecomposer] Raw response from Gemini:', rawJsonResponse);

      // Attempt to clean the response if it's wrapped in markdown or has other artifacts
      let cleanedJson = rawJsonResponse.trim();
      if (cleanedJson.startsWith('```json')) {
        cleanedJson = cleanedJson.substring(7);
      } else if (cleanedJson.startsWith('```')) {
        cleanedJson = cleanedJson.substring(3);
      }
      if (cleanedJson.endsWith('```')) {
        cleanedJson = cleanedJson.substring(0, cleanedJson.length - 3);
      }
      cleanedJson = cleanedJson.trim(); // Trim again after potential markdown removal

      // Validate if the cleaned string is likely JSON before parsing
      if (!cleanedJson.startsWith('[') || !cleanedJson.endsWith(']')) {
          console.error('[TaskDecomposer] Cleaned response does not appear to be a JSON array:', cleanedJson);
          throw new Error('Gemini response is not a valid JSON array after cleaning.');
      }

      const decomposedTaskDescriptions = JSON.parse(cleanedJson) as { description: string }[];

      if (!Array.isArray(decomposedTaskDescriptions) || !decomposedTaskDescriptions.every(t => t && typeof t.description === 'string')) {
          console.error('[TaskDecomposer] Parsed JSON is not in the expected format (array of {description: string}). Parsed:', decomposedTaskDescriptions);
          throw new Error('Gemini response not in the expected task description format after parsing.');
      }
      
      if (decomposedTaskDescriptions.length === 0) {
        console.warn('[TaskDecomposer] Gemini returned an empty array of tasks for mission:', mission.goal);
        // Decide if this is an error or a valid case (e.g., mission too simple)
        // For now, let's treat it as potentially valid but return a specific fallback if needed by business logic
        // Or, could throw an error here: throw new Error('Gemini returned no tasks.');
      }


      return decomposedTaskDescriptions.map((taskDesc, index) => ({
        id: `${mission.id}-task-${String(index + 1).padStart(3, '0')}`, // e.g., mission-xyz-task-001
        missionId: mission.id,
        description: taskDesc.description,
        status: 'pending',
        retries: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        result: undefined, 
      }));

    } catch (error) {
      console.error(`[TaskDecomposer] Error decomposing mission "${mission.goal}" with Gemini:`, error);
      let errorMessage = 'Failed to decompose mission using LLM.';
      if (error instanceof Error) {
          errorMessage = error.message;
      }
      // Fallback to a single task indicating failure
      return [
        {
          id: `${mission.id}-task-fallback`,
          missionId: mission.id,
          description: `Fallback: Could not decompose mission "${mission.goal}". Reason: ${errorMessage}`,
          status: 'pending', // Or 'failed' immediately if preferred
          retries: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          result: undefined,
        },
      ];
    }
  }
}

// Example Usage (for conceptual testing - ensure GEMINI_API_KEY is set in .env)
/*
async function testRealDecomposition() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set for TaskDecomposer test.");
    return;
  }
  const decomposer = new TaskDecomposer(apiKey);
  const sampleMission: Mission = {
    id: 'mission-gemini-002',
    goal: 'Develop a comprehensive marketing strategy for a new sustainable coffee brand.',
    tasks: [],
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  try {
    console.log(`[TaskDecomposer Test] Decomposing mission: "${sampleMission.goal}"`);
    const tasks = await decomposer.decomposeMission(sampleMission);
    console.log('[TaskDecomposer Test] Decomposed tasks:', JSON.stringify(tasks, null, 2));
    if (tasks.length > 0 && tasks[0].id.includes('fallback')) {
        console.warn("[TaskDecomposer Test] Decomposition resulted in a fallback task.");
    } else if (tasks.length === 0) {
        console.warn("[TaskDecomposer Test] Decomposition resulted in zero tasks.");
    } else {
        console.log(`[TaskDecomposer Test] Successfully decomposed into ${tasks.length} tasks.`);
    }
  } catch (e) {
      console.error("[TaskDecomposer Test] Error during test:", e)
  }
}
// testRealDecomposition();
*/
