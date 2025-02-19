import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { auth } from '../firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import {
  PencilIcon,
  EyeIcon,
  ClockIcon,
  ArrowPathIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import ContentGenerationForm, { ContentGenerationData } from '../components/ContentGenerationForm';
import { HTMLMotionProps } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

interface ContentVersion {
  id: string;
  timestamp: string;
  changes: string;
  author: string;
}

interface ContentTask {
  id: string;
  topic: string;
  status: string;
  createdAt: string;
  format: string;
  progress: number;
  keywords?: string[];
  targetAudience?: string;
  style?: string;
  content?: string;
}

interface ContentItem {
  id: string;
  title: string;
  content: string;
  format: string;
  status: string;
  versions: ContentVersion[];
  createdAt: string;
  updatedAt: string;
  isGenerated?: boolean;
  task?: ContentTask;
}

export default function Content() {
  const [loading, setLoading] = useState(true);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [generatedContents, setGeneratedContents] = useState<ContentItem[]>([]);
  const [activeTab, setActiveTab] = useState<'library' | 'generated'>('library');
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const router = useRouter();
  const { user } = useAuth({ requireAuth: true });

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
  }, [user, router]);

  const fetchContents = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const response = await api.getContents();
      if (Array.isArray(response)) {
        setContents(response.filter(content => !content.isGenerated));
      } else {
        console.error('Invalid response format:', response);
        toast.error('Received invalid data format from server');
        setContents([]);
      }
    } catch (error) {
      console.error('Failed to fetch contents:', error);
      toast.error('Failed to fetch contents');
      setContents([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchGeneratedContents = async () => {
    if (!user) return;
    
    try {
      const token = await user.getIdToken();
      
      // Fetch tasks from Firestore
      const response = await fetch('/api/tasks', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }

      const tasks = await response.json();
      console.log('Fetched tasks:', tasks);

      const generatedItems: ContentItem[] = tasks
        .filter(task => task.status === 'completed' && task.content)
        .map(task => ({
          id: task.id,
          title: task.topic,
          content: task.content,
          format: task.format,
          status: task.status,
          versions: [],
          createdAt: task.createdAt,
          updatedAt: task.createdAt,
          isGenerated: true,
          task: task,
        }));

      console.log('Generated items:', generatedItems);
      setGeneratedContents(generatedItems);
    } catch (error) {
      console.error('Failed to fetch generated contents:', error);
      toast.error('Failed to fetch generated contents');
      setGeneratedContents([]);
    }
  };

  useEffect(() => {
    if (user) {
      fetchContents();
      fetchGeneratedContents();
    }
  }, [user, activeTab]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  const displayedContents = activeTab === 'library' ? contents : generatedContents;

  const handleEdit = (content: ContentItem) => {
    setSelectedContent(content);
    setEditedContent(content.content);
    setIsEditMode(true);
    setIsPreviewMode(false);
    setShowVersionHistory(false);
  };

  const handlePreview = (content: ContentItem) => {
    setSelectedContent(content);
    setIsPreviewMode(true);
    setIsEditMode(false);
    setShowVersionHistory(false);
  };

  const handleVersionHistory = (content: ContentItem) => {
    setSelectedContent(content);
    setShowVersionHistory(true);
    setIsPreviewMode(false);
    setIsEditMode(false);
  };

  const handleSave = async () => {
    if (!selectedContent) return;

    try {
      await api.updateContent(selectedContent.id, {
        ...selectedContent,
        content: editedContent,
      });
      toast.success('Content updated successfully');
      fetchContents();
      setIsEditMode(false);
    } catch (error) {
      toast.error('Failed to update content');
    }
  };

  const handleDuplicate = async (content: ContentItem) => {
    try {
      await api.duplicateContent(content.id);
      toast.success('Content duplicated successfully');
      fetchContents();
    } catch (error) {
      toast.error('Failed to duplicate content');
    }
  };

  const handleDelete = async (content: ContentItem) => {
    if (!window.confirm('Are you sure you want to delete this content?')) return;

    try {
      await api.deleteContent(content.id);
      toast.success('Content deleted successfully');
      fetchContents();
    } catch (error) {
      toast.error('Failed to delete content');
    }
  };

  const handleGenerateContent = async (data: ContentGenerationData) => {
    try {
      const task = await api.generateContent(data);
      toast.success('Content generation task created successfully');
      setIsGenerateModalOpen(false);
      fetchContents(); // Refresh the list
    } catch (error: any) {
      console.error('Failed to generate content:', error);
      const errorMessage = error.message || 'Failed to create content generation task';
      toast.error(errorMessage, { duration: 5000 });
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Content</h1>
              <p className="mt-2 text-sm text-gray-600">
                Manage your content library and generated articles.
              </p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('library')}
                className={`${
                  activeTab === 'library'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Library
              </button>
              <button
                onClick={() => setActiveTab('generated')}
                className={`${
                  activeTab === 'generated'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Generated Content
              </button>
            </nav>
          </div>

          {loading ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {displayedContents.length > 0 ? (
                <div className="bg-white shadow sm:rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="space-y-6">
                      {displayedContents.map((content) => (
                        <div
                          key={content.id}
                          className="border rounded-lg p-6 hover:bg-gray-50"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <h3 className="text-xl font-semibold text-gray-900">
                                  {content.title}
                                </h3>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {content.format}
                                </span>
                                {content.isGenerated && (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                    Generated
                                  </span>
                                )}
                              </div>
                              <div className="mt-4 prose max-w-none">
                                {content.content && (
                                  <div dangerouslySetInnerHTML={{ __html: content.content }} />
                                )}
                              </div>
                              <p className="mt-2 text-sm text-gray-500">
                                Created on {new Date(content.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500 mt-4">
                  {activeTab === 'library' ? (
                    <p>No content in your library yet.</p>
                  ) : (
                    <p>No generated content yet. Try generating some articles from your saved trends.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Content Generation Modal */}
      <ContentGenerationForm
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        onSubmit={handleGenerateContent}
      />
    </Layout>
  );
} 