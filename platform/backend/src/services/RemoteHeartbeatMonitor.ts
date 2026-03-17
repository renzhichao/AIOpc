/**
 * Remote Instance Heartbeat Monitor Service
 *
 * Periodically checks heartbeats from remote instances and marks
 * instances as offline if they haven't sent a heartbeat within the timeout period.
 *
 * Runs as a scheduled job every 30 seconds.
 */

import { Service } from 'typedi';
import { RemoteInstanceService } from './RemoteInstanceService';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { logger } from '../config/logger';

@Service()
export class RemoteHeartbeatMonitorService {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 30000; // 30 seconds

  constructor(
    private readonly remoteInstanceService: RemoteInstanceService,
    private readonly instanceRepository: InstanceRepository
  ) {}

  /**
   * Start the heartbeat monitor
   */
  start(): void {
    if (this.checkInterval) {
      logger.warn('Heartbeat monitor already running');
      return;
    }

    logger.info('Starting remote instance heartbeat monitor', {
      check_interval_ms: this.CHECK_INTERVAL_MS
    });

    // Run immediately on start
    this.checkHeartbeats();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.checkHeartbeats();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop the heartbeat monitor
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Remote instance heartbeat monitor stopped');
    }
  }

  /**
   * Check heartbeats from all remote instances
   */
  private async checkHeartbeats(): Promise<void> {
    try {
      // Find all stale instances
      const staleInstances = await this.remoteInstanceService.findStaleInstances();

      if (staleInstances.length === 0) {
        return;
      }

      logger.info('Found stale remote instances', {
        count: staleInstances.length
      });

      // Mark each stale instance as offline
      for (const instance of staleInstances) {
        await this.markInstanceOffline(instance);
      }

      // Log summary
      logger.info('Heartbeat check completed', {
        total_checked: await this.getTotalRemoteCount(),
        stale_found: staleInstances.length
      });
    } catch (error) {
      logger.error('Error during heartbeat check', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Mark an instance as offline
   */
  private async markInstanceOffline(instance: any): Promise<void> {
    try {
      await this.instanceRepository.updateByInstanceId(instance.instance_id, {
        status: 'error', // Changed from 'offline' to 'error' (valid enum value)
        health_status: 'unhealthy',
        health_reason: 'No heartbeat received within timeout period',
        updated_at: new Date()
      });

      logger.warn('Remote instance marked as error (no heartbeat)', {
        instance_id: instance.instance_id,
        remote_host: instance.remote_host,
        last_heartbeat: instance.last_heartbeat_at
      });
    } catch (error) {
      logger.error('Failed to mark instance as error', {
        instance_id: instance.instance_id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get total count of remote instances
   */
  private async getTotalRemoteCount(): Promise<number> {
    const allInstances = await this.instanceRepository.findAll();
    return allInstances.filter(i => i.deployment_type === 'remote').length;
  }
}
