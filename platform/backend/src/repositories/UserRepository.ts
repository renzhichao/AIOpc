import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { User } from '../entities/User.entity';
import { BaseRepository } from './BaseRepository';

/**
 * 用户仓储类
 * 处理用户相关的数据库操作
 */
@Service()
export class UserRepository extends BaseRepository<User> {
  constructor(
    @InjectRepository(User)
    repository: Repository<User>
  ) {
    super(repository);
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
   * 根据邮箱查找用户
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.repository.findOne({
      where: { email }
    });
    return result || null;
  }

  /**
   * 查找或创建用户
   * 如果用户不存在则创建，存在则更新
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
      // 创建新用户
      user = await this.create(feishuData);
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
}
