import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const mockMetrics = {
      cpuUsage: Math.floor(Math.random() * 100),
      memoryUsage: Math.floor(Math.random() * 100),
      queueDepth: Math.floor(Math.random() * 20),
      activeWorkers: Math.floor(Math.random() * 5) + 1,
      taskMetrics: {
        total: 100,
        completed: 75,
        failed: 5,
        processing: 20,
      },
      performance: {
        averageProcessingTime: Math.floor(Math.random() * 60) + 30,
        successRate: 93,
        contentQualityScore: 85,
      },
    };

    res.status(200).json(mockMetrics);
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 