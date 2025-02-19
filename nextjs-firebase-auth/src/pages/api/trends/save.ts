import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../../firebaseAdmin';
import { verifyIdToken } from '../../../utils/auth';

const SAVED_TRENDS_COLLECTION = 'saved_trends';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    // Verify authentication
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }
    
    console.log('Verifying token...');
    const decodedToken = await verifyIdToken(token);
    if (!decodedToken) {
      return res.status(401).json({ error: 'Invalid authorization token' });
    }
    console.log('Token verified for user:', decodedToken.uid);

    const { trends } = req.body;
    if (!trends || !Array.isArray(trends)) {
      return res.status(400).json({ error: 'Trends array is required' });
    }
    console.log('Received trends to save:', trends.length);

    // Save each trend to Firestore
    const batch = db.batch();
    const savedTrends = trends.map(trend => {
      const docRef = db.collection(SAVED_TRENDS_COLLECTION).doc();
      const trendData = {
        ...trend,
        userId: decodedToken.uid,
        savedAt: new Date().toISOString(),
        status: 'pending', // For article generation tracking
      };
      console.log('Saving trend:', { id: docRef.id, ...trendData });
      batch.set(docRef, trendData);
      return {
        id: docRef.id,
        ...trend,
      };
    });

    console.log('Committing batch write...');
    await batch.commit();
    console.log('Batch write completed successfully');

    return res.status(200).json({ 
      message: 'Trends saved successfully',
      savedTrends 
    });
  } catch (error: any) {
    console.error('Save Trends Error:', error);
    // Log the full error details
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      stack: error.stack
    });
    return res.status(500).json({
      error: error.message || 'Internal server error',
      details: error.errors || undefined
    });
  }
} 