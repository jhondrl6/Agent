import React from 'react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-600 text-white p-4">
        <div className="container mx-auto">
          <h1 className="text-xl font-semibold">AI Agent Platform</h1>
        </div>
      </header>
      <main className="p-4">
        {children}
      </main>
      <footer className="bg-gray-200 p-4 text-center text-sm text-gray-600">
        © {new Date().getFullYear()} AI Agent Platform. All rights reserved.
      </footer>
    </div>
  );
};

export default DashboardLayout;
