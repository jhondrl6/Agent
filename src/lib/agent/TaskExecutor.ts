// src/lib/agent/TaskExecutor.ts
import { Task } from '@/lib/types/agent';
import { useAgentStore } from './StateManager'; 
import { TavilyClient } from '@/lib/search/TavilyClient';
import { TavilySearchParams, TavilySearchResponse } from '@/lib/types/search';

export class TaskExecutor {

  constructor() {
    console.log('[TaskExecutor] Initialized');
  }

  private extractSearchQuery(description: string, keywords: string[]): string {
    const descriptionLower = description.toLowerCase();
    for (const keyword of keywords) {
      const keywordWithSpace = keyword + " ";
      let keywordIndex = descriptionLower.indexOf(keywordWithSpace);
      
      // Check if keyword is at the beginning
      if (keywordIndex === 0) {
        return description.substring(keywordWithSpace.length).trim();
      }
      
      // Check if keyword is elsewhere but clearly delimited (e.g. "perform a search for X")
      // This part can be tricky and might need more sophisticated NLP or regex
      // For now, we'll stick to simpler prefix stripping or use the whole description if keyword is just "present"
      // A simple approach if keyword is just "present" (and not at start) might be to take text after it.
      // However, "research X" is different from "perform research for X".
      // Let's assume for now if a keyword is present, the most significant part of the query follows it.
      // This is a placeholder for more advanced query extraction.
      if (keywordIndex > 0) {
          // A more robust approach might look for the keyword and take the rest of the string
          // e.g. if task is "Review findings and then research impacts of X"
          // we want "impacts of X", not "review findings and then research impacts of X"
          // This naive approach will take everything after the first found keyword.
          return description.substring(keywordIndex + keywordWithSpace.length).trim();
      }
    }
    // If no specific keyword prefix is found, but task is identified as search,
    // the whole description might be the query, or it implies a general research task.
    // For now, let's return the original description if no keyword is stripped.
    // This means "research climate change" will use "climate change" if "research" is stripped.
    // "climate change research" would use "climate change research" if "research" isn't a prefix.
    return description; 
  }

  public async executeTask(missionId: string, task: Task): Promise<void> {
    const storeActions = useAgentStore.getState();
    
    console.log(`[TaskExecutor] Attempting execution for task: ${task.id} - "${task.description}" under mission ${missionId}`);
    storeActions.updateTask(missionId, task.id, { status: 'in-progress' });
    console.log(`[TaskExecutor] Task ${task.id} status updated to 'in-progress'.`);

    try {
      const descriptionLower = task.description.toLowerCase();
      const searchKeywords = ["search for", "find information on", "find information about", "research", "look up", "investigate"];
      // A task is a search task if *any* part of its description contains these keywords.
      // This is a broad heuristic.
      const isSearchTask = searchKeywords.some(keyword => descriptionLower.includes(keyword));

      if (isSearchTask) {
        console.log(`[TaskExecutor] Task ${task.id} identified as a search task.`);
        const apiKey = process.env.TAVILY_API_KEY;
        if (!apiKey) {
          console.error('[TaskExecutor] Tavily API key (TAVILY_API_KEY) is not configured.');
          storeActions.updateTask(missionId, task.id, { status: 'failed', result: 'Configuration error: Tavily API key not found.' });
          storeActions.setAgentError('Tavily API key not configured. Please set TAVILY_API_KEY.');
          return;
        }

        let query = this.extractSearchQuery(task.description, searchKeywords);
        // If extraction results in empty query, fallback to full description or a part of it.
        if (!query.trim()) {
            console.warn(`[TaskExecutor] Query extraction for task "${task.description}" resulted in an empty query. Falling back to full description.`);
            query = task.description;
        }
        console.log(`[TaskExecutor] Extracted query for Tavily: "${query}"`);

        const tavilyClient = new TavilyClient(apiKey);
        // TODO: Make search_depth and max_results configurable, possibly from the task itself if specified by decomposer
        const searchParams: TavilySearchParams = { query, search_depth: 'basic', max_results: 5, include_answer: true }; 
        
        const tavilyResponse = await tavilyClient.search(searchParams);

        if (tavilyResponse && (tavilyResponse.answer || (tavilyResponse.results && tavilyResponse.results.length > 0))) {
          let formattedResults = "";
          if (tavilyResponse.answer) {
            formattedResults += `Tavily Answer: ${tavilyResponse.answer}\n\n`;
          }
          if (tavilyResponse.results && tavilyResponse.results.length > 0) {
            formattedResults += "Search Results:\n" + tavilyResponse.results.map(
              (res, idx) => `${idx+1}. ${res.title}\n   URL: ${res.url}\n   Snippet: ${res.content.substring(0, 250)}...\n`
            ).join('\n');
          }
          console.log(`[TaskExecutor] Task ${task.id} (Tavily Search) completed successfully.`);
          storeActions.updateTask(missionId, task.id, { 
            status: 'completed', 
            result: formattedResults.trim(),
          });
        } else {
          console.warn(`[TaskExecutor] Task ${task.id} (Tavily Search) returned no meaningful results or an error occurred internally in client.`);
          storeActions.updateTask(missionId, task.id, { 
            status: 'failed', 
            result: 'Tavily Search returned no results or an internal error occurred.',
          });
        }
      } else {
        // Existing simulation logic for non-search tasks
        console.log(`[TaskExecutor] Task ${task.id} is not a search task. Using simulation.`);
        const executionTime = Math.random() * 1500 + 500; // 0.5-2 seconds
        await new Promise(resolve => setTimeout(resolve, executionTime));
        const isSuccess = Math.random() > 0.2; // 80% chance of success

        if (isSuccess) {
          storeActions.updateTask(missionId, task.id, { status: 'completed', result: `Simulated success for: ${task.description}. Lorem ipsum dolor sit amet.` });
        } else {
          storeActions.updateTask(missionId, task.id, { status: 'failed', result: `Simulated failure for: ${task.description}. Operation did not complete as expected.` });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during task execution.';
      console.error(`[TaskExecutor] Error executing task ${task.id}:`, errorMessage);
      storeActions.setAgentError(`Failed to execute task ${task.id}: ${errorMessage}`);
      try {
        storeActions.updateTask(missionId, task.id, { 
          status: 'failed', 
          result: `Execution error: ${errorMessage}`,
        });
      } catch (storeUpdateError) {
        console.error(`[TaskExecutor] CRITICAL: Failed to update task ${task.id} status to 'failed' in store after an execution error. Store error:`, storeUpdateError);
      }
    }
  }
}
