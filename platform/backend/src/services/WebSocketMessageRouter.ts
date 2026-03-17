/**
 * WebSocket Message Router Service
 *
 * Routes messages from WebSocket clients to AI instances and forwards responses back.
 *
 * Features:
 * - User-to-instance message routing
 * - Local instance communication via HTTP API
 * - Remote instance support (placeholder for future Tunnel implementation)
 * - Message queue and retry mechanism for failed deliveries
 * - Response forwarding to WebSocket clients
 * - Comprehensive logging and error handling
 * - Unique message ID generation
 *
 * @service
 */

import { Service } from 'typedi';
import { InstanceRegistry, InstanceInfo } from './InstanceRegistry';
import { WebSocketGateway } from './WebSocketGateway';
import { RemoteInstanceWebSocketGateway } from './RemoteInstanceWebSocketGateway';
import { logger } from '../config/logger';
import { WebSocketMessageType, AssistantMessage } from '../types/websocket.types';

/**
 * Message route result interface
 */
export interface MessageRouteResult {
  message_id: string;
  status: 'sent' | 'queued' | 'failed';
  instance_id: string;
  timestamp: string;
  error?: string;
}

/**
 * Queued message interface
 */
export interface QueuedMessage {
  message_id: string;
  user_id: number;
  instance_id: string;
  content: string;
  files?: any[];
  timestamp: number;
  retry_count: number;
  max_retries: number;
}

/**
 * Instance message request interface
 */
export interface InstanceMessageRequest {
  type: string;
  content: string;
  timestamp: string;
  metadata?: {
    files?: any[];
  };
}

/**
 * Instance message response interface
 */
export interface InstanceMessageResponse {
  content: string;
  timestamp: string;
}

/**
 * Configuration for message routing
 */
interface MessageRouterConfig {
  retryInterval: number;
  maxRetries: number;
  queueTimeout: number;
  localInstanceTimeout: number;
}

@Service()
export class WebSocketMessageRouter {
  private messageQueue: Map<string, QueuedMessage> = new Map();
  private retryInterval: NodeJS.Timeout | null = null;

  private readonly config: MessageRouterConfig = {
    retryInterval: parseInt(process.env.MESSAGE_RETRY_INTERVAL || '30000', 10),
    maxRetries: parseInt(process.env.MESSAGE_MAX_RETRIES || '3', 10),
    queueTimeout: parseInt(process.env.MESSAGE_QUEUE_TIMEOUT || '60000', 10),
    localInstanceTimeout: parseInt(process.env.LOCAL_INSTANCE_TIMEOUT || '10000', 10),
  };

  constructor(
    private readonly instanceRegistry: InstanceRegistry,
    private readonly webSocketGateway: WebSocketGateway,
    private readonly remoteInstanceWSGateway: RemoteInstanceWebSocketGateway
  ) {}

