import { ApiKeyRepository } from '../ApiKeyRepository';
import { ApiKey } from '../../entities/ApiKey.entity';
import { Repository } from 'typeorm';

describe('ApiKeyRepository', () => {
  let apiKeyRepository: ApiKeyRepository;
  let mockRepository: jest.Mocked<Repository<ApiKey>>;

  beforeEach(() => {
    mockRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      increment: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn()
    } as any;

    apiKeyRepository = new ApiKeyRepository(mockRepository as any);
  });

  describe('findAvailableKey', () => {
    it('should find available key with least usage', async () => {
      const mockKey = { id: 1, provider: 'deepseek', status: 'active', usage_count: 5 } as any;
      mockRepository.findOne.mockResolvedValue(mockKey);

      const result = await apiKeyRepository.findAvailableKey();

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { status: 'active' },
        order: { usage_count: 'ASC', created_at: 'ASC' }
      });
      expect(result).toEqual(mockKey);
    });

    it('should find available key by provider', async () => {
      const mockKey = { id: 1, provider: 'openai', status: 'active' } as any;
      mockRepository.findOne.mockResolvedValue(mockKey);

      const result = await apiKeyRepository.findAvailableKey('openai');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { status: 'active', provider: 'openai' },
        order: { usage_count: 'ASC', created_at: 'ASC' }
      });
      expect(result).toEqual(mockKey);
    });

    it('should return null when no key available', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await apiKeyRepository.findAvailableKey();

      expect(result).toBeNull();
    });
  });

  describe('findByInstanceId', () => {
    it('should find key by instance_id', async () => {
      const mockKey = { id: 1, current_instance_id: 'inst_1' } as any;
      mockRepository.findOne.mockResolvedValue(mockKey);

      const result = await apiKeyRepository.findByInstanceId('inst_1');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { current_instance_id: 'inst_1' }
      });
      expect(result).toEqual(mockKey);
    });

    it('should return null when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await apiKeyRepository.findByInstanceId('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByProvider', () => {
    it('should find keys by provider', async () => {
      const mockKeys = [
        { id: 1, provider: 'deepseek' } as any,
        { id: 2, provider: 'deepseek' } as any
      ];
      mockRepository.find.mockResolvedValue(mockKeys);

      const result = await apiKeyRepository.findByProvider('deepseek');

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { provider: 'deepseek' },
        order: { usage_count: 'ASC' }
      });
      expect(result).toEqual(mockKeys);
    });
  });

  describe('incrementUsage', () => {
    it('should increment usage count and update last_used_at', async () => {
      mockRepository.increment.mockResolvedValue({} as any);
      mockRepository.update.mockResolvedValue({} as any);

      await apiKeyRepository.incrementUsage(1);

      expect(mockRepository.increment).toHaveBeenCalledWith({ id: 1 }, 'usage_count', 1);
      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        last_used_at: expect.any(Date)
      });
    });
  });

  describe('releaseKey', () => {
    it('should release key from instance', async () => {
      mockRepository.update.mockResolvedValue({} as any);

      await apiKeyRepository.releaseKey('inst_1');

      expect(mockRepository.update).toHaveBeenCalledWith(
        { current_instance_id: 'inst_1' },
        { current_instance_id: null }
      );
    });
  });

  describe('assignKeyToInstance', () => {
    it('should assign key to instance', async () => {
      mockRepository.update.mockResolvedValue({} as any);

      await apiKeyRepository.assignKeyToInstance(1, 'inst_1');

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        current_instance_id: 'inst_1'
      });
    });
  });

  describe('updateStatus', () => {
    it('should update key status', async () => {
      mockRepository.update.mockResolvedValue({} as any);

      await apiKeyRepository.updateStatus(1, 'inactive');

      expect(mockRepository.update).toHaveBeenCalledWith(1, { status: 'inactive' });
    });
  });

  describe('deactivateKey', () => {
    it('should deactivate key and release instance', async () => {
      mockRepository.update.mockResolvedValue({} as any);

      await apiKeyRepository.deactivateKey(1);

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        status: 'inactive',
        current_instance_id: undefined
      });
    });
  });

  describe('activateKey', () => {
    it('should activate key', async () => {
      mockRepository.update.mockResolvedValue({} as any);

      await apiKeyRepository.activateKey(1);

      expect(mockRepository.update).toHaveBeenCalledWith(1, { status: 'active' });
    });
  });

  describe('isQuotaExceeded', () => {
    it('should return true when quota exceeded', async () => {
      const mockKey = { id: 1, usage_count: 1000, quota: 1000 } as any;
      mockRepository.findOne.mockResolvedValue(mockKey);

      const result = await apiKeyRepository.isQuotaExceeded(1);

      expect(result).toBe(true);
    });

    it('should return false when quota not exceeded', async () => {
      const mockKey = { id: 1, usage_count: 500, quota: 1000 } as any;
      mockRepository.findOne.mockResolvedValue(mockKey);

      const result = await apiKeyRepository.isQuotaExceeded(1);

      expect(result).toBe(false);
    });

    it('should return false when key not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await apiKeyRepository.isQuotaExceeded(1);

      expect(result).toBe(false);
    });
  });

  describe('findNearQuotaLimit', () => {
    it('should find keys near quota limit', async () => {
      const mockKeys = [
        { id: 1, usage_count: 950, quota: 1000 } as any,
        { id: 2, usage_count: 920, quota: 1000 } as any
      ];
      mockRepository.find.mockResolvedValue(mockKeys);

      const result = await apiKeyRepository.findNearQuotaLimit(0.9);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { status: 'active' }
      });
      expect(result).toEqual(mockKeys);
    });

    it('should filter keys above threshold', async () => {
      const mockKeys = [
        { id: 1, usage_count: 950, quota: 1000 } as any,
        { id: 2, usage_count: 500, quota: 1000 } as any,
        { id: 3, usage_count: 920, quota: 1000 } as any
      ];
      mockRepository.find.mockResolvedValue(mockKeys);

      const result = await apiKeyRepository.findNearQuotaLimit(0.9);

      expect(result).toHaveLength(2);
      expect(result.every(key => key.usage_count >= 900)).toBe(true);
    });
  });

  describe('findAssignedKeys', () => {
    it('should find assigned keys', async () => {
      const mockKeys = [
        { id: 1, current_instance_id: 'inst_1' } as any,
        { id: 2, current_instance_id: 'inst_2' } as any
      ];
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockKeys)
      };

      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await apiKeyRepository.findAssignedKeys();

      expect(queryBuilder.where).toHaveBeenCalledWith('key.current_instance_id IS NOT NULL');
      expect(result).toEqual(mockKeys);
    });
  });

  describe('findUnassignedKeys', () => {
    it('should find unassigned keys', async () => {
      const mockKeys = [
        { id: 1, current_instance_id: null, status: 'active' } as any
      ];
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockKeys)
      };

      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await apiKeyRepository.findUnassignedKeys();

      expect(queryBuilder.where).toHaveBeenCalledWith('key.current_instance_id IS NULL');
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('key.status = :status', {
        status: 'active'
      });
      expect(result).toEqual(mockKeys);
    });

    it('should filter by provider', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([])
      };

      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      await apiKeyRepository.findUnassignedKeys('deepseek');

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('key.provider = :provider', {
        provider: 'deepseek'
      });
    });
  });

  describe('countByProvider', () => {
    it('should count keys by provider', async () => {
      const mockResult = [
        { provider: 'deepseek', count: '5' },
        { provider: 'openai', count: '3' }
      ];
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockResult)
      };

      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await apiKeyRepository.countByProvider();

      expect(result).toEqual({
        deepseek: 5,
        openai: 3
      });
    });
  });

  describe('countActiveKeys', () => {
    it('should count active keys', async () => {
      mockRepository.count.mockResolvedValue(10);

      const result = await apiKeyRepository.countActiveKeys();

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { status: 'active' }
      });
      expect(result).toBe(10);
    });
  });

  describe('countAvailableKeys', () => {
    it('should count available keys', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(5)
      };

      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await apiKeyRepository.countAvailableKeys();

      expect(queryBuilder.where).toHaveBeenCalledWith('key.status = :status', {
        status: 'active'
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('key.current_instance_id IS NULL');
      expect(result).toBe(5);
    });
  });

  describe('updateMetadata', () => {
    it('should update metadata', async () => {
      const metadata = { tags: ['test'], environment: 'prod' };
      mockRepository.update.mockResolvedValue({} as any);

      await apiKeyRepository.updateMetadata(1, metadata);

      expect(mockRepository.update).toHaveBeenCalledWith(1, { metadata });
    });
  });

  describe('getUsageStats', () => {
    it('should return usage statistics', async () => {
      const mockStats = {
        total: '10',
        active: '8',
        inactive: '2',
        totalUsage: '5000'
      };
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(mockStats)
      };

      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await apiKeyRepository.getUsageStats();

      expect(result).toEqual({
        total: 10,
        active: 8,
        inactive: 2,
        totalUsage: 5000,
        averageUsage: 500
      });
    });
  });
});
