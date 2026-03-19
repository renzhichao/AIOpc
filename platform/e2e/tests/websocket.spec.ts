import { test, expect } from '@playwright/test';
import { OAuthHelper } from '../helpers/oauth-helper';
import { WebSocketHelper } from '../helpers/websocket-helper';
import { APIHelper } from '../helpers/api-helper';

/**
 * E2E Tests for WebSocket Connection and Real-time Communication
 *
 * These tests verify WebSocket functionality for:
 * - WebSocket connection establishment and authentication
 * - Real-time message exchange between client and agent
 * - Connection state management and reconnection
 * - Ping/pong heartbeat mechanism
 * - Multi-user WebSocket sessions
 * - Error handling and recovery
 *
 * Coverage:
 * - WebSocket handshake with JWT authentication
 * - Message sending and receiving
 * - Connection lifecycle (connect, disconnect, reconnect)
 * - Instance-specific WebSocket channels
 * - Agent-to-client message routing
 * - Connection pool management
 *
 * @see platform/e2e/README.md for detailed documentation
 */

test.describe('WebSocket Connection and Communication', () => {
  let oauthHelper: OAuthHelper;
  let wsHelper: WebSocketHelper;
  let apiHelper: APIHelper;

  test.beforeEach(async ({ page }) => {
    oauthHelper = new OAuthHelper(page);
    wsHelper = new WebSocketHelper(page);
    apiHelper = new APIHelper(page);

    // Setup authentication
    await oauthHelper.setupMockSession({
      user_id: 'test-user-001',
      access_token: 'mock-access-token-001',
    });

    // Setup WebSocket mock
    await wsHelper.setupWebSocketMock();
  });

  test.describe('WebSocket Connection (WS-001)', () => {
    test('should establish WebSocket connection with JWT authentication', async ({ page }) => {
      const instanceId = 'instance-001';

      await page.goto(`/instances/${instanceId}/chat`);

      await test.step('Initialize WebSocket connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Verify WebSocket URL includes authentication token', async () => {
        const wsURL = await wsHelper.getWebSocketURL();
        expect(wsURL).toContain('ws://');
        expect(wsURL).toContain('token=');
      });

      await test.step('Verify connection state is updated', async () => {
        const connectionState = await wsHelper.getConnectionState();
        expect(connectionState).toBe('connected');
      });
    });

    test('should handle connection timeout', async ({ page }) => {
      // Mock connection timeout
      await wsHelper.mockConnectionTimeout();

      await page.goto('/instances/instance-001/chat');

      await test.step('Wait for connection timeout', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(false);
      });

      await test.step('Verify error state is displayed', async () => {
        const errorMessage = await wsHelper.getConnectionError();
        expect(errorMessage).toMatch(/连接超时|connection timeout/i);
      });
    });

    test('should handle connection authentication failure', async ({ page }) => {
      // Mock authentication failure
      await wsHelper.mockAuthFailure();

      await page.goto('/instances/instance-001/chat');

      await test.step('Wait for connection attempt', async () => {
        await page.waitForTimeout(2000);
      });

      await test.step('Verify authentication error is displayed', async () => {
        const errorMessage = await wsHelper.getConnectionError();
        expect(errorMessage).toMatch(/认证失败|authentication failed/i);
      });
    });
  });

  test.describe('Message Exchange (WS-002)', () => {
    test('should send message to agent via WebSocket', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Wait for connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Send message to agent', async () => {
        const testMessage = 'Hello, Agent!';
        await wsHelper.sendMessage(testMessage);

        // Verify message appears in chat
        const messageInChat = await wsHelper.waitForMessageInChat(testMessage, 3000);
        expect(messageInChat).toBe(true);
      });

      await test.step('Verify message is sent to server', async () => {
        const sentMessages = await wsHelper.getSentMessages();
        expect(sentMessages.length).toBeGreaterThan(0);
        expect(sentMessages[0].content).toBe('Hello, Agent!');
      });
    });

    test('should receive message from agent via WebSocket', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Wait for connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Simulate agent response', async () => {
        const agentResponse = 'Hello! How can I help you?';
        await wsHelper.simulateAgentMessage(agentResponse);

        // Verify response appears in chat
        const responseInChat = await wsHelper.waitForMessageInChat(agentResponse, 3000);
        expect(responseInChat).toBe(true);
      });

      await test.step('Verify message formatting', async () => {
        const lastMessage = await wsHelper.getLastMessage();
        expect(lastMessage.role).toBe('agent');
        expect(lastMessage.content).toBeTruthy();
      });
    });

    test('should handle multiple concurrent messages', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Wait for connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Send multiple messages', async () => {
        const messages = [
          'First message',
          'Second message',
          'Third message',
        ];

        for (const message of messages) {
          await wsHelper.sendMessage(message);
          await page.waitForTimeout(500);
        }

        // Verify all messages appear in chat
        for (const message of messages) {
          const messageInChat = await wsHelper.waitForMessageInChat(message, 3000);
          expect(messageInChat).toBe(true);
        }
      });

      await test.step('Verify message order is preserved', async () => {
        const allMessages = await wsHelper.getAllMessages();
        expect(allMessages[0].content).toBe('First message');
        expect(allMessages[1].content).toBe('Second message');
        expect(allMessages[2].content).toBe('Third message');
      });
    });

    test('should handle message sending failure', async ({ page }) => {
      // Mock send failure
      await wsHelper.mockSendFailure();

      await page.goto('/instances/instance-001/chat');

      await test.step('Wait for connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Try to send message', async () => {
        await wsHelper.sendMessage('Test message');
        await page.waitForTimeout(1000);
      });

      await test.step('Verify error indicator is shown', async () => {
        const hasErrorIndicator = await wsHelper.hasMessageError();
        expect(hasErrorIndicator).toBe(true);
      });
    });
  });

  test.describe('Connection Lifecycle (WS-003)', () => {
    test('should handle connection loss gracefully', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Establish connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Simulate connection loss', async () => {
        await wsHelper.simulateConnectionLoss();

        // Verify disconnect indicator
        await page.waitForTimeout(1000);
        const connectionState = await wsHelper.getConnectionState();
        expect(connectionState).toBe('disconnected');
      });

      await test.step('Verify reconnection attempt', async () => {
        // Wait for automatic reconnection
        await page.waitForTimeout(3000);

        const isReconnecting = await wsHelper.isReconnecting();
        expect(isReconnecting).toBe(true);
      });
    });

    test('should automatically reconnect after connection loss', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Establish initial connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Simulate connection loss and recovery', async () => {
        await wsHelper.simulateConnectionLoss();
        await page.waitForTimeout(1000);

        // Trigger reconnection
        await wsHelper.triggerReconnection();
      });

      await test.step('Verify reconnection success', async () => {
        const isReconnected = await wsHelper.waitForConnection(5000);
        expect(isReconnected).toBe(true);

        const connectionState = await wsHelper.getConnectionState();
        expect(connectionState).toBe('connected');
      });
    });

    test('should maintain message queue during reconnection', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Establish connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Send messages before disconnect', async () => {
        await wsHelper.sendMessage('Message before disconnect');
      });

      await test.step('Simulate disconnection', async () => {
        await wsHelper.simulateConnectionLoss();
        await page.waitForTimeout(1000);
      });

      await test.step('Send message while disconnected', async () => {
        await wsHelper.sendMessage('Message while disconnected');
      });

      await test.step('Verify message is queued', async () => {
        const queuedMessages = await wsHelper.getQueuedMessages();
        expect(queuedMessages.length).toBeGreaterThan(0);
      });

      await test.step('Reconnect and verify message delivery', async () => {
        await wsHelper.triggerReconnection();
        await wsHelper.waitForConnection(5000);

        const messageDelivered = await wsHelper.waitForMessageInChat('Message while disconnected', 3000);
        expect(messageDelivered).toBe(true);
      });
    });

    test('should handle explicit disconnect', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Establish connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Disconnect explicitly', async () => {
        await wsHelper.disconnect();

        const connectionState = await wsHelper.getConnectionState();
        expect(connectionState).toBe('disconnected');
      });

      await test.step('Verify no automatic reconnection', async () => {
        await page.waitForTimeout(3000);

        const isReconnecting = await wsHelper.isReconnecting();
        expect(isReconnecting).toBe(false);
      });
    });
  });

  test.describe('Ping/Pong Heartbeat (WS-004)', () => {
    test('should send ping frames to maintain connection', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Wait for connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Wait for ping interval', async () => {
        await page.waitForTimeout(35000); // Default ping interval is 30s
      });

      await test.step('Verify ping was sent', async () => {
        const lastPingTime = await wsHelper.getLastPingTime();
        expect(lastPingTime).toBeTruthy();
        expect(lastPingTime).toBeGreaterThan(Date.now() - 40000);
      });
    });

    test('should receive pong frames from server', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Wait for connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Wait for ping/pong cycle', async () => {
        await page.waitForTimeout(35000);
      });

      await test.step('Verify pong was received', async () => {
        const lastPongTime = await wsHelper.getLastPongTime();
        expect(lastPongTime).toBeTruthy();
        expect(lastPongTime).toBeGreaterThan(Date.now() - 40000);
      });
    });

    test('should detect connection loss on missing pong', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Wait for connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Mock missing pong responses', async () => {
        await wsHelper.mockMissingPong();
      });

      await test.step('Wait for connection timeout', async () => {
        await page.waitForTimeout(65000); // Should timeout after missing 2 pongs
      });

      await test.step('Verify connection is closed', async () => {
        const connectionState = await wsHelper.getConnectionState();
        expect(connectionState).toBe('disconnected');

        const error = await wsHelper.getConnectionError();
        expect(error).toMatch(/连接超时|connection timeout/i);
      });
    });
  });

  test.describe('Multi-User Sessions (WS-005)', () => {
    test('should handle concurrent WebSocket connections from different users', async ({ browser }) => {
      // Create two browser contexts (different users)
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      // Setup authentication for both users
      await oauthHelper.setupMockSession.call(
        { page: page1 },
        { user_id: 'user-001', access_token: 'token-001' }
      );
      await oauthHelper.setupMockSession.call(
        { page: page2 },
        { user_id: 'user-002', access_token: 'token-002' }
      );

      await test.step('Connect both users', async () => {
        const wsHelper1 = new WebSocketHelper(page1);
        const wsHelper2 = new WebSocketHelper(page2);

        await page1.goto('/instances/instance-001/chat');
        await page2.goto('/instances/instance-001/chat');

        await wsHelper1.setupWebSocketMock();
        await wsHelper2.setupWebSocketMock();

        const connected1 = await wsHelper1.waitForConnection(5000);
        const connected2 = await wsHelper2.waitForConnection(5000);

        expect(connected1).toBe(true);
        expect(connected2).toBe(true);
      });

      await context1.close();
      await context2.close();
    });

    test('should isolate messages between different users', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      // Setup different users
      await oauthHelper.setupMockSession.call(
        { page: page1 },
        { user_id: 'user-001', access_token: 'token-001' }
      );
      await oauthHelper.setupMockSession.call(
        { page: page2 },
        { user_id: 'user-002', access_token: 'token-002' }
      );

      const wsHelper1 = new WebSocketHelper(page1);
      const wsHelper2 = new WebSocketHelper(page2);

      await page1.goto('/instances/instance-001/chat');
      await page2.goto('/instances/instance-001/chat');

      await wsHelper1.setupWebSocketMock();
      await wsHelper2.setupWebSocketMock();

      await test.step('Connect both users', async () => {
        await wsHelper1.waitForConnection(5000);
        await wsHelper2.waitForConnection(5000);
      });

      await test.step('Send message from user 1', async () => {
        await wsHelper1.sendMessage('Message from user 1');
      });

      await test.step('Verify user 2 does not receive user 1 message', async () => {
        await page2.waitForTimeout(1000);

        const user2Messages = await wsHelper2.getAllMessages();
        const hasUser1Message = user2Messages.some(
          msg => msg.content === 'Message from user 1'
        );

        expect(hasUser1Message).toBe(false);
      });

      await context1.close();
      await context2.close();
    });
  });

  test.describe('Instance-Specific Channels (WS-006)', () => {
    test('should connect to instance-specific WebSocket channel', async ({ page }) => {
      const instanceId = 'instance-001';

      await page.goto(`/instances/${instanceId}/chat`);

      await test.step('Wait for connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Verify WebSocket URL includes instance ID', async () => {
        const wsURL = await wsHelper.getWebSocketURL();
        expect(wsURL).toContain(instanceId);
      });

      await test.step('Verify connection is bound to correct instance', async () => {
        const boundInstanceId = await wsHelper.getBoundInstanceId();
        expect(boundInstanceId).toBe(instanceId);
      });
    });

    test('should handle connections to multiple instances', async ({ page }) => {
      // This test simulates having multiple tabs open with different instances

      await test.step('Connect to first instance', async () => {
        await page.goto('/instances/instance-001/chat');
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);

        const instanceId = await wsHelper.getBoundInstanceId();
        expect(instanceId).toBe('instance-001');
      });

      await test.step('Open new tab for second instance', async () => {
        const newPage = await page.context().newPage();
        const newWsHelper = new WebSocketHelper(newPage);

        await oauthHelper.setupMockSession.call(
          { page: newPage },
          { user_id: 'test-user-001', access_token: 'mock-access-token-001' }
        );

        await newPage.goto('/instances/instance-002/chat');
        await newWsHelper.setupWebSocketMock();

        const isConnected = await newWsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);

        const instanceId = await newWsHelper.getBoundInstanceId();
        expect(instanceId).toBe('instance-002');

        await newPage.close();
      });
    });

    test('should route messages to correct instance channel', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Wait for connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Send message', async () => {
        await wsHelper.sendMessage('Test message');
      });

      await test.step('Verify message includes instance ID', async () => {
        const sentMessages = await wsHelper.getSentMessages();
        expect(sentMessages[0].instance_id).toBe('instance-001');
      });
    });
  });

  test.describe('Error Handling and Recovery (WS-007)', () => {
    test('should handle server shutdown gracefully', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Establish connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Simulate server shutdown', async () => {
        await wsHelper.mockServerShutdown();

        // Wait for connection close
        await page.waitForTimeout(2000);

        const connectionState = await wsHelper.getConnectionState();
        expect(connectionState).toBe('disconnected');
      });

      await test.step('Verify error message is displayed', async () => {
        const error = await wsHelper.getConnectionError();
        expect(error).toMatch(/服务器关闭|server shutdown|连接断开/i);
      });
    });

    test('should handle malformed messages from server', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Establish connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Send malformed message', async () => {
        await wsHelper.simulateMalformedMessage('{ invalid json }');
        await page.waitForTimeout(1000);
      });

      await test.step('Verify connection remains stable', async () => {
        const connectionState = await wsHelper.getConnectionState();
        expect(connectionState).toBe('connected');
      });

      await test.step('Verify error was logged', async () => {
        const hasErrorLogged = await wsHelper.hasErrorLogged();
        expect(hasErrorLogged).toBe(true);
      });
    });

    test('should handle network interruptions', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Establish connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Simulate network interruption', async () => {
        await wsHelper.mockNetworkInterruption();

        // Wait for disconnect
        await page.waitForTimeout(2000);

        const connectionState = await wsHelper.getConnectionState();
        expect(connectionState).toBe('disconnected');
      });

      await test.step('Verify reconnection attempt', async () => {
        await wsHelper.mockNetworkRecovery();

        // Wait for reconnection
        await page.waitForTimeout(3000);

        const isReconnecting = await wsHelper.isReconnecting();
        expect(isReconnecting).toBe(true);
      });
    });

    test('should limit reconnection attempts', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Establish connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Simulate persistent connection failure', async () => {
        await wsHelper.mockPersistentConnectionFailure();

        // Wait for multiple reconnection attempts
        await page.waitForTimeout(15000); // Should try ~3 times
      });

      await test.step('Verify max reconnection attempts reached', async () => {
        const reconnectAttempts = await wsHelper.getReconnectAttempts();
        expect(reconnectAttempts).toBeGreaterThanOrEqual(3);

        const isReconnecting = await wsHelper.isReconnecting();
        expect(isReconnecting).toBe(false); // Should stop trying
      });
    });
  });

  test.describe('Performance and Scalability (WS-008)', () => {
    test('should handle high-frequency message sending', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Wait for connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Send multiple messages rapidly', async () => {
        const startTime = Date.now();

        for (let i = 0; i < 50; i++) {
          await wsHelper.sendMessage(`Message ${i}`);
        }

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Should complete within reasonable time
        expect(duration).toBeLessThan(10000); // 10 seconds for 50 messages
      });

      await test.step('Verify all messages were sent', async () => {
        const sentMessages = await wsHelper.getSentMessages();
        expect(sentMessages.length).toBe(50);
      });
    });

    test('should handle large messages', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Wait for connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Send large message', async () => {
        const largeMessage = 'A'.repeat(10000); // 10KB message
        await wsHelper.sendMessage(largeMessage);

        const sent = await wsHelper.waitForMessageInChat(largeMessage.substring(0, 100), 3000);
        expect(sent).toBe(true);
      });

      await test.step('Verify message was sent successfully', async () => {
        const sentMessages = await wsHelper.getSentMessages();
        expect(sentMessages[0].content.length).toBe(10000);
      });
    });

    test('should maintain performance under load', async ({ page }) => {
      await page.goto('/instances/instance-001/chat');

      await test.step('Wait for connection', async () => {
        const isConnected = await wsHelper.waitForConnection(5000);
        expect(isConnected).toBe(true);
      });

      await test.step('Send messages and measure latency', async () => {
        const latencies: number[] = [];

        for (let i = 0; i < 20; i++) {
          const startTime = Date.now();
          await wsHelper.sendMessage(`Message ${i}`);
          await wsHelper.waitForMessageInChat(`Message ${i}`, 3000);
          const endTime = Date.now();

          latencies.push(endTime - startTime);
        }

        // Calculate average latency
        const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

        // Average latency should be reasonable (< 500ms)
        expect(avgLatency).toBeLessThan(500);
      });
    });
  });
});
