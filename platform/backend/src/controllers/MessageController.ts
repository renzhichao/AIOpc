import { Service } from 'typedi';
import { JsonController, Get, Post, Body, Param, Query, Req, UseBefore } from 'routing-controllers';
import { AuthMiddleware, AuthRequest } from '../middleware/AuthMiddleware';
import { MessageService, CreateMessageDto } from '../services/MessageService';
import { logger } from '../config/logger';

/**
 * Message Controller
 *
 * RESTful API endpoints for message management within conversations:
 * - Add messages to conversations
 * - Get messages for a conversation
 * - Get message statistics
 *
 * All endpoints require authentication via AuthMiddleware.
 *
 * @service
 * @controller
 */
@Service()
@JsonController('/api/conversations')
@UseBefore(AuthMiddleware)
export class MessageController {
  constructor(
    private readonly messageService: MessageService
  ) {}

  /**
   * POST /api/conversations/:conversationId/messages
   *
   * Add a new message to a conversation
   *
   * @param conversationId - Conversation UUID
   * @param body - Message data
   * @param req - Authenticated request
   * @returns Created message details
   *
   * @example
   * POST /api/conversations/abc-123-def/messages
   * {
   *   "role": "user",
   *   "content": "你好，请帮我分析这个问题"
   * }
   */
  @Post('/:conversationId/messages')
  async addMessage(
    @Param('conversationId') conversationId: string,
    @Body() body: {
      role: 'user' | 'assistant' | 'system';
      content: string;
      toolCalls?: any[];
      toolResults?: any[];
      metadata?: Record<string, any>;
    },
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      const dto: CreateMessageDto = {
        conversationId,
        role: body.role,
        content: body.content,
        toolCalls: body.toolCalls,
        toolResults: body.toolResults,
        metadata: body.metadata
      };

      const message = await this.messageService.addMessage(dto, userId);

      logger.info('Message added via API', {
        messageId: message.id,
        conversationId,
        userId,
        role: body.role
      });

      return {
        success: true,
        message: {
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.created_at
        }
      };
    } catch (error: any) {
      logger.error('Failed to add message', {
        conversationId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to add message'
      };
    }
  }

  /**
   * GET /api/conversations/:conversationId/messages
   *
   * Get all messages for a conversation (paginated)
   *
   * @param conversationId - Conversation UUID
   * @param page - Page number (default: 1)
   * @param pageSize - Items per page (default: 50)
   * @param req - Authenticated request
   * @returns Paginated list of messages
   *
   * @example
   * GET /api/conversations/abc-123-def/messages?page=1&pageSize=50
   */
  @Get('/:conversationId/messages')
  async getMessages(
    @Param('conversationId') conversationId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 50,
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      const result = await this.messageService.getConversationMessages(
        conversationId,
        userId,
        page,
        pageSize
      );

      return {
        success: true,
        ...result
      };
    } catch (error: any) {
      logger.error('Failed to get messages', {
        conversationId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to get messages'
      };
    }
  }

  /**
   * GET /api/conversations/:conversationId/messages/statistics
   *
   * Get message statistics for a conversation
   *
   * @param conversationId - Conversation UUID
   * @param req - Authenticated request
   * @returns Message statistics
   *
   * @example
   * GET /api/conversations/abc-123-def/messages/statistics
   */
  @Get('/:conversationId/messages/statistics')
  async getMessageStatistics(
    @Param('conversationId') conversationId: string,
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      const stats = await this.messageService.getMessageStatistics(
        conversationId,
        userId
      );

      return {
        success: true,
        statistics: stats
      };
    } catch (error: any) {
      logger.error('Failed to get message statistics', {
        conversationId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to get message statistics'
      };
    }
  }

  /**
   * POST /api/conversations/:conversationId/messages/bulk
   *
   * Bulk add messages to a conversation
   * Used for conversation import/export (Phase 2)
   *
   * @param conversationId - Conversation UUID
   * @param body - Array of messages
   * @param req - Authenticated request
   * @returns Created messages
   *
   * @example
   * POST /api/conversations/abc-123-def/messages/bulk
   * {
   *   "messages": [
   *     { "role": "user", "content": "你好" },
   *     { "role": "assistant", "content": "你好！有什么可以帮助你的？" }
   *   ]
   * }
   */
  @Post('/:conversationId/messages/bulk')
  async bulkAddMessages(
    @Param('conversationId') conversationId: string,
    @Body() body: { messages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      toolCalls?: any[];
      toolResults?: any[];
      metadata?: Record<string, any>;
    }> },
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      const messages = body.messages.map(msg => ({
        conversationId,
        ...msg
      }));

      const created = await this.messageService.bulkAddMessages(
        conversationId,
        messages,
        userId
      );

      logger.info('Bulk messages added via API', {
        conversationId,
        userId,
        count: created.length
      });

      return {
        success: true,
        messages: created.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: msg.created_at
        }))
      };
    } catch (error: any) {
      logger.error('Failed to bulk add messages', {
        conversationId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to bulk add messages'
      };
    }
  }

  /**
   * GET /api/conversations/:conversationId/messages/generate-title
   *
   * Auto-generate conversation title from first message
   * Phase 2: Use AI to generate meaningful titles
   *
   * @param conversationId - Conversation UUID
   * @param req - Authenticated request
   * @returns Generated title
   *
   * @example
   * GET /api/conversations/abc-123-def/messages/generate-title
   */
  @Get('/:conversationId/messages/generate-title')
  async generateTitle(
    @Param('conversationId') conversationId: string,
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      const title = await this.messageService.generateConversationTitle(
        conversationId,
        userId
      );

      return {
        success: true,
        title
      };
    } catch (error: any) {
      logger.error('Failed to generate title', {
        conversationId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to generate title'
      };
    }
  }

  /**
   * GET /api/conversations/:conversationId/messages/sync
   *
   * Get messages after a specific timestamp (for incremental sync)
   * Phase 2: Implement real-time message synchronization
   *
   * @param conversationId - Conversation UUID
   * @param timestamp - ISO timestamp string
   * @param req - Authenticated request
   * @returns New messages since timestamp
   *
   * @example
   * GET /api/conversations/abc-123-def/messages/sync?timestamp=2026-03-19T10:00:00Z
   */
  @Get('/:conversationId/messages/sync')
  async syncMessages(
    @Param('conversationId') conversationId: string,
    @Query('timestamp') timestamp: string,
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return {
          success: false,
          error: 'Invalid timestamp format'
        };
      }

      const messages = await this.messageService.getMessagesAfter(
        conversationId,
        date,
        userId
      );

      return {
        success: true,
        messages: messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          toolCalls: msg.tool_calls,
          toolResults: msg.tool_results,
          createdAt: msg.created_at
        }))
      };
    } catch (error: any) {
      logger.error('Failed to sync messages', {
        conversationId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to sync messages'
      };
    }
  }
}
