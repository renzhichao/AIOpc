/**
 * Metrics Controller
 *
 * Provides API endpoints for accessing instance metrics and statistics.
 *
 * Endpoints:
 * - GET /instances/:id/usage - Get usage statistics
 * - GET /instances/:id/health - Get health status
 * - GET /instances/:id/metrics - Get time series metrics
 */

import { Controller, Get, Param, QueryParam, Req, HttpCode } from 'routing-controllers';
import { Service } from 'typedi';
import { MetricsService, UsageStats, HealthStatus, MetricsTimeSeries } from '../services/MetricsService';
import { AppError } from '../utils/errors/AppError';
import { logger } from '../config/logger';

@Controller('/instances/:id')
@Service()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Get usage statistics for an instance
   *
   * @param id - Instance ID
   * @param period - Time period (hour, day, week, month)
   * @returns Usage statistics including messages, tokens, CPU, and memory
   */
  @Get('/usage')
  @HttpCode(200)
  async getUsageStats(
    @Param('id') id: string,
    @QueryParam('period') period: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<any> {
    try {
      logger.info(`Fetching usage stats for instance ${id} (period: ${period})`);

      const stats = await this.metricsService.getUsageStats(id, period);

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error(`Failed to fetch usage stats for instance ${id}:`, error);
      throw new AppError(
        500,
        'METRICS_FETCH_FAILED',
        `Failed to fetch usage statistics: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get health status for an instance
   *
   * @param id - Instance ID
   * @returns Health status including container status and resource usage
   */
  @Get('/health')
  @HttpCode(200)
  async getHealthStatus(@Param('id') id: string): Promise<any> {
    try {
      logger.info(`Fetching health status for instance ${id}`);

      const health = await this.metricsService.getHealthStatus(id);

      return {
        success: true,
        data: health,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error(`Failed to fetch health status for instance ${id}:`, error);
      throw new AppError(
        500,
        'HEALTH_FETCH_FAILED',
        `Failed to fetch health status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get time series metrics for an instance
   *
   * @param id - Instance ID
   * @param metricType - Type of metric (cpu_usage, memory_usage, message_count, token_usage)
   * @param period - Time period (hour, day, week, month)
   * @returns Time series data for the specified metric
   */
  @Get('/metrics')
  @HttpCode(200)
  async getTimeSeriesMetrics(
    @Param('id') id: string,
    @QueryParam('metric_type') metricType: 'cpu_usage' | 'memory_usage' | 'message_count' | 'token_usage' = 'cpu_usage',
    @QueryParam('period') period: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<any> {
    try {
      logger.info(
        `Fetching time series metrics for instance ${id} (type: ${metricType}, period: ${period})`
      );

      const metrics = await this.metricsService.getTimeSeriesData(id, metricType, period);

      return {
        success: true,
        data: metrics,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error(`Failed to fetch time series metrics for instance ${id}:`, error);
      throw new AppError(
        500,
        'METRICS_FETCH_FAILED',
        `Failed to fetch time series metrics: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
