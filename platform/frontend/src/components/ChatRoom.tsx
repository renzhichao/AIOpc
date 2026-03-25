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
  const [showDebug, setShowDebug] = useState(false);
  const [connectionMode, setConnectionMode] = useState<'websocket' | 'polling'>('websocket');
  const [copySuccess, setCopySuccess] = useState(false);
  const [instanceId, setInstanceId] = useState<string | undefined>();
  const [lastConnected, setLastConnected] = useState<Date | undefined>();
  const [connectionError, setConnectionError] = useState<string | undefined>();
  const webSocket = useWebSocket();
  const pollingService = useRef(createPollingService());
  const debugEndRef = useRef<HTMLDivElement>(null);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    } catch {
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
   * Filter out status and error messages to avoid notification clutter
   * Extract instance information for connection status display
   */
  const handleMessage = useCallback((message: WebSocketMessage) => {
    // Extract instance ID from status or assistant messages
    if (message.type === 'status' && message.instance_id) {
      setInstanceId(message.instance_id);
      setLastConnected(new Date());
      console.log('[ChatRoom] Status message received (not displaying in chat):', message.message);
      return;
    }

    // Handle error messages - show in banner instead of chat
    if (message.type === 'error') {
      console.log('[ChatRoom] Error message received (showing in banner):', message.error);
      setConnectionError(message.error);
      // Auto-clear error after 5 seconds
      setTimeout(() => setConnectionError(undefined), 5000);
      return;
    }

    if (message.type === 'assistant_message' && message.instance_id) {
      // Update instance ID from assistant messages
      if (!instanceId) {
        setInstanceId(message.instance_id);
      }
      setLastConnected(new Date());
      // Clear any connection error when successfully connected
      setConnectionError(undefined);
    }

    // Filter out status messages - they will be shown in the connection status indicator instead
    if (message.type === 'status') {
      console.log('[ChatRoom] Status message received (not displaying in chat):', message.message);
      return;
    }

    setMessages((prev) => [...prev, message]);
  }, [instanceId]);

  /**
   * Handle keyboard shortcut for debug panel (Ctrl+Shift+D / Cmd+Shift+D)
   */
  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    // Check for Ctrl+Shift+D or Cmd+Shift+D
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'D') {
      event.preventDefault();
      setShowDebug(prev => !prev);
    }
  }, []);

  /**
   * Handle multiple clicks on connection status (5 clicks within 2 seconds)
   */
  const handleStatusClick = useCallback(() => {
    clickCountRef.current += 1;

    // Clear existing timer
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    // Set new timer to reset click count after 2 seconds
    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
    }, 2000);

    // Toggle debug panel after 5 clicks
    if (clickCountRef.current === 5) {
      setShowDebug(prev => !prev);
      clickCountRef.current = 0;
    }
  }, []);

  /**
   * Initialize WebSocket connection on mount
   * Falls back to HTTP polling if WebSocket fails
   */
  useEffect(() => {
    // Check URL parameter for debug mode
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === 'true') {
      setShowDebug(true);
    }

    // Add keyboard shortcut listener
    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, [handleKeyPress]);

  /**
   * Initialize WebSocket connection on mount
   * Falls back to HTTP polling if WebSocket fails
   */
  useEffect(() => {
    // Log component mount
    const mountMsg = '[ChatRoom] 🚀 Component mounted, starting WebSocket with 3s timeout';
    console.log(mountMsg);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__WS_DEBUG__ = (window as any).__WS_DEBUG__ || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: mountMsg });

    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
    let hasSwitched = false;

    const switchToPolling = () => {
      if (hasSwitched) return;
      hasSwitched = true;

      const logMsg = '[ChatRoom] ⚠️ WebSocket failed, switching to HTTP polling';
      console.log(logMsg);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__WS_DEBUG__ = (window as any).__WS_DEBUG__ || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__WS_DEBUG__ = (window as any).__WS_DEBUG__ || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: timeoutMsg });
        switchToPolling();
      }
    }, 3000);

    // Capture debug logs from window object
    const captureDebugLogs = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
      pollingService.current.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  /**
   * Handle sending a new message
   * Routes to WebSocket or HTTP polling based on current mode
   */
  const handleSendMessage = useCallback(
    async (content: string, files?: import('./MessageInput').UploadedFile[]) => {
      // Add user message to list immediately with 'sending' status
      const tempId = `temp-${Date.now()}`;
      const userMessage: WebSocketMessage = {
        type: 'user_message',
        content,
        timestamp: new Date().toISOString(),
        message_id: tempId,
        sendStatus: 'sending',
        metadata: files && files.length > 0 ? { files } : undefined,
      };

      setMessages((prev) => [...prev, userMessage]);

      try {
        // Send via WebSocket or HTTP polling
        if (connectionMode === 'polling') {
          await pollingService.current.sendMessage(content, files);
        } else {
          webSocket.sendMessage(content, files);
        }

        // Update message status to 'sent' after successful send
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.type === 'user_message' && msg.message_id === tempId) {
              return { ...msg, sendStatus: 'sent' as const };
            }
            return msg;
          })
        );
      } catch {
        // Update message status to 'failed' on error
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.type === 'user_message' && msg.message_id === tempId) {
              return { ...msg, sendStatus: 'failed' as const };
            }
            return msg;
          })
        );
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
      <div className="flex items-center justify-between px-3 py-1.5 bg-white border-b border-gray-200">
        <h1 className="text-sm font-semibold text-gray-800">OpenClaw Assistant</h1>
        <div className="flex items-center gap-2">
          {showDebug && (
            <button
              onClick={() => setShowDebug(false)}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              隐藏调试
            </button>
          )}
          <div
            onClick={handleStatusClick}
            className="cursor-pointer select-none"
            title="点击5次可切换调试面板 (Ctrl+Shift+D 也可以)"
          >
            <ConnectionStatus
              status={getCurrentStatus()}
              instanceId={instanceId}
              lastConnected={lastConnected}
              connectionError={connectionError}
            />
          </div>
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
