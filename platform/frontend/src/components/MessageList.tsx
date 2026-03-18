/**
 * MessageList Component
 *
 * Displays chat messages with automatic scrolling to the latest message.
 * This is a simplified version that will be enhanced in TASK-012.
 */

import React, { useEffect, useRef } from 'react';
import type { WebSocketMessage } from '../services/websocket';

export interface MessageListProps {
  messages: WebSocketMessage[];
  className?: string;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  className = '',
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /**
   * Auto-scroll to the latest message
   */
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /**
   * Format timestamp for display
   */
  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } else {
      return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  /**
   * Render message status indicator
   */
  const renderMessageStatus = (message: WebSocketMessage) => {
    if (message.type !== 'user_message') return null;

    const sendStatus = message.sendStatus;
    if (!sendStatus || sendStatus === 'sent') return null;

    return (
      <span className="ml-2 text-xs opacity-70">
        {sendStatus === 'sending' && (
          <span className="text-gray-400">发送中...</span>
        )}
        {sendStatus === 'failed' && (
          <span className="text-red-400">发送失败</span>
        )}
      </span>
    );
  };

  /**
   * Render a single message
   */
  const renderMessage = (message: WebSocketMessage, index: number) => {
    const isUserMessage = message.type === 'user_message';
    const isAssistantMessage = message.type === 'assistant_message';
    const isErrorMessage = message.type === 'error';
    const isStatusMessage = message.type === 'status';

    const baseClasses = 'flex w-full mb-4';
    const alignmentClass = isUserMessage ? 'justify-end' : 'justify-start';

    const bubbleBaseClasses = 'max-w-[75%] px-4 py-2 rounded-2xl shadow-sm';
    const bubbleColorClasses = isUserMessage
      ? 'bg-green-500 text-white rounded-br-sm'
      : isAssistantMessage
      ? 'bg-white text-gray-800 rounded-bl-sm'
      : isErrorMessage
      ? 'bg-red-500 text-white'
      : 'bg-gray-200 text-gray-600';

    const metadataClasses = 'text-xs mt-1 opacity-70';

    // Get content safely based on message type
    const getContent = (): string => {
      if (isUserMessage || isAssistantMessage) {
        return message.content;
      }
      if (isErrorMessage) {
        return message.error || '未知错误';
      }
      if (isStatusMessage) {
        return message.message;
      }
      return '';
    };

    // Get timestamp safely
    const getTimestamp = (): string | undefined => {
      if (isUserMessage || isAssistantMessage || isErrorMessage) {
        return message.timestamp;
      }
      return undefined;
    };

    const content = getContent();
    const timestamp = getTimestamp();

    return (
      <div
        key={`${message.type}-${index}`}
        className={`${baseClasses} ${alignmentClass}`}
        data-testid={`message-${message.type === 'error' ? 'error' : isUserMessage ? 'user' : 'assistant'}-${index}`}
        aria-live="polite"
      >
        <div className="flex flex-col">
          <div className={`${bubbleBaseClasses} ${bubbleColorClasses}`}>
            <p className="whitespace-pre-wrap break-words">{content}</p>
          </div>
          <div className={`${metadataClasses} ${isUserMessage ? 'text-right' : 'text-left'} flex items-center justify-end gap-1`}>
            {timestamp !== undefined && formatTimestamp(timestamp)}
            {isUserMessage && message.sendStatus === 'sent' && (
              <span className="text-xs opacity-70 ml-1">已发送</span>
            )}
            {renderMessageStatus(message)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`
        flex-1 overflow-y-auto px-4 py-4
        bg-gray-50
        ${className}
      `}
      data-testid="message-list"
      role="log"
      aria-label="聊天消息列表"
      aria-live="polite"
    >
      <div className="max-w-4xl mx-auto">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p className="text-center">开始与 OpenClaw Assistant 对话...</p>
          </div>
        ) : (
          messages
            .filter(message => message.type !== 'status' && message.type !== 'error') // Filter out status and error messages (shown in banner)
            .map((message, index) => renderMessage(message, index))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default MessageList;
