/**
 * Instance Management Service
 *
 * Manages OpenClaw instance lifecycle including:
 * - Instance creation and initialization
 * - Instance lifecycle (start, stop, delete)
 * - Instance health monitoring
 * - Instance state management
 * - Integration with Docker and API Key services
 */

import { Service } from 'typedi';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { DockerService } from './DockerService';
import { ApiKeyService } from './ApiKeyService';
import { Instance } from '../entities/Instance.entity';
import { User } from '../entities/User.entity';
import { AppError } from '../utils/errors/AppError';
import { ErrorService } from './ErrorService';
import { logger } from '../config/logger';
import { InstanceConfig } from '../types/docker';
import { InstancePresetConfig, InstanceTemplate } from '../types/config';
import { getPresetConfig } from '../config/presets';

/**
 * Instance status for state machine
 */
export type InstanceStatus = 'pending' | 'active' | 'stopped' | 'error' | 'recovering';

/**
 * Instance creation options
 */
export interface CreateInstanceOptions {
  /** Instance template (personal, team, enterprise) */
  template: InstanceTemplate;
  /** Instance configuration (optional) */
  config?: Record<string, any>;
  /** Instance expiration (optional, default: 30 days) */
  expiresAt?: Date;
}

/**
 * Instance state information
 */
export interface InstanceState {
  /** Instance ID */
  instanceId: string;
  /** Current status */
  status: InstanceStatus;
  /** Docker container ID */
  containerId?: string;
  /** Owner ID */
  ownerId?: number;
  /** Created at */
  createdAt: Date;
  /** Expires at */
  expiresAt?: Date;
  /** Health status */
  healthStatus?: Record<string, any>;
  /** Restart attempts */
  restartAttempts: number;
}

/**
 * Instance statistics
 */
export interface InstanceStats {
  /** Total instances */
  total: number;
  /** Active instances */
  active: number;
  /** Stopped instances */
  stopped: number;
  /** Pending instances */
  pending: number;
  /** Error instances */
  error: number;
  /** Recovering instances */
  recovering: number;
}

@Service()
export class InstanceService {
  constructor(
    private readonly instanceRepository: InstanceRepository,
    private readonly dockerService: DockerService,
    private readonly apiKeyService: ApiKeyService,
    private readonly errorService: ErrorService
  ) {}

