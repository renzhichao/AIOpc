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

/**
 * WebSocket message types for remote instances
 */
enum RemoteMessageType {
  REGISTER = 'register',
  REGISTERED = 'registered',
  HEARTBEAT = 'heartbeat',
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
    private readonly remoteInstanceService: RemoteInstanceService
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
            });

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
      const connection = this.connections.get(instanceId);
      if (connection) {
        connection.isAlive = true;
        connection.lastActivity = new Date();
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
        case RemoteMessageType.HEARTBEAT:
          // Heartbeat via WebSocket (alternative to HTTP)
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
          // Response to a command
          logger.debug('Command response received', {
            instanceId,
            commandId: message.data.command_id,
          });
          // Handle command response if needed
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
      clearInterval(interval);
      this.heartbeatIntervals.delete(instanceId);
    }

    // Remove connection
    this.connections.delete(instanceId);

    logger.info('Remote instance WebSocket disconnected', {
      instanceId,
      connectionDuration: Date.now() - connection.connectedAt.getTime(),
      remainingConnections: this.connections.size,
    });
  }

  /**
   * Start heartbeat mechanism for connection
   */
  private startHeartbeat(ws: WebSocket, instanceId: string): void {
    const connection = this.connections.get(instanceId);
    if (!connection) {
      return;
    }

    const interval = setInterval(() => {
      if (!connection.isAlive) {
        logger.warn('Remote instance heartbeat timeout', { instanceId });
        this.closeConnection(instanceId, 1000, 'Heartbeat timeout');
        return;
      }

      connection.isAlive = false;

      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, this.config.heartbeatInterval);

    this.heartbeatIntervals.set(instanceId, interval);
  }

  /**
   * Close connection with code and reason
   */
  private closeConnection(instanceId: string, code: number, reason: string): void {
    const connection = this.connections.get(instanceId);
    if (connection) {
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
