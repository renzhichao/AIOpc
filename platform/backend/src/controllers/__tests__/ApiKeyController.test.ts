import 'reflect-metadata';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ApiKeyController } from '../ApiKeyController';
import { ApiKeyService } from '../services/ApiKeyService';

// Mock ApiKeyService
jest.mock('../services/ApiKeyService');

// Mock logger
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ApiKeyController', () => {
  let apiKeyController: ApiKeyController;
  let mockApiKeyService: jest.Mocked<ApiKeyService>;

  const mockUsageStats = {
    total_keys: 10,
    active_keys: 8,
    total_usage: 10000,
    provider_breakdown: {
      deepseek: { total: 5, active: 4, usage: 5000 },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockApiKeyService = {
      getUsageStats: jest.fn(),
      getNearQuotaLimit: jest.fn(),
      getProviderStats: jest.fn(),
      getKeysWithUsage: jest.fn(),
      deactivateKey: jest.fn(),
      activateKey: jest.fn(),
      validateKey: jest.fn(),
    } as any;

    apiKeyController = new ApiKeyController(mockApiKeyService);
  });

  describe('getStats', () => {
    it('should get API key stats successfully', async () => {
      mockApiKeyService.getUsageStats.mockResolvedValue(mockUsageStats);

      const result = await apiKeyController.getStats();

      expect(result).toEqual({
        success: true,
        data: mockUsageStats,
      });
      expect(mockApiKeyService.getUsageStats).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database error');
      mockApiKeyService.getUsageStats.mockRejectedValue(error);

      const result = await apiKeyController.getStats();

      expect(result).toEqual({
        success: false,
        error: 'Failed to get statistics',
      });
    });
  });

  describe('getNearQuota', () => {
    it('should get keys near quota with default threshold', async () => {
      const mockKeys = [
        { id: 1, provider: 'deepseek', usage_count: 80, quota: 100 },
      ];
      mockApiKeyService.getNearQuotaLimit.mockResolvedValue(mockKeys);

      const result = await apiKeyController.getNearQuota(undefined);

      expect(result).toEqual({
        success: true,
        data: mockKeys,
      });
      expect(mockApiKeyService.getNearQuotaLimit).toHaveBeenCalledWith(0.8);
    });

    it('should get keys near quota with custom threshold', async () => {
      const mockKeys = [
        { id: 1, provider: 'deepseek', usage_count: 95, quota: 100 },
      ];
      mockApiKeyService.getNearQuotaLimit.mockResolvedValue(mockKeys);

      const result = await apiKeyController.getNearQuota('0.95');

      expect(result).toEqual({
        success: true,
        data: mockKeys,
      });
      expect(mockApiKeyService.getNearQuotaLimit).toHaveBeenCalledWith(0.95);
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Query failed');
      mockApiKeyService.getNearQuotaLimit.mockRejectedValue(error);

      const result = await apiKeyController.getNearQuota('0.8');

      expect(result).toEqual({
        success: false,
        error: 'Failed to get keys',
      });
    });
  });

  describe('getProviderStats', () => {
    it('should get provider stats successfully', async () => {
      const mockStats = {
        total: 5,
        active: 4,
        total_usage: 5000,
        average_usage: 1000,
      };
      mockApiKeyService.getProviderStats.mockResolvedValue(mockStats);

      const result = await apiKeyController.getProviderStats('deepseek');

      expect(result).toEqual({
        success: true,
        data: mockStats,
      });
      expect(mockApiKeyService.getProviderStats).toHaveBeenCalledWith('deepseek');
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Provider not found');
      mockApiKeyService.getProviderStats.mockRejectedValue(error);

      const result = await apiKeyController.getProviderStats('invalid');

      expect(result).toEqual({
        success: false,
        error: 'Failed to get provider statistics',
      });
    });
  });

  describe('getKeysWithUsage', () => {
    it('should get keys with usage successfully', async () => {
      const mockKeys = [
        {
          id: 1,
          provider: 'deepseek',
          usage_count: 100,
          quota: 1000,
          status: 'active',
        },
      ];
      mockApiKeyService.getKeysWithUsage.mockResolvedValue(mockKeys);

      const result = await apiKeyController.getKeysWithUsage('deepseek');

      expect(result).toEqual({
        success: true,
        data: mockKeys,
      });
      expect(mockApiKeyService.getKeysWithUsage).toHaveBeenCalledWith('deepseek');
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Query failed');
      mockApiKeyService.getKeysWithUsage.mockRejectedValue(error);

      const result = await apiKeyController.getKeysWithUsage('deepseek');

      expect(result).toEqual({
        success: false,
        error: 'Failed to get keys',
      });
    });
  });

  describe('deactivateKey', () => {
    it('should deactivate key successfully', async () => {
      mockApiKeyService.deactivateKey.mockResolvedValue(undefined);

      const result = await apiKeyController.deactivateKey('1');

      expect(result).toEqual({
        success: true,
        message: 'API key deactivated',
      });
      expect(mockApiKeyService.deactivateKey).toHaveBeenCalledWith(1);
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Key not found');
      mockApiKeyService.deactivateKey.mockRejectedValue(error);

      const result = await apiKeyController.deactivateKey('999');

      expect(result).toEqual({
        success: false,
        error: 'Failed to deactivate key',
      });
    });
  });

  describe('activateKey', () => {
    it('should activate key successfully', async () => {
      mockApiKeyService.activateKey.mockResolvedValue(undefined);

      const result = await apiKeyController.activateKey('1');

      expect(result).toEqual({
        success: true,
        message: 'API key activated',
      });
      expect(mockApiKeyService.activateKey).toHaveBeenCalledWith(1);
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Key not found');
      mockApiKeyService.activateKey.mockRejectedValue(error);

      const result = await apiKeyController.activateKey('999');

      expect(result).toEqual({
        success: false,
        error: 'Failed to activate key',
      });
    });
  });

  describe('validateKey', () => {
    it('should validate key successfully', async () => {
      mockApiKeyService.validateKey.mockResolvedValue(true);

      const result = await apiKeyController.validateKey('1');

      expect(result).toEqual({
        success: true,
        data: { valid: true },
      });
      expect(mockApiKeyService.validateKey).toHaveBeenCalledWith(1);
    });

    it('should return invalid for invalid key', async () => {
      mockApiKeyService.validateKey.mockResolvedValue(false);

      const result = await apiKeyController.validateKey('1');

      expect(result).toEqual({
        success: true,
        data: { valid: false },
      });
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Validation failed');
      mockApiKeyService.validateKey.mockRejectedValue(error);

      const result = await apiKeyController.validateKey('1');

      expect(result).toEqual({
        success: false,
        error: 'Failed to validate key',
      });
    });
  });
});
