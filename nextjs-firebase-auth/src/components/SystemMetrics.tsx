import {
  CpuChipIcon,
  CircleStackIcon,
  QueueListIcon,
  UserGroupIcon,
  DocumentCheckIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ChartBarIcon,
  DocumentTextIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/outline';

interface SystemMetricsProps {
  metrics: {
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
  };
}

interface MetricCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  suffix?: string;
  color?: 'blue' | 'green' | 'red' | 'yellow';
}

const MetricCard = ({ title, value, icon: Icon, suffix = '', color = 'blue' }: MetricCardProps) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    yellow: 'bg-yellow-50 text-yellow-700',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="ml-5 w-0 flex-1">
          <dl>
            <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
            <dd className="flex items-baseline">
              <div className="text-2xl font-semibold text-gray-900">
                {value.toLocaleString()}
                {suffix}
              </div>
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );
};

const SystemMetrics = ({ metrics }: SystemMetricsProps) => {
  const getResourceColor = (usage: number) => {
    if (usage >= 90) return 'red';
    if (usage >= 75) return 'yellow';
    return 'blue';
  };

  return (
    <div className="space-y-8">
      {/* Resource Usage */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">Resource Usage</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="CPU Usage"
            value={metrics.cpuUsage}
            icon={CpuChipIcon}
            suffix="%"
            color={getResourceColor(metrics.cpuUsage)}
          />
          <MetricCard
            title="Memory Usage"
            value={metrics.memoryUsage}
            icon={CircleStackIcon}
            suffix="%"
            color={getResourceColor(metrics.memoryUsage)}
          />
          <MetricCard
            title="Queue Depth"
            value={metrics.queueDepth}
            icon={QueueListIcon}
            color={metrics.queueDepth > 10 ? 'yellow' : 'blue'}
          />
          <MetricCard
            title="Active Workers"
            value={metrics.activeWorkers}
            icon={UserGroupIcon}
          />
        </div>
      </div>

      {/* Task Statistics */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">Task Statistics</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Tasks"
            value={metrics.taskMetrics.total}
            icon={DocumentTextIcon}
          />
          <MetricCard
            title="Completed Tasks"
            value={metrics.taskMetrics.completed}
            icon={DocumentCheckIcon}
            color="green"
          />
          <MetricCard
            title="Failed Tasks"
            value={metrics.taskMetrics.failed}
            icon={ExclamationTriangleIcon}
            color={metrics.taskMetrics.failed > 0 ? 'red' : 'green'}
          />
          <MetricCard
            title="Processing Tasks"
            value={metrics.taskMetrics.processing}
            icon={ClockIcon}
            color={metrics.taskMetrics.processing > 5 ? 'yellow' : 'blue'}
          />
        </div>
      </div>

      {/* Performance Metrics */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">Performance Metrics</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            title="Avg. Processing Time"
            value={metrics.performance.averageProcessingTime}
            icon={ChartBarIcon}
            suffix="s"
            color={metrics.performance.averageProcessingTime > 60 ? 'yellow' : 'blue'}
          />
          <MetricCard
            title="Success Rate"
            value={metrics.performance.successRate}
            icon={CheckBadgeIcon}
            suffix="%"
            color={metrics.performance.successRate < 95 ? 'yellow' : 'green'}
          />
          <MetricCard
            title="Content Quality Score"
            value={metrics.performance.contentQualityScore}
            icon={DocumentCheckIcon}
            suffix="%"
            color={
              metrics.performance.contentQualityScore >= 80
                ? 'green'
                : metrics.performance.contentQualityScore >= 60
                ? 'yellow'
                : 'red'
            }
          />
        </div>
      </div>
    </div>
  );
};

export default SystemMetrics; 