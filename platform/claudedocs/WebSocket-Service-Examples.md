# WebSocket Service Usage Examples

## Basic Usage

```typescript
import { createWebSocketService } from './services/websocket';

// Create service with custom configuration
const wsService = createWebSocketService({
  wsUrl: 'ws://localhost:3001',
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
  enableMessageQueue: false,
});

// Connect to WebSocket server
wsService.connect();

// Listen for incoming messages
const unsubscribeMessages = wsService.onMessage((message) => {
  switch (message.type) {
    case 'assistant_message':
      console.log('AI Response:', message.content);
      console.log('Instance:', message.instance_id);
      break;
    case 'status':
      console.log('Status update:', message.status, message.message);
      break;
    case 'error':
      console.error('WebSocket error:', message.error);
      break;
  }
});

// Listen for connection status changes
const unsubscribeStatus = wsService.onStatusChange((status) => {
  console.log('Connection status:', status);
  // status: 'connecting' | 'connected' | 'disconnected' | 'error'
});

// Send a message
wsService.sendMessage('Hello, AI!');

// Check if connected
if (wsService.isConnected()) {
  console.log('WebSocket is connected');
}

// Get current status
const currentStatus = wsService.getStatus();
console.log('Current status:', currentStatus);

// Cleanup
unsubscribeMessages();
unsubscribeStatus();
wsService.disconnect();
```

## React Hook Integration

```typescript
import { useEffect, useState, useCallback, useRef } from 'react';
import { createWebSocketService, WebSocketMessage, WebSocketStatus } from '../services/websocket';

export function useWebSocket() {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const wsRef = useRef<ReturnType<typeof createWebSocketService> | null>(null);

  useEffect(() => {
    // Create service instance
    const ws = createWebSocketService();
    wsRef.current = ws;

    // Subscribe to status changes
    const unsubStatus = ws.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    // Subscribe to messages
    const unsubMessages = ws.onMessage((message) => {
      setMessages(prev => [...prev, message]);
    });

    // Connect
    ws.connect();

    // Cleanup on unmount
    return () => {
      unsubStatus();
      unsubMessages();
      ws.disconnect();
    };
  }, []);

  const sendMessage = useCallback((content: string) => {
    if (wsRef.current) {
      wsRef.current.sendMessage(content);
    }
  }, []);

  return {
    status,
    messages,
    sendMessage,
    isConnected: status === 'connected',
  };
}
```

## Chat Component Example

