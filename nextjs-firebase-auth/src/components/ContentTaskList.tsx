import {
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  UserGroupIcon,
  PencilIcon,
  TagIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

interface ContentTask {
  id: string;
  topic: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  format: string;
  progress: number;
  keywords?: string[];
  targetAudience?: string;
  style?: string;
  error?: string;
  estimatedTimeRemaining?: number;
}

interface ContentTaskListProps {
  tasks: ContentTask[];
  onViewTask: (task: ContentTask) => void;
  onRetryTask: (taskId: string) => void;
}

const ContentTaskList = ({ tasks, onViewTask, onRetryTask }: ContentTaskListProps) => {
  const getStatusIcon = (status: ContentTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-6 w-6 text-green-500" />;
      case 'failed':
        return <ExclamationCircleIcon className="h-6 w-6 text-red-500" />;
      case 'processing':
        return (
          <div className="relative h-6 w-6">
            <div className="absolute inset-0 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-0 border-2 border-blue-300 border-t-transparent rounded-full animate-pulse" />
          </div>
        );
      default:
        return <ClockIcon className="h-6 w-6 text-gray-400" />;
    }
  };

  const getFormatIcon = (format: string) => {
    switch (format.toLowerCase()) {
      case 'article':
        return <DocumentTextIcon className="h-5 w-5 text-gray-400" />;
      case 'blog_post':
        return <PencilIcon className="h-5 w-5 text-gray-400" />;
      default:
        return <DocumentTextIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const formatTimeRemaining = (seconds: number) => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }
    const minutes = Math.round(seconds / 60);
    return `${minutes}m`;
  };

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg shadow">
        <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No tasks</h3>
        <p className="mt-1 text-sm text-gray-500">Get started by creating a new content task.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg divide-y divide-gray-200">
      <AnimatePresence>
        {tasks.map((task) => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="p-6 hover:bg-gray-50 transition-colors duration-200"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3">
                  <h3 className="text-lg font-medium text-gray-900 truncate">
                    {task.topic}
                  </h3>
                  {getStatusIcon(task.status)}
                </div>
                
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-500">
                  <div className="flex items-center">
                    <ClockIcon className="flex-shrink-0 mr-1.5 h-5 w-5" />
                    {new Date(task.createdAt).toLocaleDateString()}
                  </div>
                  <div className="flex items-center">
                    {getFormatIcon(task.format)}
                    <span className="ml-1.5">{task.format}</span>
                  </div>
                  {task.targetAudience && (
                    <div className="flex items-center">
                      <UserGroupIcon className="flex-shrink-0 mr-1.5 h-5 w-5" />
                      {task.targetAudience}
                    </div>
                  )}
                  {task.style && (
                    <div className="flex items-center">
                      <PencilIcon className="flex-shrink-0 mr-1.5 h-5 w-5" />
                      {task.style}
                    </div>
                  )}
                </div>

                {task.keywords && task.keywords.length > 0 && (
                  <div className="mt-2 flex items-center space-x-2">
                    <TagIcon className="h-5 w-5 text-gray-400" />
                    <div className="flex flex-wrap gap-2">
                      {task.keywords.map((keyword) => (
                        <span
                          key={keyword}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {task.error && (
                  <div className="mt-2 text-sm text-red-600">
                    <ExclamationCircleIcon className="inline-block h-4 w-4 mr-1" />
                    {task.error}
                  </div>
                )}
              </div>

              <div className="ml-6 flex items-center space-x-4">
                {task.status === 'processing' && (
                  <div className="w-48">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <div className="flex items-center">
                        <ChartBarIcon className="h-4 w-4 mr-1" />
                        <span>Progress</span>
                      </div>
                      <span>{task.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <motion.div
                        className="bg-blue-600 h-2"
                        initial={{ width: 0 }}
                        animate={{ width: `${task.progress}%` }}
                        transition={{ duration: 0.5, ease: "easeInOut" }}
                      />
                    </div>
                    {task.estimatedTimeRemaining && (
                      <div className="mt-1 text-xs text-gray-500 flex items-center justify-end">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        {formatTimeRemaining(task.estimatedTimeRemaining)} remaining
                      </div>
                    )}
                  </div>
                )}

                <div className="flex space-x-3">
                  <button
                    onClick={() => onViewTask(task)}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                  >
                    View
                  </button>
                  {task.status === 'failed' && (
                    <motion.button
                      onClick={() => onRetryTask(task.id)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                    >
                      <ArrowPathIcon className="h-4 w-4 mr-1.5" />
                      Retry
                    </motion.button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default ContentTaskList; 