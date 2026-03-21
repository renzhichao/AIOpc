import { Service } from 'typedi';
import { Repository, QueryFailedError } from 'typeorm';
import { User } from '../entities/User.entity';
import { BaseRepository } from './BaseRepository';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

/**
 * 用户仓储类
 * 处理用户相关的数据库操作
 */
@Service()
export class UserRepository extends BaseRepository<User> {
  constructor() {
    // Pass a function that gets the repository lazily
    // This ensures the repository is only accessed after DB is initialized
    super(() => AppDataSource.getRepository(User));
  }

  /**
   * 根据 Feishu 用户 ID 查找用户
   */
  async findByFeishuUserId(feishuUserId: string): Promise<User | null> {
    const result = await this.repository.findOne({
      where: { feishu_user_id: feishuUserId }
    });
    return result || null;
  }

  /**
   * 根据 Feishu Union ID 查找用户
   */
  async findByFeishuUnionId(feishuUnionId: string): Promise<User | null> {
    const result = await this.repository.findOne({
      where: { feishu_union_id: feishuUnionId }
    });
    return result || null;
  }

  /**
   * 根据钉钉用户 ID 查找用户 (TASK-008)
   */
  async findByDingtalkUserId(dingtalkUserId: string): Promise<User | null> {
    const result = await this.repository.findOne({
      where: { dingtalk_user_id: dingtalkUserId }
    });
    return result || null;
  }

  /**
   * 根据钉钉 Union ID 查找用户 (TASK-008)
   */
  async findByDingtalkUnionId(dingtalkUnionId: string): Promise<User | null> {
    const result = await this.repository.findOne({
      where: { dingtalk_union_id: dingtalkUnionId }
    });
    return result || null;
  }

  /**
   * 根据平台和用户ID查找用户 (TASK-008 - 通用方法)
   *
   * @param platform OAuth平台 (feishu/dingtalk)
   * @param userId 平台用户ID
   * @returns 用户实例或null
   */
  async findByPlatformAndUserId(
    platform: 'feishu' | 'dingtalk',
    userId: string
  ): Promise<User | null> {
    const whereClause: any = {};

    if (platform === 'feishu') {
      whereClause.feishu_user_id = userId;
    } else if (platform === 'dingtalk') {
      whereClause.dingtalk_user_id = userId;
    }

    const result = await this.repository.findOne({
      where: whereClause
    });
    return result || null;
  }

  /**
   * 根据邮箱查找用户
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.repository.findOne({
      where: { email }
    });
    return result || null;
  }

  /**
   * 查找或创建用户（支持并发重试）
   * 如果用户不存在则创建，存在则更新
   *
   * 并发保护机制 (TASK-003):
   * - 检测 PostgreSQL 错误码 23505 (unique_violation)
   * - 最多重试 3 次
   * - 冲突时重新查询用户而非直接失败
   *
   * @param feishuData Feishu 用户数据
   * @returns 用户实例
   */
  async findOrCreate(feishuData: {
    feishu_user_id: string;
    feishu_union_id?: string;
    name: string;
    email?: string;
    avatar_url?: string;
  }): Promise<User> {
    let user = await this.findByFeishuUserId(feishuData.feishu_user_id);

    if (!user) {
      // 创建新用户（带并发保护）
      user = await this.createWithRetry(feishuData);
    } else {
      // 更新用户数据
      const updateData: Partial<User> = {
        name: feishuData.name,
        email: feishuData.email,
        avatar_url: feishuData.avatar_url
      };

      if (feishuData.feishu_union_id !== undefined) {
        updateData.feishu_union_id = feishuData.feishu_union_id;
      }

      await this.repository.update(user.id, updateData);
      user = await this.findById(user.id);
    }

    return user!;
  }

