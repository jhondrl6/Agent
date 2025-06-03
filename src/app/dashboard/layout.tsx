import React from 'react';
import ErrorBoundary from '@/components/ErrorBoundary'; // Adjust path as needed

interface DashboardLayoutProps { // Keep this if you prefer explicit prop typing
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col"> {/* Added flex flex-col */}
      <header className="bg-blue-600 text-white p-4 shadow-md">
        <div className="container mx-auto">
          <h1 className="text-xl font-semibold">AI Agent Platform</h1>
        </div>
      </header>
      <ErrorBoundary
        componentName="DashboardLayoutContent"
        fallback={<div className="flex-grow flex items-center justify-center p-4 text-red-600 bg-red-50"><p>Error: The main dashboard content area encountered an issue. Please try refreshing.</p></div>}
      >
        <main className="flex-grow p-2 md:p-4 lg:p-6 container mx-auto"> {/* Added container mx-auto for content centering */}
          {children}
        </main>
      </ErrorBoundary>
      <footer className="bg-gray-200 p-4 text-center text-sm text-gray-600 border-t border-gray-300">
        © {new Date().getFullYear()} AI Agent Platform. All rights reserved.
      </footer>
    </div>
  );
};

export default DashboardLayout;
