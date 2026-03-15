import { Service } from 'typedi';
import { InstanceRenewalRepository } from '../repositories/InstanceRenewalRepository';
import { InstanceRenewal } from '../entities/InstanceRenewal.entity';

@Service()
export class RenewalService {
  constructor(
    private readonly renewalRepository: InstanceRenewalRepository
  ) {}

  async record(data: {
    instance_id: string;
    old_expires_at: Date;
    new_expires_at: Date;
    duration_days: number;
    renewed_by: number;
  }): Promise<InstanceRenewal> {
    return await this.renewalRepository.create(data);
  }

  async findByInstance(instanceId: string): Promise<InstanceRenewal[]> {
    return await this.renewalRepository.findByInstanceId(instanceId);
  }

  async findLatestByInstance(instanceId: string): Promise<InstanceRenewal | null> {
    return await this.renewalRepository.findLatestByInstanceId(instanceId);
  }
}
