import { useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

interface TrendResult {
  title: string;
  description: string;
  source: string;
  url: string;
  date: string;
}

export default function TrendFinder() {
  const { user } = useAuth({ requireAuth: true });
  const [isLoading, setIsLoading] = useState(false);
  const [trends, setTrends] = useState<TrendResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!searchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }
    
    setIsLoading(true);
    
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

      if (!response.ok) {
        console.error('API Error:', data);
        throw new Error(data.error || 'Failed to fetch trends');
      }

      setTrends(data.trends);
      toast.success('Trends discovered successfully!');
    } catch (error: any) {
      console.error('Error details:', error);
      toast.error(error.message || 'Failed to fetch trends. Please try again.');
    } finally {
      setIsLoading(false);
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
          {trends.length > 0 && (
            <div className="bg-white shadow sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Discovered Trends</h2>
                <div className="space-y-4">
                  {trends.map((trend, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <h3 className="text-lg font-medium text-gray-900">
                        <a href={trend.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">
                          {trend.title}
                        </a>
                      </h3>
                      <p className="mt-1 text-sm text-gray-600">{trend.description}</p>
                      <div className="mt-2 flex items-center text-sm text-gray-500">
                        <span>{trend.source}</span>
                        <span className="mx-2">•</span>
                        <span>{trend.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
} 