  /**
   * 创建用户（带重试机制）
   *
   * TASK-003: Database Concurrent User Creation Protection
   *
   * 并发场景处理：
   * 1. 尝试创建用户
   * 2. 如果检测到 23505 错误（唯一约束冲突）
   * 3. 重新查询用户（可能是其他并发请求已创建）
   * 4. 最多重试 3 次
   *
   * @param userData 用户数据
   * @param maxRetries 最大重试次数（默认 3）
   * @returns 创建或查找到的用户
   * @throws 如果重试次数耗尽仍未成功，抛出原始错误
   */
  async createWithRetry(
    userData: Partial<User>,
    maxRetries: number = 3
  ): Promise<User> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 尝试创建用户
        const user = await this.create(userData);
        logger.info('User created successfully', {
          userId: user.id,
          feishuUserId: userData.feishu_user_id,
          attempt
        });
        return user;
      } catch (error) {
        lastError = error as Error;

        // 检查是否为 PostgreSQL 唯一约束冲突错误
        if (this.isUniqueViolationError(error)) {
          logger.warn('Unique constraint violation detected, retrying with user lookup', {
            feishuUserId: userData.feishu_user_id,
            attempt,
            maxRetries
          });

          // 重新查询用户（可能已被其他并发请求创建）
          const existingUser = await this.findByFeishuUserId(userData.feishu_user_id!);

          if (existingUser) {
            logger.info('User found after unique constraint conflict', {
              userId: existingUser.id,
              feishuUserId: userData.feishu_user_id,
              attempt
            });
            return existingUser;
          }

          // 如果仍未找到，继续重试
          if (attempt < maxRetries) {
            // 指数退避：等待一段时间后重试
            const delay = Math.pow(2, attempt) * 100; // 100ms, 200ms, 400ms
            await this.sleep(delay);
            continue;
          }
        }

        // 非唯一约束冲突错误，直接抛出
        if (attempt === 1) {
          throw error;
        }
      }
    }

    // 所有重试都失败，抛出最后一个错误
    logger.error('Failed to create user after all retries', {
      feishuUserId: userData.feishu_user_id,
      maxRetries,
      error: lastError?.message
    });
    throw lastError;
  }

  /**
   * 检查是否为 PostgreSQL 唯一约束冲突错误
   *
   * PostgreSQL Error Code 23505: unique_violation
   * 文档: https://www.postgresql.org/docs/current/errcodes-appendix.html
   *
   * @param error 错误对象
   * @returns 是否为唯一约束冲突
   */
  private isUniqueViolationError(error: unknown): boolean {
    if (
      error instanceof QueryFailedError &&
      (error as any).code === '23505'
    ) {
      return true;
    }
    return false;
  }

  /**
   * 等待指定毫秒数（用于重试退避）
   * @param ms 等待毫秒数
   * @returns Promise
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 更新最后登录时间
   */
  async updateLastLogin(userId: number): Promise<void> {
    await this.repository.update(userId, {
      last_login_at: new Date()
    } as any);
  }

  /**
   * 查找最近登录的用户
   */
  async findRecentLogins(days: number = 7, limit: number = 10): Promise<User[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.repository.find({
      where: {
        last_login_at: {
          $gte: since
        } as any
      },
      order: {
        last_login_at: 'DESC'
      },
      take: limit
    });
  }

  /**
   * 统计用户总数
   */
  async countUsers(): Promise<number> {
    return this.count();
  }

  /**
   * 统计活跃用户数（最近 N 天登录）
   */
  async countActiveUsers(days: number = 7): Promise<number> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.repository.count({
      where: {
        last_login_at: {
          $gte: since
        } as any
      } as any
    });
  }

  /**
   * 搜索用户（按名称或邮箱）
   */
  async searchUsers(keyword: string, limit: number = 20): Promise<User[]> {
    return this.repository
      .createQueryBuilder('user')
      .where('user.name LIKE :keyword', { keyword: `%${keyword}%` })
      .orWhere('user.email LIKE :keyword', { keyword: `%${keyword}%` })
      .orderBy('user.created_at', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * 获取用户总数
   */
  async getTotalUserCount(): Promise<number> {
    return this.count();
  }
}
