import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Container } from 'typedi';
import { FeishuWebhookService } from '../FeishuWebhookService';
import { MessageRouter } from '../MessageRouter';
import { redis } from '../../config/redis';
import {
  FeishuWebhookRequest,
  FeishuEvent,
  FeishuMessageEvent,
  FeishuBotAddedEvent,
} from '../../types/feishu-webhook.types';

// Mock Redis
jest.mock('../../config/redis', () => ({
  redis: {
    set: jest.fn(),
    get: jest.fn(),
    exists: jest.fn(),
    del: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock MessageRouter
jest.mock('../MessageRouter');

describe('FeishuWebhookService', () => {
  let service: FeishuWebhookService;
  let mockMessageRouter: jest.Mocked<MessageRouter>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Set environment variables
    process.env.FEISHU_VERIFY_TOKEN = 'test_verify_token';
    process.env.FEISHU_ENCRYPT_KEY = 'test_encrypt_key';

    // Create mock MessageRouter
    mockMessageRouter = {
      routeMessage: jest.fn().mockResolvedValue({
        success: true,
        content: 'Test response',
        msgType: 'text',
      }),
    } as unknown as jest.Mocked<MessageRouter>;

    // Register mock in container
    Container.set(MessageRouter, mockMessageRouter);

    // Get service from container
    service = Container.get(FeishuWebhookService);
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.FEISHU_VERIFY_TOKEN;
    delete process.env.FEISHU_ENCRYPT_KEY;
  });

  describe('handleWebhook', () => {
    it('should handle URL verification request successfully', async () => {
      const request: FeishuWebhookRequest = {
        type: 'url_verification',
        token: 'test_verify_token',
        challenge: 'test_challenge',
      };

      const response = await service.handleWebhook(request);

      expect(response).toEqual({
        code: 0,
        msg: 'success',
        challenge: 'test_challenge',
      });
    });

    it('should reject URL verification with invalid token', async () => {
      const request: FeishuWebhookRequest = {
        type: 'url_verification',
        token: 'invalid_token',
        challenge: 'test_challenge',
      };

      const response = await service.handleWebhook(request);

      expect(response).toEqual({
        code: 1,
        msg: 'Invalid token',
      });
    });

    it('should handle event callback successfully', async () => {
      const request: FeishuWebhookRequest = {
        type: 'event_callback',
        event: {
          type: 'event_callback',
          create_time: '1234567890000',
          token: 'test_verify_token',
          event_id: 'test_event_id',
          app_id: 'test_app_id',
          tenant_key: 'test_tenant_key',
          event_type: 'im.message.receive_v1',
          event: {
            message: {
              message_id: 'test_message_id',
              create_time: '1234567890000',
              content: JSON.stringify({ text: 'Hello' }),
              msg_type: 'text',
              sender: {
                sender_id: {
                  open_id: 'test_open_id',
                  union_id: 'test_union_id',
                },
                sender_type: 'user',
                tenant_key: 'test_tenant_key',
              },
            },
          },
        } as any,
      };

      // Mock Redis exists to return false (not duplicate)
      (redis.exists as any).mockResolvedValue(0);

      const response = await service.handleWebhook(request);

      expect(response).toEqual({
        code: 0,
        msg: 'success',
      });

      // Verify Redis operations
      expect(redis.exists).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalled();
    });

    it('should handle duplicate event', async () => {
      const request: FeishuWebhookRequest = {
        type: 'event_callback',
        event: {
          type: 'event_callback',
          create_time: '1234567890000',
          token: 'test_verify_token',
          event_id: 'test_event_id',
          app_id: 'test_app_id',
          tenant_key: 'test_tenant_key',
          event_type: 'im.message.receive_v1',
          event: {
            message: {
              message_id: 'test_message_id',
              create_time: '1234567890000',
              content: JSON.stringify({ text: 'Hello' }),
              msg_type: 'text',
              sender: {
                sender_id: {
                  open_id: 'test_open_id',
                },
                sender_type: 'user',
                tenant_key: 'test_tenant_key',
              },
            },
          },
        } as any,
      };

      // Mock Redis exists to return true (duplicate)
      (redis.exists as any).mockResolvedValue(1);

      const response = await service.handleWebhook(request);

      expect(response).toEqual({
        code: 0,
        msg: 'success',
      });

      // Verify that event was not processed again
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('should reject event with invalid token', async () => {
      const request: FeishuWebhookRequest = {
        type: 'event_callback',
        event: {
          type: 'event_callback',
          create_time: '1234567890000',
          token: 'invalid_token',
          event_id: 'test_event_id',
          app_id: 'test_app_id',
          tenant_key: 'test_tenant_key',
          event_type: 'im.message.receive_v1',
          event: {},
        } as any,
      };

      // Mock Redis exists to return false
      (redis.exists as any).mockResolvedValue(0);

      const response = await service.handleWebhook(request);

      expect(response).toEqual({
        code: 0,
        msg: 'success',
      });
    });

    it('should handle unknown request type', async () => {
      const request: FeishuWebhookRequest = {
        type: 'unknown_type',
      };

      const response = await service.handleWebhook(request);

      expect(response).toEqual({
        code: 1,
        msg: 'Unknown request type',
      });
    });
  });

  describe('parseMessageContent', () => {
    it('should parse text message correctly and route to MessageRouter', async () => {
      const request: FeishuWebhookRequest = {
        type: 'event_callback',
        event: {
          type: 'event_callback',
          create_time: '1234567890000',
          token: 'test_verify_token',
          event_id: 'test_event_id',
          app_id: 'test_app_id',
          tenant_key: 'test_tenant_key',
          event_type: 'im.message.receive_v1',
          event: {
            message: {
              message_id: 'test_message_id',
              create_time: '1234567890000',
              content: JSON.stringify({ text: 'Hello, World!' }),
              msg_type: 'text',
              sender: {
                sender_id: {
                  open_id: 'test_open_id',
                },
                sender_type: 'user',
                tenant_key: 'test_tenant_key',
              },
            },
          },
        } as any,
      };

      (redis.exists as any).mockResolvedValue(0);
      (redis.set as any).mockResolvedValue('OK');

      const response = await service.handleWebhook(request);

      expect(response.code).toBe(0);
      expect(mockMessageRouter.routeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          feishuUserId: 'test_open_id',
          messageId: 'test_message_id',
          content: 'Hello, World!',
          msgType: 'text',
        })
      );
    });

    it('should parse non-text message correctly', async () => {
      const request: FeishuWebhookRequest = {
        type: 'event_callback',
        event: {
          type: 'event_callback',
          create_time: '1234567890000',
          token: 'test_verify_token',
          event_id: 'test_event_id',
          app_id: 'test_app_id',
          tenant_key: 'test_tenant_key',
          event_type: 'im.message.receive_v1',
          event: {
            message: {
              message_id: 'test_message_id',
              create_time: '1234567890000',
              content: JSON.stringify({ image_key: 'test_image_key' }),
              msg_type: 'image',
              sender: {
                sender_id: {
                  open_id: 'test_open_id',
                },
                sender_type: 'user',
                tenant_key: 'test_tenant_key',
              },
            },
          },
        } as any,
      };

      (redis.exists as any).mockResolvedValue(0);

      const response = await service.handleWebhook(request);

      expect(response.code).toBe(0);
    });

    it('should handle invalid JSON in message content', async () => {
      const request: FeishuWebhookRequest = {
        type: 'event_callback',
        event: {
          type: 'event_callback',
          create_time: '1234567890000',
          token: 'test_verify_token',
          event_id: 'test_event_id',
          app_id: 'test_app_id',
          tenant_key: 'test_tenant_key',
          event_type: 'im.message.receive_v1',
          event: {
            message: {
              message_id: 'test_message_id',
              create_time: '1234567890000',
              content: 'invalid json',
              msg_type: 'text',
              sender: {
                sender_id: {
                  open_id: 'test_open_id',
                },
                sender_type: 'user',
                tenant_key: 'test_tenant_key',
              },
            },
          },
        } as any,
      };

      (redis.exists as any).mockResolvedValue(0);

      const response = await service.handleWebhook(request);

      expect(response.code).toBe(0);
    });
  });

  describe('handleBotAddedEvent', () => {
    it('should handle bot added to chat event successfully', async () => {
      const request: FeishuWebhookRequest = {
        type: 'event_callback',
        event: {
          type: 'event_callback',
          create_time: '1234567890000',
          token: 'test_verify_token',
          event_id: 'test_event_id',
          app_id: 'test_app_id',
          tenant_key: 'test_tenant_key',
          event_type: 'im.chat.bot_added_to_chat_v1',
          event: {
            bot_added_to_chat: {
              operator: {
                sender_id: {
                  open_id: 'test_operator_id',
                },
                sender_type: 'user',
                tenant_key: 'test_tenant_key',
              },
              chat: {
                chat_id: 'test_chat_id',
                chat_type: 'group',
                name: 'Test Group',
                tenant_key: 'test_tenant_key',
              },
              operate_time: '1234567890000',
            },
          },
        } as any,
      };

      (redis.exists as any).mockResolvedValue(0);

      const response = await service.handleWebhook(request);

      expect(response.code).toBe(0);
    });
  });

  describe('validateSignature', () => {
    it('should return true when encrypt key is not configured', () => {
      delete process.env.FEISHU_ENCRYPT_KEY;

      const isValid = service.validateSignature({}, 'signature', 'timestamp');

      expect(isValid).toBe(true);
    });

    it('should return true (signature validation not implemented)', () => {
      const isValid = service.validateSignature({}, 'signature', 'timestamp');

      expect(isValid).toBe(true);
    });
  });

  describe('Redis error handling', () => {
    it('should handle Redis error gracefully during duplicate check', async () => {
      const request: FeishuWebhookRequest = {
        type: 'event_callback',
        event: {
          type: 'event_callback',
          create_time: '1234567890000',
          token: 'test_verify_token',
          event_id: 'test_event_id',
          app_id: 'test_app_id',
          tenant_key: 'test_tenant_key',
          event_type: 'im.message.receive_v1',
          event: {
            message: {
              message_id: 'test_message_id',
              create_time: '1234567890000',
              content: JSON.stringify({ text: 'Hello' }),
              msg_type: 'text',
              sender: {
                sender_id: {
                  open_id: 'test_open_id',
                },
                sender_type: 'user',
                tenant_key: 'test_tenant_key',
              },
            },
          },
        } as any,
      };

      // Mock Redis exists to throw error
      (redis.exists as any).mockRejectedValue(new Error('Redis error'));

      const response = await service.handleWebhook(request);

      // Should still process the event
      expect(response.code).toBe(0);
    });
  });

  describe('Unknown event type', () => {
    it('should handle unknown event type gracefully', async () => {
      const request: FeishuWebhookRequest = {
        type: 'event_callback',
        event: {
          type: 'event_callback',
          create_time: '1234567890000',
          token: 'test_verify_token',
          event_id: 'test_event_id',
          app_id: 'test_app_id',
          tenant_key: 'test_tenant_key',
          event_type: 'unknown.event.type',
          event: {},
        } as any,
      };

      (redis.exists as any).mockResolvedValue(0);

      const response = await service.handleWebhook(request);

      // Should still return success (error is logged, not thrown)
      expect(response.code).toBe(0);
    });
  });
});
