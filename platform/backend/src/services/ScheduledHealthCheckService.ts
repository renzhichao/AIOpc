/**
 * Scheduled Health Check Service
 *
 * Manages scheduled health check cycles for all instances.
 * Runs health checks at regular intervals and attempts automatic recovery.
 */

import { Service } from 'typedi';
import { HealthCheckService, AutoRecoveryConfig } from './HealthCheckService';
import { logger } from '../config/logger';

/**
 * Scheduled task configuration
 */
export interface ScheduledTaskConfig {
  /** Enable scheduled health checks (default: true) */
  enabled?: boolean;
  /** Check interval in milliseconds (default: 60000 = 1 minute) */
  interval?: number;
  /** Recovery configuration */
  recovery?: AutoRecoveryConfig;
}

@Service()
export class ScheduledHealthCheckService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastCheckTime: Date | null = null;
  private checkCount = 0;

  constructor(private readonly healthCheckService: HealthCheckService) {
    logger.info('ScheduledHealthCheckService initialized');
  }

  /**
   * Start scheduled health checks
   *
   * @param config - Task configuration
   */
  start(config: ScheduledTaskConfig = {}): void {
    if (this.timer) {
      logger.warn('Scheduled health check already running');
      return;
    }

    const enabled = config.enabled !== false;
    if (!enabled) {
      logger.info('Scheduled health check disabled');
      return;
    }

    const interval = config.interval || 60000; // Default: 1 minute

    logger.info('Starting scheduled health checks', {
      interval: `${interval / 1000}s`,
    });

    // Run immediately on start
    this.runCycle(config.recovery);

    // Schedule recurring checks
    this.timer = setInterval(() => {
      this.runCycle(config.recovery);
    }, interval);

    logger.info('Scheduled health checks started');
  }

  /**
   * Stop scheduled health checks
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Scheduled health checks stopped');
    } else {
      logger.warn('Scheduled health check not running');
    }
  }

  /**
   * Run a single health check cycle
   *
   * @param recoveryConfig - Recovery configuration
   */
  private async runCycle(recoveryConfig?: AutoRecoveryConfig): Promise<void> {
    if (this.isRunning) {
      logger.warn('Health check cycle already running, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('Running scheduled health check cycle', {
        cycleNumber: this.checkCount + 1,
      });

      const statistics = await this.healthCheckService.runHealthCheckCycle(recoveryConfig);

      const duration = Date.now() - startTime;

      logger.info('Health check cycle completed', {
        cycleNumber: this.checkCount + 1,
        duration: `${duration}ms`,
        totalInstances: statistics.totalInstances,
        healthyCount: statistics.healthyCount,
        unhealthyCount: statistics.unhealthyCount,
        recoveredCount: statistics.recoveredCount,
        failedRecoveries: statistics.failedRecoveries,
      });

      this.lastCheckTime = new Date();
      this.checkCount++;

      // Alert if there are failed recoveries
      if (statistics.failedRecoveries > 0) {
        logger.warn('Some instances failed to recover', {
          failedRecoveries: statistics.failedRecoveries,
        });
      }
    } catch (error) {
      logger.error('Health check cycle failed', {
        cycleNumber: this.checkCount + 1,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get service status
   *
   * @returns Service status
   */
  getStatus(): {
    running: boolean;
    lastCheckTime: Date | null;
    checkCount: number;
    isRunningCycle: boolean;
  } {
    return {
      running: this.timer !== null,
      lastCheckTime: this.lastCheckTime,
      checkCount: this.checkCount,
      isRunningCycle: this.isRunning,
    };
  }

  /**
   * Trigger a manual health check cycle
   *
   * @param recoveryConfig - Recovery configuration
   */
  async triggerManualCheck(recoveryConfig?: AutoRecoveryConfig): Promise<void> {
    logger.info('Triggering manual health check cycle');
    await this.runCycle(recoveryConfig);
  }
}
