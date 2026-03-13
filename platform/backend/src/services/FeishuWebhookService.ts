import { Service } from 'typedi';
import { redis } from '../config/redis';
import { logger } from '../config/logger';
import {
  FeishuWebhookRequest,
  FeishuWebhookResponse,
  FeishuEvent,
  FeishuMessageEvent,
  FeishuBotAddedEvent,
  EventProcessResult,
  MessageContent,
} from '../types/feishu-webhook.types';

/**
 * 飞书 Webhook 服务
 * 处理飞书事件推送、URL 验证和事件去重
 */
@Service()
export class FeishuWebhookService {
  private readonly EVENT_DUPLICATE_KEY_PREFIX = 'feishu:event:';
  private readonly EVENT_DUPLICATE_TTL = 3600; // 1 hour

  /**
   * 处理 Webhook 请求
   * @param request Webhook 请求体
   * @returns Webhook 响应
   */
  async handleWebhook(request: FeishuWebhookRequest): Promise<FeishuWebhookResponse> {
    try {
      logger.info('Received Feishu webhook request', {
        type: request.type,
        event_id: request.event?.event_id,
      });

      // URL 验证请求
      if (request.type === 'url_verification') {
        return this.handleUrlVerification(request);
      }

      // 事件回调请求
      if (request.type === 'event_callback' && request.event) {
        await this.handleEventCallback(request.event);
        return {
          code: 0,
          msg: 'success',
        };
      }

      // 未知请求类型
      logger.warn('Unknown webhook request type', { type: request.type });
      return {
        code: 1,
        msg: 'Unknown request type',
      };
    } catch (error) {
      logger.error('Failed to handle webhook request', error);
      return {
        code: 1,
        msg: 'Internal error',
      };
    }
  }

  /**
   * 处理 URL 验证请求
   * @param request Webhook 请求体
   * @returns Webhook 响应
   */
  private handleUrlVerification(request: FeishuWebhookRequest): FeishuWebhookResponse {
    logger.info('Handling URL verification request');

    // 验证 token
    const expectedToken = process.env.FEISHU_VERIFY_TOKEN;
    if (!expectedToken) {
      logger.error('FEISHU_VERIFY_TOKEN not configured');
      return {
        code: 1,
        msg: 'Verify token not configured',
      };
    }

    if (request.token !== expectedToken) {
      logger.error('Invalid verify token', {
        received: request.token,
        expected: expectedToken,
      });
      return {
        code: 1,
        msg: 'Invalid token',
      };
    }

    // 返回 challenge
    logger.info('URL verification successful');
    return {
      code: 0,
      msg: 'success',
      challenge: request.challenge,
    };
  }

  /**
   * 处理事件回调请求
   * @param event 飞书事件
   */
  private async handleEventCallback(event: FeishuEvent): Promise<void> {
    logger.info('Handling event callback', {
      event_id: event.event_id,
      type: event.event_type,
      create_time: event.create_time,
    });

    // 验证事件 token
    if (!this.validateEventToken(event)) {
      logger.error('Invalid event token', { event_id: event.event_id });
      // 不抛出异常，避免飞书重试
      return;
    }

    // 去重检查
    if (await this.isDuplicateEvent(event.event_id)) {
      logger.warn('Duplicate event detected', { event_id: event.event_id });
      return;
    }

    // 标记事件已处理
    await this.markEventAsProcessed(event.event_id);

    // 根据事件类型分发处理
    const result = await this.processEvent(event);

    if (result.success) {
      logger.info('Event processed successfully', {
        event_id: event.event_id,
        type: event.event_type,
      });
    } else {
      logger.error('Failed to process event', {
        event_id: event.event_id,
        error: result.error,
      });
      // 不抛出异常，避免飞书重试
    }
  }

  /**
   * 验证事件 token
   * @param event 飞书事件
   * @returns 是否有效
   */
  private validateEventToken(event: FeishuEvent): boolean {
    const expectedToken = process.env.FEISHU_VERIFY_TOKEN;
    if (!expectedToken) {
      logger.error('FEISHU_VERIFY_TOKEN not configured');
      return false;
    }

    return event.token === expectedToken;
  }

  /**
   * 检查是否为重复事件
   * @param eventId 事件 ID
   * @returns 是否重复
   */
  private async isDuplicateEvent(eventId: string): Promise<boolean> {
    try {
      const key = `${this.EVENT_DUPLICATE_KEY_PREFIX}${eventId}`;
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Failed to check duplicate event', error);
      // 出错时假设不重复，避免丢失事件
      return false;
    }
  }

