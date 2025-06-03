// jest.setup.js
import '@testing-library/jest-dom';

// You can add other global setups here, for example:
// - Mocking global objects (e.g., fetch, localStorage)
// - Setting up a mock server (e.g., MSW)
// - Global test timeouts

// Example: Mocking matchMedia (often needed for UI components that use it)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock scrollIntoView for components that use it (like LogsPanel)
// JSDOM doesn't implement layout-related APIs like scrollIntoView
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
}

// --- Global Mocks for persistent problematic imports ---

// Mock TavilyClient globally to prevent ESM import issues in tests
// Ensure this mock function is defined in a scope accessible by the factory
let mockTavilySearchGlobal = jest.fn();
jest.mock('@/lib/search/TavilyClient', () => ({
  TavilyClient: jest.fn().mockImplementation(() => ({
    search: mockTavilySearchGlobal,
    // constructor: jest.fn(), // If constructor itself needs to be asserted upon
  })),
}));

// Helper to clear this global mock if needed in specific test suites' beforeEach/afterEach
export const clearMockTavilySearchGlobal = () => {
  mockTavilySearchGlobal.mockClear();
  // Also clear constructor mocks if TavilyClient itself is asserted on for number of instantiations
  const ActualMockedTavilyClient = jest.requireMock('@/lib/search/TavilyClient').TavilyClient;
  if (ActualMockedTavilyClient && ActualMockedTavilyClient.mockClear) {
    ActualMockedTavilyClient.mockClear();
  }
};

// You can re-export the mock function if tests need to manipulate it directly,
// though it's often better to rely on its usage via the modules that import TavilyClient.
export { mockTavilySearchGlobal };


// Example: Suppress console.error or console.warn if specific known warnings are flooding tests
// let originalError;
// beforeAll(() => {
//   originalError = console.error;
//   console.error = (...args) => {
//     if (typeof args[0] === 'string' && args[0].includes('Warning: ReactDOM.render is no longer supported in React 18')) {
//       return;
//     }
//     originalError(...args);
//   };
// });
// afterAll(() => {
//   console.error = originalError;
// });
