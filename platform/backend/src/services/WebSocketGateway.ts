import { Service, Container } from 'typedi';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { OAuthService } from './OAuthService';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { Instance } from '../entities/Instance.entity';
import { logger } from '../config/logger';
import { MessageQueueService } from './MessageQueueService';
import {
  WebSocketMessage,
  WebSocketConnection,
  WebSocketServerConfig,
  UserMessage,
  AssistantMessage,
  WebSocketCloseCode,
  WebSocketCloseReason,
  createStatusMessage,
  createErrorMessage,
  parseWebSocketMessage,
  isUserMessage,
  isAssistantMessage,
} from '../types/websocket.types';
import { WebSocketMessageRouter } from './WebSocketMessageRouter';

/**
 * WebSocket Gateway Service
 *
 * Manages real-time bidirectional communication between clients and AI instances.
 *
 * Features:
 * - JWT token validation from URL parameter
 * - User instance lookup and connection
 * - Message routing to/from instances
 * - Heartbeat mechanism (30s interval)
 * - Graceful connection cleanup
 *
 * Port: 3001 (configurable via WS_PORT env var)
 *
 * @service
 */
@Service()
export class WebSocketGateway {
  private wss: WebSocketServer | null = null;
  private clients: Map<number, WebSocketConnection> = new Map();
  private heartbeatIntervals: Map<number, NodeJS.Timeout> = new Map();

