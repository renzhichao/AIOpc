import { Controller, Get, Post, Delete, Put, Body, Param, QueryParam, Req } from 'routing-controllers';
import { Service } from 'typedi';
import { InstanceService } from '../services/InstanceService';
import { logger } from '../config/logger';
import { AppError, ErrorCodes } from '../utils/errors';

/**
 * Instance Controller
 *
 * RESTful API endpoints for OpenClaw instance lifecycle management.
 * All endpoints require authentication via @UseBefore decorator in routing-controllers.
 */
@Controller('/instances')
export class InstanceController {
  constructor(
    private readonly instanceService: InstanceService
  ) {}

  /**
   * Create a new OpenClaw instance
   * POST /api/instances
   *
   * Request body:
   * {
   *   "template": "personal" | "team" | "enterprise",
   *   "config": {
   *     "name": "My Instance",
   *     "description": "Optional description"
   *   }
   * }
   */
  @Post()
  async createInstance(@Body() body: any, @Req() req: any) {
    try {
      // Extract user from request (set by auth middleware)
      const user = req.user;

      if (!user || !user.id) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'User not authenticated'
        );
      }

      // Validate template
      const validTemplates = ['personal', 'team', 'enterprise'];
      if (!body.template || !validTemplates.includes(body.template)) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR.statusCode,
          ErrorCodes.VALIDATION_ERROR.code,
          'Invalid template. Must be one of: personal, team, enterprise'
        );
      }

      const instance = await this.instanceService.createInstance(user, {
        template: body.template,
        config: body.config || {}
      });

      return {
        success: true,
        data: instance,
        message: 'Instance created successfully'
      };
    } catch (error) {
      logger.error('Failed to create instance', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to create instance'
      );
    }
  }

  /**
   * List all instances for the authenticated user
   * GET /api/instances
   *
   * Query params:
   * - status: Filter by status (pending, active, stopped, error)
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 20)
   */
  @Get()
  async listInstances(
    @Req() req: any,
    @QueryParam('status') status?: string,
    @QueryParam('page') page: string = '1',
    @QueryParam('limit') limit: string = '20'
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

      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 20;
      const offset = (pageNum - 1) * limitNum;

      const instances = await this.instanceService.getUserInstances(
        user.id,
        status,
        limitNum,
        offset
      );

      const total = await this.instanceService.countUserInstances(user.id, status);

      return {
        success: true,
        data: instances,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      };
    } catch (error) {
      logger.error('Failed to list instances', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to list instances'
      );
    }
  }

  /**
   * Get instance details by ID
   * GET /api/instances/:id
   */
  @Get('/:id')
  async getInstance(@Param('id') id: string, @Req() req: any) {
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
      if (instance.owner_id !== user.id) {
        throw new AppError(
          ErrorCodes.FORBIDDEN.statusCode,
          ErrorCodes.FORBIDDEN.code,
          'Access denied to this instance'
        );
      }

      // Get instance stats
      const stats = await this.instanceService.getInstanceStats(id);

      return {
        success: true,
        data: {
          ...instance,
          stats
        }
      };
    } catch (error) {
      logger.error('Failed to get instance', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to get instance details'
      );
    }
  }

  /**
   * Start an instance
   * POST /api/instances/:id/start
   */
  @Post('/:id/start')
  async startInstance(@Param('id') id: string, @Req() req: any) {
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
      if (instance.owner_id !== user.id) {
        throw new AppError(
          ErrorCodes.FORBIDDEN.statusCode,
          ErrorCodes.FORBIDDEN.code,
          'Access denied to this instance'
        );
      }

      const result = await this.instanceService.startInstance(id);

      return {
        success: true,
        data: result,
        message: 'Instance started successfully'
      };
    } catch (error) {
      logger.error('Failed to start instance', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to start instance'
      );
    }
  }

  /**
   * Stop an instance
   * POST /api/instances/:id/stop
   */
  @Post('/:id/stop')
  async stopInstance(@Param('id') id: string, @Req() req: any) {
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
      if (instance.owner_id !== user.id) {
        throw new AppError(
          ErrorCodes.FORBIDDEN.statusCode,
          ErrorCodes.FORBIDDEN.code,
          'Access denied to this instance'
        );
      }

      const result = await this.instanceService.stopInstance(id);

      return {
        success: true,
        data: result,
        message: 'Instance stopped successfully'
      };
    } catch (error) {
      logger.error('Failed to stop instance', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to stop instance'
      );
    }
  }

  /**
   * Restart an instance
   * POST /api/instances/:id/restart
   */
  @Post('/:id/restart')
  async restartInstance(@Param('id') id: string, @Req() req: any) {
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
      if (instance.owner_id !== user.id) {
        throw new AppError(
          ErrorCodes.FORBIDDEN.statusCode,
          ErrorCodes.FORBIDDEN.code,
          'Access denied to this instance'
        );
      }

      const result = await this.instanceService.restartInstance(id);

      return {
        success: true,
        data: result,
        message: 'Instance restarted successfully'
      };
    } catch (error) {
      logger.error('Failed to restart instance', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to restart instance'
      );
    }
  }

  /**
   * Delete an instance
   * DELETE /api/instances/:id
   */
  @Delete('/:id')
  async deleteInstance(@Param('id') id: string, @Req() req: any) {
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
      if (instance.owner_id !== user.id) {
        throw new AppError(
          ErrorCodes.FORBIDDEN.statusCode,
          ErrorCodes.FORBIDDEN.code,
          'Access denied to this instance'
        );
      }

      await this.instanceService.deleteInstance(id);

      return {
        success: true,
        message: 'Instance deleted successfully'
      };
    } catch (error) {
      logger.error('Failed to delete instance', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to delete instance'
      );
    }
  }

  /**
   * Get instance logs
   * GET /api/instances/:id/logs
   *
   * Query params:
   * - lines: Number of lines to retrieve (default: 100)
   */
  @Get('/:id/logs')
  async getInstanceLogs(
    @Param('id') id: string,
    @Req() req: any,
    @QueryParam('lines') lines: string = '100'
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

      const instance = await this.instanceService.getInstanceById(id);

      if (!instance) {
        throw new AppError(
          ErrorCodes.NOT_FOUND.statusCode,
          ErrorCodes.NOT_FOUND.code,
          `Instance ${id} not found`
        );
      }

      // Check ownership
      if (instance.owner_id !== user.id) {
        throw new AppError(
          ErrorCodes.FORBIDDEN.statusCode,
          ErrorCodes.FORBIDDEN.code,
          'Access denied to this instance'
        );
      }

      const logLines = parseInt(lines) || 100;
      const logs = await this.instanceService.getInstanceLogs(id, logLines);

      return {
        success: true,
        data: {
          instance_id: id,
          logs,
          lines: logLines
        }
      };
    } catch (error) {
      logger.error('Failed to get instance logs', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to get instance logs'
      );
    }
  }
}
