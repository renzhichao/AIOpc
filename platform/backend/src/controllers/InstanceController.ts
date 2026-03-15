import { Controller, Get, Post, Delete, Put, Patch, Body, Param, QueryParam, Req } from 'routing-controllers';
import { Service } from 'typedi';
import { InstanceService } from '../services/InstanceService';
import { QRCodeService } from '../services/QRCodeService';
import { RenewalService } from '../services/RenewalService';
import { ConfigValidationService } from '../services/ConfigValidationService';
import { logger } from '../config/logger';
import { AppError, ErrorCodes } from '../utils/errors';

/**
 * Instance Controller
 *
 * RESTful API endpoints for OpenClaw instance lifecycle management.
 * All endpoints require authentication via @UseBefore decorator in routing-controllers.
 */
@Service()
@Controller('/instances')
export class InstanceController {
  constructor(
    private readonly instanceService: InstanceService,
    private readonly qrCodeService: QRCodeService,
    private readonly renewalService: RenewalService,
    private readonly configValidationService: ConfigValidationService
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

  /**
   * Get QR code for instance claim
   * GET /api/instances/:id/qr-code
   *
   * Generates or retrieves the QR code for claiming an instance.
   * QR codes are valid for 24 hours and include anti-tampering signatures.
   */
  @Get('/:id/qr-code')
  async getQRCode(@Param('id') id: string, @Req() req: any) {
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

      // Generate or retrieve QR code
      const qrData = await this.qrCodeService.generateQRCode(id);

      return {
        success: true,
        data: qrData
      };
    } catch (error) {
      logger.error('Failed to get QR code for instance', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to get QR code'
      );
    }
  }

  /**
   * Renew an instance
   * POST /api/instances/:id/renew
   *
   * Extends the expiration date of an instance by the specified duration.
   * Only the instance owner can renew.
   *
   * Request body:
   * {
   *   "duration_days": 30 | 90 | 180
   * }
   */
  @Post('/:id/renew')
  async renewInstance(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    try {
      const user = req.user;

      if (!user || !user.id) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'User not authenticated'
        );
      }

      // Validate duration_days
      const validDurations = [30, 90, 180];
      const durationDays = body.duration_days;

      if (!durationDays || !validDurations.includes(durationDays)) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR.statusCode,
          ErrorCodes.VALIDATION_ERROR.code,
          `Invalid duration. Must be one of: ${validDurations.join(', ')} days`
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

      // Calculate new expiration date
      const oldExpiresAt = instance.expires_at ? new Date(instance.expires_at) : new Date();
      const newExpiresAt = new Date(oldExpiresAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

      // Update instance expiration
      await this.instanceService.updateExpirationDate(id, newExpiresAt);

      // Record renewal history
      await this.renewalService.record({
        instance_id: id,
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt,
        duration_days: durationDays,
        renewed_by: user.id
      });

      // Get updated instance
      const updatedInstance = await this.instanceService.getInstanceById(id);

      return {
        success: true,
        data: {
          instance_id: id,
          old_expires_at: oldExpiresAt,
          new_expires_at: newExpiresAt,
          extended_days: durationDays,
          instance: updatedInstance
        },
        message: `Instance renewed successfully for ${durationDays} days`
      };
    } catch (error) {
      logger.error('Failed to renew instance', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to renew instance'
      );
    }
  }

  /**
   * Get renewal history for an instance
   * GET /api/instances/:id/renewals
   *
   * Returns all renewal records for the specified instance.
   * Only the instance owner can view.
   */
  @Get('/:id/renewals')
  async getRenewalHistory(@Param('id') id: string, @Req() req: any) {
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

      const renewals = await this.renewalService.findByInstance(id);

      return {
        success: true,
        data: {
          instance_id: id,
          renewals,
          total_renewals: renewals.length
        }
      };
    } catch (error) {
      logger.error('Failed to get renewal history', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to get renewal history'
      );
    }
  }

  /**
   * Get instance configuration
   * GET /api/instances/:id/config
   *
   * Returns the current configuration for an instance.
   * Only the instance owner can view.
   */
  @Get('/:id/config')
  async getInstanceConfig(@Param('id') id: string, @Req() req: any) {
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

      return {
        success: true,
        data: {
          instance_id: id,
          config: instance.config
        }
      };
    } catch (error) {
      logger.error('Failed to get instance config', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to get instance configuration'
      );
    }
  }

  /**
   * Update instance configuration
   * PATCH /api/instances/:id/config
   *
   * Updates the configuration for an instance.
   * Only the instance owner can update.
   *
   * Request body:
   * {
   *   "llm": { ... },  // Optional: LLM configuration
   *   "skills": [ ... ],  // Optional: Skills configuration
   *   "tools": [ ... ],  // Optional: Tools configuration
   *   "system_prompt": "...",  // Optional: System prompt
   *   "limits": { ... }  // Optional: Usage limits
   * }
   */
  @Patch('/:id/config')
  async updateInstanceConfig(@Param('id') id: string, @Body() body: any, @Req() req: any) {
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

      // Validate configuration update
      const validatedConfig = this.configValidationService.validateConfigUpdate(
        instance.config,
        body
      );

      // Update instance configuration
      const updatedInstance = await this.instanceService.updateConfig(id, validatedConfig);

      logger.info('Instance configuration updated', {
        instanceId: id,
        userId: user.id
      });

      return {
        success: true,
        data: {
          instance_id: id,
          config: updatedInstance.config
        },
        message: 'Instance configuration updated successfully'
      };
    } catch (error) {
      logger.error('Failed to update instance config', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to update instance configuration'
      );
    }
  }
}
