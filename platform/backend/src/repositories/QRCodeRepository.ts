import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { QRCode } from '../entities/QRCode.entity';
import { BaseRepository } from './BaseRepository';

@Service()
export class QRCodeRepository extends BaseRepository<QRCode> {
  constructor(
    @InjectRepository(QRCode)
    repository: Repository<QRCode>
  ) {
    super(repository);
  }

  /**
   * Find QR code by token
   */
  async findByToken(token: string): Promise<QRCode | null> {
    const result = await this.repository.findOne({
      where: { token }
    });
    return result || null;
  }

  /**
   * Find QR code by instance ID
   */
  async findByInstanceId(instanceId: string): Promise<QRCode | null> {
    const result = await this.repository.findOne({
      where: { instance_id: instanceId }
    });
    return result || null;
  }

  /**
   * Find expired QR codes
   */
  async findExpired(): Promise<QRCode[]> {
    return this.repository
      .createQueryBuilder('qr_code')
      .where('qr_code.expires_at < :now', { now: new Date() })
      .getMany();
  }

  /**
   * Delete expired QR codes
   */
  async deleteExpired(): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .delete()
      .from(QRCode)
      .where('expires_at < :now', { now: new Date() })
      .execute();
  }

  /**
   * Increment scan count
   */
  async incrementScanCount(token: string): Promise<void> {
    await this.repository.increment({ token }, 'scan_count', 1);
  }

  /**
   * Mark QR code as claimed
   */
  async markAsClaimed(token: string): Promise<void> {
    await this.repository.update({ token }, { claimed_at: new Date() });
  }

  /**
   * Delete QR code by instance ID
   */
  async deleteByInstanceId(instanceId: string): Promise<void> {
    await this.repository.delete({ instance_id: instanceId });
  }
}
