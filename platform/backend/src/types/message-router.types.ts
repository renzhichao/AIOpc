/**
 * Message Router Type Definitions
 * Types for message routing between Feishu and OpenClaw instances
 */

/**
 * Message routing request
 */
export interface MessageRouteRequest {
  /** Feishu user ID (sender) */
  feishuUserId: string;
  /** Feishu message ID */
  messageId: string;
  /** Message content */
  content: string;
  /** Message type (text, post, etc.) */
  msgType: string;
  /** Chat ID (group messages) */
  chatId?: string;
  /** Timestamp */
  timestamp: string;
}

/**
 * Message routing response
 */
export interface MessageRouteResponse {
  /** Response content */
  content: string;
  /** Response type */
  msgType: string;
  /** Indicates if response was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Instance message request
 */
export interface InstanceMessageRequest {
  /** Message ID */
  messageId: string;
  /** Message content */
  content: string;
  /** Message type */
  msgType: string;
  /** Sender information */
  sender: {
    /** Feishu user ID */
    feishuUserId: string;
    /** User name */
    name?: string;
  };
  /** Timestamp */
  timestamp: string;
}

/**
 * Instance message response
 */
export interface InstanceMessageResponse {
  /** Response content */
  content: string;
  /** Response type */
  msgType: string;
  /** Processing time in milliseconds */
  processingTime?: number;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Feishu message send request
 */
export interface FeishuMessageSendRequest {
  /** Chat ID or User ID */
  receiveId: string;
  /** Message type */
  msgType: string;
  /** Message content (JSON string) */
  content: string;
  /** Receive ID type (chat, user) */
  receiveIdType?: 'chat' | 'user' | 'email' | 'open_id';
}

/**
 * Feishu message send response
 */
export interface FeishuMessageSendResponse {
  /** Response code */
  code: number;
  /** Response message */
  msg: string;
  /** Message ID */
  data?: {
    /** Message ID */
    msgId: string;
    /** Chat ID */
    chatId: string;
    /** Message creation time */
    createTime: string;
  };
}

/**
 * Routing table entry
 */
export interface RoutingEntry {
  /** Feishu user ID */
  feishuUserId: string;
  /** Instance ID */
  instanceId: string;
  /** Last message timestamp */
  lastMessageAt?: Date;
  /** Message count */
  messageCount: number;
}

/**
 * Message routing options
 */
export interface MessageRoutingOptions {
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Retry attempts (default: 3) */
  retryAttempts?: number;
  /** Enable message logging (default: true) */
  enableLogging?: boolean;
}

/**
 * Message log entry
 */
export interface MessageLogEntry {
  /** Log ID */
  id: string;
  /** Message ID */
  messageId: string;
  /** Instance ID */
  instanceId: string;
  /** Feishu user ID */
  feishuUserId: string;
  /** Message content */
  content: string;
  /** Response content */
  response?: string;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Success status */
  success: boolean;
  /** Error message */
  error?: string;
  /** Timestamp */
  timestamp: Date;
}
