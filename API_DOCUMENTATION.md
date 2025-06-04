# API Documentation

This document provides details about the API endpoints for the agent application.

## Agent Endpoints

### Mission Management

#### `POST /api/agent/mission`

*   **Description:** Creates a new mission for the agent. It involves decomposing the mission goal into tasks using an AI model and saving the mission and its tasks to the database.
*   **Request Body:**
    *   `goal` (string, required): The main objective of the mission.
    *   **Example:**
        ```json
        {
          "goal": "Research the weather in London for the next 3 days."
        }
        ```
*   **Response Format (Success: 201 Created):**
    *   Mission object (JSON), including the list of decomposed tasks.
        ```json
        {
          "id": "string (uuid)",
          "goal": "string",
          "status": "string (e.g., 'pending', 'in-progress', 'completed', 'failed')",
          "result": "string | null (JSON string representing mission result, potentially parsed)",
          "createdAt": "string (ISO 8601 datetime)",
          "updatedAt": "string (ISO 8601 datetime)",
          "tasks": [
            {
              "id": "string (uuid)",
              "missionId": "string (uuid)",
              "name": "string (task title)",
              "description": "string (detailed task description)",
              "status": "string (e.g., 'pending', 'in-progress', 'completed', 'failed')",
              "result": "string | null (JSON string representing task result, potentially parsed)",
              "toolName": "string | null (name of the tool used by the task)",
              "toolInput": "string | null (JSON string representing input for the tool, potentially parsed)",
              "failureDetails": "string | null (JSON string describing failure, potentially parsed)",
              "validationOutcome": "string | null (JSON string describing validation outcome, potentially parsed)",
              "createdAt": "string (ISO 8601 datetime)",
              "updatedAt": "string (ISO 8601 datetime)"
            }
            // ... more tasks
          ]
        }
        ```
*   **Response Status Codes (Error):**
    *   `400 Bad Request`: If `goal` is missing or invalid.
        *   **Example:** `{"error": "Goal is required and must be a non-empty string."}`
    *   `500 Internal Server Error`:
        *   If an API key (e.g., Gemini) is missing for task decomposition.
            *   **Example:** `{"error": "Server configuration error: Gemini API key is missing. Cannot decompose mission."}`
        *   If task decomposition fails for other reasons.
            *   **Example:** `{"error": "Task decomposition failed", "details": "Specific error message"}`
        *   If database operation fails.
            *   **Example:** `{"error": "Failed to save mission to database", "details": "Specific error message"}`
        *   For other general errors.
            *   **Example:** `{"error": "Failed to create mission", "details": "Specific error message"}`

#### `GET /api/agent/mission/{missionId}`

*   **Description:** Retrieves a specific mission by its ID, including its associated tasks. The tasks returned will have their JSON string fields (like `result`, `failureDetails`, `validationOutcome`) parsed into JSON objects.
*   **Path Parameters:**
    *   `missionId` (string, required): The unique identifier of the mission.
*   **Response Format (Success: 200 OK):**
    *   Mission object (JSON) - same structure as `POST /api/agent/mission` success response.
*   **Response Status Codes (Error):**
    *   `404 Not Found`: If the mission with the specified ID does not exist.
        *   **Example:** `{"error": "Mission not found"}`
    *   `500 Internal Server Error`: If there's an error retrieving the mission.
        *   **Example:** `{"error": "Failed to retrieve mission", "details": "Specific error message"}`

#### `PUT /api/agent/mission/{missionId}`

*   **Description:** Updates specific properties of a mission by its ID (e.g., `status`, `result`). It does not allow direct updates to tasks within the mission through this endpoint. The response will include the full mission object with tasks, where task JSON fields are parsed.
*   **Path Parameters:**
    *   `missionId` (string, required): The unique identifier of the mission.
*   **Request Body:**
    *   A JSON object containing fields to update (e.g., `status`, `result`). Fields like `id`, `createdAt`, `updatedAt`, and `tasks` from the body are ignored.
    *   **Example:**
        ```json
        {
          "status": "in-progress"
        }
        ```
