import { Controller, Get, Post, Body, Param, QueryParam, Req } from 'routing-controllers';
import { Service } from 'typedi';
import { InstanceService } from '../services/InstanceService';
import { DockerService } from '../services/DockerService';
import { ApiKeyService } from '../services/ApiKeyService';
import { UserRepository } from '../repositories/UserRepository';
import { logger } from '../config/logger';
import { AppError, ErrorCodes } from '../utils/errors';

/**
 * Monitoring Controller
 *
 * RESTful API endpoints for system monitoring, health checks, and statistics.
 */
@Controller('/monitoring')
export class MonitoringController {
  constructor(
    private readonly instanceService: InstanceService,
    private readonly dockerService: DockerService,
    private readonly apiKeyService: ApiKeyService,
    private readonly userRepository: UserRepository
  ) {}

  /**
   * Get system health overview
   * GET /api/monitoring/health
   */
  @Get('/health')
  async getSystemHealth(@Req() req: any) {
    try {
      const user = req.user;

      if (!user || !user.id) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'User not authenticated'
        );
      }

      // Get overall system statistics
      const totalInstances = await this.instanceService.getTotalInstanceCount();
      const activeInstances = await this.instanceService.getActiveInstanceCount();
      const totalUsers = await this.userRepository.getTotalUserCount();
      const apiKeyStats = await this.apiKeyService.getUsageStats();

      // Get Docker system info
      const dockerInfo = await this.dockerService.getSystemInfo();

