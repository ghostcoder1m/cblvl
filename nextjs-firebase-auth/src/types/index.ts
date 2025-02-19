export interface ContentTask {
  id: string;
  topic: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  format: string;
  progress: number;
  keywords?: string[];
  targetAudience?: string;
  style?: string;
  additionalInstructions?: string;
  content?: string;
  output?: string;
  error?: string;
}

export interface ContentGenerationData {
  topic: string;
  format: string;
  targetAudience: string;
  style: string;
  keywords: string[];
  additionalInstructions?: string;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  queueDepth: number;
  activeWorkers: number;
  taskMetrics: {
    total: number;
    completed: number;
    failed: number;
    processing: number;
  };
  performance: {
    averageProcessingTime: number;
    successRate: number;
    contentQualityScore: number;
  };
} 