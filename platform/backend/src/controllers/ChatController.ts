import { Service } from 'typedi';
import { JsonController, Post, Get, Body, Req, UseBefore } from 'routing-controllers';
import { AuthMiddleware, AuthRequest } from '../middleware/AuthMiddleware';
import { WebSocketMessageRouter, MessageRouteResult } from '../services/WebSocketMessageRouter';
import { InstanceRegistry, InstanceInfo } from '../services/InstanceRegistry';
import { logger } from '../config/logger';

/**
 * Chat Controller
 *
 * RESTful API endpoints for chat functionality including:
 * - Sending messages to AI instances
 * - Querying instance status
 * - Retrieving chat history (placeholder for P1)
 *
 * All endpoints require authentication via AuthMiddleware.
 *
 * @service
 * @controller
 */
@Service()
@JsonController('/chat')
@UseBefore(AuthMiddleware)
export class ChatController {
  constructor(
    private readonly messageRouter: WebSocketMessageRouter,
    private readonly instanceRegistry: InstanceRegistry
  ) {}

  /**
   * POST /chat/send
   *
   * Send a message to the user's AI instance.
   *
   * Validates message content, routes through MessageRouter to the user's instance,
   * and returns the message ID and timestamp on success.
   *
   * @param body - Request body containing message content
   * @param req - Authenticated request with user information
   * @returns Success response with message_id and timestamp, or error response
   *
   * @example
   * // Request
   * POST /api/chat/send
   * {
   *   "content": "Hello, AI assistant!"
   * }
   *
   * // Response (Success)
   * {
   *   "success": true,
   *   "message_id": "msg-abc123",
   *   "timestamp": "2026-03-17T00:30:00.000Z"
   * }
   *
   * // Response (Error - Empty message)
   * {
   *   "success": false,
   *   "error": "Message content is required and cannot be empty"
   * }
   *
   * // Response (Error - Instance offline)
   * {
   *   "success": false,
   *   "error": "Instance is offline. Please try again later."
   * }
   */
  @Post('/send')
  async sendMessage(
    @Body() body: { content: string },
    @Req() req: AuthRequest
  ): Promise<{
    success: boolean;
    message_id?: string;
    timestamp?: string;
    error?: string;
  }> {
    try {
      // Validate message content
      if (!body?.content?.trim()) {
        logger.warn('Empty message content received', {
          userId: req.user?.userId,
        });

        return {
          success: false,
          error: 'Message content is required and cannot be empty',
        };
      }

      const trimmedContent = body.content.trim();

      logger.info('Sending message to instance', {
        userId: req.user?.userId,
        contentLength: trimmedContent.length,
      });

      // Route message via MessageRouter
      const result: MessageRouteResult = await this.messageRouter.routeUserMessage(
        req.user!.userId,
        trimmedContent
      );

      logger.info('Message sent successfully', {
        userId: req.user?.userId,
        messageId: result.message_id,
        instanceId: result.instance_id,
      });

      return {
        success: true,
        message_id: result.message_id,
        timestamp: result.timestamp,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to send message', {
        userId: req.user?.userId,
        error: errorMessage,
      });

      // Handle specific error cases
      if (errorMessage.includes('offline')) {
        return {
          success: false,
          error: 'Instance is offline. Please try again later.',
        };
      }

      if (errorMessage.includes('No instance found')) {
        return {
          success: false,
          error: 'No instance found for this user. Please create an instance first.',
        };
      }

      // Generic error response
      return {
        success: false,
        error: 'Failed to send message. Please try again.',
      };
    }
  }

  /**
   * GET /chat/status
   *
   * Get the connection status of the user's AI instance.
   *
   * Queries the InstanceRegistry for the user's instance and returns
   * detailed status information including connection type and heartbeat.
   *
   * @param req - Authenticated request with user information
   * @returns Success response with instance details, or error response
   *
   * @example
   * // Request
   * GET /api/chat/status
   *
   * // Response (Success)
   * {
   *   "success": true,
   *   "instance": {
   *     "instance_id": "inst-xyz789",
   *     "status": "online",
   *     "connection_type": "local",
   *     "last_heartbeat": "2026-03-17T00:29:45.000Z"
   *   }
   * }
   *
   * // Response (Error - No instance)
   * {
   *   "success": false,
   *   "error": "No instance found for this user"
   * }
   */
  @Get('/status')
  async getStatus(
    @Req() req: AuthRequest
  ): Promise<{
    success: boolean;
    instance?: {
      instance_id: string;
      status: 'online' | 'offline' | 'error';
      connection_type: 'local' | 'remote';
      last_heartbeat: string;
    };
    error?: string;
  }> {
    try {
      logger.debug('Getting instance status', {
        userId: req.user?.userId,
      });

      // Get user's instance from registry
      const instance: InstanceInfo | null = await this.instanceRegistry.getUserInstance(
        req.user!.userId
      );

      if (!instance) {
        logger.warn('No instance found for user', {
          userId: req.user?.userId,
        });

        return {
          success: false,
          error: 'No instance found for this user',
        };
      }

      logger.info('Instance status retrieved', {
        userId: req.user?.userId,
        instanceId: instance.instance_id,
        status: instance.status,
      });

      return {
        success: true,
        instance: {
          instance_id: instance.instance_id,
          status: instance.status,
          connection_type: instance.connection_type,
          last_heartbeat: new Date(instance.last_heartbeat).toISOString(),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to get instance status', {
        userId: req.user?.userId,
        error: errorMessage,
      });

      return {
        success: false,
        error: 'Failed to get instance status',
      };
    }
  }

  /**
   * GET /chat/history
   *
   * Get chat message history.
   *
   * **PLACEHOLDER**: This endpoint is a placeholder for P1 implementation.
   * Currently returns a success message with an empty history array.
   *
   * @param req - Authenticated request with user information
   * @returns Success response with placeholder message
   *
   * @example
   * // Request
   * GET /api/chat/history
   *
   * // Response (Current - Placeholder)
   * {
   *   "success": true,
   *   "message": "Chat history feature will be implemented in P1 phase",
   *   "history": []
   * }
   *
   * @remarks
   * This endpoint will be fully implemented in P1 phase with:
   * - Database integration for message persistence
   * - Pagination support
   * - Date range filtering
   * - Message search capabilities
   */
  @Get('/history')
  async getHistory(
    @Req() req: AuthRequest
  ): Promise<{
    success: boolean;
    message: string;
    history: any[];
  }> {
    logger.info('Chat history requested (placeholder)', {
      userId: req.user?.userId,
    });

    return {
      success: true,
      message: 'Chat history feature will be implemented in P1 phase',
      history: [],
    };
  }
}
