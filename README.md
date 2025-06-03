# Agent
Construcción de un agente de investigación autónomo

## Overview

This project implements an autonomous research agent capable of decomposing missions into tasks, executing tasks (including web searches via various providers), and attempting to synthesize results to achieve a given mission goal.

## Features (Placeholder)

*   Mission decomposition
*   Task execution engine
*   Extensible search provider integration (Tavily, Serper, Gemini)
*   Result validation
*   Retry mechanisms for tasks
*   Logging and state management

## Getting Started

### Prerequisites

*   Node.js (version specified in `.nvmrc` if available, otherwise latest LTS)
*   npm or yarn
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
    # or
    # yarn install
    ```

3.  **Set up environment variables:**
    Copy the `.env.example` file to a new file named `.env`:
    ```bash
    cp .env.example .env
    ```
    Update the `.env` file with your actual API keys and database URL. See the "Environment Variables" section below for details.

4.  **Initialize the database:**
    Prisma is used for database management. Run the following command to apply migrations:
    ```bash
    npx prisma migrate dev
    ```
    (If you are starting fresh and `prisma/dev.db` does not exist, this command will also create it based on the `DATABASE_URL` in your `.env` file if it's set to use SQLite.)

### Running the Application

*   **To run the Next.js development server (UI):**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) in your browser.

*   **To run the Agent Execution Engine (backend processing):**
    ```bash
    npm run start:engine
    ```
    This will start the backend engine that processes missions and tasks.

## Environment Variables

This project requires certain environment variables to be set up to function correctly. These variables should be placed in a `.env` file in the root of the project. You can use the `.env.example` file as a template.

*   `DATABASE_URL`: The connection string for your database.
    *   Example for SQLite (default): `DATABASE_URL="file:./dev.db"`
    *   Example for PostgreSQL: `DATABASE_URL="postgresql://user:password@host:port/database?schema=public"`
    *   This is used by Prisma to connect to the database for storing missions, tasks, and logs.

*   `GEMINI_API_KEY`: Your API key for Google Gemini.
    *   Used by the agent for making decisions (e.g., choosing a search provider) and potentially for other generative AI tasks.

*   `TAVILY_API_KEY`: Your API key for the Tavily search service.
    *   Used by the agent as one of the search providers for executing research tasks.

*   `SERPER_API_KEY`: Your API key for the Serper (Google Search API) service.
    *   Used by the agent as another search provider option.

*   `OPENAI_API_KEY` (Optional): Your API key for OpenAI.
    *   While not a primary focus of the current agent's core search tools, it might be used for other LLM interactions or if alternative decision engines/validators are implemented. It's included in `.env.example` for broader compatibility with the original template features.

**To obtain these keys:**
*   Gemini: Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
*   Tavily: Visit [Tavily AI](https://tavily.com/)
*   Serper: Visit [Serper.dev](https://serper.dev/)
*   OpenAI: Visit [OpenAI Platform](https://platform.openai.com/api-keys)

Ensure these are correctly set in your `.env` file before running the application or the agent engine.

## Project Structure (Placeholder)

*   `src/app/`: Next.js application pages and API routes.
*   `src/components/`: React components for the UI.
*   `src/lib/`: Core logic.
    *   `src/lib/agent/`: Contains the agent's core components like `AgentExecutionEngine`, `TaskExecutor`, `DecisionEngine`.
    *   `src/lib/database/`: Database services and Prisma schema.
    *   `src/lib/search/`: Search client implementations.
*   `src/scripts/`: Standalone scripts, like `runEngine.ts`.
*   `prisma/`: Prisma schema and migration files.

## Testing (Placeholder)

*   Run unit tests:
    ```bash
    npm test
    ```
*   Run tests in watch mode:
    ```bash
    npm run test:watch
    ```

## Contributing (Placeholder)

Details on how to contribute to the project.

## License (Placeholder)

This project is licensed under the MIT License.
