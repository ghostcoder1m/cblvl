import type { NextApiRequest, NextApiResponse } from 'next';
import { mockTasks } from '../index';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { taskId } = req.query;
    const task = mockTasks.find(t => t.id === taskId);

    if (task) {
      task.status = 'processing';
      task.progress = 0;
      res.status(200).json(task);
    } else {
      res.status(404).json({ message: 'Task not found' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 