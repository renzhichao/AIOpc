/**
 * MetricsCharts Component
 *
 * Comprehensive metrics visualization for instance monitoring.
 * Displays CPU, Memory, Network I/O, and Disk I/O charts.
 *
 * Features:
 * - Real-time data updates
 * - Multiple time series charts
 * - Responsive design
 * - Customizable time ranges
 * - Interactive tooltips
 */

import React, { useState, useEffect } from 'react';
import { LineChart } from './charts/LineChart';
import type { LineChartData } from './charts/LineChart';
import type { InstanceMetricsResponse, MetricsPeriod } from '../types/metrics';

interface MetricsChartsProps {
  instanceId: string;
  period?: MetricsPeriod;
  refreshInterval?: number; // milliseconds
  height?: number;
}

export const MetricsCharts: React.FC<MetricsChartsProps> = ({
  instanceId,
  period = '30m',
  refreshInterval = 5000,
  height = 250,
}) => {
  const [metricsData, setMetricsData] = useState<InstanceMetricsResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch metrics data from API
   */
  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('access_token') || localStorage.getItem('auth_token');
      const response = await fetch(
        `/api/v1/instances/${instanceId}/metrics?period=${period}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }

      const result: InstanceMetricsResponse = await response.json();
      setMetricsData(result.data);
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
      console.error('Failed to fetch metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Initial fetch and setup refresh interval
   */
  useEffect(() => {
    fetchMetrics();

    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [instanceId, period, refreshInterval]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Transform time series metric to chart data
   */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformToChartData = (metric: any, key: string): LineChartData[] => {
    if (!metric?.data_points) return [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
    return metric.data_points.map((point: any) => ({
      timestamp: point.timestamp,
      [key]: point.value,
    }));
  };

  /**
   * Format bytes to human readable format
   */
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  /**
   * Render loading state
   */
  if (loading && !metricsData) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-lg shadow-md p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
              <div className="h-48 bg-gray-200 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  /**
   * Render error state
   */
  if (error && !metricsData) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center">
          <span className="text-2xl mr-3">❌</span>
          <div>
            <h3 className="text-sm font-semibold text-red-800">加载失败</h3>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const metrics = metricsData?.metrics;

  return (
    <div className="space-y-4">
      {/* CPU Usage Chart */}
      {metrics?.cpu && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">CPU 使用率</h3>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-sm text-gray-600">
                  当前: <strong className="text-indigo-600">{metrics.cpu.current_value.toFixed(1)}%</strong>
                </span>
                <span className="text-sm text-gray-600">
                  平均: <strong>{metrics.cpu.avg_value.toFixed(1)}%</strong>
                </span>
                <span className="text-sm text-gray-600">
                  峰值: <strong>{metrics.cpu.max_value.toFixed(1)}%</strong>
                </span>
              </div>
            </div>
            {loading && (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
            )}
          </div>
          <LineChart
            data={transformToChartData(metrics.cpu, 'CPU 使用率 (%)')}
            series={[
              {
                dataKey: 'CPU 使用率 (%)',
                name: 'CPU 使用率 (%)',
                color: '#3b82f6',
                strokeWidth: 2,
              },
            ]}
            height={height}
          />
        </div>
      )}

      {/* Memory Usage Chart */}
      {metrics?.memory && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">内存使用率</h3>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-sm text-gray-600">
                  当前: <strong className="text-green-600">{metrics.memory.current_value.toFixed(1)}%</strong>
                </span>
                <span className="text-sm text-gray-600">
                  平均: <strong>{metrics.memory.avg_value.toFixed(1)}%</strong>
                </span>
                <span className="text-sm text-gray-600">
                  峰值: <strong>{metrics.memory.max_value.toFixed(1)}%</strong>
                </span>
              </div>
            </div>
            {loading && (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
            )}
          </div>
          <LineChart
            data={transformToChartData(metrics.memory, '内存使用率 (%)')}
            series={[
              {
                dataKey: '内存使用率 (%)',
                name: '内存使用率 (%)',
                color: '#10b981',
                strokeWidth: 2,
              },
            ]}
            height={height}
          />
        </div>
      )}

      {/* Network I/O Chart */}
      {(metrics?.network_rx || metrics?.network_tx) && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">网络 I/O</h3>
              <div className="flex items-center gap-4 mt-1">
                {metrics.network_rx && (
                  <span className="text-sm text-gray-600">
                    接收: <strong className="text-purple-600">
                      {formatBytes(metrics.network_rx.current_value)}/s
                    </strong>
                  </span>
                )}
                {metrics.network_tx && (
                  <span className="text-sm text-gray-600">
                    发送: <strong className="text-blue-600">
                      {formatBytes(metrics.network_tx.current_value)}/s
                    </strong>
                  </span>
                )}
              </div>
            </div>
            {loading && (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
            )}
          </div>
          <LineChart
            data={
              metrics.network_rx && metrics.network_tx
                ? metrics.network_rx.data_points.map((point, index) => ({
                    timestamp: point.timestamp,
                    '接收 (bytes/s)': point.value,
                    '发送 (bytes/s)': metrics.network_tx.data_points[index]?.value || 0,
                  }))
                : transformToChartData(metrics.network_rx || metrics.network_tx, '网络 (bytes/s)')
            }
            series={
              metrics.network_rx && metrics.network_tx
                ? [
                    {
                      dataKey: '接收 (bytes/s)',
                      name: '接收 (bytes/s)',
                      color: '#8b5cf6',
                      strokeWidth: 2,
                    },
                    {
                      dataKey: '发送 (bytes/s)',
                      name: '发送 (bytes/s)',
                      color: '#3b82f6',
                      strokeWidth: 2,
                    },
                  ]
                : [
                    {
                      dataKey: '网络 (bytes/s)',
                      name: '网络 (bytes/s)',
                      color: '#8b5cf6',
                      strokeWidth: 2,
                    },
                  ]
            }
            height={height}
          />
        </div>
      )}

      {/* Disk I/O Chart */}
      {(metrics?.disk_read || metrics?.disk_write) && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">磁盘 I/O</h3>
              <div className="flex items-center gap-4 mt-1">
                {metrics.disk_read && (
                  <span className="text-sm text-gray-600">
                    读取: <strong className="text-yellow-600">
                      {formatBytes(metrics.disk_read.current_value)}/s
                    </strong>
                  </span>
                )}
                {metrics.disk_write && (
                  <span className="text-sm text-gray-600">
                    写入: <strong className="text-orange-600">
                      {formatBytes(metrics.disk_write.current_value)}/s
                    </strong>
                  </span>
                )}
              </div>
            </div>
            {loading && (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-600"></div>
            )}
          </div>
          <LineChart
            data={
              metrics.disk_read && metrics.disk_write
                ? metrics.disk_read.data_points.map((point, index) => ({
                    timestamp: point.timestamp,
                    '读取 (bytes/s)': point.value,
                    '写入 (bytes/s)': metrics.disk_write.data_points[index]?.value || 0,
                  }))
                : transformToChartData(metrics.disk_read || metrics.disk_write, '磁盘 (bytes/s)')
            }
            series={
              metrics.disk_read && metrics.disk_write
                ? [
                    {
                      dataKey: '读取 (bytes/s)',
                      name: '读取 (bytes/s)',
                      color: '#eab308',
                      strokeWidth: 2,
                    },
                    {
                      dataKey: '写入 (bytes/s)',
                      name: '写入 (bytes/s)',
                      color: '#f97316',
                      strokeWidth: 2,
                    },
                  ]
                : [
                    {
                      dataKey: '磁盘 (bytes/s)',
                      name: '磁盘 (bytes/s)',
                      color: '#eab308',
                      strokeWidth: 2,
                    },
                  ]
            }
            height={height}
          />
        </div>
      )}
    </div>
  );
};

export default MetricsCharts;
