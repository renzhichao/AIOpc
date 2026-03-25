/**
 * ChatPage - 对话页面
 *
 * 与远程实例进行实时对话的页面
 *
 * Features:
 * - 实时消息发送和接收
 * - WebSocket 连接管理
 * - 实例信息显示
 * - 连接状态指示器
 * - 打字指示器
 * - 自动滚动到最新消息
 * - 响应式设计
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { instanceService } from '../services/instance';
import { useWebSocket } from '../hooks/useWebSocket';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { StatusBadge } from '../components/StatusBadge';
import type { Instance } from '../types/instance';
import type { WebSocketMessage } from '../services/websocket';

/**
 * 消息类型
 */
interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'failed';
}

/**
 * 生成唯一ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 格式化时间戳
 */
function formatTimestamp(date: Date): string {
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
}

export default function ChatPage() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();

  // State
  const [instance, setInstance] = useState<Instance | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // WebSocket connection
  const webSocket = useWebSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /**
   * 加载实例信息
   */
  const loadInstance = useCallback(async () => {
    if (!instanceId) {
      setError('实例 ID 未提供');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const instanceData = await instanceService.getInstance(instanceId);
      setInstance(instanceData);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载实例失败';
      setError(message);
      console.error('加载实例失败:', err);
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  /**
   * 自动滚动到底部
   */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);  

  /**
   * 处理 WebSocket 消息
   */
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'assistant_message') {
      setIsTyping(false);
      addMessage({
        id: message.message_id || generateId(),
        type: 'assistant',
        content: message.content,
        timestamp: new Date(message.timestamp),
      });
    } else if (message.type === 'status') {
      // Handle status messages if needed
      console.log('Status message:', message);
    }
  }, []);

  /**
   * 添加消息到列表
   */
  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
    scrollToBottom();
  }, [scrollToBottom]);

  /**
   * 发送消息
   */
  const handleSendMessage = useCallback(async () => {
    const trimmedInput = input.trim();

    if (!trimmedInput || isSending || !webSocket.isConnected) {
      return;
    }

    // Create user message
    const userMessage: ChatMessage = {
      id: generateId(),
      type: 'user',
      content: trimmedInput,
      timestamp: new Date(),
      status: 'sending',
    };

    // Add to message list
    addMessage(userMessage);
    setInput('');
    setIsSending(true);

    try {
      // Send via WebSocket
      webSocket.sendMessage(trimmedInput);

      // Update message status
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === userMessage.id ? { ...msg, status: 'sent' } : msg
        )
      );
    } catch (err) {
      console.error('发送消息失败:', err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === userMessage.id ? { ...msg, status: 'failed' } : msg
        )
      );
    } finally {
      setIsSending(false);
      // Focus back on input
      inputRef.current?.focus();
    }
  }, [input, isSending, webSocket, addMessage]);

  /**
   * 处理输入变化
   */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    []
  );

  /**
   * 处理键盘事件
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  /**
   * 初始化组件
   */
  useEffect(() => {
    loadInstance();
  }, [loadInstance]);

  /**
   * 设置 WebSocket 消息监听
   */
  useEffect(() => {
    const unsubscribe = webSocket.onMessage(handleWebSocketMessage);
    return () => unsubscribe();
  }, [webSocket, handleWebSocketMessage]);

  /**
   * 自动滚动到最新消息
   */
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  /**
   * 自动聚焦输入框
   */
  useEffect(() => {
    if (!loading && !error) {
      inputRef.current?.focus();
    }
  }, [loading, error]);

  /**
   * 渲染加载状态
   */
  if (loading) {
    return (
      <div
        className="min-h-screen bg-gray-50 flex items-center justify-center"
        data-testid="chat-loading"
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  /**
   * 渲染错误状态
   */
  if (error || !instance) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {error || '实例不存在'}
          </h3>
          <button
            onClick={() => navigate('/instances')}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors duration-200 font-medium"
          >
            返回实例列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-screen bg-gray-50"
      data-testid="chat-page"
      role="region"
      aria-label="聊天页面"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-4">
          {/* Back Button */}
          <button
            onClick={() => navigate('/instances')}
            className="text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-2"
            data-testid="back-button"
            aria-label="返回实例列表"
          >
            <span>←</span>
            <span>返回</span>
          </button>

          {/* Instance Info */}
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-800" data-testid="instance-name">
                {instance.config.name || `实例 ${String(instance.id).slice(0, 8)}`}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500" data-testid="instance-type-badge">
                  {instance.deployment_type === 'remote' ? '远程实例' : '本地实例'}
                </span>
                <StatusBadge status={instance.status} size="sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Connection Status */}
        <ConnectionStatus status={webSocket.status} />
      </div>

      {/* Message List */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        data-testid="message-list"
        role="log"
        aria-label="聊天消息列表"
        aria-live="polite"
      >
        <div className="max-w-4xl mx-auto">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <p className="text-center">开始与实例对话...</p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={message.id}
                className={`flex w-full mb-4 ${
                  message.type === 'user' ? 'justify-end' : 'justify-start'
                }`}
                data-testid={`message-${message.type}-${index}`}
                aria-live="polite"
              >
                <div className="flex flex-col max-w-[75%]">
                  {/* Message Bubble */}
                  <div
                    className={`px-4 py-2 rounded-2xl shadow-sm ${
                      message.type === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-white text-gray-800 rounded-bl-sm border border-gray-200'
                    } ${message.status === 'failed' ? 'opacity-50' : ''}`}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  </div>

                  {/* Timestamp */}
                  <div
                    className={`text-xs mt-1 opacity-70 ${
                      message.type === 'user' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {formatTimestamp(message.timestamp)}
                    {message.status === 'sending' && ' (发送中...)'}
                    {message.status === 'failed' && ' (发送失败)'}
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex w-full mb-4 justify-start" data-testid="typing-indicator">
              <div className="bg-white text-gray-800 px-4 py-2 rounded-2xl rounded-bl-sm border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                  <span className="text-sm text-gray-600">AI 正在输入...</span>
                </div>
              </div>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div
        className="border-t border-gray-200 bg-white p-4"
        data-testid="message-input-area"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="max-w-4xl mx-auto"
        >
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isSending || !webSocket.isConnected}
                placeholder="输入消息..."
                rows={1}
                className={`
                  w-full px-4 py-3 pr-4
                  border border-gray-300 rounded-lg
                  resize-none overflow-hidden
                  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                  disabled:bg-gray-100 disabled:cursor-not-allowed
                  transition-all
                  ${isSending || !webSocket.isConnected ? 'opacity-50' : ''}
                `}
                style={{ minHeight: '48px', maxHeight: '200px' }}
                aria-label="消息输入框"
                data-testid="message-input"
                aria-disabled={isSending || !webSocket.isConnected}
              />
            </div>

            <button
              type="submit"
              disabled={isSending || !input.trim() || !webSocket.isConnected}
              className={`
                px-6 py-3 rounded-lg font-medium
                transition-all
                ${
                  isSending || !input.trim() || !webSocket.isConnected
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800'
                }
              `}
              aria-label="发送消息"
              data-testid="send-button"
              aria-disabled={isSending || !input.trim() || !webSocket.isConnected}
            >
              {isSending ? '发送中...' : '发送'}
            </button>
          </div>

          <div className="mt-2 text-xs text-gray-400 text-center">
            按 Enter 发送，Shift + Enter 换行
          </div>
        </form>
      </div>
    </div>
  );
}
