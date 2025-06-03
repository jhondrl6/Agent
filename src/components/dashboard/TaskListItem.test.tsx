import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TaskListItem, TaskListItemInternal } from './TaskListItem'; // Assuming TaskListItemInternal is exported for testing
import { useAgentStore } from '@/lib/agent/StateManager';
import { Task, TaskStatus } from '@/lib/types/agent'; // Assuming TaskStatus is part of types

// Mock StateManager
jest.mock('@/lib/agent/StateManager');
const mockUseAgentStore = useAgentStore as jest.Mock;
const mockManualCompleteTask = jest.fn();
const mockManualFailTask = jest.fn();

// Mock window.prompt and window.alert
const mockPrompt = jest.fn();
const mockAlert = jest.fn();


const sampleBaseTask: Omit<Task, 'status'> = { // Omit status to easily create variants
  id: 'task123',
  missionId: 'missionABC',
  description: 'Test this item',
  result: undefined,
  retries: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  subTasks: [],
  dependencies: [],
  validationOutcome: undefined,
  failureDetails: undefined,
};

const getSampleTask = (status: TaskStatus): Task => ({
  ...sampleBaseTask,
  status,
});

// Component to test (TaskListItemInternal if direct, or TaskListItem if props are passed through React.memo)
// For this test, we'll use TaskListItemInternal as it contains the logic.
// If TaskListItem is just React.memo(TaskListItemInternal), testing TaskListItemInternal is sufficient.
const TestComponent = TaskListItemInternal;