  /**
   * Main routing method for user messages
   *
   * Routes message from user to their instance, handles local/remote routing,
   * and manages message queue for failed deliveries.
   *
   * @param userId - User ID
   * @param content - Message content
   * @param files - Optional array of file metadata
   * @returns Message route result
   * @throws Error if user has no instance or instance is offline
   */
  async routeUserMessage(userId: number, content: string, files?: any[]): Promise<MessageRouteResult> {
    const messageId = this.generateMessageId();
    const timestamp = new Date().toISOString();

    try {
      logger.info('Routing user message', {
        messageId,
        userId,
        contentLength: content.length,
        hasFiles: files && files.length > 0,
        fileCount: files?.length || 0,
      });

      // 1. Find user's instance
      const instanceInfo = await this.instanceRegistry.getUserInstance(userId);

      if (!instanceInfo) {
        throw new Error(`No instance found for user ${userId}`);
      }

      // 2. Check instance online status
      if (instanceInfo.status !== 'online') {
        throw new Error(`Instance ${instanceInfo.instance_id} is offline`);
      }

      // 3. Route by connection type
      if (instanceInfo.connection_type === 'local') {
        await this.sendToLocalInstance(instanceInfo, content, messageId, files);
      } else {
        await this.sendToRemoteInstance(instanceInfo, content, messageId, files);
      }

      logger.info('Message routed successfully', {
        messageId,
        userId,
        instanceId: instanceInfo.instance_id,
      });

      return {
        message_id: messageId,
        status: 'sent',
        instance_id: instanceInfo.instance_id,
        timestamp,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to route message', {
        messageId,
        userId,
        error: errorMessage,
      });

      // Add to retry queue if it's a delivery error
      if (errorMessage.includes('Network') || errorMessage.includes('timeout') || errorMessage.includes('ECONN')) {
        const instanceInfo = await this.instanceRegistry.getUserInstance(userId);
        if (instanceInfo) {
          this.addToQueue({
            message_id: messageId,
            user_id: userId,
            instance_id: instanceInfo.instance_id,
            content,
            files,
            timestamp: Date.now(),
            retry_count: 0,
            max_retries: this.config.maxRetries,
          });

          return {
            message_id: messageId,
            status: 'queued',
            instance_id: instanceInfo.instance_id,
            timestamp,
            error: errorMessage,
          };
        }
      }

      throw error;
    }
  }

  /**
   * Send message to local instance via HTTP API
   *
   * @param instanceInfo - Instance information
   * @param content - Message content
   * @param messageId - Unique message ID
   * @param files - Optional file metadata
   * @throws Error if HTTP request fails
   */
  private async sendToLocalInstance(
    instanceInfo: InstanceInfo,
    content: string,
    messageId: string,
    files?: any[]
  ): Promise<void> {
    // Use the correct endpoint: /chat (not /api/message) and port 3001
    const apiUrl = instanceInfo.api_endpoint.replace(':3000', ':3001');
    const url = `${apiUrl}/chat`;
    const userId = instanceInfo.owner_id!;

    try {
      logger.debug('Sending to local instance', {
        messageId,
        instanceId: instanceInfo.instance_id,
        url,
        hasFiles: files && files.length > 0,
        fileCount: files?.length || 0,
      });

      const request: InstanceMessageRequest = {
        type: 'user_message',
        content,
        timestamp: new Date().toISOString(),
        metadata: files && files.length > 0 ? { files } : undefined,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Message-ID': messageId,
          'X-User-ID': userId.toString(),
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.config.localInstanceTimeout),
      });

      if (!response.ok) {
        throw new Error(`Instance returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as InstanceMessageResponse;

      // Forward response to WebSocketGateway
      const assistantMessage: AssistantMessage = {
        type: WebSocketMessageType.ASSISTANT_MESSAGE,
        content: data.content,
        timestamp: data.timestamp,
        instance_id: instanceInfo.instance_id,
      };
      await this.webSocketGateway.sendToClient(userId, assistantMessage);

      logger.debug('Local instance response forwarded', {
        messageId,
        instanceId: instanceInfo.instance_id,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to send to local instance', {
        messageId,
        instanceId: instanceInfo.instance_id,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Send message to remote instance via WebSocket
   *
   * Uses RemoteInstanceWebSocketGateway to deliver messages to remote instances
   * through their persistent WebSocket connection, avoiding HTTP fallback issues.
   *
   * @param instanceInfo - Instance information
   * @param content - Message content
   * @param messageId - Unique message ID
   * @throws Error if unable to send to remote instance
   */
  private async sendToRemoteInstance(
    instanceInfo: InstanceInfo,
    content: string,
    messageId: string,
    files?: any[]
  ): Promise<void> {
    const userId = instanceInfo.owner_id!;

    logger.info('Sending message to remote instance via WebSocket', {
      messageId,
      instanceId: instanceInfo.instance_id,
      userId,
      hasFiles: files && files.length > 0,
      fileCount: files?.length || 0,
    });

    // Send via RemoteInstanceWebSocketGateway
    // Note: Response will be handled asynchronously via RemoteInstanceWebSocketGateway
    // when the remote instance sends back a RESPONSE message
    await this.remoteInstanceWSGateway.sendUserMessage(
      instanceInfo.instance_id,
      userId,
      content,
      messageId,
      files
    );

    logger.info('Message sent to remote instance, awaiting async response', {
      messageId,
      instanceId: instanceInfo.instance_id,
    });
  }

  /**
   * Handle instance response and forward to client
   *
   * @param instanceId - Instance ID
   * @param response - Instance response data
   */
  async handleInstanceResponse(instanceId: string, response: any): Promise<void> {
    try {
      // Find instance info to get user ID
      const instances = this.instanceRegistry.getAllInstances();
      const instance = instances.find(inst => inst.instance_id === instanceId);

      if (!instance || !instance.owner_id) {
        logger.warn('Cannot forward response: instance not found or no owner', {
          instanceId,
        });
        return;
      }

      // Forward response to WebSocketGateway
      const assistantMessage: AssistantMessage = {
        type: WebSocketMessageType.ASSISTANT_MESSAGE,
        content: response.content || '',
        timestamp: response.timestamp || new Date().toISOString(),
        instance_id: instanceId,
      };
      await this.webSocketGateway.sendToClient(instance.owner_id, assistantMessage);

      logger.debug('Instance response forwarded to client', {
        instanceId,
        userId: instance.owner_id,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to handle instance response', {
        instanceId,
        error: errorMessage,
      });
    }
  }

  /**
   * Generate unique message ID
   *
   * @returns Unique message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Add message to retry queue
   *
   * @param message - Queued message
   */
  private addToQueue(message: QueuedMessage): void {
    this.messageQueue.set(message.message_id, message);

    logger.info('Message queued for retry', {
      messageId: message.message_id,
      userId: message.user_id,
      instanceId: message.instance_id,
      retryCount: message.retry_count,
    });
  }

  /**
   * Process retry queue
   *
   * Retries queued messages that haven't exceeded max retries or timeout
   */
  async processRetryQueue(): Promise<void> {
    const now = Date.now();
    const messages = Array.from(this.messageQueue.values());

    logger.debug('Processing retry queue', {
      queueSize: messages.length,
    });

    for (const message of messages) {
      // Check if message has timed out
      if (now - message.timestamp > this.config.queueTimeout) {
        logger.warn('Message queue timeout, removing', {
          messageId: message.message_id,
        });
        this.removeFromQueue(message.message_id);
        continue;
      }

      // Check if max retries reached
      if (message.retry_count >= message.max_retries) {
        logger.error('Message failed after max retries', {
          messageId: message.message_id,
          retries: message.retry_count,
        });
        this.removeFromQueue(message.message_id);
        continue;
      }

      // Retry message
      message.retry_count++;

      logger.info('Retrying queued message', {
        messageId: message.message_id,
        retryCount: message.retry_count,
      });

      try {
        const result = await this.routeUserMessage(message.user_id, message.content);

        // If successful, remove from queue
        if (result.status === 'sent') {
          this.removeFromQueue(message.message_id);
        }
      } catch (error) {
        logger.error('Retry failed', {
          messageId: message.message_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Remove message from queue
   *
   * @param messageId - Message ID
   */
  private removeFromQueue(messageId: string): void {
    this.messageQueue.delete(messageId);

    logger.debug('Message removed from queue', {
      messageId,
      remainingInQueue: this.messageQueue.size,
    });
  }

  /**
   * Start retry processor
   *
   * Starts periodic processing of retry queue
   *
   * @param intervalMs - Processing interval in milliseconds (default: from config)
   */
  startRetryProcessor(intervalMs?: number): void {
    // Stop existing processor if running
    this.stopRetryProcessor();

    const interval = intervalMs || this.config.retryInterval;

    this.retryInterval = setInterval(async () => {
      await this.processRetryQueue();
    }, interval);

    logger.info('Message retry processor started', {
      intervalMs: interval,
    });
  }

  /**
   * Stop retry processor
   */
  stopRetryProcessor(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;

      logger.info('Message retry processor stopped');
    }
  }

  /**
   * Check if retry processor is running
   *
   * @returns True if running
   */
  isRetryProcessorRunning(): boolean {
    return this.retryInterval !== null;
  }

  /**
   * Get queue statistics
   *
   * @returns Queue statistics
   */
  getQueueStats(): {
    queued: number;
    retrying: number;
    failed: number;
  } {
    const messages = Array.from(this.messageQueue.values());

    return {
      queued: messages.filter(m => m.retry_count === 0).length,
      retrying: messages.filter(m => m.retry_count > 0 && m.retry_count < m.max_retries).length,
      failed: messages.filter(m => m.retry_count >= m.max_retries).length,
    };
  }

  /**
   * Clear all messages from queue
   *
   * Useful for testing or shutdown
   */
  clearQueue(): void {
    const count = this.messageQueue.size;
    this.messageQueue.clear();

    logger.info('Message queue cleared', { count });
  }
}
