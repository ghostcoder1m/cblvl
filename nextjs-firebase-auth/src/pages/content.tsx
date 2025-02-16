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
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import ContentGenerationForm, { ContentGenerationData } from '../components/ContentGenerationForm';
import { HTMLMotionProps } from 'framer-motion';

interface ContentVersion {
  id: string;
  timestamp: string;
  changes: string;
  author: string;
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
}

export default function Content() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/login');
      } else {
        fetchContents();
      }
    });

    return () => unsubscribe();
  }, [router]);

  const fetchContents = async () => {
    try {
      setLoading(true);
      const response = await api.getContents();
      if (Array.isArray(response)) {
        setContents(response);
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
      <div className="flex h-full">
        {/* Content List */}
        <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold">Content Library</h2>
            <button
              onClick={() => setIsGenerateModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Generate Content
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {contents.map((content) => (
                <motion.div
                  key={content.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-4 hover:bg-gray-50"
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{content.title}</h3>
                      <p className="text-sm text-gray-500">
                        {new Date(content.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handlePreview(content)}
                        className="p-1 text-gray-400 hover:text-gray-500"
                      >
                        <EyeIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleEdit(content)}
                        className="p-1 text-gray-400 hover:text-gray-500"
                      >
                        <PencilIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleVersionHistory(content)}
                        className="p-1 text-gray-400 hover:text-gray-500"
                      >
                        <ClockIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(content)}
                        className="p-1 text-gray-400 hover:text-gray-500"
                      >
                        <DocumentDuplicateIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(content)}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Content View/Edit Area */}
        <div className="flex-1 overflow-y-auto">
          {selectedContent ? (
            <div className="h-full">
              {/* Toolbar */}
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-lg font-semibold">{selectedContent.title}</h2>
                <div className="flex space-x-4">
                  {isEditMode ? (
                    <>
                      <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setIsEditMode(false)}
                        className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleEdit(selectedContent)}
                      className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Content Area */}
              <div className="p-6">
                {isEditMode ? (
                  <textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="w-full h-[calc(100vh-250px)] p-4 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                ) : isPreviewMode ? (
                  <div className="prose max-w-none">
                    {selectedContent.content}
                  </div>
                ) : showVersionHistory ? (
                  <div className="space-y-4">
                    {selectedContent.versions.map((version) => (
                      <div
                        key={version.id}
                        className="p-4 border border-gray-200 rounded-md"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium">{version.author}</span>
                          <span className="text-sm text-gray-500">
                            {new Date(version.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{version.changes}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              Select content to view or edit
            </div>
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