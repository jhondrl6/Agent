import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProgressBar } from './progress'; // Adjust path as necessary

describe('ProgressBar', () => {
  test('renders with basic props and correct ARIA attributes', () => {
    render(<ProgressBar value={50} />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');

    const fillDiv = progressBar.firstChild as HTMLElement;
    expect(fillDiv).toHaveStyle('width: 50%');
  });

  test('handles custom max value correctly', () => {
    render(<ProgressBar value={25} max={200} />);
    const progressBar = screen.getByRole('progressbar');
    // Percentage calculation: (25 / 200) * 100 = 12.5
    expect(progressBar).toHaveAttribute('aria-valuenow', '12.5');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100'); // aria-valuemax is always 100 as per current implementation of percentage

    const fillDiv = progressBar.firstChild as HTMLElement;
    expect(fillDiv).toHaveStyle('width: 12.5%');
  });

  test('clamps value to 0 and 100', () => {
    // Value greater than max
    const { rerender } = render(<ProgressBar value={120} />);
    let progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '100');
    let fillDiv = progressBar.firstChild as HTMLElement;
    expect(fillDiv).toHaveStyle('width: 100%');

    // Value less than 0
    rerender(<ProgressBar value={-10} />);
    progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    fillDiv = progressBar.firstChild as HTMLElement;
    expect(fillDiv).toHaveStyle('width: 0%');
  });

  test('handles max value of 0 or less by treating it as 1', () => {
    render(<ProgressBar value={0.5} max={0} />);
    const progressBar = screen.getByRole('progressbar');
    // validMax = Math.max(1, 0) = 1. percentage = (0.5 / 1) * 100 = 50
    expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    const fillDiv = progressBar.firstChild as HTMLElement;
    expect(fillDiv).toHaveStyle('width: 50%');
  });


  test('displays percentage text when showPercentageText is true and value > 10%', () => {
    render(<ProgressBar value={60} showPercentageText={true} />);
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  test('does not display percentage text when value <= 10%, even if showPercentageText is true', () => {
    render(<ProgressBar value={5} showPercentageText={true} />);
    expect(screen.queryByText('5%')).not.toBeInTheDocument();
  });

  test('does not display percentage text when value is between 0 and 10, even if showPercentageText is true', () => {
    render(<ProgressBar value={7} max={100} showPercentageText={true} />);
    expect(screen.queryByText('7%')).not.toBeInTheDocument();
  });

  test('does not display percentage text when showPercentageText is false', () => {
    render(<ProgressBar value={60} showPercentageText={false} />);
    expect(screen.queryByText('60%')).not.toBeInTheDocument();
  });

  test('applies custom className to the main element', () => {
    const customClass = 'my-custom-progress-bar';
    render(<ProgressBar value={50} className={customClass} />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveClass(customClass);
  });

  test('aria-label is correctly formatted', () => {
    render(<ProgressBar value={75.25} />);
    const progressBar = screen.getByRole('progressbar');
    // Note: toFixed(1) is used in the component for aria-label
    expect(progressBar).toHaveAttribute('aria-label', 'Progress: 75.3%');
  });
});