```typescript
import React, { useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

export function ChatComponent() {
  const { status, messages, sendMessage, isConnected } = useWebSocket();
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && isConnected) {
      sendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>AI Chat</h2>
        <span className={`status ${status}`}>
          {status === 'connected' ? '🟢 Connected' : `🔴 ${status}`}
        </span>
      </div>

      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.type}`}>
            {msg.type === 'assistant_message' && (
              <>
                <strong>AI:</strong>
                <p>{msg.content}</p>
                <small>{new Date(msg.timestamp).toLocaleTimeString()}</small>
              </>
            )}
            {msg.type === 'user_message' && (
              <>
                <strong>You:</strong>
                <p>{msg.content}</p>
                <small>{new Date(msg.timestamp).toLocaleTimeString()}</small>
              </>
            )}
            {msg.type === 'status' && (
              <div className="system-message">{msg.message}</div>
            )}
            {msg.type === 'error' && (
              <div className="error-message">{msg.error}</div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isConnected ? "Type a message..." : "Connecting..."}
          disabled={!isConnected}
        />
        <button type="submit" disabled={!isConnected || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
```

## With Message Queue (Offline Support)

```typescript
const wsService = createWebSocketService({
  enableMessageQueue: true,  // Enable message queuing
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
});

// Messages sent while disconnected will be queued
// and sent automatically when reconnected
wsService.sendMessage('This will be queued if disconnected');
wsService.sendMessage('Me too!');

// When connection is restored, queued messages are sent automatically
```

## Multiple Message Handlers

```typescript
const ws = createWebSocketService();

// Handler 1: Update UI
const unsub1 = ws.onMessage((message) => {
  if (message.type === 'assistant_message') {
    updateChatUI(message.content);
  }
});

// Handler 2: Log to analytics
const unsub2 = ws.onMessage((message) => {
  analytics.track('websocket_message', {
    type: message.type,
    timestamp: message.timestamp,
  });
});

// Handler 3: Trigger notifications
const unsub3 = ws.onMessage((message) => {
  if (message.type === 'assistant_message' && message.metadata?.urgent) {
    showNotification(message.content);
  }
});

// All handlers will be called for each message

// Cleanup individual handlers
unsub1();  // Stop updating UI
unsub2();  // Stop logging
unsub3();  // Stop notifications
```

## Status Monitoring

```typescript
const ws = createWebSocketService();

// Track connection attempts
let reconnectAttempts = 0;
const lastStatusChange = useRef<Date>(new Date());

const unsubStatus = ws.onStatusChange((status) => {
  lastStatusChange.current = new Date();

  switch (status) {
    case 'connecting':
      console.log('Attempting to connect...');
      break;
    case 'connected':
      console.log('Connected successfully!');
      reconnectAttempts = 0;
      break;
    case 'disconnected':
      console.log('Disconnected. Will retry...');
      reconnectAttempts++;
      break;
    case 'error':
      console.error('Connection error!');
      break;
  }
});

// Get current status anytime
const currentStatus = ws.getStatus();
console.log('Current status:', currentStatus);

// Check if connected
if (ws.isConnected()) {
  console.log('Ready to send messages');
}
```

## Error Handling

```typescript
const ws = createWebSocketService();

// Listen for error messages
ws.onMessage((message) => {
  if (message.type === 'error') {
    console.error('WebSocket Error:', {
      error: message.error,
      code: message.code,
      details: message.details,
      timestamp: message.timestamp,
    });

    // Show user-friendly error
    showErrorMessage(message.error);

    // Log for debugging
    logError('WebSocket', message);
  }
});

// Listen for status errors
ws.onStatusChange((status) => {
  if (status === 'error') {
    // Connection failed, show UI indication
    showConnectionError();
  }
});
```

## Custom Configuration

```typescript
// Development configuration
const devWs = createWebSocketService({
  wsUrl: 'ws://localhost:3001',
  reconnectInterval: 2000,
  maxReconnectAttempts: 5,
});

// Production configuration
const prodWs = createWebSocketService({
  wsUrl: 'wss://api.example.com',
  reconnectInterval: 5000,
  maxReconnectAttempts: 15,
  enableMessageQueue: true,
});

// Environment-aware configuration
const ws = createWebSocketService({
  wsUrl: import.meta.env.VITE_WS_URL,
  reconnectInterval: import.meta.env.PROD ? 5000 : 2000,
});
```

## Integration with Auth Service

```typescript
import { createWebSocketService } from './services/websocket';
import { getAccessToken } from './services/auth';

// Ensure token is available before connecting
async function connectWithAuth() {
  const token = await getAccessToken();

  if (!token) {
    console.error('No access token available');
    return;
  }

  // Token is automatically picked up from localStorage
  const ws = createWebSocketService();

  ws.onStatusChange((status) => {
    if (status === 'error') {
      // Token might be expired, refresh and retry
      refreshAuthToken().then(() => {
        ws.connect();
      });
    }
  });

  ws.connect();
}
```

## Testing with Mock WebSocket

```typescript
import { createWebSocketService } from './services/websocket';

// Mock WebSocket for testing
global.WebSocket = class MockWebSocket {
  readyState = 0; // CONNECTING
  url: string;

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen(new Event('open'));
    }, 100);
  }

  send(data: string) {
    // Mock send
  }

  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose(new CloseEvent('close'));
  }
};

// Test service
const ws = createWebSocketService();
ws.connect();

ws.onMessage((message) => {
  console.log('Received:', message);
});

ws.sendMessage('Test message');
```
