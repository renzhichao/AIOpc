/**
 * WebSocket Test Helper
 *
 * Provides utilities for testing WebSocket connections and messages
 * including connection management, message waiting, and event handling.
 */

import { WebSocket } from 'ws';
import { EventEmitter } from 'events';

export interface WebSocketTestClient {
  ws: WebSocket;
  messages: any[];
  events: EventEmitter;
  connected: boolean;
  userId?: number;
  instanceId?: string;
}

export class WebSocketHelper {
  /**
   * Create a WebSocket test client with event tracking
   */
  static createClient(wsUrl: string, token?: string): WebSocketTestClient {
    const url = token ? `${wsUrl}?token=${token}` : wsUrl;
    const ws = new WebSocket(url);
    const events = new EventEmitter();
    const messages: any[] = [];
    let connected = false;

    ws.on('open', () => {
      connected = true;
      events.emit('connected');
    });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        messages.push(message);
        events.emit('message', message);
      } catch (error) {
        events.emit('error', error);
      }
    });

    ws.on('error', (error: Error) => {
      events.emit('error', error);
    });

    ws.on('close', () => {
      connected = false;
      events.emit('disconnected');
    });

    ws.on('ping', (data: Buffer) => {
      events.emit('ping', data);
    });

    ws.on('pong', (data: Buffer) => {
      events.emit('pong', data);
    });

    return { ws, messages, events, connected };
  }

  /**
   * Wait for WebSocket connection to open
   */
  static async waitForOpen(
    ws: WebSocket,
    timeout: number = 5000
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error(`Connection timeout after ${timeout}ms`));
      }, timeout);

      ws.once('open', () => {
        clearTimeout(timer);
        resolve();
      });

      ws.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Wait for WebSocket connection to close
   */
  static async waitForClose(
    ws: WebSocket,
    timeout: number = 5000
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error(`Close timeout after ${timeout}ms`));
      }, timeout);

      ws.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * Wait for next message from WebSocket
   */
  static async waitForMessage(
    ws: WebSocket,
    timeout: number = 5000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Message timeout after ${timeout}ms`));
      }, timeout);

      const messageHandler = (data: Buffer) => {
        clearTimeout(timer);
        ws.removeListener('message', messageHandler);
        ws.removeListener('error', errorHandler);

        try {
          resolve(JSON.parse(data.toString()));
        } catch (error) {
          reject(error);
        }
      };

      const errorHandler = (error: Error) => {
        clearTimeout(timer);
        ws.removeListener('message', messageHandler);
        ws.removeListener('error', errorHandler);
        reject(error);
      };

      ws.once('message', messageHandler);
      ws.once('error', errorHandler);
    });
  }

  /**
   * Wait for specific message type
   */
  static async waitForMessageType(
    ws: WebSocket,
    messageType: string,
    timeout: number = 5000
  ): Promise<any> {
    const startTime = Date.now();
    const remainingTimeout = timeout;

    while (Date.now() - startTime < remainingTimeout) {
      try {
        const message = await this.waitForMessage(ws, 1000);
        if (message.type === messageType) {
          return message;
        }
      } catch (error) {
        // Continue waiting
      }
    }

    throw new Error(`No message of type "${messageType}" received within ${timeout}ms`);
  }

  /**
   * Wait for ping message
   */
  static async waitForPing(
    ws: WebSocket,
    timeout: number = 35000
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        ws.removeListener('ping', pingHandler);
        resolve(false);
      }, timeout);

      const pingHandler = () => {
        clearTimeout(timer);
        ws.removeListener('ping', pingHandler);
        resolve(true);
      };

      ws.once('ping', pingHandler);
    });
  }

  /**
   * Wait for pong message
   */
  static async waitForPong(
    ws: WebSocket,
    timeout: number = 5000
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        ws.removeListener('pong', pongHandler);
        resolve(false);
      }, timeout);

      const pongHandler = () => {
        clearTimeout(timer);
        ws.removeListener('pong', pongHandler);
        resolve(true);
      };

      ws.once('pong', pongHandler);
    });
  }

  /**
   * Send message through WebSocket
   */
  static sendMessage(ws: WebSocket, message: any): void {
    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }

    const messageWithTimestamp = {
      ...message,
      timestamp: message.timestamp || new Date().toISOString(),
    };

    ws.send(JSON.stringify(messageWithTimestamp));
  }

  /**
   * Send user message
   */
  static sendUserMessage(ws: WebSocket, content: string, messageId?: string): void {
    this.sendMessage(ws, {
      type: 'user_message',
      content,
      message_id: messageId,
    });
  }

  /**
   * Close WebSocket connection gracefully
   */
  static async closeGracefully(ws: WebSocket): Promise<void> {
    return new Promise((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }

      ws.once('close', () => {
        resolve();
      });

      ws.close();
    });
  }

  /**
   * Get all messages of specific type from client
   */
  static getMessagesByType(client: WebSocketTestClient, messageType: string): any[] {
    return client.messages.filter((msg) => msg.type === messageType);
  }

  /**
   * Get last message of specific type from client
   */
  static getLastMessageByType(client: WebSocketTestClient, messageType: string): any | null {
    const messages = this.getMessagesByType(client, messageType);
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }

  /**
   * Clear all messages from client
   */
  static clearMessages(client: WebSocketTestClient): void {
    client.messages = [];
  }

  /**
   * Count messages of specific type
   */
  static countMessagesByType(client: WebSocketTestClient, messageType: string): number {
    return this.getMessagesByType(client, messageType).length;
  }

  /**
   * Wait for multiple messages
   */
  static async waitForMessages(
    ws: WebSocket,
    count: number,
    timeout: number = 10000
  ): Promise<any[]> {
    const messages: any[] = [];
    const startTime = Date.now();

    while (messages.length < count && Date.now() - startTime < timeout) {
      try {
        const message = await this.waitForMessage(ws, 1000);
        messages.push(message);
      } catch (error) {
        // Continue waiting
      }
    }

    if (messages.length < count) {
      throw new Error(
        `Only received ${messages.length}/${count} messages within ${timeout}ms`
      );
    }

    return messages;
  }

  /**
   * Check if WebSocket is connected
   */
  static isConnected(ws: WebSocket): boolean {
    return ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get WebSocket ready state as string
   */
  static getReadyState(ws: WebSocket): string {
    switch (ws.readyState) {
      case WebSocket.CONNECTING:
        return 'CONNECTING';
      case WebSocket.OPEN:
        return 'OPEN';
      case WebSocket.CLOSING:
        return 'CLOSING';
      case WebSocket.CLOSED:
        return 'CLOSED';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Create multiple concurrent WebSocket clients
   */
  static async createMultipleClients(
    wsUrl: string,
    tokens: string[],
    connectTimeout: number = 5000
  ): Promise<WebSocketTestClient[]> {
    const clients = tokens.map((token) => this.createClient(wsUrl, token));

    // Wait for all clients to connect
    await Promise.all(
      clients.map((client) => this.waitForOpen(client.ws, connectTimeout))
    );

    return clients;
  }

  /**
   * Close multiple WebSocket clients gracefully
   */
  static async closeMultipleClients(clients: WebSocketTestClient[]): Promise<void> {
    await Promise.all(clients.map((client) => this.closeGracefully(client.ws)));
  }
}
