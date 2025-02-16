import React, { useState } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface ContentGenerationFormProps {
  onSubmit: (data: ContentGenerationData) => void;
  isLoading?: boolean;
}

export interface ContentGenerationData {
  topic: string;
  format: 'article' | 'blog_post' | 'social_media';
  targetAudience: string;
  style: string;
  keywords: string[];
  additionalInstructions?: string;
}

export default function ContentGenerationForm({ onSubmit, isLoading = false }: ContentGenerationFormProps) {
  const [formData, setFormData] = useState<ContentGenerationData>({
    topic: '',
    format: 'article',
    targetAudience: '',
    style: '',
    keywords: [],
    additionalInstructions: ''
  });

  const [newKeyword, setNewKeyword] = useState('');

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !formData.keywords.includes(newKeyword.trim())) {
      setFormData(prev => ({
        ...prev,
        keywords: [...prev.keywords, newKeyword.trim()]
      }));
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setFormData(prev => ({
      ...prev,
      keywords: prev.keywords.filter(k => k !== keyword)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="topic" className="block text-sm font-medium text-gray-700">
          Topic
        </label>
        <input
          type="text"
          id="topic"
          name="topic"
          required
          value={formData.topic}
          onChange={handleInputChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Enter your topic"
        />
      </div>

      <div>
        <label htmlFor="format" className="block text-sm font-medium text-gray-700">
          Format
        </label>
        <select
          id="format"
          name="format"
          required
          value={formData.format}
          onChange={handleInputChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="article">Article</option>
          <option value="blog_post">Blog Post</option>
          <option value="social_media">Social Media</option>
        </select>
      </div>

      <div>
        <label htmlFor="targetAudience" className="block text-sm font-medium text-gray-700">
          Target Audience
        </label>
        <input
          type="text"
          id="targetAudience"
          name="targetAudience"
          required
          value={formData.targetAudience}
          onChange={handleInputChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="e.g., Professionals, Students, General audience"
        />
      </div>

      <div>
        <label htmlFor="style" className="block text-sm font-medium text-gray-700">
          Writing Style
        </label>
        <input
          type="text"
          id="style"
          name="style"
          required
          value={formData.style}
          onChange={handleInputChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="e.g., Professional, Casual, Technical"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Keywords</label>
        <div className="mt-1 flex space-x-2">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Add a keyword"
          />
          <button
            type="button"
            onClick={handleAddKeyword}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {formData.keywords.map((keyword) => (
            <span
              key={keyword}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
            >
              {keyword}
              <button
                type="button"
                onClick={() => handleRemoveKeyword(keyword)}
                className="ml-1 inline-flex items-center p-0.5 rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-500 focus:outline-none"
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="additionalInstructions" className="block text-sm font-medium text-gray-700">
          Additional Instructions (Optional)
        </label>
        <textarea
          id="additionalInstructions"
          name="additionalInstructions"
          value={formData.additionalInstructions}
          onChange={handleInputChange}
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Any specific requirements or instructions"
        />
      </div>

      <div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Generating...' : 'Generate Content'}
        </button>
      </div>
    </form>
  );
} 