# Autonomous Research Agent

## Overview

This project implements an autonomous research agent capable of decomposing complex missions into manageable tasks, executing these tasks (which can include web searches via multiple providers like Tavily, Serper, and Google Gemini), validating the results, and attempting to synthesize these results to achieve a given mission goal. It features a web-based dashboard for user interaction and a comprehensive API for programmatic control.

## Features

*   **Mission Decomposition:** Utilizes AI (specifically Google Gemini) to break down high-level mission goals into a series of actionable, smaller tasks.
*   **Task Execution Engine:** A robust engine (`src/scripts/runEngine.ts`) processes tasks sequentially, managing their lifecycle from pending to completion or failure.
*   **Extensible Search Provider Integration:** Supports multiple search APIs (Tavily, Serper, Gemini) for information gathering, allowing flexibility and fallback options. Each provider is implemented with its own client (e.g., `TavilyClient.ts`).
*   **Result Validation:** (Conceptual) Includes mechanisms or plans for validating the information retrieved by tasks to ensure accuracy and relevance. (Actual implementation details may vary).
*   **Retry Mechanisms:** Implements retries for tasks that may fail due to transient issues, enhancing the agent's resilience.
*   **Logging and State Management:** Comprehensive logging (both to console and potentially to database) and state management (using Zustand and Prisma) track the agent's operations, mission progress, and task states.
*   **Comprehensive API:** Exposes a full suite of API endpoints for creating, managing, and monitoring missions and tasks. Detailed in `API_DOCUMENTATION.md`.
*   **Web-based Dashboard:** Provides a user interface (Next.js application) for creating new missions, viewing the status and progress of ongoing missions, inspecting tasks, and seeing the final results.

## Getting Started

### Prerequisites

*   Node.js (version specified in `.nvmrc` if available, otherwise latest LTS is recommended)
*   npm (comes with Node.js)
*   Access to a database (SQLite by default, configurable via `DATABASE_URL`)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Copy the `.env.example` file to a new file named `.env`:
    ```bash
    cp .env.example .env
    ```
    Update the `.env` file with your actual API keys and database URL. See the "Environment Variables" section below for details.

4.  **Initialize the database:**
    Prisma is used for database management. Run the following command to apply migrations and create your database schema:
    ```bash
    npx prisma migrate dev
    ```
    This command will also create the SQLite database file (e.g., `prisma/dev.db`) if it doesn't exist and your `DATABASE_URL` is set to use SQLite.

### Running the Application

To fully operate the agent, you typically need to run two main components: the web UI and the backend agent engine.

1.  **Run the Agent Execution Engine (Backend Processor):**
    This standalone Node.js script processes the queue of missions and tasks.
    *   For Windows:
        ```bash
        npm run start:engine
        ```
    *   For UNIX-like systems (Linux, macOS):
        ```bash
        npm run start:engine:unix
        ```
    Keep this running in a terminal window to ensure tasks are executed.

2.  **Run the Next.js Development Server (Web UI & API):**
    This serves the dashboard and the API endpoints.
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) in your browser to access the dashboard.

### Important Note on Mission Creation for Engine Processing

The Agent Execution Engine, started with `npm run start:engine` (or `npm run start:engine:unix`), processes missions that are already present in the database and are in a 'pending' or 'in-progress' state.

To create a mission, you need to use the API endpoint: `POST /api/agent/mission`. You can find detailed instructions and examples on how to do this in the `MANUAL_TESTING_PLAN.md` document.

If you start the engine and there are no processable missions (i.e., no missions in 'pending' or 'in-progress' state in the database), the engine will display a message like "No processable missions found" and will continue to poll for new missions.

## Operating the Agent

There are two primary ways to interact with the Autonomous Research Agent:

### 1. Dashboard UI

*   **Access:** After running `npm run dev`, navigate to `http://localhost:3000` in your web browser.
*   **Functionality:** The dashboard allows you to:
    *   Create new missions by defining a goal.
    *   View a list of all missions and their current status (e.g., pending, in-progress, completed, failed).
    *   Inspect the decomposed tasks for each mission.
    *   Monitor real-time progress and logs.
    *   View the final results or failure details of a mission.

### 2. API

The agent exposes a comprehensive RESTful API for programmatic interaction. This is useful for integrating the agent into other systems or for automated workflows.

*   **Documentation:** Full details of all API endpoints, including request/response formats and examples, can be found in `API_DOCUMENTATION.md`.
*   **Common Operations:**
    *   Submit new missions.
    *   Check the status of missions or specific tasks.
    *   Retrieve mission results.
    *   Manage tasks (though most task management is automated by the engine).

### Typical Workflow

1.  **Define a Mission Goal:** Clearly state what you want the agent to research or achieve (e.g., "Compile a report on the latest advancements in AI-powered drug discovery").
2.  **Submit the Mission:**
    *   **UI:** Use the "Create Mission" form on the dashboard.
    *   **API:** Send a `POST` request to `/api/agent/mission` with the goal in the request body.