describe('TaskListItem Manual Override UI', () => {
  let originalPrompt: any;
  let originalAlert: any;

  beforeEach(() => {
    mockUseAgentStore.mockImplementation((selector: (state: any) => any) => {
      const selectorString = selector.toString();
      if (selectorString.includes('state.manualCompleteTask')) return mockManualCompleteTask;
      if (selectorString.includes('state.manualFailTask')) return mockManualFailTask;
      return jest.fn(); // Default mock for other selectors if any
    });

    // Save original window methods and mock them
    originalPrompt = window.prompt;
    originalAlert = window.alert;
    window.prompt = mockPrompt;
    window.alert = mockAlert;

    mockManualCompleteTask.mockClear();
    mockManualFailTask.mockClear();
    mockPrompt.mockClear();
    mockAlert.mockClear();
  });

  afterEach(() => {
    // Restore original window methods
    window.prompt = originalPrompt;
    window.alert = originalAlert;
  });

  const onTaskClickMock = jest.fn();

  test('buttons render correctly and are enabled for "pending" task', () => {
    render(<TestComponent task={getSampleTask('pending')} onTaskClick={onTaskClickMock} />);
    const completeButton = screen.getByTitle('Manually mark task as completed');
    const failButton = screen.getByTitle('Manually mark task as failed');

    expect(completeButton).toBeInTheDocument();
    expect(completeButton).not.toBeDisabled();
    expect(failButton).toBeInTheDocument();
    expect(failButton).not.toBeDisabled();
  });

  test('buttons render correctly and are enabled for "in-progress" task', () => {
    render(<TestComponent task={getSampleTask('in-progress')} onTaskClick={onTaskClickMock} />);
    expect(screen.getByTitle('Manually mark task as completed')).not.toBeDisabled();
    expect(screen.getByTitle('Manually mark task as failed')).not.toBeDisabled();
  });

  test('buttons render correctly and are enabled for "retrying" task', () => {
    render(<TestComponent task={getSampleTask('retrying')} onTaskClick={onTaskClickMock} />);
    expect(screen.getByTitle('Manually mark task as completed')).not.toBeDisabled();
    expect(screen.getByTitle('Manually mark task as failed')).not.toBeDisabled();
  });


  test('buttons are disabled for "completed" task', () => {
    render(<TestComponent task={getSampleTask('completed')} onTaskClick={onTaskClickMock} />);
    // The buttons might not even render if the condition is strict.
    // Current implementation: (task.status === 'pending' || task.status === 'in-progress' || task.status === 'failed' || task.status === 'retrying')
    // So for 'completed', the whole action div should be absent.
    expect(screen.queryByText('Manual:')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Manually mark task as completed')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Manually mark task as failed')).not.toBeInTheDocument();
  });

  test('buttons render correctly for "failed" task (complete enabled, fail enabled)', () => {
    render(<TestComponent task={getSampleTask('failed')} onTaskClick={onTaskClickMock} />);
    const completeButton = screen.getByTitle('Manually mark task as completed');
    const failButton = screen.getByTitle('Manually mark task as failed');

    expect(completeButton).not.toBeDisabled();
    expect(failButton).not.toBeDisabled(); // Can re-fail a failed task
  });


  describe('"Mark Complete" button interactions', () => {
    test('calls manualCompleteTask with result when prompt is confirmed', () => {
      const task = getSampleTask('pending');
      mockPrompt.mockReturnValue('Manual completion result');
      render(<TestComponent task={task} onTaskClick={onTaskClickMock} />);

      fireEvent.click(screen.getByTitle('Manually mark task as completed'));

      expect(mockPrompt).toHaveBeenCalledWith("Enter optional result text for manual completion:", "Manually completed.");
      expect(mockManualCompleteTask).toHaveBeenCalledWith(task.missionId, task.id, 'Manual completion result');
    });

    test('does not call manualCompleteTask when prompt is cancelled', () => {
      const task = getSampleTask('pending');
      mockPrompt.mockReturnValue(null); // Simulate user cancelling prompt
      render(<TestComponent task={task} onTaskClick={onTaskClickMock} />);

      fireEvent.click(screen.getByTitle('Manually mark task as completed'));

      expect(mockPrompt).toHaveBeenCalledTimes(1);
      expect(mockManualCompleteTask).not.toHaveBeenCalled();
    });
  });

  describe('"Mark Failed" button interactions', () => {
    test('calls manualFailTask with reason when prompt is confirmed with text', () => {
      const task = getSampleTask('pending');
      mockPrompt.mockReturnValue('Manual failure reason');
      render(<TestComponent task={task} onTaskClick={onTaskClickMock} />);

      fireEvent.click(screen.getByTitle('Manually mark task as failed'));

      expect(mockPrompt).toHaveBeenCalledWith("Enter reason for manual failure:", "");
      expect(mockManualFailTask).toHaveBeenCalledWith(task.missionId, task.id, 'Manual failure reason');
    });

    test('does not call manualFailTask when prompt is cancelled', () => {
      const task = getSampleTask('pending');
      mockPrompt.mockReturnValue(null); // Simulate user cancelling prompt
      render(<TestComponent task={task} onTaskClick={onTaskClickMock} />);

      fireEvent.click(screen.getByTitle('Manually mark task as failed'));

      expect(mockPrompt).toHaveBeenCalledTimes(1);
      expect(mockManualFailTask).not.toHaveBeenCalled();
    });

    test('does not call manualFailTask and alerts if reason is empty', () => {
      const task = getSampleTask('pending');
      mockPrompt.mockReturnValue(''); // Simulate user submitting empty reason
      render(<TestComponent task={task} onTaskClick={onTaskClickMock} />);

      fireEvent.click(screen.getByTitle('Manually mark task as failed'));

      expect(mockPrompt).toHaveBeenCalledTimes(1);
      expect(mockManualFailTask).not.toHaveBeenCalled();
      expect(mockAlert).toHaveBeenCalledWith("Reason cannot be empty for manual failure.");
    });

    test('does not call manualFailTask and alerts if reason is whitespace', () => {
        const task = getSampleTask('pending');
        mockPrompt.mockReturnValue('   '); // Simulate user submitting whitespace reason
        render(<TestComponent task={task} onTaskClick={onTaskClickMock} />);

        fireEvent.click(screen.getByTitle('Manually mark task as failed'));

        expect(mockPrompt).toHaveBeenCalledTimes(1);
        expect(mockManualFailTask).not.toHaveBeenCalled();
        expect(mockAlert).toHaveBeenCalledWith("Reason cannot be empty for manual failure.");
      });
  });

  test('e.stopPropagation() prevents onTaskClick when buttons are clicked', () => {
    const task = getSampleTask('pending');
    mockPrompt.mockReturnValue('Some input'); // Ensure action proceeds
    render(<TestComponent task={task} onTaskClick={onTaskClickMock} />);

    fireEvent.click(screen.getByTitle('Manually mark task as completed'));
    expect(onTaskClickMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Manually mark task as failed'));
    expect(onTaskClickMock).not.toHaveBeenCalled();
  });
});
