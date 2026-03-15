/**
 * Metrics Collection Service
 *
 * Automatically collects metrics from all active instances every 5 minutes.
 * Uses node-cron to schedule collection tasks.
 *
 * Collected metrics:
 * - Container metrics: CPU usage, memory usage
 * - API metrics: Message count, token usage
 *
 * This service runs as a background job and should be started
 * when the application initializes.
 */

import { Service } from 'typedi';
import * as cron from 'node-cron';
import Docker from 'dockerode';
import { InstanceMetricRepository } from '../repositories/InstanceMetricRepository';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { Instance } from '../entities/Instance.entity';
import { logger } from '../config/logger';

@Service()
export class MetricsCollectionService {
  private collectionTask: cron.ScheduledTask | null = null;
  private docker: Docker;

  constructor(
    private readonly metricRepository: InstanceMetricRepository,
    private readonly instanceRepository: InstanceRepository
  ) {
    const socketPath = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
    this.docker = new Docker({ socketPath });
  }

  /**
   * Start the metrics collection scheduler
   * Runs every 5 minutes
   */
  startScheduler(): void {
    if (this.collectionTask) {
      logger.warn('Metrics collection scheduler already running');
      return;
    }

    logger.info('Starting metrics collection scheduler (every 5 minutes)');

    this.collectionTask = cron.schedule('*/5 * * * *', async () => {
      logger.debug('Running scheduled metrics collection');
      await this.collectAllMetrics();
    });

    // Run initial collection
    this.collectAllMetrics().catch((error) => {
      logger.error('Initial metrics collection failed:', error);
    });
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
  }

  /**
   * Collect metrics from all active instances
   */
  async collectAllMetrics(): Promise<void> {
    try {
      const instances = await this.instanceRepository.findByStatus('running');

      logger.info(`Collecting metrics for ${instances.length} active instances`);

      const collectionPromises = instances.map((instance) =>
        this.collectInstanceMetrics(instance).catch((error) => {
          logger.error(`Failed to collect metrics for instance ${instance.instance_id}:`, error);
        })
      );

      await Promise.all(collectionPromises);

      logger.info('Metrics collection completed');
    } catch (error) {
      logger.error('Failed to collect metrics:', error);
    }
  }

  /**
   * Collect all metrics for a specific instance
   */
  async collectInstanceMetrics(instance: Instance): Promise<void> {
    try {
      await this.collectContainerMetrics(instance);
      await this.collectAPIMetrics(instance);
    } catch (error) {
      logger.error(`Failed to collect metrics for instance ${instance.instance_id}:`, error);
      throw error;
    }
  }

  /**
   * Collect container metrics (CPU, memory) from Docker
   */
  private async collectContainerMetrics(instance: Instance): Promise<void> {
    try {
      const containerName = `opclaw-${instance.instance_id}`;
      const container = this.docker.getContainer(containerName);

      // Get container stats
      const stats = await container.stats({ stream: false });

      // Calculate CPU usage percentage
      const cpuStats = stats.cpu_stats;
      const precpuStats = stats.precpu_stats;
      const cpuDelta = cpuStats.cpu_usage.total_usage - precpuStats.cpu_usage.total_usage;
      const systemDelta = cpuStats.system_cpu_usage - precpuStats.system_cpu_usage;
      const cpuUsage = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

      // Record CPU usage
      await this.metricRepository.recordMetric({
        instance_id: instance.instance_id,
        metric_type: 'cpu_usage',
        metric_value: Math.round(cpuUsage * 100) / 100,
        unit: 'percent',
        recorded_at: new Date(),
      });

      // Calculate memory usage in MB
      const memoryStats = stats.memory_stats;
      const memoryUsage = memoryStats.usage || 0;
      const memoryLimit = memoryStats.limit || 1;
      const memoryUsageMB = Math.round((memoryUsage / (1024 * 1024)) * 100) / 100;

      // Record memory usage
      await this.metricRepository.recordMetric({
        instance_id: instance.instance_id,
        metric_type: 'memory_usage',
        metric_value: memoryUsageMB,
        unit: 'mb',
        recorded_at: new Date(),
      });

      logger.debug(
        `Collected container metrics for ${instance.instance_id}: CPU=${cpuUsage.toFixed(2)}%, Memory=${memoryUsageMB}MB`
      );
    } catch (error) {
      logger.error(`Failed to collect container metrics for ${instance.instance_id}:`, error);
      throw error;
    }
  }

  /**
   * Collect API metrics (message count, token usage)
   *
   * Note: This is a placeholder implementation.
   * In a real system, you would query an API log table or
   * integrate with a message tracking system.
   */
  private async collectAPIMetrics(instance: Instance): Promise<void> {
    try {
      // Placeholder: In a real implementation, you would:
      // 1. Query an api_logs table for message count
      // 2. Sum up token usage from API calls
      // 3. Store the aggregated metrics

      // For now, we'll record placeholder values
      // TODO: Implement actual API metrics collection

      logger.debug(`API metrics collection for ${instance.instance_id} not yet implemented`);

      // Example of how it would work:
      // const messageCount = await this.apiLogRepository.countMessages(
      //   instance.instance_id,
      //   'day'
      // );
      // await this.metricRepository.recordMetric({
      //   instance_id: instance.instance_id,
      //   metric_type: 'message_count',
      //   metric_value: messageCount,
      //   unit: 'count',
      //   recorded_at: new Date(),
      // });
    } catch (error) {
      logger.error(`Failed to collect API metrics for ${instance.instance_id}:`, error);
      throw error;
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
  getSchedulerStatus(): { running: boolean; lastRun: Date | null } {
    return {
      running: this.collectionTask !== null,
      lastRun: null, // TODO: Track last run time
    };
  }
}
