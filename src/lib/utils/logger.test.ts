import * as logger from './logger'; // Assuming the logger.ts is in the same directory or path is aliased
import { LogLevel } from './logger';

describe('Logger', () => {
  const originalEnv = process.env.NODE_ENV;
  let consoleDebugSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console methods
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.NODE_ENV = 'development'; // Default to development for most tests
  });

  afterEach(() => {
    // Restore original console methods and NODE_ENV
    consoleDebugSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  describe('debug', () => {
    it('should log a debug message with context and details in development', () => {
      const message = 'Test debug message';
      const context = 'TestContext';
      const details = { key: 'value' };
      logger.debug(message, context, details);
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[AgentUI] [DEBUG] [TestContext]: Test debug message',
        details
      );
    });

    it('should log a debug message without details if not provided', () => {
      logger.debug('Test debug message no details', 'TestContextNoDetails');
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[AgentUI] [DEBUG] [TestContextNoDetails]: Test debug message no details',
        '' // details will be an empty string if not provided
      );
    });

    it('should not log a debug message if NODE_ENV is not development', () => {
      process.env.NODE_ENV = 'production';
      logger.debug('Test debug message', 'TestContext', { key: 'value' });
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log an info message with context and details', () => {
      const message = 'Test info message';
      const context = 'InfoContext';
      const details = { infoKey: 'infoValue' };
      logger.info(message, context, details);
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[AgentUI] [INFO] [InfoContext]: Test info message',
        details
      );
    });
  });

  describe('warn', () => {
    it('should log a warn message with context and details', () => {
      const message = 'Test warn message';
      const context = 'WarnContext';
      const details = { warnKey: 'warnValue' };
      logger.warn(message, context, details);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[AgentUI] [WARN] [WarnContext]: Test warn message',
        details
      );
    });
  });

  describe('error', () => {
    it('should log an error message with an Error object and additionalDetails', () => {
      const message = 'Test error message';
      const context = 'ErrorContext';
      const errorObj = new Error('This is an error object');
      errorObj.stack = 'Custom stack trace';
      const additionalDetails = { code: 500 };
      logger.error(message, context, errorObj, additionalDetails);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[AgentUI] [ERROR] [ErrorContext]: Test error message',
        {
          error: { message: 'This is an error object', stack: 'Custom stack trace' },
          ...additionalDetails,
        }
      );
    });

    it('should log an error message with a string errorObj', () => {
      const message = 'Test error with string obj';
      const context = 'ErrorStringContext';
      const errorString = 'This is just a string error';
      const additionalDetails = { data: 'some data' };
      logger.error(message, context, errorString, additionalDetails);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[AgentUI] [ERROR] [ErrorStringContext]: Test error with string obj',
        {
          error: errorString,
          ...additionalDetails,
        }
      );
    });

    it('should log an error message with only errorObj (as Error) and no additionalDetails', () => {
        const message = 'Test error message, no additional';
        const context = 'ErrorContextSimple';
        const errorObj = new Error('Simple error');
        logger.error(message, context, errorObj);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[AgentUI] [ERROR] [ErrorContextSimple]: Test error message, no additional',
          {
            error: { message: errorObj.message, stack: errorObj.stack },
          }
        );
      });

    it('should handle errorObj being undefined', () => {
        logger.error('Test error message, undefined errorObj', 'ErrorContextUndefined', undefined, { detail: 1});
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '[AgentUI] [ERROR] [ErrorContextUndefined]: Test error message, undefined errorObj',
            { error: undefined, detail: 1 }
        );
    });
  });

  describe('log (generic)', () => {
    it('should call debug when LogLevel.DEBUG is passed', () => {
      // Re-spy on logger.debug specifically for this test, as it's also being tested
      const specificDebugSpy = jest.spyOn(logger, 'debug');
      logger.log(LogLevel.DEBUG, 'Generic debug', 'GenericContext', { g: 1 });
      expect(specificDebugSpy).toHaveBeenCalledWith('Generic debug', 'GenericContext', { g: 1 });
      specificDebugSpy.mockRestore();
    });

    it('should call info when LogLevel.INFO is passed', () => {
      const specificInfoSpy = jest.spyOn(logger, 'info');
      logger.log(LogLevel.INFO, 'Generic info', 'GenericContext', { g: 2 });
      expect(specificInfoSpy).toHaveBeenCalledWith('Generic info', 'GenericContext', { g: 2 });
      specificInfoSpy.mockRestore();
    });

    it('should call warn when LogLevel.WARN is passed', () => {
      const specificWarnSpy = jest.spyOn(logger, 'warn');
      logger.log(LogLevel.WARN, 'Generic warn', 'GenericContext', { g: 3 });
      expect(specificWarnSpy).toHaveBeenCalledWith('Generic warn', 'GenericContext', { g: 3 });
      specificWarnSpy.mockRestore();
    });

    it('should call error when LogLevel.ERROR is passed', () => {
      const specificErrorSpy = jest.spyOn(logger, 'error');
      const errObjForGeneric = { message: 'generic error details' };
      logger.log(LogLevel.ERROR, 'Generic error', 'GenericContext', errObjForGeneric );
      // The 'error' function expects errorObj as the third arg (context is 2nd), then additionalDetails
      // Here, errObjForGeneric is passed as 'details' to log(), which becomes 'errorObj' for error()
      expect(specificErrorSpy).toHaveBeenCalledWith('Generic error', 'GenericContext', errObjForGeneric, undefined);
      specificErrorSpy.mockRestore();
    });

    it('should default to console.log for unknown log levels', () => {
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        logger.log('UNKNOWN_LEVEL' as any, 'Unknown level message', 'UnknownContext');
        expect(consoleLogSpy).toHaveBeenCalledWith(
            '[AgentUI] [UNKNOWN_LEVEL] [UnknownContext]: Unknown level message',
            ''
        );
        consoleLogSpy.mockRestore();
    });
  });
});
