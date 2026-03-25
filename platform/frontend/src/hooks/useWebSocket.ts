/**
 * WebSocket React Hook
 *
 * Provides a React-friendly interface to the WebSocket service
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createWebSocketService, type WebSocketStatus, type WebSocketMessage } from '../services/websocket';

export interface UseWebSocketReturn {
  status: WebSocketStatus;
  messages: WebSocketMessage[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendMessage: (content: string, files?: any[]) => void;
  onMessage: (handler: (message: WebSocketMessage) => void) => () => void;
  onStatusChange: (handler: (status: WebSocketStatus) => void) => () => void;
  getStatus: () => WebSocketStatus;
  isConnected: boolean;
  disconnect: () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const serviceRef = useRef<ReturnType<typeof createWebSocketService> | null>(null);
  const statusHandlersRef = useRef<Set<(status: WebSocketStatus) => void>>(new Set());
  const messageHandlersRef = useRef<Set<(message: WebSocketMessage) => void>>(new Set());

  useEffect(() => {
    // Create service on mount
    const service = createWebSocketService();
    serviceRef.current = service;

    // Register status handler
    const unsubscribeStatus = service.onStatusChange((newStatus) => {
      setStatus(newStatus);
      statusHandlersRef.current.forEach(handler => handler(newStatus));
    });

    // Register message handler
    const unsubscribeMessage = service.onMessage((message) => {
      setMessages(prev => [...prev, message]);
      messageHandlersRef.current.forEach(handler => handler(message));
    });

    // Auto-connect
    service.connect();

    // Cleanup on unmount
    return () => {
      unsubscribeStatus();
      unsubscribeMessage();
      service.disconnect();
    };
  }, []);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendMessage = useCallback((content: string, files?: any[]) => {
    serviceRef.current?.sendMessage(content, files);
  }, []);

  const onMessage = useCallback((handler: (message: WebSocketMessage) => void) => {
    messageHandlersRef.current.add(handler);
    return () => {
      messageHandlersRef.current.delete(handler);
    };
  }, []);

  const onStatusChange = useCallback((handler: (status: WebSocketStatus) => void) => {
    statusHandlersRef.current.add(handler);
    return () => {
      statusHandlersRef.current.delete(handler);
    };
  }, []);

  const getStatus = useCallback(() => {
    return serviceRef.current?.getStatus() ?? 'disconnected';
  }, []);

  const disconnect = useCallback(() => {
    serviceRef.current?.disconnect();
  }, []);

  // Use useMemo to ensure stable reference across renders
  return useMemo(() => ({
    status,
    messages,
    sendMessage,
    onMessage,
    onStatusChange,
    getStatus,
    isConnected: status === 'connected',
    disconnect
  }), [status, messages, sendMessage, onMessage, onStatusChange, getStatus, disconnect]);
}
