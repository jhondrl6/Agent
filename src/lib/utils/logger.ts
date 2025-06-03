// src/lib/utils/logger.ts

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

const LOG_PREFIX = '[AgentUI]'; // Or some other suitable global prefix

function formatMessage(level: LogLevel, message: string, context?: string): string {
  const contextStr = context ? ` [${context}]` : '';
  return `${LOG_PREFIX} [${level}]${contextStr}: ${message}`;
}

export function debug(message: string, context?: string, details?: any): void {
  if (process.env.NODE_ENV === 'development') { // Only log debug in development
    console.debug(formatMessage(LogLevel.DEBUG, message, context), details || '');
  }
}

export function info(message: string, context?: string, details?: any): void {
  console.info(formatMessage(LogLevel.INFO, message, context), details || '');
}

export function warn(message: string, context?: string, details?: any): void {
  console.warn(formatMessage(LogLevel.WARN, message, context), details || '');
}

export function error(message: string, context?: string, errorObj?: any, additionalDetails?: any): void {
  const details = {
    ...(errorObj instanceof Error ? { error: { message: errorObj.message, stack: errorObj.stack } } : { error: errorObj }),
    ...additionalDetails,
  };
  console.error(formatMessage(LogLevel.ERROR, message, context), details);
}

// Optional: A generic log function if ever needed
export function log(level: LogLevel, message: string, context?: string, details?: any): void {
  switch (level) {
    case LogLevel.DEBUG:
      debug(message, context, details);
      break;
    case LogLevel.INFO:
      info(message, context, details);
      break;
    case LogLevel.WARN:
      warn(message, context, details);
      break;
    case LogLevel.ERROR:
      // Assuming 'details' could be an error object for the 'error' function signature
      error(message, context, details);
      break;
    default:
      console.log(formatMessage(level, message, context), details || '');
  }
}
