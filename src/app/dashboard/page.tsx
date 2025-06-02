// src/app/dashboard/page.tsx
'use client'; 

import React from 'react'; // React import is good practice
import ErrorBoundary from '@/components/ErrorBoundary'; 
import { MissionInput } from '@/components/dashboard/MissionInput';
import { TaskList } from '@/components/dashboard/TaskList';
import { ProgressMonitor } from '@/components/dashboard/ProgressMonitor';
import { LogsPanel } from '@/components/dashboard/LogsPanel';

const DashboardPage: React.FC = () => { // Explicit React.FC type
  return (
    // Removed container mx-auto p-4 from here as layout.tsx now has container for main
    <div className="space-y-4 md:space-y-6"> 
      <ErrorBoundary 
        componentName="DashboardPanels"
        fallback={
          <div className="p-4 my-4 text-orange-700 bg-orange-100 border border-orange-300 rounded-lg shadow-md">
            <h3 className="font-semibold text-lg">Error Loading Dashboard Panels</h3>
            <p>One or more of the main dashboard sections could not be loaded. Some functionality might be unavailable. Please try refreshing the page.</p>
          </div>
        }
      >
        {/* MissionInput is typically at the top and might not need to be in the grid */}
        <MissionInput /> 
        
        {/* ProgressMonitor can also be above the main grid or within it */}
        <ProgressMonitor /> 
        
        {/* Grid for TaskList and LogsPanel */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6"> 
          <TaskList />
          <LogsPanel />
        </div>
        {/* ResultsPanel could be added here or below if it's a separate component */}
        {/* <div className="bg-white p-4 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-2">Results Panel</h2>
              <p>Placeholder for results display.</p>
            </div> */}
      </ErrorBoundary>
    </div>
  );
};

export default DashboardPage;
