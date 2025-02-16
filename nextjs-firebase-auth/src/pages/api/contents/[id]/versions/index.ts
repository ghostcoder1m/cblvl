import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../../../../firebaseConfig';
import { verifyIdToken } from '../../../../../utils/auth';

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

        const versionsSnapshot = await contentRef.collection('versions')
          .orderBy('timestamp', 'desc')
          .get();

        const versions = versionsSnapshot.docs.map(versionDoc => ({
          id: versionDoc.id,
          ...versionDoc.data()
        }));

        return res.status(200).json(versions);

      case 'POST':
        const { content, changes } = req.body;

        if (!content || !changes) {
          return res.status(400).json({ message: 'Missing required fields' });
        }

        const versionRef = contentRef.collection('versions').doc();
        const versionData = {
          id: versionRef.id,
          content,
          changes,
          timestamp: new Date().toISOString(),
          author: decodedToken.uid,
        };

        await versionRef.set(versionData);

        return res.status(201).json(versionData);

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
} 