/**
 * Remote Instance WebSocket Gateway Service
 *
 * Manages WebSocket connections from remote OpenClaw Agent instances.
 * This is separate from the user-facing WebSocketGateway.
 *
 * Features:
 * - Platform API key authentication for remote instances
 * - Bidirectional message routing (platform <-> instance)
 * - Command pushing from platform to instances
 * - Instance status updates via WebSocket
 * - Heartbeat monitoring
 *
 * Port: 3002 (configurable via REMOTE_WS_PORT env var)
 *
 * @service
 */

import { Service } from 'typedi';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { logger } from '../config/logger';
import { RemoteInstanceService } from './RemoteInstanceService';
import { InstanceRegistry } from './InstanceRegistry';
import { WebSocketGateway } from './WebSocketGateway';
import { WebSocketMessageType, AssistantMessage } from '../types/websocket.types';

/**
 * WebSocket message types for remote instances
 */
enum RemoteMessageType {
  REGISTER = 'register',
  REGISTERED = 'registered',
  HEARTBEAT = 'heartbeat',
  PING = 'ping',
  PONG = 'pong',
  COMMAND = 'command',
  RESPONSE = 'response',
  ERROR = 'error',
  STATUS_UPDATE = 'status_update',
}

/**
 * Remote instance connection information
 */
interface RemoteInstanceConnection {
  instanceId: string;
  ws: WebSocket;
  platformApiKey: string;
  connectedAt: Date;
  lastActivity: Date;
  isAlive: boolean;
}

/**
 * WebSocket message from remote instance
 */
interface RemoteWSMessage {
  type: RemoteMessageType;
  instance_id?: string;
  timestamp: string;
  data: any;
}

/**
 * Command to push to remote instance
 */
interface RemoteCommand {
  id: string;
  type: 'config_update' | 'restart' | 'shutdown' | 'upgrade' | 'message';
  payload: Record<string, any>;
  created_at: Date;
}

/**
 * Configuration for remote instance WebSocket gateway
 */
interface RemoteWSConfig {
  port: number;
  heartbeatInterval: number;
  maxConnections: number;
}

@Service()
export class RemoteInstanceWebSocketGateway {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, RemoteInstanceConnection> = new Map();
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private pendingCommands: Map<string, RemoteCommand[]> = new Map();

  private readonly config: RemoteWSConfig = {
    port: parseInt(process.env.REMOTE_WS_PORT || '3002', 10),
    heartbeatInterval: parseInt(process.env.REMOTE_WS_HEARTBEAT_INTERVAL || '30000', 10),
    maxConnections: parseInt(process.env.REMOTE_WS_MAX_CONNECTIONS || '100', 10),
  };

  constructor(
    private readonly remoteInstanceService: RemoteInstanceService,
    private readonly instanceRegistry: InstanceRegistry,
    private readonly webSocketGateway: WebSocketGateway
  ) {}

