/**
 * WebSocket 服务 - 处理与 WebSocket Gateway 的实时通信
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Message queue for offline messages
 * - Connection heartbeat
 * - Type-safe message handling
 */

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type WebSocketMessage =
  | { type: 'user_message'; content: string; timestamp: string; message_id?: string; metadata?: Record<string, any>; sendStatus?: 'sending' | 'sent' | 'failed' }
  | { type: 'assistant_message'; content: string; timestamp: string; instance_id: string; message_id?: string; metadata?: Record<string, any> }
  | { type: 'status'; status: 'connected' | 'disconnected' | 'error'; message: string; instance_id?: string }
  | { type: 'error'; error: string; code?: string; details?: Record<string, any>; timestamp: string }
  | { type: 'message_ack'; message_id: string; status: string };
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface WebSocketServiceConfig {
  wsUrl?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  enableMessageQueue?: boolean;
}

export interface WebSocketService {
  // Connect to WebSocket server
  connect(): void;

  // Disconnect from server
  disconnect(): void;

  // Send message to server
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendMessage(content: string, files?: any[]): void;

  // Register message handler
  onMessage(handler: (message: WebSocketMessage) => void): () => void;

  // Register status change handler
  onStatusChange(handler: (status: WebSocketStatus) => void): () => void;

  // Get current connection status
  getStatus(): WebSocketStatus;

  // Check if connected
  isConnected(): boolean;
}

const DEFAULT_CONFIG: Required<WebSocketServiceConfig> = {
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:3001',
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
  enableMessageQueue: false,
};

