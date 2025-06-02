import React from 'react';

const DashboardPage: React.FC = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">AI Agent Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-2">Mission Control</h2>
          <p>Placeholder for mission input and status.</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-2">Task List</h2>
          <p>Placeholder for the list of tasks.</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-2">Progress Monitor</h2>
          <p>Placeholder for overall progress and logs.</p>
        </div>
        <div className="md:col-span-2 lg:col-span-3 bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-2">Results</h2>
          <p>Placeholder for displaying results from completed tasks.</p>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
