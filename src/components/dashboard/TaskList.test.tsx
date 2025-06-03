// src/components/dashboard/TaskList.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { TaskList } from './TaskList';
import { useAgentStore } from '@/lib/agent/StateManager';
import { Mission, Task, LogLevel } from '@/lib/types/agent';
import { TaskExecutor } from '@/lib/agent/TaskExecutor';
import { DecisionEngine } from '@/lib/agent/DecisionEngine'; // For MAX_TASK_RETRIES display

// --- Mocks ---
jest.mock('@/lib/agent/StateManager');
const mockedUseAgentStore = useAgentStore as jest.MockedFunction<typeof useAgentStore>;

jest.mock('./TaskListItem', () => ({
  TaskListItem: jest.fn(({ task, onTaskClick }: { task: Task, onTaskClick: (task: Task) => void }) => (
    <div data-testid={`task-item-${task.id}`} onClick={() => onTaskClick(task)} role="listitem">
      {task.description}
    </div>
  )),
}));
const MockedTaskListItem = require('./TaskListItem').TaskListItem as jest.MockedFunction<React.FC<{task: Task, onTaskClick: (task: Task) => void}>>;


jest.mock('@/components/ui/modal', () => ({
  Modal: jest.fn(({ isOpen, onClose, title, children }) =>
    isOpen ? (
      <div data-testid="mock-modal" aria-labelledby="modal-title">
        <h3 data-testid="mock-modal-title" id="modal-title">{title}</h3>
        <div>{children}</div>
        <button data-testid="mock-modal-close" onClick={onClose}>Close Modal UI</button>
      </div>
    ) : null
  ),
}));
const MockedModal = require('@/components/ui/Modal').Modal as jest.MockedFunction<any>;


jest.mock('@/lib/agent/TaskExecutor');
const MockedTaskExecutor = TaskExecutor as jest.MockedClass<typeof TaskExecutor>;
const mockExecuteTask = jest.fn().mockResolvedValue(undefined);

// Mock global prompt
global.prompt = jest.fn();

const mockAddLog = jest.fn();
const mockManualCompleteTask = jest.fn();
const mockManualFailTask = jest.fn();
const mockUpdateTask = jest.fn();

