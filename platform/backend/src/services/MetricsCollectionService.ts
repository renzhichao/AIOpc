/**
 * Metrics Collection Service
 *
 * Automatically collects metrics from all active instances every 30 seconds.
 * Uses node-cron to schedule collection tasks.
 *
 * Collected metrics:
 * - Container metrics: CPU, memory, network, disk I/O
 * - Health status: Updates instance health based on metrics
 * - Anomaly detection: Detects high CPU, memory leaks, network issues
 *
 * This service runs as a background job and should be started
 * when the application initializes.
 */

import { Service } from 'typedi';
import * as cron from 'node-cron';
import { InstanceMetricRepository } from '../repositories/InstanceMetricRepository';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { Instance } from '../entities/Instance.entity';
import { DockerService } from './DockerService';
import { logger } from '../config/logger';

// Metrics collection configuration
const METRICS_COLLECTION_INTERVAL = '*/30 * * * * *'; // Every 30 seconds
const METRICS_CLEANUP_SCHEDULE = '0 2 * * *'; // Daily at 2 AM
const METRICS_RETENTION_DAYS = 30;

// Anomaly detection thresholds
const ANOMALY_THRESHOLDS = {
  CPU_CRITICAL: 90, // 90% CPU
  CPU_WARNING: 80, // 80% CPU
  MEMORY_CRITICAL: 95, // 95% memory
  MEMORY_WARNING: 85, // 85% memory
  NETWORK_IDLE_MINUTES: 5, // 5 minutes with no TX
} as const;

@Service()
export class MetricsCollectionService {
  private collectionTask: cron.ScheduledTask | null = null;
  private cleanupTask: cron.ScheduledTask | null = null;
  private lastCollectionTime: Date | null = null;

  constructor(
    private readonly metricRepository: InstanceMetricRepository,
    private readonly instanceRepository: InstanceRepository,
    private readonly dockerService: DockerService
  ) {
    logger.info('MetricsCollectionService initialized');
  }

  /**
   * Start the metrics collection scheduler
   * Runs every 30 seconds for active instances
   * Runs cleanup daily at 2 AM
   */
  startScheduler(): void {
    if (this.collectionTask) {
      logger.warn('Metrics collection scheduler already running');
      return;
    }

    logger.info('Starting metrics collection scheduler (every 30 seconds)');

    // Metrics collection task - every 30 seconds
    this.collectionTask = cron.schedule(METRICS_COLLECTION_INTERVAL, async () => {
      logger.debug('Running scheduled metrics collection');
      await this.collectAllMetrics();
    });

    // Metrics cleanup task - daily at 2 AM
    this.cleanupTask = cron.schedule(METRICS_CLEANUP_SCHEDULE, async () => {
      logger.info('Running scheduled metrics cleanup');
      await this.cleanupOldMetrics();
    });

    // Run initial collection
    this.collectAllMetrics().catch((error) => {
      logger.error('Initial metrics collection failed:', error);
    });

    logger.info('Metrics collection scheduler started');
  }

  /**
   * Stop the metrics collection scheduler
   */
  stopScheduler(): void {
    if (this.collectionTask) {
      logger.info('Stopping metrics collection scheduler');
      this.collectionTask.stop();
      this.collectionTask = null;
    }

    if (this.cleanupTask) {
      logger.info('Stopping metrics cleanup scheduler');
      this.cleanupTask.stop();
      this.cleanupTask = null;
    }

    logger.info('Metrics collection schedulers stopped');
  }

  /**
   * Collect metrics from all active instances
   */
  async collectAllMetrics(): Promise<void> {
    const startTime = Date.now();
    this.lastCollectionTime = new Date();

    try {
      // Get all active instances
      const instances = await this.instanceRepository.findByStatus('running');

      logger.info(`Collecting metrics for ${instances.length} active instances`);

      if (instances.length === 0) {
        logger.debug('No active instances to collect metrics from');
        return;
      }

      // Collect metrics for each instance in parallel
      const collectionPromises = instances.map((instance) =>
        this.collectInstanceMetrics(instance).catch((error) => {
          logger.error(`Failed to collect metrics for instance ${instance.instance_id}:`, error);
          // Don't throw - continue with other instances
        })
      );

      await Promise.all(collectionPromises);

      const duration = Date.now() - startTime;
      logger.info(`Metrics collection completed in ${duration}ms`);
    } catch (error) {
      logger.error('Failed to collect metrics:', error);
    }
  }

