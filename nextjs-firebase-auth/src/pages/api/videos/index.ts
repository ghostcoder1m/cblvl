import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../../firebaseAdmin';
import { verifyIdToken } from '../../../utils/auth';

const VIDEO_TASKS_COLLECTION = 'video_tasks';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('Received request to /api/videos');
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    // Verify authentication
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      console.error('No authorization token provided');
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    console.log('Verifying token...');
    const decodedToken = await verifyIdToken(token);
    if (!decodedToken) {
      console.error('Invalid authorization token');
      return res.status(401).json({ error: 'Invalid authorization token' });
    }
    console.log('Token verified for user:', decodedToken.uid);

    // Get video tasks for the user
    console.log('Querying Firestore for video tasks...');
    const snapshot = await db.collection(VIDEO_TASKS_COLLECTION)
      .where('userId', '==', decodedToken.uid)
      .orderBy('createdAt', 'desc')
      .get();

    console.log('Found documents:', snapshot.size);
    
    const videoTasks = snapshot.docs.map(doc => {
      const data = doc.data();
      console.log('Processing document:', doc.id);
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        completedAt: data.completedAt?.toDate?.()?.toISOString() || data.completedAt
      };
    });

    console.log('Successfully processed video tasks');
    return res.status(200).json({ videoTasks });
  } catch (error: any) {
    console.error('Get Video Tasks Error:', error);
    // Log the full error details
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      stack: error.stack
    });

    // Check if it's a Firestore error
    if (error.code === 'permission-denied') {
      return res.status(403).json({
        error: 'Permission denied accessing video tasks',
        details: error.message
      });
    }

    return res.status(500).json({
      error: error.message || 'Internal server error',
      details: error.errors || undefined
    });
  }
} 