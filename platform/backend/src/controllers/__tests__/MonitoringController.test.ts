import 'reflect-metadata';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MonitoringController } from '../MonitoringController';
import { InstanceService } from '../services/InstanceService';
import { DockerService } from '../services/DockerService';
import { ApiKeyService } from '../services/ApiKeyService';
import { UserRepository } from '../repositories/UserRepository';
import { AppError, ErrorCodes } from '../utils/errors';

// Mock services
jest.mock('../services/InstanceService');
jest.mock('../services/DockerService');
jest.mock('../services/ApiKeyService');
jest.mock('../repositories/UserRepository');

// Mock logger
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('MonitoringController', () => {
  let monitoringController: MonitoringController;
  let mockInstanceService: jest.Mocked<InstanceService>;
  let mockDockerService: jest.Mocked<DockerService>;
  let mockApiKeyService: jest.Mocked<ApiKeyService>;
  let mockUserRepository: jest.Mocked<UserRepository>;

  const mockUser = {
    id: 'user_123',
    feishu_user_id: 'feishu_123',
    name: 'Test User',
    role: 'user',
  };

  const mockAdmin = {
    id: 'admin_123',
    feishu_user_id: 'feishu_admin',
    name: 'Admin User',
    role: 'admin',
  };

  const mockInstance = {
    id: 'instance_123',
    owner_id: 'user_123',
    name: 'Test Instance',
    status: 'active',
    docker_container_id: 'container_123',
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockInstanceService = {
      getTotalInstanceCount: jest.fn(),
      getActiveInstanceCount: jest.fn(),
      getInstanceById: jest.fn(),
      checkInstanceHealth: jest.fn(),
      getInstanceStats: jest.fn(),
      getUserInstances: jest.fn(),
      getAllInstances: jest.fn(),
    } as any;

    mockDockerService = {
      getSystemInfo: jest.fn(),
      getContainerStats: jest.fn(),
    } as any;

    mockApiKeyService = {
      getUsageStats: jest.fn(),
    } as any;

    mockUserRepository = {
      getTotalUserCount: jest.fn(),
    } as any;

    monitoringController = new MonitoringController(
      mockInstanceService,
      mockDockerService,
      mockApiKeyService,
      mockUserRepository
    );
  });

  describe('getSystemHealth', () => {
    it('should get system health successfully', async () => {
      mockInstanceService.getTotalInstanceCount.mockResolvedValue(10);
      mockInstanceService.getActiveInstanceCount.mockResolvedValue(8);
      mockUserRepository.getTotalUserCount.mockResolvedValue(5);
      mockApiKeyService.getUsageStats.mockResolvedValue({
        total_keys: 10,
        active_keys: 8,
        total_usage: 10000,
      });
      mockDockerService.getSystemInfo.mockResolvedValue({
        server_version: '20.10.0',
        containers: 15,
        containers_running: 12,
      });

      const req = { user: mockUser };

      const result = await monitoringController.getSystemHealth(req);

      expect(result.success).toBe(true);
      expect(result.data.system.status).toBe('healthy');
      expect(result.data.instances).toEqual({
        total: 10,
        active: 8,
        inactive: 2,
      });
      expect(result.data.users.total).toBe(5);
    });

    it('should throw error when user is not authenticated', async () => {
      const req = { user: null };

      await expect(monitoringController.getSystemHealth(req)).rejects.toThrow(
        AppError
      );
    });
  });

  describe('getInstanceHealth', () => {
    it('should get instance health successfully', async () => {
      const mockHealth = {
        healthy: true,
        status: 'running',
        cpu_usage: 25.5,
        memory_usage: 512,
      };

      mockInstanceService.getInstanceById.mockResolvedValue(mockInstance);
      mockInstanceService.checkInstanceHealth.mockResolvedValue(mockHealth);

      const req = { user: mockUser };

      const result = await monitoringController.getInstanceHealth(
        'instance_123',
        req
      );

      expect(result.success).toBe(true);
      expect(result.data.instance_id).toBe('instance_123');
      expect(result.data).toMatchObject(mockHealth);
    });

    it('should throw error when instance not found', async () => {
      mockInstanceService.getInstanceById.mockResolvedValue(null);

      const req = { user: mockUser };

      await expect(
        monitoringController.getInstanceHealth('nonexistent', req)
      ).rejects.toThrow(AppError);
    });

    it('should throw error when user does not own instance', async () => {
      const otherInstance = { ...mockInstance, owner_id: 'other_user' };
      mockInstanceService.getInstanceById.mockResolvedValue(otherInstance);

      const req = { user: mockUser };

      await expect(
        monitoringController.getInstanceHealth('instance_123', req)
      ).rejects.toThrow(AppError);
    });

    it('should allow admin to access any instance', async () => {
      const otherInstance = { ...mockInstance, owner_id: 'other_user' };
      const mockHealth = { healthy: true };

      mockInstanceService.getInstanceById.mockResolvedValue(otherInstance);
      mockInstanceService.checkInstanceHealth.mockResolvedValue(mockHealth);

      const req = { user: mockAdmin };

      const result = await monitoringController.getInstanceHealth(
        'instance_123',
        req
      );

      expect(result.success).toBe(true);
    });
  });

  describe('getInstanceMetrics', () => {
    it('should get instance metrics successfully', async () => {
      const mockStats = {
        cpu_usage: 25.5,
        memory_usage: 512,
        memory_usage_percent: 50,
        network_rx: 1024,
        network_tx: 2048,
      };

      mockInstanceService.getInstanceById.mockResolvedValue(mockInstance);
      mockDockerService.getContainerStats.mockResolvedValue(mockStats);

      const req = { user: mockUser };

      const result = await monitoringController.getInstanceMetrics(
        'instance_123',
        req
      );

      expect(result.success).toBe(true);
      expect(result.data.instance_id).toBe('instance_123');
      expect(result.data.metrics).toEqual(mockStats);
    });

    it('should throw error when instance has no container', async () => {
      const instanceWithoutContainer = {
        ...mockInstance,
        docker_container_id: null,
      };

      mockInstanceService.getInstanceById.mockResolvedValue(
        instanceWithoutContainer as any
      );

      const req = { user: mockUser };

      await expect(
        monitoringController.getInstanceMetrics('instance_123', req)
      ).rejects.toThrow(AppError);
    });
  });

  describe('getSystemMetrics', () => {
    it('should get system metrics for admin', async () => {
      const mockInstances = [mockInstance];
      const mockStats = {
        cpu_usage: 25.5,
        memory_usage: 512,
      };

      mockInstanceService.getAllInstances.mockResolvedValue(mockInstances);
      mockDockerService.getContainerStats.mockResolvedValue(mockStats);
      mockDockerService.getSystemInfo.mockResolvedValue({
        server_version: '20.10.0',
        containers: 15,
      });

      const req = { user: mockAdmin };

      const result = await monitoringController.getSystemMetrics(req);

      expect(result.success).toBe(true);
      expect(result.data.docker).toBeDefined();
      expect(result.data.containers).toHaveLength(1);
    });

    it('should throw error for non-admin users', async () => {
      const req = { user: mockUser };

      await expect(monitoringController.getSystemMetrics(req)).rejects.toThrow(
        AppError
      );
    });
  });

  describe('getUsageStats', () => {
    it('should get usage statistics successfully', async () => {
      const mockInstances = [mockInstance];
      const mockInstanceStats = {
        total_requests: 100,
        total_tokens: 10000,
        uptime: 3600,
      };

      mockInstanceService.getUserInstances.mockResolvedValue(mockInstances);
      mockInstanceService.getInstanceStats.mockResolvedValue(mockInstanceStats);

      const req = { user: mockUser };

      const result = await monitoringController.getUsageStats(req, 'today');

      expect(result.success).toBe(true);
      expect(result.data.period).toBe('today');
      expect(result.data.total_instances).toBe(1);
      expect(result.data.total_usage).toBe(100);
    });

    it('should use default period when not provided', async () => {
      mockInstanceService.getUserInstances.mockResolvedValue([]);
      mockInstanceService.getInstanceStats.mockResolvedValue({});

      const req = { user: mockUser };

      const result = await monitoringController.getUsageStats(req, undefined);

      expect(result.data.period).toBe('today');
    });
  });

  describe('getAlerts', () => {
    it('should get alerts for error instances', async () => {
      const errorInstance = {
        ...mockInstance,
        status: 'error',
        name: 'Failed Instance',
      };

      mockInstanceService.getUserInstances.mockResolvedValue([errorInstance]);

      const req = { user: mockUser };

      const result = await monitoringController.getAlerts(req);

      expect(result.success).toBe(true);
      expect(result.data.alerts).toHaveLength(1);
      expect(result.data.alerts[0].type).toBe('error');
      expect(result.data.alerts[0].severity).toBe('high');
    });

    it('should get alerts for high memory usage', async () => {
      mockInstanceService.getUserInstances.mockResolvedValue([mockInstance]);
      mockDockerService.getContainerStats.mockResolvedValue({
        memory_usage_percent: 95,
      });

      const req = { user: mockUser };

      const result = await monitoringController.getAlerts(req);

      expect(result.success).toBe(true);
      expect(result.data.alerts).toHaveLength(1);
      expect(result.data.alerts[0].type).toBe('warning');
      expect(result.data.alerts[0].message).toContain('>90% memory');
    });

    it('should return empty alerts when no issues', async () => {
      mockInstanceService.getUserInstances.mockResolvedValue([mockInstance]);
      mockDockerService.getContainerStats.mockResolvedValue({
        memory_usage_percent: 50,
      });

      const req = { user: mockUser };

      const result = await monitoringController.getAlerts(req);

      expect(result.success).toBe(true);
      expect(result.data.alerts).toHaveLength(0);
      expect(result.data.count).toBe(0);
    });
  });
});
