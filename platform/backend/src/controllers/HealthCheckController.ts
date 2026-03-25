/**
 * Health Check Controller
 *
 * Provides API endpoints for instance health monitoring and recovery:
 * - Check instance health
 * - Trigger manual recovery
 * - Get health statistics
 * - View health history
 */

import { Controller, Get, Post, Route, Tags, Path, Body, Query, Response } from 'tsoa';
import { HealthCheckService } from '../services/HealthCheckService';
import {
  ExtendedHealthStatus,
  RecoveryResult,
  HealthStatistics,
  HttpHealthCheckOptions,
  AutoRecoveryConfig,
} from '../services/HealthCheckService';
import { AppError } from '../utils/errors/AppError';

@Route('api/health')
@Tags('Health Check')
export class HealthCheckController extends Controller {
  constructor(private readonly healthCheckService: HealthCheckService) {
    super();
  }

  /**
   * Get platform health status
   */
  @Get('/')
  public async getPlatformHealth(): Promise<{
    status: string;
    timestamp: Date;
    uptime: number;
  }> {
    return {
      status: 'ok',
      timestamp: new Date(),
      uptime: process.uptime(),
    };
  }

  /**
   * Check instance health
   *
   * @param instanceId Instance ID
   * @param httpCheckEnabled Enable HTTP health check
   * @param timeout HTTP check timeout in milliseconds
   * @param retries Number of HTTP check retries
   */
  @Get('/instances/:instanceId')
  @Response<404, { code: string; message: string }>(404, 'Instance not found')
  @Response<500, { code: string; message: string }>(500, 'Internal server error')
  public async checkInstanceHealth(
    @Path() instanceId: string,
    @Query() httpCheckEnabled?: boolean,
    @Query() timeout?: number,
    @Query() retries?: number
  ): Promise<ExtendedHealthStatus> {
    try {
      const httpOptions: HttpHealthCheckOptions = {
        httpCheckEnabled,
        timeout,
        retries,
      };

      return await this.healthCheckService.checkInstanceHealth(instanceId, httpOptions);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(500, 'HEALTH_CHECK_FAILED', 'Failed to check instance health', {
        instanceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Trigger manual recovery for an instance
   *
   * @param instanceId Instance ID
   * @param config Recovery configuration
   */
  @Post('/instances/:instanceId/recover')
  @Response<404, { code: string; message: string }>(404, 'Instance not found')
  @Response<500, { code: string; message: string }>(500, 'Recovery failed')
  public async triggerRecovery(
    @Path() instanceId: string,
    @Body() config?: AutoRecoveryConfig
  ): Promise<RecoveryResult> {
    try {
      return await this.healthCheckService.attemptRecovery(instanceId, config);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(500, 'RECOVERY_FAILED', 'Failed to recover instance', {
        instanceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get health statistics for all instances
   */
  @Get('/statistics')
  public async getHealthStatistics(): Promise<HealthStatistics> {
    try {
      return await this.healthCheckService.getHealthStatistics();
    } catch (error) {
      throw new AppError(500, 'STATISTICS_FAILED', 'Failed to get health statistics', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get health history for an instance
   *
   * @param instanceId Instance ID
   */
  @Get('/instances/:instanceId/history')
  @Response<404, { code: string; message: string }>(404, 'Instance not found')
  public async getHealthHistory(@Path() instanceId: string): Promise<ExtendedHealthStatus[]> {
    try {
      return this.healthCheckService.getHealthHistory(instanceId);
    } catch (error) {
      throw new AppError(500, 'HISTORY_FAILED', 'Failed to get health history', {
        instanceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clear health history for an instance
   *
   * @param instanceId Instance ID
   */
  @Post('/instances/:instanceId/history/clear')
  @Response<404, { code: string; message: string }>(404, 'Instance not found')
  public async clearHealthHistory(@Path() instanceId: string): Promise<{ message: string }> {
    try {
      this.healthCheckService.clearHealthHistory(instanceId);
      return { message: 'Health history cleared' };
    } catch (error) {
      throw new AppError(500, 'HISTORY_CLEAR_FAILED', 'Failed to clear health history', {
        instanceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Run health check cycle on all active instances (admin only)
   *
   * @param config Recovery configuration
   */
  @Post('/cycle')
  @Response<403, { code: string; message: string }>(403, 'Forbidden')
  @Response<500, { code: string; message: string }>(500, 'Health check cycle failed')
  public async runHealthCheckCycle(
    @Body() config?: AutoRecoveryConfig
  ): Promise<HealthStatistics> {
    try {
      return await this.healthCheckService.runHealthCheckCycle(config);
    } catch (error) {
      throw new AppError(500, 'HEALTH_CHECK_CYCLE_FAILED', 'Failed to run health check cycle', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
