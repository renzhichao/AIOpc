import { Service } from 'typedi';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { Instance } from '../entities/Instance.entity';
import { logger } from '../config/logger';

/**
 * Instance Information Interface
 *
 * Stores runtime information about active instances in the registry
 */
export interface InstanceInfo {
  instance_id: string;
  owner_id: number | null;
  connection_type: 'local' | 'remote';
  api_endpoint: string;
  status: 'online' | 'offline' | 'error';
  last_heartbeat: number;
  registered_at: number;
  metadata?: Record<string, any>;
}

/**
 * Instance Registry Service
 *
 * Manages in-memory registry of all active instances with their connection information.
 * Provides real-time instance lookup, health monitoring, and status tracking.
 *
 * Features:
 * - Fast O(1) instance lookups using Map
 * - Automatic health check with periodic monitoring
 * - Heartbeat tracking for instance aliveness
 * - Status management (online/offline/error)
 * - Query methods for filtering and statistics
 *
 * @service
 */
@Service()
export class InstanceRegistry {
  private registry: Map<string, InstanceInfo> = new Map();
  private userInstanceMap: Map<number, string> = new Map(); // userId -> instance_id
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private readonly config = {
    healthCheckInterval: parseInt(process.env.REGISTRY_HEALTH_CHECK_INTERVAL || '15000', 10),
    heartbeatTimeout: parseInt(process.env.REGISTRY_HEARTBEAT_TIMEOUT || '30000', 10),
  };

  constructor(
    private readonly instanceRepository: InstanceRepository
  ) {}

