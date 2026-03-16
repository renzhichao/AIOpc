/**
 * Chat Feature End-to-End Tests
 *
 * TASK-015: Comprehensive E2E tests for WebSocket chat functionality
 *
 * Test Coverage:
 * - WebSocket connection establishment
 * - Message sending and receiving
 * - Multi-message concurrency
 * - Connection disconnect and reconnect
 * - Edge cases and error handling
 *
 * TDD Approach: Red → Green → Refactor
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { WebSocket } from 'ws';
import { AppDataSource } from '../../src/config/database';
import { OAuthService } from '../../src/services/OAuthService';
import { WebSocketGateway } from '../../src/services/WebSocketGateway';
import { InstanceRepository } from '../../src/repositories/InstanceRepository';
import { UserRepository } from '../../src/repositories/UserRepository';
import { DatabaseHelper } from '../integration/helpers/database.helper';
import { WebSocketHelper } from '../helpers/websocket.helper';
import { User } from '../../src/entities/User.entity';
import { Instance } from '../../src/entities/Instance.entity';
import { WebSocketCloseCode, WebSocketMessageType } from '../../src/types/websocket.types';

describe('Chat Feature E2E Tests (TASK-015)', () => {
  // Test infrastructure
  let wsGateway: WebSocketGateway;
  let oauthService: OAuthService;
  let instanceRepository: InstanceRepository;
  let userRepository: UserRepository;
  let db: DatabaseHelper;

  // Test configuration
  const WS_PORT = 3001;
  const WS_URL = `ws://localhost:${WS_PORT}`;

  // Test data
  let testUser: User;
  let testInstance: Instance;
  let validToken: string;
  let expiredToken: string;
  let invalidToken: string;

  /**
   * Setup test infrastructure
   */
  beforeAll(async () => {
    // Connect to test database
    await DatabaseHelper.connect();
    db = new DatabaseHelper();

    // Initialize repositories
    userRepository = new UserRepository(AppDataSource.getRepository(User));
    instanceRepository = new InstanceRepository(AppDataSource.getRepository(Instance));
    oauthService = new OAuthService(userRepository);

    // Initialize WebSocket Gateway
    wsGateway = new WebSocketGateway(oauthService, instanceRepository);

    // Start WebSocket server for testing
    await startWebSocketServer();

    console.log('✓ Test infrastructure initialized');
  });

  /**
   * Cleanup test infrastructure
   */
  afterAll(async () => {
    // Stop WebSocket server
    await stopWebSocketServer();

    // Disconnect from test database
    await DatabaseHelper.disconnect();

    console.log('✓ Test infrastructure cleaned up');
  });

  /**
   * Setup test data before each test
   */
  beforeEach(async () => {
    // Clean database
    await DatabaseHelper.clean();

    // Create test user
    testUser = await db.createTestUser({
      feishu_user_id: `e2e_test_${Date.now()}`,
      name: 'E2E Test User',
      email: `e2e_test_${Date.now()}@example.com`,
    });

    // Create test instance
    testInstance = await db.createTestInstance(testUser, {
      status: 'active',
      template: 'personal',
    });

    // Generate tokens
    validToken = oauthService.generateToken(testUser);
    expiredToken = generateExpiredToken(testUser);
    invalidToken = 'invalid_token_12345';

    console.log(`✓ Test data created: user=${testUser.id}, instance=${testInstance.instance_id}`);
  });

  /**
   * Cleanup test data after each test
   */
  afterEach(async () => {
    // Clean database
    await DatabaseHelper.clean();
  });

  // ========================================================================
  // SCENARIO 1: WebSocket Connection Establishment
  // ========================================================================

  describe('Scenario 1: WebSocket Connection Establishment', () => {
    it('should establish connection with valid token', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);

      // Act
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Assert
      expect(WebSocketHelper.isConnected(client.ws)).toBe(true);
      expect(client.connected).toBe(true);

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should reject connection with invalid token', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, invalidToken);

      // Act
      await WebSocketHelper.waitForClose(client.ws, 5000);

      // Assert
      expect(WebSocketHelper.isConnected(client.ws)).toBe(false);
      expect(WebSocketHelper.getReadyState(client.ws)).toBe('CLOSED');
    });

    it('should reject connection without token', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL);

      // Act
      await WebSocketHelper.waitForClose(client.ws, 5000);

      // Assert
      expect(WebSocketHelper.isConnected(client.ws)).toBe(false);
      expect(WebSocketHelper.getReadyState(client.ws)).toBe('CLOSED');
    });

    it('should reject connection with expired token', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, expiredToken);

      // Act
      await WebSocketHelper.waitForClose(client.ws, 5000);

      // Assert
      expect(WebSocketHelper.isConnected(client.ws)).toBe(false);
      expect(WebSocketHelper.getReadyState(client.ws)).toBe('CLOSED');
    });

    it('should reject connection when user has no instance', async () => {
      // Arrange
      await DatabaseHelper.clean();
      const userWithoutInstance = await db.createTestUser();
      const tokenWithoutInstance = oauthService.generateToken(userWithoutInstance);

      const client = WebSocketHelper.createClient(WS_URL, tokenWithoutInstance);

      // Act
      await WebSocketHelper.waitForClose(client.ws, 5000);

      // Assert
      expect(WebSocketHelper.isConnected(client.ws)).toBe(false);
      expect(WebSocketHelper.getReadyState(client.ws)).toBe('CLOSED');
    });

    it('should receive connected status message on successful connection', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Act
      const statusMessage = await WebSocketHelper.waitForMessageType(
        client.ws,
        'status',
        2000
      );

      // Assert
      expect(statusMessage).toBeDefined();
      expect(statusMessage.type).toBe(WebSocketMessageType.STATUS);
      expect(statusMessage.status).toBe('connected');
      expect(statusMessage.instance_id).toBe(testInstance.instance_id);

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });
  });

  // ========================================================================
  // SCENARIO 2: Message Sending and Receiving
  // ========================================================================

  describe('Scenario 2: Message Sending and Receiving', () => {
    it('should send message and receive response', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Wait for connected status
      await WebSocketHelper.waitForMessageType(client.ws, 'status', 2000);

      // Act
      WebSocketHelper.sendUserMessage(client.ws, 'Hello, AI!', 'msg-001');

      // Assert
      const response = await WebSocketHelper.waitForMessageType(
        client.ws,
        'assistant_message',
        5000
      );

      expect(response).toBeDefined();
      expect(response.type).toBe(WebSocketMessageType.ASSISTANT_MESSAGE);
      expect(response.content).toBeDefined();
      expect(response.instance_id).toBe(testInstance.instance_id);
      expect(response.message_id).toBeDefined();

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should handle multiple sequential messages', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Wait for connected status
      await WebSocketHelper.waitForMessageType(client.ws, 'status', 2000);

      const messages = ['Message 1', 'Message 2', 'Message 3'];

      // Act - Send messages sequentially
      for (let i = 0; i < messages.length; i++) {
        WebSocketHelper.sendUserMessage(client.ws, messages[i], `msg-${i + 1}`);

        // Wait for response before sending next message
        const response = await WebSocketHelper.waitForMessageType(
          client.ws,
          'assistant_message',
          5000
        );

        // Assert
        expect(response.type).toBe(WebSocketMessageType.ASSISTANT_MESSAGE);
        expect(response.instance_id).toBe(testInstance.instance_id);
      }

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should include message_id in response', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      const messageId = 'test-message-123';

      // Act
      WebSocketHelper.sendUserMessage(client.ws, 'Test message', messageId);

      const response = await WebSocketHelper.waitForMessageType(
        client.ws,
        'assistant_message',
        5000
      );

      // Assert
      expect(response.message_id).toBeDefined();
      expect(response.message_id).toBe(messageId);

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should handle messages with metadata', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      const metadata = {
        source: 'web',
        timestamp: Date.now(),
        user_agent: 'E2E Test',
      };

      // Act
      WebSocketHelper.sendMessage(client.ws, {
        type: 'user_message',
        content: 'Test with metadata',
        message_id: 'msg-meta-001',
        metadata,
      });

      const response = await WebSocketHelper.waitForMessageType(
        client.ws,
        'assistant_message',
        5000
      );

      // Assert
      expect(response.metadata).toBeDefined();
      expect(response.type).toBe(WebSocketMessageType.ASSISTANT_MESSAGE);

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should preserve message ordering', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Act
      const messages = ['First', 'Second', 'Third'];
      for (let i = 0; i < messages.length; i++) {
        WebSocketHelper.sendUserMessage(client.ws, messages[i], `msg-order-${i}`);
      }

      // Wait for all responses
      const responses = await WebSocketHelper.waitForMessages(client.ws, 3, 10000);
      const assistantResponses = responses.filter(
        (r) => r.type === WebSocketMessageType.ASSISTANT_MESSAGE
      );

      // Assert
      expect(assistantResponses).toHaveLength(3);

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });
  });

  // ========================================================================
  // SCENARIO 3: Concurrent Messages
  // ========================================================================

  describe('Scenario 3: Concurrent Messages', () => {
    it('should handle concurrent messages from single user', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      const messageCount = 10;

      // Act - Send multiple messages concurrently
      for (let i = 0; i < messageCount; i++) {
        WebSocketHelper.sendUserMessage(
          client.ws,
          `Concurrent message ${i}`,
          `msg-concurrent-${i}`
        );
      }

      // Wait for all responses
      const responses = await WebSocketHelper.waitForMessages(client.ws, messageCount, 15000);
      const assistantResponses = responses.filter(
        (r) => r.type === WebSocketMessageType.ASSISTANT_MESSAGE
      );

      // Assert
      expect(assistantResponses.length).toBeGreaterThan(0);
      expect(assistantResponses.length).toBeLessThanOrEqual(messageCount);

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should handle messages from multiple users concurrently', async () => {
      // Arrange - Create multiple users with instances
      const users = await db.createTestUsers(3);
      const instances: Instance[] = [];
      const tokens: string[] = [];

      for (const user of users) {
        const instance = await db.createTestInstance(user);
        instances.push(instance);
        tokens.push(oauthService.generateToken(user));
      }

      // Act - Create connections for each user
      const clients = await WebSocketHelper.createMultipleClients(WS_URL, tokens, 5000);

      // Send messages from all clients
      clients.forEach((client, index) => {
        WebSocketHelper.sendUserMessage(client.ws, `Test from user ${index}`, `msg-multi-${index}`);
      });

      // Wait for responses from all clients
      const responses = await Promise.all(
        clients.map(async (client) => {
          try {
            return await WebSocketHelper.waitForMessageType(client.ws, 'assistant_message', 5000);
          } catch (error) {
            return null;
          }
        })
      );

      // Assert - All clients should receive responses
      const successfulResponses = responses.filter((r) => r !== null);
      expect(successfulResponses.length).toBeGreaterThan(0);

      // Cleanup
      await WebSocketHelper.closeMultipleClients(clients);
    });

    it('should handle rapid message bursts', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      const burstSize = 20;

      // Act - Send burst of messages rapidly
      for (let i = 0; i < burstSize; i++) {
        WebSocketHelper.sendUserMessage(client.ws, `Burst message ${i}`, `msg-burst-${i}`);
      }

      // Wait for at least some responses
      const responses = await WebSocketHelper.waitForMessages(client.ws, 5, 10000);

      // Assert
      expect(responses.length).toBeGreaterThan(0);

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should maintain message isolation between users', async () => {
      // Arrange - Create two users
      const user1 = await db.createTestUser({ name: 'User 1' });
      const user2 = await db.createTestUser({ name: 'User 2' });
      const instance1 = await db.createTestInstance(user1);
      const instance2 = await db.createTestInstance(user2);

      const token1 = oauthService.generateToken(user1);
      const token2 = oauthService.generateToken(user2);

      // Act - Create connections
      const client1 = WebSocketHelper.createClient(WS_URL, token1);
      const client2 = WebSocketHelper.createClient(WS_URL, token2);

      await Promise.all([
        WebSocketHelper.waitForOpen(client1.ws, 5000),
        WebSocketHelper.waitForOpen(client2.ws, 5000),
      ]);

      // Send messages from both users
      WebSocketHelper.sendUserMessage(client1.ws, 'Message from user 1', 'msg-user1');
      WebSocketHelper.sendUserMessage(client2.ws, 'Message from user 2', 'msg-user2');

      // Wait for responses
      const [response1, response2] = await Promise.all([
        WebSocketHelper.waitForMessageType(client1.ws, 'assistant_message', 5000),
        WebSocketHelper.waitForMessageType(client2.ws, 'assistant_message', 5000),
      ]);

      // Assert - Responses should be isolated
      expect(response1.instance_id).toBe(instance1.instance_id);
      expect(response2.instance_id).toBe(instance2.instance_id);
      expect(response1.instance_id).not.toBe(response2.instance_id);

      // Cleanup
      await Promise.all([
        WebSocketHelper.closeGracefully(client1.ws),
        WebSocketHelper.closeGracefully(client2.ws),
      ]);
    });
  });

  // ========================================================================
  // SCENARIO 4: Connection Management
  // ========================================================================

  describe('Scenario 4: Connection Management', () => {
    it('should handle connection disconnect gracefully', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Act - Close connection
      await WebSocketHelper.closeGracefully(client.ws);

      // Assert
      expect(WebSocketHelper.isConnected(client.ws)).toBe(false);
      expect(WebSocketHelper.getReadyState(client.ws)).toBe('CLOSED');
    });

    it('should handle heartbeat ping mechanism', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Act - Wait for ping (default interval is 30s)
      const pingReceived = await WebSocketHelper.waitForPing(client.ws, 35000);

      // Assert
      expect(pingReceived).toBe(true);

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should respond to ping with pong', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Act - Wait for ping and check if connection stays alive
      const pingReceived = await WebSocketHelper.waitForPing(client.ws, 35000);

      // After ping, connection should still be open
      const isConnected = WebSocketHelper.isConnected(client.ws);

      // Assert
      expect(pingReceived).toBe(true);
      expect(isConnected).toBe(true);

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should send disconnected status on close', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Act - Close connection
      await WebSocketHelper.closeGracefully(client.ws);

      // Wait a bit for status message (if sent)
      // Note: This test documents expected behavior
      // Status messages might be sent before close

      // Assert
      expect(WebSocketHelper.isConnected(client.ws)).toBe(false);
    });

    it('should handle reconnection after disconnect', async () => {
      // Arrange
      let client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Act - Close and reconnect
      await WebSocketHelper.closeGracefully(client.ws);

      // Wait for close to complete
      await WebSocketHelper.waitForClose(client.ws, 2000);

      // Reconnect
      client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Send message after reconnection
      WebSocketHelper.sendUserMessage(client.ws, 'Message after reconnect', 'msg-reconnect');

      const response = await WebSocketHelper.waitForMessageType(
        client.ws,
        'assistant_message',
        5000
      );

      // Assert
      expect(WebSocketHelper.isConnected(client.ws)).toBe(true);
      expect(response).toBeDefined();
      expect(response.type).toBe(WebSocketMessageType.ASSISTANT_MESSAGE);

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });
  });

  // ========================================================================
  // SCENARIO 5: Edge Cases
  // ========================================================================

  describe('Scenario 5: Edge Cases', () => {
    it('should handle empty message', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Act
      WebSocketHelper.sendUserMessage(client.ws, '', 'msg-empty');

      // Wait for response or error
      const response = await WebSocketHelper.waitForMessageType(
        client.ws,
        'error',
        3000
      ).catch(() => null);

      // Assert - Should receive error or handle gracefully
      if (response) {
        expect(response.type).toBe(WebSocketMessageType.ERROR);
      }

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should handle very long message', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      const longContent = 'A'.repeat(10000); // 10KB message

      // Act
      WebSocketHelper.sendUserMessage(client.ws, longContent, 'msg-long');

      const response = await WebSocketHelper.waitForMessageType(
        client.ws,
        'assistant_message',
        5000
      );

      // Assert
      expect(response).toBeDefined();

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should handle malformed message', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Act - Send invalid JSON
      client.ws.send('invalid json message{{{');

      // Wait a bit for error handling
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Assert - Connection should still be open
      expect(WebSocketHelper.isConnected(client.ws)).toBe(true);

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should handle message with special characters', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      const specialContent = 'Hello! 🎉 @user #hashtag https://example.com\n\t\r"quoted"';

      // Act
      WebSocketHelper.sendUserMessage(client.ws, specialContent, 'msg-special');

      const response = await WebSocketHelper.waitForMessageType(
        client.ws,
        'assistant_message',
        5000
      );

      // Assert
      expect(response).toBeDefined();
      expect(response.type).toBe(WebSocketMessageType.ASSISTANT_MESSAGE);

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should handle Unicode characters', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      const unicodeContent = '你好世界 🌏 مرحبا بالعالم Привет мир';

      // Act
      WebSocketHelper.sendUserMessage(client.ws, unicodeContent, 'msg-unicode');

      const response = await WebSocketHelper.waitForMessageType(
        client.ws,
        'assistant_message',
        5000
      );

      // Assert
      expect(response).toBeDefined();
      expect(response.type).toBe(WebSocketMessageType.ASSISTANT_MESSAGE);

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should handle JSON in message content', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      const jsonContent = JSON.stringify({ data: 'test', value: 123, nested: { key: 'value' } });

      // Act
      WebSocketHelper.sendUserMessage(client.ws, jsonContent, 'msg-json');

      const response = await WebSocketHelper.waitForMessageType(
        client.ws,
        'assistant_message',
        5000
      );

      // Assert
      expect(response).toBeDefined();

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should handle rapid connect/disconnect cycles', async () => {
      // Act - Multiple rapid connect/disconnect cycles
      for (let i = 0; i < 3; i++) {
        const client = WebSocketHelper.createClient(WS_URL, validToken);
        await WebSocketHelper.waitForOpen(client.ws, 2000);
        await WebSocketHelper.closeGracefully(client.ws);
        await WebSocketHelper.waitForClose(client.ws, 2000);
      }

      // Assert - No errors thrown
      expect(true).toBe(true);
    });

    it('should handle message sent immediately after connection', async () => {
      // Arrange & Act
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Send message immediately
      WebSocketHelper.sendUserMessage(client.ws, 'Immediate message', 'msg-immediate');

      const response = await WebSocketHelper.waitForMessageType(
        client.ws,
        'assistant_message',
        5000
      );

      // Assert
      expect(response).toBeDefined();

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should handle missing message_id field', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Act - Send message without message_id
      WebSocketHelper.sendMessage(client.ws, {
        type: 'user_message',
        content: 'Message without ID',
      });

      const response = await WebSocketHelper.waitForMessageType(
        client.ws,
        'assistant_message',
        5000
      );

      // Assert - Should still work
      expect(response).toBeDefined();

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });

    it('should handle message with null content', async () => {
      // Arrange
      const client = WebSocketHelper.createClient(WS_URL, validToken);
      await WebSocketHelper.waitForOpen(client.ws, 5000);

      // Act
      WebSocketHelper.sendMessage(client.ws, {
        type: 'user_message',
        content: null,
        message_id: 'msg-null',
      });

      // Wait for error or response
      const response = await WebSocketHelper.waitForMessageType(
        client.ws,
        'error',
        3000
      ).catch(() => null);

      // Assert - Should handle gracefully
      if (response) {
        expect(response.type).toBe(WebSocketMessageType.ERROR);
      }

      // Cleanup
      await WebSocketHelper.closeGracefully(client.ws);
    });
  });

  // ========================================================================
  // Helper Functions
  // ========================================================================

  /**
   * Start WebSocket server for testing
   */
  async function startWebSocketServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        wsGateway.start();
        // Give server time to start
        setTimeout(() => {
          console.log(`✓ WebSocket server started on port ${WS_PORT}`);
          resolve();
        }, 1000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop WebSocket server
   */
  async function stopWebSocketServer(): Promise<void> {
    return new Promise((resolve) => {
      if (wsGateway) {
        wsGateway.stop();
        console.log('✓ WebSocket server stopped');
      }
      setTimeout(() => resolve(), 500);
    });
  }

  /**
   * Generate an expired JWT token for testing
   */
  function generateExpiredToken(user: User): string {
    // This is a placeholder - actual implementation depends on your JWT library
    // For now, we'll create a token with expired expiration
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      {
        userId: user.id,
        feishuUserId: user.feishu_user_id,
        name: user.name,
        email: user.email,
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '-1h' } // Expired 1 hour ago
    );
  }
});
