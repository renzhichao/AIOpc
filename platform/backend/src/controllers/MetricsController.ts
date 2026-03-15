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

import { Controller, Get, Param, QueryParam, Req, HttpCode, HttpResponse } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
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
  @OpenAPI({
    summary: 'Get instance usage statistics',
    description: 'Retrieve usage statistics for a specific instance including message count, token usage, CPU, and memory metrics.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Instance ID',
        schema: { type: 'string' },
      },
      {
        name: 'period',
        in: 'query',
        required: false,
        description: 'Time period for statistics',
        schema: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'day' },
      },
    ],
    responses: {
      '200': {
        description: 'Usage statistics retrieved successfully',
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                instance_id: { type: 'string' },
                period: { type: 'string' },
                total_messages: { type: 'number' },
                total_tokens: { type: 'number' },
                avg_cpu_usage: { type: 'number' },
                avg_memory_usage: { type: 'number' },
                max_cpu_usage: { type: 'number' },
                max_memory_usage: { type: 'number' },
                hourly_data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      timestamp: { type: 'string', format: 'date-time' },
                      cpu_usage: { type: 'number' },
                      memory_usage: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '404': {
        description: 'Instance not found',
      },
      '500': {
        description: 'Internal server error',
      },
    },
  })
  async getUsageStats(
    @Param('id') id: string,
    @QueryParam('period') period: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<HttpResponse> {
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
  @OpenAPI({
    summary: 'Get instance health status',
    description: 'Retrieve health status for a specific instance including container status and resource usage indicators.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Instance ID',
        schema: { type: 'string' },
      },
    ],
    responses: {
      '200': {
        description: 'Health status retrieved successfully',
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                instance_id: { type: 'string' },
                healthy: { type: 'boolean' },
                container_status: { type: 'string' },
                cpu_status: { type: 'string', enum: ['normal', 'warning', 'critical'] },
                memory_status: { type: 'string', enum: ['normal', 'warning', 'critical'] },
                last_check: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      '404': {
        description: 'Instance not found',
      },
      '500': {
        description: 'Internal server error',
      },
    },
  })
  async getHealthStatus(@Param('id') id: string): Promise<HttpResponse> {
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
  @OpenAPI({
    summary: 'Get instance time series metrics',
    description: 'Retrieve time series data for a specific metric type and time period.',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Instance ID',
        schema: { type: 'string' },
      },
      {
        name: 'metric_type',
        in: 'query',
        required: false,
        description: 'Type of metric to retrieve',
        schema: {
          type: 'string',
          enum: ['cpu_usage', 'memory_usage', 'message_count', 'token_usage'],
          default: 'cpu_usage',
        },
      },
      {
        name: 'period',
        in: 'query',
        required: false,
        description: 'Time period for metrics',
        schema: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'day' },
      },
    ],
    responses: {
      '200': {
        description: 'Time series metrics retrieved successfully',
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                metric_type: { type: 'string' },
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      timestamp: { type: 'string', format: 'date-time' },
                      value: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '404': {
        description: 'Instance not found',
      },
      '500': {
        description: 'Internal server error',
      },
    },
  })
  async getTimeSeriesMetrics(
    @Param('id') id: string,
    @QueryParam('metric_type') metricType: 'cpu_usage' | 'memory_usage' | 'message_count' | 'token_usage' = 'cpu_usage',
    @QueryParam('period') period: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<HttpResponse> {
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
