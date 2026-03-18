import { Page } from '@playwright/test';

interface WebSocketMessage {
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
  instance_id?: string;
}

/**
 * WebSocket Helper Class
 *
 * Provides helper methods for WebSocket testing including:
 * - Connection management
 * - Message sending and receiving
 * - Connection state monitoring
 * - Mock WebSocket server
 * - Error simulation
 */
export class WebSocketHelper {
  private wsURL: string = '';
  private connectionState: 'connected' | 'disconnected' | 'connecting' | 'reconnecting' = 'disconnected';
  private messages: WebSocketMessage[] = [];
  private sentMessages: any[] = [];
  private queuedMessages: WebSocketMessage[] = [];
  private reconnectAttempts = 0;
  private lastPingTime = 0;
  private lastPongTime = 0;

  constructor(private page: Page) {}

  /**
   * Setup WebSocket mock for testing
   */
  async setupWebSocketMock(): Promise<void> {
    // Inject WebSocket mock into page
    await this.page.addInitScript(() => {
      (window as any).mockWebSocket = {
        connected: false,
        messages: [] as any[],
        sentMessages: [] as any[],
        queuedMessages: [] as any[],

        connect: function(url: string) {
          console.log('[WS Mock] Connecting to', url);
          this.connected = true;
          (window as any).wsURL = url;

          // Simulate connection delay
          setTimeout(() => {
            this.onopen?.({});
          }, 500);

          return {
            send: (data: string) => {
              const message = JSON.parse(data);
              this.sentMessages.push(message);
              console.log('[WS Mock] Sent:', message);
            },
            close: () => {
              this.connected = false;
              this.onclose?.({});
            },
          };
        },
      };
    });

    // Mock the WebSocket class
    await this.page.addInitScript(() => {
      const OriginalWebSocket = (window as any).WebSocket;

      class MockWebSocket {
        public url: string;
        public readyState: number = 0; // CONNECTING
        private mock: any;

        constructor(url: string) {
          this.url = url;
          this.mock = (window as any).mockWebSocket;
          this.mock.connect(url);

          // Simulate connection opening
          setTimeout(() => {
            this.readyState = 1; // OPEN
            this.onopen?.({} as Event);
          }, 500);
        }

        send(data: string) {
          if (this.mock) {
            this.mock.send(data);
          }
        }

        close() {
          this.readyState = 3; // CLOSED
          if (this.mock) {
            this.mock.close();
          }
        }

        onopen: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        onclose: ((event: CloseEvent) => void) | null = null;
      }

      (window as any).WebSocket = MockWebSocket;
    });
  }

