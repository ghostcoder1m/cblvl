import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import Link from 'next/link';
import VideoFormatModal, { VideoGenerationOptions } from '../components/VideoFormatModal';
import { VideoCameraIcon, PlayIcon, ClockIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { v4 as uuidv4 } from 'uuid';

interface VideoTask {
  id: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  format: string;
  style: string;
  targetAudience: string;
  duration: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  topic: string;
  prompt?: string;
  generationProgress?: number;
}

interface VideoGenerationRequest {
  taskId: string;
  trends: string[];
  format: string;
  style: string;
  targetAudience: string;
  duration: string;
  prompt: string;
  additionalInstructions?: string;
  width: number;
  height: number;
  fps: number;
}

interface VideoGenerationProgress {
  taskId: string;
  progress: number;
  status: string;
  error?: string;
}

const VideoGenerator: React.FC = () => {
  const { user } = useAuth({ requireAuth: true });
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoTasks, setVideoTasks] = useState<VideoTask[]>([]);
  const [selectedTrends, setSelectedTrends] = useState<Set<string>>(new Set());
  const [isFormatModalOpen, setIsFormatModalOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Form state
  const [trends, setTrends] = useState<string[]>([]);
  const [format, setFormat] = useState('youtube_shorts');
  const [style, setStyle] = useState('engaging');
  const [targetAudience, setTargetAudience] = useState('general');
  const [duration, setDuration] = useState('60s');
  const [prompt, setPrompt] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  useEffect(() => {
    if (user) {
      fetchVideoTasks();
    }
  }, [user]);

  // Load selected trends from localStorage
  useEffect(() => {
    const storedTrends = localStorage.getItem('selectedTrendsForVideo');
    if (storedTrends) {
      try {
        const trends = JSON.parse(storedTrends);
        setSelectedTrends(new Set(trends));
        // Clear the stored trends to avoid reloading them on subsequent visits
        localStorage.removeItem('selectedTrendsForVideo');
      } catch (error) {
        console.error('Error loading stored trends:', error);
      }
    }
  }, []);

  const fetchVideoTasks = async () => {
    try {
      if (!user) {
        console.log('No user found, skipping fetch');
        return;
      }

      const token = await user.getIdToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      console.log('Fetching video tasks...');
      const response = await fetch('/api/videos', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('Response status:', response.status);
      const responseText = await response.text();
      console.log('Response text:', responseText);

      if (!response.ok) {
        throw new Error(`Failed to fetch video tasks: ${response.status} ${responseText}`);
      }

      const data = JSON.parse(responseText);
      console.log('Parsed data:', data);
      setVideoTasks(data.videoTasks || []);
    } catch (error: any) {
      console.error('Error fetching video tasks:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
      toast.error(error.message || 'Failed to fetch video tasks');
    } finally {
      setIsLoading(false);
    }
  };

  const connectWebSocket = useCallback((taskId: string) => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsUrl) {
      toast.error('WebSocket URL not configured');
      return;
    }

    const socket = new WebSocket(`${wsUrl}/${taskId}`);

    socket.onopen = () => {
      console.log('WebSocket connected');
    };

    socket.onmessage = (event) => {
      const data: VideoGenerationProgress = JSON.parse(event.data);
      setProgress(data.progress * 100);
      setStatus(data.status);

      if (data.status === 'completed') {
        setIsGenerating(false);
        toast.success('Video generated successfully!');
        socket.close();
      } else if (data.status === 'failed') {
        setIsGenerating(false);
        toast.error(data.error || 'Video generation failed');
        socket.close();
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast.error('Connection error');
      setIsGenerating(false);
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
      setWs(null);
    };

    setWs(socket);
  }, []);

  useEffect(() => {
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [ws]);

  const handleGenerateVideo = async () => {
    try {
      if (!user) {
        toast.error('Please sign in to generate videos');
        return;
      }

      setIsGenerating(true);
      setProgress(0);
      setStatus('starting');

      const taskId = uuidv4();
      const request: VideoGenerationRequest = {
        taskId,
        trends: Array.from(selectedTrends),
        format,
        style,
        targetAudience,
        duration,
        prompt,
        additionalInstructions,
        width: 1920,
        height: 1080,
        fps: 30,
      };

      // Connect WebSocket before making the request
      connectWebSocket(taskId);

      const videoGenerationUrl = process.env.NEXT_PUBLIC_VIDEO_GENERATION_URL;
      if (!videoGenerationUrl) {
        throw new Error('Video generation URL not configured');
      }

      const response = await fetch(`${videoGenerationUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to start video generation: ${errorText}`);
      }

      const result = await response.json();
      if (result.status === 'failed') {
        throw new Error(result.error || 'Failed to start video generation');
      }

    } catch (error) {
      console.error('Video generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate video');
      setIsGenerating(false);
      if (ws) {
        ws.close();
      }
    }
  };

  const formatDuration = (duration: string) => {
    return duration.replace('_', ' ').replace('seconds', 's').replace('minutes', 'm');
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Video Generator</h1>
              <p className="mt-2 text-sm text-gray-600">
                Generate engaging videos from your trending topics.
              </p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => setIsFormatModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                disabled={isGenerating}
              >
                Generate Video
              </button>
              <Link
                href="/trend-finder"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Find New Trends
              </Link>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Trends Selection Section */}
              <div className="bg-white shadow sm:rounded-lg mb-8">
                <div className="px-4 py-5 sm:p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">
                    Select Trends for Video Generation
                  </h2>
                  {selectedTrends.size > 0 ? (
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-2">
                        {Array.from(selectedTrends).map(trend => (
                          <span
                            key={trend}
                            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                          >
                            {trend}
                            <button
                              type="button"
                              onClick={() => {
                                const newTrends = new Set(selectedTrends);
                                newTrends.delete(trend);
                                setSelectedTrends(newTrends);
                              }}
                              className="ml-2 inline-flex items-center p-0.5 rounded-full text-blue-800 hover:bg-blue-200 focus:outline-none"
                            >
                              <span className="sr-only">Remove trend</span>
                              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-4 bg-gray-50 rounded-lg">
                      No trends selected. Visit the Trend Finder to discover and select trends for your videos.
                    </div>
                  )}
                  <div className="mt-4">
                    <Link
                      href="/trend-finder"
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      Find and Select Trends
                    </Link>
                  </div>
                </div>
              </div>

              {/* Video Tasks Section */}
              <div className="bg-white shadow sm:rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">
                    Your Video Tasks
                  </h2>
                  <div className="space-y-6">
                    {videoTasks.length > 0 ? (
                      videoTasks.map((task) => (
                        <div
                          key={task.id}
                          className="border rounded-lg p-6 hover:bg-gray-50 transition-colors duration-200"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <h3 className="text-lg font-medium text-gray-900">
                                  {task.topic}
                                </h3>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  task.status === 'completed'
                                    ? 'bg-green-100 text-green-800'
                                    : task.status === 'generating'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : task.status === 'failed'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                                </span>
                              </div>

                              <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
                                <div className="flex items-center">
                                  <VideoCameraIcon className="flex-shrink-0 mr-1.5 h-5 w-5" />
                                  {task.format}
                                </div>
                                <div className="flex items-center">
                                  <ClockIcon className="flex-shrink-0 mr-1.5 h-5 w-5" />
                                  {formatDuration(task.duration)}
                                </div>
                                <div className="flex items-center">
                                  <UserGroupIcon className="flex-shrink-0 mr-1.5 h-5 w-5" />
                                  {task.targetAudience.split('_').map(word => 
                                    word.charAt(0).toUpperCase() + word.slice(1)
                                  ).join(' ')}
                                </div>
                              </div>

                              {task.status === 'generating' && task.generationProgress !== undefined && (
                                <div className="mt-4">
                                  <div className="relative pt-1">
                                    <div className="flex mb-2 items-center justify-between">
                                      <div>
                                        <span className="text-xs font-semibold inline-block text-blue-600">
                                          Generating Video: {task.generationProgress}%
                                        </span>
                                      </div>
                                    </div>
                                    <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200">
                                      <div 
                                        style={{ width: `${task.generationProgress}%` }}
                                        className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 transition-all duration-500"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}

                              {task.prompt && (
                                <div className="mt-2 text-sm text-gray-500">
                                  <span className="font-medium">AI Prompt:</span> {task.prompt}
                                </div>
                              )}

                              {task.videoUrl && (
                                <div className="mt-4">
                                  <a
                                    href={task.videoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center text-blue-600 hover:text-blue-500"
                                  >
                                    <PlayIcon className="h-5 w-5 mr-2" />
                                    Watch Video
                                  </a>
                                </div>
                              )}

                              {task.error && (
                                <div className="mt-2 text-sm text-red-600">
                                  Error: {task.error}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        No video tasks yet. Start by selecting trends and generating videos!
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <VideoFormatModal
        isOpen={isFormatModalOpen}
        onClose={() => setIsFormatModalOpen(false)}
        onSubmit={handleGenerateVideo}
        selectedTrendsCount={selectedTrends.size}
      />
    </Layout>
  );
};

export default VideoGenerator; 