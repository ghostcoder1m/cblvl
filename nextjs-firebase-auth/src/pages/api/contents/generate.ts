import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../../firebaseAdmin';
import { verifyIdToken } from '../../../utils/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Google Generative AI with your API key
const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error('GOOGLE_API_KEY is not configured in environment variables');
}

const genAI = new GoogleGenerativeAI(apiKey || '');

interface ContentGenerationRequest {
  topic: string;
  format: 'article' | 'blog_post' | 'social_media';
  targetAudience: string;
  style: string;
  keywords: string[];
  additionalInstructions?: string;
}

async function generateContent(params: ContentGenerationRequest): Promise<string> {
  const { topic, format, targetAudience, style, keywords, additionalInstructions } = params;

  // Create a detailed prompt based on the format
  let prompt = '';
  switch (format) {
    case 'article':
      prompt = `You are a professional technology journalist writing an in-depth feature article about the AI Revolution. Write for technology professionals and business leaders.

Topic: AI Revolution: Transforming Industries and Shaping the Future

Key requirements:
1. Write in an analytical and authoritative style
2. Include recent statistics, research findings, and expert quotes
3. Present balanced viewpoints and factual information
4. Structure the article with clear sections and subsections
5. Naturally incorporate these key terms: artificial intelligence, machine learning, digital transformation, industry disruption, AI ethics, technological innovation, future of work, AI adoption, deep learning, neural networks

The article should:
- Start with an attention-grabbing headline and subheading
- Begin with a "Latest Global Trends" section that analyzes current world events and news across different sectors:
  * Major geopolitical developments
  * Economic trends and market shifts
  * Social and cultural movements
  * Environmental and climate developments
  * Healthcare and public health situations
  * Technology breakthroughs beyond AI
  * Education and workforce changes
  * Media and entertainment evolution
- Then connect these trends to how AI is impacting or could impact each area
- Include 6-8 main sections with clear subheadings
- Feature expert quotes and perspectives from industry leaders
- Include relevant statistics and research findings
- Provide real-world examples and case studies
- Address both opportunities and challenges
- End with implications for the future

Required sections:
1. Latest Global Trends and Their AI Implications
2. Introduction and Current State of AI
3. Recent Breakthroughs and Technical Developments
4. Industry Applications and Case Studies
5. Economic and Workforce Impact
6. Ethical Considerations and Challenges
7. Future Outlook and Predictions
8. Expert Perspectives and Insights
9. Conclusion and Call to Action

Additional requirements:
- Minimum 2500 words
- Include specific examples for each industry mentioned
- Reference recent global developments from 2024
- Analyze how AI intersects with current world events
- Include regional perspectives and global impact analysis
- Balance technical depth with accessibility
- Include a mix of established companies and innovative startups
- Consider both short-term and long-term implications

Format the output in markdown, following AP style guidelines and proper journalistic structure.`;
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
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (!text) {
        throw new Error('No content generated');
      }

      return text;
    } catch (error: any) {
      // Handle specific API errors
      if (error.message?.includes('403 Forbidden')) {
        throw new Error(`API access denied. Details: ${error.message}`);
      }
      if (error.message?.includes('API_KEY_SERVICE_BLOCKED')) {
        throw new Error('The API key is blocked or has insufficient permissions. Please check API key configuration in Google Cloud Console.');
      }
      throw error;
    }
  } catch (error) {
    console.error('AI Content Generation Error:', error);
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
    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ 
        error: 'Google API key is not configured',
        details: 'Please configure GOOGLE_API_KEY in environment variables'
      });
    }

    const params = req.body as ContentGenerationRequest;

    // Validate required fields
    if (!params.topic || !params.format) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: {
          required: ['topic', 'format'],
          received: { topic: !!params.topic, format: !!params.format }
        }
      });
    }

    try {
      const content = await generateContent(params);
      
      // Create a new content generation task
      const task = {
        userId: decodedToken.uid,
        topic: params.topic,
        format: params.format,
        status: 'completed',
        createdAt: new Date().toISOString(),
        output: content
      };

      // Save the task to Firestore
      await db.collection('contentTasks').add(task);

      return res.status(200).json(task);
    } catch (error: any) {
      // Handle specific API errors with detailed messages
      if (error.message?.includes('403 Forbidden')) {
        return res.status(403).json({
          error: 'API access denied',
          details: 'The Generative Language API is not enabled or the API key lacks necessary permissions. Please check:',
          steps: [
            'Enable the API at: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com',
            'Verify API key permissions in the Google Cloud Console',
            'Ensure billing is enabled for the project'
          ]
        });
      }
      if (error.message?.includes('API_KEY_SERVICE_BLOCKED')) {
        return res.status(403).json({
          error: 'API key service blocked',
          details: 'The API key is blocked or has insufficient permissions.',
          steps: [
            'Check API key restrictions in Google Cloud Console',
            'Verify API key is not restricted from accessing Generative Language API',
            'Create a new API key if necessary'
          ]
        });
      }
      if (error.message?.includes('quota')) {
        return res.status(429).json({
          error: 'API quota exceeded',
          details: 'The project has exceeded its API quota limits.',
          steps: [
            'Check quota usage in Google Cloud Console',
            'Consider upgrading your quota limits',
            'Implement rate limiting if needed'
          ]
        });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Content Generation Error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate content',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
} 