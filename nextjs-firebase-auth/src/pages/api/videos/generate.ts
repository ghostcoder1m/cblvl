import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../../firebaseAdmin';
import { verifyIdToken } from '../../../utils/auth';

const VIDEO_TASKS_COLLECTION = 'video_tasks';
const VIDEO_GENERATION_URL = process.env.NEXT_PUBLIC_VIDEO_GENERATION_URL;

if (!VIDEO_GENERATION_URL) {
  console.error('NEXT_PUBLIC_VIDEO_GENERATION_URL environment variable is not set');
}

interface VideoGenerationRequest {
  trends: string[];
  format: 'tiktok' | 'youtube_shorts' | 'standard';
  style: string;
  targetAudience: string;
  duration: string;
  prompt: string;
  additionalInstructions?: string;
  width: number;
  height: number;
  fps: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!VIDEO_GENERATION_URL) {
    return res.status(500).json({ 
      error: 'Video generation service URL is not configured',
      details: 'NEXT_PUBLIC_VIDEO_GENERATION_URL environment variable is missing'
    });
  }

  try {
    // Verify authentication
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const decodedToken = await verifyIdToken(token);
    if (!decodedToken) {
      return res.status(401).json({ error: 'Invalid authorization token' });
    }

    const requestData = req.body as VideoGenerationRequest;

    // Validate request data
    if (!requestData.trends || requestData.trends.length === 0) {
      return res.status(400).json({ error: 'No trends provided' });
    }

    if (!requestData.prompt) {
      return res.status(400).json({ error: 'No AI prompt provided' });
    }

    // Create a video generation task
    const taskData = {
      userId: decodedToken.uid,
      status: 'pending',
      ...requestData,
      createdAt: new Date().toISOString(),
      topic: requestData.trends[0], // Use first trend as main topic
      generationProgress: 0
    };

    // Save task to Firestore
    const taskRef = await db.collection(VIDEO_TASKS_COLLECTION).add(taskData);

    // Start video generation process
    try {
      // Make request to video generation microservice
      const generationUrl = `${VIDEO_GENERATION_URL}/generate`;
      console.log('Making request to video generation service:', generationUrl);
      
      const response = await fetch(generationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: taskRef.id,
          ...requestData
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Video generation service error:', {
          status: response.status,
          statusText: response.statusText,
          errorText
        });
        throw new Error(`Video generation service error: ${errorText}`);
      }

      // Update task status to generating
      await taskRef.update({
        status: 'generating'
      });

      return res.status(200).json({
        taskId: taskRef.id,
        message: 'Video generation started'
      });
    } catch (error: any) {
      // If microservice call fails, update task status and provide more detailed error
      const errorMessage = error.message || 'Failed to start video generation';
      console.error('Video generation error:', {
        error: error,
        url: VIDEO_GENERATION_URL,
        taskId: taskRef.id
      });

      await taskRef.update({
        status: 'failed',
        error: errorMessage
      });

      return res.status(500).json({
        error: errorMessage,
        details: 'Failed to connect to video generation service. Please ensure the service is running.'
      });
    }
  } catch (error: any) {
    console.error('Generate Video Error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
      details: error.stack
    });
  }
} 