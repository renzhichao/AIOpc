import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { Instance } from '../entities/Instance.entity';
import { BaseRepository } from './BaseRepository';

/**
 * 实例仓储类
 * 处理实例相关的数据库操作
 */
@Service()
export class InstanceRepository extends BaseRepository<Instance> {
  constructor(
    @InjectRepository(Instance)
    repository: Repository<Instance>
  ) {
    super(repository);
  }

  /**
   * 根据所有者 ID 查找实例
   */
  async findByOwnerId(ownerId: number): Promise<Instance[]> {
    return this.repository.find({
      where: { owner_id: ownerId },
      order: { created_at: 'DESC' },
      relations: ['owner']
    });
  }

  /**
   * 根据状态查找实例
   */
  async findByStatus(status: string): Promise<Instance[]> {
    return this.repository.find({
      where: { status },
      order: { created_at: 'DESC' },
      relations: ['owner']
    });
  }

  /**
   * 根据实例 ID 查找实例
   */
  async findByInstanceId(instanceId: string): Promise<Instance | null> {
    const result = await this.repository.findOne({
      where: { instance_id: instanceId },
      relations: ['owner']
    });
    return result || null;
  }

  /**
   * 查找活跃实例
   */
  async findActiveInstances(): Promise<Instance[]> {
    return this.repository.find({
      where: { status: 'active' },
      order: { created_at: 'DESC' },
      relations: ['owner']
    });
  }

  /**
   * 查找待处理实例
   */
  async findPendingInstances(): Promise<Instance[]> {
    return this.repository.find({
      where: { status: 'pending' },
      order: { created_at: 'ASC' }
    });
  }

  /**
   * 查找错误状态的实例
   */
  async findErrorInstances(): Promise<Instance[]> {
    return this.repository.find({
      where: { status: 'error' },
      order: { created_at: 'DESC' },
      relations: ['owner']
    });
  }

  /**
   * 更新实例状态
   */
  async updateStatus(instanceId: string, status: string): Promise<void> {
    await this.repository.update(
      { instance_id: instanceId },
      { status } as any
    );
  }

  /**
   * 更新实例健康状态
   */
  async updateHealthStatus(
    instanceId: string,
    healthStatus: Record<string, any>
  ): Promise<void> {
    await this.repository.update(
      { instance_id: instanceId },
      { health_status: healthStatus } as any
    );
  }

  /**
   * 分配实例给用户
   */
  async claimInstance(instanceId: string, ownerId: number): Promise<void> {
    await this.repository.update(
      { instance_id: instanceId },
      {
        owner_id: ownerId,
        status: 'active',
        claimed_at: new Date()
      } as any
    );
  }

  /**
   * 释放实例
   */
  async releaseInstance(instanceId: string): Promise<void> {
    await this.repository.update(
      { instance_id: instanceId },
      {
        owner_id: null,
        status: 'stopped',
        claimed_at: null
      } as any
    );
  }

  /**
   * 更新 Docker 容器 ID
   */
  async updateDockerContainerId(
    instanceId: string,
    containerId: string
  ): Promise<void> {
    await this.repository.update(
      { instance_id: instanceId },
      { docker_container_id: containerId } as any
    );
  }

  /**
   * 增加重启尝试次数
   */
  async incrementRestartAttempts(instanceId: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(Instance)
      .set({
        restart_attempts: () => 'restart_attempts + 1'
      })
      .where('instance_id = :instanceId', { instanceId })
      .execute();
  }

  /**
   * 重置重启尝试次数
   */
  async resetRestartAttempts(instanceId: string): Promise<void> {
    await this.repository.update(
      { instance_id: instanceId },
      { restart_attempts: 0 } as any
    );
  }

  /**
   * 查找过期的实例
   */
  async findExpiredInstances(): Promise<Instance[]> {
    return this.repository
      .createQueryBuilder('instance')
      .where('instance.expires_at < :now', { now: new Date() })
      .andWhere('instance.status IN (:...statuses)', {
        statuses: ['active', 'recovering']
      })
      .getMany();
  }

  /**
   * 统计各状态的实例数量
   */
  async countByStatus(): Promise<Record<string, number>> {
    const result = await this.repository
      .createQueryBuilder('instance')
      .select('instance.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('instance.status')
      .getRawMany();

    return result.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * 统计用户的实例数量
   */
  async countByUser(ownerId: number): Promise<number> {
    return this.repository.count({
      where: { owner_id: ownerId }
    });
  }

  /**
   * 查找需要恢复的实例（重启次数未超限）
   */
  async findRecoverableInstances(maxRetries: number = 3): Promise<Instance[]> {
    return this.repository.find({
      where: { status: 'error' },
      order: { created_at: 'ASC' }
    }).then(instances =>
      instances.filter(instance => instance.restart_attempts < maxRetries)
    );
  }
}
