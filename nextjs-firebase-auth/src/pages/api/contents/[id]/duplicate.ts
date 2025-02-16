import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../../../firebaseConfig';
import { verifyIdToken } from '../../../../utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }

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
    const doc = await contentRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'Content not found' });
    }

    const originalData = doc.data();
    if (!originalData) {
      return res.status(404).json({ message: 'Content data not found' });
    }

    // Create new content with copied data
    const newContent = {
      ...originalData,
      title: `${originalData.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: decodedToken.uid,
      updatedBy: decodedToken.uid,
      versions: [], // Start with empty version history
    };

    const newDocRef = await db.collection('contents').add(newContent);
    const newDoc = await newDocRef.get();

    return res.status(201).json({
      id: newDoc.id,
      ...newDoc.data()
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
} 