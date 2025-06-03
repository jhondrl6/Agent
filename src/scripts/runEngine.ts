import { AgentExecutionEngine } from '../lib/agent/AgentExecutionEngine';
import * as logger from '../lib/utils/logger';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

let isRunning = true;

async function main() {
  logger.info('Agent Execution Engine Runner starting...', 'EngineRunner');
  const engine = new AgentExecutionEngine();

  process.on('SIGINT', () => {
    logger.info('SIGINT received. Engine will stop after the current cycle.', 'EngineRunner');
    isRunning = false;
    // Optional: Force exit if it doesn't stop gracefully within a timeout
    // setTimeout(() => {
    //   logger.warn('Engine did not stop gracefully after SIGINT. Forcing exit.', 'EngineRunner');
    //   process.exit(1);
    // }, 30000); // e.g., 30 seconds
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Engine will stop after the current cycle.', 'EngineRunner');
    isRunning = false;
    // Optional: Force exit
    // setTimeout(() => {
    //   logger.warn('Engine did not stop gracefully after SIGTERM. Forcing exit.', 'EngineRunner');
    //   process.exit(1);
    // }, 30000);
  });

  while (isRunning) {
    try {
      logger.info('Starting new engine cycle.', 'EngineRunner');
      await engine.runOnce();
      logger.info('Engine cycle finished.', 'EngineRunner');
    } catch (error: any) {
      logger.error(`Error in engine.runOnce(): ${error.message}`, 'EngineRunner', error);
      // Depending on the error, you might want to stop isRunning or implement a backoff strategy.
      // For now, it will log and continue to the next cycle after a delay.
    }

    if (isRunning) {
      const delay = 10000; // 10 seconds
      logger.debug(`Waiting ${delay / 1000} seconds for the next cycle.`, 'EngineRunner');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  logger.info('Engine runner has stopped.', 'EngineRunner');
  // Allow time for any pending async operations (like logging) to complete.
  await new Promise(resolve => setTimeout(resolve, 1000));
  process.exit(0);
}

main().catch(error => {
  logger.error(`Unhandled error in main: ${error.message}`, 'EngineRunner', error);
  process.exit(1);
});
