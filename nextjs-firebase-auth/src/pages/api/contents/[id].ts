import { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '../../../firebaseConfig';
import { db } from '../../../firebaseConfig';
import { verifyIdToken } from '../../../utils/auth';

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

    const { id } = req.query;
    const contentRef = db.collection('contents').doc(id as string);

    switch (req.method) {
      case 'GET':
        const doc = await contentRef.get();
        if (!doc.exists) {
          return res.status(404).json({ message: 'Content not found' });
        }
        return res.status(200).json({ id: doc.id, ...doc.data() });

      case 'PUT':
        const updateData = {
          ...req.body,
          updatedAt: new Date().toISOString(),
          updatedBy: decodedToken.uid,
        };
        
        // Create a new version before updating
        const currentDoc = await contentRef.get();
        if (currentDoc.exists) {
          const versionRef = contentRef.collection('versions').doc();
          await versionRef.set({
            id: versionRef.id,
            content: currentDoc.data()?.content,
            timestamp: new Date().toISOString(),
            author: currentDoc.data()?.updatedBy || decodedToken.uid,
            changes: 'Content updated',
          });
        }

        await contentRef.update(updateData);
        return res.status(200).json({ id, ...updateData });

      case 'DELETE':
        await contentRef.delete();
        return res.status(200).json({ message: 'Content deleted successfully' });

      default:
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
} 