3.  **Mission Decomposition:** The agent receives the mission and uses its `TaskDecomposer` (leveraging an AI model like Gemini) to break the goal down into a sequence of smaller, executable tasks. These are stored in the database.
4.  **Task Execution:** The `AgentExecutionEngine` (started with `npm run start:engine`) continuously polls the database for pending tasks. It picks up tasks one by one, executes them using the appropriate tools (e.g., search providers via `TaskExecutor`), and updates their status.
5.  **Monitor Progress:**
    *   **UI:** Observe the mission status and task list on the dashboard. Logs provide real-time updates.
    *   **API:** Periodically poll `GET /api/agent/mission/{missionId}` to get the latest status and task details, or `GET /api/agent/status` for an overview of active missions.
6.  **Retrieve Results:** Once a mission is marked as "completed," the results can be viewed in the UI or fetched from the `result` field of the mission object via the API. If a mission fails, `failureDetails` can provide insights.

## Environment Variables

This project requires certain environment variables to be set up in a `.env` file in the project root. Use `.env.example` as a template.

*   `DATABASE_URL`: The connection string for your database.
    *   **Purpose:** Used by Prisma ORM to connect to the database for storing missions, tasks, logs, and other persistent data.
    *   Example for SQLite (default): `DATABASE_URL="file:./prisma/dev.db"` (Note: path updated for clarity)
    *   Example for PostgreSQL: `DATABASE_URL="postgresql://user:password@host:port/database?schema=public"`

*   `GEMINI_API_KEY`: Your API key for Google Gemini.
    *   **Purpose:** Used by the `TaskDecomposer` to break down mission goals into tasks, and by the `GeminiClient` for the `/api/search/gemini` search proxy.

*   `TAVILY_API_KEY`: Your API key for the Tavily search service.
    *   **Purpose:** Used by the `TavilyClient` for the `/api/search/tavily` search proxy, enabling the agent to perform in-depth research.

*   `SERPER_API_KEY`: Your API key for the Serper (Google Search API) service.
    *   **Purpose:** Used by the `SerperClient` for the `/api/search/serper` search proxy, providing another option for web search tasks.

*   `OPENAI_API_KEY` (Optional): Your API key for OpenAI.
    *   **Purpose:** While not a primary focus of the current agent's core search tools, it might be used for other LLM interactions or if alternative decision engines/validators are implemented.

**To obtain these keys:**
*   Gemini: Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
*   Tavily: Visit [Tavily AI](https://tavily.com/)
*   Serper: Visit [Serper.dev](https://serper.dev/)
*   OpenAI: Visit [OpenAI Platform](https://platform.openai.com/api-keys)

## Project Structure

Key files and directories within the project:

*   `API_DOCUMENTATION.md`: Detailed documentation of all API endpoints.
*   `MANUAL_TESTING_PLAN.md`: Guidelines and scenarios for manual functional testing.
*   `README.md`: This file.
*   `.env.example`: Template for environment variable configuration.
*   `package.json`: Project dependencies and scripts.
*   `prisma/`:
    *   `schema.prisma`: Defines the database schema.
    *   `migrations/`: Contains database migration files.
    *   `dev.db` (if using SQLite): The local SQLite database file.
*   `src/`: Source code for the application.
    *   `src/app/`: Next.js application components, including:
        *   `api/`: Backend API route handlers (e.g., `/api/agent/mission`).
        *   `dashboard/`: Pages for the web-based user interface.
    *   `src/components/`: Reusable React components for the UI.
    *   `src/lib/`: Core libraries and business logic.
        *   `src/lib/agent/`: Core components of the autonomous agent:
            *   `AgentExecutionEngine.ts`: Orchestrates the execution of tasks for missions.
            *   `DecisionEngine.ts`: (Conceptual/Actual) Responsible for making choices during task execution, like selecting tools or search providers.
            *   `StateManager.ts`: Manages the agent's state, potentially using Zustand for UI state and interacting with database services.
            *   `TaskDecomposer.ts`: Breaks down mission goals into specific tasks using an LLM.
            *   `TaskExecutor.ts`: Handles the execution of individual tasks, including calling search tools.
            *   `Mission.ts`: Defines the Mission class and related types.
        *   `src/lib/database/`: Services for interacting with the database via Prisma (e.g., creating/updating missions and tasks).
        *   `src/lib/search/`: Client implementations for various search providers (Gemini, Serper, Tavily).
        *   `src/lib/types/`: TypeScript type definitions used throughout the project.
        *   `src/lib/utils/`: Utility functions (e.g., logger, retry logic).
    *   `src/scripts/`: Standalone scripts, notably `runEngine.ts` which starts the agent's backend processing engine.
    *   `src/styles/`: Global styles and CSS configurations.
*   `public/`: Static assets for the Next.js application.

## Testing

This project includes both unit and integration tests.

*   **Run all tests (Jest):**
    ```bash
    npm test
    ```
*   **Run tests in watch mode:**
    This will re-run tests automatically when files change.
    ```bash
    npm run test:watch
    ```
*   **Manual Testing:** For more in-depth functional testing and user experience validation, please refer to the scenarios outlined in `MANUAL_TESTING_PLAN.md`.

## Contributing

Contributions are welcome! Please refer to the issue tracker for open tasks or submit a pull request with your proposed changes. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the MIT License.
