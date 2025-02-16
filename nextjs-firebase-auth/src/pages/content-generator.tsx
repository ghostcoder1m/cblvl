import { useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import ContentGenerationForm, { ContentGenerationData } from '../components/ContentGenerationForm';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

export default function ContentGenerator() {
  const router = useRouter();
  const { user } = useAuth({ requireAuth: true });
  const [isLoading, setIsLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);

  const handleGenerateContent = async (data: ContentGenerationData) => {
    setIsLoading(true);
    setGeneratedContent(null);
    
    const maxRetries = 3;
    let retryCount = 0;
    let retryDelay = 5000; // Start with 5 seconds

    const attemptGeneration = async (): Promise<void> => {
      try {
        const response = await fetch('/api/contents/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await user?.getIdToken()}`
          },
          body: JSON.stringify({
            topic: "AI Revolution: Transforming Industries and Shaping the Future",
            format: "article",
            targetAudience: "technology professionals and business leaders",
            style: "analytical and authoritative",
            keywords: [
              "artificial intelligence",
              "machine learning",
              "digital transformation",
              "industry disruption",
              "AI ethics",
              "technological innovation",
              "future of work",
              "AI adoption",
              "deep learning",
              "neural networks"
            ],
            additionalInstructions: "Create a comprehensive, in-depth article that explores the AI revolution from multiple angles, including technical developments, industry applications, expert perspectives, challenges, and future implications. Include recent statistics and research findings."
          })
        });

        const result = await response.json();

        if (!response.ok) {
          // Handle rate limiting and quota errors
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
            if (retryCount < maxRetries) {
              retryCount++;
              const delay = retryAfter * 1000 || retryDelay;
              toast.loading(`Rate limit exceeded. Retrying in ${delay / 1000} seconds...`, { duration: delay });
              await new Promise(resolve => setTimeout(resolve, delay));
              retryDelay *= 2; // Exponential backoff
              return attemptGeneration();
            }
          }
          throw new Error(result.error || 'Failed to generate content');
        }

        // Show success message
        toast.success('Content generated successfully!', { duration: 5000 });
        
        // Store the generated content
        const content = result.output || result.content || result;
        if (!content) {
          throw new Error('No content received from the API');
        }
        setGeneratedContent(content);
        
      } catch (error: any) {
        if (error.message?.includes('quota') && retryCount < maxRetries) {
          retryCount++;
          toast.loading(`API quota exceeded. Retrying in ${retryDelay / 1000} seconds...`, { duration: retryDelay });
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryDelay *= 2; // Exponential backoff
          return attemptGeneration();
        }
        
        console.error('Error generating content:', error);
        const errorMessage = error.message || 'Failed to generate content. Please try again.';
        toast.error(errorMessage, { duration: 5000 });
        throw error;
      }
    };

    try {
      await attemptGeneration();
    } catch (error) {
      // Final error handling after all retries are exhausted
      console.error('All retries failed:', error);
      toast.error('Unable to generate content after multiple attempts. Please try again later.', { duration: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Content Generator</h1>
            <p className="mt-2 text-sm text-gray-600">
              Generate high-quality content using AI.
            </p>
          </div>

          {/* Content Generation Form */}
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Generate Content</h2>
              <ContentGenerationForm
                onSubmit={handleGenerateContent}
                isLoading={isLoading}
              />
            </div>
          </div>

          {/* Generated Content Display */}
          {generatedContent && (
            <div className="bg-white shadow sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Generated Content</h2>
                <div className="prose max-w-none">
                  {generatedContent.split('\n').map((line, index) => {
                    // Check if line is a heading
                    if (line.startsWith('#')) {
                      const level = line.match(/^#+/)[0].length;
                      const text = line.replace(/^#+\s*/, '');
                      const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
                      return (
                        <HeadingTag 
                          key={index} 
                          className={`font-bold ${level === 1 ? 'text-3xl mt-8 mb-6' : level === 2 ? 'text-2xl mt-6 mb-4' : 'text-xl mt-4 mb-3'}`}
                        >
                          {text}
                        </HeadingTag>
                      );
                    }
                    // Check if line is a bullet point
                    if (line.trim().startsWith('*') || line.trim().startsWith('-')) {
                      return (
                        <li key={index} className="ml-4 mb-2">
                          {line.replace(/^[*-]\s*/, '')}
                        </li>
                      );
                    }
                    // Regular paragraph
                    if (line.trim()) {
                      return (
                        <p key={index} className="mb-4">
                          {line}
                        </p>
                      );
                    }
                    // Empty line
                    return <br key={index} />;
                  })}
                </div>
                <div className="mt-6 flex justify-end space-x-4">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedContent);
                      toast.success('Content copied to clipboard!');
                    }}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Copy to Clipboard
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Print Article
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
} 