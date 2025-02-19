import { useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { useRouter } from 'next/router';

interface TrendResult {
  trend: string;
  description: string;
  relevance: number;
  sources: Array<{
    title: string;
    url: string;
    source: string;
    date: string;
  }>;
  category: string;
}

export default function TrendFinder() {
  const { user } = useAuth({ requireAuth: true });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [trends, setTrends] = useState<TrendResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTrends, setSelectedTrends] = useState<Set<number>>(new Set());
  const router = useRouter();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!searchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }
    
    setIsLoading(true);
    setTrends([]); // Clear previous results
    setSelectedTrends(new Set()); // Clear selections
    
    try {
      const token = await user?.getIdToken();
      console.log('Making request with token:', token ? 'Token present' : 'No token');
      
      const response = await fetch('/api/trends/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query: searchQuery })
      });

      const data = await response.json();
      console.log('API Response:', data);

      if (!response.ok) {
        console.error('API Error:', data);
        throw new Error(data.error || 'Failed to fetch trends');
      }

      if (!data.trends || !Array.isArray(data.trends)) {
        console.error('Invalid trends data:', data);
        throw new Error('Invalid response format');
      }

      if (data.trends.length === 0) {
        toast('No trends found for your search query', {
          icon: 'ℹ️',
          duration: 4000
        });
      } else {
        setTrends(data.trends);
        toast.success(`Found ${data.trends.length} trends!`);
      }
    } catch (error: any) {
      console.error('Error details:', error);
      toast.error(error.message || 'Failed to fetch trends. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTrendSelection = (index: number) => {
    const newSelected = new Set(selectedTrends);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTrends(newSelected);
  };

  const handleSaveTrends = async () => {
    if (selectedTrends.size === 0) {
      toast.error('Please select at least one trend to save');
      return;
    }

    setIsSaving(true);
    try {
      const token = await user?.getIdToken();
      const selectedTrendsData = Array.from(selectedTrends).map(index => trends[index]);
      
      const response = await fetch('/api/trends/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ trends: selectedTrendsData })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save trends');
      }

      toast.success('Trends saved successfully!');
      
      // Store selected trends in localStorage for video generation
      localStorage.setItem('selectedTrendsForVideo', JSON.stringify(
        selectedTrendsData.map(trend => trend.trend)
      ));
      
      // Redirect to video generator
      router.push('/video-generator');
    } catch (error: any) {
      console.error('Error saving trends:', error);
      toast.error(error.message || 'Failed to save trends. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Trend Finder</h1>
            <p className="mt-2 text-sm text-gray-600">
              Discover current trends and popular topics in your industry.
            </p>
          </div>

          {/* Search Form */}
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <form onSubmit={handleSearch} className="space-y-4">
                <div>
                  <label htmlFor="search" className="block text-sm font-medium text-gray-700">
                    Search Topic
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="search"
                      id="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      placeholder="Enter a topic to discover trends"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isLoading ? 'Searching...' : 'Search Trends'}
                </button>
              </form>
            </div>
          </div>

          {/* Results Display */}
          {isLoading ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {trends.length > 0 && (
                <div className="flex justify-end mb-4">
                  <button
                    onClick={handleSaveTrends}
                    disabled={selectedTrends.size === 0 || isSaving}
                    className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 ${
                      (selectedTrends.size === 0 || isSaving) ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isSaving ? 'Saving...' : `Save Selected Trends (${selectedTrends.size})`}
                  </button>
                </div>
              )}
              {trends.length > 0 ? (
                <div className="bg-white shadow sm:rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h2 className="text-lg font-medium text-gray-900 mb-4">
                      Discovered Trends ({trends.length})
                    </h2>
                    <div className="space-y-6">
                      {trends.map((trend, index) => (
                        <div 
                          key={index} 
                          className={`border rounded-lg p-6 transition-colors ${
                            selectedTrends.has(index) 
                              ? 'bg-blue-50 border-blue-200' 
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => handleTrendSelection(index)}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <input
                                  type="checkbox"
                                  checked={selectedTrends.has(index)}
                                  onChange={() => handleTrendSelection(index)}
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
                              </div>
                              <p className="mt-2 text-sm text-gray-600">{trend.description}</p>
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
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : searchQuery && (
                <div className="text-center text-gray-500 mt-4">
                  No trends found for "{searchQuery}". Try a different search term.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
} 