  /**
   * Create a new OpenClaw instance
   *
   * @param user - User who owns the instance
   * @param options - Instance creation options
   * @returns Created instance
   * @throws AppError if creation fails
   */
  async createInstance(user: User, options: CreateInstanceOptions): Promise<Instance> {
    try {
      logger.info('Creating instance', {
        userId: user.id,
        template: options.template
      });

      // 1. Generate unique instance ID
      const instanceId = this.generateInstanceId();

      // 2. Set expiration date (default: 30 days)
      const expiresAt = options.expiresAt || this.getDefaultExpiration();

      // 3. Get preset configuration for the template
      const presetConfig = getPresetConfig(options.template);
      logger.info('Preset configuration loaded', {
        template: options.template,
        maxMessages: presetConfig.limits.max_messages_per_day,
        maxStorage: presetConfig.limits.max_storage_mb
      });

      // 4. Create instance record with pending status
      const instance = await this.instanceRepository.create({
        instance_id: instanceId,
        owner_id: user.id,
        status: 'pending',
        template: options.template,
        config: presetConfig,
        expires_at: expiresAt,
        restart_attempts: 0,
        health_status: null
      });

      logger.info('Instance record created', {
        instanceId,
        userId: user.id,
        status: 'pending'
      });

      // 5. Get API key for the instance
      const apiKey = await this.apiKeyService.assignKey(instanceId);

      // 6. Prepare instance configuration from preset
      const instanceConfig: InstanceConfig = {
        apiKey: presetConfig.llm.api_key || apiKey,
        feishuAppId: process.env.FEISHU_APP_ID || '',
        feishuAppSecret: process.env.FEISHU_APP_SECRET,
        skills: presetConfig.skills.filter(s => s.enabled).map(s => s.name),
        tools: presetConfig.tools.filter(t => t.enabled).map(t => ({ name: t.name, layer: t.layer })),
        systemPrompt: presetConfig.system_prompt,
        temperature: presetConfig.llm.temperature,
        maxTokens: presetConfig.llm.max_tokens,
        template: options.template,
        apiBase: presetConfig.llm.api_base,
        model: presetConfig.llm.model
      };

      logger.info('Instance configuration prepared', {
        skills: instanceConfig.skills.length,
        toolsCount: presetConfig.tools.filter(t => t.enabled).length
      });

      // 7. Create Docker container with preset configuration
      const containerId = await this.dockerService.createContainer(instanceId, instanceConfig);

      logger.info('Docker container created', {
        instanceId,
        containerId
      });

      // 8. Update instance with container ID and active status
      await this.instanceRepository.update(instanceId, {
        docker_container_id: containerId,
        status: 'active',
        config: presetConfig
      });

      // 9. Fetch updated instance
      const updatedInstance = await this.instanceRepository.findByInstanceId(instanceId);

      logger.info('Instance created successfully', {
        instanceId,
        containerId,
        status: 'active',
        template: options.template
      });

      return updatedInstance!;
    } catch (error) {
      logger.error('Failed to create instance', {
        userId: user.id,
        template: options.template,
        error: error instanceof Error ? error.message : String(error)
      });

      // Clean up on failure
      throw this.errorService.createError('INSTANCE_CREATE_FAILED', {
        userId: user.id,
        template: options.template,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Start a stopped instance
   *
   * @param instanceId - Instance ID
   * @returns Updated instance
   * @throws AppError if start fails
   */
  async startInstance(instanceId: string): Promise<Instance> {
    try {
      logger.info('Starting instance', { instanceId });

      // 1. Get instance
      const instance = await this.getInstanceById(instanceId);

      // 2. Validate state transition
      this.validateStateTransition(instance.status as InstanceStatus, 'active');

      // 3. Start Docker container
      await this.dockerService.startContainer(instanceId);

      // 4. Update instance status
      await this.instanceRepository.updateStatus(instanceId, 'active');

      // 5. Reset restart attempts
      await this.instanceRepository.resetRestartAttempts(instanceId);

      logger.info('Instance started', { instanceId });

      // 6. Fetch updated instance
      return await this.getInstanceById(instanceId);
    } catch (error) {
      logger.error('Failed to start instance', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw this.errorService.createError('INSTANCE_START_FAILED', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Stop a running instance
   *
   * @param instanceId - Instance ID
   * @param timeout - Timeout in seconds (default: 10)
   * @returns Updated instance
   * @throws AppError if stop fails
   */
  async stopInstance(instanceId: string, timeout: number = 10): Promise<Instance> {
    try {
      logger.info('Stopping instance', { instanceId, timeout });

      // 1. Get instance
      const instance = await this.getInstanceById(instanceId);

      // 2. Validate state transition
      this.validateStateTransition(instance.status as InstanceStatus, 'stopped');

      // 3. Stop Docker container
      await this.dockerService.stopContainer(instanceId, timeout);

      // 4. Update instance status
      await this.instanceRepository.updateStatus(instanceId, 'stopped');

      logger.info('Instance stopped', { instanceId });

      // 5. Fetch updated instance
      return await this.getInstanceById(instanceId);
    } catch (error) {
      logger.error('Failed to stop instance', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw this.errorService.createError('INSTANCE_STOP_FAILED', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Restart an instance
   *
   * @param instanceId - Instance ID
   * @param timeout - Timeout in seconds (default: 10)
   * @returns Updated instance
   * @throws AppError if restart fails
   */
  async restartInstance(instanceId: string, timeout: number = 10): Promise<Instance> {
    try {
      logger.info('Restarting instance', { instanceId, timeout });

      // 1. Get instance
      const instance = await this.getInstanceById(instanceId);

      // 2. Validate state transition (restart is allowed from active, recovering, error)
      if (!['active', 'recovering', 'error'].includes(instance.status as InstanceStatus)) {
        throw this.errorService.createError('INVALID_STATE_TRANSITION', {
          currentStatus: instance.status,
          newStatus: 'active',
          allowedTransitions: ['active', 'recovering', 'error']
        });
      }

      // 3. Restart Docker container
      await this.dockerService.restartContainer(instanceId, timeout);

      // 4. Update instance status
      await this.instanceRepository.updateStatus(instanceId, 'active');

      // 5. Increment restart attempts
      await this.instanceRepository.incrementRestartAttempts(instanceId);

      logger.info('Instance restarted', { instanceId });

      // 6. Fetch updated instance
      return await this.getInstanceById(instanceId);
    } catch (error) {
      logger.error('Failed to restart instance', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw this.errorService.createError('INSTANCE_RESTART_FAILED', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Delete an instance (stop and remove container)
   *
   * @param instanceId - Instance ID
   * @param force - Force deletion without stopping
   * @throws AppError if deletion fails
   */
  async deleteInstance(instanceId: string, force: boolean = false): Promise<void> {
    try {
      logger.info('Deleting instance', { instanceId, force });

      // 1. Get instance
      const instance = await this.getInstanceById(instanceId);

      // 2. Release API key
      await this.apiKeyService.releaseKey(instanceId);

      // 3. Remove Docker container
      await this.dockerService.removeContainer(instanceId, force, true);

      // 4. Delete instance record from database
      await this.instanceRepository.delete(instance.id);

      logger.info('Instance deleted', { instanceId });
    } catch (error) {
      logger.error('Failed to delete instance', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw this.errorService.createError('INSTANCE_DELETE_FAILED', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get instance by ID
   *
   * @param instanceId - Instance ID
   * @returns Instance
   * @throws AppError if not found
   */
  async getInstanceById(instanceId: string): Promise<Instance> {
    const instance = await this.instanceRepository.findByInstanceId(instanceId);

    if (!instance) {
      throw this.errorService.createError('INSTANCE_NOT_FOUND', { instanceId });
    }

    return instance;
  }

  /**
   * Get instance status
   *
   * @param instanceId - Instance ID
   * @returns Instance state information
   */
  async getInstanceStatus(instanceId: string): Promise<InstanceState> {
    try {
      const instance = await this.getInstanceById(instanceId);

      // Get container status from Docker
      let containerId: string | undefined;
      try {
        const containerStatus = await this.dockerService.getContainerStatus(instanceId);
        containerId = containerStatus.id;
      } catch (error) {
        logger.warn('Failed to get container status', {
          instanceId,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      return {
        instanceId: instance.instance_id,
        status: instance.status as InstanceStatus,
        containerId: instance.docker_container_id || containerId,
        ownerId: instance.owner_id || undefined,
        createdAt: instance.created_at,
        expiresAt: instance.expires_at || undefined,
        healthStatus: (instance.health_status || undefined) as any,
        restartAttempts: instance.restart_attempts
      };
    } catch (error) {
      logger.error('Failed to get instance status', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw this.errorService.createError('INSTANCE_STATUS_FAILED', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get instance health status
   *
   * @param instanceId - Instance ID
   * @returns Health status from Docker
   */
  async getInstanceHealth(instanceId: string): Promise<Record<string, any>> {
    try {
      const healthStatus = await this.dockerService.healthCheck(instanceId);

      // Update health status in database
      await this.instanceRepository.updateHealthStatus(instanceId, healthStatus);

      return healthStatus;
    } catch (error) {
      logger.error('Failed to get instance health', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'unknown',
        reason: 'Failed to check health',
        lastCheck: new Date()
      };
    }
  }

  /**
   * List instances for a user
   *
   * @param userId - User ID
   * @returns List of instances
   */
  async listUserInstances(userId: number): Promise<Instance[]> {
    return this.instanceRepository.findByOwnerId(userId);
  }

  /**
   * Get instances for a user with filtering and pagination
   *
   * @param userId - User ID
   * @param status - Optional status filter
   * @param limit - Maximum number of instances to return
   * @param offset - Number of instances to skip
   * @returns List of instances
   */
  async getUserInstances(
    userId: number,
    status?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<Instance[]> {
    const instances = await this.instanceRepository.findByOwnerId(userId);

    // Filter by status if provided
    let filtered = instances;
    if (status) {
      filtered = instances.filter(instance => instance.status === status);
    }

    // Apply pagination
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Count instances for a user
   *
   * @param userId - User ID
   * @param status - Optional status filter
   * @returns Count of instances
   */
  async countUserInstances(userId: number, status?: string): Promise<number> {
    const instances = await this.instanceRepository.findByOwnerId(userId);

    if (status) {
      return instances.filter(instance => instance.status === status).length;
    }

    return instances.length;
  }

  /**
   * List instances by status
   *
   * @param status - Instance status
   * @returns List of instances
   */
  async listInstancesByStatus(status: string): Promise<Instance[]> {
    return this.instanceRepository.findByStatus(status);
  }

  /**
   * Get instance statistics for a specific instance
   *
   * @param instanceId - Instance ID
   * @returns Instance statistics
   */
  async getInstanceStats(instanceId: string): Promise<{
    status: string;
    uptime?: number;
    restartAttempts: number;
    healthStatus?: Record<string, any>;
  }> {
    const instance = await this.getInstanceById(instanceId);

    // Get container status from Docker
    let uptime: number | undefined;
    try {
      const containerStatus = await this.dockerService.getContainerStatus(instanceId);
      const startTime = containerStatus.started?.getTime() || Date.now();
      uptime = Math.floor((Date.now() - startTime) / 1000);
    } catch (error) {
      // Container might not be running
    }

    return {
      status: instance.status,
      uptime,
      restartAttempts: instance.restart_attempts,
      healthStatus: instance.health_status as any
    };
  }

  /**
   * Get global instance statistics
   *
   * @returns Instance statistics
   */
  async getGlobalInstanceStats(): Promise<InstanceStats> {
    const statusCounts = await this.instanceRepository.countByStatus();

    return {
      total: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
      active: statusCounts.active || 0,
      stopped: statusCounts.stopped || 0,
      pending: statusCounts.pending || 0,
      error: statusCounts.error || 0,
      recovering: statusCounts.recovering || 0
    };
  }

  /**
   * Get instance logs
   *
   * @param instanceId - Instance ID
   * @param lines - Number of lines to retrieve
   * @returns Array of log entries
   */
  async getInstanceLogs(instanceId: string, lines: number = 100): Promise<Array<{
    timestamp: Date;
    message: string;
    containerId: string;
  }>> {
    try {
      // Verify instance exists
      await this.getInstanceById(instanceId);

      // Get logs from Docker service
      const logs = await this.dockerService.getLogs(instanceId, { tail: lines });

      return logs.map(log => ({
        timestamp: log.timestamp || new Date(),
        message: log.message,
        containerId: instanceId
      }));
    } catch (error) {
      logger.error('Failed to get instance logs', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw this.errorService.createError('INSTANCE_LOGS_FAILED', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Find expired instances
   *
   * @returns List of expired instances
   */
  async findExpiredInstances(): Promise<Instance[]> {
    return this.instanceRepository.findExpiredInstances();
  }

  /**
   * Claim an existing instance
   *
   * @param instanceId - Instance ID
   * @param userId - User ID
   * @returns Updated instance
   */
  async claimInstance(instanceId: string, userId: number): Promise<Instance> {
    try {
      const instance = await this.getInstanceById(instanceId);

      // Check if instance is already claimed
      if (instance.owner_id) {
        throw this.errorService.createError('INSTANCE_ALREADY_CLAIMED', {
          instanceId,
          ownerId: instance.owner_id
        });
      }

      // Claim instance
      await this.instanceRepository.claimInstance(instanceId, userId);

      logger.info('Instance claimed', { instanceId, userId });

      return await this.getInstanceById(instanceId);
    } catch (error) {
      logger.error('Failed to claim instance', {
        instanceId,
        userId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Release an instance (remove owner) - backward compatible method
   *
   * @param instanceId - Instance ID
   * @deprecated Use releaseInstance(instanceId, userId) for ownership validation
   */
  async releaseInstanceById(instanceId: string): Promise<void> {
    try {
      await this.instanceRepository.releaseInstance(instanceId);

      logger.info('Instance released', { instanceId });
    } catch (error) {
      logger.error('Failed to release instance', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw this.errorService.createError('INSTANCE_RELEASE_FAILED', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Validate state transition
   *
   * @param currentStatus - Current instance status
   * @param newStatus - Desired instance status
   * @throws AppError if transition is invalid
   */
  private validateStateTransition(currentStatus: InstanceStatus, newStatus: InstanceStatus): void {
    const validTransitions: Record<InstanceStatus, InstanceStatus[]> = {
      pending: ['active', 'error'],
      active: ['stopped', 'recovering', 'error'],
      stopped: ['active'],
      error: ['recovering', 'stopped'],
      recovering: ['active', 'error']
    };

    const allowed = validTransitions[currentStatus] || [];

    if (!allowed.includes(newStatus)) {
      throw this.errorService.createError('INVALID_STATE_TRANSITION', {
        currentStatus,
        newStatus,
        allowedTransitions: allowed
      });
    }
  }

  /**
   * Generate unique instance ID
   *
   * @returns Unique instance ID
   */
  private generateInstanceId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `inst-${timestamp}-${random}`;
  }

  /**
   * Get default expiration date (30 days from now)
   *
   * @returns Default expiration date
   */
  private getDefaultExpiration(): Date {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    return expiresAt;
  }

  /**
   * Get total instance count
   *
   * @returns Total number of instances
   */
  async getTotalInstanceCount(): Promise<number> {
    const stats = await this.getGlobalInstanceStats();
    return stats.total;
  }

  /**
   * Get active instance count
   *
   * @returns Number of active instances
   */
  async getActiveInstanceCount(): Promise<number> {
    const stats = await this.getGlobalInstanceStats();
    return stats.active;
  }

  /**
   * Check instance health
   *
   * @param instanceId - Instance ID
   * @returns Health status
   */
  async checkInstanceHealth(instanceId: string): Promise<{
    healthy: boolean;
    status: string;
    cpu_usage?: number;
    memory_usage?: number;
    [key: string]: any;
  }> {
    try {
      const health = await this.getInstanceHealth(instanceId);

      return {
        healthy: health.status === 'healthy',
        status: health.status,
        cpu_usage: health.cpuUsage,
        memory_usage: health.memoryUsage,
        ...health
      };
    } catch (error) {
      logger.error('Failed to check instance health', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        healthy: false,
        status: 'unknown'
      };
    }
  }

  /**
   * Get all instances
   *
   * @returns All instances
   */
  async getAllInstances(): Promise<Instance[]> {
    return this.instanceRepository.findAll();
  }

  /**
   * Update instance expiration date
   *
   * @param instanceId - Instance ID
   * @param newExpiresAt - New expiration date
   * @returns Updated instance
   * @throws AppError if update fails
   */
  async updateExpirationDate(instanceId: string, newExpiresAt: Date): Promise<Instance> {
    try {
      logger.info('Updating instance expiration date', {
        instanceId,
        newExpiresAt: newExpiresAt.toISOString()
      });

      const instance = await this.getInstanceById(instanceId);

      // Update expiration date
      instance.expires_at = newExpiresAt;
      instance.updated_at = new Date();

      const updatedInstance = await this.instanceRepository.save(instance);

      logger.info('Instance expiration date updated successfully', {
        instanceId,
        oldExpiresAt: instance.expires_at?.toISOString(),
        newExpiresAt: newExpiresAt.toISOString()
      });

      return updatedInstance;
    } catch (error) {
      logger.error('Failed to update instance expiration date', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw this.errorService.createError('INSTANCE_UPDATE_FAILED', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Update instance configuration
   *
   * @param instanceId - Instance ID
   * @param newConfig - New configuration to apply
   * @returns Updated instance
   * @throws AppError if update fails
   */
  async updateConfig(instanceId: string, newConfig: InstancePresetConfig): Promise<Instance> {
    try {
      logger.info('Updating instance configuration', {
        instanceId
      });

      const instance = await this.getInstanceById(instanceId);

      // Update configuration
      instance.config = newConfig;
      instance.updated_at = new Date();

      const updatedInstance = await this.instanceRepository.save(instance);

      logger.info('Instance configuration updated successfully', {
        instanceId
      });

      // Note: Container restart with new environment variables will be handled
      // by the caller if needed (e.g., when LLM config changes)

      return updatedInstance;
    } catch (error) {
      logger.error('Failed to update instance configuration', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw this.errorService.createError('INSTANCE_UPDATE_FAILED', {
        instanceId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get unclaimed instances (TASK-009-01)
   *
   * Returns instances that are not owned by any user (owner_id IS NULL).
   * Used for remote instance claiming workflow.
   *
   * @param params - Optional filters (deployment_type, status)
   * @returns List of unclaimed instances
   */
  async getUnclaimedInstances(params?: {
    deployment_type?: 'remote';
    status?: 'pending';
  }): Promise<Instance[]> {
    try {
      logger.info('Getting unclaimed instances', { params });

      const instances = await this.instanceRepository.findUnclaimedInstances(params);

      logger.info('Retrieved unclaimed instances', {
        count: instances.length,
        params
      });

      return instances;
    } catch (error) {
      logger.error('Failed to get unclaimed instances', {
        params,
        error: error instanceof Error ? error.message : String(error)
      });

      throw this.errorService.createError('INSTANCE_STATUS_FAILED', {
        params,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Release an instance with ownership validation (TASK-009-01)
   *
   * Releases an instance back to the unclaimed pool.
   * Only the instance owner can release it.
   *
   * @param instanceId - Instance ID
   * @param userId - User ID attempting to release
   * @throws AppError if not found or not authorized
   */
  async releaseInstance(instanceId: string, userId: number): Promise<void> {
    try {
      logger.info('Releasing instance', { instanceId, userId });

      const instance = await this.getInstanceById(instanceId);

      // Check ownership
      if (instance.owner_id !== userId) {
        throw this.errorService.createError('FORBIDDEN', {
          instanceId,
          userId,
          reason: 'Instance belongs to different user'
        });
      }

      await this.instanceRepository.releaseInstance(instanceId);

      logger.info('Instance released successfully', { instanceId, userId });
    } catch (error) {
      logger.error('Failed to release instance', {
        instanceId,
        userId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Get user instance statistics (TASK-009-01)
   *
   * Returns comprehensive statistics about instances for a specific user.
   *
   * @param userId - User ID
   * @returns User instance statistics
   */
  async getUserInstanceStats(userId: number): Promise<{
    total: number;
    local: number;
    remote: number;
    unclaimed: number;
    active: number;
    healthy: number;
  }> {
    try {
      logger.info('Getting user instance stats', { userId });

      // Get user's instances
      const userInstances = await this.instanceRepository.findByOwnerId(userId);

      // Get unclaimed instances count
      const unclaimedInstances = await this.instanceRepository.findUnclaimedInstances();

      // Calculate statistics
      const stats = {
        total: userInstances.length,
        local: userInstances.filter(i => i.deployment_type === 'local').length,
        remote: userInstances.filter(i => i.deployment_type === 'remote').length,
        unclaimed: unclaimedInstances.length,
        active: userInstances.filter(i => i.status === 'active').length,
        healthy: userInstances.filter(i => i.health_status === 'healthy').length
      };

      logger.info('User instance stats retrieved', { userId, stats });

      return stats;
    } catch (error) {
      logger.error('Failed to get user instance stats', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw this.errorService.createError('INSTANCE_STATUS_FAILED', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
