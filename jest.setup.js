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
