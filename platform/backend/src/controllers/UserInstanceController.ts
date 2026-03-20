import { Service } from 'typedi';
import { JsonController, Get, Post, Patch, Body, Param, Req, UseBefore } from 'routing-controllers';
import { AuthMiddleware, AuthRequest } from '../middleware/AuthMiddleware';
import { UserInstanceService } from '../services/UserInstanceService';
import { logger } from '../config/logger';

/**
 * User Instance Controller
 *
 * RESTful API endpoints for managing user's claimed instances:
 * - Get all instances owned by user
 * - Update instance last accessed time
 * - Get instance statistics
 * - Rename instance
 *
 * All endpoints require authentication via AuthMiddleware.
 *
 * @service
 * @controller
 */
@Service()
@JsonController('/api/user')
@UseBefore(AuthMiddleware)
export class UserInstanceController {
  constructor(
    private readonly userInstanceService: UserInstanceService
  ) {}

  /**
   * GET /api/user/instances
   *
   * Get all instances owned by the authenticated user
   * Returns instances with conversation counts, sorted by last accessed time
   *
   * @param req - Authenticated request
   * @returns List of user's instances
   *
   * @example
   * GET /api/user/instances
   */
  @Get('/instances')
  async getUserInstances(@Req() req: AuthRequest) {
    try {
      const userId = req.user!.userId;

      const instances = await this.userInstanceService.getUserInstances(userId);

      logger.info('Retrieved user instances via API', {
        userId,
        count: instances.length
      });

      return {
        success: true,
        instances
      };
    } catch (error: any) {
      logger.error('Failed to get user instances', {
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to get user instances'
      };
    }
  }

  /**
   * POST /api/user/instances/:instanceId/access
   *
   * Update instance last accessed time
   * Called when user opens an instance or sends a message
   *
   * @param instanceId - Instance ID (string UUID)
   * @param req - Authenticated request
   * @returns Success confirmation
   *
   * @example
   * POST /api/user/instances/abc-123-def/access
   */
  @Post('/instances/:instanceId/access')
  async updateLastAccessed(
    @Param('instanceId') instanceId: string,
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      await this.userInstanceService.updateLastAccessed(userId, instanceId);

      logger.debug('Instance last accessed updated via API', {
        instanceId,
        userId
      });

      return {
        success: true,
        instanceId,
        lastAccessedAt: new Date().toISOString()
      };
    } catch (error: any) {
      logger.error('Failed to update last accessed', {
        instanceId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to update last accessed time'
      };
    }
  }

  /**
   * GET /api/user/instances/:instanceId/stats
   *
   * Get detailed statistics for a specific instance
   *
   * @param instanceId - Instance ID (string UUID)
   * @param req - Authenticated request
   * @returns Instance statistics
   *
   * @example
   * GET /api/user/instances/abc-123-def/stats
   */
  @Get('/instances/:instanceId/stats')
  async getInstanceStats(
    @Param('instanceId') instanceId: string,
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      const stats = await this.userInstanceService.getInstanceStats(
        userId,
        instanceId
      );

      return {
        success: true,
        stats
      };
    } catch (error: any) {
      logger.error('Failed to get instance stats', {
        instanceId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to get instance statistics'
      };
    }
  }

  /**
   * PATCH /api/user/instances/:instanceId/rename
   *
   * Rename an instance
   *
   * @param instanceId - Instance ID (string UUID)
   * @param body - New instance name
   * @param req - Authenticated request
   * @returns Updated instance
   *
   * @example
   * PATCH /api/user/instances/abc-123-def/rename
   * {
   *   "name": "我的 AI 助手"
   * }
   */
  @Patch('/instances/:instanceId/rename')
  async renameInstance(
    @Param('instanceId') instanceId: string,
    @Body() body: { name: string },
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      const instance = await this.userInstanceService.renameInstance(
        userId,
        instanceId,
        body.name
      );

      logger.info('Instance renamed via API', {
        instanceId,
        userId,
        newName: body.name
      });

      return {
        success: true,
        instance: {
          id: instance.id,
          instanceId: instance.instance_id,
          name: instance.name
        }
      };
    } catch (error: any) {
      logger.error('Failed to rename instance', {
        instanceId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to rename instance'
      };
    }
  }

  /**
   * GET /api/user/instances/recent
   *
   * Get recently accessed instances
   *
   * @param req - Authenticated request
   * @returns List of recent instances
   *
   * @example
   * GET /api/user/instances/recent
   */
  @Get('/instances/recent')
  async getRecentInstances(@Req() req: AuthRequest) {
    try {
      const userId = req.user!.userId;

      const instances = await this.userInstanceService.getRecentInstances(userId, 5);

      return {
        success: true,
        instances
      };
    } catch (error: any) {
      logger.error('Failed to get recent instances', {
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to get recent instances'
      };
    }
  }

  /**
   * GET /api/user/instances/:instanceId
   *
   * Get instance details with health status
   *
   * @param instanceId - Instance ID (string UUID)
   * @param req - Authenticated request
   * @returns Instance details
   *
   * @example
   * GET /api/user/instances/abc-123-def
   */
  @Get('/instances/:instanceId')
  async getInstanceWithHealth(
    @Param('instanceId') instanceId: string,
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      const instance = await this.userInstanceService.getInstanceWithHealth(
        userId,
        instanceId
      );

      if (!instance) {
        return {
          success: false,
          error: 'Instance not found or access denied'
        };
      }

      return {
        success: true,
        instance
      };
    } catch (error: any) {
      logger.error('Failed to get instance details', {
        instanceId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to get instance details'
      };
    }
  }

  /**
   * GET /api/user/summary
   *
   * Get user's dashboard summary
   * Includes total instances, total conversations, recent activity
   *
   * @param req - Authenticated request
   * @returns User summary
   *
   * @example
   * GET /api/user/summary
   */
  @Get('/summary')
  async getUserSummary(@Req() req: AuthRequest) {
    try {
      const userId = req.user!.userId;

      const instances = await this.userInstanceService.getUserInstances(userId);
      const recentInstances = await this.userInstanceService.getRecentInstances(userId, 3);

      // Calculate summary statistics
      const totalInstances = instances.length;
      const totalConversations = instances.reduce((sum, inst) => sum + inst.conversationCount, 0);
      const activeInstances = instances.filter(inst => inst.status === 'running' || inst.status === 'active').length;

      return {
        success: true,
        summary: {
          totalInstances,
          activeInstances,
          totalConversations,
          recentInstances: recentInstances.slice(0, 3)
        }
      };
    } catch (error: any) {
      logger.error('Failed to get user summary', {
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to get user summary'
      };
    }
  }
}
