/**
 * Docker Container Configuration Types
 * Defines all types related to Docker container management
 */

/**
 * Container status information
 */
export interface ContainerStatus {
  /** Container ID */
  id: string;
  /** Container name */
  name: string;
  /** Container state: running, exited, paused, restarting, dead */
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'dead';
  /** Container status */
  status: string;
  /** Whether container is running */
  isRunning: boolean;
  /** Whether container is paused */
  isPaused: boolean;
  /** Whether container is restarting */
  isRestarting: boolean;
  /** Container creation time */
  created: Date;
  /** Container start time (if running) */
  started?: Date;
}

/**
 * Container resource usage statistics
 */
export interface ContainerStats {
  /** Container ID */
  id: string;
  /** Container name */
  name: string;
  /** CPU usage percentage (0-100) */
  cpuPercent: number;
  /** Memory usage in bytes */
  memoryUsage: number;
  /** Memory limit in bytes */
  memoryLimit: number;
  /** Memory usage percentage (0-100) */
  memoryPercent: number;
  /** Network RX bytes */
  networkRX?: number;
  /** Network TX bytes */
  networkTX?: number;
  /** Block read bytes */
  blockRead?: number;
  /** Block write bytes */
  blockWrite?: number;
  /** Timestamp of stats */
  timestamp: Date;
}

/**
 * Container health check result
 */
export interface HealthStatus {
  /** Health status: healthy, unhealthy, unknown */
  status: 'healthy' | 'unhealthy' | 'unknown';
  /** Reason for current status */
  reason?: string;
  /** Container status */
  containerStatus?: ContainerStatus;
  /** CPU usage percentage */
  cpuUsage?: number;
  /** Memory usage percentage */
  memoryUsage?: number;
  /** Container uptime in seconds */
  uptime?: number;
  /** Last check timestamp */
  lastCheck: Date;
}

/**
 * Instance configuration for container creation
 */
export interface InstanceConfig {
  /** DeepSeek API key for LLM access */
  apiKey: string;
  /** Feishu App ID for integration */
  feishuAppId: string;
  /** Feishu App Secret for integration */
  feishuAppSecret?: string;
  /** Enabled skills for the instance */
  skills: string[];
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Temperature for LLM (0-1) */
  temperature?: number;
  /** Maximum tokens for LLM */
  maxTokens?: number;
  /** Instance template type */
  template?: 'personal' | 'team' | 'enterprise';
}

/**
 * Docker resource limits configuration
 */
export interface ResourceLimits {
  /** Memory limit in bytes (default: 1GB) */
  memoryLimit: number;
  /** CPU quota in nanoseconds (0.5 = 500,000,000) */
  cpuQuota: number;
  /** CPU period in microseconds (default: 100,000) */
  cpuPeriod: number;
  /** CPU shares (relative weight) */
  cpuShares?: number;
}

/**
 * Docker volume configuration
 */
export interface VolumeConfig {
  /** Volume name */
  name: string;
  /** Container mount path */
  mountPath: string;
  /** Whether volume is read-only */
  readOnly?: boolean;
}

/**
 * Docker network configuration
 */
export interface NetworkConfig {
  /** Network name */
  name: string;
  /** Network driver: bridge, overlay, macvlan, etc. */
  driver: 'bridge' | 'overlay' | 'macvlan' | 'host' | 'none';
  /** Network subnet (CIDR) */
  subnet?: string;
  /** Network gateway */
  gateway?: string;
}

/**
 * Container creation options
 */
export interface ContainerCreateOptions {
  /** Container name */
  name: string;
  /** Docker image name */
  image: string;
  /** Environment variables */
  env: Record<string, string>;
  /** Resource limits */
  resources: ResourceLimits;
  /** Volume configurations */
  volumes?: VolumeConfig[];
  /** Network configuration */
  network?: NetworkConfig;
  /** Port mappings (host:container) */
  ports?: Record<string, string>;
  /** Restart policy: no, on-failure, always, unless-stopped */
  restartPolicy?: 'no' | 'on-failure' | 'always' | 'unless-stopped';
  /** Maximum retry count for restart policy */
  maximumRetryCount?: number;
  /** Whether root filesystem is read-only */
  readonlyRootfs?: boolean;
}

/**
 * Container log options
 */
export interface LogOptions {
  /** Number of lines to tail (default: 100) */
  tail?: number;
  /** Whether to follow logs */
  follow?: boolean;
  /** Include timestamps */
  timestamps?: boolean;
  /** Since timestamp (Unix timestamp) */
  since?: number;
}

/**
 * Container log entry
 */
export interface LogEntry {
  /** Log message */
  message: string;
  /** Timestamp */
  timestamp: Date;
  /** Container ID */
  containerId: string;
  /** Container name */
  containerName: string;
}
