import { Mission, Task } from '@/lib/types/agent';

// Placeholder for OpenAI API client (replace with actual implementation later)
const openai = {
  chat: {
    completions: {
      create: async (params: any): Promise<any> => {
        console.log('[TaskDecomposer] OpenAI API call mocked:', params);
        // Simulate a delay and a simple decomposition
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Extract missionId from the prompt content if possible, otherwise use a default
        let missionId = 'unknown-mission';
        if (params.messages && params.messages[1] && params.messages[1].content) {
            const match = params.messages[1].content.match(/Mission ID: (\S+)/);
            if (match && match[1]) {
                missionId = match[1];
            }
        }
        return {
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { id: 'task-1', description: 'First sub-task based on mission.', status: 'pending', retries: 0, missionId: missionId },
                  { id: 'task-2', description: 'Second sub-task to achieve goal.', status: 'pending', retries: 0, missionId: missionId },
                ]),
              },
            },
          ],
        };
      },
    },
  },
};

export class TaskDecomposer {
  constructor(private apiKey: string) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required for TaskDecomposer.');
    }
    // In a real scenario, you'd initialize your OpenAI client here
  }

  async decomposeMission(mission: Mission): Promise<Task[]> {
    console.log(`[TaskDecomposer] Decomposing mission: ${mission.goal} (ID: ${mission.id})`);

    const prompt = `
      You are an expert task decomposition AI.
      Given a research mission, break it down into a series of actionable, parallelizable tasks.
      Return the tasks as a JSON array of objects, where each object has 'id', 'description', 'status', and 'missionId'.
      Ensure tasks are granular enough to be executed independently.

      Mission: "${mission.goal}"
      Mission ID: ${mission.id}
    `;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo', // Or your preferred model
        messages: [
          { role: 'system', content: 'You are an expert task decomposition AI.' },
          { role: 'user', content: prompt },
        ],
        // response_format: { type: "json_object" }, // If using models that support JSON output and the SDK version supports it
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from OpenAI API.');
      }

      // Assuming content is a JSON string array of partial tasks
      const decomposedTasksInput = JSON.parse(content) as Partial<Omit<Task, 'createdAt' | 'updatedAt' | 'missionId' | 'id' | 'retries'>>[];


      return decomposedTasksInput.map((taskInput, index) => ({
        id: `${mission.id}-task-${index + 1}`, // Ensure unique task IDs
        missionId: mission.id,
        description: taskInput.description || `Task ${index + 1} for ${mission.goal}`,
        status: 'pending',
        result: undefined,
        retries: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

    } catch (error) {
      console.error('[TaskDecomposer] Error decomposing mission:', error);
      // Fallback to a simple task if decomposition fails
      return [
        {
          id: `${mission.id}-task-fallback`,
          missionId: mission.id,
          description: `Fallback task for: ${mission.goal}`,
          status: 'pending',
          result: undefined,
          retries: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
    }
  }
}

// Example Usage (for testing purposes, remove later)
/*
async function testDecomposition() {
  const decomposer = new TaskDecomposer('test-api-key'); // Replace with your actual API key for real tests
  const sampleMission: Mission = {
    id: 'mission-001',
    goal: 'Research the impact of AI on climate change.',
    tasks: [],
    status: 'pending',
  };
  const tasks = await decomposer.decomposeMission(sampleMission);
  console.log('[TaskDecomposer] Decomposed tasks:', tasks);
}
testDecomposition();
*/
