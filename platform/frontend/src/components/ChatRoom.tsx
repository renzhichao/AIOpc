/**
 * ChatRoom Component
 *
 * Main chat interface that integrates all chat functionality:
 * - WebSocket connection management
 * - Message display and input
 * - Auto-scroll to latest message
 * - Connection status indicator
 *
 * This component serves as the primary interface for interacting with
 * the OpenClaw Assistant through real-time WebSocket communication.
 */

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { ConnectionStatus } from './ConnectionStatus';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import type { WebSocketMessage } from '../services/websocket';

export interface ChatRoomProps {
  className?: string;
}

export function ChatRoom({ className = '' }: ChatRoomProps) {
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const webSocket = useWebSocket();

  /**
   * Handle incoming messages from WebSocket
   */
  const handleMessage = useCallback((message: WebSocketMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  /**
   * Initialize WebSocket connection on mount
   */
  useEffect(() => {
    // Subscribe to messages (connection is auto-managed by useWebSocket)
    const unsubscribeMessage = webSocket.onMessage(handleMessage);

    // Cleanup on unmount
    return () => {
      unsubscribeMessage();
    };
  }, [webSocket, handleMessage]);

  /**
   * Handle sending a new message
   */
  const handleSendMessage = useCallback(
    (content: string) => {
      // Add user message to list immediately for better UX
      const userMessage: WebSocketMessage = {
        type: 'user_message',
        content,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);

      // Send via WebSocket
      webSocket.sendMessage(content);
    },
    [webSocket]
  );

  return (
    <div
      className={`
        flex flex-col h-screen bg-gray-50
        ${className}
      `}
      data-testid="chat-room"
      role="region"
      aria-label="聊天室"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-800">OpenClaw Assistant</h1>
        <ConnectionStatus status={webSocket.status} />
      </div>

      {/* Message List */}
      <MessageList messages={messages} />

      {/* Input Area */}
      <MessageInput
        onSend={handleSendMessage}
        disabled={webSocket.status !== 'connected'}
        placeholder="输入消息..."
      />
    </div>
  );
}

export default ChatRoom;
