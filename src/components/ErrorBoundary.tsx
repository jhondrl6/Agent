// src/components/ErrorBoundary.tsx
'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const componentContext = this.props.componentName ? `in component ${this.props.componentName}` : '';
    console.error(`[ErrorBoundary] Uncaught error ${componentContext}:`, error, errorInfo);

    this.setState({ errorInfo });

    // TODO: Integrate with global logger if available and appropriate for client-side UI errors
    // e.g., if (typeof window !== 'undefined' && (window as any).agentAddLog) {
    //   (window as any).agentAddLog({ level: 'error', message: `UI Error ${componentContext}: ${error.message}`, details: { stack: errorInfo.componentStack } });
    // }
  }

  private handleTryAgain = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-4 my-4 border border-red-400 bg-red-50 text-red-700 rounded-lg shadow-md" role="alert">
          <h3 className="font-semibold text-lg text-red-800 mb-2">Oops! Something went wrong.</h3>
          <p className="mb-1">
            We encountered an error {this.props.componentName ? `in the '${this.props.componentName}' section` : 'while rendering this part of the page'}.
            You can try clicking "Try Again" or refresh the page.
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mt-3 text-xs whitespace-pre-wrap bg-red-100 border border-red-300 p-2 rounded">
              <summary className="cursor-pointer font-medium text-red-800">Error Details (Development Only)</summary>
              <p className="mt-1"><strong>Message:</strong> {this.state.error.toString()}</p>
              {this.state.errorInfo && <p className="mt-1"><strong>Component Stack:</strong><br />{this.state.errorInfo.componentStack}</p>}
            </details>
          )}
          <button
            onClick={this.handleTryAgain}
            className="mt-4 px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
