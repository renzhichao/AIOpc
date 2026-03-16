/**
 * ChatController Unit Tests
 *
 * TDD Implementation for TASK-009: Chat Controller
 *
 * Test Cycle: Red (Write failing tests) → Green (Make tests pass) → Refactor
 */

const { describe, it, expect, beforeEach } = require('@jest/globals');

describe('ChatController', () => {
  let ChatController;
  let WebSocketMessageRouter;
  let InstanceRegistry;
  let chatController;
  let mockMessageRouter;
  let mockInstanceRegistry;

  const mockUser = {
    userId: 123,
    feishu_user_id: 'feishu_123',
    name: 'Test User',
  };

  const mockInstanceInfo = {
    instance_id: 'inst-xyz789',
    owner_id: 123,
    connection_type: 'local',
    api_endpoint: 'http://localhost:8080',
    status: 'online',
    last_heartbeat: Date.now(),
    registered_at: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock WebSocketMessageRouter
    WebSocketMessageRouter = {
      routeUserMessage: jest.fn(),
    };

    // Mock InstanceRegistry
    InstanceRegistry = {
      getUserInstance: jest.fn(),
    };

    // Import from compiled dist
    const ChatControllerModule = require('../../../dist/controllers/ChatController');
    ChatController = ChatControllerModule.ChatController;

    // Create controller instance with mocks
    chatController = new ChatController(WebSocketMessageRouter, InstanceRegistry);
  });

  describe('POST /chat/send', () => {
    it('should send message successfully', async () => {
      const mockRouteResult = {
        message_id: 'msg-abc123',
        status: 'sent',
        instance_id: 'inst-xyz789',
        timestamp: '2026-03-17T00:30:00.000Z',
      };

      WebSocketMessageRouter.routeUserMessage.mockResolvedValue(mockRouteResult);

      const body = { content: 'Hello, AI assistant!' };
      const req = { user: mockUser };

      const result = await chatController.sendMessage(body, req);

      expect(result).toEqual({
        success: true,
        message_id: 'msg-abc123',
        timestamp: '2026-03-17T00:30:00.000Z',
      });
      expect(WebSocketMessageRouter.routeUserMessage).toHaveBeenCalledWith(123, 'Hello, AI assistant!');
    });

    it('should return error when content is empty', async () => {
      const body = { content: '' };
      const req = { user: mockUser };

      const result = await chatController.sendMessage(body, req);

      expect(result).toEqual({
        success: false,
        error: 'Message content is required and cannot be empty',
      });
      expect(WebSocketMessageRouter.routeUserMessage).not.toHaveBeenCalled();
    });

    it('should return error when content is only whitespace', async () => {
      const body = { content: '   ' };
      const req = { user: mockUser };

      const result = await chatController.sendMessage(body, req);

      expect(result).toEqual({
        success: false,
        error: 'Message content is required and cannot be empty',
      });
      expect(WebSocketMessageRouter.routeUserMessage).not.toHaveBeenCalled();
    });

    it('should return error when content is undefined', async () => {
      const body = { content: undefined };
      const req = { user: mockUser };

      const result = await chatController.sendMessage(body, req);

      expect(result).toEqual({
        success: false,
        error: 'Message content is required and cannot be empty',
      });
      expect(WebSocketMessageRouter.routeUserMessage).not.toHaveBeenCalled();
    });

    it('should trim whitespace from content', async () => {
      const mockRouteResult = {
        message_id: 'msg-abc123',
        status: 'sent',
        instance_id: 'inst-xyz789',
        timestamp: '2026-03-17T00:30:00.000Z',
      };

      WebSocketMessageRouter.routeUserMessage.mockResolvedValue(mockRouteResult);

      const body = { content: '  Hello, AI!  ' };
      const req = { user: mockUser };

      const result = await chatController.sendMessage(body, req);

      expect(result.success).toBe(true);
      expect(WebSocketMessageRouter.routeUserMessage).toHaveBeenCalledWith(123, 'Hello, AI!');
    });

    it('should return error when instance is offline', async () => {
      WebSocketMessageRouter.routeUserMessage.mockRejectedValue(
        new Error('Instance inst-xyz789 is offline')
      );

      const body = { content: 'Hello' };
      const req = { user: mockUser };

      const result = await chatController.sendMessage(body, req);

      expect(result).toEqual({
        success: false,
        error: 'Instance is offline. Please try again later.',
      });
    });

    it('should return error when user has no instance', async () => {
      WebSocketMessageRouter.routeUserMessage.mockRejectedValue(
        new Error('No instance found for user 123')
      );

      const body = { content: 'Hello' };
      const req = { user: mockUser };

      const result = await chatController.sendMessage(body, req);

      expect(result).toEqual({
        success: false,
        error: 'No instance found for this user. Please create an instance first.',
      });
    });

    it('should return generic error when routing fails', async () => {
      WebSocketMessageRouter.routeUserMessage.mockRejectedValue(
        new Error('Network error')
      );

      const body = { content: 'Hello' };
      const req = { user: mockUser };

      const result = await chatController.sendMessage(body, req);

      expect(result).toEqual({
        success: false,
        error: 'Failed to send message. Please try again.',
      });
    });

    it('should handle very long message content', async () => {
      const mockRouteResult = {
        message_id: 'msg-abc123',
        status: 'sent',
        instance_id: 'inst-xyz789',
        timestamp: '2026-03-17T00:30:00.000Z',
      };

      WebSocketMessageRouter.routeUserMessage.mockResolvedValue(mockRouteResult);

      const longContent = 'A'.repeat(10000);
      const body = { content: longContent };
      const req = { user: mockUser };

      const result = await chatController.sendMessage(body, req);

      expect(result.success).toBe(true);
      expect(WebSocketMessageRouter.routeUserMessage).toHaveBeenCalledWith(123, longContent);
    });

    it('should handle special characters in message', async () => {
      const mockRouteResult = {
        message_id: 'msg-abc123',
        status: 'sent',
        instance_id: 'inst-xyz789',
        timestamp: '2026-03-17T00:30:00.000Z',
      };

      WebSocketMessageRouter.routeUserMessage.mockResolvedValue(mockRouteResult);

      const specialContent = 'Hello! @#$%^&*()_+-={}[]|\\:";\'<>?,./';
      const body = { content: specialContent };
      const req = { user: mockUser };

      const result = await chatController.sendMessage(body, req);

      expect(result.success).toBe(true);
      expect(WebSocketMessageRouter.routeUserMessage).toHaveBeenCalledWith(123, specialContent);
    });

    it('should handle unicode characters in message', async () => {
      const mockRouteResult = {
        message_id: 'msg-abc123',
        status: 'sent',
        instance_id: 'inst-xyz789',
        timestamp: '2026-03-17T00:30:00.000Z',
      };

      WebSocketMessageRouter.routeUserMessage.mockResolvedValue(mockRouteResult);

      const unicodeContent = '你好 🚀 Hello 🌍';
      const body = { content: unicodeContent };
      const req = { user: mockUser };

      const result = await chatController.sendMessage(body, req);

      expect(result.success).toBe(true);
      expect(WebSocketMessageRouter.routeUserMessage).toHaveBeenCalledWith(123, unicodeContent);
    });
  });

  describe('GET /chat/status', () => {
    it('should get instance status successfully', async () => {
      InstanceRegistry.getUserInstance.mockResolvedValue(mockInstanceInfo);

      const req = { user: mockUser };

      const result = await chatController.getStatus(req);

      expect(result).toEqual({
        success: true,
        instance: {
          instance_id: 'inst-xyz789',
          status: 'online',
          connection_type: 'local',
          last_heartbeat: expect.any(String),
        },
      });
      expect(InstanceRegistry.getUserInstance).toHaveBeenCalledWith(123);
    });

    it('should return error when user has no instance', async () => {
      InstanceRegistry.getUserInstance.mockResolvedValue(null);

      const req = { user: mockUser };

      const result = await chatController.getStatus(req);

      expect(result).toEqual({
        success: false,
        error: 'No instance found for this user',
      });
    });

    it('should return correct status for offline instance', async () => {
      const offlineInstance = {
        ...mockInstanceInfo,
        status: 'offline',
      };

      InstanceRegistry.getUserInstance.mockResolvedValue(offlineInstance);

      const req = { user: mockUser };

      const result = await chatController.getStatus(req);

      expect(result.success).toBe(true);
      expect(result.instance.status).toBe('offline');
    });

    it('should return correct status for error instance', async () => {
      const errorInstance = {
        ...mockInstanceInfo,
        status: 'error',
      };

      InstanceRegistry.getUserInstance.mockResolvedValue(errorInstance);

      const req = { user: mockUser };

      const result = await chatController.getStatus(req);

      expect(result.success).toBe(true);
      expect(result.instance.status).toBe('error');
    });

    it('should return correct connection_type for remote instance', async () => {
      const remoteInstance = {
        ...mockInstanceInfo,
        connection_type: 'remote',
      };

      InstanceRegistry.getUserInstance.mockResolvedValue(remoteInstance);

      const req = { user: mockUser };

      const result = await chatController.getStatus(req);

      expect(result.success).toBe(true);
      expect(result.instance.connection_type).toBe('remote');
    });

    it('should format last_heartbeat as ISO timestamp', async () => {
      const heartbeatTime = Date.now();
      const instanceWithHeartbeat = {
        ...mockInstanceInfo,
        last_heartbeat: heartbeatTime,
      };

      InstanceRegistry.getUserInstance.mockResolvedValue(instanceWithHeartbeat);

      const req = { user: mockUser };

      const result = await chatController.getStatus(req);

      expect(result.success).toBe(true);
      expect(result.instance.last_heartbeat).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(result.instance.last_heartbeat).getTime()).toBeCloseTo(heartbeatTime, -3);
    });

    it('should handle registry errors gracefully', async () => {
      InstanceRegistry.getUserInstance.mockRejectedValue(
        new Error('Registry error')
      );

      const req = { user: mockUser };

      const result = await chatController.getStatus(req);

      expect(result).toEqual({
        success: false,
        error: 'Failed to get instance status',
      });
    });
  });

  describe('GET /chat/history', () => {
    it('should return placeholder response', async () => {
      const req = { user: mockUser };

      const result = await chatController.getHistory(req);

      expect(result).toEqual({
        success: true,
        message: 'Chat history feature will be implemented in P1 phase',
        history: [],
      });
    });

    it('should always return empty history array', async () => {
      const req = { user: mockUser };

      const result = await chatController.getHistory(req);

      expect(result.success).toBe(true);
      expect(result.history).toEqual([]);
      expect(result.history).toHaveLength(0);
    });

    it('should include P1 implementation message', async () => {
      const req = { user: mockUser };

      const result = await chatController.getHistory(req);

      expect(result.message).toContain('P1');
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent message requests', async () => {
      const mockRouteResult = {
        message_id: 'msg-abc123',
        status: 'sent',
        instance_id: 'inst-xyz789',
        timestamp: '2026-03-17T00:30:00.000Z',
      };

      WebSocketMessageRouter.routeUserMessage.mockResolvedValue(mockRouteResult);

      const body = { content: 'Hello' };
      const req = { user: mockUser };

      // Send multiple concurrent requests
      const results = await Promise.all([
        chatController.sendMessage(body, req),
        chatController.sendMessage(body, req),
        chatController.sendMessage(body, req),
      ]);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
      expect(WebSocketMessageRouter.routeUserMessage).toHaveBeenCalledTimes(3);
    });

    it('should handle message with newlines', async () => {
      const mockRouteResult = {
        message_id: 'msg-abc123',
        status: 'sent',
        instance_id: 'inst-xyz789',
        timestamp: '2026-03-17T00:30:00.000Z',
      };

      WebSocketMessageRouter.routeUserMessage.mockResolvedValue(mockRouteResult);

      const body = { content: 'Line 1\nLine 2\nLine 3' };
      const req = { user: mockUser };

      const result = await chatController.sendMessage(body, req);

      expect(result.success).toBe(true);
      expect(WebSocketMessageRouter.routeUserMessage).toHaveBeenCalledWith(
        123,
        'Line 1\nLine 2\nLine 3'
      );
    });

    it('should handle empty body gracefully', async () => {
      const req = { user: mockUser };

      const result = await chatController.sendMessage(undefined, req);

      expect(result).toEqual({
        success: false,
        error: 'Message content is required and cannot be empty',
      });
    });

    it('should handle null content gracefully', async () => {
      const body = { content: null };
      const req = { user: mockUser };

      const result = await chatController.sendMessage(body, req);

      expect(result).toEqual({
        success: false,
        error: 'Message content is required and cannot be empty',
      });
    });
  });
});
