import { useEffect, useState, useCallback, useRef } from 'react';
import { auth } from '../firebaseConfig';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import Layout from '../components/Layout';
import ContentTaskList from '../components/ContentTaskList';
import ContentGenerationForm from '../components/ContentGenerationForm';
import SystemMetrics from '../components/SystemMetrics';
import apiService from '../services/api';
import { ContentTask, SystemMetrics as SystemMetricsType } from '../types';
import { toast } from 'react-hot-toast';

export default function Dashboard() {
  const router = useRouter();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [tasks, setTasks] = useState<ContentTask[]>([]);
  const [metrics, setMetrics] = useState<SystemMetricsType>({
    cpuUsage: 0,
    memoryUsage: 0,
    queueDepth: 0,
    activeWorkers: 0,
    taskMetrics: {
      total: 0,
      completed: 0,
      failed: 0,
      processing: 0,
    },
    performance: {
      averageProcessingTime: 0,
      successRate: 0,
      contentQualityScore: 0,
    },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    let mounted = true;
    let interval: NodeJS.Timeout;

    const fetchData = async () => {
      try {
        const [tasksData, metricsData] = await Promise.all([
          apiService.getContentTasks(),
          apiService.getSystemMetrics(),
        ]);
        
        if (mounted) {
          setTasks(tasksData);
          setMetrics(metricsData);
          setError(null);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        if (mounted) {
          setError('Failed to fetch data. Please try again later.');
          toast.error('Failed to fetch data. Please try again later.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    interval = setInterval(fetchData, 30000); // Poll every 30 seconds

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleCreateTask = async (data: any) => {
    try {
      const newTask = await apiService.createContentTask({
        topic: data.topic,
        format: data.format,
        targetAudience: data.targetAudience,
        style: data.style,
        keywords: data.keywords,
        additionalInstructions: data.additionalInstructions,
      });
      setTasks((prevTasks) => [newTask, ...prevTasks]);
      setIsFormOpen(false);
      toast.success('Task created successfully!');
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Failed to create task. Please try again.');
    }
  };

  const handleViewTask = async (task: ContentTask) => {
    try {
      const taskDetails = await apiService.getContentTask(task.id);
      // TODO: Show task details in a modal or navigate to a details page
      console.log('Task details:', taskDetails);
    } catch (error) {
      console.error('Error fetching task details:', error);
      toast.error('Failed to fetch task details.');
    }
  };

  const handleRetryTask = async (taskId: string) => {
    try {
      const updatedTask = await apiService.retryContentTask(taskId);
      setTasks((prevTasks) =>
        prevTasks.map((task) => (task.id === taskId ? updatedTask : task))
      );
      toast.success('Task retry initiated.');
    } catch (error) {
      console.error('Error retrying task:', error);
      toast.error('Failed to retry task. Please try again.');
    }
  };

  const filteredTasks = tasks
    .filter(task => {
      const matchesSearch = task.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.keywords?.some(keyword => keyword.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
      const matchesFormat = formatFilter === 'all' || task.format === formatFilter;
      return matchesSearch && matchesStatus && matchesFormat;
    })
    .sort((a, b) => {
      const aValue = a[sortBy as keyof ContentTask];
      const bValue = b[sortBy as keyof ContentTask];
      const order = sortOrder === 'asc' ? 1 : -1;
      return aValue < bValue ? -1 * order : aValue > bValue ? 1 * order : 0;
    });

  const uniqueFormats = Array.from(new Set(tasks.map(task => task.format)));
  const statusOptions = ['all', 'pending', 'processing', 'completed', 'failed'];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="text-red-600 text-xl mb-4">{error}</div>
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              window.location.reload();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">
              <span className="text-blue-600 flex items-center">
                <span className="h-2 w-2 bg-blue-600 rounded-full mr-2" />
                Auto-refreshing every 30 seconds
              </span>
            </p>
          </div>
          <button
            onClick={() => setIsFormOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            New Content Task
          </button>
        </div>

        {/* System Metrics */}
        <SystemMetrics metrics={metrics} />

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow space-y-4">
          <div className="flex flex-wrap gap-4">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="search" className="block text-sm font-medium text-gray-700">
                Search
              </label>
              <input
                type="text"
                id="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by topic or keywords..."
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div className="w-48">
              <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                id="status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                {statusOptions.map(status => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Format Filter */}
            <div className="w-48">
              <label htmlFor="format" className="block text-sm font-medium text-gray-700">
                Format
              </label>
              <select
                id="format"
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All Formats</option>
                {uniqueFormats.map(format => (
                  <option key={format} value={format}>
                    {format.charAt(0).toUpperCase() + format.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort By */}
            <div className="w-48">
              <label htmlFor="sortBy" className="block text-sm font-medium text-gray-700">
                Sort By
              </label>
              <select
                id="sortBy"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="createdAt">Created Date</option>
                <option value="topic">Topic</option>
                <option value="status">Status</option>
                <option value="format">Format</option>
              </select>
            </div>

            {/* Sort Order */}
            <div className="w-48">
              <label htmlFor="sortOrder" className="block text-sm font-medium text-gray-700">
                Sort Order
              </label>
              <select
                id="sortOrder"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
          </div>

          {/* Results Count */}
          <div className="text-sm text-gray-500">
            Showing {filteredTasks.length} of {tasks.length} tasks
          </div>
        </div>

        {/* Content Tasks */}
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">Tasks</h2>
          <ContentTaskList
            tasks={filteredTasks}
            onViewTask={handleViewTask}
            onRetryTask={handleRetryTask}
          />
        </div>

        {/* Content Generation Form Modal */}
        <ContentGenerationForm
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSubmit={handleCreateTask}
        />
      </div>
    </Layout>
  );
}
