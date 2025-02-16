import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../../../../../firebaseConfig';
import { verifyIdToken } from '../../../../../../utils/auth';

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

    const { id, versionId } = req.query;
    const contentRef = db.collection('contents').doc(id as string);
    const versionRef = contentRef.collection('versions').doc(versionId as string);

    // Get the version to revert to
    const versionDoc = await versionRef.get();
    if (!versionDoc.exists) {
      return res.status(404).json({ message: 'Version not found' });
    }

    const versionData = versionDoc.data();
    if (!versionData) {
      return res.status(404).json({ message: 'Version data not found' });
    }

    // Create a new version with the current content before reverting
    const currentDoc = await contentRef.get();
    if (!currentDoc.exists) {
      return res.status(404).json({ message: 'Content not found' });
    }

    const currentData = currentDoc.data();
    if (!currentData) {
      return res.status(404).json({ message: 'Content data not found' });
    }

    // Create a new version with the current content
    const newVersionRef = contentRef.collection('versions').doc();
    await newVersionRef.set({
      id: newVersionRef.id,
      content: currentData.content,
      timestamp: new Date().toISOString(),
      author: decodedToken.uid,
      changes: 'Automatic backup before reverting to previous version',
    });

    // Update the content with the version data
    const updateData = {
      content: versionData.content,
      updatedAt: new Date().toISOString(),
      updatedBy: decodedToken.uid,
    };

    await contentRef.update(updateData);

    // Create a new version entry for the revert action
    const revertVersionRef = contentRef.collection('versions').doc();
    await revertVersionRef.set({
      id: revertVersionRef.id,
      content: versionData.content,
      timestamp: new Date().toISOString(),
      author: decodedToken.uid,
      changes: `Reverted to version from ${new Date(versionData.timestamp).toLocaleString()}`,
    });

    return res.status(200).json({
      message: 'Successfully reverted to previous version',
      content: {
        id: currentDoc.id,
        ...currentData,
        ...updateData,
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
} 