  /**
   * Collect all metrics for a specific instance
   * Uses DockerService to get comprehensive container stats
   */
  async collectInstanceMetrics(instance: Instance): Promise<void> {
    const instanceId = instance.instance_id;

    try {
      logger.debug(`Collecting metrics for instance ${instanceId}`);

      // Get container stats from DockerService
      const stats = await this.dockerService.getContainerStats(instanceId);

      // Record all metrics
      await this.recordCpuMetrics(instanceId, stats);
      await this.recordMemoryMetrics(instanceId, stats);
      await this.recordNetworkMetrics(instanceId, stats);
      await this.recordDiskMetrics(instanceId, stats);

      // Update instance health status based on metrics
      await this.updateInstanceHealth(instanceId, stats);

      // Detect and log anomalies
      await this.detectAnomalies(instanceId, stats);

      logger.debug(`Successfully collected metrics for instance ${instanceId}`);
    } catch (error) {
      logger.error(`Failed to collect metrics for instance ${instanceId}:`, error);
      throw error;
    }
  }

  /**
   * Record CPU metrics
   */
  private async recordCpuMetrics(instanceId: string, stats: any): Promise<void> {
    await this.metricRepository.recordMetric({
      instance_id: instanceId,
      metric_type: 'cpu_usage',
      metric_value: stats.cpuPercent,
      unit: 'percent',
      recorded_at: new Date(),
    });

    logger.debug(`Recorded CPU usage for ${instanceId}: ${stats.cpuPercent.toFixed(2)}%`);
  }

  /**
   * Record memory metrics
   */
  private async recordMemoryMetrics(instanceId: string, stats: any): Promise<void> {
    // Record memory usage in MB
    const memoryUsageMB = Math.round((stats.memoryUsage / (1024 * 1024)) * 100) / 100;
    await this.metricRepository.recordMetric({
      instance_id: instanceId,
      metric_type: 'memory_usage',
      metric_value: memoryUsageMB,
      unit: 'mb',
      recorded_at: new Date(),
    });

    // Record memory percentage
    await this.metricRepository.recordMetric({
      instance_id: instanceId,
      metric_type: 'memory_percent',
      metric_value: stats.memoryPercent,
      unit: 'percent',
      recorded_at: new Date(),
    });

    // Record memory limit in MB
    const memoryLimitMB = Math.round((stats.memoryLimit / (1024 * 1024)) * 100) / 100;
    await this.metricRepository.recordMetric({
      instance_id: instanceId,
      metric_type: 'memory_limit',
      metric_value: memoryLimitMB,
      unit: 'mb',
      recorded_at: new Date(),
    });

    logger.debug(
      `Recorded memory usage for ${instanceId}: ${memoryUsageMB}MB / ${memoryLimitMB}MB (${stats.memoryPercent.toFixed(2)}%)`
    );
  }

  /**
   * Record network metrics
   */
  private async recordNetworkMetrics(instanceId: string, stats: any): Promise<void> {
    if (stats.networkRX !== undefined) {
      await this.metricRepository.recordMetric({
        instance_id: instanceId,
        metric_type: 'network_rx_bytes',
        metric_value: stats.networkRX,
        unit: 'bytes',
        recorded_at: new Date(),
      });
    }

    if (stats.networkTX !== undefined) {
      await this.metricRepository.recordMetric({
        instance_id: instanceId,
        metric_type: 'network_tx_bytes',
        metric_value: stats.networkTX,
        unit: 'bytes',
        recorded_at: new Date(),
      });
    }

    logger.debug(
      `Recorded network stats for ${instanceId}: RX=${stats.networkRX || 0} bytes, TX=${stats.networkTX || 0} bytes`
    );
  }

  /**
   * Record disk I/O metrics
   */
  private async recordDiskMetrics(instanceId: string, stats: any): Promise<void> {
    if (stats.blockRead !== undefined) {
      await this.metricRepository.recordMetric({
        instance_id: instanceId,
        metric_type: 'disk_read_bytes',
        metric_value: stats.blockRead,
        unit: 'bytes',
        recorded_at: new Date(),
      });
    }

    if (stats.blockWrite !== undefined) {
      await this.metricRepository.recordMetric({
        instance_id: instanceId,
        metric_type: 'disk_write_bytes',
        metric_value: stats.blockWrite,
        unit: 'bytes',
        recorded_at: new Date(),
      });
    }

    logger.debug(
      `Recorded disk I/O for ${instanceId}: Read=${stats.blockRead || 0} bytes, Write=${stats.blockWrite || 0} bytes`
    );
  }

