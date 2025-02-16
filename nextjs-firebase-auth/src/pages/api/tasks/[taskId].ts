import type { NextApiRequest, NextApiResponse } from 'next';
import { mockTasks } from '../tasks';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { taskId } = req.query;

  if (req.method === 'GET') {
    const task = mockTasks.find(t => t.id === taskId);
    if (task) {
      res.status(200).json(task);
    } else {
      res.status(404).json({ message: 'Task not found' });
    }
  } else if (req.method === 'POST' && req.url?.includes('/retry')) {
    const task = mockTasks.find(t => t.id === taskId);
    if (task) {
      task.status = 'processing';
      task.progress = 0;
      res.status(200).json(task);
    } else {
      res.status(404).json({ message: 'Task not found' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 