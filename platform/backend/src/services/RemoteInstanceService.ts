/**
 * Remote Instance Registration Service
 *
 * Manages the registration and lifecycle of remote OpenClaw Agent instances.
 * Remote instances are self-hosted agents that register with the platform
 * for unified management and user interaction.
 *
 * Key responsibilities:
 * - Instance registration and authentication
 * - Heartbeat monitoring and health checks
 * - API key management for remote instances
 * - Connection lifecycle management
 */

import { Service } from 'typedi';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { Instance } from '../entities/Instance.entity';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors/AppError';
import { ErrorCodes } from '../utils/errors/ErrorCodes';
import { randomBytes } from 'crypto';

/**
 * Remote instance registration request
 */
export interface RemoteInstanceRegistrationRequest {
  deployment_type: 'remote';
  hostname: string;
  port: number;
  version: string;
  capabilities: string[];
  metadata?: Record<string, any>;
}

/**
 * Registration response
 */
export interface RemoteInstanceRegistrationResponse {
  instance_id: string;
  platform_api_key: string;
  heartbeat_interval: number;
  websocket_url: string;
  registered_at: Date;
  platform_url: string;
}

/**
 * Heartbeat request
 */
export interface HeartbeatRequest {
  timestamp: number;
  status: 'online' | 'busy' | 'maintenance';
  metrics: {
    cpu_usage: number;
    memory_usage: number;
    active_sessions: number;
    messages_processed: number;
  };
}

/**
 * Heartbeat response
 */
export interface HeartbeatResponse {
  status: 'ok' | 'error';
  server_time: number;
  next_heartbeat: number;
  commands: RemoteCommand[];
}

/**
 * Remote command to be executed by instance
 */
export interface RemoteCommand {
  id: string;
  type: 'config_update' | 'restart' | 'shutdown' | 'upgrade';
  payload: Record<string, any>;
  created_at: Date;
}

/**
 * Instance registration info
 */
export interface InstanceRegistrationInfo {
  instance_id: string;
  deployment_type: 'local' | 'remote';
  status: string;
  registered_at: Date;
  last_heartbeat_at: Date | null;
  remote_host?: string;
  remote_port?: number;
}

@Service()
export class RemoteInstanceService {
  private readonly HEARTBEAT_TIMEOUT = 90000; // 90 seconds
  private readonly DEFAULT_HEARTBEAT_INTERVAL = 30000; // 30 seconds

  constructor(
    private readonly instanceRepository: InstanceRepository
  ) {}

