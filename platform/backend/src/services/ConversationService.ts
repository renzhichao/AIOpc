import { Service } from 'typedi';
import { ConversationRepository } from '../repositories/ConversationRepository';
import { ConversationMessageRepository } from '../repositories/ConversationMessageRepository';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { UserRepository } from '../repositories/UserRepository';
import { Conversation } from '../entities/Conversation.entity';
import { ConversationMessage } from '../entities/ConversationMessage.entity';
import { logger } from '../config/logger';
import { ErrorService } from './ErrorService';

/**
 * DTO for creating a conversation
 */
export interface CreateConversationDto {
  userId: number;
  instanceId: number;
  title?: string;
}

/**
 * DTO for updating a conversation
 */
export interface UpdateConversationDto {
  title?: string;
  isArchived?: boolean;
  metadata?: Record<string, any>;
}

/**
 * DTO for conversation list response
 */
export interface ConversationListResponse {
  id: string;
  title: string;
  preview: string; // First 100 chars of last message
  messageCount: number;
  createdAt: Date;
  lastMessageAt: Date | null;
  isArchived: boolean;
  instanceName: string;
  instanceStatus: string;
}

/**
 * DTO for conversation detail response
 */
export interface ConversationDetailResponse {
  id: string;
  instanceId: number;
  instanceName: string;
  title: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolCalls?: any[];
    toolResults?: any[];
    createdAt: Date;
  }>;
  createdAt: Date;
  lastMessageAt: Date | null;
  messageCount: number;
  isArchived: boolean;
}

/**
 * Conversation Service
 *
 * Handles business logic for conversation management
 */
