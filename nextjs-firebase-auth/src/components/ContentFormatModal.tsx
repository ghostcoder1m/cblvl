import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export interface ContentGenerationOptions {
  format: 'article' | 'blog_post' | 'social_media' | 'tweet';
  style: string;
  targetAudience: string;
  additionalInstructions?: string;
}

interface ContentFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (options: ContentGenerationOptions) => void;
  selectedTrendsCount: number;
}

const CONTENT_FORMATS = [
  { id: 'article', name: 'Article', description: 'Long-form, detailed content' },
  { id: 'blog_post', name: 'Blog Post', description: 'Medium-length, engaging content' },
  { id: 'social_media', name: 'Social Media Post', description: 'Short, shareable content' },
  { id: 'tweet', name: 'Tweet', description: 'Very short, concise message' },
] as const;

const CONTENT_STYLES = [
  'informative',
  'casual',
  'professional',
  'entertaining',
  'technical',
  'persuasive',
] as const;

const TARGET_AUDIENCES = [
  'general',
  'professionals',
  'technical',
  'beginners',
  'experts',
  'students',
] as const;

export default function ContentFormatModal({
  isOpen,
  onClose,
  onSubmit,
  selectedTrendsCount,
}: ContentFormatModalProps) {
  const [format, setFormat] = useState<ContentGenerationOptions['format']>('article');
  const [style, setStyle] = useState(CONTENT_STYLES[0]);
  const [targetAudience, setTargetAudience] = useState(TARGET_AUDIENCES[0]);
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  const handleSubmit = () => {
    onSubmit({
      format,
      style,
      targetAudience,
      additionalInstructions: additionalInstructions.trim(),
    });
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                    <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900">
                      Generate Content for {selectedTrendsCount} Trend{selectedTrendsCount !== 1 ? 's' : ''}
                    </Dialog.Title>
                    
                    <div className="mt-6 space-y-6">
                      {/* Content Format Selection */}
                      <div>
                        <label className="text-sm font-medium text-gray-700">Content Format</label>
                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {CONTENT_FORMATS.map((contentFormat) => (
                            <div
                              key={contentFormat.id}
                              className={`relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none ${
                                format === contentFormat.id
                                  ? 'border-blue-500 ring-2 ring-blue-500'
                                  : 'border-gray-300'
                              }`}
                              onClick={() => setFormat(contentFormat.id as ContentGenerationOptions['format'])}
                            >
                              <div className="flex flex-1">
                                <div className="flex flex-col">
                                  <span className="block text-sm font-medium text-gray-900">
                                    {contentFormat.name}
                                  </span>
                                  <span className="mt-1 flex items-center text-sm text-gray-500">
                                    {contentFormat.description}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Style Selection */}
                      <div>
                        <label className="text-sm font-medium text-gray-700">Content Style</label>
                        <select
                          value={style}
                          onChange={(e) => setStyle(e.target.value)}
                          className="mt-2 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                        >
                          {CONTENT_STYLES.map((s) => (
                            <option key={s} value={s}>
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Target Audience Selection */}
                      <div>
                        <label className="text-sm font-medium text-gray-700">Target Audience</label>
                        <select
                          value={targetAudience}
                          onChange={(e) => setTargetAudience(e.target.value)}
                          className="mt-2 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                        >
                          {TARGET_AUDIENCES.map((audience) => (
                            <option key={audience} value={audience}>
                              {audience.charAt(0).toUpperCase() + audience.slice(1)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Additional Instructions */}
                      <div>
                        <label className="text-sm font-medium text-gray-700">
                          Additional Instructions (Optional)
                        </label>
                        <textarea
                          value={additionalInstructions}
                          onChange={(e) => setAdditionalInstructions(e.target.value)}
                          rows={3}
                          className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          placeholder="Any specific requirements or preferences..."
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:ml-3 sm:w-auto"
                    onClick={handleSubmit}
                  >
                    Generate Content
                  </button>
                  <button
                    type="button"
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
} 