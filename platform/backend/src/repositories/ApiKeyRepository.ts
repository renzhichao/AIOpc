import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { ApiKey } from '../entities/ApiKey.entity';
import { BaseRepository } from './BaseRepository';

/**
 * API Key 仓储类
 * 处理 API Key 相关的数据库操作
 */
@Service()
export class ApiKeyRepository extends BaseRepository<ApiKey> {
  constructor(
    @InjectRepository(ApiKey)
    repository: Repository<ApiKey>
  ) {
    super(repository);
  }

  /**
   * 查找可用的 API Key（使用次数最少）
   */
  async findAvailableKey(provider?: string): Promise<ApiKey | null> {
    const where: any = { status: 'active' };

    if (provider) {
      where.provider = provider;
    }

    const result = await this.repository.findOne({
      where,
      order: { usage_count: 'ASC', created_at: 'ASC' }
    });
    return result || null;
  }

  /**
   * 根据实例 ID 查找当前使用的 API Key
   */
  async findByInstanceId(instanceId: string): Promise<ApiKey | null> {
    const result = await this.repository.findOne({
      where: { current_instance_id: instanceId }
    });
    return result || null;
  }

  /**
   * 根据提供商查找 API Key
   */
  async findByProvider(provider: string): Promise<ApiKey[]> {
    return this.repository.find({
      where: { provider },
      order: { usage_count: 'ASC' }
    });
  }

  /**
   * 增加使用次数
   */
  async incrementUsage(id: number): Promise<void> {
    await this.repository.increment({ id }, 'usage_count', 1);
    await this.repository.update(id, {
      last_used_at: new Date()
    } as any);
  }

  /**
   * 释放 API Key（解除与实例的绑定）
   */
  async releaseKey(instanceId: string): Promise<void> {
    await this.repository.update(
      { current_instance_id: instanceId },
      { current_instance_id: null } as any
    );
  }

  /**
   * 分配 API Key 给实例
   */
  async assignKeyToInstance(keyId: number, instanceId: string): Promise<void> {
    await this.repository.update(keyId, {
      current_instance_id: instanceId
    } as any);
  }

  /**
   * 更新 API Key 状态
   */
  async updateStatus(id: number, status: string): Promise<void> {
    await this.repository.update(id, { status } as any);
  }

  /**
   * 停用 API Key
   */
  async deactivateKey(id: number): Promise<void> {
    await this.repository.update(id, {
      status: 'inactive',
      current_instance_id: undefined
    } as any);
  }

  /**
   * 激活 API Key
   */
  async activateKey(id: number): Promise<void> {
    await this.repository.update(id, { status: 'active' } as any);
  }

  /**
   * 检查 API Key 配额是否用尽
   */
  async isQuotaExceeded(id: number): Promise<boolean> {
    const key = await this.repository.findOne({ where: { id } as any });
    if (!key) return false;
    return key.usage_count >= key.quota;
  }

  /**
   * 查找配额即将用尽的 API Key
   */
  async findNearQuotaLimit(threshold: number = 0.9): Promise<ApiKey[]> {
    const keys = await this.repository.find({
      where: { status: 'active' }
    });

    return keys.filter(key => key.usage_count >= key.quota * threshold);
  }

  /**
   * 查找已绑定的 API Key
   */
  async findAssignedKeys(): Promise<ApiKey[]> {
    return this.repository
      .createQueryBuilder('key')
      .where('key.current_instance_id IS NOT NULL')
      .getMany();
  }

  /**
   * 查找未绑定的 API Key
   */
  async findUnassignedKeys(provider?: string): Promise<ApiKey[]> {
    const query = this.repository
      .createQueryBuilder('key')
      .where('key.current_instance_id IS NULL')
      .andWhere('key.status = :status', { status: 'active' });

    if (provider) {
      query.andWhere('key.provider = :provider', { provider });
    }

    return query.getMany();
  }

  /**
   * 统计各提供商的 API Key 数量
   */
  async countByProvider(): Promise<Record<string, number>> {
    const result = await this.repository
      .createQueryBuilder('key')
      .select('key.provider', 'provider')
      .addSelect('COUNT(*)', 'count')
      .groupBy('key.provider')
      .getRawMany();

    return result.reduce((acc, row) => {
      acc[row.provider] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * 统计活跃的 API Key 数量
   */
  async countActiveKeys(): Promise<number> {
    return this.repository.count({
      where: { status: 'active' }
    });
  }

  /**
   * 统计可用的 API Key 数量（未绑定且激活）
   */
  async countAvailableKeys(provider?: string): Promise<number> {
    const query = this.repository
      .createQueryBuilder('key')
      .where('key.status = :status', { status: 'active' })
      .andWhere('key.current_instance_id IS NULL');

    if (provider) {
      query.andWhere('key.provider = :provider', { provider });
    }

    return query.getCount();
  }

  /**
   * 统计已绑定的 API Key 数量
   */
  async countAssignedKeys(): Promise<number> {
    return this.repository
      .createQueryBuilder('key')
      .where('key.current_instance_id IS NOT NULL')
      .getCount();
  }

  /**
   * 更新元数据
   */
  async updateMetadata(id: number, metadata: Record<string, any>): Promise<void> {
    await this.repository.update(id, { metadata } as any);
  }

  /**
   * 获取使用统计
   */
  async getUsageStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    totalUsage: number;
    averageUsage: number;
  }> {
    const stats = await this.repository
      .createQueryBuilder('key')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN key.status = :active THEN 1 ELSE 0 END)', 'active')
      .addSelect('SUM(CASE WHEN key.status = :inactive THEN 1 ELSE 0 END)', 'inactive')
      .addSelect('SUM(key.usage_count)', 'totalUsage')
      .setParameters({ active: 'active', inactive: 'inactive' })
      .getRawOne();

    return {
      total: parseInt(stats.total),
      active: parseInt(stats.active),
      inactive: parseInt(stats.inactive),
      totalUsage: parseInt(stats.totalUsage) || 0,
      averageUsage: stats.total ? Math.round(parseInt(stats.totalUsage) / parseInt(stats.total)) : 0
    };
  }
}
