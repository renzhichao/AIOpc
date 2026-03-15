/**
 * Metrics Service
 *
 * Provides querying and aggregation capabilities for instance metrics.
 * Supports various time ranges and aggregation levels (hour, day).
 *
 * Used by the MetricsController to provide API endpoints for
 * usage statistics, health status, and performance metrics.
 */

import { Service } from 'typedi';
import { InstanceMetricRepository } from '../repositories/InstanceMetricRepository';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { AppError } from '../utils/errors/AppError';
import { logger } from '../config/logger';

export interface UsageStats {
  instance_id: string;
  period: 'hour' | 'day' | 'week' | 'month';
  total_messages: number;
  total_tokens: number;
  avg_cpu_usage: number;
  avg_memory_usage: number;
  max_cpu_usage: number;
  max_memory_usage: number;
  hourly_data?: Array<{
    timestamp: Date;
    cpu_usage: number;
    memory_usage: number;
  }>;
}

export interface HealthStatus {
  instance_id: string;
  healthy: boolean;
  container_status: string;
  cpu_status: 'normal' | 'warning' | 'critical';
  memory_status: 'normal' | 'warning' | 'critical';
  last_check: Date;
}

export interface MetricsTimeSeries {
  metric_type: 'cpu_usage' | 'memory_usage' | 'message_count' | 'token_usage';
  data: Array<{
    timestamp: Date;
    value: number;
  }>;
}

@Service()
export class MetricsService {
  constructor(
    private readonly metricRepository: InstanceMetricRepository,
    private readonly instanceRepository: InstanceRepository
  ) {}

