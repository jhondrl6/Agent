// src/components/ui/modal.tsx
'use client';

import React, { ReactNode, useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

const ModalComponent = ({ isOpen, onClose, title, children, size = 'md' }: ModalProps) => {
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    } else {
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'auto'; // Ensure overflow is reset on unmount
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl', // Added 2xl
    full: 'max-w-full mx-4 sm:mx-6 md:mx-8',
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex justify-center items-center z-50 p-4 transition-opacity duration-150 ease-in-out"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      data-testid="modal-overlay" // Added for testing
    >
      <div
        className={`bg-white text-gray-800 p-5 sm:p-6 rounded-lg shadow-xl w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col transform transition-all duration-150 ease-in-out scale-95 opacity-0 animate-modalFadeIn`}
        onClick={(e) => e.stopPropagation()}
        data-testid="modal-panel" // Added for testing
      >
        <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-4">
          {title && <h3 id="modal-title" className="text-xl font-semibold text-gray-900">{title}</h3>}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-3xl leading-none font-light hover:bg-gray-100 rounded-full p-1"
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>
        <div className="overflow-y-auto flex-grow pr-1 custom-scrollbar">
          {children}
        </div>
      </div>
      {/* Keyframes for modalFadeIn (can be moved to globals.css) */}
      <style jsx global>{`
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-modalFadeIn { animation: modalFadeIn 0.2s ease-out forwards; }

        /* Basic custom scrollbar for modal content if needed */
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #c5c5c5;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #a5a5a5;
        }
      `}</style>
    </div>
  );
};

export const Modal = React.memo(ModalComponent);
Modal.displayName = 'Modal';
