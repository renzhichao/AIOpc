import { Service } from 'typedi';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { Repository } from 'typeorm';
import { InstanceRenewal } from '../entities/InstanceRenewal.entity';

@Service()
export class InstanceRenewalRepository {
  constructor(
    @InjectRepository(InstanceRenewal)
    private readonly repository: Repository<InstanceRenewal>
  ) {}

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