  /**
   * Get usage statistics for an instance
   */
  async getUsageStats(
    instanceId: string,
    period: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<UsageStats> {
    // Verify instance exists
    const instance = await this.instanceRepository.findByInstanceId(instanceId);
    if (!instance) {
      throw new AppError(404, 'INSTANCE_NOT_FOUND', `Instance ${instanceId} not found`);
    }

    // Calculate time range
    const { startTime, endTime } = this.getTimeRange(period);

    // Get usage stats
    const stats = await this.metricRepository.getUsageStats(instanceId, startTime, endTime);

    // Get hourly data for charts
    let hourly_data: Array<{ timestamp: Date; cpu_usage: number; memory_usage: number }> = [];
    if (period === 'hour' || period === 'day') {
      hourly_data = await this.getHourlyData(instanceId, startTime, endTime);
    }

    return {
      instance_id: instanceId,
      period,
      total_messages: stats.total_messages,
      total_tokens: stats.total_tokens,
      avg_cpu_usage: Math.round(stats.avg_cpu_usage * 100) / 100,
      avg_memory_usage: Math.round(stats.avg_memory_usage * 100) / 100,
      max_cpu_usage: Math.round(stats.max_cpu_usage * 100) / 100,
      max_memory_usage: Math.round(stats.max_memory_usage * 100) / 100,
      hourly_data,
    };
  }

  /**
   * Get health status for an instance
   */
  async getHealthStatus(instanceId: string): Promise<HealthStatus> {
    // Verify instance exists
    const instance = await this.instanceRepository.findByInstanceId(instanceId);
    if (!instance) {
      throw new AppError(404, 'INSTANCE_NOT_FOUND', `Instance ${instanceId} not found`);
    }

    // Get latest metrics
    const latestCpu = await this.metricRepository.getLatestMetric(instanceId, 'cpu_usage');
    const latestMemory = await this.metricRepository.getLatestMetric(instanceId, 'memory_usage');

    // Determine health status
    const cpuStatus = this.getResourceStatus(latestCpu?.metric_value || 0, 'cpu');
    const memoryStatus = this.getResourceStatus(latestMemory?.metric_value || 0, 'memory');
    const healthy = cpuStatus !== 'critical' && memoryStatus !== 'critical';

    return {
      instance_id: instanceId,
      healthy,
      container_status: instance.status,
      cpu_status: cpuStatus,
      memory_status: memoryStatus,
      last_check: new Date(),
    };
  }

  /**
   * Get time series data for a specific metric
   */
  async getTimeSeriesData(
    instanceId: string,
    metricType: 'cpu_usage' | 'memory_usage' | 'message_count' | 'token_usage',
    period: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<MetricsTimeSeries> {
    // Verify instance exists
    const instance = await this.instanceRepository.findByInstanceId(instanceId);
    if (!instance) {
      throw new AppError(404, 'INSTANCE_NOT_FOUND', `Instance ${instanceId} not found`);
    }

    // Calculate time range
    const { startTime, endTime } = this.getTimeRange(period);

    // Get metrics data
    const metrics = await this.metricRepository.findByInstanceAndType(
      instanceId,
      metricType,
      startTime,
      endTime
    );

    return {
      metric_type: metricType,
      data: metrics.map((m) => ({
        timestamp: m.recorded_at,
        value: parseFloat(m.metric_value.toString()),
      })),
    };
  }

  /**
   * Get aggregated metrics by hour
   */
  async getHourlyMetrics(
    instanceId: string,
    metricType: 'cpu_usage' | 'memory_usage' | 'message_count' | 'token_usage',
    startTime: Date,
    endTime: Date
  ): Promise<Array<{ hour: Date; avg_value: number; max_value: number; min_value: number }>> {
    return this.metricRepository.aggregateByHour(instanceId, metricType, startTime, endTime);
  }

  /**
   * Get aggregated metrics by day
   */
  async getDailyMetrics(
    instanceId: string,
    metricType: 'cpu_usage' | 'memory_usage' | 'message_count' | 'token_usage',
    startTime: Date,
    endTime: Date
  ): Promise<
    Array<{ day: Date; avg_value: number; max_value: number; min_value: number; total_value: number }>
  > {
    return this.metricRepository.aggregateByDay(instanceId, metricType, startTime, endTime);
  }

  /**
   * Calculate time range based on period
   */
  private getTimeRange(period: 'hour' | 'day' | 'week' | 'month'): { startTime: Date; endTime: Date } {
    const endTime = new Date();
    const startTime = new Date();

    switch (period) {
      case 'hour':
        startTime.setHours(startTime.getHours() - 1);
        break;
      case 'day':
        startTime.setHours(startTime.getHours() - 24);
        break;
      case 'week':
        startTime.setDate(startTime.getDate() - 7);
        break;
      case 'month':
        startTime.setMonth(startTime.getMonth() - 1);
        break;
    }

    return { startTime, endTime };
  }

  /**
   * Get hourly data for charts
   */
  private async getHourlyData(
    instanceId: string,
    startTime: Date,
    endTime: Date
  ): Promise<Array<{ timestamp: Date; cpu_usage: number; memory_usage: number }>> {
    try {
      const cpuData = await this.metricRepository.aggregateByHour(
        instanceId,
        'cpu_usage',
        startTime,
        endTime
      );

      const memoryData = await this.metricRepository.aggregateByHour(
        instanceId,
        'memory_usage',
        startTime,
        endTime
      );

      // Merge CPU and memory data by hour
      const mergedData: Array<{ timestamp: Date; cpu_usage: number; memory_usage: number }> = [];

      cpuData.forEach((cpuPoint) => {
        const memoryPoint = memoryData.find(
          (m) => m.hour.getTime() === cpuPoint.hour.getTime()
        );

        mergedData.push({
          timestamp: cpuPoint.hour,
          cpu_usage: cpuPoint.avg_value,
          memory_usage: memoryPoint?.avg_value || 0,
        });
      });

      return mergedData;
    } catch (error) {
      logger.error('Failed to get hourly data:', error);
      return [];
    }
  }

  /**
   * Determine resource status based on usage
   */
  private getResourceStatus(
    value: number,
    type: 'cpu' | 'memory'
  ): 'normal' | 'warning' | 'critical' {
    const warningThreshold = type === 'cpu' ? 70 : 80;
    const criticalThreshold = type === 'cpu' ? 90 : 95;

    if (value >= criticalThreshold) {
      return 'critical';
    } else if (value >= warningThreshold) {
      return 'warning';
    } else {
      return 'normal';
    }
  }
}
