import { NextApiRequest, NextApiResponse } from 'next';
import { google } from 'googleapis';
import { verifyIdToken } from '../../../utils/auth';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';

const customsearch = google.customsearch('v1');
const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GOOGLE_API_KEY!);

export interface TrendResult {
  trend: string;
  description: string;
  relevance: number;
  sources: Array<{
    title: string;
    url: string;
    source: string;
    date: string;
  }>;
  category: string;
  searchInterest?: number;
}

interface Article {
  title: string;
  snippet: string;
  url: string;
  date: string;
}

async function fetchGoogleTrends(query: string): Promise<any[]> {
  try {
    const response = await axios.get(
      'https://trends.googleapis.com/trends/api/realtimetrends',
      {
        params: {
          hl: 'en-US',
          tz: '-480',
          fi: '0',
          fs: '0',
          geo: 'US',
          ri: '300',
          rs: '20',
          sort: '0'
        },
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}`
        }
      }
    );

    if (!response.data) {
      return [];
    }

    // Remove prefix if present (e.g. ")]}'\n")
    let dataStr = response.data;
    if (typeof dataStr === 'string' && dataStr.startsWith(")]}'")) {
      dataStr = dataStr.slice(dataStr.indexOf('\n'));
    }
    const trendsData = JSON.parse(dataStr);

    const lowerQuery = query.toLowerCase();
    return trendsData.storySummaries.trendingStories
      .filter((story: any) => {
        const content = (story.articleTitle + ' ' + story.entityNames.join(' ')).toLowerCase();
        return content.includes(lowerQuery);
      })
      .map((story: any) => ({
        title: { query: story.articleTitle },
        articles: story.articles.map((article: any) => ({
          articleTitle: article.articleTitle,
          url: article.url,
          snippet: article.snippet,
          timeAgo: article.time
        })),
        formattedTraffic: story.traffic || '1'
      }));
  } catch (error) {
    console.error('Google Trends Error:', error);
    return [];
  }
}

async function fetchCustomSearchResults(query: string, pages = 5): Promise<any[]> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  const cseId = process.env.NEXT_PUBLIC_GOOGLE_CSE_ID;
  let allItems: any[] = [];
  const promises = [];

  for (let i = 0; i < pages; i++) {
    const start = i * 10 + 1;
    promises.push(
      customsearch.cse.list({
        auth: apiKey,
        cx: cseId,
        q: `${query} trending news today`,
        num: 10,
        start,
        dateRestrict: 'd1', // last 24 hours
        sort: 'date',
        fields: 'items(title,snippet,link,displayLink,pagemap(metatags))',
        cr: 'countryUS',
        gl: 'us'
      })
    );
  }

  const responses = await Promise.all(promises);
  responses.forEach(response => {
    if (response.data && response.data.items) {
      allItems.push(...response.data.items);
    }
  });

  return allItems;
}

/**
 * Given the raw data from Google Trends and Custom Search,
 * extract individual articles.
 */
function extractArticles(trendsData: any[], customSearchItems: any[]): Article[] {
  const articles: Article[] = [];
  // Extract from Google Trends data.
  trendsData.forEach(trend => {
    const trendTitle = trend.title.query;
    trend.articles.forEach((article: any) => {
      articles.push({
        title: article.articleTitle || trendTitle,
        snippet: article.snippet || '',
        url: article.url,
        date: article.timeAgo || article.time || new Date().toISOString()
      });
    });
  });
  // Extract from Custom Search results.
  customSearchItems.forEach(item => {
    articles.push({
      title: item.title,
      snippet: item.snippet || '',
      url: item.link,
      date:
        item.pagemap?.metatags?.[0]?.['article:published_time'] ||
        new Date().toISOString()
    });
  });
  return articles;
}

/**
 * Simple helper to determine if two titles are similar.
 * This implementation tokenizes the titles (removing common stop words)
 * and considers them similar if at least 50% of the words in the shorter title match.
 */
function areTitlesSimilar(title1: string, title2: string): boolean {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "with"
  ]);
  const tokenize = (text: string) =>
    text
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word && !stopWords.has(word));

  const words1 = tokenize(title1);
  const words2 = tokenize(title2);
  const set2 = new Set(words2);
  const common = words1.filter(word => set2.has(word));
  const minLen = Math.min(words1.length, words2.length);
  return common.length >= Math.ceil(minLen * 0.5);
}

/**
 * Group similar articles together into a trend.
 */
function groupArticlesIntoTrends(articles: Article[]): TrendResult[] {
  const trends: TrendResult[] = [];

  articles.forEach(article => {
    let added = false;
    for (const trend of trends) {
      if (areTitlesSimilar(trend.trend, article.title)) {
        // Add this article to the existing trend.
        trend.sources.push({
          title: article.title,
          url: article.url,
          source: new URL(article.url).hostname.replace('www.', ''),
          date: article.date
        });
        trend.relevance += 1;
        // Update description if this snippet is longer.
        if (article.snippet.length > trend.description.length) {
          trend.description = article.snippet;
        }
        added = true;
        break;
      }
    }
    if (!added) {
      trends.push({
        trend: article.title,
        description: article.snippet,
        relevance: 1,
        sources: [
          {
            title: article.title,
            url: article.url,
            source: new URL(article.url).hostname.replace('www.', ''),
            date: article.date
          }
        ],
        category: categorizeTrend(article.title, article.snippet)
      });
    }
  });

  return trends;
}

async function analyzeArticlesWithGemini(articles: Article[]): Promise<TrendResult[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  // Split articles into chunks to avoid token limits and get more trends
  const chunkSize = 15;
  const articleChunks = [];
  for (let i = 0; i < articles.length; i += chunkSize) {
    articleChunks.push(articles.slice(i, i + chunkSize));
  }

  const prompt = `Analyze these news articles and identify ALL distinct trending topics/events. For each trend:
1. Identify the core trend/event name (be specific and factual)
2. Write a concise description (1-2 sentences max)
3. Determine the category from these options:
   - Game Results (for match outcomes, scores)
   - Player News (for individual player updates, achievements)
   - Team Updates (for roster changes, team developments)
   - League News (for NBA-wide announcements, rules)
   - Highlights (for standout plays, records, milestones)
4. Calculate relevance (1-5 based on recency, impact, and mention frequency)

Format each trend as JSON:
{
  "trend": "trend name",
  "description": "concise description",
  "category": "category name",
  "relevance": number
}

Important:
- Extract EVERY distinct trend, even if somewhat related
- Be specific with trend names (e.g., "Jokic Triple-Double vs Lakers" rather than just "Jokic Performance")
- Focus on actual events and developments, not general topics
- Ensure each trend is supported by the article content

Return an array of JSON objects for ALL identified trends.`;

  try {
    // Process each chunk of articles with Gemini
    const allTrendPromises = articleChunks.map(async chunk => {
      const articlesText = chunk.map(article => 
        `Title: ${article.title}\nSnippet: ${article.snippet}\nURL: ${article.url}\nDate: ${article.date}\n---`
      ).join('\n');

      const result = await model.generateContent(prompt + `\n\nArticles to analyze:\n${articlesText}`);
      const response = await result.response;
      const text = response.text();
      
      try {
        return JSON.parse(text.substring(
          text.indexOf('['),
          text.lastIndexOf(']') + 1
        ));
      } catch (e) {
        console.error('JSON parsing error:', e);
        return [];
      }
    });

    // Combine all trends from all chunks
    const allTrendObjects = (await Promise.all(allTrendPromises)).flat();

    // Deduplicate trends based on similarity
    const uniqueTrends = new Map<string, any>();
    allTrendObjects.forEach(trend => {
      const existing = Array.from(uniqueTrends.values()).find(t => 
        areTitlesSimilar(t.trend, trend.trend)
      );

      if (!existing || trend.relevance > existing.relevance) {
        uniqueTrends.set(trend.trend, trend);
      }
    });

    // Map trends to our format with sources
    const mappedTrends = Array.from(uniqueTrends.values()).map(trend => {
      // Find relevant source articles for this trend
      const relevantArticles = articles.filter(article =>
        article.title.toLowerCase().includes(trend.trend.toLowerCase()) ||
        article.snippet.toLowerCase().includes(trend.trend.toLowerCase()) ||
        trend.description.toLowerCase().split(' ').some(word => 
          article.title.toLowerCase().includes(word) ||
          article.snippet.toLowerCase().includes(word)
        )
      ).slice(0, 3);

      return {
        trend: trend.trend,
        description: trend.description,
        relevance: trend.relevance,
        category: trend.category,
        sources: relevantArticles.map(article => ({
          title: article.title,
          url: article.url,
          source: new URL(article.url).hostname.replace('www.', ''),
          date: article.date
        }))
      };
    });

    // Sort by relevance and ensure we have enough trends
    return mappedTrends
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 25); // Get top 25 trends
  } catch (error) {
    console.error('Gemini Analysis Error:', error);
    return [];
  }
}

/**
 * Combines both sources, groups similar items into trends,
 * and returns a list of trend topics.
 */
async function extractTrendsFromResults(
  customSearchItems: any[],
  trendsData: any[],
  query: string
): Promise<TrendResult[]> {
  // Gather all individual articles from both sources
  const articles = extractArticles(trendsData, customSearchItems);

  // Use Gemini to analyze articles and extract trends
  const trends = await analyzeArticlesWithGemini(articles);

  // Sort by relevance
  return trends.sort((a, b) => b.relevance - a.relevance);
}

function categorizeTrend(trend: string, description: string): string {
  const content = `${trend} ${description}`.toLowerCase();
  const categories = [
    { name: 'Events', keywords: ['event', 'conference', 'celebration', 'festival'] },
    { name: 'News', keywords: ['news', 'update', 'breaking', 'headline'] },
    { name: 'Technology', keywords: ['tech', 'software', 'hardware', 'innovation'] },
    { name: 'Entertainment', keywords: ['movie', 'music', 'celebrity', 'show'] }
  ];

  for (const category of categories) {
    if (category.keywords.some(keyword => content.includes(keyword))) {
      return category.name;
    }
  }
  return 'General';
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
    // Fetch Google Trends data and multiple pages of Custom Search results.
    const [trendsData, customSearchItems] = await Promise.all([
      fetchGoogleTrends(query),
      fetchCustomSearchResults(query, 5) // 5 pages * 10 results = 50+ items
    ]);

    // Group the articles from both sources into trends.
    const combinedTrends = await extractTrendsFromResults(customSearchItems, trendsData, query);
    return combinedTrends;
  } catch (error: any) {
    console.error('API Error:', error);
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
    // Verify authentication.
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
    console.error('Trend Discovery Error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
      details: error.errors || undefined
    });
  }
}
