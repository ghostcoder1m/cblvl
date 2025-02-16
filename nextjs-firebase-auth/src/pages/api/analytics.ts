import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../firebaseAdmin';
import { verifyIdToken } from '../../utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
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

    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Missing date range parameters' });
    }

    // Get content metrics
    const contentsSnapshot = await db.collection('contents')
      .where('userId', '==', decodedToken.uid)
      .get();

    const contents = contentsSnapshot.docs.map(doc => doc.data());
    const publishedContent = contents.filter(content => content.status === 'published').length;
    const draftContent = contents.filter(content => content.status === 'draft').length;

    try {
      console.log('Fetching analytics with params:', { startDate, endDate, userId: decodedToken.uid });
      
      // Match existing index structure
      const viewsSnapshot = await db.collection('contentViews')
        .where('userId', '==', decodedToken.uid)
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .orderBy('timestamp', 'desc')
        .orderBy('__name__', 'desc')
        .get();

      console.log('Views query result:', { 
        count: viewsSnapshot.size,
        empty: viewsSnapshot.empty 
      });

      const views = viewsSnapshot.docs.map(doc => doc.data());
      const totalViews = views.length;
      const averageTimeOnPage = views.reduce((acc, view) => acc + (view.duration || 0), 0) / totalViews || 0;
      const bounceRate = views.filter(view => (view.duration || 0) < 30).length / totalViews || 0;
      const interactionRate = views.filter(view => (view.interactions || 0) > 0).length / totalViews || 0;

      // Get content performance over time
      const performanceData = await getContentPerformance(decodedToken.uid, startDate as string, endDate as string);

      // Get content distribution
      const contentTypes = contents.reduce((acc: { [key: string]: number }, content) => {
        const format = content.format || 'unknown';
        acc[format] = (acc[format] || 0) + 1;
        return acc;
      }, {});

      // Get quality metrics
      const qualityMetrics = await getQualityMetrics(decodedToken.uid);

      // Return complete analytics data
      return res.status(200).json({
        contentMetrics: {
          totalContent: contents.length,
          publishedContent,
          draftContent,
          averageQualityScore: qualityMetrics.average || 0
        },
        engagementMetrics: {
          totalViews,
          averageTimeOnPage,
          bounceRate,
          interactionRate
        },
        contentPerformance: performanceData,
        contentDistribution: {
          labels: Object.keys(contentTypes),
          data: Object.values(contentTypes)
        },
        qualityMetrics
      });
    } catch (error: any) {
      if (error.code === 9) { // FAILED_PRECONDITION for missing index
        return res.status(500).json({
          message: 'Missing required index',
          details: 'The analytics query requires a composite index. Please contact the administrator to set up the necessary database indexes.',
          indexCreationLink: error.details
        });
      }
      throw error; // Re-throw other errors to be caught by the outer try-catch
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}

async function getContentPerformance(userId: string, startDate: string, endDate: string) {
  try {
    console.log('Fetching performance data:', { userId, startDate, endDate });
    
    const performanceSnapshot = await db.collection('contentPerformance')
      .where('userId', '==', userId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .orderBy('date', 'asc')
      .orderBy('__name__', 'asc')
      .get();

    const performanceData = performanceSnapshot.docs.map(doc => doc.data());
    
    return {
      dates: performanceData.map(data => data.date),
      views: performanceData.map(data => data.views || 0),
      interactions: performanceData.map(data => data.interactions || 0),
      shares: performanceData.map(data => data.shares || 0),
    };
  } catch (error: any) {
    if (error.code === 9) {
      console.error('Missing index for content performance:', error.details);
      // Return empty data if index is missing
      return {
        dates: [],
        views: [],
        interactions: [],
        shares: [],
      };
    }
    throw error;
  }
}

async function getQualityMetrics(userId: string) {
  try {
    console.log('Fetching quality metrics:', { userId });
    
    const qualitySnapshot = await db.collection('contentQuality')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .orderBy('__name__', 'desc')
      .limit(1)
      .get();

    if (qualitySnapshot.empty) {
      return {
        average: 0,
        readability: 0,
        seo: 0,
        accessibility: 0,
        performance: 0,
      };
    }

    const latestQuality = qualitySnapshot.docs[0].data();
    return {
      average: (latestQuality.readability + latestQuality.seo + latestQuality.accessibility + latestQuality.performance) / 4,
      readability: latestQuality.readability || 0,
      seo: latestQuality.seo || 0,
      accessibility: latestQuality.accessibility || 0,
      performance: latestQuality.performance || 0,
    };
  } catch (error: any) {
    if (error.code === 9) {
      console.error('Missing index for quality metrics:', error.details);
      // Return default values if index is missing
      return {
        average: 0,
        readability: 0,
        seo: 0,
        accessibility: 0,
        performance: 0,
      };
    }
    throw error;
  }
} 