  /**
   * Register a new remote instance
   *
   * @param registrationRequest - Registration data from remote agent
   * @returns Registration response with credentials
   */
  async registerInstance(
    registrationRequest: RemoteInstanceRegistrationRequest
  ): Promise<RemoteInstanceRegistrationResponse> {
    try {
      logger.info('Remote instance registration request', {
        hostname: registrationRequest.hostname,
        port: registrationRequest.port,
        version: registrationRequest.version,
        capabilities: registrationRequest.capabilities
      });

      // 1. Validate request
      this.validateRegistrationRequest(registrationRequest);

      // 2. Generate unique instance ID
      const instanceId = this.generateInstanceId();

      // 3. Generate platform API key for this instance
      const platformApiKey = this.generatePlatformApiKey();

      // 4. Determine platform URL from environment
      const platformUrl = process.env.PLATFORM_URL || 'http://118.25.0.190';
      const websocketUrl = process.env.WEBSOCKET_URL || 'ws://118.25.0.190:3001';

      // 5. Create instance record
      const instance = await this.instanceRepository.create({
        instance_id: instanceId,
        deployment_type: 'remote',
        status: 'active', // Remote instances are active immediately upon registration
        template: undefined,
        name: `Remote Instance (${registrationRequest.hostname})`,
        config: {
          type: 'remote',
          version: registrationRequest.version,
          capabilities: registrationRequest.capabilities
        },
        expires_at: undefined, // Remote instances don't expire
        owner_id: undefined, // Not claimed yet
        claimed_at: undefined,
        docker_container_id: undefined, // Remote instances don't have Docker containers
        restart_attempts: 0,
        health_status: 'healthy',
        health_reason: 'Registered and active',
        health_last_checked: new Date(),
        // Remote instance specific fields
        remote_host: registrationRequest.hostname,
        remote_port: registrationRequest.port,
        remote_version: registrationRequest.version,
        platform_api_key: platformApiKey,
        last_heartbeat_at: new Date(),
        heartbeat_interval: this.DEFAULT_HEARTBEAT_INTERVAL,
        capabilities: registrationRequest.capabilities.join(','),
        remote_metadata: registrationRequest.metadata || {}
      });

      logger.info('Remote instance registered successfully', {
        instance_id: instanceId,
        hostname: registrationRequest.hostname,
        platform_api_key: platformApiKey.substring(0, 10) + '...'
      });

      // 6. Return registration response
      return {
        instance_id: instanceId,
        platform_api_key: platformApiKey,
        heartbeat_interval: this.DEFAULT_HEARTBEAT_INTERVAL,
        websocket_url: websocketUrl,
        registered_at: instance.created_at,
        platform_url: platformUrl
      };
    } catch (error) {
      logger.error('Failed to register remote instance', {
        error: error instanceof Error ? error.message : String(error),
        hostname: registrationRequest.hostname
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to register remote instance'
      );
    }
  }

  /**
   * Process heartbeat from remote instance
   *
   * @param instanceId - Instance ID
   * @param platformApiKey - API key for authentication
   * @param heartbeat - Heartbeat data
   * @returns Heartbeat response with commands
   */
  async processHeartbeat(
    instanceId: string,
    platformApiKey: string,
    heartbeat: HeartbeatRequest
  ): Promise<HeartbeatResponse> {
    try {
      // 1. Validate API key
      const instance = await this.validateInstanceApiKey(instanceId, platformApiKey);

      // 2. Update heartbeat timestamp
      await this.instanceRepository.updateByInstanceId(instanceId, {
        last_heartbeat_at: new Date(),
        health_last_checked: new Date(),
        updated_at: new Date()
      });

      // 3. Update health status based on heartbeat
      const healthStatus = this.determineHealthStatus(heartbeat);
      await this.instanceRepository.updateByInstanceId(instanceId, {
        health_status: healthStatus,
        health_reason: `Heartbeat received: ${heartbeat.status}`,
        updated_at: new Date()
      });

      // 4. Log heartbeat metrics
      logger.debug('Heartbeat received', {
        instance_id: instanceId,
        status: heartbeat.status,
        cpu_usage: heartbeat.metrics.cpu_usage,
        memory_usage: heartbeat.metrics.memory_usage,
        active_sessions: heartbeat.metrics.active_sessions
      });

      // 5. Return response with commands (empty for now)
      return {
        status: 'ok',
        server_time: Date.now(),
        next_heartbeat: this.DEFAULT_HEARTBEAT_INTERVAL,
        commands: []
      };
    } catch (error) {
      logger.error('Failed to process heartbeat', {
        instance_id: instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to process heartbeat'
      );
    }
  }

  /**
   * Unregister a remote instance
   *
   * @param instanceId - Instance ID
   * @param platformApiKey - API key for authentication
   * @param reason - Reason for unregistering
   */
  async unregisterInstance(
    instanceId: string,
    platformApiKey: string,
    reason: string
  ): Promise<{ status: string; unregistered_at: Date }> {
    try {
      // 1. Validate API key
      const instance = await this.validateInstanceApiKey(instanceId, platformApiKey);

      // 2. Update instance status
      await this.instanceRepository.updateByInstanceId(instanceId, {
        status: 'stopped',
        health_status: 'unhealthy',
        health_reason: `Unregistered: ${reason}`,
        updated_at: new Date()
      });

      logger.info('Remote instance unregistered', {
        instance_id: instanceId,
        reason: reason
      });

      return {
        status: 'ok',
        unregistered_at: new Date()
      };
    } catch (error) {
      logger.error('Failed to unregister instance', {
        instance_id: instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCodes.INTERNAL_ERROR.statusCode,
        ErrorCodes.INTERNAL_ERROR.code,
        'Failed to unregister instance'
      );
    }
  }

  /**
   * Get instance registration info
   *
   * @param instanceId - Instance ID
   * @returns Instance registration information
   */
  async getRegistrationInfo(instanceId: string): Promise<InstanceRegistrationInfo> {
    const instance = await this.instanceRepository.findByInstanceId(instanceId);

    if (!instance) {
      throw new AppError(
        ErrorCodes.NOT_FOUND.statusCode,
        ErrorCodes.NOT_FOUND.code,
        `Instance ${instanceId} not found`
      );
    }

    return {
      instance_id: instance.instance_id,
      deployment_type: instance.deployment_type,
      status: instance.status,
      registered_at: instance.created_at,
      last_heartbeat_at: instance.last_heartbeat_at,
      remote_host: instance.remote_host || undefined,
      remote_port: instance.remote_port || undefined
    };
  }

  /**
   * Check if instance is alive based on heartbeat
   *
   * @param instanceId - Instance ID
   * @returns True if instance is alive (heartbeat within timeout)
   */
  async isInstanceAlive(instanceId: string): Promise<boolean> {
    const instance = await this.instanceRepository.findByInstanceId(instanceId);

    if (!instance || instance.deployment_type !== 'remote') {
      return false;
    }

    if (!instance.last_heartbeat_at) {
      return false;
    }

    const now = Date.now();
    const lastHeartbeat = new Date(instance.last_heartbeat_at).getTime();
    const timeSinceHeartbeat = now - lastHeartbeat;

    return timeSinceHeartbeat <= this.HEARTBEAT_TIMEOUT;
  }

  /**
   * Find instances that have not sent heartbeat recently
   *
   * @returns Array of stale instances
   */
  async findStaleInstances(): Promise<Instance[]> {
    const allInstances = await this.instanceRepository.findAll();
    const remoteInstances = allInstances.filter(i => i.deployment_type === 'remote');
    const now = Date.now();

    return remoteInstances.filter(instance => {
      if (!instance.last_heartbeat_at) {
        return true; // Never sent heartbeat
      }

      const lastHeartbeat = new Date(instance.last_heartbeat_at).getTime();
      const timeSinceHeartbeat = now - lastHeartbeat;

      return timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT;
    });
  }

  /**
   * Validate registration request
   */
  private validateRegistrationRequest(request: RemoteInstanceRegistrationRequest): void {
    if (!request.hostname) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR.statusCode,
        ErrorCodes.VALIDATION_ERROR.code,
        'Hostname is required'
      );
    }

    if (!request.port || request.port < 1 || request.port > 65535) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR.statusCode,
        ErrorCodes.VALIDATION_ERROR.code,
        'Valid port number is required'
      );
    }

