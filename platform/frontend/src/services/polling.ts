/**
 * HTTP Long Polling Service - Fallback for WebSocket
 *
 * Used when WebSocket is not available (e.g., in restricted WebView environments)
 * Implements long-polling to receive messages from the server
 */

import type { WebSocketMessage } from './websocket';

export type PollingStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface PollingServiceConfig {
  apiUrl?: string;
  pollInterval?: number;
  maxPollInterval?: number;
  enableLongPolling?: boolean;
}

export interface PollingService {
  // Start polling
  start(): void;

  // Stop polling
  stop(): void;

  // Send message via HTTP POST
  sendMessage(content: string, files?: any[]): Promise<void>;

  // Register message handler
  onMessage(handler: (message: WebSocketMessage) => void): () => void;

  // Register status change handler
  onStatusChange(handler: (status: PollingStatus) => void): () => void;

  // Get current status
  getStatus(): PollingStatus;

  // Check if connected
  isConnected(): boolean;
}

const DEFAULT_CONFIG: Required<PollingServiceConfig> = {
  apiUrl: import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api',
  pollInterval: 2000, // Start with 2 seconds
  maxPollInterval: 10000, // Max 10 seconds
  enableLongPolling: true,
};

export function createPollingService(config: PollingServiceConfig = {}): PollingService {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  let currentStatus: PollingStatus = 'disconnected';
  let pollTimeout: ReturnType<typeof setTimeout> | null = null;
  let isPolling = false;
  let pollInterval = finalConfig.pollInterval;

  const messageHandlers: Set<(message: WebSocketMessage) => void> = new Set();
  const statusHandlers: Set<(status: PollingStatus) => void> = new Set();

  function notifyStatus(status: PollingStatus) {
    currentStatus = status;
    statusHandlers.forEach(handler => {
      try {
        handler(status);
      } catch (error) {
        console.error('[Polling] Error in status handler:', error);
      }
    });
  }

  function notifyMessage(message: WebSocketMessage) {
    messageHandlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        console.error('[Polling] Error in message handler:', error);
      }
    });
  }

  async function pollForMessages(token: string): Promise<void> {
    try {
      const response = await fetch(`${finalConfig.apiUrl}/chat/messages`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.messages && data.messages.length > 0) {
        const newMessagesMsg = `[Polling] 📨 Received ${data.messages.length} new message(s)`;
        console.log(newMessagesMsg);
        (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: newMessagesMsg });

        // Notify each message
        data.messages.forEach((msg: WebSocketMessage) => {
          notifyMessage(msg);
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorMsg = `[Polling] ⚠️ Message poll error: ${errorMessage}`;
      console.error(errorMsg);
      (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: errorMsg });
      // Don't change status on message poll error - just log it
    }
  }

  async function poll(): Promise<void> {
    if (!isPolling) return;

    try {
      const token = getToken();
      if (!token) {
        const errorMsg = '[Polling] No token found';
        console.error(errorMsg);
        (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: errorMsg });
        notifyStatus('error');
        schedulePoll();
        return;
      }

      // Check instance status
      const pollMsg = `[Polling] 📡 Polling /chat/status...`;
      console.log(pollMsg);
      (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: pollMsg });

      const response = await fetch(`${finalConfig.apiUrl}/chat/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle 304 Not Modified - no body to parse
      if (response.status === 304) {
        if (currentStatus !== 'connected') {
          const successMsg = `[Polling] ✅ Status: connected (304 cached)`;
          console.log(successMsg);
          (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: successMsg });
          notifyStatus('connected');
        }
        schedulePoll();
        return;
      }

      const data = await response.json();

      if (data.success && data.instance) {
        if (currentStatus !== 'connected') {
          const successMsg = `[Polling] ✅ Connected to instance ${data.instance.instance_id} (${data.instance.status})`;
          console.log(successMsg);
          (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: successMsg });
          notifyStatus('connected');
        }

        // Check if instance is online
        if (data.instance.status === 'online') {
          // Poll for new messages
          await pollForMessages(token);
        }
      } else {
        throw new Error(data.error || 'Failed to get instance status');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorMsg = `[Polling] ❌ Poll error: ${errorMessage}`;
      console.error(errorMsg);
      (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: errorMsg });
      if (currentStatus === 'connected') {
        notifyStatus('error');
      }
    }

    schedulePoll();
  }

  function schedulePoll() {
    if (!isPolling) return;

    // Adaptive polling: back off on success, speed up on error
    pollTimeout = setTimeout(() => {
      poll();
    }, pollInterval);
  }

  function getToken(): string | null {
    return (
      sessionStorage.getItem('auth_token') ||
      sessionStorage.getItem('access_token') ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('access_token')
    );
  }

  function start(): void {
    if (isPolling) {
      console.warn('[Polling] Already polling');
      return;
    }

    const token = getToken();
    if (!token) {
      console.error('[Polling] No token found');
      notifyStatus('error');
      return;
    }

    const startMsg = '[Polling] 🚀 Starting polling service';
    console.log(startMsg);
    (window as any).__WS_DEBUG__ = (window as any).__WS_DEBUG__ || [];
    (window as any).__WS_DEBUG__.push({ time: new Date().toISOString(), message: startMsg });

    isPolling = true;
    notifyStatus('connecting');
    poll();
  }

  function stop(): void {
    console.log('[Polling] Stopping polling service');
    isPolling = false;

    if (pollTimeout) {
      clearTimeout(pollTimeout);
      pollTimeout = null;
    }

    notifyStatus('disconnected');
  }

  async function sendMessage(content: string, files?: any[]): Promise<void> {
    const token = getToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    console.log('[Polling] Sending message:', content.substring(0, 50) + '...', files ? `with ${files.length} file(s)` : '');

    const response = await fetch(`${finalConfig.apiUrl}/chat/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content, files }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send message');
    }

    const result = await response.json();
    console.log('[Polling] Message sent:', result.message_id);

    // NOTE: Don't add user message here - ChatRoom already adds it immediately
    // This prevents duplicate messages in the UI
  }

  function onMessage(handler: (message: WebSocketMessage) => void): () => void {
    messageHandlers.add(handler);
    return () => messageHandlers.delete(handler);
  }

  function onStatusChange(handler: (status: PollingStatus) => void): () => void {
    statusHandlers.add(handler);
    return () => statusHandlers.delete(handler);
  }

  function getStatus(): PollingStatus {
    return currentStatus;
  }

  function isConnected(): boolean {
    return currentStatus === 'connected';
  }

  return {
    start,
    stop,
    sendMessage,
    onMessage,
    onStatusChange,
    getStatus,
    isConnected,
  };
}
