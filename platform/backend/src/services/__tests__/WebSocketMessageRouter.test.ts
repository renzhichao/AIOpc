/**
 * WebSocket Message Router Service Tests
 *
 * Tests for WebSocket-based message routing between clients and AI instances
 *
 * Test Coverage:
 * - Message routing to local/remote instances
 * - Instance lookup and validation
 * - Message queue and retry mechanism
 * - Response handling and forwarding
 * - Error handling and edge cases
 */

import 'reflect-metadata';
import { WebSocketMessageRouter } from '../WebSocketMessageRouter';
import { InstanceRegistry } from '../InstanceRegistry';
import { WebSocketGateway } from '../WebSocketGateway';
import { InstanceInfo } from '../InstanceRegistry';
import { logger } from '../../config/logger';

// Mock dependencies
jest.mock('../../config/logger');
jest.mock('../InstanceRegistry');
jest.mock('../WebSocketGateway');

describe('WebSocketMessageRouter', () => {
  let messageRouter: WebSocketMessageRouter;
  let mockInstanceRegistry: jest.Mocked<InstanceRegistry>;
  let mockWebSocketGateway: jest.Mocked<WebSocketGateway>;

  // Mock instance info
  const mockLocalInstance: InstanceInfo = {
    instance_id: 'inst-local-123',
    owner_id: 1,
    connection_type: 'local',
    api_endpoint: 'http://localhost:3000',
    status: 'online',
    last_heartbeat: Date.now(),
    registered_at: Date.now(),
    metadata: {},
  };

  const mockRemoteInstance: InstanceInfo = {
    instance_id: 'inst-remote-456',
    owner_id: 2,
    connection_type: 'remote',
    api_endpoint: 'https://remote-instance.com',
    status: 'online',
    last_heartbeat: Date.now(),
    registered_at: Date.now(),
    metadata: {},
  };

  const mockOfflineInstance: InstanceInfo = {
    instance_id: 'inst-offline-789',
    owner_id: 3,
    connection_type: 'local',
    api_endpoint: 'http://localhost:3001',
    status: 'offline',
    last_heartbeat: Date.now() - 60000, // 1 minute ago
    registered_at: Date.now(),
    metadata: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockInstanceRegistry = {
      getUserInstance: jest.fn(),
      getInstanceInfo: jest.fn(),
      healthCheck: jest.fn(),
    } as any;

    mockWebSocketGateway = {
      sendToClient: jest.fn(),
    } as any;

    // Create MessageRouter instance
    messageRouter = new WebSocketMessageRouter(
      mockInstanceRegistry,
      mockWebSocketGateway
    );

    // Mock fetch globally
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('routeUserMessage', () => {
    const userId = 1;
    const content = 'Hello, AI!';

    it('should successfully route message to local instance', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          content: 'Hello! How can I help you?',
          timestamp: new Date().toISOString(),
        }),
      });

      // Execute
      const result = await messageRouter.routeUserMessage(userId, content);

      // Verify
      expect(result.status).toBe('sent');
      expect(result.instance_id).toBe('inst-local-123');
      expect(result.message_id).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(mockInstanceRegistry.getUserInstance).toHaveBeenCalledWith(userId);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/message',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should successfully route message to remote instance', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockRemoteInstance);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          content: 'Response from remote instance',
          timestamp: new Date().toISOString(),
        }),
      });

      // Execute
      const result = await messageRouter.routeUserMessage(2, content);

      // Verify
      expect(result.status).toBe('sent');
      expect(result.instance_id).toBe('inst-remote-456');
      expect(mockInstanceRegistry.getUserInstance).toHaveBeenCalledWith(2);
    });

    it('should throw error when user has no instance', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(null);

      // Execute & Verify
      await expect(messageRouter.routeUserMessage(userId, content)).rejects.toThrow(
        'No instance found for user'
      );
      expect(mockInstanceRegistry.getUserInstance).toHaveBeenCalledWith(userId);
    });

    it('should throw error when instance is offline', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockOfflineInstance);

      // Execute & Verify
      await expect(messageRouter.routeUserMessage(3, content)).rejects.toThrow(
        'Instance is offline'
      );
    });

    it('should queue message when instance fails to respond', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error('ECONNREFUSED')
      );

      // Execute
      const result = await messageRouter.routeUserMessage(userId, content);

      // Verify
      expect(result.status).toBe('queued');
      expect(result.instance_id).toBe('inst-local-123');
      expect(result.message_id).toBeDefined();
    });

    it('should generate unique message IDs', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'Response', timestamp: new Date().toISOString() }),
      });

      // Execute multiple times
      const result1 = await messageRouter.routeUserMessage(userId, 'Message 1');
      const result2 = await messageRouter.routeUserMessage(userId, 'Message 2');

      // Verify unique IDs
      expect(result1.message_id).not.toBe(result2.message_id);
    });

    it('should handle empty message content', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ content: '', timestamp: new Date().toISOString() }),
      });

      // Execute
      const result = await messageRouter.routeUserMessage(userId, '');

      // Verify
      expect(result.status).toBe('sent');
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should handle very long message content', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      const longContent = 'A'.repeat(10000);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'OK', timestamp: new Date().toISOString() }),
      });

      // Execute
      const result = await messageRouter.routeUserMessage(userId, longContent);

      // Verify
      expect(result.status).toBe('sent');
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('sendToLocalInstance', () => {
    it('should send HTTP POST to instance API endpoint', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'Response', timestamp: new Date().toISOString() }),
      });

      // Execute
      await messageRouter.routeUserMessage(1, 'Test message');

      // Verify fetch call
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/message',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Message-ID': expect.any(String),
            'X-User-ID': '1',
          }),
          body: expect.stringContaining('Test message'),
        })
      );
    });

    it('should handle instance HTTP errors', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Internal error' }),
      });

      // Execute
      const result = await messageRouter.routeUserMessage(1, 'Test message');

      // Verify
      expect(result.status).toBe('queued');
    });

    it('should forward instance response to WebSocketGateway', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      const mockResponse = {
        content: 'Hello from instance!',
        timestamp: new Date().toISOString(),
      };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      // Execute
      await messageRouter.routeUserMessage(1, 'Test message');

      // Verify WebSocketGateway was called
      expect(mockWebSocketGateway.sendToClient).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          type: 'assistant_message',
          content: mockResponse.content,
          instance_id: 'inst-local-123',
        })
      );
    });

    it('should handle timeout when sending to instance', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error('Request timeout')
      );

      // Execute
      const result = await messageRouter.routeUserMessage(1, 'Test message');

      // Verify
      expect(result.status).toBe('queued');
    });
  });

  describe('sendToRemoteInstance', () => {
    it('should handle remote instance routing (placeholder)', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockRemoteInstance);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'Remote response', timestamp: new Date().toISOString() }),
      });

      // Execute
      const result = await messageRouter.routeUserMessage(2, 'Test message');

      // Verify - remote instances currently use same HTTP mechanism
      expect(result.status).toBe('sent');
      expect(result.instance_id).toBe('inst-remote-456');
    });
  });

  describe('Message Queue', () => {
    it('should add failed message to retry queue', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Execute
      const result = await messageRouter.routeUserMessage(1, 'Failed message');

      // Verify
      expect(result.status).toBe('queued');
      const stats = messageRouter.getQueueStats();
      expect(stats.queued).toBe(1);
    });

    it('should remove message from queue after successful retry', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);

      // First call fails
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: 'Success', timestamp: new Date().toISOString() }),
        });

      // Execute first message (fails)
      const result1 = await messageRouter.routeUserMessage(1, 'Message');
      expect(result1.status).toBe('queued');

      // Manually trigger retry processor
      await messageRouter.processRetryQueue();

      // Verify queue is empty after successful retry
      const stats = messageRouter.getQueueStats();
      expect(stats.queued).toBe(0);
    });

    it('should retry messages within 1 minute', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Execute
      await messageRouter.routeUserMessage(1, 'Message');

      // Start retry processor
      messageRouter.startRetryProcessor(100);

      // Wait for retry attempt
      await new Promise(resolve => setTimeout(resolve, 150));

      // Stop retry processor
      messageRouter.stopRetryProcessor();

      // Verify retry was attempted
      expect(global.fetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('should remove message after max retries', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Execute
      await messageRouter.routeUserMessage(1, 'Message');

      // Process retry queue multiple times (simulate max retries)
      for (let i = 0; i < 5; i++) {
        await messageRouter.processRetryQueue();
      }

      // Verify message removed from queue
      const stats = messageRouter.getQueueStats();
      expect(stats.queued).toBe(0);
      expect(stats.failed).toBe(1);
    });

    it('should provide queue statistics', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Execute multiple messages
      await messageRouter.routeUserMessage(1, 'Message 1');
      await messageRouter.routeUserMessage(1, 'Message 2');
      await messageRouter.routeUserMessage(1, 'Message 3');

      // Get stats
      const stats = messageRouter.getQueueStats();

      // Verify
      expect(stats.queued).toBe(3);
      expect(stats.retrying).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('handleInstanceResponse', () => {
    it('should forward instance response to WebSocketGateway', async () => {
      const response = {
        content: 'Hello from instance!',
        timestamp: new Date().toISOString(),
      };

      // Execute
      await messageRouter.handleInstanceResponse('inst-local-123', response);

      // Verify
      expect(mockWebSocketGateway.sendToClient).toHaveBeenCalledWith(
        1, // owner_id from mockLocalInstance
        expect.objectContaining({
          type: 'assistant_message',
          content: response.content,
          instance_id: 'inst-local-123',
        })
      );
    });

    it('should handle malformed instance response', async () => {
      const malformedResponse = {};

      // Execute - should not throw
      await expect(
        messageRouter.handleInstanceResponse('inst-local-123', malformedResponse)
      ).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent messages from same user', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'OK', timestamp: new Date().toISOString() }),
      });

      // Execute concurrent messages
      const promises = [
        messageRouter.routeUserMessage(1, 'Message 1'),
        messageRouter.routeUserMessage(1, 'Message 2'),
        messageRouter.routeUserMessage(1, 'Message 3'),
      ];

      // Verify all succeed
      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result.status).toBe('sent');
      });
    });

    it('should handle instance going offline while sending', async () => {
      // Setup mocks - instance is online initially
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);

      // Fetch fails (simulating instance going offline)
      (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

      // Execute
      const result = await messageRouter.routeUserMessage(1, 'Test message');

      // Verify message is queued
      expect(result.status).toBe('queued');
    });

    it('should handle special characters in message content', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      const specialContent = 'Hello! 🎉 @user #hashtag https://example.com';
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'OK', timestamp: new Date().toISOString() }),
      });

      // Execute
      const result = await messageRouter.routeUserMessage(1, specialContent);

      // Verify
      expect(result.status).toBe('sent');
    });

    it('should handle JSON in message content', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      const jsonContent = JSON.stringify({ data: 'test', value: 123 });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'OK', timestamp: new Date().toISOString() }),
      });

      // Execute
      const result = await messageRouter.routeUserMessage(1, jsonContent);

      // Verify
      expect(result.status).toBe('sent');
    });
  });

  describe('Retry Processor', () => {
    afterEach(() => {
      messageRouter.stopRetryProcessor();
    });

    it('should start retry processor', () => {
      // Execute
      messageRouter.startRetryProcessor(1000);

      // Verify
      expect(messageRouter.isRetryProcessorRunning()).toBe(true);
    });

    it('should stop retry processor', () => {
      // Execute
      messageRouter.startRetryProcessor(1000);
      messageRouter.stopRetryProcessor();

      // Verify
      expect(messageRouter.isRetryProcessorRunning()).toBe(false);
    });

    it('should process queued messages periodically', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);

      // First call fails, second succeeds
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: 'Success', timestamp: new Date().toISOString() }),
        });

      // Execute first message (fails)
      await messageRouter.routeUserMessage(1, 'Message');
      expect(messageRouter.getQueueStats().queued).toBe(1);

      // Start retry processor
      messageRouter.startRetryProcessor(50);

      // Wait for retry
      await new Promise(resolve => setTimeout(resolve, 100));

      // Stop retry processor
      messageRouter.stopRetryProcessor();

      // Verify queue is empty
      expect(messageRouter.getQueueStats().queued).toBe(0);
    });
  });

  describe('Logging', () => {
    it('should log message routing success', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ content: 'OK', timestamp: new Date().toISOString() }),
      });

      // Execute
      await messageRouter.routeUserMessage(1, 'Test message');

      // Verify logging (not throwing)
      expect(logger.info).toHaveBeenCalled();
    });

    it('should log message routing failure', async () => {
      // Setup mocks
      mockInstanceRegistry.getUserInstance.mockResolvedValue(mockLocalInstance);
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Execute
      await messageRouter.routeUserMessage(1, 'Test message');

      // Verify error logging
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