  private readonly config: WebSocketServerConfig = {
    port: parseInt(process.env.WS_PORT || '3001', 10),
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),
    maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS || '50', 10),
    messageTimeout: parseInt(process.env.WS_MESSAGE_TIMEOUT || '30000', 10),
  };

  constructor(
    private readonly oauthService: OAuthService,
    private readonly instanceRepository: InstanceRepository,
    private readonly messageQueue: MessageQueueService
  ) {}

  /**
   * Get message router from container (lazy loading to avoid circular dependency)
   */
  private getMessageRouter(): WebSocketMessageRouter {
    return Container.get(WebSocketMessageRouter);
  }

  /**
   * Start the WebSocket server
   *
   * @returns Promise that resolves when server is listening
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.config.port });

        this.wss.on('listening', () => {
          logger.info('WebSocket Gateway listening', {
            port: this.config.port,
            heartbeatInterval: this.config.heartbeatInterval,
            maxConnections: this.config.maxConnections,
          });
          resolve();
        });

        this.wss.on('connection', (ws: WebSocket, req: any) => {
          this.handleConnection(ws, req).catch((error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Connection handling failed', { error: errorMessage });
          });
        });

        this.wss.on('error', (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('WebSocket server error', { error: errorMessage });
          reject(error);
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to start WebSocket server', { error: errorMessage });
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    if (this.wss) {
      // Close all client connections
      this.clients.forEach((connection, userId) => {
        this.closeConnection(userId, WebSocketCloseCode.SERVICE_RESTART, 'Server restarting');
      });

      // Clear all heartbeat intervals
      this.heartbeatIntervals.forEach((interval) => {
        clearInterval(interval);
      });
      this.heartbeatIntervals.clear();

      // Close server
      this.wss.close((error) => {
        if (error) {
          logger.error('Error closing WebSocket server', { error: error.message });
        } else {
          logger.info('WebSocket Gateway closed');
        }
      });

      this.wss = null;
    }
  }

  /**
   * Handle new WebSocket connection
   *
   * @param ws - WebSocket instance
   * @param req - HTTP request with URL parameters
   */
  private async handleConnection(ws: WebSocket, req: any): Promise<void> {
    try {
      // Extract token from URL parameter
      const token = this.extractTokenFromUrl(req.url);

      if (!token) {
        this.closeConnection(ws, WebSocketCloseCode.POLICY_VIOLATION, WebSocketCloseReason.INVALID_TOKEN);
        return;
      }

      // Validate JWT token
      let payload;
      try {
        payload = this.oauthService.verifyToken(token);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn('Invalid token', { error: errorMessage });
        this.closeConnection(ws, WebSocketCloseCode.POLICY_VIOLATION, WebSocketCloseReason.INVALID_TOKEN);
        return;
      }

      const { userId } = payload;

      // Check connection limit
      if (this.clients.size >= this.config.maxConnections) {
        logger.warn('Connection limit exceeded', { userId, currentConnections: this.clients.size });
        this.closeConnection(ws, WebSocketCloseCode.TRY_AGAIN_LATER, WebSocketCloseReason.CONNECTION_LIMIT);
        return;
      }

      // Find user's instance
      let instances: Instance[];
      try {
        instances = await this.instanceRepository.findByOwnerId(userId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to find user instance', { userId, error: errorMessage });
        this.closeConnection(ws, WebSocketCloseCode.INTERNAL_ERROR, WebSocketCloseReason.INSTANCE_NOT_FOUND);
        return;
      }

      if (!instances || instances.length === 0) {
        logger.warn('No instance found for user', { userId });
        this.closeConnection(ws, WebSocketCloseCode.POLICY_VIOLATION, WebSocketCloseReason.INSTANCE_NOT_FOUND);
        return;
      }

      // Use the first active instance
      const instance = instances.find((inst) => inst.status === 'active') || instances[0];
      const instanceId = instance.instance_id;

      // Store connection
      const connection: WebSocketConnection = {
        userId,
        instanceId,
        ws,
        isAlive: true,
        connectedAt: new Date(),
        lastActivity: new Date(),
      };

      this.clients.set(userId, connection);

      logger.info('WebSocket connected', {
        userId,
        instanceId,
        totalConnections: this.clients.size,
      });

      // Setup event handlers
      this.setupEventHandlers(ws, userId, instanceId);

      // Start heartbeat
      this.startHeartbeat(ws, userId);

      // Send connected status
      this.sendToClient(userId, createStatusMessage('connected', 'Connected to instance', instanceId));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Connection handling error', { error: errorMessage });
      this.closeConnection(ws, WebSocketCloseCode.INTERNAL_ERROR, WebSocketCloseReason.INTERNAL_ERROR);
    }
  }

  /**
   * Setup WebSocket event handlers
   *
   * @param ws - WebSocket instance
   * @param userId - User ID
   * @param instanceId - Instance ID
   */
  private setupEventHandlers(ws: WebSocket, userId: number, instanceId: string): void {
    // Message handler
    ws.on('message', (data: Buffer) => {
      this.handleMessage(userId, data.toString(), instanceId);
    });

    // Error handler
    ws.on('error', (error: Error) => {
      logger.error('WebSocket error', { userId, instanceId, error: error.message });
    });

    // Close handler
    ws.on('close', (code: number, reason: Buffer) => {
      this.handleDisconnect(userId, ws);
    });

    // Pong handler (for heartbeat)
    ws.on('pong', () => {
      const connection = this.clients.get(userId);
      if (connection) {
        connection.isAlive = true;
        connection.lastActivity = new Date();
      }
    });
  }

  /**
   * Handle incoming message from client
   *
   * @param userId - User ID
   * @param data - Message data as string
   * @param instanceId - Instance ID
   */
  private async handleMessage(userId: number, data: string, instanceId: string): Promise<void> {
    try {
      const connection = this.clients.get(userId);
      if (!connection) {
        logger.warn('Message from unknown connection', { userId });
        return;
      }

      // Update last activity
      connection.lastActivity = new Date();

      // Parse message
      const message = parseWebSocketMessage(data);
      if (!message) {
        logger.warn('Failed to parse message', { userId, data });
        this.sendToClient(userId, createErrorMessage('Invalid message format'));
        return;
      }

      // Handle user messages
      if (isUserMessage(message)) {
        logger.debug('User message received', {
          userId,
          instanceId,
          content: message.content,
        });

        // Route to MessageRouter (TASK-008)
        try {
          const result = await this.getMessageRouter().routeUserMessage(userId, message.content);

          // Send acknowledgment
          this.sendToClient(userId, {
            type: 'status',
            timestamp: new Date().toISOString(),
            status: 'connected',
            message: 'Message routed successfully',
            instance_id: result.instance_id,
          } as any);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Failed to route user message', {
            userId,
            error: errorMessage,
          });

          // Send error message to client
          this.sendToClient(userId, createErrorMessage(`Failed to route message: ${errorMessage}`));
        }
      } else {
        logger.warn('Unsupported message type', { userId, type: message.type });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Message handling error', { userId, error: errorMessage });
      this.sendToClient(userId, createErrorMessage('Failed to process message'));
    }
  }

  /**
   * Send message to client
   *
   * @param userId - User ID
   * @param message - Message to send
   */
  sendToClient(userId: number, message: WebSocketMessage): void {
    const connection = this.clients.get(userId);

    if (!connection) {
      // User not connected via WebSocket - queue message for HTTP polling
      logger.debug('User not connected via WebSocket, queueing message', {
        userId,
        messageType: message.type,
      });
      this.messageQueue.queueMessage(userId, message);
      return;
    }

    try {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(JSON.stringify(message));
        logger.debug('Message sent to client', {
          userId,
          type: message.type,
        });
      } else {
        logger.warn('Connection not open', { userId, readyState: connection.ws.readyState });
        // Queue message for polling
        this.messageQueue.queueMessage(userId, message);
      }
    } catch (error) {
      logger.error('Failed to send message to client', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle client disconnect
   *
   * @param userId - User ID
   * @param ws - WebSocket instance
   */
  private handleDisconnect(userId: number, ws: WebSocket): void {
    const connection = this.clients.get(userId);

    if (!connection) {
      logger.warn('Disconnect for unknown connection', { userId });
      return;
    }

    // Clear heartbeat interval
    const interval = this.heartbeatIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(userId);
    }

    // Remove connection
    this.clients.delete(userId);

    logger.info('WebSocket disconnected', {
      userId,
      instanceId: connection.instanceId,
      connectionDuration: Date.now() - connection.connectedAt.getTime(),
      remainingConnections: this.clients.size,
    });
  }

  /**
   * Start heartbeat mechanism for connection
   *
   * @param ws - WebSocket instance
   * @param userId - User ID
   */
  private startHeartbeat(ws: WebSocket, userId: number): void {
    const connection = this.clients.get(userId);
    if (!connection) {
      return;
    }

    const interval = setInterval(() => {
      if (!connection.isAlive) {
        logger.warn('Heartbeat timeout', { userId });
        this.closeConnection(userId, WebSocketCloseCode.NORMAL_CLOSURE, WebSocketCloseReason.HEARTBEAT_TIMEOUT);
        return;
      }

      connection.isAlive = false;

      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, this.config.heartbeatInterval);

    this.heartbeatIntervals.set(userId, interval);
  }

  /**
   * Close connection with code and reason
   *
   * @param userIdOrWs - User ID or WebSocket instance
   * @param code - Close code
   * @param reason - Close reason
   */
  private closeConnection(userIdOrWs: number | WebSocket, code: number, reason: string): void {
    if (typeof userIdOrWs === 'number') {
      const connection = this.clients.get(userIdOrWs);
      if (connection) {
        this.closeConnection(connection.ws, code, reason);
      }
    } else {
      const ws = userIdOrWs as WebSocket;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(code, reason);
      }
    }
  }

  /**
   * Extract token from URL parameter
   *
   * @param url - Request URL
   * @returns Token string or null
   */
  private extractTokenFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url, 'ws://localhost');
      return parsed.searchParams.get('token');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to parse URL', { url, error: errorMessage });
      return null;
    }
  }

  /**
   * Get connection count
   *
   * @returns Number of active connections
   */
  getConnectionCount(): number {
    return this.clients.size;
  }

  /**
   * Check if user is connected
   *
   * @param userId - User ID
   * @returns True if connected
   */
  isUserConnected(userId: number): boolean {
    return this.clients.has(userId);
  }

  /**
   * Get connection info for user
   *
   * @param userId - User ID
   * @returns Connection info or null
   */
  getConnection(userId: number): WebSocketConnection | null {
    return this.clients.get(userId) || null;
  }

  /**
   * Get all connections
   *
   * @returns Map of all connections
   */
  getAllConnections(): Map<number, WebSocketConnection> {
    return new Map(this.clients);
  }
}
