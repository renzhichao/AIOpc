/**
 * Health Check and Auto-Recovery Service
 *
 * Provides comprehensive health monitoring for OpenClaw instances:
 * - Container status monitoring
 * - HTTP health endpoint checking
 * - Resource usage monitoring (CPU/memory)
 * - Automatic recovery mechanisms
 * - Restart attempt tracking
 * - Auto-rebuild after failed restarts
 */

import { Service } from 'typedi';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { DockerService } from './DockerService';
import { Instance } from '../entities/Instance.entity';
import { AppError } from '../utils/errors/AppError';
import { ErrorService } from './ErrorService';
import { logger } from '../config/logger';
import axios, { AxiosError } from 'axios';
import { HealthStatus as DockerHealthStatus } from '../types/docker';

/**
 * Extended health status with HTTP check results
 */
export interface ExtendedHealthStatus {
  /** Overall health status */
  healthy: boolean;
  /** Container status from Docker */
  containerStatus: DockerHealthStatus;
  /** HTTP endpoint check result */
  httpStatus: {
    healthy: boolean;
    statusCode?: number;
    responseTime?: number;
    error?: string;
  };
  /** Resource usage */
  resourceUsage: {
    cpuPercent: number;
    memoryPercent: number;
    memoryUsage: number;
    memoryLimit: number;
  };
  /** Last check timestamp */
  lastCheck: Date;
  /** Health check summary */
  summary: string;
}

/**
 * Recovery action taken
 */
export interface RecoveryAction {
  /** Action type */
  type: 'restart' | 'rebuild' | 'none';
  /** Action timestamp */
  timestamp: Date;
  /** Success status */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Previous restart attempts */
  restartAttempts: number;
}

/**
 * Recovery result
 */
export interface RecoveryResult {
  /** Instance ID */
  instanceId: string;
  /** Recovery action taken */
  action: RecoveryAction;
  /** Current instance status */
  currentStatus: string;
  /** Next recommended action */
  nextAction?: string;
}

/**
 * Health statistics summary
 */
export interface HealthStatistics {
  /** Total instances checked */
  totalInstances: number;
  /** Healthy instances */
  healthyCount: number;
  /** Unhealthy instances */
  unhealthyCount: number;
  /** Recovered instances */
  recoveredCount: number;
  /** Failed to recover */
  failedRecoveries: number;
  /** Health check timestamp */
  timestamp: Date;
  /** Details by status */
  statusBreakdown: Record<string, number>;
}

/**
 * HTTP health check options
 */
export interface HttpHealthCheckOptions {
  /** Enable HTTP health check (default: true) */
  httpCheckEnabled?: boolean;
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Expected status code (default: 200) */
  expectedStatusCode?: number;
  /** Health check path (default: /health) */
  path?: string;
  /** Number of retries (default: 1) */
  retries?: number;
}

/**
 * Auto-recovery configuration
 */
export interface AutoRecoveryConfig {
  /** Maximum restart attempts before rebuild (default: 3) */
  maxRestartAttempts?: number;
  /** Delay between restart attempts in ms (default: 5000) */
  restartDelay?: number;
  /** Enable automatic recovery (default: true) */
  enabled?: boolean;
  /** Enable HTTP health check (default: true) */
  httpCheckEnabled?: boolean;
}

@Service()
export class HealthCheckService {
  private readonly DEFAULT_HTTP_CHECK_OPTIONS: HttpHealthCheckOptions = {
    timeout: 5000,
    expectedStatusCode: 200,
    path: '/health',
    retries: 1,
  };

  private readonly DEFAULT_RECOVERY_CONFIG: AutoRecoveryConfig = {
    maxRestartAttempts: 3,
    restartDelay: 5000,
    enabled: true,
    httpCheckEnabled: true,
  };

  private healthCheckHistory: Map<string, ExtendedHealthStatus[]> = new Map();
  private readonly MAX_HISTORY_SIZE = 10;

