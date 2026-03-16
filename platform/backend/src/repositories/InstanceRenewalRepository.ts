import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { InstanceRenewal } from '../entities/InstanceRenewal.entity';
import { AppDataSource } from '../config/database';

@Service()
export class InstanceRenewalRepository {
  private _repository?: Repository<InstanceRenewal>;

  /**
   * Get repository lazily (only when first accessed)
   */
  private get repository(): Repository<InstanceRenewal> {
    if (!this._repository) {
      this._repository = AppDataSource.getRepository(InstanceRenewal);
    }
    return this._repository;
  }

  async create(data: {
    instance_id: string;
    old_expires_at: Date;
    new_expires_at: Date;
    duration_days: number;
    renewed_by: number;
  }): Promise<InstanceRenewal> {
    const renewal = this.repository.create(data);
    return await this.repository.save(renewal);
  }

  async findByInstanceId(instanceId: string): Promise<InstanceRenewal[]> {
    return await this.repository.find({
      where: { instance_id: instanceId },
      order: { renewed_at: 'DESC' },
      relations: ['renewed_by_user'],
    });
  }

  async findLatestByInstanceId(instanceId: string): Promise<InstanceRenewal | null> {
    return await this.repository.findOne({
      where: { instance_id: instanceId },
      order: { renewed_at: 'DESC' },
      relations: ['renewed_by_user'],
    });
  }
}
