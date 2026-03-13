import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { Container } from 'typedi';
import { expressApp } from '../../app';
import { FeishuWebhookService } from '../../services/FeishuWebhookService';

// Mock FeishuWebhookService
jest.mock('../../services/FeishuWebhookService');

// Mock logger
jest.mock('../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock database and Redis
jest.mock('../../config/database', () => ({
  AppDataSource: {
    isInitialized: false,
    initialize: jest.fn(),
  },
}));

jest.mock('../../config/redis', () => ({
  redis: {
    on: jest.fn(),
    status: 'ready',
  },
}));

describe('FeishuWebhookController Integration Tests', () => {
  let mockWebhookService: jest.Mocked<FeishuWebhookService>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Set environment variables
    process.env.FEISHU_VERIFY_TOKEN = 'test_verify_token';
    process.env.FEISHU_ENCRYPT_KEY = 'test_encrypt_key';

    // Get mocked service
    mockWebhookService = Container.get(FeishuWebhookService) as jest.Mocked<FeishuWebhookService>;
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.FEISHU_VERIFY_TOKEN;
    delete process.env.FEISHU_ENCRYPT_KEY;
  });

  describe('POST /feishu/events', () => {
    it('should handle URL verification request successfully', async () => {
      const requestBody = {
        type: 'url_verification',
        token: 'test_verify_token',
        challenge: 'test_challenge',
      };

      const expectedResponse = {
        code: 0,
        msg: 'success',
        challenge: 'test_challenge',
      };

      mockWebhookService.handleWebhook.mockResolvedValue(expectedResponse);

      const response = await request(expressApp)
        .post('/feishu/events')
        .send(requestBody)
        .expect(200);

      expect(response.body).toEqual(expectedResponse);
      expect(mockWebhookService.handleWebhook).toHaveBeenCalledWith(requestBody);
    });

    it('should handle event callback request successfully', async () => {
      const requestBody = {
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
        },
      };

      const expectedResponse = {
        code: 0,
        msg: 'success',
      };

      mockWebhookService.handleWebhook.mockResolvedValue(expectedResponse);

      const response = await request(expressApp)
        .post('/feishu/events')
        .send(requestBody)
        .expect(200);

      expect(response.body).toEqual(expectedResponse);
      expect(mockWebhookService.handleWebhook).toHaveBeenCalledWith(requestBody);
    });

    it('should handle message event with text content', async () => {
      const requestBody = {
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
                  union_id: 'test_union_id',
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
            },
          },
        },
      };

      const expectedResponse = {
        code: 0,
        msg: 'success',
      };

      mockWebhookService.handleWebhook.mockResolvedValue(expectedResponse);

      const response = await request(expressApp)
        .post('/feishu/events')
        .send(requestBody)
        .expect(200);

      expect(response.body).toEqual(expectedResponse);
    });

    it('should handle bot added to chat event', async () => {
      const requestBody = {
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
        },
      };

      const expectedResponse = {
        code: 0,
        msg: 'success',
      };

      mockWebhookService.handleWebhook.mockResolvedValue(expectedResponse);

      const response = await request(expressApp)
        .post('/feishu/events')
        .send(requestBody)
        .expect(200);

      expect(response.body).toEqual(expectedResponse);
    });

    it('should handle invalid token in URL verification', async () => {
      const requestBody = {
        type: 'url_verification',
        token: 'invalid_token',
        challenge: 'test_challenge',
      };

      const expectedResponse = {
        code: 1,
        msg: 'Invalid token',
      };

      mockWebhookService.handleWebhook.mockResolvedValue(expectedResponse);

      const response = await request(expressApp)
        .post('/feishu/events')
        .send(requestBody)
        .expect(200);

      expect(response.body).toEqual(expectedResponse);
    });

    it('should handle unknown request type', async () => {
      const requestBody = {
        type: 'unknown_type',
      };

      const expectedResponse = {
        code: 1,
        msg: 'Unknown request type',
      };

      mockWebhookService.handleWebhook.mockResolvedValue(expectedResponse);

      const response = await request(expressApp)
        .post('/feishu/events')
        .send(requestBody)
        .expect(200);

      expect(response.body).toEqual(expectedResponse);
    });

    it('should handle service error gracefully', async () => {
      const requestBody = {
        type: 'event_callback',
        event: {
          type: 'event_callback',
          create_time: '1234567890000',
          token: 'test_verify_token',
          event_id: 'test_event_id',
          app_id: 'test_app_id',
          tenant_key: 'test_tenant_key',
          event_type: 'im.message.receive_v1',
          event: {},
        },
      };

      mockWebhookService.handleWebhook.mockRejectedValue(new Error('Service error'));

      const response = await request(expressApp)
        .post('/feishu/events')
        .send(requestBody)
        .expect(200);

      expect(response.body).toEqual({
        code: 500,
        msg: 'Internal server error',
      });
    });

    it('should validate signature when provided', async () => {
      const requestBody = {
        type: 'url_verification',
        token: 'test_verify_token',
        challenge: 'test_challenge',
      };

      const expectedResponse = {
        code: 0,
        msg: 'success',
        challenge: 'test_challenge',
      };

      mockWebhookService.handleWebhook.mockResolvedValue(expectedResponse);
      mockWebhookService.validateSignature.mockReturnValue(true);

      await request(expressApp)
        .post('/feishu/events')
        .set('x-feishu-timestamp', '1234567890')
        .set('x-feishu-signature', 'test_signature')
        .send(requestBody)
        .expect(200);

      expect(mockWebhookService.validateSignature).toHaveBeenCalledWith(
        requestBody,
        'test_signature',
        '1234567890'
      );
    });

    it('should reject invalid signature', async () => {
      const requestBody = {
        type: 'url_verification',
        token: 'test_verify_token',
        challenge: 'test_challenge',
      };

      mockWebhookService.validateSignature.mockReturnValue(false);

      const response = await request(expressApp)
        .post('/feishu/events')
        .set('x-feishu-timestamp', '1234567890')
        .set('x-feishu-signature', 'invalid_signature')
        .send(requestBody)
        .expect(200);

      expect(response.body).toEqual({
        code: 403,
        msg: 'Invalid signature',
      });

      expect(mockWebhookService.handleWebhook).not.toHaveBeenCalled();
    });
  });

  describe('POST /feishu/health', () => {
    it('should return health check status', async () => {
      const response = await request(expressApp)
        .post('/feishu/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'ok',
        message: 'Feishu webhook service is running',
      });
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JSON in request body', async () => {
      const response = await request(expressApp)
        .post('/feishu/events')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      // Express should handle JSON parsing errors
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle missing required fields', async () => {
      const requestBody = {
        type: 'url_verification',
        // Missing token and challenge
      };

      const expectedResponse = {
        code: 0,
        msg: 'success',
      };

      mockWebhookService.handleWebhook.mockResolvedValue(expectedResponse);

      // Request should still be processed (validation happens in service layer)
      const response = await request(expressApp)
        .post('/feishu/events')
        .send(requestBody)
        .expect(200);

      expect(response.body).toEqual(expectedResponse);
    });
  });
});