*   **Response Format (Success: 200 OK):**
    *   Updated mission object (JSON) - same structure as `POST /api/agent/mission` success response.
*   **Response Status Codes (Error):**
    *   `400 Bad Request`: If no update data is provided in the request body.
        *   **Example:** `{"error": "No update data provided."}`
    *   `404 Not Found`: If the mission with the specified ID does not exist.
        *   **Example:** `{"error": "Mission not found"}`
    *   `500 Internal Server Error`: If there's an error updating the mission.
        *   **Example:** `{"error": "Failed to update mission", "details": "Specific error message"}`

#### `DELETE /api/agent/mission/{missionId}`

*   **Description:** Deletes a specific mission by its ID and all its associated tasks (due to cascading delete behavior in the database).
*   **Path Parameters:**
    *   `missionId` (string, required): The unique identifier of the mission.
*   **Response Format (Success: 200 OK):**
    ```json
    { "message": "Mission deleted successfully" }
    ```
*   **Response Status Codes (Error):**
    *   `404 Not Found`: If the mission with the specified ID does not exist (Prisma error P2025).
        *   **Example:** `{"error": "Mission not found"}`
    *   `500 Internal Server Error`: If there's an error deleting the mission.
        *   **Example:** `{"error": "Failed to delete mission", "details": "Specific error message"}`

### Agent Status

#### `GET /api/agent/status`

*   **Description:** Retrieves the general status of the agent, focusing on active missions. It returns a count of "in_progress" missions and their IDs.
*   **Request Parameters:** None.
*   **Response Format (Success: 200 OK):**
    ```json
    {
      "isActive": "boolean (true if activeMissionsCount > 0)",
      "activeMissionIds": ["string (uuid)", "..."],
      "activeMissionsCount": "number"
    }
    ```
*   **Response Status Codes (Error):**
    *   `500 Internal Server Error`: If there's an error fetching the agent status.
        *   **Example:** `{"error": "An error occurred while fetching agent status."}`

#### `GET /api/agent/status/{missionId}`

*   **Description:** Retrieves a specific mission by its ID, including all its details and tasks. This endpoint is functionally identical to `GET /api/agent/mission/{missionId}`.
*   **Path Parameters:**
    *   `missionId` (string, required): The unique identifier of the mission.
*   **Response Format (Success: 200 OK):**
    *   Mission object (JSON) - same structure as `POST /api/agent/mission` success response.
*   **Response Status Codes (Error):**
    *   `400 Bad Request`: If `missionId` is not provided (though typically caught by path parameter routing).
        *   **Example:** `{"error": "Mission ID is required"}`
    *   `404 Not Found`: If the mission with the specified ID does not exist.
        *   **Example:** `{"error": "Mission not found"}`
    *   `500 Internal Server Error`: If there's an error retrieving the mission status.
        *   **Example:** `{"error": "Failed to fetch mission status", "details": "Specific error message"}`
*   **Redundancy:** This endpoint is redundant with `GET /api/agent/mission/{missionId}`. Both provide the same information. Prefer using `GET /api/agent/mission/{missionId}` for clarity.

### Task Management

#### `POST /api/agent/task`

*   **Status:** The route file `src/app/api/agent/task/route.ts` is currently **empty**. This endpoint is **unimplemented**.
*   **Description (Intended):** If implemented, this endpoint would likely be used for creating individual tasks, potentially outside the direct lifecycle of a mission, or for allowing an agent to autonomously create new tasks.
*   **Request Parameters:** Not defined.
*   **Response Format:** Not defined.

#### `GET /api/agent/task/{taskId}`

*   **Description:** Retrieves a specific task by its ID. The response includes parsed JSON for fields like `result`, `failureDetails`, and `validationOutcome`.
*   **Path Parameters:**
    *   `taskId` (string, required): The unique identifier of the task.
