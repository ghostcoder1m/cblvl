import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export interface VideoGenerationOptions {
  format: 'tiktok' | 'youtube_shorts' | 'standard';
  style: string;
  targetAudience: string;
  duration: string;
  prompt?: string;
  additionalInstructions?: string;
}

interface VideoFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (options: VideoGenerationOptions) => void;
  selectedTrendsCount: number;
}

const VIDEO_FORMATS = [
  { id: 'tiktok', name: 'TikTok', description: 'Vertical, short-form video optimized for TikTok' },
  { id: 'youtube_shorts', name: 'YouTube Shorts', description: 'Vertical, short-form video for YouTube' },
  { id: 'standard', name: 'Standard Video', description: 'Traditional landscape video format' },
] as const;

const VIDEO_STYLES = [
  'entertaining',
  'educational',
  'professional',
  'casual',
  'dramatic',
  'minimalist',
] as const;

const TARGET_AUDIENCES = [
  'general',
  'young_adults',
  'professionals',
  'students',
  'tech_enthusiasts',
  'entrepreneurs',
] as const;

const VIDEO_DURATIONS = [
  '15_seconds',
  '30_seconds',
  '60_seconds',
  '3_minutes',
  '5_minutes',
] as const;

export default function VideoFormatModal({
  isOpen,
  onClose,
  onSubmit,
  selectedTrendsCount,
}: VideoFormatModalProps) {
  const [format, setFormat] = useState<VideoGenerationOptions['format']>('tiktok');
  const [style, setStyle] = useState<typeof VIDEO_STYLES[number]>(VIDEO_STYLES[0]);
  const [targetAudience, setTargetAudience] = useState<typeof TARGET_AUDIENCES[number]>(TARGET_AUDIENCES[0]);
  const [duration, setDuration] = useState<typeof VIDEO_DURATIONS[number]>(VIDEO_DURATIONS[0]);
  const [prompt, setPrompt] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  const handleSubmit = () => {
    onSubmit({
      format,
      style,
      targetAudience,
      duration,
      prompt: prompt.trim(),
      additionalInstructions: additionalInstructions.trim(),
    });
  };

  const formatDurationLabel = (duration: string) => {
    return duration.replace('_', ' ').replace('seconds', 's').replace('minutes', 'm');
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
                      Generate Video for {selectedTrendsCount} Trend{selectedTrendsCount !== 1 ? 's' : ''}
                    </Dialog.Title>
                    
                    <div className="mt-6 space-y-6">
                      {/* Video Format Selection */}
                      <div>
                        <label className="text-sm font-medium text-gray-700">Video Format</label>
                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {VIDEO_FORMATS.map((videoFormat) => (
                            <div
                              key={videoFormat.id}
                              className={`relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none ${
                                format === videoFormat.id
                                  ? 'border-blue-500 ring-2 ring-blue-500'
                                  : 'border-gray-300'
                              }`}
                              onClick={() => setFormat(videoFormat.id as VideoGenerationOptions['format'])}
                            >
                              <div className="flex flex-1">
                                <div className="flex flex-col">
                                  <span className="block text-sm font-medium text-gray-900">
                                    {videoFormat.name}
                                  </span>
                                  <span className="mt-1 flex items-center text-sm text-gray-500">
                                    {videoFormat.description}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Duration Selection */}
                      <div>
                        <label className="text-sm font-medium text-gray-700">Video Duration</label>
                        <select
                          value={duration}
                          onChange={(e) => setDuration(e.target.value as typeof VIDEO_DURATIONS[number])}
                          className="mt-2 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                        >
                          {VIDEO_DURATIONS.map((d) => (
                            <option key={d} value={d}>
                              {formatDurationLabel(d)}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Style Selection */}
                      <div>
                        <label className="text-sm font-medium text-gray-700">Video Style</label>
                        <select
                          value={style}
                          onChange={(e) => setStyle(e.target.value as typeof VIDEO_STYLES[number])}
                          className="mt-2 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                        >
                          {VIDEO_STYLES.map((s) => (
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
                          onChange={(e) => setTargetAudience(e.target.value as typeof TARGET_AUDIENCES[number])}
                          className="mt-2 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                        >
                          {TARGET_AUDIENCES.map((audience) => (
                            <option key={audience} value={audience}>
                              {audience.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* AI Prompt */}
                      <div>
                        <label className="text-sm font-medium text-gray-700">
                          AI Prompt
                        </label>
                        <textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          rows={3}
                          className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          placeholder="Describe how you want the AI to present your content in the video..."
                        />
                        <p className="mt-1 text-sm text-gray-500">
                          Guide the AI on how to present your content. For example: "Create an energetic, fast-paced video with dynamic transitions and engaging visuals."
                        </p>
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
                          placeholder="Any specific requirements or preferences for the video..."
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
                    Generate Video
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