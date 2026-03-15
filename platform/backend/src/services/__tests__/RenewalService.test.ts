import { RenewalService } from '../RenewalService';
import { InstanceRenewalRepository } from '../../repositories/InstanceRenewalRepository';
import { InstanceRenewal } from '../../entities/InstanceRenewal.entity';

describe('RenewalService', () => {
  let renewalService: RenewalService;
  let mockRenewalRepository: jest.Mocked<InstanceRenewalRepository>;

  beforeEach(() => {
    mockRenewalRepository = {
      create: jest.fn(),
      findByInstanceId: jest.fn(),
      findLatestByInstanceId: jest.fn(),
    } as any;

    renewalService = new RenewalService(mockRenewalRepository);
  });

  describe('record', () => {
    it('should record a new renewal', async () => {
      const renewalData = {
        instance_id: 'test-instance-1',
        old_expires_at: new Date('2026-04-15'),
        new_expires_at: new Date('2026-05-15'),
        duration_days: 30,
        renewed_by: 1,
      };

      const expectedRenewal: InstanceRenewal = {
        id: 1,
        ...renewalData,
        renewed_at: new Date(),
        instance: null as any,
        renewed_by_user: null as any,
      };

      mockRenewalRepository.create.mockResolvedValue(expectedRenewal);

      const result = await renewalService.record(renewalData);

      expect(result).toEqual(expectedRenewal);
      expect(mockRenewalRepository.create).toHaveBeenCalledWith(renewalData);
      expect(mockRenewalRepository.create).toHaveBeenCalledTimes(1);
    });

    it('should throw error if repository fails', async () => {
      const renewalData = {
        instance_id: 'test-instance-1',
        old_expires_at: new Date('2026-04-15'),
        new_expires_at: new Date('2026-05-15'),
        duration_days: 30,
        renewed_by: 1,
      };

      mockRenewalRepository.create.mockRejectedValue(new Error('Database error'));

      await expect(renewalService.record(renewalData)).rejects.toThrow('Database error');
    });
  });

  describe('findByInstance', () => {
    it('should return all renewals for an instance', async () => {
      const instanceId = 'test-instance-1';
      const expectedRenewals: InstanceRenewal[] = [
        {
          id: 1,
          instance_id: instanceId,
          old_expires_at: new Date('2026-04-15'),
          new_expires_at: new Date('2026-05-15'),
          duration_days: 30,
          renewed_by: 1,
          renewed_at: new Date('2026-04-01'),
          instance: null as any,
          renewed_by_user: null as any,
        },
        {
          id: 2,
          instance_id: instanceId,
          old_expires_at: new Date('2026-05-15'),
          new_expires_at: new Date('2026-08-15'),
          duration_days: 90,
          renewed_by: 1,
          renewed_at: new Date('2026-05-01'),
          instance: null as any,
          renewed_by_user: null as any,
        },
      ];

      mockRenewalRepository.findByInstanceId.mockResolvedValue(expectedRenewals);

      const result = await renewalService.findByInstance(instanceId);

      expect(result).toEqual(expectedRenewals);
      expect(mockRenewalRepository.findByInstanceId).toHaveBeenCalledWith(instanceId);
      expect(mockRenewalRepository.findByInstanceId).toHaveBeenCalledTimes(1);
    });

    it('should return empty array if no renewals found', async () => {
      const instanceId = 'test-instance-1';

      mockRenewalRepository.findByInstanceId.mockResolvedValue([]);

      const result = await renewalService.findByInstance(instanceId);

      expect(result).toEqual([]);
      expect(mockRenewalRepository.findByInstanceId).toHaveBeenCalledWith(instanceId);
    });
  });

  describe('findLatestByInstance', () => {
    it('should return the latest renewal for an instance', async () => {
      const instanceId = 'test-instance-1';
      const expectedRenewal: InstanceRenewal = {
        id: 2,
        instance_id: instanceId,
        old_expires_at: new Date('2026-05-15'),
        new_expires_at: new Date('2026-08-15'),
        duration_days: 90,
        renewed_by: 1,
        renewed_at: new Date('2026-05-01'),
        instance: null as any,
        renewed_by_user: null as any,
      };

      mockRenewalRepository.findLatestByInstanceId.mockResolvedValue(expectedRenewal);

      const result = await renewalService.findLatestByInstance(instanceId);

      expect(result).toEqual(expectedRenewal);
      expect(mockRenewalRepository.findLatestByInstanceId).toHaveBeenCalledWith(instanceId);
    });

    it('should return null if no renewals found', async () => {
      const instanceId = 'test-instance-1';

      mockRenewalRepository.findLatestByInstanceId.mockResolvedValue(null);

      const result = await renewalService.findLatestByInstance(instanceId);

      expect(result).toBeNull();
      expect(mockRenewalRepository.findLatestByInstanceId).toHaveBeenCalledWith(instanceId);
    });
  });
});
