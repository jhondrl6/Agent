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
    this.addLog({ level: 'info', message: `[TD] Decomposing mission: ${mission.id}`, details: { missionId: mission.id, goal: mission.goal } });

    // System prompt defining the expected behavior and JSON output format
    const systemPrompt = `You are an expert task decomposition AI. Your role is to break down a complex research mission into a series of actionable, distinct, and parallelizable sub-tasks. Each task should be phrased as a research or investigation step.

Return the tasks as a valid JSON array of objects. Each object in the array must have ONLY a "description" field.
- Each description should clearly state the research action. For example, start with phrases like "Research and define...", "Find information on...", "Investigate the details of...", "Search for examples of...".
- Ensure the core of the original sub-task's meaning is preserved.
- Do NOT include any other fields like id, status, etc.
- Do NOT output markdown (e.g., \`\`\`json ... \`\`\`). Output only the raw JSON array.

Example Input Mission: "Understand the process of photosynthesis."
Example Output JSON:
[
  {"description": "Research and define: Photosynthesis, explaining the general process in simple terms."},
  {"description": "Find information on: The light-dependent reactions, including photosystems I and II, the electron transport chain, and ATP/NADPH production."},
  {"description": "Investigate the details of: The light-independent reactions (Calvin Cycle), covering carbon fixation, reduction, and RuBP regeneration."},
  {"description": "Search for information on: The key inputs (water, CO2, light) and outputs (glucose, oxygen) of photosynthesis."}
]

Example Input Mission: "Explore the impact of renewable energy sources on reducing carbon emissions."
Example Output JSON:
[
  {"description": "Research and identify: The main types of renewable energy sources (solar, wind, hydro, geothermal)."},
  {"description": "Find information on: How each type of renewable energy source contributes to reducing carbon emissions."},
  {"description": "Investigate: Case studies or reports detailing the measured impact of renewable energy adoption on emission levels in specific regions or countries."},
  {"description": "Search for data on: The current global capacity and generation of renewable energy sources."}
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
    };

    try {
      this.addLog({ level: 'debug', message: `[TD] Sending prompt to LLM for task decomposition for mission ${mission.id}.`, details: { promptSummary: fullPrompt.substring(0, 250) + "..." } }); // Log fullPrompt summary
      const response = await this.geminiClient.generate(geminiParams);

      const rawJsonResponse = response.candidates?.[0]?.content?.parts?.[0]?.text;
      this.addLog({ level: 'debug', message: `[TD] Received LLM response for mission ${mission.id}.`, details: { summary: rawJsonResponse?.substring(0,150) } });


      if (!rawJsonResponse) {
        throw new Error(`No content from Gemini API or unexpected response structure for mission ${mission.id}.`);
      }

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

      this.addLog({ level: 'debug', message: `[TD] Attempting to parse cleaned JSON for mission ${mission.id}:`, details: { cleanedJson } });
      const decomposedTaskDescriptions = JSON.parse(cleanedJson) as { description: string }[];
      this.addLog({ level: 'debug', message: `[TD] Parsed task descriptions for mission ${mission.id}:`, details: { decomposedTaskDescriptions } });

      if (!Array.isArray(decomposedTaskDescriptions) || !decomposedTaskDescriptions.every(t => t && typeof t.description === 'string')) {
          console.error('[TaskDecomposer] Parsed JSON is not in the expected format (array of {description: string}). Parsed:', decomposedTaskDescriptions);
          throw new Error('Gemini response not in the expected task description format after parsing.');
      }

      if (decomposedTaskDescriptions.length === 0) {
        console.warn('[TaskDecomposer] Gemini returned an empty array of tasks for mission:', mission.goal);
        // Decide if this is an error or a valid case (e.g., mission too simple)
        // For now, let's treat it as potentially valid but return a specific fallback if needed by business logic
      }

      const mappedTasks = decomposedTaskDescriptions.map((taskDesc, index) => ({
        id: `${mission.id}-task-${String(index + 1).padStart(3, '0')}`,
        missionId: mission.id,
        description: taskDesc.description,
        status: 'pending' as Task['status'], // Cast to specific status type
        retries: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        result: undefined,
      }));

      this.addLog({ level: 'info', message: `[TD] Mission ${mission.id} decomposed into ${mappedTasks.length} tasks.`}); // Added missing closing backtick
      return mappedTasks;

    } catch (error: any) {
      this.addLog({ level: 'error', message: `[TD] Error decomposing mission ${mission.id}: ${error.message}`, details: { missionId: mission.id, missionGoal: mission.goal, errorDetails: error } });

      // Fallback to a single task indicating failure
      return [
        {
          id: `${mission.id}-task-fallback`,
          missionId: mission.id,
          description: `Fallback: Could not decompose mission "${mission.goal}". Reason: ${error.message}`,
          status: 'pending' as Task['status'], // Or 'failed' immediately if preferred
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
