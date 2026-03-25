/**
 * useWebSocket Hook 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from './useWebSocket';
import * as websocketService from '../services/websocket';

// Mock the WebSocket service
vi.mock('../services/websocket', () => ({
  createWebSocketService: vi.fn(),
  WebSocketStatus: {
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    ERROR: 'error',
  } as const,
}));

// Mock WebSocket types
type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface WebSocketMessage {
  type: string;
  content?: string;
  timestamp: string;
  instance_id?: string;
  error?: string;
  message?: string;
  status?: string;
}

describe('useWebSocket', () => {
  let mockService: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    onMessage: ReturnType<typeof vi.fn>;
    onStatusChange: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
    isConnected: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Create a fresh mock service for each test
    mockService = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      sendMessage: vi.fn(),
      onMessage: vi.fn(() => vi.fn()), // Return unsubscribe function
      onStatusChange: vi.fn(() => vi.fn()), // Return unsubscribe function
      getStatus: vi.fn(() => 'disconnected' as WebSocketStatus),
      isConnected: vi.fn(() => false),
    };

    // Mock createWebSocketService to return our mock service
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(websocketService.createWebSocketService).mockReturnValue(mockService as any);
  });

  it('should create service and connect on mount', () => {
    renderHook(() => useWebSocket());

    expect(websocketService.createWebSocketService).toHaveBeenCalled();
    expect(mockService.connect).toHaveBeenCalled();
  });

  it('should update status when service status changes', async () => {
    const { result } = renderHook(() => useWebSocket());

    // Get the onStatusChange callback
    const statusChangeCallback = mockService.onStatusChange.mock.calls[0][0];

    // Simulate status change
    act(() => {
      statusChangeCallback('connected');
    });

    expect(result.current.status).toBe('connected');
  });

  it('should add messages when service receives messages', async () => {
    const { result } = renderHook(() => useWebSocket());

    // Get the onMessage callback
    const messageCallback = mockService.onMessage.mock.calls[0][0];

    // Simulate receiving a message
    const testMessage: WebSocketMessage = {
      type: 'assistant_message',
      content: 'Hello from AI!',
      timestamp: new Date().toISOString(),
      instance_id: 'test-instance',
    };

    act(() => {
      messageCallback(testMessage);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toEqual(testMessage);
  });

  it('should send messages through service', () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      result.current.sendMessage('Test message');
    });

    expect(mockService.sendMessage).toHaveBeenCalledWith('Test message');
  });

  it('should register custom message handlers', () => {
    const { result } = renderHook(() => useWebSocket());
    const customHandler = vi.fn();

    act(() => {
      const unsubscribe = result.current.onMessage(customHandler);

      // Get the onMessage callback
      const messageCallback = mockService.onMessage.mock.calls[0][0];

      // Simulate receiving a message
      const testMessage: WebSocketMessage = {
        type: 'assistant_message',
        content: 'Test',
        timestamp: new Date().toISOString(),
        instance_id: 'test-instance',
      };

      messageCallback(testMessage);

      // Unsubscribe
      unsubscribe();

      // Send another message
      messageCallback(testMessage);
    });

    // Handler should be called once (before unsubscribe)
    expect(customHandler).toHaveBeenCalledTimes(1);
  });

  it('should register custom status handlers', () => {
    const { result } = renderHook(() => useWebSocket());
    const customHandler = vi.fn();

    act(() => {
      const unsubscribe = result.current.onStatusChange(customHandler);

      // Get the onStatusChange callback
      const statusCallback = mockService.onStatusChange.mock.calls[0][0];

      // Simulate status change
      statusCallback('connected');

      // Unsubscribe
      unsubscribe();

      // Another status change
      statusCallback('disconnected');
    });

    // Handler should be called once (before unsubscribe)
    expect(customHandler).toHaveBeenCalledTimes(1);
    expect(customHandler).toHaveBeenCalledWith('connected');
  });

  it('should get status from service', () => {
    mockService.getStatus.mockReturnValue('connected' as WebSocketStatus);

    const { result } = renderHook(() => useWebSocket());

    const status = result.current.getStatus();

    expect(status).toBe('connected');
    expect(mockService.getStatus).toHaveBeenCalled();
  });

  it('should report connection status correctly', () => {
    const { result } = renderHook(() => useWebSocket());

    expect(result.current.isConnected).toBe(false);

    // Get the onStatusChange callback
    const statusChangeCallback = mockService.onStatusChange.mock.calls[0][0];

    // Simulate status change to connected
    act(() => {
      statusChangeCallback('connected');
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('should disconnect on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket());

    unmount();

    expect(mockService.disconnect).toHaveBeenCalled();
  });

  it('should accumulate messages over time', () => {
    const { result } = renderHook(() => useWebSocket());

    // Get the onMessage callback
    const messageCallback = mockService.onMessage.mock.calls[0][0];

    act(() => {
      messageCallback({
        type: 'assistant_message',
        content: 'Message 1',
        timestamp: new Date().toISOString(),
        instance_id: 'test-instance',
      });

      messageCallback({
        type: 'assistant_message',
        content: 'Message 2',
        timestamp: new Date().toISOString(),
        instance_id: 'test-instance',
      });
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].content).toBe('Message 1');
    expect(result.current.messages[1].content).toBe('Message 2');
  });
});
