import Link from 'next/link';

const HomePage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 text-white">
      <div className="text-center p-8">
        <h1 className="text-5xl font-extrabold mb-6 drop-shadow-md">
          Welcome to the AI Agent Platform
        </h1>
        <p className="text-xl mb-8 max-w-2xl mx-auto">
          Leverage the power of autonomous AI agents to accomplish complex tasks, conduct research, and automate your workflows.
        </p>
        <Link href="/dashboard" legacyBehavior>
          <a className="bg-white text-purple-600 font-semibold py-3 px-8 rounded-lg shadow-lg hover:bg-gray-100 transition duration-300 ease-in-out text-lg">
            Go to Dashboard
          </a>
        </Link>
      </div>
      <div className="absolute bottom-8 text-sm text-gray-200">
        <p>&copy; {new Date().getFullYear()} AI Agent Platform. Built with Next.js and Tailwind CSS.</p>
      </div>
    </div>
  );
};

export default HomePage;