*   **Response Format (Success: 200 OK):**
    *   Task object (JSON):
        ```json
        {
          "id": "string (uuid)",
          "missionId": "string (uuid)",
          "name": "string",
          "description": "string",
          "status": "string (e.g., 'pending', 'in-progress', 'completed', 'failed')",
          "result": "object | string | null (parsed JSON from string field)",
          "toolName": "string | null",
          "toolInput": "object | string | null (parsed JSON from string field)",
          "failureDetails": "object | string | null (parsed JSON from string field)",
          "validationOutcome": "object | string | null (parsed JSON from string field)",
          "createdAt": "string (ISO 8601 datetime)",
          "updatedAt": "string (ISO 8601 datetime)"
        }
        ```
*   **Response Status Codes (Error):**
    *   `404 Not Found`: If the task with the specified ID does not exist.
        *   **Example:** `{"error": "Task not found"}`
    *   `500 Internal Server Error`: If there's an error retrieving the task.
        *   **Example:** `{"error": "Failed to retrieve task", "details": "Specific error message"}`

#### `PUT /api/agent/task/{taskId}`

*   **Description:** Updates specific properties of a task by its ID (e.g., `status`, `result`, `toolInput`). Input JSON fields are stringified before DB storage. The response includes the updated task with these fields parsed back to JSON.
*   **Path Parameters:**
    *   `taskId` (string, required): The unique identifier of the task.
*   **Request Body:**
    *   A JSON object containing fields to update. Fields like `id`, `missionId`, `createdAt`, `updatedAt` are ignored.
    *   **Example:**
        ```json
        {
          "status": "completed",
          "result": { "output": "Task successfully executed." }
        }
        ```
*   **Response Format (Success: 200 OK):**
    *   Updated task object (JSON) - same structure as `GET /api/agent/task/{taskId}` success response.
*   **Response Status Codes (Error):**
    *   `400 Bad Request`: If no update data is provided in the request body.
        *   **Example:** `{"error": "No update data provided."}`
    *   `404 Not Found`: If the task with the specified ID does not exist.
        *   **Example:** `{"error": "Task not found"}`
    *   `500 Internal Server Error`: If there's an error updating the task.
        *   **Example:** `{"error": "Failed to update task", "details": "Specific error message"}`

#### `DELETE /api/agent/task/{taskId}`

*   **Description:** Deletes a specific task by its ID.
*   **Path Parameters:**
    *   `taskId` (string, required): The unique identifier of the task.
*   **Response Format (Success: 200 OK):**
    ```json
    { "message": "Task deleted successfully" }
    ```
*   **Response Status Codes (Error):**
    *   `404 Not Found`: If the task with the specified ID does not exist (Prisma error P2025).
        *   **Example:** `{"error": "Task not found"}`
    *   `500 Internal Server Error`: If there's an error deleting the task.
        *   **Example:** `{"error": "Failed to delete task", "details": "Specific error message"}`

## Health Endpoint

### `GET /api/health`

*   **Status:** The route file `src/app/api/health/route.ts` is currently **empty**. This endpoint is **unimplemented**.
*   **Description (Intended):** If implemented, this endpoint would typically be used to check the operational status of the application, potentially including database connectivity or dependent service availability.
*   **Request Parameters:** None.
*   **Response Format (Expected Success: 200 OK):**
    ```json
    { "status": "healthy", "timestamp": "ISO 8601 datetime" }
    ```
*   **Response Status Codes (Error):** Not defined for unimplemented endpoint.

## Search Endpoints

These endpoints act as proxies to various search providers, allowing the agent to gather information.

### `POST /api/search/gemini`

*   **Description:** Proxies a request to the Google Gemini API. Used for advanced content generation, summarization, or question answering.
*   **Request Body:**
    *   `prompt` (string, required): The prompt to send to the Gemini model.
    *   Other optional parameters accepted by the Gemini API (e.g., `maxOutputTokens`, `temperature`, `topP`, `topK`) can be included.
    *   **Example:**
        ```json
        {
          "prompt": "Explain the theory of relativity in simple terms.",
          "maxOutputTokens": 200
        }
        ```
*   **Response Format (Success: 200 OK):**
    *   The direct response from the Gemini API. The structure depends on the specific Gemini model and request parameters. Typically includes generated text.
    *   **Example (conceptual):**
        ```json
        {
          "candidates": [
            {
              "content": {
                "parts": [
                  { "text": "Imagine you're on a train..." }
                ],
                "role": "model"
              },
              // ... other metadata like finishReason, safetyRatings
            }
          ]
          // ... promptFeedback
        }
        ```
