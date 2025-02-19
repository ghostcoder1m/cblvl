import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../../firebaseAdmin';
import { verifyIdToken } from '../../../utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verify authentication
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const decodedToken = await verifyIdToken(token);
      if (!decodedToken) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      if (req.method === 'GET') {
        try {
          // Use orderBy now that index is created
          const tasksSnapshot = await db.collection('contentTasks')
            .where('userId', '==', decodedToken.uid)
            .orderBy('createdAt', 'desc')
            .get();

          const tasks = tasksSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          return res.status(200).json(tasks);
        } catch (dbError: any) {
          console.error('Database Error:', dbError);
          return res.status(500).json({
            error: 'Database operation failed',
            details: dbError.message,
            code: dbError.code
          });
        }
      } else if (req.method === 'POST') {
        try {
          const newTask = {
            userId: decodedToken.uid,
            status: 'pending',
            createdAt: new Date().toISOString(),
            progress: 0,
            ...req.body,
          };

          const docRef = await db.collection('contentTasks').add(newTask);
          const task = {
            id: docRef.id,
            ...newTask
          };

          return res.status(201).json(task);
        } catch (dbError: any) {
          console.error('Database Error:', dbError);
          return res.status(500).json({
            error: 'Failed to create task',
            details: dbError.message,
            code: dbError.code
          });
        }
      } else {
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
      }
    } catch (authError: any) {
      console.error('Auth Error:', authError);
      return res.status(401).json({
        error: 'Authentication failed',
        details: authError.message,
        code: authError.code
      });
    }
  } catch (error: any) {
    console.error('Tasks API Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      code: error.code,
      type: error.constructor.name
    });
  }
} 