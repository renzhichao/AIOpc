import { Service } from 'typedi';
import { Repository, FindManyOptions } from 'typeorm';
import { ConversationMessage } from '../entities/ConversationMessage.entity';
import { BaseRepository } from './BaseRepository';
import { AppDataSource } from '../config/database';

/**
 * ConversationMessage Repository
 * Handles database operations for conversation messages
 */
@Service()
export class ConversationMessageRepository extends BaseRepository<ConversationMessage> {
  constructor() {
    super(() => AppDataSource.getRepository(ConversationMessage));
  }

  /**
   * Find messages by conversation ID
   */
  async findByConversationId(
    conversationId: string,
    options?: {
      limit?: number;
      offset?: number;
      role?: 'user' | 'assistant' | 'system';
    }
  ): Promise<ConversationMessage[]> {
    const where: any = { conversation_id: conversationId };

    if (options?.role) {
      where.role = options.role;
    }

    const findOptions: FindManyOptions<ConversationMessage> = {
      where,
      order: {
        created_at: 'ASC' // Messages in chronological order
      }
    };

    if (options?.limit) {
      findOptions.take = options.limit;
    }

    if (options?.offset) {
      findOptions.skip = options.offset;
    }

    return this.repository.find(findOptions);
  }

  /**
   * Get message count by conversation
   */
  async countByConversationId(conversationId: string): Promise<number> {
    return this.repository.count({
      where: { conversation_id: conversationId }
    });
  }

  /**
   * Find last N messages in a conversation
   */
  async findLastMessages(conversationId: string, limit: number = 10): Promise<ConversationMessage[]> {
    return this.repository.find({
      where: { conversation_id: conversationId },
      order: {
        created_at: 'DESC'
      },
      take: limit
    });
  }

  /**
   * Find first message in conversation (for auto-title generation)
   */
  async findFirstMessage(conversationId: string): Promise<ConversationMessage | null> {
    const result = await this.repository.findOne({
      where: { conversation_id: conversationId },
      order: {
        created_at: 'ASC'
      }
    });
    return result || null;
  }

  /**
   * Get messages after a specific timestamp (for incremental loading)
   */
  async findMessagesAfter(conversationId: string, timestamp: Date): Promise<ConversationMessage[]> {
    return this.repository
      .createQueryBuilder('message')
      .where('message.conversation_id = :conversationId', { conversationId })
      .andWhere('message.created_at > :timestamp', { timestamp })
      .orderBy('message.created_at', 'ASC')
      .getMany();
  }

  /**
   * Delete all messages in a conversation
   * Called when conversation is deleted (cascade handles this automatically)
   */
  async deleteByConversationId(conversationId: string): Promise<void> {
    await this.repository.delete({ conversation_id: conversationId });
  }

  /**
   * Get message statistics for a conversation
   */
  async getStatistics(conversationId: string) {
    const stats = await this.repository
      .createQueryBuilder('message')
      .select('message.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .where('message.conversation_id = :conversationId', { conversationId })
      .groupBy('message.role')
      .getRawMany();

    const result = {
      total: 0,
      user: 0,
      assistant: 0,
      system: 0
    };

    stats.forEach(stat => {
      result.total += parseInt(stat.count);
      if (stat.role === 'user') result.user = parseInt(stat.count);
      if (stat.role === 'assistant') result.assistant = parseInt(stat.count);
      if (stat.role === 'system') result.system = parseInt(stat.count);
    });

    return result;
  }

  /**
   * Find messages with tool calls (for debugging and analytics)
   */
  async findMessagesWithToolCalls(conversationId: string): Promise<ConversationMessage[]> {
    return this.repository.find({
      where: {
        conversation_id: conversationId,
        tool_calls: $ne: null
      } as any,
      order: {
        created_at: 'ASC'
      }
    });
  }

  /**
   * Bulk insert messages (for conversation import/export)
   */
  async bulkInsert(messages: Array<{
    conversation_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    tool_calls?: any[];
    tool_results?: any[];
    metadata?: Record<string, any>;
  }>): Promise<ConversationMessage[]> {
    const entities = this.repository.create(messages);
    return this.repository.save(entities);
  }

  /**
   * Get paginated messages for long conversations
   * Phase 2: Implement cursor-based pagination for better performance
   */
  async findPaginated(
    conversationId: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<{
    data: ConversationMessage[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    const skip = (page - 1) * pageSize;
    const [data, total] = await this.repository.findAndCount({
      where: { conversation_id: conversationId },
      order: { created_at: 'ASC' },
      skip,
      take: pageSize
    });

    return {
      data,
      total,
      page,
      pageSize,
      hasMore: skip + data.length < total
    };
  }
}
