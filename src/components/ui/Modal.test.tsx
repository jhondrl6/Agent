// src/components/ui/Modal.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Modal } from './modal';

describe('Modal Component', () => {
  const mockOnClose = jest.fn();
  const modalTitle = 'Test Modal Title';
  const modalContentText = 'This is the modal content.';

  beforeEach(() => {
    mockOnClose.mockClear();
    // Reset body overflow that might be set by modal
    document.body.style.overflow = 'auto';
  });

  afterEach(() => {
    // Ensure body overflow is reset after each test if a modal was opened
    document.body.style.overflow = 'auto';
  });

  it('should not render when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={mockOnClose} title={modalTitle}>
        <p>{modalContentText}</p>
      </Modal>
    );
    expect(screen.queryByText(modalTitle)).not.toBeInTheDocument();
    expect(screen.queryByText(modalContentText)).not.toBeInTheDocument();
  });

  it('should render with title and children when isOpen is true', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title={modalTitle}>
        <p>{modalContentText}</p>
      </Modal>
    );
    expect(screen.getByText(modalTitle)).toBeInTheDocument();
    expect(screen.getByText(modalContentText)).toBeInTheDocument();
  });

  it('should call onClose when the close button (×) is clicked', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title={modalTitle}>
        <p>{modalContentText}</p>
      </Modal>
    );
    const closeButton = screen.getByLabelText('Close modal');
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when the overlay (background) is clicked', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title={modalTitle}>
        <p>{modalContentText}</p>
      </Modal>
    );
    const overlayDiv = screen.getByTestId('modal-overlay');
    fireEvent.click(overlayDiv);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should not call onClose when content inside the modal is clicked', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title={modalTitle}>
        <p>{modalContentText}</p>
      </Modal>
    );
    const contentElement = screen.getByText(modalContentText);
    fireEvent.click(contentElement); // Click on child paragraph
    fireEvent.click(screen.getByTestId('modal-panel')); // Click on modal panel itself
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should call onClose when the Escape key is pressed', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title={modalTitle}>
        <p>{modalContentText}</p>
      </Modal>
    );
    // The event listener is on the document, so we fire the event on the document
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape', keyCode: 27, charCode: 27 });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should apply size classes correctly', () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={mockOnClose} size="sm"><div>Small</div></Modal>
    );
    let panel = screen.getByTestId('modal-panel');
    expect(panel).toHaveClass('max-w-sm');

    rerender(<Modal isOpen={true} onClose={mockOnClose} size="lg"><div>Large</div></Modal>);
    panel = screen.getByTestId('modal-panel');
    expect(panel).toHaveClass('max-w-lg');

    rerender(<Modal isOpen={true} onClose={mockOnClose} size="full"><div>Full</div></Modal>);
    panel = screen.getByTestId('modal-panel');
    expect(panel).toHaveClass('max-w-full');
  });

  it('should prevent background scrolling when open and restore on close', () => {
    expect(document.body.style.overflow).toBe('auto'); // Initial
    const { rerender } = render(
      <Modal isOpen={true} onClose={mockOnClose} title="Test"><div>Content</div></Modal>
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Modal isOpen={false} onClose={mockOnClose} title="Test"><div>Content</div></Modal>
    );
    expect(document.body.style.overflow).toBe('auto');
  });

});
