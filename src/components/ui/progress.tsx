// src/components/ui/progress.tsx
import React from 'react';

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  showPercentageText?: boolean; // New prop to control text visibility
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  className = '',
  showPercentageText = true, // Default to true, similar to placeholder
}) => {
  const validMax = Math.max(1, max); // Ensure max is at least 1 to avoid division by zero
  const percentage = Math.min(Math.max((value / validMax) * 100, 0), 100); // Clamp between 0 and 100

  return (
    <div
      className={`w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700 overflow-hidden border border-gray-300 ${className}`}
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Progress: ${percentage.toFixed(1)}%`}
    >
      <div
        className="bg-green-500 h-full rounded-full transition-all duration-300 ease-in-out flex items-center justify-center"
        style={{ width: `${percentage}%` }}
      >
        {showPercentageText && percentage > 10 && ( // Only show text if it fits reasonably
          <span className="text-xs font-medium text-white px-1">
            {percentage.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
};

export { ProgressBar };
