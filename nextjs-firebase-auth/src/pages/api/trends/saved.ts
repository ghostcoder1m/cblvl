import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../../firebaseAdmin';
import { verifyIdToken } from '../../../utils/auth';

const SAVED_TRENDS_COLLECTION = 'saved_trends';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    // Verify authentication
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }
    
    console.log('Verifying token for saved trends retrieval...');
    const decodedToken = await verifyIdToken(token);
    if (!decodedToken) {
      return res.status(401).json({ error: 'Invalid authorization token' });
    }
    console.log('Token verified for user:', decodedToken.uid);

    // Get saved trends for the user
    console.log('Querying Firestore for saved trends...');
    const snapshot = await db.collection(SAVED_TRENDS_COLLECTION)
      .where('userId', '==', decodedToken.uid)
      .orderBy('savedAt', 'desc')
      .get();

    console.log('Query completed. Found documents:', snapshot.size);
    
    const savedTrends = snapshot.docs.map(doc => {
      const data = doc.data();
      console.log('Retrieved trend:', { id: doc.id, trend: data.trend });
      return {
        id: doc.id,
        ...data
      };
    });

    console.log('Total trends retrieved:', savedTrends.length);
    return res.status(200).json({ savedTrends });
  } catch (error: any) {
    console.error('Get Saved Trends Error:', error);
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