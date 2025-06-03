# Manual Testing Plan for Database Persistence

This document outlines manual tests for verifying the database persistence of missions and tasks via API endpoints.

**Prerequisites:**
*   Ensure the development server is running (`npm run dev`).
*   Have a tool like `curl` or Postman available for sending HTTP requests.
*   Ensure your `GEMINI_API_KEY` is set in your `.env` file, as mission creation involves task decomposition which might use this key.

**Test Case 1: Create a new mission, retrieve it, and verify persistence.**
   a. **Create Mission:**
      Send a `POST` request to `http://localhost:3000/api/agent/mission` with the following JSON body:
      ```json
      {
        "goal": "Manually test database persistence and retrieval"
      }
      ```
   b. **Observe Response & Note ID:**
      The response should be a JSON object representing the created mission. It will include an `id` (e.g., `cly...`), `goal`, `status`, `createdAt`, `updatedAt`, and an array of `tasks`. The `tasks` array might be empty or populated depending on the `TaskDecomposer`'s output for the given goal. Note down the `id` of this mission.

   c. **Retrieve Mission via API:**
      Send a `GET` request to `http://localhost:3000/api/agent/mission/{missionId}` (replace `{missionId}` with the ID noted in step 1b).

   d. **Verify Retrieval & API Response Structure:**
      Confirm that the HTTP status code is `200 OK` and the response body contains the full mission details, matching what was returned in step 1b. Pay attention to:
      *   `id`, `goal`, `status`, `createdAt`, `updatedAt` fields for the mission.
      *   The `tasks` array. Each task in the array should have `id`, `missionId`, `description`, `status`, `result` (parsed JSON or null), `retries`, `createdAt`, `updatedAt`, `failureDetails` (parsed JSON or null), and `validationOutcome` (parsed JSON or null).

   e. **Verify Database Persistence (Optional but Recommended):**
      Use a SQLite browser (e.g., DB Browser for SQLite) to open the `dev.db` file located in the `prisma` directory (or wherever your `DATABASE_URL` in `.env` points).
      *   Open the `Mission` table. Verify that a new row exists with the `id` and `goal` from step 1b. Check other fields like `status`, `createdAt`, `updatedAt`.
      *   Open the `Task` table. If tasks were created, verify they exist with the correct `missionId` linking them to the created mission. Check their `description`, `status`, and other fields. Note that `result`, `failureDetails`, and `validationOutcome` are stored as JSON strings in the database.

**Test Case 2: Update a Task and verify.**
   a. **Identify a Task ID:**
      From the response in Test Case 1b or 1c, pick a `taskId` from one of the tasks (if any were created).
      If no tasks were created by the `TaskDecomposer` for the simple goal in Test Case 1:
          i.  Try creating a new mission (Test Case 1a) with a more complex goal that is likely to generate tasks, e.g., "Research the weather in Paris tomorrow and draft a summary."
          ii. Then use a `taskId` from this new mission for the steps below.
      *Let's assume a task ID `some-task-id` is available.*

   b. **Update Task via API:**
      Send a `PUT` request to `http://localhost:3000/api/agent/task/{taskId}` (replace `{taskId}` with the actual ID) with a JSON body like:
      ```json
      {
        "status": "completed",
        "result": {"manualTestNote": "This task was manually marked as complete via API test.", "dataValue": 42}
      }
      ```
   c. **Observe API Response:**
      The response should be the updated task object (HTTP `200 OK`). Verify that `status` is "completed" and `result` reflects the JSON object you sent (it should be parsed, not a string).

   d. **Verify Update by Retrieving Task via API:**
      Send a `GET` request to `http://localhost:3000/api/agent/task/{taskId}`.
      Confirm the response shows the updated `status` and `result` (parsed).

   e. **Verify Database Update (Optional but Recommended):**
      In your SQLite browser, find the task with `{taskId}` in the `Task` table.
      Verify its `status` column is "completed" and its `result` column contains the JSON string `{"manualTestNote": "This task was manually marked as complete via API test.", "dataValue": 42}`.

**Test Case 3: Delete a Task and verify.**
   a. **Identify a Task ID:** Use a `taskId` from a previous test (e.g., the one used in Test Case 2, or a new one if needed).
   b. **Delete Task via API:**
      Send a `DELETE` request to `http://localhost:3000/api/agent/task/{taskId}`.
   c. **Observe API Response:**
      Expect an HTTP `200 OK` response with a message like `{"message":"Task deleted successfully"}`.
   d. **Verify Deletion by Attempting to Retrieve Task:**
      Send a `GET` request to `http://localhost:3000/api/agent/task/{taskId}`.
      Expect an HTTP `404 Not Found` error.
   e. **Verify Database Deletion (Optional but Recommended):**
      In your SQLite browser, check the `Task` table. The row with `{taskId}` should no longer exist.

**Test Case 4: Delete a Mission and verify (including cascade delete of tasks).**
   a. **Identify a Mission ID:** Use a `missionId` from a previous test that has associated tasks (e.g., from Test Case 1 or create a new one for this purpose). Note down one of its `taskId`s as well.
   b. **Delete Mission via API:**
      Send a `DELETE` request to `http://localhost:3000/api/agent/mission/{missionId}`.
   c. **Observe API Response:**
      Expect an HTTP `200 OK` response with `{"message":"Mission deleted successfully"}`.
   d. **Verify Deletion by Attempting to Retrieve Mission:**
      Send a `GET` request to `http://localhost:3000/api/agent/mission/{missionId}`.
      Expect an HTTP `404 Not Found` error.
   e. **Verify Cascade Deletion of Associated Task:**
      Send a `GET` request to `http://localhost:3000/api/agent/task/{taskId}` (using the `taskId` associated with the deleted mission).
      Expect an HTTP `404 Not Found` error for the task as well.
   f. **Verify Database Deletion (Optional but Recommended):**
      In your SQLite browser:
      *   The row with `{missionId}` should be gone from the `Mission` table.
      *   All tasks associated with that `{missionId}` (including the one with `{taskId}`) should be gone from the `Task` table.

---
**Notes on Test Environment & Jest Configuration:**

*   For automated tests in `services.test.ts`, you would typically run them with `npm test` (or `npx jest`).
*   Ensure Jest is configured correctly in `package.json` and `jest.config.js`.
*   The current `jest.config.js` in the project uses `testEnvironment: 'jsdom'`, which is for frontend/browser-like environments.
*   For backend database tests like `services.test.ts`, the test environment should be `node`. This is achieved by adding the comment `/** @jest-environment node */` at the very top of the `services.test.ts` file. This has been included in the generated test file.
*   If `npm test` does not pick up these tests or fails due to environment issues, further Jest configuration might be needed (e.g., in `jest.config.js` to handle different environments for different test file patterns).
