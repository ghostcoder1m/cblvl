import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import Link from 'next/link';
import ContentFormatModal, { ContentGenerationOptions } from '../components/ContentFormatModal';

interface Task {
  id: string;
  status: string;
  error?: string;
}

interface SavedTrend {
  id: string;
  trend: string;
  description: string;
  relevance: number;
  category: string;
  sources: Array<{
    title: string;
    url: string;
    source: string;
    date: string;
  }>;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  savedAt: string;
  articleId?: string;
}

export default function SavedTrends() {
  const { user } = useAuth({ requireAuth: true });
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [savedTrends, setSavedTrends] = useState<SavedTrend[]>([]);
  const [selectedTrends, setSelectedTrends] = useState<Set<string>>(new Set());
  const [isFormatModalOpen, setIsFormatModalOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSavedTrends();
    }
  }, [user]);

  const fetchSavedTrends = async () => {
    try {
      if (!user) {
        console.log('No user found, skipping fetch');
        return;
      }

      console.log('Fetching saved trends...');
      const token = await user.getIdToken();
      
      if (!token) {
        throw new Error('No authentication token available');
      }
      
      console.log('Got user token:', token ? 'Token present' : 'No token');
      
      const response = await fetch('/api/trends/saved', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      console.log('API Response:', data);
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch saved trends');
      }

      console.log('Setting saved trends:', data.savedTrends?.length || 0, 'trends');
      setSavedTrends(data.savedTrends);
    } catch (error: any) {
      console.error('Error fetching saved trends:', error);
      console.error('Full error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response
      });
      toast.error(error.message || 'Failed to fetch saved trends');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTrendSelection = (id: string) => {
    const newSelected = new Set(selectedTrends);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTrends(newSelected);
  };

  const handleGenerateContent = async (options: ContentGenerationOptions) => {
    if (selectedTrends.size === 0) {
      toast.error('Please select at least one trend');
      return;
    }

    setIsGenerating(true);
    setIsFormatModalOpen(false);

    try {
      const token = await user?.getIdToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      const selectedTrendsData = savedTrends.filter(trend => selectedTrends.has(trend.id));
      
      const response = await fetch('/api/contents/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          trends: selectedTrendsData.map(trend => ({
            topic: trend.trend,
            format: options.format,
            targetAudience: options.targetAudience,
            style: options.style,
            keywords: [trend.category, ...trend.trend.split(' ')],
            additionalInstructions: options.additionalInstructions
              ? `${options.additionalInstructions}. Sources for reference: ${trend.sources.map(s => s.url).join(', ')}`
              : `Use the following sources for reference: ${trend.sources.map(s => s.url).join(', ')}`
          }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        if (errorData?.error === 'Configuration Error') {
          throw new Error(`Configuration Error: ${errorData.details}`);
        }
        throw new Error(
          errorData?.details || 
          `Failed to generate content: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      
      // Check if any tasks failed
      const failedTasks = (data.tasks as Task[]).filter(task => task.status === 'failed');
      if (failedTasks.length > 0) {
        if (failedTasks.length === data.tasks.length) {
          // All tasks failed
          const errors = failedTasks.map(task => task.error).filter(Boolean);
          const uniqueErrors = [...new Set(errors)];
          throw new Error(
            uniqueErrors.length > 0
              ? `Failed to generate content: ${uniqueErrors.join(', ')}`
              : 'Failed to generate any content. Please try again.'
          );
        } else {
          // Some tasks failed, but not all
          toast.error(`${failedTasks.length} out of ${data.tasks.length} items failed to generate. Check the error messages in your dashboard.`);
        }
      } else {
        // All tasks succeeded
        toast.success(`Successfully generated ${data.tasks.length} content items! You can view them in your dashboard.`);
      }

      setSelectedTrends(new Set()); // Clear selections after generating
      fetchSavedTrends(); // Refresh the list to get updated statuses
    } catch (error: any) {
      console.error('Error generating content:', error);
      toast.error(error.message || 'Failed to generate content');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Saved Trends</h1>
              <p className="mt-2 text-sm text-gray-600">
                View your saved trends and generate content.
              </p>
            </div>
            <Link
              href="/trend-finder"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Discover New Trends
            </Link>
          </div>

          {isLoading ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {savedTrends.length > 0 && (
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => setIsFormatModalOpen(true)}
                    disabled={selectedTrends.size === 0 || isGenerating}
                    className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 ${
                      (selectedTrends.size === 0 || isGenerating) ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isGenerating ? 'Generating...' : `Generate Content (${selectedTrends.size})`}
                  </button>
                </div>
              )}

              {savedTrends.length > 0 ? (
                <div className="bg-white shadow sm:rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h2 className="text-lg font-medium text-gray-900 mb-4">
                      Your Saved Trends ({savedTrends.length})
                    </h2>
                    <div className="space-y-6">
                      {savedTrends.map((trend) => (
                        <div 
                          key={trend.id}
                          className={`border rounded-lg p-6 transition-colors ${
                            selectedTrends.has(trend.id)
                              ? 'bg-blue-50 border-blue-200'
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => handleTrendSelection(trend.id)}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <input
                                  type="checkbox"
                                  checked={selectedTrends.has(trend.id)}
                                  onChange={() => handleTrendSelection(trend.id)}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <h3 className="text-xl font-semibold text-gray-900">
                                  {trend.trend}
                                </h3>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {trend.category}
                                </span>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  Relevance: {trend.relevance}
                                </span>
                                {trend.status !== 'pending' && (
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    trend.status === 'completed'
                                      ? 'bg-green-100 text-green-800'
                                      : trend.status === 'generating'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}>
                                    {trend.status.charAt(0).toUpperCase() + trend.status.slice(1)}
                                  </span>
                                )}
                              </div>
                              <p className="mt-2 text-sm text-gray-600">{trend.description}</p>
                              <p className="mt-1 text-xs text-gray-500">
                                Saved on {new Date(trend.savedAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          
                          {/* Sources */}
                          <div className="mt-4">
                            <h4 className="text-sm font-medium text-gray-900 mb-2">Related Sources:</h4>
                            <div className="space-y-2">
                              {trend.sources.map((source, sourceIndex) => (
                                <div key={sourceIndex} className="flex items-center text-sm">
                                  <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {source.title}
                                  </a>
                                  <span className="mx-2 text-gray-400">•</span>
                                  <span className="text-gray-500">{source.source}</span>
                                  <span className="mx-2 text-gray-400">•</span>
                                  <span className="text-gray-500">
                                    {new Date(source.date).toLocaleDateString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Article Link */}
                          {trend.articleId && (
                            <div className="mt-4 pt-4 border-t">
                              <Link
                                href={`/contents/${trend.articleId}`}
                                className="text-blue-600 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                View Generated Article
                              </Link>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500 mt-4">
                  You haven't saved any trends yet. Go to the{' '}
                  <Link href="/trend-finder" className="text-blue-600 hover:underline">
                    Trend Finder
                  </Link>
                  {' '}to discover and save trends.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ContentFormatModal
        isOpen={isFormatModalOpen}
        onClose={() => setIsFormatModalOpen(false)}
        onSubmit={handleGenerateContent}
        selectedTrendsCount={selectedTrends.size}
      />
    </Layout>
  );
} 