  constructor(
    private readonly instanceRepository: InstanceRepository,
    private readonly dockerService: DockerService,
    private readonly errorService: ErrorService
  ) {
    logger.info('HealthCheckService initialized');
  }

  /**
   * Check instance health with comprehensive monitoring
   *
   * @param instanceId - Instance ID
   * @param httpCheckOptions - HTTP health check options
   * @returns Extended health status
   */
  async checkInstanceHealth(
    instanceId: string,
    httpCheckOptions: HttpHealthCheckOptions = {}
  ): Promise<ExtendedHealthStatus> {
    try {
      logger.info('Checking instance health', { instanceId });

      // Merge options with defaults
      const options = { ...this.DEFAULT_HTTP_CHECK_OPTIONS, ...httpCheckOptions };

      // 1. Get Docker container health
      const containerHealth = await this.dockerService.healthCheck(instanceId);

      // 2. Get resource usage
      const stats = await this.dockerService.getContainerStats(instanceId);

      // 3. Check HTTP endpoint (if enabled and container is running)
      let httpStatus = {
        healthy: false,
      };
      if (options.httpCheckEnabled !== false && containerHealth.status === 'healthy') {
        httpStatus = await this.checkHttpEndpoint(instanceId, options);
      }

      // 4. Determine overall health
      const healthy =
        containerHealth.status === 'healthy' &&
        (options.httpCheckEnabled === false || httpStatus.healthy);

      // 5. Build summary
      const summary = this.buildHealthSummary(healthy, containerHealth, httpStatus, stats);

      const healthStatus: ExtendedHealthStatus = {
        healthy,
        containerStatus: containerHealth,
        httpStatus,
        resourceUsage: {
          cpuPercent: stats.cpuPercent,
          memoryPercent: stats.memoryPercent,
          memoryUsage: stats.memoryUsage,
          memoryLimit: stats.memoryLimit,
        },
        lastCheck: new Date(),
        summary,
      };

      // 6. Store in history
      this.storeHealthHistory(instanceId, healthStatus);

      // 7. Update health status in database
      await this.instanceRepository.updateHealthStatus(instanceId, healthStatus);

      logger.info('Health check completed', {
        instanceId,
        healthy,
        summary,
      });

      return healthStatus;
    } catch (error) {
      logger.error('Failed to check instance health', {
        instanceId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        healthy: false,
        containerStatus: {
          status: 'unknown',
          reason: 'Failed to check health',
          lastCheck: new Date(),
        },
        httpStatus: {
          healthy: false,
          error: 'Health check failed',
        },
        resourceUsage: {
          cpuPercent: 0,
          memoryPercent: 0,
          memoryUsage: 0,
          memoryLimit: 0,
        },
        lastCheck: new Date(),
        summary: 'Health check failed',
      };
    }
  }

  /**
   * Check HTTP endpoint health
   *
   * @param instanceId - Instance ID
   * @param options - HTTP check options
   * @returns HTTP health status
   */
  private async checkHttpEndpoint(
    instanceId: string,
    options: HttpHealthCheckOptions
  ): Promise<{ healthy: boolean; statusCode?: number; responseTime?: number; error?: string }> {
    const retries = options.retries || 1;
    const timeout = options.timeout || 5000;
    const path = options.path || '/health';
    const expectedStatusCode = options.expectedStatusCode || 200;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const startTime = Date.now();

        // Try to get container IP address
        const containerName = `opclaw-${instanceId}`;
        const url = `http://${containerName}:3000${path}`;

        const response = await axios.get(url, {
          timeout,
          validateStatus: () => true, // Don't throw on any status
        });

        const responseTime = Date.now() - startTime;

        if (response.status === expectedStatusCode) {
          logger.debug('HTTP health check passed', {
            instanceId,
            attempt,
            statusCode: response.status,
            responseTime,
          });

          return {
            healthy: true,
            statusCode: response.status,
            responseTime,
          };
        } else {
          logger.warn('HTTP health check returned unexpected status', {
            instanceId,
            attempt,
            expected: expectedStatusCode,
            actual: response.status,
          });

          return {
            healthy: false,
            statusCode: response.status,
            responseTime,
            error: `Unexpected status code: ${response.status}`,
          };
        }
      } catch (error) {
        const axiosError = error as AxiosError;

        logger.warn('HTTP health check attempt failed', {
          instanceId,
          attempt,
          retry: attempt < retries,
          error: axiosError.code || axiosError.message,
        });

        // If this is the last attempt, return failure
        if (attempt >= retries) {
          return {
            healthy: false,
            error: axiosError.code === 'ECONNREFUSED'
              ? 'Connection refused'
              : axiosError.code === 'ETIMEDOUT'
              ? 'Connection timeout'
              : axiosError.message,
          };
        }

        // Wait before retry
        await this.sleep(1000);
      }
    }

