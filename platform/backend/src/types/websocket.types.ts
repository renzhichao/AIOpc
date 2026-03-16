/**
 * WebSocket Type Definitions
 *
 * Defines message formats and connection types for WebSocket Gateway
 */

/**
 * WebSocket message types
 */
export enum WebSocketMessageType {
  USER_MESSAGE = 'user_message',
  ASSISTANT_MESSAGE = 'assistant_message',
  STATUS = 'status',
  ERROR = 'error',
  PING = 'ping',
  PONG = 'pong',
}

/**
 * Base WebSocket message interface
 */
export interface BaseWebSocketMessage {
  type: WebSocketMessageType;
  timestamp: string;
}

/**
 * User message from client
 */
export interface UserMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.USER_MESSAGE;
  content: string;
  message_id?: string;
  metadata?: Record<string, any>;
}

/**
 * Assistant message from instance
 */
export interface AssistantMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.ASSISTANT_MESSAGE;
  content: string;
  instance_id: string;
  message_id?: string;
  metadata?: Record<string, any>;
}

/**
 * Status message
 */
export interface StatusMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.STATUS;
  status: 'connected' | 'disconnected' | 'error';
  message: string;
  instance_id?: string;
}

/**
 * Error message
 */
export interface ErrorMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.ERROR;
  error: string;
  code?: string;
  details?: Record<string, any>;
}

/**
 * Ping message for heartbeat
 */
export interface PingMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.PING;
}

/**
 * Pong message for heartbeat response
 */
export interface PongMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.PONG;
}

/**
 * Union type of all WebSocket messages
 */
export type WebSocketMessage =
  | UserMessage
  | AssistantMessage
  | StatusMessage
  | ErrorMessage
  | PingMessage
  | PongMessage;

/**
 * WebSocket connection information
 */
export interface WebSocketConnection {
  userId: number;
  instanceId: string;
  ws: any; // WebSocket instance
  isAlive: boolean;
  connectedAt: Date;
  lastActivity: Date;
}

/**
 * WebSocket server configuration
 */
export interface WebSocketServerConfig {
  port: number;
  heartbeatInterval: number;
  maxConnections: number;
  messageTimeout?: number;
}

/**
 * Message routing options
 */
export interface MessageRoutingOptions {
  priority?: 'low' | 'normal' | 'high';
  timeout?: number;
  retries?: number;
}

/**
 * WebSocket close codes
 */
export enum WebSocketCloseCode {
  NORMAL_CLOSURE = 1000,
  GOING_AWAY = 1001,
  PROTOCOL_ERROR = 1002,
  UNSUPPORTED_DATA = 1003,
  NO_STATUS_RECEIVED = 1005,
  ABNORMAL_CLOSURE = 1006,
  POLICY_VIOLATION = 1008,
  MESSAGE_TOO_BIG = 1009,
  INTERNAL_ERROR = 1011,
  SERVICE_RESTART = 1012,
  TRY_AGAIN_LATER = 1013,
}

/**
 * WebSocket close reasons
 */
export const WebSocketCloseReason = {
  INVALID_TOKEN: 'Invalid or expired token',
  INSTANCE_NOT_FOUND: 'No instance found for user',
  CONNECTION_LIMIT: 'Maximum connections exceeded',
  HEARTBEAT_TIMEOUT: 'Heartbeat timeout',
  INTERNAL_ERROR: 'Internal server error',
} as const;

/**
 * Type guard for user messages
 */
export function isUserMessage(msg: any): msg is UserMessage {
  return msg?.type === WebSocketMessageType.USER_MESSAGE;
}

/**
 * Type guard for assistant messages
 */
export function isAssistantMessage(msg: any): msg is AssistantMessage {
  return msg?.type === WebSocketMessageType.ASSISTANT_MESSAGE;
}

/**
 * Type guard for status messages
 */
export function isStatusMessage(msg: any): msg is StatusMessage {
  return msg?.type === WebSocketMessageType.STATUS;
}

/**
 * Type guard for error messages
 */
export function isErrorMessage(msg: any): msg is ErrorMessage {
  return msg?.type === WebSocketMessageType.ERROR;
}

/**
 * Parse WebSocket message from JSON
 */
export function parseWebSocketMessage(data: string): WebSocketMessage | null {
  try {
    const message = JSON.parse(data);

    // Validate required fields
    if (!message.type || !message.timestamp) {
      return null;
    }

    return message as WebSocketMessage;
  } catch (error) {
    return null;
  }
}

/**
 * Create status message
 */
export function createStatusMessage(
  status: 'connected' | 'disconnected' | 'error',
  message: string,
  instanceId?: string
): StatusMessage {
  return {
    type: WebSocketMessageType.STATUS,
    timestamp: new Date().toISOString(),
    status,
    message,
    instance_id: instanceId,
  };
}

/**
 * Create error message
 */
export function createErrorMessage(
  error: string,
  code?: string,
  details?: Record<string, any>
): ErrorMessage {
  return {
    type: WebSocketMessageType.ERROR,
    timestamp: new Date().toISOString(),
    error,
    code,
    details,
  };
}
