import type { NextApiRequest, NextApiResponse } from 'next';

export const mockTasks = [
  {
    id: '1',
    topic: 'Artificial Intelligence Trends 2024',
    status: 'completed',
    createdAt: new Date().toISOString(),
    format: 'article',
    progress: 100,
    keywords: ['AI', 'machine learning', 'trends'],
    targetAudience: 'tech professionals',
    style: 'informative',
  },
  {
    id: '2',
    topic: 'The Future of Remote Work',
    status: 'processing',
    createdAt: new Date().toISOString(),
    format: 'blog_post',
    progress: 60,
    keywords: ['remote work', 'future of work', 'workplace'],
    targetAudience: 'business leaders',
    style: 'professional',
  },
];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    res.status(200).json(mockTasks);
  } else if (req.method === 'POST') {
    const newTask = {
      id: String(Date.now()),
      status: 'pending',
      createdAt: new Date().toISOString(),
      progress: 0,
      ...req.body,
    };
    mockTasks.push(newTask);
    res.status(201).json(newTask);
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 