export function createWebSocketService(config: WebSocketServiceConfig = {}): WebSocketService {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  let ws: WebSocket | null = null;
  let currentStatus: WebSocketStatus = 'disconnected';
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let messageQueue: string[] = [];

  const messageHandlers: Set<(message: WebSocketMessage) => void> = new Set();
  const statusHandlers: Set<(status: WebSocketStatus) => void> = new Set();

  function notifyStatus(status: WebSocketStatus) {
    currentStatus = status;
    statusHandlers.forEach(handler => {
      try {
        handler(status);
      } catch {
        console.error('Error in status handler:', error);
      }
    });
  }

  function notifyMessage(message: WebSocketMessage) {
    messageHandlers.forEach(handler => {
      try {
        handler(message);
      } catch {
        console.error('Error in message handler:', error);
      }
    });
  }

  function calculateReconnectDelay(): number {
    // Exponential backoff with jitter
    const baseDelay = finalConfig.reconnectInterval;
    const exponentialDelay = baseDelay * Math.pow(2, reconnectAttempts);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  function flushMessageQueue() {
    if (messageQueue.length === 0) return;

    const messagesToSend = [...messageQueue];
    messageQueue = [];

    messagesToSend.forEach(messageData => {
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(messageData);
        }
      } catch {
        console.error('Failed to send queued message:', error);
      }
    });
  }

  function scheduleReconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }

    if (reconnectAttempts >= finalConfig.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      notifyStatus('error');
      return;
    }

    const delay = calculateReconnectDelay();
    console.log(`Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts + 1})`);

    reconnectTimeout = setTimeout(() => {
      reconnectAttempts++;
      connect();
    }, delay);
  }

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    // Try multiple storage methods for compatibility with WebView environments
    // Priority: sessionStorage -> localStorage -> both auth_token keys
    const token =
      sessionStorage.getItem('access_token') ||
      sessionStorage.getItem('auth_token') ||
      localStorage.getItem('access_token') ||
      localStorage.getItem('auth_token');

    if (!token) {
      const errorMsg = '❌ No access token found in sessionStorage or localStorage';
      console.error('[WS-DEBUG]', errorMsg);
      console.error('[WS-DEBUG] sessionStorage keys:', Object.keys(sessionStorage));
      console.error('[WS-DEBUG] localStorage keys:', Object.keys(localStorage));
      notifyStatus('error');
      return;
    }

    const wsUrl = `${finalConfig.wsUrl}?token=${token}`;

    // Debug: Log connection attempt
    const debugMsg = `[WS-DEBUG] 🔄 Connecting to: ${wsUrl.replace(token, token.substring(0, 10) + '...')}`;
    console.log(debugMsg);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__WS_DEBUG__ = (window as any).__WS_DEBUG__ || [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: debugMsg });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: `Token source: ${sessionStorage.getItem('access_token') ? 'sessionStorage' : 'localStorage'}` });

    notifyStatus('connecting');

    try {
      ws = new WebSocket(wsUrl);

      // Log WebSocket readyState changes for debugging
      const checkReadyState = () => {
        const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
        const stateMsg = `WebSocket state: ${states[ws?.readyState || 3]} (${ws?.readyState})`;
        console.log('[WS-DEBUG]', stateMsg);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: stateMsg });
      };

      // Check immediately after creation
      setTimeout(checkReadyState, 100);
      setTimeout(checkReadyState, 1000);
      setTimeout(checkReadyState, 3000);

      ws.onopen = () => {
        const successMsg = '✅ WebSocket connected successfully';
        console.log('[WS-DEBUG]', successMsg);
        reconnectAttempts = 0;
        notifyStatus('connected');
        flushMessageQueue();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: successMsg });
      };

      ws.onmessage = (event) => {
        const msgMsg = `📨 Received: ${event.data.substring(0, 100)}...`;
        console.log('[WS-DEBUG]', msgMsg);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: msgMsg });
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          notifyMessage(message);
        } catch {
          console.error('[WS-DEBUG] ❌ Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        const errorMsg = `❌ WebSocket error: ${JSON.stringify(error)}`;
        console.error('[WS-DEBUG]', errorMsg);
        notifyStatus('error');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: errorMsg });
      };

      ws.onclose = (event) => {
        const closeMsg = `🔌 WebSocket closed: code=${event.code}, reason="${event.reason}"`;
        console.log('[WS-DEBUG]', closeMsg);
        notifyStatus('disconnected');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: closeMsg });

        // Attempt to reconnect
        scheduleReconnect();
      };

    } catch {
      const catchMsg = `❌ Failed to create WebSocket: ${error}`;
      console.error('[WS-DEBUG]', catchMsg);
      notifyStatus('error');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: catchMsg });
    }
  }

  function disconnect() {
    // Cancel any pending reconnect
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    // Close connection
    if (ws) {
      ws.close(1000, 'Client disconnecting');
      ws = null;
    }

    // Clear message queue
    messageQueue = [];

    // Reset reconnect attempts
    reconnectAttempts = 0;

    notifyStatus('disconnected');
  }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
  function sendMessage(content: string, files?: any[]) {
    const message: WebSocketMessage = {
      type: 'user_message',
      content,
      timestamp: new Date().toISOString(),
      metadata: files && files.length > 0 ? { files } : undefined,
    };

    const messageData = JSON.stringify(message);

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket is not connected');

      if (finalConfig.enableMessageQueue) {
        console.log('Queueing message for later delivery');
        messageQueue.push(messageData);
      }

      return;
    }

    try {
      ws.send(messageData);
    } catch {
      console.error('Failed to send message:', error);

      if (finalConfig.enableMessageQueue) {
        messageQueue.push(messageData);
      }
    }
  }

  function onMessage(handler: (message: WebSocketMessage) => void): () => void {
    messageHandlers.add(handler);
    return () => messageHandlers.delete(handler);
  }

  function onStatusChange(handler: (status: WebSocketStatus) => void): () => void {
    statusHandlers.add(handler);
    return () => statusHandlers.delete(handler);
  }

  function getStatus(): WebSocketStatus {
    return currentStatus;
  }

  function isConnected(): boolean {
    return ws?.readyState === WebSocket.OPEN;
  }

  return {
    connect,
    disconnect,
    sendMessage,
    onMessage,
    onStatusChange,
    getStatus,
    isConnected: () => isConnected()
  };
}
