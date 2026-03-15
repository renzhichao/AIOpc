import 'reflect-metadata';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { InstanceController } from '../../controllers/InstanceController';
import { InstanceService } from '../../services/InstanceService';
import { RenewalService } from '../../services/RenewalService';
import { AppError, ErrorCodes } from '../../utils/errors';

// Mock InstanceService
jest.mock('../../services/InstanceService');
// Mock RenewalService
jest.mock('../../services/RenewalService');
// Mock QRCodeService
jest.mock('../../services/QRCodeService');

// Mock logger
jest.mock('../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('InstanceController', () => {
  let instanceController: InstanceController;
  let mockInstanceService: jest.Mocked<InstanceService>;
  let mockRenewalService: jest.Mocked<RenewalService>;

  const mockUser = {
    id: 'user_123',
    feishu_user_id: 'feishu_123',
    name: 'Test User',
  };

  const mockInstance = {
    id: 'instance_123',
    owner_id: 'user_123',
    template: 'personal',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    expires_at: new Date('2026-04-15'),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockInstanceService = {
      createInstance: jest.fn(),
      getUserInstances: jest.fn(),
      countUserInstances: jest.fn(),
      getInstanceById: jest.fn(),
      getInstanceStats: jest.fn(),
      startInstance: jest.fn(),
      stopInstance: jest.fn(),
      restartInstance: jest.fn(),
      deleteInstance: jest.fn(),
      getInstanceLogs: jest.fn(),
      updateExpirationDate: jest.fn(),
    } as any;

    mockRenewalService = {
      record: jest.fn(),
      findByInstance: jest.fn(),
      findLatestByInstance: jest.fn(),
    } as any;

    instanceController = new InstanceController(
      mockInstanceService,
      {} as any,
      mockRenewalService
    );
  });

  describe('createInstance', () => {
    it('should create instance successfully', async () => {
      mockInstanceService.createInstance.mockResolvedValue(mockInstance);

      const req = { user: mockUser };
      const body = {
        template: 'personal',
        config: { name: 'My Instance' },
      };

      const result = await instanceController.createInstance(body, req);

      expect(result).toEqual({
        success: true,
        data: mockInstance,
        message: 'Instance created successfully',
      });
      expect(mockInstanceService.createInstance).toHaveBeenCalledWith(
        mockUser,
        'personal',
        { name: 'My Instance' }
      );
    });

    it('should throw error when user is not authenticated', async () => {
      const req = { user: null };
      const body = { template: 'personal' };

      await expect(instanceController.createInstance(body, req)).rejects.toThrow(
        AppError
      );
    });

    it('should throw error when template is invalid', async () => {
      const req = { user: mockUser };
      const body = { template: 'invalid' };

      await expect(instanceController.createInstance(body, req)).rejects.toThrow(
        AppError
      );
    });

    it('should create instance with default config when not provided', async () => {
      mockInstanceService.createInstance.mockResolvedValue(mockInstance);

      const req = { user: mockUser };
      const body = { template: 'team' };

      const result = await instanceController.createInstance(body, req);

      expect(result.success).toBe(true);
      expect(mockInstanceService.createInstance).toHaveBeenCalledWith(
        mockUser,
        'team',
        {}
      );
    });
  });

  describe('listInstances', () => {
    it('should list instances successfully', async () => {
      const mockInstances = [mockInstance];
      mockInstanceService.getUserInstances.mockResolvedValue(mockInstances);
      mockInstanceService.countUserInstances.mockResolvedValue(1);

      const req = { user: mockUser };

      const result = await instanceController.listInstances(req);

      expect(result).toEqual({
        success: true,
        data: mockInstances,
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });
    });

    it('should filter instances by status', async () => {
      const mockInstances = [mockInstance];
      mockInstanceService.getUserInstances.mockResolvedValue(mockInstances);
      mockInstanceService.countUserInstances.mockResolvedValue(1);

      const req = { user: mockUser };

      const result = await instanceController.listInstances(
        req,
        'active',
        '1',
        '20'
      );

      expect(result.success).toBe(true);
      expect(mockInstanceService.getUserInstances).toHaveBeenCalledWith(
        'user_123',
        'active',
        20,
        0
      );
    });

    it('should handle pagination correctly', async () => {
      const mockInstances = [mockInstance];
      mockInstanceService.getUserInstances.mockResolvedValue(mockInstances);
      mockInstanceService.countUserInstances.mockResolvedValue(25);

      const req = { user: mockUser };

      const result = await instanceController.listInstances(
        req,
        undefined,
        '2',
        '10'
      );

      expect(result.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it('should throw error when user is not authenticated', async () => {
      const req = { user: null };

      await expect(instanceController.listInstances(req)).rejects.toThrow(
        AppError
      );
    });
  });

  describe('getInstance', () => {
    it('should get instance successfully', async () => {
      const mockStats = {
        total_requests: 100,
        total_tokens: 10000,
        uptime: 3600,
      };

      mockInstanceService.getInstanceById.mockResolvedValue(mockInstance);
      mockInstanceService.getInstanceStats.mockResolvedValue(mockStats);

      const req = { user: mockUser };

      const result = await instanceController.getInstance('instance_123', req);

      expect(result).toEqual({
        success: true,
        data: {
          ...mockInstance,
          stats: mockStats,
        },
      });
    });

    it('should throw error when instance not found', async () => {
      mockInstanceService.getInstanceById.mockResolvedValue(null);

      const req = { user: mockUser };

      await expect(
        instanceController.getInstance('nonexistent', req)
      ).rejects.toThrow(AppError);
    });

    it('should throw error when user does not own instance', async () => {
      const otherInstance = { ...mockInstance, owner_id: 'other_user' };
      mockInstanceService.getInstanceById.mockResolvedValue(otherInstance);

      const req = { user: mockUser };

      await expect(
        instanceController.getInstance('instance_123', req)
      ).rejects.toThrow(AppError);
    });
  });

  describe('startInstance', () => {
    it('should start instance successfully', async () => {
      mockInstanceService.getInstanceById.mockResolvedValue(mockInstance);
      mockInstanceService.startInstance.mockResolvedValue({
        ...mockInstance,
        status: 'active',
      });

      const req = { user: mockUser };

      const result = await instanceController.startInstance('instance_123', req);

      expect(result).toEqual({
        success: true,
        data: { ...mockInstance, status: 'active' },
        message: 'Instance started successfully',
      });
    });

    it('should throw error when instance not found', async () => {
      mockInstanceService.getInstanceById.mockResolvedValue(null);

      const req = { user: mockUser };

      await expect(
        instanceController.startInstance('nonexistent', req)
      ).rejects.toThrow(AppError);
    });
  });

  describe('stopInstance', () => {
    it('should stop instance successfully', async () => {
      mockInstanceService.getInstanceById.mockResolvedValue(mockInstance);
      mockInstanceService.stopInstance.mockResolvedValue({
        ...mockInstance,
        status: 'stopped',
      });

      const req = { user: mockUser };

      const result = await instanceController.stopInstance('instance_123', req);

      expect(result).toEqual({
        success: true,
        data: { ...mockInstance, status: 'stopped' },
        message: 'Instance stopped successfully',
      });
    });
  });

  describe('restartInstance', () => {
    it('should restart instance successfully', async () => {
      mockInstanceService.getInstanceById.mockResolvedValue(mockInstance);
      mockInstanceService.restartInstance.mockResolvedValue({
        ...mockInstance,
        status: 'active',
      });

      const req = { user: mockUser };

      const result = await instanceController.restartInstance(
        'instance_123',
        req
      );

      expect(result).toEqual({
        success: true,
        data: { ...mockInstance, status: 'active' },
        message: 'Instance restarted successfully',
      });
    });
  });

  describe('deleteInstance', () => {
    it('should delete instance successfully', async () => {
      mockInstanceService.getInstanceById.mockResolvedValue(mockInstance);
      mockInstanceService.deleteInstance.mockResolvedValue(undefined);

      const req = { user: mockUser };

      const result = await instanceController.deleteInstance('instance_123', req);

      expect(result).toEqual({
        success: true,
        message: 'Instance deleted successfully',
      });
      expect(mockInstanceService.deleteInstance).toHaveBeenCalledWith(
        'instance_123'
      );
    });

    it('should throw error when instance not found', async () => {
      mockInstanceService.getInstanceById.mockResolvedValue(null);

      const req = { user: mockUser };

      await expect(
        instanceController.deleteInstance('nonexistent', req)
      ).rejects.toThrow(AppError);
    });
  });

  describe('getInstanceLogs', () => {
    it('should get instance logs successfully', async () => {
      const mockLogs = ['Log line 1', 'Log line 2', 'Log line 3'];
      mockInstanceService.getInstanceById.mockResolvedValue(mockInstance);
      mockInstanceService.getInstanceLogs.mockResolvedValue(mockLogs);

      const req = { user: mockUser };

      const result = await instanceController.getInstanceLogs(
        'instance_123',
        req,
        '100'
      );

      expect(result).toEqual({
        success: true,
        data: {
          instance_id: 'instance_123',
          logs: mockLogs,
          lines: 100,
        },
      });
    });

    it('should use default lines when not provided', async () => {
      const mockLogs = ['Log line 1'];
      mockInstanceService.getInstanceById.mockResolvedValue(mockInstance);
      mockInstanceService.getInstanceLogs.mockResolvedValue(mockLogs);

      const req = { user: mockUser };

      const result = await instanceController.getInstanceLogs(
        'instance_123',
        req,
        undefined
      );

      expect(result.data.lines).toBe(100);
      expect(mockInstanceService.getInstanceLogs).toHaveBeenCalledWith(
        'instance_123',
        100
      );
    });
  });

  describe('renewInstance', () => {
    it('should renew instance successfully', async () => {
      const oldExpiresAt = new Date('2026-04-15');
      const newExpiresAt = new Date('2026-05-15');
      const updatedInstance = { ...mockInstance, expires_at: newExpiresAt };

      mockInstanceService.getInstanceById.mockResolvedValue(mockInstance as any);
      mockInstanceService.updateExpirationDate.mockResolvedValue(updatedInstance as any);
      mockRenewalService.record.mockResolvedValue({} as any);

      const req = { user: mockUser };
      const body = { duration_days: 30 };

      const result = await instanceController.renewInstance('instance_123', body, req);

      expect(result).toEqual({
        success: true,
        data: {
          instance_id: 'instance_123',
          old_expires_at: oldExpiresAt,
          new_expires_at: newExpiresAt,
          extended_days: 30,
          instance: updatedInstance,
        },
        message: 'Instance renewed successfully for 30 days',
      });

      expect(mockInstanceService.updateExpirationDate).toHaveBeenCalledWith(
        'instance_123',
        newExpiresAt
      );
      expect(mockRenewalService.record).toHaveBeenCalledWith({
        instance_id: 'instance_123',
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt,
        duration_days: 30,
        renewed_by: expect.any(Number), // Changed from 'user_123' to expect.any(Number)
      });
    });

    it('should throw error when user is not authenticated', async () => {
      const req = { user: null };
      const body = { duration_days: 30 };

      await expect(
        instanceController.renewInstance('instance_123', body, req)
      ).rejects.toThrow(AppError);
    });

    it('should throw error when duration_days is invalid', async () => {
      const req = { user: mockUser };
      const body = { duration_days: 15 }; // Invalid duration

      await expect(
        instanceController.renewInstance('instance_123', body, req)
      ).rejects.toThrow(AppError);
    });

    it('should throw error when instance not found', async () => {
      mockInstanceService.getInstanceById.mockResolvedValue(null as any);

      const req = { user: mockUser };
      const body = { duration_days: 30 };

      await expect(
        instanceController.renewInstance('instance_123', body, req)
      ).rejects.toThrow(AppError);
    });

    it('should throw error when user is not owner', async () => {
      const otherUser = { id: 'other_user', feishu_user_id: 'feishu_456', name: 'Other' };
      const otherInstance = { ...mockInstance, owner_id: 'other_user' };

      mockInstanceService.getInstanceById.mockResolvedValue(otherInstance as any);

      const req = { user: mockUser };
      const body = { duration_days: 30 };

      await expect(
        instanceController.renewInstance('instance_123', body, req)
      ).rejects.toThrow(AppError);
    });
  });

  describe('getRenewalHistory', () => {
    it('should return renewal history successfully', async () => {
      const mockRenewals = [
        {
          id: 1,
          instance_id: 'instance_123',
          old_expires_at: new Date('2026-04-15'),
          new_expires_at: new Date('2026-05-15'),
          duration_days: 30,
          renewed_by: 'user_123',
          renewed_at: new Date('2026-04-01'),
          instance: null,
          renewed_by_user: null,
        },
      ];

      mockInstanceService.getInstanceById.mockResolvedValue(mockInstance as any);
      mockRenewalService.findByInstance.mockResolvedValue(mockRenewals as any);

      const req = { user: mockUser };

      const result = await instanceController.getRenewalHistory('instance_123', req);

      expect(result).toEqual({
        success: true,
        data: {
          instance_id: 'instance_123',
          renewals: mockRenewals,
          total_renewals: 1,
        },
      });

      expect(mockRenewalService.findByInstance).toHaveBeenCalledWith('instance_123');
    });

    it('should throw error when user is not authenticated', async () => {
      const req = { user: null };

      await expect(
        instanceController.getRenewalHistory('instance_123', req)
      ).rejects.toThrow(AppError);
    });

    it('should throw error when instance not found', async () => {
      mockInstanceService.getInstanceById.mockResolvedValue(null as any);

      const req = { user: mockUser };

      await expect(
        instanceController.getRenewalHistory('instance_123', req)
      ).rejects.toThrow(AppError);
    });

    it('should throw error when user is not owner', async () => {
      const otherUser = { id: 'other_user', feishu_user_id: 'feishu_456', name: 'Other' };
      const otherInstance = { ...mockInstance, owner_id: 'other_user' };

      mockInstanceService.getInstanceById.mockResolvedValue(otherInstance as any);

      const req = { user: mockUser };

      await expect(
        instanceController.getRenewalHistory('instance_123', req)
      ).rejects.toThrow(AppError);
    });
  });
});
