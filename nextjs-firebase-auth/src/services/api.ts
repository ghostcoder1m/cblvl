import axios, { AxiosResponse } from 'axios';
import { ContentTask, SystemMetrics } from '../types';
import { auth } from '../firebaseConfig';
import { toast } from 'react-hot-toast';

interface ContentResponse {
  contents: any[];
  hasMore: boolean;
}

interface AnalyticsData {
  contentMetrics: {
    totalContent: number;
    publishedContent: number;
    draftContent: number;
    averageQualityScore: number;
  };
  engagementMetrics: {
    totalViews: number;
    averageTimeOnPage: number;
    bounceRate: number;
    interactionRate: number;
  };
  contentPerformance: {
    dates: string[];
    views: number[];
    interactions: number[];
    shares: number[];
  };
  contentDistribution: {
    labels: string[];
    data: number[];
  };
  qualityMetrics: {
    readabilityScore: number;
    seoScore: number;
    accessibilityScore: number;
    performanceScore: number;
  };
}

class ApiService {
  private static instance: ApiService;

  private constructor() {}

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('No user logged in');
      }
      return await currentUser.getIdToken();
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  private async request<T>(
    endpoint: string,
    method: string = 'GET',
    data?: any
  ): Promise<T> {
    try {
      const token = await this.getAuthToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      const response: AxiosResponse<T> = await axios({
        method,
        url: `/api${endpoint}`,
        data,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('API request failed:', error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        const message = 'Authentication required. Please log in again.';
        toast.error(message);
        throw new Error(message);
      } else if (error.response?.status === 403) {
        const errorMessage = error.response.data?.details || 
                           error.response.data?.error || 
                           'Access denied. Please check your permissions.';
        toast.error(errorMessage, { duration: 8000 });
        throw new Error(errorMessage);
      } else {
        const errorMessage = error.response?.data?.error || 
                           error.response?.data?.message || 
                           error.message || 
                           'An unexpected error occurred';
        toast.error(errorMessage);
        throw new Error(errorMessage);
      }
    }
  }

  // Content Tasks endpoints
  async getContentTasks(): Promise<ContentTask[]> {
    return this.request<ContentTask[]>('/tasks');
  }

  async getContentTask(taskId: string): Promise<ContentTask> {
    return this.request<ContentTask>(`/tasks/${taskId}`);
  }

  async createContentTask(data: Partial<ContentTask>): Promise<ContentTask> {
    return this.request<ContentTask>('/tasks', 'POST', data);
  }

  async retryContentTask(taskId: string): Promise<ContentTask> {
    return this.request<ContentTask>(`/tasks/${taskId}/retry`, 'POST');
  }

  // System Metrics endpoint
  async getSystemMetrics(): Promise<SystemMetrics> {
    return this.request<SystemMetrics>('/metrics');
  }

  // Content Management
  async getContents(): Promise<any[]> {
    const response = await this.request<ContentResponse>('/contents');
    return response.contents; // Return just the contents array
  }

  async getContent(id: string): Promise<any> {
    return this.request(`/contents/${id}`);
  }

  async createContent(data: any): Promise<any> {
    return this.request('/contents', 'POST', data);
  }

  async updateContent(id: string, data: any): Promise<any> {
    return this.request(`/contents/${id}`, 'PUT', data);
  }

  async deleteContent(id: string): Promise<any> {
    return this.request(`/contents/${id}`, 'DELETE');
  }

  async duplicateContent(id: string): Promise<any> {
    return this.request(`/contents/${id}/duplicate`, 'POST');
  }

  // Content Version Management
  async getContentVersions(id: string): Promise<any[]> {
    return this.request(`/contents/${id}/versions`);
  }

  async revertToVersion(contentId: string, versionId: string): Promise<any> {
    return this.request(`/contents/${contentId}/versions/${versionId}/revert`, 'POST');
  }

  // Analytics
  async getAnalytics(startDate: string, endDate: string): Promise<AnalyticsData> {
    return this.request<AnalyticsData>(`/analytics?startDate=${startDate}&endDate=${endDate}`);
  }

  async exportAnalytics(startDate: string, endDate: string, format: 'csv' | 'pdf'): Promise<Blob> {
    const response = await this.request(`/analytics/export?startDate=${startDate}&endDate=${endDate}&format=${format}`, 'GET', undefined);
    return new Blob([response], { 
      type: format === 'csv' ? 'text/csv' : 'application/pdf' 
    });
  }

  async generateContent(data: {
    topic: string;
    format: string;
    targetAudience?: string;
    style?: string;
    keywords?: string[];
    additionalInstructions?: string;
  }): Promise<ContentTask> {
    return this.request<ContentTask>('/contents/generate', 'POST', data);
  }
}

// Create and export a single instance
const apiService = ApiService.getInstance();
export default apiService;

// Add auth token to requests
axios.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}); 