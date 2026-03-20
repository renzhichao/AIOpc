import { Service } from 'typedi';
import { InstanceRepository } from '../repositories/InstanceRepository';
import { ConversationRepository } from '../repositories/ConversationRepository';
import { Instance } from '../entities/Instance.entity';
import { logger } from '../config/logger';
import { ErrorService } from './ErrorService';

/**
 * DTO for user instance response
 */
export interface UserInstanceResponse {
  id: number;
  instanceId: string;
  name: string;
  tenantId?: string;
  status: 'pending' | 'active' | 'stopped' | 'error' | 'recovering' | 'running';
  healthStatus: 'healthy' | 'warning' | 'unhealthy' | null;
  lastAccessedAt?: Date;
  conversationCount: number;
  createdAt: Date;
  claimedAt?: Date;
  expiresAt?: Date;
  deploymentType: 'local' | 'remote';
}

/**
 * DTO for instance access update
 */
export interface UpdateInstanceAccessDto {
  instanceId: string;
  lastAccessedAt: Date;
}

/**
 * User Instance Service
 *
 * Handles business logic for user's claimed instances
 */
@Service()
export class UserInstanceService {
  constructor(
    private readonly instanceRepository: InstanceRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly errorService: ErrorService
  ) {}

  /**
   * Get all instances owned by a user
   */
  async getUserInstances(userId: number): Promise<UserInstanceResponse[]> {
    // 1. Get all instances owned by user
    const instances = await this.instanceRepository.findByOwner(userId);

    // 2. Get conversation count for each instance
    const instancesWithCount = await Promise.all(
      instances.map(async (instance) => {
        const conversationCount = await this.conversationRepository.countByInstanceId(instance.id);

        return {
          id: instance.id,
          instanceId: instance.instance_id,
          name: instance.name || `${instance.instance_id}`,
          tenantId: instance.config?.tenantId,
          status: instance.status as any,
          healthStatus: instance.health_status,
          lastAccessedAt: instance.updated_at, // Using updated_at as proxy for last accessed
          conversationCount,
          createdAt: instance.created_at,
          claimedAt: instance.claimed_at,
          expiresAt: instance.expires_at,
          deploymentType: instance.deployment_type
        };
      })
    );

    // 3. Sort by last accessed time (most recent first)
    instancesWithCount.sort((a, b) => {
      const aTime = a.lastAccessedAt?.getTime() || 0;
      const bTime = b.lastAccessedAt?.getTime() || 0;
      return bTime - aTime;
    });

    logger.info('Retrieved user instances', {
      userId,
      count: instancesWithCount.length
    });

    return instancesWithCount;
  }

  /**
   * Update instance last accessed time
   * Called when user opens an instance or sends a message
   */
  async updateLastAccessed(userId: number, instanceId: string): Promise<void> {
    const instance = await this.instanceRepository.findByInstanceId(instanceId);

    if (!instance) {
      throw this.errorService.createError('INSTANCE_NOT_FOUND', { instanceId });
    }

    if (instance.owner_id !== userId) {
      throw this.errorService.createError('INSTANCE_NOT_OWNED', { instanceId, userId });
    }

    // Update the updated_at timestamp (used as last_accessed_at proxy)
    await this.instanceRepository.update(instance.id, {
      updated_at: new Date()
    } as any);

    logger.debug('Instance last accessed time updated', {
      instanceId,
      userId
    });
  }

  /**
   * Get instance statistics
   */
  async getInstanceStats(userId: number, instanceId: string) {
    const instance = await this.instanceRepository.findByInstanceId(instanceId);

    if (!instance) {
      throw this.errorService.createError('INSTANCE_NOT_FOUND', { instanceId });
    }

    if (instance.owner_id !== userId) {
      throw this.errorService.createError('INSTANCE_NOT_OWNED', { instanceId, userId });
    }

    const conversationCount = await this.conversationRepository.countByInstanceId(instance.id);

    // Phase 2: Add more detailed stats (message count, token usage, etc.)
    return {
      instanceId: instance.instance_id,
      name: instance.name || instance.instance_id,
      status: instance.status,
      healthStatus: instance.health_status,
      conversationCount,
      createdAt: instance.created_at,
      claimedAt: instance.claimed_at,
      expiresAt: instance.expires_at
    };
  }

  /**
   * Rename instance
   */
  async renameInstance(userId: number, instanceId: string, newName: string): Promise<Instance> {
    if (!newName || newName.trim().length === 0) {
      throw this.errorService.createError('INVALID_INSTANCE_NAME', { name: newName });
    }

    const instance = await this.instanceRepository.findByInstanceId(instanceId);

    if (!instance) {
      throw this.errorService.createError('INSTANCE_NOT_FOUND', { instanceId });
    }

    if (instance.owner_id !== userId) {
      throw this.errorService.createError('INSTANCE_NOT_OWNED', { instanceId, userId });
    }

    await this.instanceRepository.update(instance.id, {
      name: newName.trim()
    } as any);

    logger.info('Instance renamed', {
      instanceId,
      oldName: instance.name,
      newName: newName.trim()
    });

    return (await this.instanceRepository.findById(instance.id))!;
  }

  /**
   * Get instance with health status
   */
  async getInstanceWithHealth(userId: number, instanceId: string): Promise<UserInstanceResponse | null> {
    const instance = await this.instanceRepository.findByInstanceId(instanceId);

    if (!instance || instance.owner_id !== userId) {
      return null;
    }

    const conversationCount = await this.conversationRepository.countByInstanceId(instance.id);

    return {
      id: instance.id,
      instanceId: instance.instance_id,
      name: instance.name || instance.instance_id,
      tenantId: instance.config?.tenantId,
      status: instance.status as any,
      healthStatus: instance.health_status,
      lastAccessedAt: instance.updated_at,
      conversationCount,
      createdAt: instance.created_at,
      claimedAt: instance.claimed_at,
      expiresAt: instance.expires_at,
      deploymentType: instance.deployment_type
    };
  }

  /**
   * Get recent instances accessed by user
   */
  async getRecentInstances(userId: number, limit: number = 5): Promise<UserInstanceResponse[]> {
    const allInstances = await this.getUserInstances(userId);
    return allInstances.slice(0, limit);
  }
}
