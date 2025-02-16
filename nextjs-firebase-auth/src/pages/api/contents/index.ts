import { NextApiRequest, NextApiResponse } from 'next';
import { db, auth } from '../../../firebaseAdmin';
import { verifyIdToken } from '../../../utils/auth';

// Collection path for contents
const CONTENTS_COLLECTION = 'contents';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verify authentication
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const decodedToken = await verifyIdToken(token);
    if (!decodedToken) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    switch (req.method) {
      case 'GET':
        const { limit = '10' } = req.query;
        const pageSize = Math.min(parseInt(limit as string), 50); // Max 50 items per page

        // Use specific collection reference
        const contentsRef = db.collection(CONTENTS_COLLECTION);
        
        // Query with collection scope
        const query = contentsRef
          .where('userId', '==', decodedToken.uid)
          .orderBy('createdAt', 'desc')
          .limit(pageSize);

        try {
          const snapshot = await query.get();
          const contents = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          return res.status(200).json({
            contents,
            hasMore: contents.length === pageSize
          });
        } catch (queryError: any) {
          if (queryError.code === 'failed-precondition') {
            // Return a more helpful error message with index creation instructions
            return res.status(412).json({
              message: 'This query requires a Firestore index',
              details: 'Please create an index for collection "contents" with fields:',
              fields: [
                { field: 'userId', order: 'ASCENDING' },
                { field: 'createdAt', order: 'DESCENDING' }
              ],
              indexUrl: queryError.message.split('create it here: ')[1]
            });
          }
          throw queryError;
        }

      case 'POST':
        const { title, content, format } = req.body;

        if (!title || !content || !format) {
          return res.status(400).json({ 
            message: 'Missing required fields',
            required: ['title', 'content', 'format'],
            received: { title: !!title, content: !!content, format: !!format }
          });
        }

        const newContent = {
          title,
          content,
          format,
          userId: decodedToken.uid,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: decodedToken.uid,
          updatedBy: decodedToken.uid,
          versions: [],
        };

        // Use specific collection reference for adding new document
        const docRef = await db.collection(CONTENTS_COLLECTION).add(newContent);
        const doc = await docRef.get();

        return res.status(201).json({
          id: doc.id,
          ...doc.data()
        });

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }
  } catch (error: any) {
    // Handle specific Firestore errors
    if (error.code === 'permission-denied') {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    if (error.code === 'not-found') {
      return res.status(404).json({ message: 'Resource not found' });
    }
    
    console.error('API Error:', {
      code: error.code,
      message: error.message,
      details: error.details,
    });

    return res.status(500).json({ 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
} 