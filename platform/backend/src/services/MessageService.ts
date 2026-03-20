import { Service } from 'typedi';
import { ConversationMessageRepository } from '../repositories/ConversationMessageRepository';
import { ConversationRepository } from '../repositories/ConversationRepository';
import { ConversationMessage } from '../entities/ConversationMessage.entity';
import { logger } from '../config/logger';
import { ErrorService } from './ErrorService';

/**
 * DTO for creating a message
 */
export interface CreateMessageDto {
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
  toolResults?: Array<{
    tool_call_id: string;
    output: any;
  }>;
  metadata?: Record<string, any>;
}

/**
 * DTO for message list response
 */
export interface MessageListResponse {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: any[];
  toolResults?: any[];
  createdAt: Date;
}

/**
 * Message Service
 *
 * Handles business logic for message management within conversations
 */
@Service()
export class MessageService {
  constructor(
    private readonly messageRepository: ConversationMessageRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly errorService: ErrorService
  ) {}

  /**
   * Add a message to a conversation
   */
  async addMessage(dto: CreateMessageDto, userId: number): Promise<ConversationMessage> {
    // 1. Verify conversation exists and user owns it
    const conversation = await this.conversationRepository.findById(dto.conversationId);

    if (!conversation) {
      throw this.errorService.createError('CONVERSATION_NOT_FOUND', {
        conversationId: dto.conversationId
      });
    }

    if (conversation.user_id !== userId) {
      throw this.errorService.createError('CONVERSATION_ACCESS_DENIED', {
        conversationId: dto.conversationId
      });
    }

    // 2. Create message
    const message = await this.messageRepository.create({
      conversation_id: dto.conversationId,
      role: dto.role,
      content: dto.content,
      tool_calls: dto.toolCalls ?? undefined,
      tool_results: dto.toolResults ?? undefined,
      metadata: dto.metadata || {}
    });

    // 3. Update conversation's last_message_at
    // Note: message_count is automatically updated by database trigger
    await this.conversationRepository.updateLastMessageTime(dto.conversationId);

    logger.info('Message added to conversation', {
      messageId: message.id,
      conversationId: dto.conversationId,
      role: dto.role
    });

    return message;
  }

  /**
   * Get messages for a conversation
   */
  async getConversationMessages(
    conversationId: string,
    userId: number,
    page: number = 1,
    pageSize: number = 50
  ): Promise<{
    messages: MessageListResponse[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    // 1. Verify conversation exists and user owns it
    const conversation = await this.conversationRepository.findById(conversationId);

    if (!conversation) {
      throw this.errorService.createError('CONVERSATION_NOT_FOUND', { conversationId });
    }

    if (conversation.user_id !== userId) {
      throw this.errorService.createError('CONVERSATION_ACCESS_DENIED', { conversationId });
    }

    // 2. Get paginated messages
    const result = await this.messageRepository.findPaginated(conversationId, page, pageSize);

    return {
      messages: result.data.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        toolCalls: msg.tool_calls,
        toolResults: msg.tool_results,
        createdAt: msg.created_at
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore
    };
  }

  /**
   * Get first message in conversation (for auto-title generation)
   */
  async getFirstMessage(conversationId: string, userId: number): Promise<ConversationMessage | null> {
    const conversation = await this.conversationRepository.findById(conversationId);

    if (!conversation || conversation.user_id !== userId) {
      return null;
    }

    return this.messageRepository.findFirstMessage(conversationId);
  }

  /**
   * Delete all messages in a conversation
   * Called when conversation is deleted
   */
  async deleteConversationMessages(conversationId: string): Promise<void> {
    await this.messageRepository.deleteByConversationId(conversationId);

    logger.info('All messages deleted for conversation', { conversationId });
  }

  /**
   * Get message statistics for a conversation
   */
  async getMessageStatistics(conversationId: string, userId: number) {
    const conversation = await this.conversationRepository.findById(conversationId);

    if (!conversation || conversation.user_id !== userId) {
      throw this.errorService.createError('CONVERSATION_ACCESS_DENIED', { conversationId });
    }

    return this.messageRepository.getStatistics(conversationId);
  }

  /**
   * Bulk add messages (for conversation import)
   * Phase 2: Implement conversation export/import feature
   */
  async bulkAddMessages(conversationId: string, messages: CreateMessageDto[], userId: number) {
    const conversation = await this.conversationRepository.findById(conversationId);

    if (!conversation || conversation.user_id !== userId) {
      throw this.errorService.createError('CONVERSATION_ACCESS_DENIED', { conversationId });
    }

    const formattedMessages = messages.map(msg => ({
      conversation_id: conversationId,
      role: msg.role,
      content: msg.content,
      tool_calls: msg.toolCalls,
      tool_results: msg.toolResults,
      metadata: msg.metadata
    }));

    const created = await this.messageRepository.bulkInsert(formattedMessages);

    logger.info('Bulk messages added', {
      conversationId,
      count: created.length
    });

    return created;
  }

  /**
   * Get messages after a specific timestamp (for incremental sync)
   * Phase 2: Implement real-time message synchronization
   */
  async getMessagesAfter(conversationId: string, timestamp: Date, userId: number) {
    const conversation = await this.conversationRepository.findById(conversationId);

    if (!conversation || conversation.user_id !== userId) {
      throw this.errorService.createError('CONVERSATION_ACCESS_DENIED', { conversationId });
    }

    return this.messageRepository.findMessagesAfter(conversationId, timestamp);
  }

  /**
   * Auto-generate conversation title from first message
   * Phase 2: Implement AI-based title generation
   */
  async generateConversationTitle(conversationId: string, userId: number): Promise<string> {
    const firstMessage = await this.getFirstMessage(conversationId, userId);

    if (!firstMessage) {
      return '未命名会话';
    }

    // Phase 1: Simple title generation (first 20 chars)
    // Phase 2: Use AI to generate meaningful title
    const content = firstMessage.content.trim();
    const title = content.length > 20 ? content.substring(0, 20) + '...' : content;

    return title || '未命名会话';
  }
}
