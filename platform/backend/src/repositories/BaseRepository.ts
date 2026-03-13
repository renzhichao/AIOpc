import { Repository, FindManyOptions, DeepPartial, ObjectLiteral } from 'typeorm';

/**
 * 基础仓储类
 * 提供通用的 CRUD 操作
 */
export abstract class BaseRepository<T extends ObjectLiteral> {
  constructor(protected repository: Repository<T>) {}

  /**
   * 创建新记录
   */
  async create(data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  /**
   * 根据 ID 查找记录
   */
  async findById(id: string | number): Promise<T | null> {
    const result = await this.repository.findOne({
      where: { id } as any
    });
    return result || null;
  }

  /**
   * 查找所有记录
   */
  async findAll(filter?: FindManyOptions<T>): Promise<T[]> {
    return this.repository.find(filter);
  }

  /**
   * 分页查询
   */
  async findWithPagination(
    page: number = 1,
    pageSize: number = 10,
    filter?: FindManyOptions<T>
  ): Promise<{ data: T[]; total: number; page: number; pageSize: number }> {
    const skip = (page - 1) * pageSize;
    const [data, total] = await this.repository.findAndCount({
      ...filter,
      skip,
      take: pageSize
    });

    return {
      data,
      total,
      page,
      pageSize
    };
  }

  /**
   * 更新记录
   */
  async update(id: string | number, data: DeepPartial<T>): Promise<T | null> {
    await this.repository.update(id, data as any);
    return this.findById(id);
  }

  /**
   * 删除记录
   */
  async delete(id: string | number): Promise<void> {
    await this.repository.delete(id);
  }

  /**
   * 统计记录数
   */
  async count(filter?: FindManyOptions<T>): Promise<number> {
    return this.repository.count(filter);
  }

  /**
   * 批量创建
   */
  async createBulk(data: DeepPartial<T>[]): Promise<T[]> {
    const entities = this.repository.create(data);
    return this.repository.save(entities);
  }

  /**
   * 检查记录是否存在
   */
  async exists(id: string | number): Promise<boolean> {
    const count = await this.repository.count({
      where: { id } as any
    });
    return count > 0;
  }
}
