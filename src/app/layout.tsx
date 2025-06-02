import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css'; // Main global styles (includes Tailwind)

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AI Agent Platform',
  description: 'Autonomous AI agents for complex task execution.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-900`}>
        {children}
      </body>
    </html>
  );
}