      return {
        success: true,
        data: {
          system: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
          },
          instances: {
            total: totalInstances,
            active: activeInstances,
            inactive: totalInstances - activeInstances
          },
          users: {
            total: totalUsers
          },
          api_keys: {
            total: apiKeyStats.totalKeys,
            active: apiKeyStats.activeKeys,
            total_usage: apiKeyStats.totalUsage
          },
          docker: {
            version: dockerInfo.server_version,
            containers: dockerInfo.containers,
            containers_running: dockerInfo.containers_running
          }
        }
      };
    } catch (error) {
      logger.error('Failed to get system health', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to get system health'
      );
    }
  }

  /**
   * Get instance health status
   * GET /api/monitoring/instances/:id/health
   */
  @Get('/instances/:id/health')
  async getInstanceHealth(@Param('id') id: string, @Req() req: any) {
    try {
      const user = req.user;

      if (!user || !user.id) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'User not authenticated'
        );
      }

      const instance = await this.instanceService.getInstanceById(id);

      if (!instance) {
        throw new AppError(
          ErrorCodes.NOT_FOUND.statusCode,
          ErrorCodes.NOT_FOUND.code,
          `Instance ${id} not found`
        );
      }

      // Check ownership
      if (instance.owner_id !== user.id && user.role !== 'admin') {
        throw new AppError(
          ErrorCodes.FORBIDDEN.statusCode,
          ErrorCodes.FORBIDDEN.code,
          'Access denied to this instance'
        );
      }

      // Get instance health
      const health = await this.instanceService.checkInstanceHealth(id);

      return {
        success: true,
        data: {
          instance_id: id,
          ...health
        }
      };
    } catch (error) {
      logger.error('Failed to get instance health', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to get instance health'
      );
    }
  }

  /**
   * Get instance metrics
   * GET /api/monitoring/instances/:id/metrics
   */
  @Get('/instances/:id/metrics')
  async getInstanceMetrics(@Param('id') id: string, @Req() req: any) {
    try {
      const user = req.user;

      if (!user || !user.id) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'User not authenticated'
        );
      }

      const instance = await this.instanceService.getInstanceById(id);

      if (!instance) {
        throw new AppError(
          ErrorCodes.NOT_FOUND.statusCode,
          ErrorCodes.NOT_FOUND.code,
          `Instance ${id} not found`
        );
      }

      // Check ownership
      if (instance.owner_id !== user.id && user.role !== 'admin') {
        throw new AppError(
          ErrorCodes.FORBIDDEN.statusCode,
          ErrorCodes.FORBIDDEN.code,
          'Access denied to this instance'
        );
      }

      // Get container stats
      if (!instance.docker_container_id) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR.statusCode,
          ErrorCodes.VALIDATION_ERROR.code,
          'Instance does not have a container'
        );
      }

      const stats = await this.dockerService.getContainerStats(instance.docker_container_id);

      return {
        success: true,
        data: {
          instance_id: id,
          metrics: stats
        }
      };
    } catch (error) {
      logger.error('Failed to get instance metrics', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to get instance metrics'
      );
    }
  }

  /**
   * Get system-wide metrics (admin only)
   * GET /api/monitoring/system/metrics
   */
  @Get('/system/metrics')
  async getSystemMetrics(@Req() req: any) {
    try {
      const user = req.user;

      if (!user || !user.id) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'User not authenticated'
        );
      }

      // Admin check
      if (user.role !== 'admin') {
        throw new AppError(
          ErrorCodes.FORBIDDEN.statusCode,
          ErrorCodes.FORBIDDEN.code,
          'Admin access required'
        );
      }

      // Get all container stats
      const instances = await this.instanceService.getAllInstances();
      const containerStats = await Promise.all(
        instances
          .filter(i => i.docker_container_id)
          .map(async (instance) => {
            try {
              const stats = await this.dockerService.getContainerStats(instance.docker_container_id!);
              return {
                instance_id: instance.id,
                stats
              };
            } catch (error) {
              logger.error(`Failed to get stats for instance ${instance.id}`, error);
              return null;
            }
          })
      );

      // Get Docker system info
      const dockerInfo = await this.dockerService.getSystemInfo();

      return {
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          docker: dockerInfo,
          containers: containerStats.filter(s => s !== null)
        }
      };
    } catch (error) {
      logger.error('Failed to get system metrics', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to get system metrics'
      );
    }
  }

  /**
   * Get usage statistics
   * GET /api/monitoring/usage
   *
   * Query params:
   * - period: today, week, month (default: today)
   */
  @Get('/usage')
  async getUsageStats(
    @Req() req: any,
    @QueryParam('period') period: string = 'today'
  ) {
    try {
      const user = req.user;

      if (!user || !user.id) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'User not authenticated'
        );
      }

      // Get user's instances
      const instances = await this.instanceService.getUserInstances(user.id);

      // Calculate usage statistics
      const instanceStats = await Promise.all(
        instances.map(async (instance) => {
          try {
            const stats = await this.instanceService.getInstanceStats(instance.instance_id);
            return {
              instance_id: instance.instance_id,
              name: instance.name,
              status: instance.status,
              stats
            };
          } catch (error) {
            logger.error(`Failed to get stats for instance ${instance.instance_id}`, error);
            return null;
          }
        })
      );

      // Aggregate stats
      const totalUsage = 0; // TODO: Implement actual usage tracking

      return {
        success: true,
        data: {
          period,
          user_id: user.id,
          total_instances: instances.length,
          active_instances: instances.filter(i => i.status === 'active').length,
          total_usage: totalUsage,
          instances: instanceStats.filter(s => s !== null)
        }
      };
    } catch (error) {
      logger.error('Failed to get usage stats', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to get usage statistics'
      );
    }
  }

  /**
   * Get alerts and notifications
   * GET /api/monitoring/alerts
   */
  @Get('/alerts')
  async getAlerts(@Req() req: any) {
    try {
      const user = req.user;

      if (!user || !user.id) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'User not authenticated'
        );
      }

      // Get user's instances
      const instances = await this.instanceService.getUserInstances(user.id);

      // Check for alerts
      const alerts: any[] = [];

      for (const instance of instances) {
        // Check for failed instances
        if (instance.status === 'error') {
          alerts.push({
            type: 'error',
            severity: 'high',
            instance_id: instance.id,
            message: `Instance "${instance.name}" is in error state`,
            created_at: instance.updated_at
          });
        }

        // Check for instances near quota
        if (instance.docker_container_id) {
          try {
            const stats = await this.dockerService.getContainerStats(instance.docker_container_id);
            if (stats.memoryPercent > 90) {
              alerts.push({
                type: 'warning',
                severity: 'medium',
                instance_id: instance.id,
                message: `Instance "${instance.name}" is using >90% memory`,
                created_at: new Date()
              });
            }
          } catch (error) {
            // Ignore stats errors
          }
        }
      }

      return {
        success: true,
        data: {
          alerts,
          count: alerts.length
        }
      };
    } catch (error) {
      logger.error('Failed to get alerts', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to get alerts'
      );
    }
  }
}
