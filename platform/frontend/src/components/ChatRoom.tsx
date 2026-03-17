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

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { createPollingService } from '../services/polling';
import { ConnectionStatus } from './ConnectionStatus';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import type { WebSocketMessage } from '../services/websocket';

export interface ChatRoomProps {
  className?: string;
}

export function ChatRoom({ className = '' }: ChatRoomProps) {
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [debugLogs, setDebugLogs] = useState<Array<{time: string; message: string}>>([]);
  const [showDebug, setShowDebug] = useState(true);
  const [connectionMode, setConnectionMode] = useState<'websocket' | 'polling'>('websocket');
  const [copySuccess, setCopySuccess] = useState(false);
  const webSocket = useWebSocket();
  const pollingService = useRef(createPollingService());
  const debugEndRef = useRef<HTMLDivElement>(null);

  // Get current connection status
  const getCurrentStatus = () => {
    if (connectionMode === 'polling') {
      return pollingService.current.getStatus();
    }
    return webSocket.status;
  };

  // Compute status class name
  const getStatusClassName = () => {
    const status = getCurrentStatus();
    switch (status) {
      case 'connected':
        return 'text-green-400';
      case 'connecting':
        return 'text-yellow-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  // Get token for display
  const getTokenDisplay = () => {
    // Check multiple storage sources (same order as WebSocket)
    const token =
      sessionStorage.getItem('access_token') ||
      sessionStorage.getItem('auth_token') ||
      localStorage.getItem('access_token') ||
      localStorage.getItem('auth_token') || '';

    if (!token) return '(no token)';
    return token.substring(0, Math.min(20, token.length)) + '...';
  };

  // Get token storage source for debugging
  const getTokenSource = () => {
    if (sessionStorage.getItem('access_token')) return 'sessionStorage (access_token)';
    if (sessionStorage.getItem('auth_token')) return 'sessionStorage (auth_token)';
    if (localStorage.getItem('access_token')) return 'localStorage (access_token)';
    if (localStorage.getItem('auth_token')) return 'localStorage (auth_token)';
    return 'none';
  };

  // Copy debug logs to clipboard
  const copyDebugLogs = async () => {
    const debugText = debugLogs.map(log => `[${log.time}] ${log.message}`).join('\n');
    const fullDebugInfo = `
=== OpenClaw 调试信息 ===
模式: ${connectionMode === 'websocket' ? 'WebSocket' : 'HTTP Polling'}
状态: ${getCurrentStatus()}
Token: ${getTokenDisplay()}
Token 来源: ${getTokenSource()}
${connectionMode === 'websocket' ? `WebSocket URL: ${import.meta.env.VITE_WS_URL || 'ws://localhost:3001'}` : ''}

=== 日志 ===
${debugText}
    `.trim();

    try {
      await navigator.clipboard.writeText(fullDebugInfo);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = fullDebugInfo;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (e) {
        console.error('Failed to copy:', e);
      }
      document.body.removeChild(textArea);
    }
  };

  /**
   * Handle incoming messages from WebSocket
   */
  const handleMessage = useCallback((message: WebSocketMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  /**
   * Initialize WebSocket connection on mount
   * Falls back to HTTP polling if WebSocket fails
   */
  useEffect(() => {
    // Log component mount
    const mountMsg = '[ChatRoom] 🚀 Component mounted, starting WebSocket with 3s timeout';
    console.log(mountMsg);
    (window as any).__WS_DEBUG__ = (window as any).__WS_DEBUG__ || [];
    (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: mountMsg });

    let fallbackTimeout: ReturnType<typeof setTimeout>;
    let hasSwitched = false;

    const switchToPolling = () => {
      if (hasSwitched) return;
      hasSwitched = true;

      const logMsg = '[ChatRoom] ⚠️ WebSocket failed, switching to HTTP polling';
      console.log(logMsg);
      (window as any).__WS_DEBUG__ = (window as any).__WS_DEBUG__ || [];
      (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: logMsg });

      // Disconnect WebSocket to prevent reconnection
      webSocket.disconnect();

      setConnectionMode('polling');
      pollingService.current.start();

      // Subscribe to polling messages
      const unsubscribePollingMessage = pollingService.current.onMessage(handleMessage);
      const unsubscribePollingStatus = pollingService.current.onStatusChange((pollingStatus) => {
        const statusMsg = `[ChatRoom] Polling status: ${pollingStatus}`;
        console.log(statusMsg);
        (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: statusMsg });
      });

      // Cleanup subscriptions when switching modes
      return () => {
        unsubscribePollingMessage();
        unsubscribePollingStatus();
      };
    };

    // Subscribe to WebSocket messages
    const unsubscribeMessage = webSocket.onMessage(handleMessage);

    // Subscribe to WebSocket status changes
    const unsubscribeStatus = webSocket.onStatusChange((status) => {
      const statusMsg = `[ChatRoom] WebSocket status changed: ${status}`;
      console.log(statusMsg);
      (window as any).__WS_DEBUG__ = (window as any).__WS_DEBUG__ || [];
      (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: statusMsg });

      if (status === 'connected') {
        // Clear fallback timeout if WebSocket connects successfully
        if (fallbackTimeout) {
          clearTimeout(fallbackTimeout);
        }
      }

      // Immediately switch to polling on error or disconnect
      if (status === 'error' || status === 'disconnected') {
        switchToPolling();
      }
    });

    // Set a timeout to check if WebSocket connects within 3 seconds
    // If not, automatically switch to polling
    fallbackTimeout = setTimeout(() => {
      if (!hasSwitched && webSocket.status !== 'connected') {
        const timeoutMsg = '[ChatRoom] ⏰ WebSocket timeout (3s), forcing switch to HTTP polling';
        console.log(timeoutMsg);
        (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: timeoutMsg });
        switchToPolling();
      }
    }, 3000);

    // Capture debug logs from window object
    const captureDebugLogs = () => {
      const logs = (window as any).__WS_DEBUG__ || [];
      setDebugLogs([...logs]);
      if (debugEndRef.current) {
        debugEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    };

    // Update debug logs every second
    const debugInterval = setInterval(captureDebugLogs, 1000);

    // Cleanup on unmount
    return () => {
      unsubscribeMessage();
      unsubscribeStatus();
      clearInterval(debugInterval);
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout);
      }
      pollingService.current.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  /**
   * Handle sending a new message
   * Routes to WebSocket or HTTP polling based on current mode
   */
  const handleSendMessage = useCallback(
    async (content: string) => {
      // Add user message to list immediately for better UX
      const userMessage: WebSocketMessage = {
        type: 'user_message',
        content,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);

      // Send via WebSocket or HTTP polling
      if (connectionMode === 'polling') {
        await pollingService.current.sendMessage(content);
      } else {
        webSocket.sendMessage(content);
      }
    },
    [webSocket, connectionMode]
  );

  return (
    <div
      className={`flex flex-col h-screen bg-gray-50 ${className}`}
      data-testid="chat-room"
      role="region"
      aria-label="聊天室"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-800">OpenClaw Assistant</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            {showDebug ? '隐藏' : '显示'}调试信息
          </button>
          <ConnectionStatus status={getCurrentStatus()} />
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div className="bg-black text-green-400 text-xs p-4 border-b border-gray-300 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-yellow-400">🔍 连接调试信息</div>
            <button
              onClick={copyDebugLogs}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
            >
              {copySuccess ? '✅ 已拷贝' : '📋 拷贝日志'}
            </button>
          </div>
          <div className="mb-2 text-white">
            模式: <span className="text-cyan-400">{connectionMode === 'websocket' ? 'WebSocket' : 'HTTP Polling'}</span>
          </div>
          <div className="mb-2 text-white">
            状态: <span className={getStatusClassName()}>{getCurrentStatus()}</span>
          </div>
          <div className="mb-2 text-white">Token: {getTokenDisplay()}</div>
          <div className="mb-2 text-white">Token 来源: {getTokenSource()}</div>
          {connectionMode === 'websocket' && (
            <div className="mb-2 text-white">
              WebSocket URL: {import.meta.env.VITE_WS_URL || 'ws://localhost:3001'}
            </div>
          )}
          <div className="font-bold text-yellow-400 mb-1">日志:</div>
          {debugLogs.length === 0 ? (
            <div className="text-gray-500">等待日志...</div>
          ) : (
            debugLogs.map((log, index) => (
              <div key={index} className="mb-1">
                <span className="text-gray-500">[{log.time}]</span> {log.message}
              </div>
            ))
          )}
          <div ref={debugEndRef} />
        </div>
      )}

      {/* Message List */}
      <MessageList messages={messages} />

      {/* Input Area */}
      <MessageInput
        onSend={handleSendMessage}
        disabled={getCurrentStatus() !== 'connected'}
        placeholder="输入消息..."
      />
    </div>
  );
}

export default ChatRoom;