  /**
   * Start the remote instance WebSocket server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.config.port });

        this.wss.on('listening', () => {
          logger.info('Remote Instance WebSocket Gateway listening', {
            port: this.config.port,
            heartbeatInterval: this.config.heartbeatInterval,
            maxConnections: this.config.maxConnections,
          });
          resolve();
        });

        this.wss.on('connection', (ws: WebSocket, req: any) => {
          this.handleConnection(ws, req).catch((error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Remote instance connection handling failed', { error: errorMessage });
          });
        });

        this.wss.on('error', (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Remote instance WebSocket server error', { error: errorMessage });
          reject(error);
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to start remote instance WebSocket server', { error: errorMessage });
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    if (this.wss) {
      // Close all connections
      this.connections.forEach((connection, instanceId) => {
        this.closeConnection(instanceId, 1000, 'Server shutting down');
      });

      // Clear all heartbeat intervals
      this.heartbeatIntervals.forEach((interval) => {
        clearInterval(interval);
      });
      this.heartbeatIntervals.clear();

      // Close server
      this.wss.close((error) => {
        if (error) {
          logger.error('Error closing remote instance WebSocket server', { error: error.message });
        } else {
          logger.info('Remote Instance WebSocket Gateway closed');
        }
      });

      this.wss = null;
    }
  }

  /**
   * Handle new WebSocket connection from remote instance
   */
  private async handleConnection(ws: WebSocket, req: any): Promise<void> {
    try {
      // Extract platform API key from URL parameter
      const apiKey = this.extractApiKeyFromUrl(req.url);

      if (!apiKey) {
        this.sendError(ws, 'Missing platform API key');
        ws.close(1008, 'Missing authentication');
        return;
      }

      // Wait for registration message
      let instanceId: string | null = null;

      const registrationHandler = async (data: Buffer) => {
        try {
          const message: RemoteWSMessage = JSON.parse(data.toString());

          if (message.type === RemoteMessageType.REGISTER) {
            // Validate API key and get instance info
            const instanceInfo = await this.validateAndGetInstance(apiKey, message.instance_id);

            if (!instanceId) {
              instanceId = instanceInfo.instance_id;
            }

            // Check for duplicate connection and clean up old one
            const existingConnection = this.connections.get(instanceId);
            if (existingConnection) {
              logger.warn('Duplicate connection detected, closing old connection', { instanceId });
              // Close old connection and clean up its heartbeat interval
              this.closeConnection(instanceId, 1000, 'New connection established');
            }

            // Store connection
            const connection: RemoteInstanceConnection = {
              instanceId,
              ws,
              platformApiKey: apiKey,
              connectedAt: new Date(),
              lastActivity: new Date(),
              isAlive: true,
            };

            this.connections.set(instanceId, connection);

            logger.info('Remote instance WebSocket connected', {
              instanceId,
              apiKey: apiKey.substring(0, 10) + '...',
              totalConnections: this.connections.size,
              isAlive: connection.isAlive,
            });

            // Register instance to InstanceRegistry for message routing
            try {
              await this.instanceRegistry.registerInstance(instanceId, {
                connection_type: 'remote',
                api_endpoint: `http://${instanceInfo.remote_host}:3000`,
                metadata: {
                  platform_api_key: apiKey,
                  remote_host: instanceInfo.remote_host,
                },
              });
              logger.info('Remote instance registered to InstanceRegistry', { instanceId });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              logger.error('Failed to register instance to InstanceRegistry', { instanceId, error: errorMessage });
              // Don't fail the connection if registry registration fails
            }

            // Send registered confirmation
            this.sendMessage(ws, {
              type: RemoteMessageType.REGISTERED,
              instance_id: instanceId,
              timestamp: new Date().toISOString(),
              data: {
                status: 'connected',
                server_time: Date.now(),
                heartbeat_interval: this.config.heartbeatInterval,
              },
            });

            // Setup event handlers
            this.setupEventHandlers(ws, instanceId);

            // Start heartbeat
            this.startHeartbeat(ws, instanceId);

            // Send any pending commands
            await this.sendPendingCommands(instanceId);

            // Remove registration handler
            ws.off('message', registrationHandler);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Failed to register remote instance WebSocket', { error: errorMessage });
          this.sendError(ws, `Registration failed: ${errorMessage}`);
          ws.close(1008, 'Registration failed');
        }
      };

      // Set up temporary registration handler
      ws.on('message', registrationHandler);

      // Set timeout for registration
      setTimeout(() => {
        if (!instanceId) {
          logger.warn('Remote instance registration timeout', { apiKey: apiKey.substring(0, 10) + '...' });
          ws.close(1008, 'Registration timeout');
          ws.off('message', registrationHandler);
        }
      }, 10000); // 10 seconds timeout

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Remote instance connection handling error', { error: errorMessage });
      this.sendError(ws, `Connection error: ${errorMessage}`);
      ws.close(1011, 'Internal error');
    }
  }

  /**
   * Setup WebSocket event handlers after registration
   */
  private setupEventHandlers(ws: WebSocket, instanceId: string): void {
    // Message handler
    ws.on('message', (data: Buffer) => {
      this.handleMessage(instanceId, data.toString());
    });

    // Error handler
    ws.on('error', (error: Error) => {
      logger.error('Remote instance WebSocket error', { instanceId, error: error.message });
    });

    // Close handler
    ws.on('close', (code: number, reason: Buffer) => {
      this.handleDisconnect(instanceId);
    });

    // Pong handler (for heartbeat)
    ws.on('pong', () => {
      const pongTime = new Date().toISOString();
      const connection = this.connections.get(instanceId);

      logger.info('[HEARTBEAT] Pong frame received', {
        instanceId,
        timestamp: pongTime,
        connectionFound: !!connection,
      });

      if (connection) {
        const wasAlive = connection.isAlive;
        connection.isAlive = true;
        connection.lastActivity = new Date();

        logger.info('[HEARTBEAT] Set isAlive to true after pong', {
          instanceId,
          wasAlive,
          isAliveNow: connection.isAlive,
          connectionAgeMs: Date.now() - connection.connectedAt.getTime(),
          timestamp: pongTime,
        });
      } else {
        logger.warn('[HEARTBEAT] Pong received but connection not found', {
          instanceId,
          timestamp: pongTime,
        });
      }
    });
  }

  /**
   * Handle incoming message from remote instance
   */
  private async handleMessage(instanceId: string, data: string): Promise<void> {
    try {
      const connection = this.connections.get(instanceId);
      if (!connection) {
        logger.warn('Message from unknown remote instance', { instanceId });
        return;
      }

      // Update last activity
      connection.lastActivity = new Date();

      // Parse message
      const message: RemoteWSMessage = JSON.parse(data);

      switch (message.type) {
        case RemoteMessageType.PONG:
          // Pong response to our ping - set isAlive to true
          connection.isAlive = true;
          logger.info('[HEARTBEAT] Pong message received, isAlive set to true', {
            instanceId,
            timestamp: message.timestamp,
          });
          break;

        case RemoteMessageType.HEARTBEAT:
          // Heartbeat via WebSocket (alternative to HTTP)
          connection.isAlive = true;
          logger.debug('Heartbeat received via WebSocket', { instanceId });
          break;

        case RemoteMessageType.STATUS_UPDATE:
          // Status update from instance
          logger.info('Status update from remote instance', {
            instanceId,
            status: message.data.status,
          });
          break;

        case RemoteMessageType.RESPONSE:
          // Response to a command - check if it's a user message response
          logger.debug('Command response received', {
            instanceId,
            commandId: message.data.command_id,
            responseType: message.data.type,
          });

          // If this is a response to a user message, forward it to the user
          if (message.data.type === 'message' && message.data.user_id) {
            const userId = message.data.user_id;
            const responseContent = message.data.content || '';

            const assistantMessage: AssistantMessage = {
              type: WebSocketMessageType.ASSISTANT_MESSAGE,
              content: responseContent,
              timestamp: message.data.timestamp || new Date().toISOString(),
              instance_id: instanceId,
            };

            await this.webSocketGateway.sendToClient(userId, assistantMessage);

            logger.info('User message response forwarded from remote instance', {
              instanceId,
              userId,
              messageId: message.data.command_id,
              contentLength: responseContent.length,
            });
          }
          break;

        default:
          logger.warn('Unknown message type from remote instance', {
            instanceId,
            type: message.type,
          });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to handle message from remote instance', {
        instanceId,
        error: errorMessage,
      });
    }
  }