const mockMissionBase: Mission = {
  id: 'mission-1',
  goal: 'Test Mission',
  tasks: [],
  status: 'pending',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const taskPending: Task = { id: 'task-p1', missionId: 'mission-1', description: 'Pending Task 1', status: 'pending', retries: 0, createdAt: new Date(), updatedAt: new Date() };
const taskInProgress: Task = { id: 'task-ip1', missionId: 'mission-1', description: 'In Progress Task 1', status: 'in-progress', retries: 0, createdAt: new Date(), updatedAt: new Date() };
const taskCompleted: Task = { id: 'task-c1', missionId: 'mission-1', description: 'Completed Task 1', status: 'completed', retries: 0, result: 'Done', createdAt: new Date(), updatedAt: new Date() };
const taskFailed: Task = { id: 'task-f1', missionId: 'mission-1', description: 'Failed Task 1', status: 'failed', retries: 1, failureDetails: { reason: 'Simulated fail', timestamp: new Date(), originalError: 'Simulated', suggestedAction: 'abandon'}, createdAt: new Date(), updatedAt: new Date() };


describe('TaskList Component', () => {
  const user = userEvent.setup({ delay: null }); // delay: null for faster userEvent in tests

  beforeEach(() => {
    jest.clearAllMocks();
    MockedTaskExecutor.prototype.executeTask = mockExecuteTask;

    mockedUseAgentStore.mockImplementation((selector: any) => {
      const state = {
        missions: { 'mission-1': { ...mockMissionBase, tasks: [taskPending, taskInProgress, taskCompleted, taskFailed] } },
        agentState: { currentMissionId: 'mission-1', isLoading: false, error: null, activeTasks: [taskInProgress.id] },
        logs: [],
        addLog: mockAddLog,
        manualCompleteTask: mockManualCompleteTask,
        manualFailTask: mockManualFailTask,
        updateTask: mockUpdateTask,
      };
      return selector(state);
    });
    (global.prompt as jest.Mock).mockReturnValue('Test reason');
  });

  it('should display "No mission active" if no currentMissionId', () => {
    mockedUseAgentStore.mockImplementation((selector: any) => selector({ missions: {}, agentState: { currentMissionId: null, logs:[] } } as any));
    render(<TaskList />);
    expect(screen.getByText('No mission active or selected.')).toBeInTheDocument();
  });

  it('should display "No tasks" if mission has no tasks', () => {
    mockedUseAgentStore.mockImplementation((selector: any) => selector({ missions: { 'mission-1': { ...mockMissionBase, tasks: [] } }, agentState: { currentMissionId: 'mission-1', logs:[] } } as any));
    render(<TaskList />);
    expect(screen.getByText(/No tasks decomposed for this mission yet/i)).toBeInTheDocument();
  });

  it('should render a list of tasks using TaskListItem', () => {
    render(<TaskList />);
    expect(MockedTaskListItem).toHaveBeenCalledTimes(4);
    expect(screen.getByTestId(`task-item-${taskPending.id}`)).toHaveTextContent(taskPending.description);
  });

  describe('"Run All Pending Tasks" Button', () => {
    it('should be disabled if agent is loading or no pending tasks', () => {
      mockedUseAgentStore.mockImplementation((selector: any) => selector({
        missions: { 'mission-1': { ...mockMissionBase, tasks: [taskPending] } },
        agentState: { currentMissionId: 'mission-1', isLoading: true, activeTasks: [], logs:[] }
      } as any));
      const { rerender } = render(<TaskList />);
      expect(screen.getByRole('button', { name: /executing/i })).toBeDisabled();

      mockedUseAgentStore.mockImplementation((selector: any) => selector({
        missions: { 'mission-1': { ...mockMissionBase, tasks: [taskCompleted] } },
        agentState: { currentMissionId: 'mission-1', isLoading: false, activeTasks: [], logs:[] }
      }as any));
      rerender(<TaskList />);
      expect(screen.getByRole('button', { name: /run all pending tasks/i })).toBeDisabled();
    });

    it('should call handleExecutePendingTasks on click and instantiate TaskExecutor for pending tasks', async () => {
      mockedUseAgentStore.mockImplementation((selector: any) => selector({
        missions: { 'mission-1': { ...mockMissionBase, tasks: [taskPending, taskCompleted] } },
        agentState: { currentMissionId: 'mission-1', isLoading: false, activeTasks: [], logs:[] },
        addLog: mockAddLog
      } as any));
      render(<TaskList />);
      const runButton = screen.getByRole('button', { name: /run all pending tasks/i });
      await user.click(runButton);

      expect(MockedTaskExecutor).toHaveBeenCalledTimes(1);
      expect(mockExecuteTask).toHaveBeenCalledTimes(1);
      expect(mockExecuteTask).toHaveBeenCalledWith(mockMissionBase.id, expect.objectContaining({ id: taskPending.id }));
    });
  });

  describe('Task Detail Modal and Manual Overrides', () => {
    it('should open modal with task details on task click', async () => {
      render(<TaskList />);
      const taskItem = screen.getByTestId(`task-item-${taskCompleted.id}`);
      await user.click(taskItem);

      expect(MockedModal).toHaveBeenCalledWith(expect.objectContaining({ isOpen: true, title: expect.stringContaining(taskCompleted.id.substring(0,15)) }), {});
      await screen.findByTestId('mock-modal');
      expect(screen.getByTestId('mock-modal-title')).toHaveTextContent(taskCompleted.id.substring(0,15));
      // The children are rendered inside the modal mock, so we can query for them.
      // TaskList passes a div that contains the description etc.
      expect(screen.getByText(taskCompleted.description)).toBeInTheDocument();
    });

    it('should call manualCompleteTask action when "Mark Completed" is clicked in modal', async () => {
      render(<TaskList />);
      await user.click(screen.getByTestId(`task-item-${taskPending.id}`));
      await screen.findByTestId('mock-modal');

      const markCompletedButton = screen.getByRole('button', { name: /mark completed/i });
      await user.click(markCompletedButton);

      expect(global.prompt).toHaveBeenCalled();
      expect(mockManualCompleteTask).toHaveBeenCalledWith(missionId, taskPending.id, 'Test reason');
      expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'system', message: expect.stringContaining('manually marked COMPLETED') }));
    });

    it('should call manualFailTask action when "Mark Failed" is clicked', async () => {
      render(<TaskList />);
      await user.click(screen.getByTestId(`task-item-${taskPending.id}`));
      await screen.findByTestId('mock-modal');

      const markFailedButton = screen.getByRole('button', { name: /mark as failed/i });
      await user.click(markFailedButton);

      expect(global.prompt).toHaveBeenCalled();
      expect(mockManualFailTask).toHaveBeenCalledWith(missionId, taskPending.id, 'Test reason');
      expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'system', message: expect.stringContaining('manually marked FAILED') }));
    });

    it('should call TaskExecutor.executeTask when "Force Retry" is clicked', async () => {
      render(<TaskList />);
      await user.click(screen.getByTestId(`task-item-${taskFailed.id}`));
      await screen.findByTestId('mock-modal');

      const forceRetryButton = screen.getByRole('button', { name: /force retry/i });
      await user.click(forceRetryButton);

      expect(mockAddLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'system', message: expect.stringContaining('Force retry triggered') }));
      expect(mockUpdateTask).toHaveBeenCalledWith(missionId, taskFailed.id, expect.objectContaining({
        status: 'pending',
        result: undefined,
        failureDetails: undefined,
        validationOutcome: undefined
      }));
      expect(MockedTaskExecutor).toHaveBeenCalledTimes(1);
      expect(mockExecuteTask).toHaveBeenCalledTimes(1);
      expect(mockExecuteTask).toHaveBeenCalledWith(missionId, expect.objectContaining({
        id: taskFailed.id,
        status: 'pending',
        retries: taskFailed.retries
      }));
    });
  });
});
