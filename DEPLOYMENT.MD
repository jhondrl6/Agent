# Deployment Instructions

## 1. Overview

This application consists of two main parts that need to be deployed and managed:

1.  **Next.js Application:** This serves the web-based user interface (dashboard) and the API endpoints (e.g., for mission creation, status checks). It's built and run as a standard Next.js application.
2.  **Agent Execution Engine:** This is a separate Node.js script (`src/scripts/runEngine.ts`) that continuously processes missions and tasks from the database. It needs to run as a persistent background process.

Both components require access to the same production database and need to have the necessary environment variables configured.

## 2. Prerequisites

*   **Node.js:** Latest LTS (Long-Term Support) version is recommended (e.g., Node.js 20.x or higher). Ensure your deployment environment has Node.js and npm installed.
*   **Production Database:**
    *   A robust, production-ready database server is required (e.g., PostgreSQL, MySQL). While SQLite can be used for development, it might not be suitable for all production scales due to limitations with concurrent access and backups.
    *   You will need the connection URL for your production database. This will be set in the `DATABASE_URL` environment variable.
*   **API Keys:** Valid API keys for Gemini, Tavily, and Serper services.

## 3. Build Process

Before deploying, you need to build the application and prepare the agent engine script.

1.  **Install Dependencies:**
    On your deployment server or in your build environment, clone the repository and install dependencies:
    ```bash
    git clone <your-repository-url>
    cd <your-project-directory>
    npm install
    ```
    *(If you use `yarn`, replace `npm install` with `yarn install`)*

2.  **Prisma Generate:**
    This command generates the Prisma Client based on your schema. It's often run automatically during `npm install` or `next build`. However, it's good to be aware of it, especially if you encounter Prisma Client issues.
    ```bash
    npx prisma generate
    ```

3.  **Build Next.js Application:**
    This command creates an optimized production build of the Next.js frontend and API.
    ```bash
    npm run build
    ```
    This will output the build to the `.next` directory.

