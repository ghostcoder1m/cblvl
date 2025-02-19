import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../../firebaseAdmin';
import { verifyIdToken } from '../../../utils/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Google Generative AI with your API key
const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
if (!apiKey) {
  console.error('GOOGLE_API_KEY is not configured in environment variables');
  throw new Error('Google API key is not configured. Please set the NEXT_PUBLIC_GOOGLE_API_KEY environment variable.');
}

const genAI = new GoogleGenerativeAI(apiKey);

interface ContentGenerationRequest {
  topic: string;
  format: 'article' | 'blog_post' | 'social_media';
  targetAudience: string;
  style: string;
  keywords: string[];
  additionalInstructions?: string;
}

interface BatchContentGenerationRequest {
  trends: ContentGenerationRequest[];
}

async function generateContent(params: ContentGenerationRequest): Promise<string> {
  const { topic, format, targetAudience, style, keywords, additionalInstructions } = params;

  // Create a detailed prompt based on the format
  let prompt = '';
  switch (format) {
    case 'article':
      prompt = `You are a professional journalist writing an in-depth feature article about ${topic}. Write for ${targetAudience}.

Topic: ${topic}

Key requirements:
1. Write in a ${style} style that engages the reader
2. Include recent statistics, research findings, and expert quotes
3. Present balanced viewpoints and factual information
4. Structure the article with clear sections and subsections
5. Naturally incorporate these key terms: ${keywords.join(', ')}

The article should:
- Start with an attention-grabbing headline and subheading
- Begin with a "Current State" section that analyzes:
  * Latest developments in the field
  * Market trends and industry impact
  * Key players and innovations
  * Challenges and opportunities
- Include 4-6 main sections with clear subheadings
- Feature expert quotes and perspectives
- Include relevant statistics and research findings
- Provide real-world examples and case studies
- Address both benefits and challenges
- End with future implications

Required sections:
1. Introduction and Current State
2. Recent Developments and Trends
3. Industry Impact and Applications
4. Challenges and Opportunities
5. Future Outlook
6. Conclusion

Additional context: ${additionalInstructions || 'Focus on providing valuable insights and actionable information'}

Format the output in markdown, following proper journalistic structure.`;
      break;

    case 'blog_post':
      prompt = `You are an expert blogger writing about ${topic} for ${targetAudience}. Create an engaging, well-researched blog post.

Key requirements:
1. Write in a ${style} tone that connects with the reader
2. Back up claims with data and expert insights
3. Share unique perspectives and analysis
4. Naturally incorporate these key terms: ${keywords.join(', ')}
5. Include real-world examples and case studies

The post should:
- Have an engaging, SEO-friendly headline
- Open with a compelling hook
- Present clear, actionable insights
- Include relevant industry trends
- Feature expert opinions and quotes
- End with discussion points or next steps

Additional context: ${additionalInstructions || 'Focus on practical applications and reader value'}

Format the output in markdown, optimizing for both readability and SEO.`;
      break;

    case 'social_media':
      prompt = `You are a social media expert creating content about ${topic} for ${targetAudience}. Write an engaging, shareable post.

Key requirements:
1. Write in a ${style} tone that resonates with social media users
2. Create scroll-stopping opening lines
3. Include data points or surprising facts
4. Naturally incorporate these key terms: ${keywords.join(', ')}
5. Add relevant hashtags strategically

The post should:
- Grab attention in the first line
- Present valuable information concisely
- Include a clear call-to-action
- Use appropriate emojis sparingly
- End with engaging hashtags

Additional context: ${additionalInstructions || 'Focus on shareability and engagement'}`;
      break;

    default:
      throw new Error('Unsupported content format');
  }

  try {
    // Get the generative model
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-pro',
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
      }
    });

    // Generate content
    try {
      console.log('Generating content for topic:', topic);
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (!text) {
        console.error('No content generated for topic:', topic);
        throw new Error('No content generated');
      }

      return text;
    } catch (error: any) {
      console.error('Generation API Error:', error);
      
      // Handle specific API errors
      if (error.message?.includes('403')) {
        throw new Error('API access denied. Please ensure the API key has access to the Generative Language API and check quota limits.');
      }
      if (error.message?.includes('API_KEY_INVALID')) {
        throw new Error('The provided API key is invalid. Please check your API key configuration.');
      }
      if (error.message?.includes('API_KEY_EXPIRED')) {
        throw new Error('The API key has expired. Please update your API key.');
      }
      if (error.message?.includes('PERMISSION_DENIED')) {
        throw new Error('Permission denied. Please ensure the API key has the necessary permissions and the Generative Language API is enabled.');
      }
      if (error.message?.includes('QUOTA_EXCEEDED')) {
        throw new Error('API quota exceeded. Please check your usage limits in the Google Cloud Console.');
      }
      if (error.message?.includes('RESOURCE_EXHAUSTED')) {
        throw new Error('Resource limits exceeded. Please try again later or check your quota settings.');
      }
      
      // For other errors, include more details
      throw new Error(`Failed to generate content: ${error.message}`);
    }
  } catch (error) {
    console.error('Content Generation Error:', error);
    throw error;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    // Verify authentication
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decodedToken = await verifyIdToken(token);
    if (!decodedToken) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if API key is configured
    if (!process.env.NEXT_PUBLIC_GOOGLE_API_KEY) {
      console.error('Google API key is not configured');
      return res.status(500).json({ 
        error: 'Configuration Error',
        details: 'The Google API key is not configured. Please check your environment variables.'
      });
    }

    // Validate API key format
    if (!process.env.NEXT_PUBLIC_GOOGLE_API_KEY.startsWith('AI')) {
      console.error('Invalid Google API key format');
      return res.status(500).json({ 
        error: 'Configuration Error',
        details: 'The Google API key appears to be invalid. Please check your API key format.'
      });
    }

    const { trends } = req.body as BatchContentGenerationRequest;

    // Validate request
    if (!trends || !Array.isArray(trends) || trends.length === 0) {
      return res.status(400).json({
        error: 'Invalid Request',
        details: 'Request must include an array of trends to generate content for.'
      });
    }

    console.log('Processing content generation for trends:', trends.map(t => t.topic));

    // Generate content for each trend
    const tasks = [];
    let hasSuccessfulGeneration = false;

    for (const trendRequest of trends) {
      try {
        console.log('Starting content generation for trend:', trendRequest.topic);
        const content = await generateContent(trendRequest);
        
        if (!content) {
          throw new Error('No content was generated');
        }

        // Create a task for each trend
        const task = {
          userId: decodedToken.uid,
          topic: trendRequest.topic,
          format: trendRequest.format,
          status: 'completed',
          createdAt: new Date().toISOString(),
          content: content
        };

        // Save the task to Firestore
        const taskRef = await db.collection('contentTasks').add(task);
        console.log('Content generated and saved for trend:', trendRequest.topic);
        tasks.push({ ...task, id: taskRef.id });
        hasSuccessfulGeneration = true;
      } catch (error: any) {
        console.error('Error generating content for trend:', trendRequest.topic, error);
        const errorMessage = error.message || 'Unknown error occurred';
        const failedTask = {
          userId: decodedToken.uid,
          topic: trendRequest.topic,
          format: trendRequest.format,
          status: 'failed',
          createdAt: new Date().toISOString(),
          error: errorMessage
        };
        const taskRef = await db.collection('contentTasks').add(failedTask);
        tasks.push({ ...failedTask, id: taskRef.id });
      }
    }

    if (!hasSuccessfulGeneration) {
      return res.status(500).json({
        error: 'Generation Failed',
        details: 'Failed to generate any content. Please check your API key configuration and try again.',
        tasks
      });
    }

    return res.status(200).json({ tasks });
  } catch (error: any) {
    console.error('Content Generation Error:', error);
    return res.status(500).json({
      error: 'Failed to generate content',
      details: error.message
    });
  }
} 