  /**
   * Register instance to memory
   *
   * Loads instance from database and registers it in the in-memory registry
   * with connection information. Updates existing registration if already present.
   *
   * @param instanceId - Instance ID to register
   * @param connectionInfo - Connection type, API endpoint, and optional metadata
   * @throws Error if instance not found in database
   */
  async registerInstance(
    instanceId: string,
    connectionInfo: {
      connection_type: 'local' | 'remote';
      api_endpoint: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    // Load instance from database
    const instance = await this.instanceRepository.findByInstanceId(instanceId);

    if (!instance) {
      throw new Error(`Instance ${instanceId} not found in database`);
    }

    const now = Date.now();
    const existing = this.registry.get(instanceId);

    const instanceInfo: InstanceInfo = {
      instance_id: instanceId,
      owner_id: instance.owner_id,
      connection_type: connectionInfo.connection_type,
      api_endpoint: connectionInfo.api_endpoint,
      status: 'online',
      last_heartbeat: now,
      registered_at: existing?.registered_at || now,
      metadata: connectionInfo.metadata,
    };

    // Store in registry
    this.registry.set(instanceId, instanceInfo);

    // Update user instance map
    if (instance.owner_id) {
      this.userInstanceMap.set(instance.owner_id, instanceId);
    }

    logger.info('Instance registered to registry', {
      instanceId,
      ownerId: instance.owner_id,
      connectionType: connectionInfo.connection_type,
      apiEndpoint: connectionInfo.api_endpoint,
      status: 'online',
    });
  }

  /**
   * Unregister instance from memory
   *
   * Removes instance from registry and cleans up user instance mapping
   *
   * @param instanceId - Instance ID to unregister
   */
  async unregisterInstance(instanceId: string): Promise<void> {
    const instanceInfo = this.registry.get(instanceId);

    if (!instanceInfo) {
      logger.warn('Attempted to unregister non-existent instance', { instanceId });
      return;
    }

    // Remove from registry
    this.registry.delete(instanceId);

    // Remove from user instance map
    if (instanceInfo.owner_id) {
      this.userInstanceMap.delete(instanceInfo.owner_id);
    }

    logger.info('Instance unregistered from registry', {
      instanceId,
      ownerId: instanceInfo.owner_id,
    });
  }

  /**
   * Clear all instances from registry
   *
   * Removes all instances from memory. Useful for testing or shutdown.
   */
  async clear(): Promise<void> {
    const count = this.registry.size;
    this.registry.clear();
    this.userInstanceMap.clear();

    logger.info('Registry cleared', { count });
  }

  /**
   * Get user's instance
   *
   * Returns the most recently registered instance for the given user
   *
   * @param userId - User ID
   * @returns Instance info or null if user has no registered instance
   */
  async getUserInstance(userId: number): Promise<InstanceInfo | null> {
    const instanceId = this.userInstanceMap.get(userId);

    if (!instanceId) {
      return null;
    }

    return this.getInstanceInfo(instanceId);
  }

  /**
   * Get instance connection info
   *
   * Returns complete instance information from registry
   *
   * @param instanceId - Instance ID
   * @returns Instance info or null if not found
   */
  async getInstanceInfo(instanceId: string): Promise<InstanceInfo | null> {
    return this.registry.get(instanceId) || null;
  }

  /**
   * Update instance status
   *
   * Changes instance status and logs the change
   *
   * @param instanceId - Instance ID
   * @param status - New status (online/offline/error)
   */
  async updateInstanceStatus(
    instanceId: string,
    status: 'online' | 'offline' | 'error'
  ): Promise<void> {
    const instanceInfo = this.registry.get(instanceId);

    if (!instanceInfo) {
      logger.warn('Attempted to update status for non-existent instance', {
        instanceId,
        status,
      });
      return;
    }

    const oldStatus = instanceInfo.status;
    instanceInfo.status = status;

    logger.info('Instance status updated', {
      instanceId,
      oldStatus,
      newStatus: status,
    });
  }

  /**
   * Update heartbeat timestamp
   *
   * Updates the last heartbeat time to current timestamp
   *
   * @param instanceId - Instance ID
   */
  async updateHeartbeat(instanceId: string): Promise<void> {
    const instanceInfo = this.registry.get(instanceId);

    if (!instanceInfo) {
      logger.warn('Attempted to update heartbeat for non-existent instance', {
        instanceId,
      });
      return;
    }

    instanceInfo.last_heartbeat = Date.now();

    // If instance was offline or error, mark it back online
    if (instanceInfo.status !== 'online') {
      const oldStatus = instanceInfo.status;
      instanceInfo.status = 'online';

      logger.info('Instance status updated to online', {
        instanceId,
        oldStatus,
        reason: 'heartbeat received',
      });
    }
  }

  /**
   * Check if instance is healthy
   *
   * Returns true if instance has heartbeat within configured timeout
   *
   * @param instanceId - Instance ID
   * @returns True if healthy, false otherwise
   */
  async healthCheck(instanceId: string): Promise<boolean> {
    const instanceInfo = this.registry.get(instanceId);

    if (!instanceInfo) {
      return false;
    }

    const now = Date.now();
    const timeSinceHeartbeat = now - instanceInfo.last_heartbeat;

    return timeSinceHeartbeat <= this.config.heartbeatTimeout;
  }

  /**
   * Get all online instances
   *
   * Returns array of all instances with online status
   *
   * @returns Array of online instance info
   */
  async getOnlineInstances(): Promise<InstanceInfo[]> {
    return Array.from(this.registry.values()).filter(
      instance => instance.status === 'online'
    );
  }

  /**
   * Get instances by status
   *
   * Returns array of all instances with the specified status
   *
   * @param status - Status to filter by
   * @returns Array of instance info with matching status
   */
  async getInstancesByStatus(status: 'online' | 'offline' | 'error'): Promise<InstanceInfo[]> {
    return Array.from(this.registry.values()).filter(
      instance => instance.status === status
    );
  }

  /**
   * Get registry stats
   *
   * Returns statistics about instances in the registry
   *
   * @returns Statistics object with counts by status
   */
  getStats(): {
    total: number;
    online: number;
    offline: number;
    error: number;
  } {
    const instances = Array.from(this.registry.values());

    return {
      total: instances.length,
      online: instances.filter(i => i.status === 'online').length,
      offline: instances.filter(i => i.status === 'offline').length,
      error: instances.filter(i => i.status === 'error').length,
    };
  }

  /**
   * Start periodic health check
   *
   * Starts a timer that periodically checks all instances and marks them
   * as offline if they haven't sent a heartbeat within the timeout period
   *
   * @param intervalMs - Check interval in milliseconds (default: from config)
   */
  startHealthCheck(intervalMs?: number): void {
    // Stop existing timer if running
    this.stopHealthCheck();

    const interval = intervalMs || this.config.healthCheckInterval;

    this.healthCheckInterval = setInterval(async () => {
      const now = Date.now();
      const instances = Array.from(this.registry.values());

      for (const instance of instances) {
        const timeSinceHeartbeat = now - instance.last_heartbeat;

        // Mark as offline if no heartbeat for configured timeout
        if (timeSinceHeartbeat > this.config.heartbeatTimeout && instance.status === 'online') {
          await this.updateInstanceStatus(instance.instance_id, 'offline');

          logger.warn('Instance marked as offline due to heartbeat timeout', {
            instanceId: instance.instance_id,
            ownerId: instance.owner_id,
            timeSinceHeartbeat: `${timeSinceHeartbeat}ms`,
            timeout: `${this.config.heartbeatTimeout}ms`,
          });
        }
      }
    }, interval);

    logger.info('Instance registry health check started', {
      intervalMs: interval,
      heartbeatTimeout: this.config.heartbeatTimeout,
    });
  }

  /**
   * Stop health check
   *
   * Stops the periodic health check timer
   */
  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;

      logger.info('Instance registry health check stopped');
    }
  }

  /**
   * Check if health check is running
   *
   * @returns True if health check timer is active
   */
  isHealthCheckRunning(): boolean {
    return this.healthCheckInterval !== null;
  }

  /**
   * Get all registered instances
   *
   * Returns a copy of all instances in the registry
   *
   * @returns Array of all instance info
   */
  getAllInstances(): InstanceInfo[] {
    return Array.from(this.registry.values());
  }

  /**
   * Get registry size
   *
   * Returns the number of instances in the registry
   *
   * @returns Number of registered instances
   */
  size(): number {
    return this.registry.size;
  }
}