  /**
   * Wait for WebSocket connection
   */
  async waitForConnection(timeout: number): Promise<boolean> {
    try {
      await this.page.waitForFunction(
        () => {
          const ws = (window as any).mockWebSocket;
          return ws && ws.connected;
        },
        { timeout }
      );
      this.connectionState = 'connected';
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get WebSocket URL
   */
  async getWebSocketURL(): Promise<string> {
    const url = await this.page.evaluate(() => (window as any).wsURL || '');
    this.wsURL = url;
    return url;
  }

  /**
   * Get connection state
   */
  async getConnectionState(): Promise<string> {
    return await this.page.evaluate(() => {
      const ws = (window as any).mockWebSocket;
      return ws?.connected ? 'connected' : 'disconnected';
    });
  }

  /**
   * Send message via WebSocket
   */
  async sendMessage(content: string): Promise<void> {
    await this.page.evaluate((msgContent) => {
      const ws = (window as any).mockWebSocket;
      if (ws) {
        const message = {
          role: 'user',
          content: msgContent,
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(message));
      }
    }, content);

    this.sentMessages.push({
      role: 'user',
      content,
      timestamp: Date.now(),
    });
  }

  /**
   * Simulate agent message
   */
  async simulateAgentMessage(content: string): Promise<void> {
    const message: WebSocketMessage = {
      role: 'agent',
      content,
      timestamp: Date.now(),
    };

    this.messages.push(message);

    await this.page.evaluate((msg) => {
      const event = new MessageEvent('message', {
        data: JSON.stringify(msg),
      });
      const ws = (window as any).mockWebSocket;
      if (ws?.onmessage) {
        ws.onmessage(event);
      }
    }, message);
  }

  /**
   * Wait for message to appear in chat
   */
  async waitForMessageInChat(content: string, timeout: number): Promise<boolean> {
    try {
      await this.page.waitForFunction(
        (msgContent) => {
          const messageList = document.querySelector('[data-testid="message-list"]');
          if (!messageList) return false;

          const text = messageList.textContent || '';
          return text.includes(msgContent);
        },
        content,
        { timeout }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all messages
   */
  async getAllMessages(): Promise<WebSocketMessage[]> {
    return this.messages;
  }

  /**
   * Get last message
   */
  async getLastMessage(): Promise<WebSocketMessage | null> {
    const messages = await this.page.evaluate(() => {
      const ws = (window as any).mockWebSocket;
      return ws?.messages || [];
    });

    return messages.length > 0 ? messages[messages.length - 1] : null;
  }

  /**
   * Get sent messages
   */
  async getSentMessages(): Promise<any[]> {
    return await this.page.evaluate(() => {
      const ws = (window as any).mockWebSocket;
      return ws?.sentMessages || [];
    });
  }

  /**
   * Get queued messages
   */
  async getQueuedMessages(): Promise<WebSocketMessage[]> {
    return this.queuedMessages;
  }

  /**
   * Simulate connection loss
   */
  async simulateConnectionLoss(): Promise<void> {
    await this.page.evaluate(() => {
      const ws = (window as any).mockWebSocket;
      if (ws) {
        ws.connected = false;
        ws.onclose?.({} as CloseEvent);
      }
    });
    this.connectionState = 'disconnected';
  }

  /**
   * Trigger reconnection
   */
  async triggerReconnection(): Promise<void> {
    this.connectionState = 'reconnecting';
    this.reconnectAttempts++;

    await this.page.evaluate(() => {
      const ws = (window as any).mockWebSocket;
      if (ws) {
        ws.connected = true;
        ws.onopen?.({} as Event);
      }
    });

    this.connectionState = 'connected';
  }

  /**
   * Check if reconnecting
   */
  async isReconnecting(): Promise<boolean> {
    return this.connectionState === 'reconnecting';
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    await this.page.evaluate(() => {
      const ws = (window as any).mockWebSocket;
      if (ws) {
        ws.close();
      }
    });
    this.connectionState = 'disconnected';
  }

  /**
   * Get connection error
   */
  async getConnectionError(): Promise<string> {
    return await this.page.evaluate(() => {
      const errorElement = document.querySelector('[data-testid="connection-error"]');
      return errorElement?.textContent || '';
    });
  }

  /**
   * Mock connection timeout
   */
  async mockConnectionTimeout(): Promise<void> {
    await this.page.addInitScript(() => {
      (window as any).MOCK_WS_TIMEOUT = true;
    });
  }

  /**
   * Mock authentication failure
   */
  async mockAuthFailure(): Promise<void> {
    await this.page.addInitScript(() => {
      (window as any).MOCK_WS_AUTH_FAILURE = true;
    });
  }

  /**
   * Mock send failure
   */
  async mockSendFailure(): Promise<void> {
    await this.page.addInitScript(() => {
      (window as any).MOCK_WS_SEND_FAILURE = true;
    });
  }

  /**
   * Mock missing pong responses
   */
  async mockMissingPong(): Promise<void> {
    await this.page.addInitScript(() => {
      (window as any).MOCK_WS_NO_PONG = true;
    });
  }

  /**
   * Get last ping time
   */
  async getLastPingTime(): Promise<number> {
    return this.lastPingTime;
  }

  /**
   * Get last pong time
   */
  async getLastPongTime(): Promise<number> {
    return this.lastPongTime;
  }

  /**
   * Get bound instance ID
   */
  async getBoundInstanceId(): Promise<string> {
    const url = await this.getWebSocketURL();
    const match = url.match(/instance-([a-z0-9-]+)/i);
    return match ? match[1] : '';
  }

  /**
   * Has message error
   */
  async hasMessageError(): Promise<boolean> {
    const errorElement = this.page.locator('[data-testid="message-error-indicator"]');
    return await errorElement.isVisible().catch(() => false);
  }

  /**
   * Mock server shutdown
   */
  async mockServerShutdown(): Promise<void> {
    await this.simulateConnectionLoss();
  }

  /**
   * Simulate malformed message
   */
  async simulateMalformedMessage(content: string): Promise<void> {
    await this.page.evaluate((msg) => {
      const event = new MessageEvent('message', {
        data: msg,
      });
      const ws = (window as any).mockWebSocket;
      if (ws?.onmessage) {
        ws.onmessage(event);
      }
    }, content);
  }

  /**
   * Has error logged
   */
  async hasErrorLogged(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const logs = (window as any).consoleLogs || [];
      return logs.some((log: any) => log.level === 'error');
    });
  }

  /**
   * Mock network interruption
   */
  async mockNetworkInterruption(): Promise<void> {
    await this.simulateConnectionLoss();
  }

  /**
   * Mock network recovery
   */
  async mockNetworkRecovery(): Promise<void> {
    await this.triggerReconnection();
  }

  /**
   * Mock persistent connection failure
   */
  async mockPersistentConnectionFailure(): Promise<void> {
    // Keep failing reconnection attempts
    await this.page.addInitScript(() => {
      (window as any).MOCK_WS_PERSISTENT_FAILURE = true;
    });
  }

  /**
   * Get reconnect attempts
   */
  async getReconnectAttempts(): Promise<number> {
    return this.reconnectAttempts;
  }
}