  /**
   * 标记事件已处理
   * @param eventId 事件 ID
   */
  private async markEventAsProcessed(eventId: string): Promise<void> {
    try {
      const key = `${this.EVENT_DUPLICATE_KEY_PREFIX}${eventId}`;
      await redis.set(key, '1', 'EX', this.EVENT_DUPLICATE_TTL);
    } catch (error) {
      logger.error('Failed to mark event as processed', error);
    }
  }

  /**
   * 处理具体事件
   * @param event 飞书事件
   * @returns 处理结果
   */
  private async processEvent(event: FeishuEvent): Promise<EventProcessResult> {
    try {
      // 消息事件
      if (event.event_type === 'im.message.receive_v1') {
        return this.handleMessageEvent(event.event.message as FeishuMessageEvent);
      }

      // 群添加机器人事件
      if (event.event_type === 'im.chat.bot_added_to_chat_v1') {
        return this.handleBotAddedEvent(event.event.bot_added_to_chat as FeishuBotAddedEvent);
      }

      logger.warn('Unknown event type', { type: event.event_type });
      return {
        success: false,
        error: 'Unknown event type',
      };
    } catch (error) {
      logger.error('Failed to process event', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 处理消息事件
   * @param messageEvent 消息事件
   * @returns 处理结果
   */
  private async handleMessageEvent(messageEvent: FeishuMessageEvent): Promise<EventProcessResult> {
    logger.info('Handling message event', {
      message_id: messageEvent.message_id,
      msg_type: messageEvent.msg_type,
      sender_id: messageEvent.sender.sender_id.open_id,
    });

    try {
      // 解析消息内容
      const content = this.parseMessageContent(messageEvent.content, messageEvent.msg_type);

      // TODO: 实现消息路由功能 (TASK-022)
      // 目前只记录日志，不进行实际处理

      logger.info('Message event handled', {
        message_id: messageEvent.message_id,
        sender_id: messageEvent.sender.sender_id.open_id,
        content_preview: content.text?.substring(0, 100) || '[non-text]',
      });

      return {
        success: true,
        data: {
          message_id: messageEvent.message_id,
          sender_id: messageEvent.sender.sender_id.open_id,
          content,
        },
      };
    } catch (error) {
      logger.error('Failed to handle message event', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 处理群添加机器人事件
   * @param botAddedEvent 群添加机器人事件
   * @returns 处理结果
   */
  private async handleBotAddedEvent(botAddedEvent: FeishuBotAddedEvent): Promise<EventProcessResult> {
    logger.info('Handling bot added to chat event', {
      chat_id: botAddedEvent.chat.chat_id,
      operator_id: botAddedEvent.operator.sender_id.open_id,
      operate_time: botAddedEvent.operate_time,
    });

    try {
      // TODO: 实现群添加机器人的后续处理
      // 例如：发送欢迎消息、记录群信息等

      logger.info('Bot added to chat event handled', {
        chat_id: botAddedEvent.chat.chat_id,
        chat_name: botAddedEvent.chat.name,
      });

      return {
        success: true,
        data: {
          chat_id: botAddedEvent.chat.chat_id,
          chat_name: botAddedEvent.chat.name,
          operator_id: botAddedEvent.operator.sender_id.open_id,
        },
      };
    } catch (error) {
      logger.error('Failed to handle bot added event', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 解析消息内容
   * @param content 消息内容 (JSON 字符串)
   * @param msgType 消息类型
   * @returns 解析后的消息内容
   */
  private parseMessageContent(content: string, msgType: string): MessageContent {
    try {
      const parsed = JSON.parse(content);

      // 文本消息
      if (msgType === 'text') {
        return {
          text: parsed.text || '',
          raw: parsed,
        };
      }

      // 其他类型消息
      return {
        raw: parsed,
      };
    } catch (error) {
      logger.error('Failed to parse message content', error);
      return {
        raw: content,
      };
    }
  }

  /**
   * 验证请求签名 (可选实现)
   * 注意：飞书事件推送不一定包含签名验证
   * 如果需要签名验证，请参考飞书官方文档
   * @param body 请求体
   * @param signature 签名
   * @param timestamp 时间戳
   * @returns 是否有效
   */
  validateSignature(body: any, signature: string, timestamp: string): boolean {
    try {
      const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
      if (!encryptKey) {
        logger.warn('FEISHU_ENCRYPT_KEY not configured, skipping signature validation');
        return true;
      }

      // TODO: 实现签名验证逻辑
      // 参考飞书官方文档：https://open.feishu.cn/document/ukTMukTMukTM/uUTNz4SN1MjL1UzM
      logger.info('Signature validation not implemented yet');
      return true;
    } catch (error) {
      logger.error('Failed to validate signature', error);
      return false;
    }
  }
}
