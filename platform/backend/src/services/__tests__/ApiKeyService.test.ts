import { ApiKeyService } from '../ApiKeyService';
import { ApiKeyRepository } from '../../repositories/ApiKeyRepository';
import { InstanceRepository } from '../../repositories/InstanceRepository';
import { ErrorService } from '../ErrorService';
import { encrypt } from '../../utils/encryption';

describe('ApiKeyService', () => {
  let apiKeyService: ApiKeyService;
  let mockApiKeyRepository: jest.Mocked<ApiKeyRepository>;
  let mockInstanceRepository: jest.Mocked<InstanceRepository>;
  let mockErrorService: jest.Mocked<ErrorService>;

  beforeEach(() => {
    // Set encryption password to match the service default
    process.env.ENCRYPTION_PASSWORD = 'default-password-change-in-production';

    mockApiKeyRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findAvailableKey: jest.fn(),
      findByInstanceId: jest.fn(),
      findByProvider: jest.fn(),
      findAll: jest.fn(),
      count: jest.fn(),
      isQuotaExceeded: jest.fn(),
      assignKeyToInstance: jest.fn(),
      incrementUsage: jest.fn(),
      releaseKey: jest.fn(),
      countActiveKeys: jest.fn(),
      countAvailableKeys: jest.fn(),
      countAssignedKeys: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      findNearQuotaLimit: jest.fn()
    } as any;

    mockInstanceRepository = {} as any;

    mockErrorService = {
      createError: jest.fn().mockReturnValue(new Error('Test error')),
      logError: jest.fn()
    } as any;

    apiKeyService = new ApiKeyService(
      mockApiKeyRepository,
      mockInstanceRepository,
      mockErrorService
    );
  });

  describe('addApiKey', () => {
    it('should encrypt and add API key', async () => {
      mockApiKeyRepository.create.mockResolvedValue(undefined as any);

      await apiKeyService.addApiKey('deepseek', 'sk-test-key', 1000);

      expect(mockApiKeyRepository.create).toHaveBeenCalledWith({
        provider: 'deepseek',
        encrypted_key: expect.any(String),
        status: 'active',
        usage_count: 0,
        quota: 1000
      });

      // Verify key was encrypted
      const createCall = mockApiKeyRepository.create.mock.calls[0][0];
      expect(createCall.encrypted_key).toBeDefined();
      expect(createCall.encrypted_key).not.toBe('sk-test-key');
    });

    it('should use default quota if not provided', async () => {
      mockApiKeyRepository.create.mockResolvedValue(undefined as any);

      await apiKeyService.addApiKey('deepseek', 'sk-test-key');

      expect(mockApiKeyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          quota: 1000
        })
      );
    });
  });

  describe('assignKey', () => {
    const mockKey = {
      id: 1,
      encrypted_key: encrypt('sk-12345', 'default-password-change-in-production'),
      usage_count: 5,
      quota: 1000,
      provider: 'deepseek',
      status: 'active',
      current_instance_id: null
    };

    it('should assign key with least usage', async () => {
      mockApiKeyRepository.findAvailableKey.mockResolvedValue(mockKey as any);
      mockApiKeyRepository.isQuotaExceeded.mockResolvedValue(false);
      mockApiKeyRepository.assignKeyToInstance.mockResolvedValue(undefined as any);
      mockApiKeyRepository.incrementUsage.mockResolvedValue(undefined as any);

      const result = await apiKeyService.assignKey('instance-123');

      expect(result).toBe('sk-12345');
      expect(mockApiKeyRepository.findAvailableKey).toHaveBeenCalled();
      expect(mockApiKeyRepository.isQuotaExceeded).toHaveBeenCalledWith(1);
      expect(mockApiKeyRepository.assignKeyToInstance).toHaveBeenCalledWith(1, 'instance-123');
      expect(mockApiKeyRepository.incrementUsage).toHaveBeenCalledWith(1);
    });

    it('should throw error when no keys available', async () => {
      mockApiKeyRepository.findAvailableKey.mockResolvedValue(null);

      await expect(apiKeyService.assignKey('instance-123'))
        .rejects.toThrow();

      expect(mockErrorService.createError).toHaveBeenCalledWith('APIKEY_UNAVAILABLE');
      expect(mockErrorService.logError).toHaveBeenCalled();
    });

    it('should throw error when quota exceeded', async () => {
      mockApiKeyRepository.findAvailableKey.mockResolvedValue(mockKey as any);
      mockApiKeyRepository.isQuotaExceeded.mockResolvedValue(true);

      await expect(apiKeyService.assignKey('instance-123'))
        .rejects.toThrow();

      expect(mockErrorService.createError).toHaveBeenCalledWith('QUOTA_EXCEEDED', {
        apiKeyId: 1
      });
    });

    it('should return decrypted key', async () => {
      const originalKey = 'sk-original-key-123';
      const encryptedMockKey = {
        ...mockKey,
        encrypted_key: encrypt(originalKey, 'default-password-change-in-production')
      };

      mockApiKeyRepository.findAvailableKey.mockResolvedValue(encryptedMockKey as any);
      mockApiKeyRepository.isQuotaExceeded.mockResolvedValue(false);
      mockApiKeyRepository.assignKeyToInstance.mockResolvedValue(undefined as any);
      mockApiKeyRepository.incrementUsage.mockResolvedValue(undefined as any);

      const result = await apiKeyService.assignKey('instance-123');

      expect(result).toBe(originalKey);
    });
  });

  describe('releaseKey', () => {
    it('should release key from instance', async () => {
      mockApiKeyRepository.releaseKey.mockResolvedValue(undefined as any);

      await apiKeyService.releaseKey('instance-123');

      expect(mockApiKeyRepository.releaseKey).toHaveBeenCalledWith('instance-123');
    });
  });

  describe('getUsageStats', () => {
    it('should return usage statistics', async () => {
      const mockKeys = [
        { usage_count: 10 },
        { usage_count: 20 },
        { usage_count: 30 }
      ] as any;

      mockApiKeyRepository.count.mockResolvedValue(3);
      mockApiKeyRepository.countActiveKeys.mockResolvedValue(3);
      mockApiKeyRepository.countAvailableKeys.mockResolvedValue(2);
      mockApiKeyRepository.countAssignedKeys.mockResolvedValue(1);
      mockApiKeyRepository.findAll.mockResolvedValue(mockKeys);

      const stats = await apiKeyService.getUsageStats();

      expect(stats).toEqual({
        totalKeys: 3,
        activeKeys: 3,
        availableKeys: 2,
        assignedKeys: 1,
        totalUsage: 60,
        averageUsage: 20
      });
    });

    it('should handle empty key list', async () => {
      mockApiKeyRepository.count.mockResolvedValue(0);
      mockApiKeyRepository.countActiveKeys.mockResolvedValue(0);
      mockApiKeyRepository.countAvailableKeys.mockResolvedValue(0);
      mockApiKeyRepository.countAssignedKeys.mockResolvedValue(0);
      mockApiKeyRepository.findAll.mockResolvedValue([]);

      const stats = await apiKeyService.getUsageStats();

      expect(stats.totalUsage).toBe(0);
      expect(stats.averageUsage).toBe(0);
    });
  });

  describe('getNearQuotaLimit', () => {
    it('should return keys near quota limit', async () => {
      const nearLimitKeys = [
        { id: 1, usage_count: 850, quota: 1000 },
        { id: 2, usage_count: 900, quota: 1000 }
      ] as any;

      mockApiKeyRepository.findNearQuotaLimit.mockResolvedValue(nearLimitKeys);

      const result = await apiKeyService.getNearQuotaLimit(0.8);

      expect(result).toEqual(nearLimitKeys);
      expect(mockApiKeyRepository.findNearQuotaLimit).toHaveBeenCalledWith(0.8);
    });

    it('should use default threshold', async () => {
      mockApiKeyRepository.findNearQuotaLimit.mockResolvedValue([]);

      await apiKeyService.getNearQuotaLimit();

      expect(mockApiKeyRepository.findNearQuotaLimit).toHaveBeenCalledWith(0.8);
    });
  });

  describe('deactivateKey', () => {
    it('should deactivate key', async () => {
      mockApiKeyRepository.updateStatus.mockResolvedValue(undefined as any);

      await apiKeyService.deactivateKey(1);

      expect(mockApiKeyRepository.updateStatus).toHaveBeenCalledWith(1, 'inactive');
    });
  });

  describe('activateKey', () => {
    it('should activate key', async () => {
      mockApiKeyRepository.updateStatus.mockResolvedValue(undefined as any);

      await apiKeyService.activateKey(1);

      expect(mockApiKeyRepository.updateStatus).toHaveBeenCalledWith(1, 'active');
    });
  });

  describe('rotateKeys', () => {
    it('should rotate all keys with new password', async () => {
      const mockKeys = [
        { id: 1, encrypted_key: encrypt('old-key-1', 'default-password-change-in-production') },
        { id: 2, encrypted_key: encrypt('old-key-2', 'default-password-change-in-production') }
      ] as any;

      mockApiKeyRepository.findAll.mockResolvedValue(mockKeys);
      mockApiKeyRepository.update.mockResolvedValue(undefined as any);

      await apiKeyService.rotateKeys('new-password');

      expect(mockApiKeyRepository.update).toHaveBeenCalledTimes(2);
      expect(mockApiKeyRepository.findAll).toHaveBeenCalled();
    });
  });

  describe('getProviderStats', () => {
    it('should return provider statistics', async () => {
      const mockKeys = [
        { usage_count: 10, current_instance_id: null },
        { usage_count: 20, current_instance_id: 'instance-1' },
        { usage_count: 30, current_instance_id: null }
      ] as any;

      mockApiKeyRepository.findByProvider.mockResolvedValue(mockKeys);

      const stats = await apiKeyService.getProviderStats('deepseek');

      expect(stats).toEqual({
        count: 3,
        totalUsage: 60,
        available: 2
      });

      expect(mockApiKeyRepository.findByProvider).toHaveBeenCalledWith('deepseek');
    });
  });

  describe('getKeyForInstance', () => {
    it('should return decrypted key for instance', async () => {
      const originalKey = 'sk-instance-key';
      const mockKey = {
        encrypted_key: encrypt(originalKey, 'default-password-change-in-production')
      } as any;

      mockApiKeyRepository.findByInstanceId.mockResolvedValue(mockKey);

      const result = await apiKeyService.getKeyForInstance('instance-123');

      expect(result).toBe(originalKey);
    });

    it('should return null if no key assigned', async () => {
      mockApiKeyRepository.findByInstanceId.mockResolvedValue(null);

      const result = await apiKeyService.getKeyForInstance('instance-123');

      expect(result).toBeNull();
    });
  });

  describe('validateKey', () => {
    it('should return true for valid key', async () => {
      const validKey = {
        encrypted_key: encrypt('test-key', 'default-password-change-in-production')
      } as any;

      mockApiKeyRepository.findById.mockResolvedValue(validKey);

      const result = await apiKeyService.validateKey(1);

      expect(result).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      mockApiKeyRepository.findById.mockResolvedValue(null);

      const result = await apiKeyService.validateKey(1);

      expect(result).toBe(false);
    });

    it('should return false for corrupted key', async () => {
      const corruptedKey = {
        encrypted_key: 'invalid-encrypted-data'
      } as any;

      mockApiKeyRepository.findById.mockResolvedValue(corruptedKey);

      const result = await apiKeyService.validateKey(1);

      expect(result).toBe(false);
    });
  });

  describe('getKeysWithUsage', () => {
    it('should return keys with usage information', async () => {
      const mockKeys = [
        {
          id: 1,
          status: 'active',
          usage_count: 50,
          quota: 100,
          current_instance_id: null,
          last_used_at: new Date('2024-01-01')
        },
        {
          id: 2,
          status: 'active',
          usage_count: 80,
          quota: 100,
          current_instance_id: 'instance-1',
          last_used_at: new Date('2024-01-02')
        }
      ] as any;

      mockApiKeyRepository.findByProvider.mockResolvedValue(mockKeys);

      const result = await apiKeyService.getKeysWithUsage('deepseek');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 1,
        status: 'active',
        usageCount: 50,
        quota: 100,
        usagePercentage: 50,
        isAssigned: false,
        lastUsed: new Date('2024-01-01')
      });
      expect(result[1]).toEqual({
        id: 2,
        status: 'active',
        usageCount: 80,
        quota: 100,
        usagePercentage: 80,
        isAssigned: true,
        lastUsed: new Date('2024-01-02')
      });
    });
  });
});
