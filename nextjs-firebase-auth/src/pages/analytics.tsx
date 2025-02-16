import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import 'chart.js/auto';
import { motion, HTMLMotionProps } from 'framer-motion';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import apiService from '../services/api';
import { toast } from 'react-hot-toast';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

// Define motion components with proper types
const MotionDiv = motion.div;

interface AnalyticsData {
  contentMetrics: {
    totalContent: number;
    publishedContent: number;
    draftContent: number;
    averageQualityScore: number;
  };
  engagementMetrics: {
    totalViews: number;
    averageTimeOnPage: number;
    bounceRate: number;
    interactionRate: number;
  };
  contentPerformance: {
    dates: string[];
    views: number[];
    interactions: number[];
    shares: number[];
  };
  contentDistribution: {
    labels: string[];
    data: number[];
  };
  qualityMetrics: {
    readabilityScore: number;
    seoScore: number;
    accessibilityScore: number;
    performanceScore: number;
  };
}

export default function Analytics() {
  const { user, loading } = useAuth({ requireAuth: true });
  const router = useRouter();
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [dateRange, setDateRange] = useState('7');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Get date range
        const endDate = endOfDay(new Date());
        const startDate = startOfDay(subDays(endDate, parseInt(dateRange)));
        
        // Updated API call
        const response = await apiService.getAnalytics(
          startDate.toISOString(),
          endDate.toISOString()
        );
        
        setAnalyticsData(response);
      } catch (error: any) {
        console.error('Error fetching analytics:', error);
        const errorMessage = error.response?.data?.details || error.response?.data?.message || error.message;
        setError(errorMessage);
        
        // Show toast notification for index creation if needed
        if (error.response?.data?.indexCreationLink) {
          toast.error(
            <div>
              <p>Missing required database index.</p>
              <a 
                href={error.response.data.indexCreationLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700 underline"
              >
                Click here to create the index
              </a>
            </div>,
            { duration: 10000 }
          );
        } else {
          toast.error(errorMessage);
        }
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      fetchAnalytics();
    }
  }, [user, dateRange]);

  if (loading || !user || !analyticsData) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </Layout>
    );
  }

  const contentPerformanceOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Content Performance Over Time',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const contentPerformanceData = {
    labels: analyticsData.contentPerformance.dates,
    datasets: [
      {
        label: 'Views',
        data: analyticsData.contentPerformance.views,
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
      },
      {
        label: 'Interactions',
        data: analyticsData.contentPerformance.interactions,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
      },
      {
        label: 'Shares',
        data: analyticsData.contentPerformance.shares,
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
    ],
  };

  const contentDistributionData = {
    labels: analyticsData.contentDistribution.labels,
    datasets: [
      {
        data: analyticsData.contentDistribution.data,
        backgroundColor: [
          'rgba(255, 99, 132, 0.5)',
          'rgba(54, 162, 235, 0.5)',
          'rgba(255, 206, 86, 0.5)',
          'rgba(75, 192, 192, 0.5)',
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  const qualityMetricsData = {
    labels: ['Readability', 'SEO', 'Accessibility', 'Performance'],
    datasets: [
      {
        label: 'Score',
        data: [
          analyticsData.qualityMetrics.readabilityScore,
          analyticsData.qualityMetrics.seoScore,
          analyticsData.qualityMetrics.accessibilityScore,
          analyticsData.qualityMetrics.performanceScore,
        ],
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        borderColor: 'rgb(53, 162, 235)',
        borderWidth: 1,
      },
    ],
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-8">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white overflow-hidden shadow rounded-lg"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-blue-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Content</dt>
                    <dd className="text-lg font-semibold text-gray-900">{analyticsData.contentMetrics.totalContent}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </MotionDiv>

          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="bg-white overflow-hidden shadow rounded-lg"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Views</dt>
                    <dd className="text-lg font-semibold text-gray-900">{analyticsData.engagementMetrics.totalViews}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </MotionDiv>

          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="bg-white overflow-hidden shadow rounded-lg"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-yellow-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Avg. Time on Page</dt>
                    <dd className="text-lg font-semibold text-gray-900">
                      {Math.round(analyticsData.engagementMetrics.averageTimeOnPage)}s
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </MotionDiv>

          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="bg-white overflow-hidden shadow rounded-lg"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-purple-500 rounded-md p-3">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Interaction Rate</dt>
                    <dd className="text-lg font-semibold text-gray-900">
                      {(analyticsData.engagementMetrics.interactionRate * 100).toFixed(1)}%
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </MotionDiv>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 mb-8">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.4 }}
            className="bg-white shadow rounded-lg p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Content Performance</h2>
            <Line options={contentPerformanceOptions} data={contentPerformanceData} />
          </MotionDiv>

          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.5 }}
            className="bg-white shadow rounded-lg p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Content Distribution</h2>
            <Doughnut data={contentDistributionData} />
          </MotionDiv>
        </div>

        <MotionDiv
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.6 }}
          className="bg-white shadow rounded-lg p-6"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quality Metrics</h2>
          <Bar
            options={{
              responsive: true,
              plugins: {
                legend: {
                  position: 'top' as const,
                },
                title: {
                  display: true,
                  text: 'Content Quality Scores',
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                },
              },
            }}
            data={qualityMetricsData}
          />
        </MotionDiv>
      </div>
    </Layout>
  );
} 