@Service()
export class ConversationService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: ConversationMessageRepository,
    private readonly instanceRepository: InstanceRepository,
    private readonly userRepository: UserRepository,
    private readonly errorService: ErrorService
  ) {}

  /**
   * Create a new conversation
   */
  async createConversation(dto: CreateConversationDto): Promise<Conversation> {
    // 1. Verify user exists
    const user = await this.userRepository.findById(dto.userId);
    if (!user) {
      throw this.errorService.createError('USER_NOT_FOUND', { userId: dto.userId });
    }

    // 2. Verify instance exists and belongs to user
    const instance = await this.instanceRepository.findById(dto.instanceId);
    if (!instance) {
      throw this.errorService.createError('INSTANCE_NOT_FOUND', { instanceId: dto.instanceId });
    }

    if (instance.owner_id !== dto.userId) {
      throw this.errorService.createError('INSTANCE_NOT_OWNED', {
        instanceId: dto.instanceId,
        userId: dto.userId
      });
    }

    // 3. Create conversation
    const title = dto.title || '未命名会话';
    const conversation = await this.conversationRepository.create({
      user_id: dto.userId,
      instance_id: dto.instanceId,
      title,
      metadata: {}
    });

    logger.info('Conversation created', {
      conversationId: conversation.id,
      userId: dto.userId,
      instanceId: dto.instanceId
    });

    return conversation;
  }

  /**
   * Get conversations for a user
   */
  async getUserConversations(
    userId: number,
    instanceId?: number,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{
    conversations: ConversationListResponse[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    const offset = (page - 1) * pageSize;

    const conversations = await this.conversationRepository.findByUserId(userId, {
      instanceId,
      isArchived: false,
      limit: pageSize,
      offset
    });

    const total = await this.conversationRepository.countByUserId(userId, instanceId);

    // Get last message for preview
    const responsePromises = conversations.map(async (conv) => {
      const lastMessages = await this.messageRepository.findLastMessages(conv.id, 1);
      const preview = lastMessages[0]
        ? lastMessages[0].content.substring(0, 100) + (lastMessages[0].content.length > 100 ? '...' : '')
        : '暂无消息';

      return {
        id: conv.id,
        title: conv.title,
        preview,
        messageCount: conv.message_count,
        createdAt: conv.created_at,
        lastMessageAt: conv.last_message_at,
        isArchived: conv.is_archived,
        instanceName: conv.instance?.name || '未知实例',
        instanceStatus: conv.instance?.status || 'unknown'
      };
    });

    const responseData = await Promise.all(responsePromises);

    return {
      conversations: responseData,
      total,
      page,
      pageSize,
      hasMore: offset + conversations.length < total
    };
  }

  /**
   * Get conversation detail with all messages
   */
  async getConversationDetail(conversationId: string, userId: number): Promise<ConversationDetailResponse> {
    const conversation = await this.conversationRepository.findByIdWithMessages(conversationId);

    if (!conversation) {
      throw this.errorService.createError('CONVERSATION_NOT_FOUND', { conversationId });
    }

    // Phase 1: Basic ownership check (Phase 2 will add proper authorization)
    if (conversation.user_id !== userId) {
      throw this.errorService.createError('CONVERSATION_ACCESS_DENIED', { conversationId });
    }

    return {
      id: conversation.id,
      instanceId: conversation.instance_id,
      instanceName: conversation.instance?.name || '未知实例',
      title: conversation.title,
      messages: conversation.messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        toolCalls: msg.tool_calls,
        toolResults: msg.tool_results,
        createdAt: msg.created_at
      })),
      createdAt: conversation.created_at,
      lastMessageAt: conversation.last_message_at,
      messageCount: conversation.message_count,
      isArchived: conversation.is_archived
    };
  }

  /**
   * Update conversation
   */
  async updateConversation(conversationId: string, userId: number, dto: UpdateConversationDto): Promise<Conversation> {
    const conversation = await this.conversationRepository.findById(conversationId);

    if (!conversation) {
      throw this.errorService.createError('CONVERSATION_NOT_FOUND', { conversationId });
    }

    // Ownership check
    if (conversation.user_id !== userId) {
      throw this.errorService.createError('CONVERSATION_ACCESS_DENIED', { conversationId });
    }

    // Update fields
    const updateData: any = {};
    if (dto.title !== undefined) {
      updateData.title = dto.title;
    }
    if (dto.isArchived !== undefined) {
      updateData.is_archived = dto.isArchived;
    }
    if (dto.metadata !== undefined) {
      updateData.metadata = { ...conversation.metadata, ...dto.metadata };
    }

    const updated = await this.conversationRepository.update(conversationId, updateData);

    logger.info('Conversation updated', {
      conversationId,
      userId,
      updates: Object.keys(dto)
    });

    return updated!;
  }

  /**
   * Delete conversation (and all messages via cascade)
   */
  async deleteConversation(conversationId: string, userId: number): Promise<void> {
    const conversation = await this.conversationRepository.findById(conversationId);

    if (!conversation) {
      throw this.errorService.createError('CONVERSATION_NOT_FOUND', { conversationId });
    }

    // Ownership check
    if (conversation.user_id !== userId) {
      throw this.errorService.createError('CONVERSATION_ACCESS_DENIED', { conversationId });
    }

    await this.conversationRepository.deleteConversation(conversationId);

    logger.info('Conversation deleted', {
      conversationId,
      userId,
      messageCount: conversation.message_count
    });
  }

  /**
   * Rename conversation
   */
  async renameConversation(conversationId: string, userId: number, newTitle: string): Promise<Conversation> {
    if (!newTitle || newTitle.trim().length === 0) {
      throw this.errorService.createError('INVALID_TITLE', { title: newTitle });
    }

    const conversation = await this.conversationRepository.findById(conversationId);

    if (!conversation) {
      throw this.errorService.createError('CONVERSATION_NOT_FOUND', { conversationId });
    }

    if (conversation.user_id !== userId) {
      throw this.errorService.createError('CONVERSATION_ACCESS_DENIED', { conversationId });
    }

    await this.conversationRepository.updateTitle(conversationId, newTitle.trim());

    logger.info('Conversation renamed', {
      conversationId,
      oldTitle: conversation.title,
      newTitle: newTitle.trim()
    });

    return (await this.conversationRepository.findById(conversationId))!;
  }

  /**
   * Archive or unarchive conversation
   */
  async setArchived(conversationId: string, userId: number, isArchived: boolean): Promise<void> {
    const conversation = await this.conversationRepository.findById(conversationId);

    if (!conversation) {
      throw this.errorService.createError('CONVERSATION_NOT_FOUND', { conversationId });
    }

    if (conversation.user_id !== userId) {
      throw this.errorService.createError('CONVERSATION_ACCESS_DENIED', { conversationId });
    }

    await this.conversationRepository.setArchived(conversationId, isArchived);

    logger.info('Conversation archive status changed', {
      conversationId,
      isArchived
    });
  }

  /**
   * Get conversation statistics
   */
  async getStatistics(userId: number, instanceId?: number) {
    const totalConversations = await this.conversationRepository.countByUserId(userId, instanceId);
    const totalMessages = await this.messageRepository.countByConversationId('' as any); // TODO: aggregate count

    return {
      totalConversations,
      totalMessages,
      // Phase 2: Add more detailed statistics
    };
  }
}
