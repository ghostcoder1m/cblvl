import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  HomeIcon,
  DocumentTextIcon,
  ChartBarIcon,
  UserCircleIcon,
  ArrowLeftOnRectangleIcon,
  BellIcon,
  MagnifyingGlassIcon,
  BookmarkIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth';
import { motion } from 'framer-motion';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const { user, loading, signOut } = useAuth({
    requireAuth: true,
    autoLogoutTime: 60, // 1 hour
  });

  const [timeLeft, setTimeLeft] = useState(60 * 60); // 1 hour in seconds
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);

  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        const newTime = prev - 1;
        if (newTime <= 300 && newTime > 0) { // Show warning when 5 minutes or less remaining
          setShowTimeoutWarning(true);
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [user]);

  const formatTimeLeft = () => {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'Content', href: '/content', icon: DocumentTextIcon },
    { name: 'Generate', href: '/content-generator', icon: DocumentTextIcon },
    { name: 'Video Generator', href: '/video-generator', icon: VideoCameraIcon },
    { name: 'Trend Finder', href: '/trend-finder', icon: MagnifyingGlassIcon },
    { name: 'Saved Trends', href: '/saved-trends', icon: BookmarkIcon },
    { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
    { name: 'Settings', href: '/settings', icon: UserCircleIcon },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Session Timeout Warning */}
      {showTimeoutWarning && (
        <motion.div
          initial={{ opacity: 0, y: -100 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-0 left-0 right-0 bg-yellow-100 p-4 z-50"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center">
              <BellIcon className="h-6 w-6 text-yellow-600 mr-2" />
              <span className="text-yellow-800">
                Session will expire in {formatTimeLeft()}. Please save your work.
              </span>
            </div>
            <button
              onClick={() => setTimeLeft(60 * 60)}
              className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
            >
              Extend Session
            </button>
          </div>
        </motion.div>
      )}

      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              {navigation.map((item) => {
                const isActive = router.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex items-center px-4 py-2 border-b-2 text-sm font-medium ${
                      isActive
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <item.icon className="h-5 w-5 mr-2" />
                    {item.name}
                  </Link>
                );
              })}
            </div>

            <div className="flex items-center">
              {user && (
                <>
                  <span className="text-sm text-gray-500 mr-4">
                    {user.email}
                  </span>
                  <button
                    onClick={signOut}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200"
                  >
                    <ArrowLeftOnRectangleIcon className="h-5 w-5 mr-2" />
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
} 