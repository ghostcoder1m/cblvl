import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../../../firebaseConfig';
import { verifyIdToken } from '../../../../utils/auth';
import { Parser } from 'json2csv';
import PDFDocument from 'pdfkit';

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

    const { startDate, endDate, format } = req.query;
    if (!startDate || !endDate || !format) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    if (format !== 'csv' && format !== 'pdf') {
      return res.status(400).json({ message: 'Invalid format. Must be "csv" or "pdf"' });
    }

    // Fetch analytics data
    const analyticsData = await getAnalyticsData(decodedToken.uid, startDate as string, endDate as string);

    // Export based on format
    if (format === 'csv') {
      return exportCSV(res, analyticsData);
    } else {
      return exportPDF(res, analyticsData);
    }
  } catch (error) {
    console.error('Export error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function getAnalyticsData(userId: string, startDate: string, endDate: string) {
  // Get content metrics
  const contentsSnapshot = await db.collection('contents')
    .where('userId', '==', userId)
    .get();

  const contents = contentsSnapshot.docs.map(doc => doc.data());
  const publishedContent = contents.filter(content => content.status === 'published').length;
  const draftContent = contents.filter(content => content.status === 'draft').length;

  // Get engagement metrics
  const viewsSnapshot = await db.collection('contentViews')
    .where('userId', '==', userId)
    .where('timestamp', '>=', startDate)
    .where('timestamp', '<=', endDate)
    .get();

  const views = viewsSnapshot.docs.map(doc => doc.data());
  const totalViews = views.length;
  const averageTimeOnPage = views.reduce((acc, view) => acc + view.duration, 0) / totalViews || 0;
  const bounceRate = views.filter(view => view.duration < 30).length / totalViews || 0;
  const interactionRate = views.filter(view => view.interactions > 0).length / totalViews || 0;

  // Get content performance
  const performanceSnapshot = await db.collection('contentPerformance')
    .where('userId', '==', userId)
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .orderBy('date', 'asc')
    .get();

  const performance = performanceSnapshot.docs.map(doc => doc.data());

  // Get quality metrics
  const qualitySnapshot = await db.collection('contentQuality')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  const quality = qualitySnapshot.empty ? null : qualitySnapshot.docs[0].data();

  return {
    period: {
      startDate,
      endDate,
    },
    contentMetrics: {
      totalContent: contents.length,
      publishedContent,
      draftContent,
    },
    engagementMetrics: {
      totalViews,
      averageTimeOnPage,
      bounceRate,
      interactionRate,
    },
    performance,
    quality,
  };
}

function exportCSV(res: NextApiResponse, data: any) {
  const fields = [
    'Period Start',
    'Period End',
    'Total Content',
    'Published Content',
    'Draft Content',
    'Total Views',
    'Average Time on Page',
    'Bounce Rate',
    'Interaction Rate',
    'Readability Score',
    'SEO Score',
    'Accessibility Score',
    'Performance Score',
  ];

  const csvData = {
    'Period Start': data.period.startDate,
    'Period End': data.period.endDate,
    'Total Content': data.contentMetrics.totalContent,
    'Published Content': data.contentMetrics.publishedContent,
    'Draft Content': data.contentMetrics.draftContent,
    'Total Views': data.engagementMetrics.totalViews,
    'Average Time on Page': Math.round(data.engagementMetrics.averageTimeOnPage) + 's',
    'Bounce Rate': (data.engagementMetrics.bounceRate * 100).toFixed(1) + '%',
    'Interaction Rate': (data.engagementMetrics.interactionRate * 100).toFixed(1) + '%',
    'Readability Score': data.quality?.readability || 0,
    'SEO Score': data.quality?.seo || 0,
    'Accessibility Score': data.quality?.accessibility || 0,
    'Performance Score': data.quality?.performance || 0,
  };

  const parser = new Parser({ fields });
  const csv = parser.parse(csvData);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=analytics.csv');
  return res.status(200).send(csv);
}

function exportPDF(res: NextApiResponse, data: any) {
  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=analytics.pdf');

  // Pipe the PDF to the response
  doc.pipe(res);

  // Add content to the PDF
  doc.fontSize(20).text('Analytics Report', { align: 'center' });
  doc.moveDown();

  // Period
  doc.fontSize(16).text('Report Period');
  doc.fontSize(12).text(`From: ${data.period.startDate}`);
  doc.fontSize(12).text(`To: ${data.period.endDate}`);
  doc.moveDown();

  // Content Metrics
  doc.fontSize(16).text('Content Metrics');
  doc.fontSize(12).text(`Total Content: ${data.contentMetrics.totalContent}`);
  doc.fontSize(12).text(`Published Content: ${data.contentMetrics.publishedContent}`);
  doc.fontSize(12).text(`Draft Content: ${data.contentMetrics.draftContent}`);
  doc.moveDown();

  // Engagement Metrics
  doc.fontSize(16).text('Engagement Metrics');
  doc.fontSize(12).text(`Total Views: ${data.engagementMetrics.totalViews}`);
  doc.fontSize(12).text(`Average Time on Page: ${Math.round(data.engagementMetrics.averageTimeOnPage)}s`);
  doc.fontSize(12).text(`Bounce Rate: ${(data.engagementMetrics.bounceRate * 100).toFixed(1)}%`);
  doc.fontSize(12).text(`Interaction Rate: ${(data.engagementMetrics.interactionRate * 100).toFixed(1)}%`);
  doc.moveDown();

  // Quality Metrics
  if (data.quality) {
    doc.fontSize(16).text('Quality Metrics');
    doc.fontSize(12).text(`Readability Score: ${data.quality.readability}`);
    doc.fontSize(12).text(`SEO Score: ${data.quality.seo}`);
    doc.fontSize(12).text(`Accessibility Score: ${data.quality.accessibility}`);
    doc.fontSize(12).text(`Performance Score: ${data.quality.performance}`);
  }

  // Performance Data
  if (data.performance.length > 0) {
    doc.addPage();
    doc.fontSize(16).text('Daily Performance', { align: 'center' });
    doc.moveDown();

    // Create a table header
    const tableTop = doc.y;
    const columnWidth = 120;
    
    doc.fontSize(12);
    doc.text('Date', doc.x, tableTop);
    doc.text('Views', doc.x + columnWidth, tableTop);
    doc.text('Interactions', doc.x + columnWidth * 2, tableTop);
    doc.text('Shares', doc.x + columnWidth * 3, tableTop);

    // Add table data
    let yPosition = tableTop + 20;
    data.performance.forEach((day: any) => {
      doc.text(day.date, doc.x, yPosition);
      doc.text(day.views.toString(), doc.x + columnWidth, yPosition);
      doc.text(day.interactions.toString(), doc.x + columnWidth * 2, yPosition);
      doc.text(day.shares.toString(), doc.x + columnWidth * 3, yPosition);
      yPosition += 20;
    });
  }

  // Finalize the PDF
  doc.end();
} 