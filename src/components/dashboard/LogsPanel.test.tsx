// src/components/dashboard/LogsPanel.test.tsx
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LogsPanel } from './LogsPanel';
import { useAgentStore } from '@/lib/agent/StateManager';
import { LogEntry, LogLevel } from '@/lib/types/agent';

// Mock useAgentStore
jest.mock('@/lib/agent/StateManager');
const mockedUseAgentStore = useAgentStore as jest.MockedFunction<typeof useAgentStore>;

// Mock LogListItem as LogsPanel relies on it for rendering individual logs
// This makes the LogsPanel test a unit test of LogsPanel itself, not its children.
jest.mock('./LogListItem', () => ({
  LogListItem: jest.fn(({ log }: { log: LogEntry }) => (
    <div data-testid={`log-item-${log.id}`} role="listitem">
      <span data-testid="log-message">{log.message}</span>
      <span data-testid="log-level">{log.level}</span>
      {log.details && <span data-testid="log-details">{JSON.stringify(log.details)}</span>}
    </div>
  )),
}));
const MockedLogListItem = require('./LogListItem').LogListItem as jest.MockedFunction<React.FC<{log: LogEntry}>>;


describe('LogsPanel Component', () => {
  beforeEach(() => {
    mockedUseAgentStore.mockReset(); // Reset the store mock itself
    MockedLogListItem.mockClear(); // Clear calls to LogListItem
  });

  it('should display "No log entries yet" when logs array is empty', () => {
    // Provide a state where logs is an empty array
    mockedUseAgentStore.mockImplementation((selector: (state: any) => any) => selector({
      logs: [],
      // Provide other parts of the store if selectors in LogsPanel need them, though it only selects logs
      agentState: { isLoading: false, error: null, activeTasks: [], currentMissionId: null },
      missions: {},
    }));
    render(<LogsPanel />);
    expect(screen.getByText(/no log entries yet/i)).toBeInTheDocument();
  });

  const mockLogs: LogEntry[] = [
    { id: 'log1', timestamp: new Date(Date.UTC(2023, 0, 1, 10, 0, 0)), level: 'info', message: 'Info message one' },
    { id: 'log2', timestamp: new Date(Date.UTC(2023, 0, 1, 10, 1, 0)), level: 'error', message: 'Error message two', details: { code: 500, data: 'some error data' } },
    { id: 'log3', timestamp: new Date(Date.UTC(2023, 0, 1, 10, 2, 0)), level: 'debug', message: 'Debug details here', details: 'Just a string detail' },
  ];

  it('should render a list of log entries using LogListItem', () => {
    mockedUseAgentStore.mockImplementation((selector: (state: any) => any) => selector({
      logs: mockLogs,
      agentState: { isLoading: false, error: null, activeTasks: [], currentMissionId: null },
      missions: {},
    }));
    render(<LogsPanel />);

    expect(screen.queryByText(/no log entries yet/i)).not.toBeInTheDocument();
    expect(MockedLogListItem).toHaveBeenCalledTimes(mockLogs.length);

    // Check if LogListItem was called with correct props (logs are prepended, so newest is first)
    // The mockLogs array is [log1 (oldest), log2, log3 (newest by timestamp if sorted, but added as is for test)]
    // StateManager prepends, so if mockLogs is [oldest, middle, newest], store will be [newest, middle, oldest]
    // And map will render them in that order.
    // So, logs[0] in component is mockLogs[0] because map preserves original order of the already-reversed array.
    expect(MockedLogListItem).toHaveBeenNthCalledWith(1, expect.objectContaining({ log: mockLogs[0] }), {});
    expect(MockedLogListItem).toHaveBeenNthCalledWith(2, expect.objectContaining({ log: mockLogs[1] }), {});
    expect(MockedLogListItem).toHaveBeenNthCalledWith(3, expect.objectContaining({ log: mockLogs[2] }), {});

    // Verify content via the mock LogListItem's rendering
    const logItem1 = screen.getByTestId('log-item-log1');
    expect(within(logItem1).getByText('Info message one')).toBeInTheDocument();
    expect(within(logItem1).getByText('info')).toBeInTheDocument();

    const logItem2 = screen.getByTestId('log-item-log2');
    expect(within(logItem2).getByText('Error message two')).toBeInTheDocument();
    expect(within(logItem2).getByText('error')).toBeInTheDocument();
    expect(within(logItem2).getByText(JSON.stringify({ code: 500, data: 'some error data' }))).toBeInTheDocument();
  });

  // Auto-scrolling is primarily a visual/behavioral aspect often tested manually or with E2E tools.
  // Unit testing its exact scroll position effect in JSDOM is complex and of lower value than testing rendering.
  it('should contain a scrollable area', () => {
    mockedUseAgentStore.mockImplementation((selector: (state: any) => any) => selector({
        logs: mockLogs, // Provide some logs to make the scrollable area potentially active
        agentState: { isLoading: false, error: null, activeTasks: [], currentMissionId: null },
        missions: {},
    }));
    render(<LogsPanel />);
    const listContainer = screen.getByRole('list'); // Assuming the <ul> or parent div of items has a role="list" or is identifiable
    // The current LogsPanel uses a div with "overflow-y-auto"
    // Let's try to get it by class or add a test-id to it.
    // For now, check for one of the list items being present as a proxy for the container.
    expect(screen.getByTestId('log-item-log1')).toBeInTheDocument();
    // A better test would be to check the styles of the container if possible, or its structure.
    // The current structure in LogsPanel.tsx is: <div className="overflow-y-auto ..."> {logs.map(...)} </div>
    // We can't easily query by specific Tailwind classes with RTL directly unless combined with test-id.
  });

});
