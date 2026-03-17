/**
 * Message Queue Service
 *
 * Stores messages for users who are not connected via WebSocket.
 * This enables HTTP polling clients to receive messages from AI instances.
 *
 * Features:
 * - In-memory message queue per user
 * - Automatic message expiry (5 minutes)
 * - Message deduplication by ID
 * - Consumer pattern for message retrieval
 *
 * @service
 */

import { Service } from 'typedi';
import { logger } from '../config/logger';
import { WebSocketMessage } from '../types/websocket.types';

/**
 * Queued message with metadata
 */
interface QueuedMessage {
  message: WebSocketMessage;
  queuedAt: Date;
  expiresAt: Date;
  consumed: boolean;
}

/**
 * Message queue configuration
 */
interface MessageQueueConfig {
  maxMessagesPerUser: number;
  messageExpiryMs: number;
  cleanupIntervalMs: number;
}

@Service()
export class MessageQueueService {
  private messageQueues: Map<number, QueuedMessage[]> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  private readonly config: MessageQueueConfig = {
    maxMessagesPerUser: 100,
    messageExpiryMs: 5 * 60 * 1000, // 5 minutes
    cleanupIntervalMs: 60 * 1000, // 1 minute
  };

  constructor() {
    this.startCleanupInterval();
  }

  /**
   * Queue a message for a user
   *
   * @param userId - User ID
   * @param message - Message to queue
   */
  queueMessage(userId: number, message: WebSocketMessage): void {
    // Check for duplicate message ID
    const messageId = (message as any).message_id || (message as any).id;
    if (messageId) {
      const userQueue = this.messageQueues.get(userId) || [];
      const duplicate = userQueue.find(
        (qm) => (qm.message as any).message_id === messageId || (qm.message as any).id === messageId
      );
      if (duplicate) {
        logger.debug('Duplicate message ID, skipping queue', { userId, messageId });
        return;
      }
    }

    // Get or create user queue
    let userQueue = this.messageQueues.get(userId);
    if (!userQueue) {
      userQueue = [];
      this.messageQueues.set(userId, userQueue);
    }

    // Check queue size limit
    if (userQueue.length >= this.config.maxMessagesPerUser) {
      // Remove oldest consumed message
      const oldestConsumedIndex = userQueue.findIndex((qm) => qm.consumed);
      if (oldestConsumedIndex !== -1) {
        userQueue.splice(oldestConsumedIndex, 1);
      } else {
        // Remove oldest message
        userQueue.shift();
      }
    }

    // Add message to queue
    const now = new Date();
    const queuedMessage: QueuedMessage = {
      message,
      queuedAt: now,
      expiresAt: new Date(now.getTime() + this.config.messageExpiryMs),
      consumed: false,
    };

    userQueue.push(queuedMessage);

    logger.debug('Message queued for user', {
      userId,
      messageType: message.type,
      queueSize: userQueue.length,
    });
  }

  /**
   * Get unconsumed messages for a user
   *
   * @param userId - User ID
   * @returns Array of unconsumed messages
   */
  getMessages(userId: number): WebSocketMessage[] {
    const userQueue = this.messageQueues.get(userId);
    if (!userQueue || userQueue.length === 0) {
      return [];
    }

    const now = new Date();

    // Filter unconsumed and non-expired messages
    const availableMessages = userQueue.filter(
      (qm) => !qm.consumed && qm.expiresAt > now
    );

    // Mark messages as consumed
    availableMessages.forEach((qm) => {
      qm.consumed = true;
    });

    logger.debug('Messages retrieved for user', {
      userId,
      messageCount: availableMessages.length,
      totalQueueSize: userQueue.length,
    });

    return availableMessages.map((qm) => qm.message);
  }

  /**
   * Clear all messages for a user
   *
   * @param userId - User ID
   */
  clearUserMessages(userId: number): void {
    this.messageQueues.delete(userId);
    logger.debug('Messages cleared for user', { userId });
  }

  /**
   * Get queue statistics
   *
   * @param userId - User ID (optional, if not provided returns global stats)
   * @returns Queue statistics
   */
  getStats(userId?: number): { totalMessages: number; unconsumedMessages: number; users: number } {
    if (userId) {
      const userQueue = this.messageQueues.get(userId);
      const unconsumed = userQueue ? userQueue.filter((qm) => !qm.consumed).length : 0;
      return {
        totalMessages: userQueue?.length || 0,
        unconsumedMessages: unconsumed,
        users: userQueue ? 1 : 0,
      };
    }

    let totalMessages = 0;
    let unconsumedMessages = 0;

    this.messageQueues.forEach((queue) => {
      totalMessages += queue.length;
      unconsumedMessages += queue.filter((qm) => !qm.consumed).length;
    });

    return {
      totalMessages,
      unconsumedMessages,
      users: this.messageQueues.size,
    };
  }

  /**
   * Start cleanup interval to remove expired messages
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredMessages();
    }, this.config.cleanupIntervalMs);

    logger.info('Message queue cleanup interval started', {
      intervalMs: this.config.cleanupIntervalMs,
    });
  }

  /**
   * Remove expired messages from all queues
   */
  private cleanupExpiredMessages(): void {
    const now = new Date();
    let totalRemoved = 0;

    this.messageQueues.forEach((queue, userId) => {
      const originalLength = queue.length;

      // Remove expired and consumed messages
      const filtered = queue.filter(
        (qm) => !qm.consumed && qm.expiresAt > now
      );

      const removed = originalLength - filtered.length;
      totalRemoved += removed;

      if (removed > 0) {
        this.messageQueues.set(userId, filtered);
        logger.debug('Expired messages cleaned up', {
          userId,
          removed,
          remaining: filtered.length,
        });
      }

      // Remove empty queues
      if (filtered.length === 0) {
        this.messageQueues.delete(userId);
      }
    });

    if (totalRemoved > 0) {
      logger.debug('Message queue cleanup completed', {
        totalRemoved,
        totalUsers: this.messageQueues.size,
      });
    }
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.messageQueues.clear();
    logger.info('Message queue service destroyed');
  }
}
