import { Service } from 'typedi';
import { JsonController, Get, Post, Patch, Delete, Body, Param, QueryParam, Req, UseBefore } from 'routing-controllers';
import { AuthMiddleware, AuthRequest } from '../middleware/AuthMiddleware';
import { ConversationService, CreateConversationDto, UpdateConversationDto } from '../services/ConversationService';
import { logger } from '../config/logger';

/**
 * Conversation Controller
 *
 * RESTful API endpoints for conversation management:
 * - Create new conversations
 * - List user's conversations
 * - Get conversation details with messages
 * - Update conversation (rename, archive)
 * - Delete conversations
 *
 * All endpoints require authentication via AuthMiddleware.
 *
 * @service
 * @controller
 */
@Service()
@JsonController('/api/conversations')
@UseBefore(AuthMiddleware)
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService
  ) {}

  /**
   * POST /api/conversations
   *
   * Create a new conversation for an instance
   *
   * @param body - Request body with userId, instanceId, and optional title
   * @param req - Authenticated request
   * @returns Created conversation details
   *
   * @example
   * POST /api/conversations
   * {
   *   "instanceId": 123,
   *   "title": "我的对话"
   * }
   */
  @Post('/')
  async createConversation(
    @Body() body: { instanceId: number; title?: string },
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      const dto: CreateConversationDto = {
        userId,
        instanceId: body.instanceId,
        title: body.title
      };

      const conversation = await this.conversationService.createConversation(dto);

      logger.info('Conversation created via API', {
        conversationId: conversation.id,
        userId,
        instanceId: body.instanceId
      });

      return {
        success: true,
        conversation: {
          id: conversation.id,
          title: conversation.title,
          instanceId: conversation.instance_id,
          createdAt: conversation.created_at
        }
      };
    } catch (error: any) {
      logger.error('Failed to create conversation', {
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to create conversation'
      };
    }
  }

  /**
   * GET /api/conversations
   *
   * Get all conversations for the authenticated user
   * Supports filtering by instance and pagination
   *
   * @param instanceId - Optional filter by instance ID
   * @param page - Page number (default: 1)
   * @param pageSize - Items per page (default: 20)
   * @param req - Authenticated request
   * @returns Paginated list of conversations
   *
   * @example
   * GET /api/conversations?instanceId=123&page=1&pageSize=20
   */
  @Get('/')
  async getConversations(
    @QueryParam('instanceId') instanceId?: number,
    @QueryParam('page') page: number = 1,
    @QueryParam('pageSize') pageSize: number = 20,
    @Req() req?: AuthRequest
  ) {
    try {
      const userId = req!.user!.userId;

      const result = await this.conversationService.getUserConversations(
        userId,
        instanceId,
        page,
        pageSize
      );

      return {
        success: true,
        ...result
      };
    } catch (error: any) {
      logger.error('Failed to get conversations', {
        userId: req?.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to get conversations'
      };
    }
  }

  /**
   * GET /api/conversations/:conversationId
   *
   * Get conversation details with all messages
   *
   * @param conversationId - Conversation UUID
   * @param req - Authenticated request
   * @returns Conversation details with messages
   *
   * @example
   * GET /api/conversations/abc-123-def
   */
  @Get('/:conversationId')
  async getConversation(
    @Param('conversationId') conversationId: string,
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      const conversation = await this.conversationService.getConversationDetail(
        conversationId,
        userId
      );

      return {
        success: true,
        conversation
      };
    } catch (error: any) {
      logger.error('Failed to get conversation', {
        conversationId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to get conversation'
      };
    }
  }

  /**
   * PATCH /api/conversations/:conversationId
   *
   * Update conversation (rename or archive)
   *
   * @param conversationId - Conversation UUID
   * @param body - Update data
   * @param req - Authenticated request
   * @returns Updated conversation
   *
   * @example
   * PATCH /api/conversations/abc-123-def
   * {
   *   "title": "新标题"
   * }
   */
  @Patch('/:conversationId')
  async updateConversation(
    @Param('conversationId') conversationId: string,
    @Body() body: UpdateConversationDto,
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      const conversation = await this.conversationService.updateConversation(
        conversationId,
        userId,
        body
      );

      return {
        success: true,
        conversation: {
          id: conversation.id,
          title: conversation.title,
          isArchived: conversation.is_archived
        }
      };
    } catch (error: any) {
      logger.error('Failed to update conversation', {
        conversationId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to update conversation'
      };
    }
  }

  /**
   * DELETE /api/conversations/:conversationId
   *
   * Delete a conversation and all its messages
   *
   * @param conversationId - Conversation UUID
   * @param req - Authenticated request
   * @returns Success confirmation
   *
   * @example
   * DELETE /api/conversations/abc-123-def
   */
  @Delete('/:conversationId')
  async deleteConversation(
    @Param('conversationId') conversationId: string,
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      await this.conversationService.deleteConversation(conversationId, userId);

      logger.info('Conversation deleted via API', {
        conversationId,
        userId
      });

      return {
        success: true,
        message: '会话已删除'
      };
    } catch (error: any) {
      logger.error('Failed to delete conversation', {
        conversationId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to delete conversation'
      };
    }
  }

  /**
   * PATCH /api/conversations/:conversationId/rename
   *
   * Rename a conversation
   *
   * @param conversationId - Conversation UUID
   * @param body - New title
   * @param req - Authenticated request
   * @returns Updated conversation
   *
   * @example
   * PATCH /api/conversations/abc-123-def/rename
   * {
   *   "title": "新标题"
   * }
   */
  @Patch('/:conversationId/rename')
  async renameConversation(
    @Param('conversationId') conversationId: string,
    @Body() body: { title: string },
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      const conversation = await this.conversationService.renameConversation(
        conversationId,
        userId,
        body.title
      );

      return {
        success: true,
        conversation: {
          id: conversation.id,
          title: conversation.title
        }
      };
    } catch (error: any) {
      logger.error('Failed to rename conversation', {
        conversationId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to rename conversation'
      };
    }
  }

  /**
   * PATCH /api/conversations/:conversationId/archive
   *
   * Archive or unarchive a conversation
   *
   * @param conversationId - Conversation UUID
   * @param body - Archive status
   * @param req - Authenticated request
   * @returns Success confirmation
   *
   * @example
   * PATCH /api/conversations/abc-123-def/archive
   * {
   *   "isArchived": true
   * }
   */
  @Patch('/:conversationId/archive')
  async setArchived(
    @Param('conversationId') conversationId: string,
    @Body() body: { isArchived: boolean },
    @Req() req: AuthRequest
  ) {
    try {
      const userId = req.user!.userId;

      await this.conversationService.setArchived(
        conversationId,
        userId,
        body.isArchived
      );

      return {
        success: true,
        message: body.isArchived ? '会话已归档' : '会话已取消归档'
      };
    } catch (error: any) {
      logger.error('Failed to update archive status', {
        conversationId,
        userId: req.user?.userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Failed to update archive status'
      };
    }
  }
}
