/**
 * WebSocket Service 测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWebSocketService, WebSocketStatus, WebSocketMessage } from './websocket';

// Mock WebSocket class
class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readyState: number = 0; // CONNECTING
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  sentMessages: string[] = [];

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);

    // Simulate async connection
    Promise.resolve().then(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    });
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  simulateMessage(data: string): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  static clearInstances(): void {
    MockWebSocket.instances = [];
  }

  static getLastInstance(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }
}

describe('WebSocketService', () => {
  let service: ReturnType<typeof createWebSocketService>;

  // Set up global mocks before all tests
  beforeAll(() => {
    (global as any).WebSocket = MockWebSocket;
  });

  // Clean up after all tests
  afterAll(() => {
    delete (global as any).WebSocket;
  });

  beforeEach(() => {
    // Clear mock instances
    MockWebSocket.clearInstances();

    // Mock localStorage
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'test-token'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    // Cleanup service
    if (service) {
      service.disconnect();
    }
    vi.unstubAllGlobals();
    MockWebSocket.clearInstances();
  });

  describe('connect', () => {
    it('should connect to WebSocket server with token', () => {
      service = createWebSocketService();
      const statusSpy = vi.fn();
      service.onStatusChange(statusSpy);

      service.connect();

      expect(statusSpy).toHaveBeenCalledWith('connecting');
    });

    it('should get token from localStorage', () => {
      service = createWebSocketService();
      const localStorageSpy = vi.spyOn(localStorage, 'getItem');

      service.connect();

      expect(localStorageSpy).toHaveBeenCalledWith('access_token');
    });

    it('should handle connection open event', async () => {
      service = createWebSocketService();
      const statusSpy = vi.fn();
      service.onStatusChange(statusSpy);

      service.connect();

      // Wait for async connection
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(statusSpy).toHaveBeenCalledWith('connected');
    });

    it('should set error status if no token found', () => {
      vi.spyOn(localStorage, 'getItem').mockReturnValueOnce(null as any);
      service = createWebSocketService();

      const statusSpy = vi.fn();
      service.onStatusChange(statusSpy);

      service.connect();

      expect(statusSpy).toHaveBeenCalledWith('error');
    });
  });

  describe('sendMessage', () => {
    it('should send JSON messages', async () => {
      service = createWebSocketService();
      service.connect();

      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 10));

      service.sendMessage('Hello, AI!');

      const wsInstance = MockWebSocket.getLastInstance();
      expect(wsInstance?.sentMessages.length).toBe(1);

      const sentMessage = JSON.parse(wsInstance!.sentMessages[0]);
      expect(sentMessage.type).toBe('user_message');
      expect(sentMessage.content).toBe('Hello, AI!');
    });

    it('should not send message if not connected', () => {
      service = createWebSocketService();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      service.sendMessage('Test message');

      expect(consoleSpy).toHaveBeenCalledWith('WebSocket is not connected');
      consoleSpy.mockRestore();
    });
  });

  describe('onMessage', () => {
    it('should register message handlers', async () => {
      service = createWebSocketService();
      service.connect();

      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 10));

      const messageSpy = vi.fn();
      service.onMessage(messageSpy);

      const wsInstance = MockWebSocket.getLastInstance();
      expect(wsInstance).toBeDefined();

      const testMessage: WebSocketMessage = {
        type: 'assistant_message',
        content: 'Hello from AI!',
        timestamp: new Date().toISOString(),
        instance_id: 'test-instance',
      };
      wsInstance!.simulateMessage(JSON.stringify(testMessage));

      expect(messageSpy).toHaveBeenCalledWith(testMessage);
    });

    it('should register multiple message handlers', async () => {
      service = createWebSocketService();
      service.connect();

      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 10));

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      service.onMessage(handler1);
      service.onMessage(handler2);

      const wsInstance = MockWebSocket.getLastInstance();

      const testMessage: WebSocketMessage = {
        type: 'assistant_message',
        content: 'Test',
        timestamp: new Date().toISOString(),
        instance_id: 'test-instance',
      };
      wsInstance!.simulateMessage(JSON.stringify(testMessage));

      expect(handler1).toHaveBeenCalledWith(testMessage);
      expect(handler2).toHaveBeenCalledWith(testMessage);
    });

    it('should unregister message handlers', async () => {
      service = createWebSocketService();
      service.connect();

      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 10));

      const handler = vi.fn();
      const unsubscribe = service.onMessage(handler);

      const wsInstance = MockWebSocket.getLastInstance();

      unsubscribe();

      const testMessage: WebSocketMessage = {
        type: 'assistant_message',
        content: 'Test',
        timestamp: new Date().toISOString(),
        instance_id: 'test-instance',
      };
      wsInstance!.simulateMessage(JSON.stringify(testMessage));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('onStatusChange', () => {
    it('should register status handlers', () => {
      service = createWebSocketService();
      const handler = vi.fn();
      service.onStatusChange(handler);

      service.connect();

      expect(handler).toHaveBeenCalledWith('connecting');
    });

    it('should register multiple status handlers', () => {
      service = createWebSocketService();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      service.onStatusChange(handler1);
      service.onStatusChange(handler2);

      service.connect();

      expect(handler1).toHaveBeenCalledWith('connecting');
      expect(handler2).toHaveBeenCalledWith('connecting');
    });

    it('should unregister status handlers', () => {
      service = createWebSocketService();
      const handler = vi.fn();
      const unsubscribe = service.onStatusChange(handler);

      unsubscribe();

      service.connect();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return current connection status', () => {
      service = createWebSocketService();
      expect(service.getStatus()).toBe('disconnected');

      service.connect();

      expect(service.getStatus()).toBe('connecting');
    });
  });

  describe('isConnected', () => {
    it('should return true when connected', async () => {
      service = createWebSocketService();
      service.connect();

      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(service.isConnected()).toBe(true);
    });

    it('should return false when not connected', () => {
      service = createWebSocketService();
      expect(service.isConnected()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should close connection', async () => {
      service = createWebSocketService();
      service.connect();

      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 10));

      service.disconnect();

      expect(service.getStatus()).toBe('disconnected');
    });
  });

  describe('message parsing', () => {
    it('should handle malformed messages gracefully', async () => {
      service = createWebSocketService();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      service.connect();

      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 10));

      const wsInstance = MockWebSocket.getLastInstance();

      wsInstance!.simulateMessage('invalid json');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
