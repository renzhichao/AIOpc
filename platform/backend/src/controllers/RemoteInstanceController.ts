/**
 * Remote Instance Registration Controller
 *
 * Handles HTTP API endpoints for remote OpenClaw Agent instances.
 * Remote instances are self-hosted agents that register with the platform.
 *
 * Endpoints:
 * - POST /api/instances/register - Register a new remote instance
 * - POST /api/instances/:instanceId/heartbeat - Send heartbeat
 * - DELETE /api/instances/:instanceId/unregister - Unregister instance
 * - GET /api/instances/:instanceId/verify - Verify instance registration
 */

import { Controller, Post, Delete, Get, Body, Param, Req, Header } from 'routing-controllers';
import { Service } from 'typedi';
import { RemoteInstanceService } from '../services/RemoteInstanceService';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors/AppError';
import { ErrorCodes } from '../utils/errors/ErrorCodes';

@Service()
@Controller('/api/instances')
export class RemoteInstanceController {
  constructor(
    private readonly remoteInstanceService: RemoteInstanceService
  ) {}

  /**
   * Register a new remote instance
   *
   * POST /api/instances/register
   *
   * This endpoint is called by remote OpenClaw Agents when they start up.
   * The agent provides its connection details and capabilities.
   *
   * Request body:
   * {
   *   "deployment_type": "remote",
   *   "hostname": "101.34.254.52",
   *   "port": 3000,
   *   "version": "1.0.0",
   *   "capabilities": ["chat", "web_search", "code_execution"],
   *   "metadata": { "region": "cn-north", "provider": "aliyun" }
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "instance_id": "inst-remote-xxx",
   *     "platform_api_key": "sk-remote-xxx",
   *     "heartbeat_interval": 30000,
   *     "websocket_url": "ws://platform:3001",
   *     "registered_at": "2026-03-16T14:30:00Z",
   *     "platform_url": "http://118.25.0.190"
   *   }
   * }
   */
  @Post('/register')
  async registerInstance(@Body() body: any, @Req() req: any) {
    try {
      logger.info('Remote instance registration request', {
        ip: req.ip,
        hostname: body.hostname,
        version: body.version
      });

      // Validate request body
      if (body.deployment_type !== 'remote') {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR.statusCode,
          ErrorCodes.VALIDATION_ERROR.code,
          'deployment_type must be "remote"'
        );
      }

      // Register instance
      const registrationResponse = await this.remoteInstanceService.registerInstance({
        deployment_type: 'remote',
        hostname: body.hostname,
        port: body.port,
        version: body.version,
        capabilities: body.capabilities || [],
        metadata: body.metadata
      });

      return {
        success: true,
        data: registrationResponse
      };
    } catch (error) {
      logger.error('Failed to register remote instance', {
        error: error instanceof Error ? error.message : String(error),
        body: body
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to register remote instance'
      );
    }
  }

  /**
   * Send heartbeat from remote instance
   *
   * POST /api/instances/:instanceId/heartbeat
   *
   * This endpoint is called periodically by remote instances to:
   * - Signal they are still alive
   * - Report current status and metrics
   * - Receive pending commands from platform
   *
   * Headers:
   *   X-Platform-API-Key: sk-remote-xxx
   *
   * Request body:
   * {
   *   "timestamp": 1678123456789,
   *   "status": "online",
   *   "metrics": {
   *     "cpu_usage": 25.5,
   *     "memory_usage": 512,
   *     "active_sessions": 3,
   *     "messages_processed": 150
   *   }
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "status": "ok",
   *     "server_time": 1678123456790,
   *     "next_heartbeat": 30000,
   *     "commands": []
   *   }
   * }
   */
  @Post('/:instanceId/heartbeat')
  async sendHeartbeat(
    @Param('instanceId') instanceId: string,
    @Body() body: any,
    @Req() req: any
  ) {
    try {
      // Extract API key from header
      const platformApiKey = req.headers['x-platform-api-key'] as string;

      // Validate API key
      if (!platformApiKey) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'X-Platform-API-Key header is required'
        );
      }

      // Process heartbeat
      const heartbeatResponse = await this.remoteInstanceService.processHeartbeat(
        instanceId,
        platformApiKey,
        {
          timestamp: body.timestamp || Date.now(),
          status: body.status || 'online',
          metrics: body.metrics || {
            cpu_usage: 0,
            memory_usage: 0,
            active_sessions: 0,
            messages_processed: 0
          }
        }
      );

      return {
        success: true,
        data: heartbeatResponse
      };
    } catch (error) {
      logger.error('Failed to process heartbeat', {
        instance_id: instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to process heartbeat'
      );
    }
  }

  /**
   * Unregister a remote instance
   *
   * DELETE /api/instances/:instanceId/unregister
   *
   * This endpoint is called by remote instances when they are shutting down
   * or want to disconnect from the platform.
   *
   * Headers:
   *   X-Platform-API-Key: sk-remote-xxx
   *
   * Request body:
   * {
   *   "reason": "Agent shutting down"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "status": "ok",
   *     "unregistered_at": "2026-03-16T15:30:00Z"
   *   }
   * }
   */
  @Delete('/:instanceId/unregister')
  async unregisterInstance(
    @Param('instanceId') instanceId: string,
    @Body() body: any,
    @Req() req: any
  ) {
    try {
      // Extract API key from header
      const platformApiKey = req.headers['x-platform-api-key'] as string;

      // Validate API key
      if (!platformApiKey) {
        throw new AppError(
          ErrorCodes.UNAUTHORIZED.statusCode,
          ErrorCodes.UNAUTHORIZED.code,
          'X-Platform-API-Key header is required'
        );
      }

      // Validate reason
      const reason = body.reason || 'No reason provided';

      // Unregister instance
      const unregisterResponse = await this.remoteInstanceService.unregisterInstance(
        instanceId,
        platformApiKey,
        reason
      );

      logger.info('Remote instance unregistered', {
        instance_id: instanceId,
        reason: reason
      });

      return {
        success: true,
        data: unregisterResponse
      };
    } catch (error) {
      logger.error('Failed to unregister instance', {
        instance_id: instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to unregister instance'
      );
    }
  }

  /**
   * Verify instance registration
   *
   * GET /api/instances/:instanceId/verify
   *
   * This endpoint allows remote instances to verify their registration status.
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "valid": true,
   *     "instance": {
   *       "instance_id": "inst-remote-xxx",
   *       "deployment_type": "remote",
   *       "status": "active",
   *       "registered_at": "2026-03-16T14:30:00Z",
   *       "last_heartbeat_at": "2026-03-16T15:30:00Z"
   *     }
   *   }
   * }
   */
  @Get('/:instanceId/verify')
  async verifyInstance(@Param('instanceId') instanceId: string, @Req() req: any) {
    try {
      const registrationInfo = await this.remoteInstanceService.getRegistrationInfo(instanceId);

      return {
        success: true,
        data: {
          valid: true,
          instance: registrationInfo
        }
      };
    } catch (error) {
      logger.error('Failed to verify instance', {
        instance_id: instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Return valid: false instead of throwing error
      return {
        success: true,
        data: {
          valid: false,
          error: error instanceof Error ? error.message : 'Instance not found'
        }
      };
    }
  }
}
