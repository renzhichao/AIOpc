import 'reflect-metadata';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { HealthCheckController } from '../HealthCheckController';
import { HealthCheckService } from '../services/HealthCheckService';
import { AppError } from '../utils/errors/AppError';

// Mock HealthCheckService
jest.mock('../services/HealthCheckService');

// Mock logger
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('HealthCheckController', () => {
  let healthCheckController: HealthCheckController;
  let mockHealthCheckService: jest.Mocked<HealthCheckService>;

  const mockHealthStatus = {
    healthy: true,
    container_status: 'running',
    http_status: 'ok',
    cpu_usage: 25.5,
    memory_usage: 512,
    timestamp: new Date(),
  };

  const mockRecoveryResult = {
    action: {
      success: true,
      action: 'restarted',
      restartAttempts: 1,
    },
    previousStatus: mockHealthStatus,
    newStatus: mockHealthStatus,
  };

  const mockHealthStatistics = {
    totalInstances: 10,
    healthyCount: 8,
    unhealthyCount: 2,
    recoveredCount: 1,
    averageCpuUsage: 30.5,
    averageMemoryUsage: 600,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockHealthCheckService = {
      checkInstanceHealth: jest.fn(),
      attemptRecovery: jest.fn(),
      getHealthStatistics: jest.fn(),
      getHealthHistory: jest.fn(),
      clearHealthHistory: jest.fn(),
      runHealthCheckCycle: jest.fn(),
    } as any;

    healthCheckController = new HealthCheckController(mockHealthCheckService);
  });

  describe('getPlatformHealth', () => {
    it('should return platform health status', async () => {
      const result = await healthCheckController.getPlatformHealth();

      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('uptime');
      expect(typeof result.uptime).toBe('number');
    });
  });

  describe('checkInstanceHealth', () => {
    it('should check instance health successfully', async () => {
      mockHealthCheckService.checkInstanceHealth.mockResolvedValue(
        mockHealthStatus
      );

      const result = await healthCheckController.checkInstanceHealth(
        'instance_123'
      );

      expect(result).toEqual(mockHealthStatus);
      expect(mockHealthCheckService.checkInstanceHealth).toHaveBeenCalledWith(
        'instance_123',
        {}
      );
    });

    it('should check instance health with custom options', async () => {
      mockHealthCheckService.checkInstanceHealth.mockResolvedValue(
        mockHealthStatus
      );

      const httpOptions = {
        httpCheckEnabled: true,
        timeout: 5000,
        retries: 3,
      };

      const result = await healthCheckController.checkInstanceHealth(
        'instance_123',
        true,
        5000,
        3
      );

      expect(result).toEqual(mockHealthStatus);
      expect(mockHealthCheckService.checkInstanceHealth).toHaveBeenCalledWith(
        'instance_123',
        httpOptions
      );
    });

    it('should throw AppError when service throws AppError', async () => {
      const appError = new AppError(404, 'NOT_FOUND', 'Instance not found');
      mockHealthCheckService.checkInstanceHealth.mockRejectedValue(appError);

      await expect(
        healthCheckController.checkInstanceHealth('nonexistent')
      ).rejects.toThrow(AppError);
    });

    it('should wrap generic errors in AppError', async () => {
      const genericError = new Error('Database connection failed');
      mockHealthCheckService.checkInstanceHealth.mockRejectedValue(
        genericError
      );

      await expect(
        healthCheckController.checkInstanceHealth('instance_123')
      ).rejects.toThrow(AppError);
    });
  });

  describe('triggerRecovery', () => {
    it('should trigger recovery successfully', async () => {
      mockHealthCheckService.attemptRecovery.mockResolvedValue(
        mockRecoveryResult
      );

      const result = await healthCheckController.triggerRecovery(
        'instance_123'
      );

      expect(result).toEqual(mockRecoveryResult);
      expect(mockHealthCheckService.attemptRecovery).toHaveBeenCalledWith(
        'instance_123',
        undefined
      );
    });

    it('should trigger recovery with custom config', async () => {
      mockHealthCheckService.attemptRecovery.mockResolvedValue(
        mockRecoveryResult
      );

      const config = {
        maxRestartAttempts: 5,
        forceRebuild: true,
      };

      const result = await healthCheckController.triggerRecovery(
        'instance_123',
        config
      );

      expect(result).toEqual(mockRecoveryResult);
      expect(mockHealthCheckService.attemptRecovery).toHaveBeenCalledWith(
        'instance_123',
        config
      );
    });

    it('should throw AppError when recovery fails', async () => {
      const error = new Error('Docker daemon not responding');
      mockHealthCheckService.attemptRecovery.mockRejectedValue(error);

      await expect(
        healthCheckController.triggerRecovery('instance_123')
      ).rejects.toThrow(AppError);
    });
  });

  describe('getHealthStatistics', () => {
    it('should get health statistics successfully', async () => {
      mockHealthCheckService.getHealthStatistics.mockResolvedValue(
        mockHealthStatistics
      );

      const result = await healthCheckController.getHealthStatistics();

      expect(result).toEqual(mockHealthStatistics);
      expect(mockHealthCheckService.getHealthStatistics).toHaveBeenCalled();
    });

    it('should throw AppError when statistics fetch fails', async () => {
      const error = new Error('Database query failed');
      mockHealthCheckService.getHealthStatistics.mockRejectedValue(error);

      await expect(
        healthCheckController.getHealthStatistics()
      ).rejects.toThrow(AppError);
    });
  });

  describe('getHealthHistory', () => {
    it('should get health history successfully', async () => {
      const mockHistory = [mockHealthStatus, mockHealthStatus];
      mockHealthCheckService.getHealthHistory.mockReturnValue(mockHistory);

      const result = await healthCheckController.getHealthHistory(
        'instance_123'
      );

      expect(result).toEqual(mockHistory);
      expect(mockHealthCheckService.getHealthHistory).toHaveBeenCalledWith(
        'instance_123'
      );
    });

    it('should throw AppError when history fetch fails', async () => {
      const error = new Error('History not found');
      mockHealthCheckService.getHealthHistory.mockImplementation(() => {
        throw error;
      });

      await expect(
        healthCheckController.getHealthHistory('instance_123')
      ).rejects.toThrow(AppError);
    });
  });

  describe('clearHealthHistory', () => {
    it('should clear health history successfully', async () => {
      mockHealthCheckService.clearHealthHistory.mockReturnValue(undefined);

      const result = await healthCheckController.clearHealthHistory(
        'instance_123'
      );

      expect(result).toEqual({ message: 'Health history cleared' });
      expect(mockHealthCheckService.clearHealthHistory).toHaveBeenCalledWith(
        'instance_123'
      );
    });

    it('should throw AppError when clear fails', async () => {
      const error = new Error('Failed to clear history');
      mockHealthCheckService.clearHealthHistory.mockImplementation(() => {
        throw error;
      });

      await expect(
        healthCheckController.clearHealthHistory('instance_123')
      ).rejects.toThrow(AppError);
    });
  });

  describe('runHealthCheckCycle', () => {
    it('should run health check cycle successfully', async () => {
      mockHealthCheckService.runHealthCheckCycle.mockResolvedValue(
        mockHealthStatistics
      );

      const result = await healthCheckController.runHealthCheckCycle();

      expect(result).toEqual(mockHealthStatistics);
      expect(mockHealthCheckService.runHealthCheckCycle).toHaveBeenCalledWith(
        undefined
      );
    });

    it('should run health check cycle with custom config', async () => {
      mockHealthCheckService.runHealthCheckCycle.mockResolvedValue(
        mockHealthStatistics
      );

      const config = {
        maxRestartAttempts: 5,
        forceRebuild: true,
      };

      const result = await healthCheckController.runHealthCheckCycle(config);

      expect(result).toEqual(mockHealthStatistics);
      expect(mockHealthCheckService.runHealthCheckCycle).toHaveBeenCalledWith(
        config
      );
    });

    it('should throw AppError when cycle fails', async () => {
      const error = new Error('Health check cycle failed');
      mockHealthCheckService.runHealthCheckCycle.mockRejectedValue(error);

      await expect(
        healthCheckController.runHealthCheckCycle()
      ).rejects.toThrow(AppError);
    });
  });
});
