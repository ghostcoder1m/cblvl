import { NextApiRequest, NextApiResponse } from 'next';
import { google } from 'googleapis';
import { verifyIdToken } from '../../../utils/auth';

const customsearch = google.customsearch('v1');

interface TrendResult {
  title: string;
  description: string;
  source: string;
  url: string;
  date: string;
}

async function fetchTrends(query: string): Promise<TrendResult[]> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  const cseId = process.env.NEXT_PUBLIC_GOOGLE_CSE_ID;

  if (!apiKey) {
    throw new Error('Google API key is not configured');
  }

  if (!cseId) {
    throw new Error('Google Custom Search Engine ID is not configured');
  }

  try {
    console.log('Making CSE request with:', {
      apiKey: apiKey ? 'Present' : 'Missing',
      cseId: cseId ? 'Present' : 'Missing',
      query: query
    });

    const searchResponse = await customsearch.cse.list({
      auth: apiKey,
      cx: cseId,
      q: `${query} trending news today`,
      num: 10,
      dateRestrict: 'd1',
      sort: 'date',
      siteSearch: 'espn.com,nba.com,bleacherreport.com,sports.yahoo.com,cbssports.com',
      siteSearchFilter: 'i',
      fields: 'items(title,snippet,link,displayLink,pagemap,metatags)'
    });

    console.log('Search response:', {
      status: searchResponse.status,
      itemCount: searchResponse.data.items?.length || 0,
      searchInfo: searchResponse.data.searchInformation,
      query: searchResponse.data.queries
    });

    if (!searchResponse.data.items) {
      console.log('No items found in search response');
      return [];
    }

    return searchResponse.data.items.map(item => {
      // Extract the published date from various possible metadata fields
      const publishedDate = 
        item.pagemap?.metatags?.[0]?.['article:published_time'] ||
        item.pagemap?.metatags?.[0]?.['date'] ||
        item.pagemap?.metatags?.[0]?.['og:updated_time'] ||
        new Date().toISOString();

      return {
        title: item.title || '',
        description: item.snippet || '',
        source: item.displayLink || '',
        url: item.link || '',
        date: publishedDate
      };
    });
  } catch (error: any) {
    console.error('Google CSE Error:', {
      message: error.message,
      code: error.code,
      status: error.status,
      details: error.errors
    });
    throw error;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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

    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const trends = await fetchTrends(query);
    return res.status(200).json({ trends });
  } catch (error: any) {
    console.error('Trend Discovery Error:', {
      message: error.message,
      stack: error.stack,
      details: error.errors || error
    });
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: error.errors || undefined
    });
  }
} 