    return {
      healthy: false,
      error: 'Max retries exceeded',
    };
  }

  /**
   * Attempt automatic recovery for an unhealthy instance
   *
   * @param instanceId - Instance ID
   * @param config - Recovery configuration
   * @returns Recovery result
   */
  async attemptRecovery(
    instanceId: string,
    config: AutoRecoveryConfig = {}
  ): Promise<RecoveryResult> {
    try {
      logger.info('Attempting recovery', { instanceId });

      const recoveryConfig = { ...this.DEFAULT_RECOVERY_CONFIG, ...config };

      // Check if auto-recovery is enabled
      if (recoveryConfig.enabled === false) {
        logger.info('Auto-recovery disabled', { instanceId });
        return {
          instanceId,
          action: {
            type: 'none',
            timestamp: new Date(),
            success: true,
            restartAttempts: 0,
          },
          currentStatus: 'error',
          nextAction: 'Manual intervention required',
        };
      }

      // Get instance
      const instance = await this.instanceRepository.findByInstanceId(instanceId);
      if (!instance) {
        throw this.errorService.createError('INSTANCE_NOT_FOUND', { instanceId });
      }

      // Check current health
      const health = await this.checkInstanceHealth(instanceId, {
        httpCheckEnabled: recoveryConfig.httpCheckEnabled,
      });

      // If already healthy, no action needed
      if (health.healthy) {
        logger.info('Instance is healthy, no recovery needed', { instanceId });

        // Reset restart attempts
        await this.instanceRepository.resetRestartAttempts(instanceId);
        await this.instanceRepository.updateStatus(instanceId, 'active');

        return {
          instanceId,
          action: {
            type: 'none',
            timestamp: new Date(),
            success: true,
            restartAttempts: instance.restart_attempts,
          },
          currentStatus: 'active',
        };
      }

      // Determine recovery action based on restart attempts
      const restartAttempts = instance.restart_attempts || 0;
      const maxAttempts = recoveryConfig.maxRestartAttempts || 3;

      let action: RecoveryAction;

      if (restartAttempts < maxAttempts) {
        // Attempt restart
        action = await this.restartForRecovery(instanceId, restartAttempts, recoveryConfig);

        if (action.success) {
          // Check health again after restart
          await this.sleep(recoveryConfig.restartDelay || 5000);
          const postRestartHealth = await this.checkInstanceHealth(instanceId);

          if (postRestartHealth.healthy) {
            // Recovery successful, reset attempts
            await this.instanceRepository.resetRestartAttempts(instanceId);
            await this.instanceRepository.updateStatus(instanceId, 'active');
          } else {
            // Still unhealthy, will try again next time
            await this.instanceRepository.updateStatus(instanceId, 'recovering');
          }
        } else {
          // Restart failed
          await this.instanceRepository.updateStatus(instanceId, 'error');
        }
      } else {
        // Max restart attempts reached, rebuild container
        action = await this.rebuildForRecovery(instanceId, recoveryConfig);

        if (action.success) {
          // Rebuild successful, reset attempts
          await this.instanceRepository.resetRestartAttempts(instanceId);
          await this.instanceRepository.updateStatus(instanceId, 'active');
        } else {
          // Rebuild failed
          await this.instanceRepository.updateStatus(instanceId, 'error');
        }
      }

      const updatedInstance = await this.instanceRepository.findByInstanceId(instanceId);

      return {
        instanceId,
        action,
        currentStatus: updatedInstance?.status || 'unknown',
        nextAction: this.getNextAction(action, updatedInstance),
      };
    } catch (error) {
      logger.error('Recovery attempt failed', {
        instanceId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        instanceId,
        action: {
          type: 'none',
          timestamp: new Date(),
          success: false,
          error: error instanceof Error ? error.message : String(error),
          restartAttempts: 0,
        },
        currentStatus: 'error',
        nextAction: 'Manual intervention required',
      };
    }
  }

  /**
   * Restart instance for recovery
   *
   * @param instanceId - Instance ID
   * @param currentAttempts - Current restart attempts
   * @param config - Recovery configuration
   * @returns Recovery action
   */
  private async restartForRecovery(
    instanceId: string,
    currentAttempts: number,
    config: AutoRecoveryConfig
  ): Promise<RecoveryAction> {
    try {
      logger.info('Attempting restart recovery', {
        instanceId,
        attempt: currentAttempts + 1,
      });

      // Increment restart attempts
      await this.instanceRepository.incrementRestartAttempts(instanceId);
      await this.instanceRepository.updateStatus(instanceId, 'recovering');

      // Restart container with timeout
      const restartTimeout = 10; // Default 10 second timeout
      await this.dockerService.restartContainer(instanceId, restartTimeout);

      logger.info('Restart recovery successful', { instanceId });

      return {
        type: 'restart',
        timestamp: new Date(),
        success: true,
        restartAttempts: currentAttempts + 1,
      };
    } catch (error) {
      logger.error('Restart recovery failed', {
        instanceId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        type: 'restart',
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        restartAttempts: currentAttempts + 1,
      };
    }
  }

  /**
   * Rebuild instance for recovery
   *
   * @param instanceId - Instance ID
   * @param config - Recovery configuration
   * @returns Recovery action
   */
  private async rebuildForRecovery(
    instanceId: string,
    config: AutoRecoveryConfig
  ): Promise<RecoveryAction> {
    try {
      logger.info('Attempting rebuild recovery', { instanceId });

      const instance = await this.instanceRepository.findByInstanceId(instanceId);
      if (!instance) {
        throw this.errorService.createError('INSTANCE_NOT_FOUND', { instanceId });
      }

      await this.instanceRepository.updateStatus(instanceId, 'recovering');

      // Remove old container
      await this.dockerService.removeContainer(instanceId, true, false);

      // Create new container (assuming config is stored in instance.config)
      const containerId = await this.dockerService.createContainer(
        instanceId,
        instance.config as any
      );

      // Update instance with new container ID
      await this.instanceRepository.updateDockerContainerId(instanceId, containerId);

      logger.info('Rebuild recovery successful', { instanceId, containerId });

      return {
        type: 'rebuild',
        timestamp: new Date(),
        success: true,
        restartAttempts: 0,
      };
    } catch (error) {
      logger.error('Rebuild recovery failed', {
        instanceId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        type: 'rebuild',
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        restartAttempts: 0,
      };
    }
  }

  /**
   * Run health check on all active instances and attempt recovery
   *
   * @param config - Recovery configuration
   * @returns Health statistics
   */
  async runHealthCheckCycle(config: AutoRecoveryConfig = {}): Promise<HealthStatistics> {
    logger.info('Starting health check cycle');

    try {
      // Get all active instances
      const instances = await this.instanceRepository.findActiveInstances();

      logger.info('Checking instances', {
        count: instances.length,
      });

      let healthyCount = 0;
      let unhealthyCount = 0;
      let recoveredCount = 0;
      let failedRecoveries = 0;
      const statusBreakdown: Record<string, number> = {};

      for (const instance of instances) {
        try {
          // Check health
          const health = await this.checkInstanceHealth(instance.instance_id, {
            httpCheckEnabled: config.httpCheckEnabled,
          });

          if (health.healthy) {
            healthyCount++;
            statusBreakdown.healthy = (statusBreakdown.healthy || 0) + 1;
          } else {
            unhealthyCount++;
            statusBreakdown.unhealthy = (statusBreakdown.unhealthy || 0) + 1;

            // Attempt recovery
            const recovery = await this.attemptRecovery(instance.instance_id, config);

            if (recovery.action.success) {
              recoveredCount++;
              statusBreakdown.recovered = (statusBreakdown.recovered || 0) + 1;
            } else {
              failedRecoveries++;
              statusBreakdown.failed_recovery = (statusBreakdown.failed_recovery || 0) + 1;
            }
          }
        } catch (error) {
          logger.error('Health check failed for instance', {
            instanceId: instance.instance_id,
            error: error instanceof Error ? error.message : String(error),
          });
          unhealthyCount++;
          statusBreakdown.error = (statusBreakdown.error || 0) + 1;
        }
      }

      const statistics: HealthStatistics = {
        totalInstances: instances.length,
        healthyCount,
        unhealthyCount,
        recoveredCount,
        failedRecoveries,
        timestamp: new Date(),
        statusBreakdown,
      };

      logger.info('Health check cycle completed', statistics);

      return statistics;
    } catch (error) {
      logger.error('Health check cycle failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw this.errorService.createError('INTERNAL_ERROR', {
        message: 'Health check cycle failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get health statistics for all instances
   *
   * @returns Health statistics
   */
  async getHealthStatistics(): Promise<HealthStatistics> {
    const statusCounts = await this.instanceRepository.countByStatus();

    const totalInstances = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

    return {
      totalInstances,
      healthyCount: statusCounts.active || 0,
      unhealthyCount:
        (statusCounts.error || 0) +
        (statusCounts.recovering || 0),
      recoveredCount: 0,
      failedRecoveries: statusCounts.error || 0,
      timestamp: new Date(),
      statusBreakdown: statusCounts,
    };
  }

  /**
   * Get health history for an instance
   *
   * @param instanceId - Instance ID
   * @returns Health history
   */
  getHealthHistory(instanceId: string): ExtendedHealthStatus[] {
    return this.healthCheckHistory.get(instanceId) || [];
  }

  /**
   * Clear health history for an instance
   *
   * @param instanceId - Instance ID
   */
  clearHealthHistory(instanceId: string): void {
    this.healthCheckHistory.delete(instanceId);
  }

  /**
   * Build health summary string
   */
  private buildHealthSummary(
    healthy: boolean,
    containerHealth: DockerHealthStatus,
    httpStatus: any,
    stats: any
  ): string {
    if (healthy) {
      return `Healthy - CPU: ${stats.cpuPercent}%, Memory: ${stats.memoryPercent}%`;
    }

    const issues: string[] = [];

    if (containerHealth.status !== 'healthy') {
      issues.push(`Container: ${containerHealth.reason}`);
    }

    if (httpStatus.error) {
      issues.push(`HTTP: ${httpStatus.error}`);
    }

    return issues.join('; ');
  }

  /**
   * Store health status in history
   */
  private storeHealthHistory(instanceId: string, healthStatus: ExtendedHealthStatus): void {
    let history = this.healthCheckHistory.get(instanceId) || [];

    history = [...history, healthStatus];

    // Keep only recent history
    if (history.length > this.MAX_HISTORY_SIZE) {
      history = history.slice(-this.MAX_HISTORY_SIZE);
    }

    this.healthCheckHistory.set(instanceId, history);
  }

  /**
   * Get next recommended action
   */
  private getNextAction(action: RecoveryAction, instance: Instance | null): string | undefined {
    if (action.success) {
      return undefined;
    }

    if (action.type === 'restart') {
      return action.restartAttempts < 3
        ? 'Attempt restart again'
        : 'Rebuild container';
    }

    if (action.type === 'rebuild') {
      return 'Manual investigation required';
    }

    return undefined;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