  /**
   * Update instance health status based on collected metrics
   */
  private async updateInstanceHealth(instanceId: string, stats: any): Promise<void> {
    try {
      let healthStatus = 'healthy';
      let healthReason = 'Instance is running normally';

      // Check CPU usage
      if (stats.cpuPercent >= ANOMALY_THRESHOLDS.CPU_CRITICAL) {
        healthStatus = 'unhealthy';
        healthReason = `Critical CPU usage: ${stats.cpuPercent.toFixed(2)}%`;
      } else if (stats.cpuPercent >= ANOMALY_THRESHOLDS.CPU_WARNING) {
        healthStatus = 'warning';
        healthReason = `High CPU usage: ${stats.cpuPercent.toFixed(2)}%`;
      }

      // Check memory usage
      if (stats.memoryPercent >= ANOMALY_THRESHOLDS.MEMORY_CRITICAL) {
        healthStatus = 'unhealthy';
        healthReason = `Critical memory usage: ${stats.memoryPercent.toFixed(2)}%`;
      } else if (stats.memoryPercent >= ANOMALY_THRESHOLDS.MEMORY_WARNING) {
        healthStatus = 'warning';
        healthReason = `High memory usage: ${stats.memoryPercent.toFixed(2)}%`;
      }

      // Update instance health status
      await this.instanceRepository.update(instanceId, {
        health_status: healthStatus as any,
        health_reason: healthReason,
        health_last_checked: new Date(),
      });

      logger.debug(`Updated health status for ${instanceId}: ${healthStatus} - ${healthReason}`);
    } catch (error) {
      logger.error(`Failed to update health status for instance ${instanceId}:`, error);
    }
  }

  /**
   * Detect and log anomalies based on metrics
   */
  private async detectAnomalies(instanceId: string, stats: any): Promise<void> {
    const anomalies: string[] = [];

    // CPU anomalies
    if (stats.cpuPercent >= ANOMALY_THRESHOLDS.CPU_CRITICAL) {
      anomalies.push(`CRITICAL: CPU usage is ${stats.cpuPercent.toFixed(2)}% (threshold: ${ANOMALY_THRESHOLDS.CPU_CRITICAL}%)`);
    } else if (stats.cpuPercent >= ANOMALY_THRESHOLDS.CPU_WARNING) {
      anomalies.push(`WARNING: CPU usage is ${stats.cpuPercent.toFixed(2)}% (threshold: ${ANOMALY_THRESHOLDS.CPU_WARNING}%)`);
    }

    // Memory anomalies
    if (stats.memoryPercent >= ANOMALY_THRESHOLDS.MEMORY_CRITICAL) {
      anomalies.push(`CRITICAL: Memory usage is ${stats.memoryPercent.toFixed(2)}% (threshold: ${ANOMALY_THRESHOLDS.MEMORY_CRITICAL}%)`);
    } else if (stats.memoryPercent >= ANOMALY_THRESHOLDS.MEMORY_WARNING) {
      anomalies.push(`WARNING: Memory usage is ${stats.memoryPercent.toFixed(2)}% (threshold: ${ANOMALY_THRESHOLDS.MEMORY_WARNING}%)`);
    }

    // Network anomalies (check if TX has been 0 for a while)
    if (stats.networkTX === 0) {
      anomalies.push(`WARNING: Network TX is 0 - instance may be idle or having network issues`);
    }

    // Log anomalies
    if (anomalies.length > 0) {
      logger.warn(`Anomalies detected for instance ${instanceId}:`, { anomalies });
    }
  }

  /**
   * Clean up old metrics (older than 30 days)
   * Runs daily at 2 AM
   */
  async cleanupOldMetrics(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - METRICS_RETENTION_DAYS);

      logger.info(`Cleaning up metrics older than ${cutoffDate.toISOString()}`);

      const deletedCount = await this.metricRepository.deleteOlderThan(cutoffDate);

      logger.info(`Cleaned up ${deletedCount} old metric records`);
    } catch (error) {
      logger.error('Failed to cleanup old metrics:', error);
    }
  }

  /**
   * Manually trigger metrics collection for a specific instance
   */
  async collectMetricsForInstance(instanceId: string): Promise<void> {
    const instance = await this.instanceRepository.findByInstanceId(instanceId);

    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    await this.collectInstanceMetrics(instance);
  }

  /**
   * Get the status of the metrics collection scheduler
   */
  getSchedulerStatus(): {
    collectionRunning: boolean;
    cleanupRunning: boolean;
    lastCollection: Date | null;
  } {
    return {
      collectionRunning: this.collectionTask !== null,
      cleanupRunning: this.cleanupTask !== null,
      lastCollection: this.lastCollectionTime,
    };
  }
}
