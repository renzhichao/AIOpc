/**
 * Message Router Service
 *
 * Routes messages from Feishu to the correct OpenClaw instance
 * and sends responses back to Feishu.
 *
 * Features:
 * - User-to-instance routing table
 * - Message forwarding to instances
 * - Response handling and Feishu replies
 * - Message timeout handling
 * - Comprehensive logging
 * - Error handling and retry
 */

import { Service } from 'typedi';
import axios, { AxiosError } from 'axios';
import { UserRepository } from '../repositories/UserRepository';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { DockerService } from './DockerService';
import { ErrorService } from './ErrorService';
import { logger } from '../config/logger';
import { redis } from '../config/redis';
import { AppError } from '../utils/errors/AppError';
import {
  MessageRouteRequest,
  MessageRouteResponse,
  InstanceMessageRequest,
  InstanceMessageResponse,
  FeishuMessageSendRequest,
  FeishuMessageSendResponse,
  RoutingEntry,
  MessageRoutingOptions,
  MessageLogEntry,
} from '../types/message-router.types';
import { Instance } from '../entities/Instance.entity';

/**
 * Default routing options
 */
const DEFAULT_ROUTING_OPTIONS: MessageRoutingOptions = {
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  enableLogging: true,
};

/**
 * Redis keys for caching
 */
const REDIS_KEYS = {
  ROUTING_TABLE: 'message:route:',
  USER_INSTANCE: 'user:instance:',
  MESSAGE_LOG: 'message:log:',
};

/**
 * Cache TTL in seconds
 */
const CACHE_TTL = {
  ROUTING_TABLE: 3600, // 1 hour
  MESSAGE_LOG: 86400, // 24 hours
};