*   **Response Status Codes (Error):**
    *   `400 Bad Request`: If `prompt` is missing.
        *   **Example:** `{"error": "Prompt is required"}`
    *   `500 Internal Server Error`:
        *   If the `GEMINI_API_KEY` is not configured on the server.
            *   **Example:** `{"error": "Gemini API key is not configured. Please set GEMINI_API_KEY environment variable."}`
        *   If the request to the Gemini API fails.
            *   **Example:** `{"error": "Failed to fetch from Gemini API", "details": "Specific error message"}`

### `POST /api/search/serper`

*   **Description:** Proxies a search query to the Serper (Google Search) API. Used for general web searches.
*   **Request Body:**
    *   `q` (string, required): The search query.
    *   Other optional parameters accepted by the Serper API (e.g., `num`, `page`, `location`, `gl`, `hl`, `autocorrect`, `type`).
    *   **Example:**
        ```json
        {
          "q": "latest AI research papers",
          "num": 5,
          "type": "news"
        }
        ```
*   **Response Format (Success: 200 OK):**
    *   The direct response from the Serper API. Includes search results like organic results, news, images, etc., depending on the query and parameters.
    *   **Example (conceptual for organic results):**
        ```json
        {
          "searchParameters": { "q": "latest AI research papers", ... },
          "organic": [
            {
              "title": "Title of a research paper",
              "link": "https://example.com/paper.pdf",
              "snippet": "A brief description of the paper...",
              "position": 1
            }
            // ... more results
          ]
          // ... other result types like "news", "relatedSearches"
        }
        ```
*   **Response Status Codes (Error):**
    *   `400 Bad Request`: If `q` (query) is missing.
        *   **Example:** `{"error": "Query (q) is required"}`
    *   `500 Internal Server Error`:
        *   If the `SERPER_API_KEY` is not configured on the server.
            *   **Example:** `{"error": "Serper API key is not configured. Please set SERPER_API_KEY in environment variables."}`
        *   If the request to the Serper API fails.
            *   **Example:** `{"error": "Failed to fetch from Serper API", "details": "Specific error message"}`

### `POST /api/search/tavily`

*   **Description:** Proxies a search query to the Tavily Search API. Used for in-depth research and information gathering, often with a focus on providing comprehensive answers.
*   **Request Body:**
    *   `query` (string, required): The search query or research question.
    *   Other optional parameters accepted by the Tavily API (e.g., `search_depth`, `include_answer`, `include_raw_content`, `max_results`, `include_domains`, `exclude_domains`).
    *   **Example:**
        ```json
        {
          "query": "What are the pros and cons of quantum computing?",
          "search_depth": "advanced",
          "include_answer": true
        }
        ```
*   **Response Format (Success: 200 OK):**
    *   The direct response from the Tavily API. Typically includes a summarized answer (if requested) and a list of sources with their content.
    *   **Example (conceptual):**
        ```json
        {
          "query": "What are the pros and cons of quantum computing?",
          "response_time": 2.5,
          "answer": "Quantum computing offers potential for solving complex problems... However, it faces challenges like decoherence...",
          "results": [
            {
              "title": "Quantum Computing Explained",
              "url": "https://example.com/quantum-explained",
              "content": "Detailed explanation of quantum computing principles...",
              "score": 0.98
            }
            // ... more results/sources
          ]
        }
        ```
*   **Response Status Codes (Error):**
    *   `400 Bad Request`: If `query` is missing.
        *   **Example:** `{"error": "Query is required"}`
    *   `500 Internal Server Error`:
        *   If the `TAVILY_API_KEY` is not configured on the server.
            *   **Example:** `{"error": "Tavily API key is not configured. Please set TAVILY_API_KEY in environment variables."}`
        *   If the request to the Tavily API fails.
            *   **Example:** `{"error": "Failed to fetch from Tavily API", "details": "Specific error message"}`
