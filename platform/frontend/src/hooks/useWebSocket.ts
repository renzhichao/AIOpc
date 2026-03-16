/**
 * WebSocket React Hook
 *
 * Provides a React-friendly interface to the WebSocket service
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createWebSocketService, type WebSocketStatus, type WebSocketMessage } from '../services/websocket';

export interface UseWebSocketReturn {
  status: WebSocketStatus;
  messages: WebSocketMessage[];
  sendMessage: (content: string) => void;
  onMessage: (handler: (message: WebSocketMessage) => void) => () => void;
  onStatusChange: (handler: (status: WebSocketStatus) => void) => () => void;
  getStatus: () => WebSocketStatus;
  isConnected: boolean;
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

  const sendMessage = useCallback((content: string) => {
    serviceRef.current?.sendMessage(content);
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

  return {
    status,
    messages,
    sendMessage,
    onMessage,
    onStatusChange,
    getStatus,
    isConnected: status === 'connected'
  };
}