@Service()
export class MessageRouter {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly instanceRepository: InstanceRepository,
    private readonly dockerService: DockerService,
    private readonly errorService: ErrorService
  ) {}

  /**
   * Route a message from Feishu to the appropriate instance
   *
   * @param request - Message routing request
   * @param options - Routing options
   * @returns Message routing response
   */
  async routeMessage(
    request: MessageRouteRequest,
    options: MessageRoutingOptions = {}
  ): Promise<MessageRouteResponse> {
    const startTime = Date.now();
    const routingOptions = { ...DEFAULT_ROUTING_OPTIONS, ...options };

    logger.info('Routing message', {
      messageId: request.messageId,
      feishuUserId: request.feishuUserId,
      msgType: request.msgType,
    });

    try {
      // 1. Find user by Feishu user ID
      const user = await this.userRepository.findByFeishuUserId(request.feishuUserId);
      if (!user) {
        throw this.errorService.createError('USER_NOT_FOUND', {
          feishuUserId: request.feishuUserId,
        });
      }

      // 2. Find active instance for user
      const instance = await this.findActiveInstance(user.id);
      if (!instance) {
        throw this.errorService.createError('INSTANCE_NOT_FOUND', {
          userId: user.id,
          feishuUserId: request.feishuUserId,
        });
      }

      // 3. Update routing table
      await this.updateRoutingTable(request.feishuUserId, instance.instance_id);

      // 4. Forward message to instance
      const instanceResponse = await this.forwardToInstance(
        instance,
        request,
        routingOptions
      );

      // 5. Send response back to Feishu
      await this.sendFeishuResponse(request, instanceResponse);

      // 6. Log message
      if (routingOptions.enableLogging) {
        await this.logMessage({
          id: this.generateLogId(),
          messageId: request.messageId,
          instanceId: instance.instance_id,
          feishuUserId: request.feishuUserId,
          content: request.content,
          response: instanceResponse.content,
          processingTime: Date.now() - startTime,
          success: true,
          timestamp: new Date(),
        });
      }

      logger.info('Message routed successfully', {
        messageId: request.messageId,
        instanceId: instance.instance_id,
        processingTime: Date.now() - startTime,
      });

      return {
        content: instanceResponse.content,
        msgType: instanceResponse.msgType,
        success: true,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;

      logger.error('Failed to route message', {
        messageId: request.messageId,
        feishuUserId: request.feishuUserId,
        processingTime,
        error: error instanceof Error ? error.message : String(error),
      });

      // Log failed message
      if (routingOptions.enableLogging) {
        await this.logMessage({
          id: this.generateLogId(),
          messageId: request.messageId,
          instanceId: 'unknown',
          feishuUserId: request.feishuUserId,
          content: request.content,
          processingTime,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
        });
      }

      // Send error message to Feishu
      await this.sendFeishuError(request, error);

      throw error;
    }
  }

  /**
   * Find an active instance for a user
   *
   * @param userId - User ID
   * @returns Active instance or null
   */
  private async findActiveInstance(userId: number): Promise<Instance | null> {
    try {
      // Try to get from cache first
      const cacheKey = `${REDIS_KEYS.USER_INSTANCE}${userId}`;
      const cachedInstanceId = await redis.get(cacheKey);

      if (cachedInstanceId) {
        const instance = await this.instanceRepository.findByInstanceId(cachedInstanceId);
        if (instance && instance.status === 'active') {
          return instance;
        }
      }

      // Query database for active instances
      const instances = await this.instanceRepository.findByOwnerId(userId);
      const activeInstance = instances.find((inst) => inst.status === 'active');

      if (activeInstance) {
        // Cache the instance ID
        await redis.set(cacheKey, activeInstance.instance_id, 'EX', CACHE_TTL.ROUTING_TABLE);
        return activeInstance;
      }

      return null;
    } catch (error) {
      logger.error('Failed to find active instance', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Forward message to instance
   *
   * @param instance - Target instance
   * @param request - Message routing request
   * @param options - Routing options
   * @returns Instance response
   */
  private async forwardToInstance(
    instance: Instance,
    request: MessageRouteRequest,
    options: MessageRoutingOptions
  ): Promise<InstanceMessageResponse> {
    const containerName = `opclaw-${instance.instance_id}`;

    try {
      // Check if container is running
      const containerStatus = await this.dockerService.getContainerStatus(instance.instance_id);
      if (!containerStatus.isRunning) {
        throw this.errorService.createError('INSTANCE_NOT_RUNNING', {
          instanceId: instance.instance_id,
          status: containerStatus.state,
        });
      }

      // Get container network IP
      const container = await (this.dockerService as any).docker.getContainer(containerName);
      const containerInfo = await container.inspect();
      const networkSettings = containerInfo.NetworkSettings;
      const ipAddress =
        networkSettings.IPAddress || networkSettings.Networks?.[Object.keys(networkSettings.Networks || {})[0]]?.IPAddress;

      if (!ipAddress) {
        throw this.errorService.createError('CONTAINER_NO_IP', {
          instanceId: instance.instance_id,
        });
      }

      // Prepare instance message request
      const instanceRequest: InstanceMessageRequest = {
        messageId: request.messageId,
        content: request.content,
        msgType: request.msgType,
        sender: {
          feishuUserId: request.feishuUserId,
        },
        timestamp: request.timestamp,
      };

      // Send message to instance API with retry
      const response = await this.sendWithRetry(
        `http://${ipAddress}:3000/api/chat`,
        instanceRequest,
        options.timeout || 30000,
        options.retryAttempts || 3
      );

      return response as InstanceMessageResponse;
    } catch (error) {
      logger.error('Failed to forward message to instance', {
        instanceId: instance.instance_id,
        messageId: request.messageId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          throw this.errorService.createError('INSTANCE_UNREACHABLE', {
            instanceId: instance.instance_id,
            error: error.message,
          });
        }
        if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
          throw this.errorService.createError('INSTANCE_TIMEOUT', {
            instanceId: instance.instance_id,
            timeout: options.timeout,
          });
        }
      }

      throw this.errorService.createError('MESSAGE_FORWARD_FAILED', {
        instanceId: instance.instance_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Send HTTP request with retry logic
   *
   * @param url - Request URL
   * @param data - Request data
   * @param timeout - Request timeout
   * @param retryAttempts - Number of retry attempts
   * @returns Response data
   */
  private async sendWithRetry(
    url: string,
    data: InstanceMessageRequest,
    timeout: number,
    retryAttempts: number
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        const response = await axios.post(url, data, {
          timeout,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'OpenClaw-Platform/1.0',
          },
        });

        return response.data;
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Request attempt ${attempt + 1} failed`, {
          url,
          error: lastError.message,
        });

        // Don't retry on client errors (4xx)
        if (axios.isAxiosError(error) && error.response?.status && error.response.status < 500) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < retryAttempts - 1) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError;
  }

  /**
   * Send response back to Feishu
   *
   * @param originalRequest - Original message routing request
   * @param instanceResponse - Instance response
   */
  private async sendFeishuResponse(
    originalRequest: MessageRouteRequest,
    instanceResponse: InstanceMessageResponse
  ): Promise<void> {
    try {
      // Prepare Feishu message
      const feishuRequest: FeishuMessageSendRequest = {
        receiveId: originalRequest.chatId || originalRequest.feishuUserId,
        receiveIdType: originalRequest.chatId ? 'chat' : 'open_id',
        msgType: instanceResponse.msgType || 'text',
        content: JSON.stringify({
          text: instanceResponse.content,
        }),
      };

      // Send to Feishu API
      await this.sendToFeishuAPI(feishuRequest);

      logger.info('Feishu response sent', {
        messageId: originalRequest.messageId,
        receiveId: feishuRequest.receiveId,
      });
    } catch (error) {
      logger.error('Failed to send Feishu response', {
        messageId: originalRequest.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - we don't want to fail the whole routing if Feishu reply fails
    }
  }

  /**
   * Send error message to Feishu
   *
   * @param originalRequest - Original message routing request
   * @param error - Error object
   */
  private async sendFeishuError(originalRequest: MessageRouteRequest, error: any): Promise<void> {
    try {
      let errorMessage = '抱歉,处理您的消息时出现错误。请稍后再试。';

      // Provide more specific error message for known errors
      if (error instanceof AppError) {
        if (error.code === 'INSTANCE_NOT_FOUND') {
          errorMessage = '您还没有认领的 OpenClaw 实例。请先扫描二维码认领实例。';
        } else if (error.code === 'INSTANCE_NOT_RUNNING') {
          errorMessage = '您的实例正在启动中,请稍后再试。';
        } else if (error.code === 'INSTANCE_TIMEOUT') {
          errorMessage = '处理超时,请稍后再试或简化您的问题。';
        }
      }

      const feishuRequest: FeishuMessageSendRequest = {
        receiveId: originalRequest.chatId || originalRequest.feishuUserId,
        receiveIdType: originalRequest.chatId ? 'chat' : 'open_id',
        msgType: 'text',
        content: JSON.stringify({
          text: errorMessage,
        }),
      };

      await this.sendToFeishuAPI(feishuRequest);
    } catch (sendError) {
      logger.error('Failed to send error message to Feishu', {
        messageId: originalRequest.messageId,
        error: sendError instanceof Error ? sendError.message : String(sendError),
      });
    }
  }

  /**
   * Send message to Feishu API
   *
   * @param request - Feishu message send request
   */
  private async sendToFeishuAPI(request: FeishuMessageSendRequest): Promise<FeishuMessageSendResponse> {
    const accessToken = await this.getFeishuAccessToken();

    const response = await axios.post(
      'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=' + (request.receiveIdType || 'open_id'),
      {
        receive_id: request.receiveId,
        msg_type: request.msgType,
        content: request.content,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    if (response.data.code !== 0) {
      throw new Error(`Feishu API error: ${response.data.msg} (code: ${response.data.code})`);
    }

    return response.data;
  }

  /**
   * Get Feishu access token
   * Note: This should be implemented with proper token caching
   *
   * @returns Access token
   */
  private async getFeishuAccessToken(): Promise<string> {
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error('FEISHU_APP_ID and FEISHU_APP_SECRET must be configured');
    }

    // TODO: Implement token caching with Redis
    // For now, fetch a new token each time (not optimal for production)

    try {
      const response = await axios.post(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        {
          app_id: appId,
          app_secret: appSecret,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      if (response.data.code !== 0) {
        throw new Error(`Failed to get Feishu access token: ${response.data.msg}`);
      }

      return response.data.tenant_access_token;
    } catch (error) {
      logger.error('Failed to get Feishu access token', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Failed to get Feishu access token');
    }
  }

  /**
   * Update routing table
   *
   * @param feishuUserId - Feishu user ID
   * @param instanceId - Instance ID
   */
  private async updateRoutingTable(feishuUserId: string, instanceId: string): Promise<void> {
    try {
      const key = `${REDIS_KEYS.ROUTING_TABLE}${feishuUserId}`;
      const entry: RoutingEntry = {
        feishuUserId,
        instanceId,
        lastMessageAt: new Date(),
        messageCount: 1,
      };

      // Check if entry exists
      const existing = await redis.get(key);
      if (existing) {
        const parsedEntry = JSON.parse(existing) as RoutingEntry;
        entry.messageCount = parsedEntry.messageCount + 1;
      }

      // Store in Redis
      await redis.set(key, JSON.stringify(entry), 'EX', CACHE_TTL.ROUTING_TABLE);

      logger.debug('Routing table updated', {
        feishuUserId,
        instanceId,
        messageCount: entry.messageCount,
      });
    } catch (error) {
      logger.error('Failed to update routing table', {
        feishuUserId,
        instanceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Log message
   *
   * @param logEntry - Message log entry
   */
  private async logMessage(logEntry: MessageLogEntry): Promise<void> {
    try {
      const key = `${REDIS_KEYS.MESSAGE_LOG}${logEntry.id}`;
      await redis.set(key, JSON.stringify(logEntry), 'EX', CACHE_TTL.MESSAGE_LOG);

      logger.debug('Message logged', {
        logId: logEntry.id,
        messageId: logEntry.messageId,
        instanceId: logEntry.instanceId,
        success: logEntry.success,
      });
    } catch (error) {
      logger.error('Failed to log message', {
        logId: logEntry.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get routing entry for a user
   *
   * @param feishuUserId - Feishu user ID
   * @returns Routing entry or null
   */
  async getRoutingEntry(feishuUserId: string): Promise<RoutingEntry | null> {
    try {
      const key = `${REDIS_KEYS.ROUTING_TABLE}${feishuUserId}`;
      const data = await redis.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as RoutingEntry;
    } catch (error) {
      logger.error('Failed to get routing entry', {
        feishuUserId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get message log
   *
   * @param logId - Log ID
   * @returns Message log entry or null
   */
  async getMessageLog(logId: string): Promise<MessageLogEntry | null> {
    try {
      const key = `${REDIS_KEYS.MESSAGE_LOG}${logId}`;
      const data = await redis.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as MessageLogEntry;
    } catch (error) {
      logger.error('Failed to get message log', {
        logId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Generate unique log ID
   *
   * @returns Log ID
   */
  private generateLogId(): string {
    return `log-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Sleep for a specified duration
   *
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
