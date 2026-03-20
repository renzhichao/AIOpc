import { Service } from 'typedi';
import { Repository, FindManyOptions } from 'typeorm';
import { Conversation } from '../entities/Conversation.entity';
import { BaseRepository } from './BaseRepository';
import { AppDataSource } from '../config/database';

/**
 * Conversation Repository
 * Handles database operations for conversations
 */
@Service()
export class ConversationRepository extends BaseRepository<Conversation> {
  constructor() {
    super(() => AppDataSource.getRepository(Conversation));
  }

  /**
   * Find conversations by user ID
   */
  async findByUserId(userId: number, options?: {
    instanceId?: number;
    isArchived?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Conversation[]> {
    const where: any = { user_id: userId };

    if (options?.instanceId !== undefined) {
      where.instance_id = options.instanceId;
    }

    if (options?.isArchived !== undefined) {
      where.is_archived = options.isArchived;
    }

    const findOptions: FindManyOptions<Conversation> = {
      where,
      order: {
        last_message_at: 'DESC',
        created_at: 'DESC'
      },
      relations: ['instance'] // Include instance details
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
   * Find conversations by instance ID
   */
  async findByInstanceId(instanceId: number, options?: {
    isArchived?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Conversation[]> {
    const where: any = { instance_id: instanceId };

    if (options?.isArchived !== undefined) {
      where.is_archived = options.isArchived;
    }

    const findOptions: FindManyOptions<Conversation> = {
      where,
      order: {
        last_message_at: 'DESC',
        created_at: 'DESC'
      },
      relations: ['user', 'instance']
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
   * Find conversation with messages
   */
  async findByIdWithMessages(conversationId: string): Promise<Conversation | null> {
    const result = await this.repository.findOne({
      where: { id: conversationId },
      relations: ['messages', 'user', 'instance']
    });
    return result || null;
  }

  /**
   * Get conversation count by user
   */
  async countByUserId(userId: number, instanceId?: number): Promise<number> {
    const where: any = { user_id: userId };

    if (instanceId !== undefined) {
      where.instance_id = instanceId;
    }

    return this.repository.count({ where });
  }

  /**
   * Get conversation count by instance
   */
  async countByInstanceId(instanceId: number): Promise<number> {
    return this.repository.count({
      where: { instance_id: instanceId }
    });
  }

  /**
   * Update conversation title
   */
  async updateTitle(conversationId: string, title: string): Promise<void> {
    await this.repository.update(conversationId, { title });
  }

  /**
   * Archive or unarchive conversation
   */
  async setArchived(conversationId: string, isArchived: boolean): Promise<void> {
    await this.repository.update(conversationId, { is_archived: isArchived });
  }

  /**
   * Update last message timestamp
   * Called automatically when a new message is added
   */
  async updateLastMessageTime(conversationId: string): Promise<void> {
    await this.repository.update(conversationId, {
      last_message_at: new Date()
    });
  }

  /**
   * Find recent conversations (for dashboard)
   */
  async findRecentByUserId(userId: number, limit: number = 10): Promise<Conversation[]> {
    return this.repository.find({
      where: {
        user_id: userId,
        is_archived: false
      },
      order: {
        last_message_at: 'DESC',
        created_at: 'DESC'
      },
      relations: ['instance'],
      take: limit
    });
  }

  /**
   * Search conversations by title
   */
  async searchByTitle(userId: number, keyword: string, limit: number = 20): Promise<Conversation[]> {
    return this.repository
      .createQueryBuilder('conversation')
      .where('conversation.user_id = :userId', { userId })
      .andWhere('conversation.is_archived = false')
      .andWhere('conversation.title LIKE :keyword', { keyword: `%${keyword}%` })
      .leftJoinAndSelect('conversation.instance', 'instance')
      .orderBy('conversation.last_message_at', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Delete conversation and all messages (cascade is handled by DB)
   */
  async deleteConversation(conversationId: string): Promise<void> {
    await this.repository.delete(conversationId);
  }

  /**
   * Get paginated conversations with message preview
   * Returns the last message content as preview
   */
  async findWithPreview(userId: number, instanceId: number, page: number = 1, pageSize: number = 20) {
    const skip = (page - 1) * pageSize;

    const queryBuilder = this.repository
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.instance', 'instance')
      .leftJoin('conversation.messages', 'message')
      .where('conversation.user_id = :userId', { userId })
      .andWhere('conversation.instance_id = :instanceId', { instanceId })
      .andWhere('conversation.is_archived = false')
      .orderBy('conversation.last_message_at', 'DESC')
      .addOrderBy('conversation.created_at', 'DESC')
      .skip(skip)
      .take(pageSize);

    const [conversations, total] = await queryBuilder.getManyAndCount();

    return {
      data: conversations,
      total,
      page,
      pageSize,
      hasMore: skip + conversations.length < total
    };
  }
}
