import { Service } from 'typedi';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { InstanceMetric } from '../entities/InstanceMetric.entity';
import { BaseRepository } from './BaseRepository';
import { AppDataSource } from '../config/database';

/**
 * Instance Metric Repository
 *
 * Handles database operations for instance metrics including
 * recording, querying, and aggregating time-series data.
 */
@Service()
export class InstanceMetricRepository extends BaseRepository<InstanceMetric> {
  constructor() {
    super(() => AppDataSource.getRepository(InstanceMetric));
  }

  /**
   * Record a new metric for an instance
   */
  async recordMetric(data: {
    instance_id: string;
    metric_type: 'cpu_usage' | 'memory_usage' | 'message_count' | 'token_usage';
    metric_value: number;
    unit: 'percent' | 'mb' | 'count' | null;
    recorded_at: Date;
  }): Promise<InstanceMetric> {
    const metric = this.repository.create(data);
    return this.repository.save(metric);
  }

  /**
   * Get metrics for a specific instance within a time range
   */
  async findByInstanceAndTimeRange(
    instanceId: string,
    startTime: Date,
    endTime: Date
  ): Promise<InstanceMetric[]> {
    return this.repository.find({
      where: {
        instance_id: instanceId,
        recorded_at: Between(startTime, endTime),
      },
      order: { recorded_at: 'ASC' },
    });
  }

  /**
   * Get latest metrics for a specific instance
   */
  async findLatestByInstance(instanceId: string, limit: number = 100): Promise<InstanceMetric[]> {
    return this.repository.find({
      where: { instance_id: instanceId },
      order: { recorded_at: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get metrics by type for a specific instance
   */
  async findByInstanceAndType(
    instanceId: string,
    metricType: 'cpu_usage' | 'memory_usage' | 'message_count' | 'token_usage',
    startTime: Date,
    endTime: Date
  ): Promise<InstanceMetric[]> {
    return this.repository.find({
      where: {
        instance_id: instanceId,
        metric_type: metricType,
        recorded_at: Between(startTime, endTime),
      },
      order: { recorded_at: 'ASC' },
    });
  }

  /**
   * Aggregate metrics by hour for a specific instance
   */
  async aggregateByHour(
    instanceId: string,
    metricType: 'cpu_usage' | 'memory_usage' | 'message_count' | 'token_usage',
    startTime: Date,
    endTime: Date
  ): Promise<Array<{ hour: Date; avg_value: number; max_value: number; min_value: number }>> {
    const result = await this.repository
      .createQueryBuilder('metric')
      .select([
        "date_trunc('hour', metric.recorded_at) as hour",
        'AVG(metric.metric_value) as avg_value',
        'MAX(metric.metric_value) as max_value',
        'MIN(metric.metric_value) as min_value',
      ])
      .where('metric.instance_id = :instanceId', { instanceId })
      .andWhere('metric.metric_type = :metricType', { metricType })
      .andWhere('metric.recorded_at BETWEEN :startTime AND :endTime', { startTime, endTime })
      .groupBy("date_trunc('hour', metric.recorded_at)")
      .orderBy('hour', 'ASC')
      .getRawMany();

    return result.map((row) => ({
      hour: row.hour,
      avg_value: parseFloat(row.avg_value),
      max_value: parseFloat(row.max_value),
      min_value: parseFloat(row.min_value),
    }));
  }

  /**
   * Aggregate metrics by day for a specific instance
   */
  async aggregateByDay(
    instanceId: string,
    metricType: 'cpu_usage' | 'memory_usage' | 'message_count' | 'token_usage',
    startTime: Date,
    endTime: Date
  ): Promise<Array<{ day: Date; avg_value: number; max_value: number; min_value: number; total_value: number }>> {
    const result = await this.repository
      .createQueryBuilder('metric')
      .select([
        "date_trunc('day', metric.recorded_at) as day",
        'AVG(metric.metric_value) as avg_value',
        'MAX(metric.metric_value) as max_value',
        'MIN(metric.metric_value) as min_value',
        'SUM(metric.metric_value) as total_value',
      ])
      .where('metric.instance_id = :instanceId', { instanceId })
      .andWhere('metric.metric_type = :metricType', { metricType })
      .andWhere('metric.recorded_at BETWEEN :startTime AND :endTime', { startTime, endTime })
      .groupBy("date_trunc('day', metric.recorded_at)")
      .orderBy('day', 'ASC')
      .getRawMany();

    return result.map((row) => ({
      day: row.day,
      avg_value: parseFloat(row.avg_value),
      max_value: parseFloat(row.max_value),
      min_value: parseFloat(row.min_value),
      total_value: parseFloat(row.total_value),
    }));
  }

  /**
   * Get usage statistics for a specific instance and period
   */
  async getUsageStats(
    instanceId: string,
    startTime: Date,
    endTime: Date
  ): Promise<{
    total_messages: number;
    total_tokens: number;
    avg_cpu_usage: number;
    avg_memory_usage: number;
    max_cpu_usage: number;
    max_memory_usage: number;
  }> {
    const result = await this.repository
      .createQueryBuilder('metric')
      .select([
        'metric.metric_type',
        'AVG(metric.metric_value) as avg_value',
        'MAX(metric.metric_value) as max_value',
        'SUM(metric.metric_value) as total_value',
      ])
      .where('metric.instance_id = :instanceId', { instanceId })
      .andWhere('metric.recorded_at BETWEEN :startTime AND :endTime', { startTime, endTime })
      .groupBy('metric.metric_type')
      .getRawMany();

    const stats = {
      total_messages: 0,
      total_tokens: 0,
      avg_cpu_usage: 0,
      avg_memory_usage: 0,
      max_cpu_usage: 0,
      max_memory_usage: 0,
    };

    result.forEach((row) => {
      switch (row.metric_type) {
        case 'message_count':
          stats.total_messages = parseFloat(row.total_value);
          break;
        case 'token_usage':
          stats.total_tokens = parseFloat(row.total_value);
          break;
        case 'cpu_usage':
          stats.avg_cpu_usage = parseFloat(row.avg_value);
          stats.max_cpu_usage = parseFloat(row.max_value);
          break;
        case 'memory_usage':
          stats.avg_memory_usage = parseFloat(row.avg_value);
          stats.max_memory_usage = parseFloat(row.max_value);
          break;
      }
    });

    return stats;
  }

  /**
   * Delete old metrics beyond retention period
   */
  async deleteOldMetrics(beforeDate: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .where('recorded_at < :beforeDate', { beforeDate })
      .execute();

    return result.affected || 0;
  }

  /**
   * Get latest metric value for a specific type
   */
  async getLatestMetric(
    instanceId: string,
    metricType: 'cpu_usage' | 'memory_usage' | 'message_count' | 'token_usage'
  ): Promise<InstanceMetric | null> {
    const result = await this.repository.findOne({
      where: {
        instance_id: instanceId,
        metric_type: metricType,
      },
      order: { recorded_at: 'DESC' },
    });

    return result || null;
  }
}