4.  **Prepare Agent Execution Engine Script (Optional but Recommended):**
    The `src/scripts/runEngine.ts` script is written in TypeScript. For production, you have a couple of options:

    *   **Option A (Compile to JavaScript):** Compile it to JavaScript using `tsc`.
        1.  Ensure TypeScript is a dependency if not already: `npm install typescript --save-dev` (or ensure it's in `dependencies` if building on a clean environment).
        2.  You might need to configure `tsconfig.json` to output files to a specific directory (e.g., `dist/scripts`).
        3.  Compile: `npx tsc src/scripts/runEngine.ts --outDir dist/scripts` (adjust command as per your `tsconfig.json`).
        This creates a `dist/scripts/runEngine.js` file that can be run directly with Node.js.

    *   **Option B (Run with `tsx` in Production):**
        If you prefer to run the TypeScript file directly using `tsx` in production:
        1.  Add `tsx` as a regular dependency: `npm install tsx`
        The existing `npm run start:engine` script can then be used, but ensure `tsx` is available. This approach is simpler but might add a small overhead compared to running compiled JS.

## 4. Environment Variables

Configure the following environment variables in your production environment. These should be set securely and not hardcoded into the application.

*   `DATABASE_URL`: The connection string for your production database.
    *   Example for PostgreSQL: `DATABASE_URL="postgresql://user:password@prod-host:port/database?schema=public"`
*   `GEMINI_API_KEY`: Your API key for Google Gemini.
*   `TAVILY_API_KEY`: Your API key for the Tavily search service.
*   `SERPER_API_KEY`: Your API key for the Serper (Google Search API) service.
*   `NODE_ENV`: Set this to `production`. Most hosting platforms and `npm run start` for Next.js set this automatically.
*   `PORT` (Optional): If your Next.js app needs to run on a specific port other than 3000, set this variable (e.g., `PORT=8080`).

How you set these variables depends on your deployment platform (e.g., Vercel environment settings, Docker environment files, systemd unit file environment directives, etc.).

## 5. Database Migrations

Before starting the application for the first time or after deploying a new version with database schema changes, you must apply migrations.

*   **Command:** Use Prisma's `migrate deploy` command for production environments. This command applies pending migrations and does not generate new ones or prompt for unsafe changes.
    ```bash
    npx prisma migrate deploy
    ```
*   **When to Run:** Execute this command after installing dependencies and setting up environment variables, but *before* starting the application processes. This ensures the application connects to a database schema it expects.

## 6. Running the Application

You need to run two separate processes for the application to be fully operational.

### a. Next.js App (UI & API)

*   **Command:**
    ```bash
    npm run start
    ```
*   **Behavior:** This starts the Next.js production server, serving the UI and API routes.
*   **Port:** By default, it listens on port 3000. This can be overridden by the `PORT` environment variable.
*   **Management:** Use a process manager (like PM2, systemd) or your deployment platform's service management to ensure it runs continuously and restarts on failure.

### b. Agent Execution Engine

This script processes tasks from the database. It must run continuously in the background.

*   **Command Options:**

    *   **If using `tsx` (Option B from Build Process):**
        Ensure `tsx` is in `dependencies` and `NODE_PATH` is correctly set for module resolution if needed.
        ```bash
        npm run start:engine
        ```
        *(The script is: `NODE_PATH=./src tsx src/scripts/runEngine.ts`)*

    *   **If compiled to JavaScript (Option A from Build Process, e.g., to `dist/scripts/runEngine.js`):**
        You may need to set `NODE_PATH` if your compiled output relies on absolute paths from `src` (e.g. for module aliases defined in `tsconfig.json`).
        ```bash
        NODE_PATH=./dist node dist/scripts/runEngine.js
        ```
        *(Adjust the path `dist/scripts/runEngine.js` as per your build output.)*

*   **Management:** This is a critical background process.
    *   **Highly Recommended:** Use a robust process manager like PM2, systemd (on Linux VMs), or Supervisor. These tools can handle:
        *   Automatically restarting the script if it crashes.
        *   Managing logs.
        *   Running the script on server startup.
    *   **Example with PM2:**
        ```bash
        # If using tsx
        pm2 start npm --name "agent-engine" -- run start:engine

        # If using compiled JS
        pm2 start dist/scripts/runEngine.js --name "agent-engine" --node-args="--enable-source-maps" # (adjust path and add NODE_PATH if needed)
        pm2 save # To persist across reboots
        pm2 startup # To generate startup script for your OS
        ```

## 7. Deployment Strategies (High-Level)

*   **Virtual Machines (VMs):**
    *   Deploy both the Next.js app and the Agent Engine on a VM (e.g., AWS EC2, Google Compute Engine, Azure VM).
    *   Use a reverse proxy like Nginx or Apache to manage incoming traffic to the Next.js app.
    *   Use systemd or PM2 to manage both processes.
*   **Containers (Docker):**
    *   Create Dockerfiles for both the Next.js app and the Agent Engine (or a single Dockerfile with multiple processes managed by a supervisor like `supervisord`).
    *   Deploy using Docker Compose, Kubernetes, or a managed container service (e.g., AWS ECS, Google Kubernetes Engine, Azure Kubernetes Service). This is a flexible and scalable approach.
*   **Platform-as-a-Service (PaaS):**
    *   **Next.js App:** Platforms like Vercel (ideal for Next.js) or Netlify are excellent for deploying the frontend and API part. They handle build, deployment, and scaling.
    *   **Agent Execution Engine:** The long-running, continuously polling nature of the `AgentExecutionEngine` is often **not suitable** for serverless functions offered by Vercel/Netlify. You would typically need a separate "worker" service:
        *   Many PaaS providers offer worker dynos (Heroku), background jobs, or managed container instances that can run this type of process (e.g., AWS Fargate, Google Cloud Run jobs, Heroku Worker Dynos).
*   **Hybrid Approach:** Deploy the Next.js app to Vercel/Netlify and the Agent Engine to a separate VM or container service. Ensure they can both connect to the same production database.

## 8. Logging in Production

*   **Next.js Application:** Logs from `npm run start` (stdout/stderr) will be handled by your chosen deployment platform or process manager. Configure these tools to write logs to persistent storage and/or a log management system (e.g., AWS CloudWatch, Datadog, Logtail).
*   **Agent Execution Engine:** Similarly, logs from the engine script (stdout/stderr) should be captured. If using PM2, it has built-in log management. For other methods, ensure logs are collected and rotated.

Always ensure sensitive information is not logged in plaintext in production.