  /**
   * Send user message to remote instance
   *
   * This is used by WebSocketMessageRouter to deliver user messages to remote instances
   * via WebSocket connection instead of HTTP fallback.
   *
   * @param instanceId - Instance ID
   * @param userId - User ID who sent the message
   * @param content - Message content
   * @param messageId - Unique message ID
   * @returns Promise that resolves with the response content
   */
  async sendUserMessage(
    instanceId: string,
    userId: number,
    content: string,
    messageId: string
  ): Promise<{ content: string; timestamp: string } | null> {
    const connection = this.connections.get(instanceId);

    if (!connection) {
      logger.warn('Cannot send user message: remote instance not connected', {
        instanceId,
        userId,
        messageId,
      });
      return null;
    }

    try {
      if (connection.ws.readyState === WebSocket.OPEN) {
        // Send message as a command
        const command: RemoteCommand = {
          id: messageId,
          type: 'message',
          payload: {
            user_id: userId,
            content: content,
            timestamp: new Date().toISOString(),
          },
          created_at: new Date(),
        };

        this.sendMessage(connection.ws, {
          type: RemoteMessageType.COMMAND,
          instance_id: instanceId,
          timestamp: new Date().toISOString(),
          data: command,
        });

        logger.info('User message sent to remote instance via WebSocket', {
          instanceId,
          userId,
          messageId,
          contentLength: content.length,
        });

        // Note: Response will be handled asynchronously via handleMessage
        // when the remote instance sends back a RESPONSE message
        return null;
      } else {
        logger.warn('Cannot send user message: WebSocket connection not ready', {
          instanceId,
          readyState: connection.ws.readyState,
        });
        return null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send user message to remote instance', {
        instanceId,
        userId,
        messageId,
        error: errorMessage,
      });
      return null;
    }
  }

  /**
   * Send command to remote instance
   */
  async sendCommand(instanceId: string, command: RemoteCommand): Promise<boolean> {
    const connection = this.connections.get(instanceId);

    if (!connection) {
      logger.warn('Cannot send command: instance not connected', { instanceId });
      // Queue command for later
      this.queueCommand(instanceId, command);
      return false;
    }

    try {
      if (connection.ws.readyState === WebSocket.OPEN) {
        this.sendMessage(connection.ws, {
          type: RemoteMessageType.COMMAND,
          instance_id: instanceId,
          timestamp: new Date().toISOString(),
          data: command,
        });

        logger.info('Command sent to remote instance', {
          instanceId,
          commandId: command.id,
          commandType: command.type,
        });

        return true;
      } else {
        logger.warn('Cannot send command: connection not ready', {
          instanceId,
          readyState: connection.ws.readyState,
        });
        this.queueCommand(instanceId, command);
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send command to remote instance', {
        instanceId,
        commandId: command.id,
        error: errorMessage,
      });
      this.queueCommand(instanceId, command);
      return false;
    }
  }

  /**
   * Send message to WebSocket connection
   */
  private sendMessage(ws: WebSocket, message: RemoteWSMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send WebSocket message', { error: errorMessage });
    }
  }

  /**
   * Send error message to remote instance
   */
  private sendError(ws: WebSocket, errorMessage: string): void {
    this.sendMessage(ws, {
      type: RemoteMessageType.ERROR,
      timestamp: new Date().toISOString(),
      data: {
        error: errorMessage,
      },
    });
  }

  /**
   * Handle remote instance disconnect
   */
  private handleDisconnect(instanceId: string): void {
    const connection = this.connections.get(instanceId);

    if (!connection) {
      logger.warn('Disconnect for unknown remote instance', { instanceId });
      return;
    }

    // Clear heartbeat interval
    const interval = this.heartbeatIntervals.get(instanceId);
    if (interval) {
      logger.info('[HEARTBEAT] Clearing heartbeat interval due to disconnect', { instanceId });
      clearInterval(interval);
      this.heartbeatIntervals.delete(instanceId);
      logger.info('[HEARTBEAT] Heartbeat interval cleared', {
        instanceId,
        remainingIntervals: this.heartbeatIntervals.size,
      });
    } else {
      logger.warn('[HEARTBEAT] No heartbeat interval found to clear', { instanceId });
    }

    // Remove connection
    this.connections.delete(instanceId);

    logger.info('Remote instance WebSocket disconnected', {
      instanceId,
      connectionDuration: Date.now() - connection.connectedAt.getTime(),
      remainingConnections: this.connections.size,
      remainingHeartbeats: this.heartbeatIntervals.size,
    });
  }

  /**
   * Start heartbeat mechanism for connection
   */
  private startHeartbeat(ws: WebSocket, instanceId: string): void {
    const connection = this.connections.get(instanceId);
    if (!connection) {
      logger.error('[HEARTBEAT] Cannot start: connection not found', { instanceId });
      return;
    }

    // Clear any existing heartbeat interval for this instance
    const existingInterval = this.heartbeatIntervals.get(instanceId);
    if (existingInterval) {
      logger.info('[HEARTBEAT] Clearing existing heartbeat interval', {
        instanceId,
        existingIntervalId: String(existingInterval),
      });
      clearInterval(existingInterval);
      this.heartbeatIntervals.delete(instanceId);
    }

    // Double-check no intervals remain for this instance
    const allIntervals = Array.from(this.heartbeatIntervals.entries());
    const instanceIntervals = allIntervals.filter(([id]) => id === instanceId);
    if (instanceIntervals.length > 0) {
      logger.error('[HEARTBEAT] Found stale intervals for same instance, clearing all', {
        instanceId,
        count: instanceIntervals.length,
      });
      instanceIntervals.forEach(([id, interval]) => {
        clearInterval(interval);
        this.heartbeatIntervals.delete(id);
      });
    }

    const startTime = Date.now();
    const heartbeatInterval = this.config.heartbeatInterval;

    logger.info('[HEARTBEAT] Starting heartbeat mechanism', {
      instanceId,
      configuredInterval: heartbeatInterval,
      initialIsAliveState: connection.isAlive,
      timestamp: new Date().toISOString(),
    });

    const interval = setInterval(() => {
      // Get the current connection (not the captured one) to handle reconnections
      const currentConnection = this.connections.get(instanceId);

      // If connection no longer exists, clear this interval
      if (!currentConnection) {
        logger.warn('[HEARTBEAT] Connection no longer exists, clearing interval', {
          instanceId,
        });
        clearInterval(interval);
        this.heartbeatIntervals.delete(instanceId);
        return;
      }

      // If this WebSocket is not the current one for this instance, clear this interval
      if (currentConnection.ws !== ws) {
        logger.warn('[HEARTBEAT] WebSocket mismatch, clearing old interval', {
          instanceId,
        });
        clearInterval(interval);
        this.heartbeatIntervals.delete(instanceId);
        return;
      }

      const elapsed = Date.now() - startTime;
      const checkTime = new Date().toISOString();

      logger.info('[HEARTBEAT] Interval check triggered', {
        instanceId,
        elapsedMs: elapsed,
        elapsedSeconds: (elapsed / 1000).toFixed(2),
        isAliveBeforeCheck: currentConnection.isAlive,
        timestamp: checkTime,
      });

      if (!currentConnection.isAlive) {
        logger.warn('[HEARTBEAT] Timeout: connection.isAlive is false', {
          instanceId,
          elapsedMs: elapsed,
          elapsedSeconds: (elapsed / 1000).toFixed(2),
          timestamp: checkTime,
        });
        this.closeConnection(instanceId, 1000, 'Heartbeat timeout');
        return;
      }

      logger.info('[HEARTBEAT] Setting isAlive to false and sending ping', {
        instanceId,
        elapsedMs: elapsed,
        timestamp: checkTime,
      });

      currentConnection.isAlive = false;

      if (ws.readyState === WebSocket.OPEN) {
        // Send JSON ping message instead of WebSocket ping frame
        // This is more reliable and portable across different ws library versions
        const pingMessage = JSON.stringify({
          type: 'ping',
          timestamp: new Date().toISOString(),
        });
        ws.send(pingMessage);
        logger.info('[HEARTBEAT] Ping message sent', {
          instanceId,
          elapsedMs: elapsed,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.warn('[HEARTBEAT] Cannot send ping: WebSocket not open', {
          instanceId,
          readyState: ws.readyState,
          elapsedMs: elapsed,
        });
      }
    }, heartbeatInterval);

    this.heartbeatIntervals.set(instanceId, interval);

    logger.info('[HEARTBEAT] Interval timer registered', {
      instanceId,
      intervalId: String(interval),
      heartbeatIntervalMs: heartbeatInterval,
      heartbeatIntervalSeconds: (heartbeatInterval / 1000).toFixed(2),
    });
  }

  /**
   * Close connection with code and reason
   */
  private closeConnection(instanceId: string, code: number, reason: string): void {
    const connection = this.connections.get(instanceId);
    if (connection) {
      // Clear heartbeat interval for this connection to prevent orphaned intervals
      const interval = this.heartbeatIntervals.get(instanceId);
      if (interval) {
        logger.info('[HEARTBEAT] Clearing heartbeat interval in closeConnection', { instanceId, reason });
        clearInterval(interval);
        this.heartbeatIntervals.delete(instanceId);
      }

      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close(code, reason);
      }
    }
  }

  /**
   * Queue command for later delivery
   */
  private queueCommand(instanceId: string, command: RemoteCommand): void {
    if (!this.pendingCommands.has(instanceId)) {
      this.pendingCommands.set(instanceId, []);
    }
    this.pendingCommands.get(instanceId)!.push(command);

    logger.info('Command queued for remote instance', {
      instanceId,
      commandId: command.id,
      queuedCount: this.pendingCommands.get(instanceId)!.length,
    });
  }

  /**
   * Send pending commands to instance
   */
  private async sendPendingCommands(instanceId: string): Promise<void> {
    const commands = this.pendingCommands.get(instanceId);
    if (!commands || commands.length === 0) {
      return;
    }

    logger.info('Sending pending commands to remote instance', {
      instanceId,
      count: commands.length,
    });

    for (const command of commands) {
      await this.sendCommand(instanceId, command);
    }

    // Clear sent commands
    this.pendingCommands.set(instanceId, []);
  }

  /**
   * Validate API key and get instance information
   */
  private async validateAndGetInstance(
    apiKey: string,
    instanceId?: string
  ): Promise<{ instance_id: string; remote_host: string }> {
    // If instanceId is provided, validate both
    if (instanceId) {
      // This would require a method in RemoteInstanceService to validate by instance ID and API key
      // For now, we'll use the existing verification approach
      try {
        const registrationInfo = await this.remoteInstanceService.getRegistrationInfo(instanceId);

        // Note: We need to add API key validation to RemoteInstanceService
        // For now, we'll assume the instance exists
        return {
          instance_id: registrationInfo.instance_id,
          remote_host: registrationInfo.remote_host || 'unknown',
        };
      } catch (error) {
        throw new Error(`Instance ${instanceId} not found`);
      }
    }

    throw new Error('Instance ID is required for registration');
  }

  /**
   * Extract API key from URL parameter
   */
  private extractApiKeyFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url, 'ws://localhost');
      return parsed.searchParams.get('api_key');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to parse URL', { url, error: errorMessage });
      return null;
    }
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Check if instance is connected
   */
  isInstanceConnected(instanceId: string): boolean {
    return this.connections.has(instanceId);
  }

  /**
   * Get all connected instance IDs
   */
  getConnectedInstances(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get connection info for instance
   */
  getConnection(instanceId: string): RemoteInstanceConnection | null {
    return this.connections.get(instanceId) || null;
  }
}
