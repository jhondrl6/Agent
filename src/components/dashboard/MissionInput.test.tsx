// src/components/dashboard/MissionInput.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { MissionInput } from './MissionInput';
import { useAgentStore } from '@/lib/agent/StateManager';

// Mock fetch
global.fetch = jest.fn();

// Mock useAgentStore
const mockAddLog = jest.fn();
const mockSetAgentError = jest.fn(); // If MissionInput ever calls this
// Define other actions or state parts if MissionInput uses them more deeply.
// For now, it primarily uses addLog (implicitly via API route) and reads agentState.error.
jest.mock('@/lib/agent/StateManager', () => ({
  __esModule: true,
  useAgentStore: jest.fn((selector) => {
    // This more flexible mock allows different parts of the state to be selected.
    const state = {
      agentState: { error: null, isLoading: false, activeTasks: [] }, // Provide a basic agentState
      logs: [],
      missions: {},
      // Mock actions that might be called directly by the component or its sub-functions if any
      addLog: mockAddLog,
      setAgentError: mockSetAgentError,
      // ... other actions from StoreActions if needed by any part of MissionInput indirectly
    };
    // If a selector is provided, use it; otherwise, return the whole state (or relevant part)
    return selector ? selector(state) : state;
  }),
}));


describe('MissionInput Component', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
    mockAddLog.mockClear();
    mockSetAgentError.mockClear();

    // Reset the implementation of useAgentStore to return a fresh state for each test
    (useAgentStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = {
        agentState: { error: null, isLoading: false, activeTasks: [] },
        logs: [],
        missions: {},
        addLog: mockAddLog,
        setAgentError: mockSetAgentError,
        // Include other store actions that MissionInput might somehow trigger or depend on
      };
      return selector ? selector(state) : state;
    });
  });

  it('should render input field and submit button', () => {
    render(<MissionInput />);
    expect(screen.getByPlaceholderText('Enter your research mission goal...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start mission/i })).toBeInTheDocument();
  });

  it('should allow typing into the input field', async () => {
    render(<MissionInput />);
    const input = screen.getByPlaceholderText('Enter your research mission goal...');
    await user.type(input, 'Test mission goal');
    expect(input).toHaveValue('Test mission goal');
  });

  it('should display an error if submitted with empty input', async () => {
    render(<MissionInput />);
    const submitButton = screen.getByRole('button', { name: /start mission/i });
    await user.click(submitButton);
    expect(await screen.findByText('Error: Mission goal cannot be empty.')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should call fetch with correct parameters on submit and show loading', async () => {
    // Mock fetch to never resolve for this test to observe loading state
    (fetch as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));

    render(<MissionInput />);
    const input = screen.getByPlaceholderText('Enter your research mission goal...');
    const submitButton = screen.getByRole('button', { name: /start mission/i });

    await user.type(input, 'Test mission goal');
    await user.click(submitButton);

    // Wait for the button text to change to "Starting..." and then check if it's disabled
    const loadingButton = await screen.findByRole('button', { name: /starting.../i });
    expect(loadingButton).toBeDisabled();

    // Check fetch call (it won't resolve, but it should have been called)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/api/agent/mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: 'Test mission goal' }),
    });
  });

  it('should clear input and display success message on successful API response', async () => {
    const mockMissionResponse = { id: 'mission-123', goal: 'Test mission goal', status: 'pending', createdAt: new Date().toISOString(), tasks: [] };
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockMissionResponse,
    });

    render(<MissionInput />);
    const inputElement = screen.getByPlaceholderText('Enter your research mission goal...');
    const submitButton = screen.getByRole('button', { name: /start mission/i });

    await user.type(inputElement, 'Test mission goal');
    await user.click(submitButton);

    // Wait for a general part of the success message first
    const successTitleElement = await screen.findByText('Mission Successfully Initiated!');
    expect(successTitleElement).toBeInTheDocument();

    // Get the parent of the title (which should be the success message div)
    // and check for the ID within its text content
    const successMessageContainer = successTitleElement.parentElement;
    expect(successMessageContainer).toHaveTextContent(/id: mission-123/i);

    // Check other outcomes of success
    expect(inputElement).toHaveValue(''); // Input should be cleared
    expect(submitButton).not.toBeDisabled(); // Button should be re-enabled
  });

  it('should display an error message if API call fails with structured error', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error', details: 'Something went wrong' }),
    });

    render(<MissionInput />);
    const input = screen.getByPlaceholderText('Enter your research mission goal...');
    const submitButton = screen.getByRole('button', { name: /start mission/i });

    await user.type(input, 'Test mission goal');
    await user.click(submitButton);

    await waitFor(() => expect(screen.getByText(/error: internal server error: something went wrong/i)).toBeInTheDocument());
    expect(input).toHaveValue('Test mission goal');
    expect(submitButton).not.toBeDisabled();
  });

  it('should display a generic error if API error response is not as expected', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Unexpected error format' }), // Different error structure
    });
    render(<MissionInput />);
    const input = screen.getByPlaceholderText('Enter your research mission goal...');
    await user.type(input, 'Another test');
    await user.click(screen.getByRole('button', { name: /start mission/i }));

    // The error message in MissionInput for this case is "Failed to create mission (status: 500)"
    await waitFor(() => expect(screen.getByText(/error: failed to create mission \(status: 500\)/i)).toBeInTheDocument());
  });

  it('should display global agent error from store if present on mount', () => {
    (useAgentStore as unknown as jest.Mock).mockImplementation((selector) => {
      const state = { agentState: { error: 'Global test error from store' } };
      return selector(state);
    });
    render(<MissionInput />);
    expect(screen.getByText('Error: Global Agent Error: Global test error from store')).toBeInTheDocument();
  });

});