    if (!request.version) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR.statusCode,
        ErrorCodes.VALIDATION_ERROR.code,
        'Version is required'
      );
    }

    if (!Array.isArray(request.capabilities)) {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR.statusCode,
        ErrorCodes.VALIDATION_ERROR.code,
        'Capabilities must be an array'
      );
    }
  }

  /**
   * Validate instance API key
   */
  private async validateInstanceApiKey(
    instanceId: string,
    platformApiKey: string
  ): Promise<Instance> {
    const instance = await this.instanceRepository.findByInstanceId(instanceId);

    if (!instance) {
      throw new AppError(
        ErrorCodes.NOT_FOUND.statusCode,
        ErrorCodes.NOT_FOUND.code,
        `Instance ${instanceId} not found`
      );
    }

    if (instance.deployment_type !== 'remote') {
      throw new AppError(
        ErrorCodes.VALIDATION_ERROR.statusCode,
        ErrorCodes.VALIDATION_ERROR.code,
        'This operation is only supported for remote instances'
      );
    }

    if (instance.platform_api_key !== platformApiKey) {
      throw new AppError(
        ErrorCodes.UNAUTHORIZED.statusCode,
        ErrorCodes.UNAUTHORIZED.code,
        'Invalid platform API key'
      );
    }

    return instance;
  }

  /**
   * Generate unique instance ID
   */
  private generateInstanceId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString('hex');
    return `inst-remote-${timestamp}-${random}`;
  }

  /**
   * Generate platform API key for remote instance
   */
  private generatePlatformApiKey(): string {
    const prefix = 'sk-remote';
    const random = randomBytes(32).toString('hex');
    return `${prefix}-${random}`;
  }

  /**
   * Determine health status from heartbeat
   */
  private determineHealthStatus(heartbeat: HeartbeatRequest): 'healthy' | 'warning' | 'unhealthy' {
    if (heartbeat.status === 'maintenance') {
      return 'warning';
    }

    if (heartbeat.metrics.cpu_usage > 90 || heartbeat.metrics.memory_usage > 90) {
      return 'warning';
    }

    if (heartbeat.status === 'online') {
      return 'healthy';
    }

    return 'healthy';
  }
}
