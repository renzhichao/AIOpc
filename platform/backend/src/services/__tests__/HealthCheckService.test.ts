/**
 * Unit Tests for HealthCheckService
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { HealthCheckService } from '../HealthCheckService';
import { InstanceRepository } from '../../repositories/InstanceRepository';
import { DockerService } from '../DockerService';
import { ErrorService } from '../ErrorService';
import { Instance } from '../../entities/Instance.entity';
import { HealthStatus, ContainerStats } from '../../types/docker';
import axios from 'axios';

// Mock dependencies
jest.mock('../../repositories/InstanceRepository');
jest.mock('../DockerService');
jest.mock('../ErrorService');
jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HealthCheckService', () => {
  let healthCheckService: HealthCheckService;
  let mockInstanceRepository: jest.Mocked<InstanceRepository>;
  let mockDockerService: jest.Mocked<DockerService>;
  let mockErrorService: jest.Mocked<ErrorService>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock instances
    mockInstanceRepository = {
      findByInstanceId: jest.fn(),
      updateHealthStatus: jest.fn(),
      resetRestartAttempts: jest.fn(),
      incrementRestartAttempts: jest.fn(),
      updateStatus: jest.fn(),
      updateDockerContainerId: jest.fn(),
      findActiveInstances: jest.fn(),
      countByStatus: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findById: jest.fn(),
      findByOwnerId: jest.fn(),
      findByStatus: jest.fn(),
      findPendingInstances: jest.fn(),
      findErrorInstances: jest.fn(),
      claimInstance: jest.fn(),
      releaseInstance: jest.fn(),
      findExpiredInstances: jest.fn(),
      countByUser: jest.fn(),
      findRecoverableInstances: jest.fn()
    } as any;

    mockDockerService = {
      healthCheck: jest.fn(),
      getContainerStats: jest.fn(),
      restartContainer: jest.fn(),
      removeContainer: jest.fn(),
      createContainer: jest.fn(),
      startContainer: jest.fn(),
      stopContainer: jest.fn(),
      getContainerStatus: jest.fn(),
      getLogs: jest.fn(),
      listContainers: jest.fn()
    } as any;

    mockErrorService = {
      createError: jest.fn().mockImplementation((code, details) => {
        const error = new Error(String(code));
        (error as any).code = code;
        return error;
      }),
    } as any;

    // Create service instance with mocked dependencies
    healthCheckService = new HealthCheckService(
      mockInstanceRepository,
      mockDockerService,
      mockErrorService
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('checkInstanceHealth', () => {
    it('should return healthy status when container and HTTP checks pass', async () => {
      const instanceId = 'test-instance-1';

      // Mock Docker health check to return healthy
      const mockHealthStatus: HealthStatus = {
        status: 'healthy',
        reason: 'Container is running and healthy',
        cpuUsage: 50,
        memoryUsage: 60,
        uptime: 3600,
        lastCheck: new Date(),
      };
      mockDockerService.healthCheck.mockResolvedValue(mockHealthStatus);

      // Mock container stats
      const mockStats: ContainerStats = {
        id: instanceId,
        name: `opclaw-${instanceId}`,
        cpuPercent: 50,
        memoryUsage: 600 * 1024 * 1024,
        memoryLimit: 1024 * 1024 * 1024,
        memoryPercent: 60,
        networkRX: 0,
        networkTX: 0,
        blockRead: 0,
        blockWrite: 0,
        timestamp: new Date(),
      };
      mockDockerService.getContainerStats.mockResolvedValue(mockStats);

      // Mock axios for HTTP check to return success
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: { status: 'healthy' },
        config: {},
        headers: {},
        statusText: 'OK'
      });

      const healthResult = await healthCheckService.checkInstanceHealth(
        instanceId,
        {} // Use default options which will disable HTTP check if container is unhealthy
      );

      expect(healthResult.healthy).toBe(true);
      expect(healthResult.containerStatus.status).toBe('healthy');
      expect(healthResult.resourceUsage.cpuPercent).toBe(50);
      expect(healthResult.resourceUsage.memoryPercent).toBe(60);
      expect(mockInstanceRepository.updateHealthStatus).toHaveBeenCalledWith(
        instanceId,
        healthResult
      );
    });

    it('should return unhealthy status when container is not running', async () => {
      const instanceId = 'test-instance-2';

      // Mock Docker health check to return unhealthy
      const mockHealthStatus: HealthStatus = {
        status: 'unhealthy',
        reason: 'Container is not running (state: exited)',
        lastCheck: new Date(),
      };
      mockDockerService.healthCheck.mockResolvedValue(mockHealthStatus);

      // Mock container stats (will throw error for stopped container)
      mockDockerService.getContainerStats.mockRejectedValue(
        new Error('Container is not running')
      );

      const healthResult = await healthCheckService.checkInstanceHealth(instanceId, {});

      expect(healthResult.healthy).toBe(false);
      expect(healthResult.containerStatus.status).toBe('unknown');
    });

    it('should handle health check errors gracefully', async () => {
      const instanceId = 'test-instance-3';

      // Mock Docker service to throw error
      mockDockerService.healthCheck.mockRejectedValue(
        new Error('Docker daemon not responding')
      );

      const healthResult = await healthCheckService.checkInstanceHealth(instanceId);

      expect(healthResult.healthy).toBe(false);
      expect(healthResult.containerStatus.status).toBe('unknown');
      expect(healthResult.summary).toBe('Health check failed');
    });
  });

  describe('attemptRecovery', () => {
    const mockInstance: Instance = {
      id: 1,
      instance_id: 'test-instance-1',
      status: 'active',
      template: 'personal',
      name: 'Test Instance',
      config: {},
      created_at: new Date(),
      updated_at: new Date(),
      expires_at: new Date(),
      owner_id: 1,
      restart_attempts: 0,
      health_status: {},
      docker_container_id: 'container-123',
      claimed_at: new Date(),
      owner: null as any,
    };

    it('should not attempt recovery when instance is healthy', async () => {
      const instanceId = 'test-instance-1';

      // Mock instance repository
      mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);

      // Mock health check to return healthy
      const mockHealthStatus: HealthStatus = {
        status: 'healthy',
        reason: 'Container is running and healthy',
        cpuUsage: 50,
        memoryUsage: 60,
        uptime: 3600,
        lastCheck: new Date(),
      };
      mockDockerService.healthCheck.mockResolvedValue(mockHealthStatus);

      // Mock container stats
      const mockStats: ContainerStats = {
        id: instanceId,
        name: `opclaw-${instanceId}`,
        cpuPercent: 50,
        memoryUsage: 600 * 1024 * 1024,
        memoryLimit: 1024 * 1024 * 1024,
        memoryPercent: 60,
        networkRX: 0,
        networkTX: 0,
        blockRead: 0,
        blockWrite: 0,
        timestamp: new Date(),
      };
      mockDockerService.getContainerStats.mockResolvedValue(mockStats);

      // Mock axios for HTTP check to return success
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: { status: 'healthy' },
        config: {},
        headers: {},
        statusText: 'OK'
      });

      const recoveryResult = await healthCheckService.attemptRecovery(instanceId);

      expect(recoveryResult.action.type).toBe('none');
      expect(recoveryResult.action.success).toBe(true);
      expect(recoveryResult.currentStatus).toBe('active');
      expect(mockInstanceRepository.resetRestartAttempts).toHaveBeenCalledWith(instanceId);
      expect(mockDockerService.restartContainer).not.toHaveBeenCalled();
    });

    it('should attempt restart when instance is unhealthy and restart attempts < 3', async () => {
      const instanceId = 'test-instance-1';
      const instanceData: Instance = {
        id: 1,
        instance_id: 'test-instance-1',
        status: 'active',
        template: 'personal',
        name: 'Test Instance',
        config: {},
        created_at: new Date(),
        updated_at: new Date(),
        expires_at: new Date(),
        owner_id: 1,
        restart_attempts: 0,
        health_status: {},
        docker_container_id: 'container-123',
        claimed_at: new Date(),
        owner: null as any,
      };

      // Mock instance repository
      mockInstanceRepository.findByInstanceId.mockResolvedValue(instanceData);

      // Mock health check to return unhealthy
      const mockHealthStatus: HealthStatus = {
        status: 'unhealthy',
        reason: 'Container is not running',
        lastCheck: new Date(),
      };
      mockDockerService.healthCheck.mockResolvedValue(mockHealthStatus);

      // Mock container stats
      mockDockerService.getContainerStats.mockRejectedValue(new Error('Not running'));

      // Mock restart
      mockDockerService.restartContainer.mockResolvedValue(undefined);

      // Mock post-restart health check (still unhealthy)
      mockDockerService.healthCheck.mockResolvedValue(mockHealthStatus);

      const recoveryResult = await healthCheckService.attemptRecovery(instanceId, {
        restartDelay: 100, // Short delay for testing
      });

      expect(recoveryResult.action.type).toBe('restart');
      expect(recoveryResult.action.success).toBe(true);
      expect(recoveryResult.action.restartAttempts).toBe(1);
      expect(mockDockerService.restartContainer).toHaveBeenCalledWith(instanceId, 10);
      expect(mockInstanceRepository.incrementRestartAttempts).toHaveBeenCalledWith(instanceId);
    });

    it('should rebuild container when restart attempts reach 3', async () => {
      const instanceId = 'test-instance-1';
      const instanceData: Instance = {
        id: 1,
        instance_id: 'test-instance-1',
        status: 'active',
        template: 'personal',
        name: 'Test Instance',
        config: {},
        created_at: new Date(),
        updated_at: new Date(),
        expires_at: new Date(),
        owner_id: 1,
        restart_attempts: 3,
        health_status: {},
        docker_container_id: 'container-123',
        claimed_at: new Date(),
        owner: null as any,
      };

      // Mock instance repository
      mockInstanceRepository.findByInstanceId.mockResolvedValue(instanceData);

      // Mock health check to return unhealthy
      const mockHealthStatus: HealthStatus = {
        status: 'unhealthy',
        reason: 'Container is not running',
        lastCheck: new Date(),
      };
      mockDockerService.healthCheck.mockResolvedValue(mockHealthStatus);

      // Mock container stats
      mockDockerService.getContainerStats.mockRejectedValue(new Error('Not running'));

      // Mock remove and create
      mockDockerService.removeContainer.mockResolvedValue(undefined);
      mockDockerService.createContainer.mockResolvedValue('new-container-456');

      const recoveryResult = await healthCheckService.attemptRecovery(instanceId);

      expect(recoveryResult.action.type).toBe('rebuild');
      expect(recoveryResult.action.success).toBe(true);
      expect(recoveryResult.action.restartAttempts).toBe(0);
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith(instanceId, true, false);
      expect(mockDockerService.createContainer).toHaveBeenCalled();
    });

    it('should return recovery result with error when recovery fails', async () => {
      const instanceId = 'test-instance-1';
      const instanceData: Instance = {
        id: 1,
        instance_id: 'test-instance-1',
        status: 'active',
        template: 'personal',
        name: 'Test Instance',
        config: {},
        created_at: new Date(),
        updated_at: new Date(),
        expires_at: new Date(),
        owner_id: 1,
        restart_attempts: 0,
        health_status: {},
        docker_container_id: 'container-123',
        claimed_at: new Date(),
        owner: null as any,
      };

      // Mock instance repository
      mockInstanceRepository.findByInstanceId.mockResolvedValue(instanceData);

      // Mock health check to return unhealthy
      const mockHealthStatus: HealthStatus = {
        status: 'unhealthy',
        reason: 'Container is not running',
        lastCheck: new Date(),
      };
      mockDockerService.healthCheck.mockResolvedValue(mockHealthStatus);

      // Mock container stats
      mockDockerService.getContainerStats.mockRejectedValue(new Error('Not running'));

      // Mock restart to fail
      mockDockerService.restartContainer.mockRejectedValue(
        new Error('Failed to restart container')
      );

      const recoveryResult = await healthCheckService.attemptRecovery(instanceId, {
        restartDelay: 100,
      });

      expect(recoveryResult.action.type).toBe('restart');
      expect(recoveryResult.action.success).toBe(false);
      expect(recoveryResult.action.error).toBe('Failed to restart container');
    });
  });

  describe('runHealthCheckCycle', () => {
    it('should check health for all active instances', async () => {
      const baseInstance: Instance = {
        id: 1,
        instance_id: 'instance-1',
        status: 'active',
        template: 'personal',
        name: 'Test Instance',
        config: {},
        created_at: new Date(),
        updated_at: new Date(),
        expires_at: new Date(),
        owner_id: 1,
        restart_attempts: 0,
        health_status: {},
        docker_container_id: 'container-123',
        claimed_at: new Date(),
        owner: null as any,
      };

      const mockInstances: Instance[] = [
        {
          ...baseInstance,
          instance_id: 'instance-1',
        },
        {
          ...baseInstance,
          instance_id: 'instance-2',
        },
      ];

      // Mock active instances
      mockInstanceRepository.findActiveInstances.mockResolvedValue(mockInstances);

      // Mock health checks (one healthy, one unhealthy)
      const healthyStatus: HealthStatus = {
        status: 'healthy',
        reason: 'Container is running and healthy',
        cpuUsage: 50,
        memoryUsage: 60,
        uptime: 3600,
        lastCheck: new Date(),
      };

      const unhealthyStatus: HealthStatus = {
        status: 'unhealthy',
        reason: 'Container is not running',
        lastCheck: new Date(),
      };

      mockDockerService.healthCheck
        .mockResolvedValueOnce(healthyStatus)
        .mockResolvedValueOnce(unhealthyStatus);

      // Mock container stats for healthy instance
      const healthyStats: ContainerStats = {
        id: 'instance-1',
        name: 'opclaw-instance-1',
        cpuPercent: 50,
        memoryUsage: 600 * 1024 * 1024,
        memoryLimit: 1024 * 1024 * 1024,
        memoryPercent: 60,
        networkRX: 0,
        networkTX: 0,
        blockRead: 0,
        blockWrite: 0,
        timestamp: new Date(),
      };

      // Mock container stats to throw error for unhealthy instance
      mockDockerService.getContainerStats
        .mockResolvedValueOnce(healthyStats)
        .mockRejectedValueOnce(new Error('Container is not running'));

      // Mock axios for HTTP check to return success for healthy instance
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: { status: 'healthy' },
        config: {},
        headers: {},
        statusText: 'OK'
      });

      const statistics = await healthCheckService.runHealthCheckCycle();

      expect(statistics.totalInstances).toBe(2);
      expect(statistics.healthyCount).toBe(1);
      expect(statistics.unhealthyCount).toBe(1);
      expect(mockInstanceRepository.findActiveInstances).toHaveBeenCalled();
    });

    it('should attempt recovery for unhealthy instances', async () => {
      const baseInstance: Instance = {
        id: 1,
        instance_id: 'instance-1',
        status: 'active',
        template: 'personal',
        name: 'Test Instance',
        config: {},
        created_at: new Date(),
        updated_at: new Date(),
        expires_at: new Date(),
        owner_id: 1,
        restart_attempts: 0,
        health_status: {},
        docker_container_id: 'container-123',
        claimed_at: new Date(),
        owner: null as any,
      };

      const mockInstances: Instance[] = [
        {
          ...baseInstance,
          instance_id: 'instance-1',
          restart_attempts: 0,
        },
      ];

      // Mock active instances
      mockInstanceRepository.findActiveInstances.mockResolvedValue(mockInstances);

      // Mock findByInstanceId for recovery
      mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstances[0]);

      // Mock unhealthy health check first (before recovery)
      const unhealthyStatus: HealthStatus = {
        status: 'unhealthy',
        reason: 'Container is not running',
        lastCheck: new Date(),
      };

      // Mock healthy health check (after restart)
      const healthyStatus: HealthStatus = {
        status: 'healthy',
        reason: 'Container is running and healthy',
        cpuUsage: 50,
        memoryUsage: 60,
        uptime: 3600,
        lastCheck: new Date(),
      };

      // Mock health check to return unhealthy first, then healthy
      mockDockerService.healthCheck
        .mockResolvedValueOnce(unhealthyStatus)
        .mockResolvedValueOnce(healthyStatus);

      // Mock container stats to throw error first (unhealthy), then succeed (after restart)
      const mockStats: ContainerStats = {
        id: 'instance-1',
        name: 'opclaw-instance-1',
        cpuPercent: 50,
        memoryUsage: 600 * 1024 * 1024,
        memoryLimit: 1024 * 1024 * 1024,
        memoryPercent: 60,
        networkRX: 0,
        networkTX: 0,
        blockRead: 0,
        blockWrite: 0,
        timestamp: new Date(),
      };
      mockDockerService.getContainerStats
        .mockRejectedValueOnce(new Error('Container is not running'))
        .mockResolvedValueOnce(mockStats);

      // Mock successful restart
      mockDockerService.restartContainer.mockResolvedValue(undefined);

      // Mock repository methods for recovery
      mockInstanceRepository.incrementRestartAttempts.mockResolvedValue(undefined);
      mockInstanceRepository.resetRestartAttempts.mockResolvedValue(undefined);
      mockInstanceRepository.updateStatus.mockResolvedValue(undefined);
      mockInstanceRepository.updateHealthStatus.mockResolvedValue(undefined);

      const statistics = await healthCheckService.runHealthCheckCycle({
        restartDelay: 100,
        httpCheckEnabled: false,
      });

      expect(statistics.totalInstances).toBe(1);
      expect(statistics.healthyCount).toBe(0);
      expect(statistics.unhealthyCount).toBe(1);
      expect(statistics.recoveredCount).toBe(1);
    });
  });

  describe('getHealthStatistics', () => {
    it('should return health statistics', async () => {
      // Mock status counts
      mockInstanceRepository.countByStatus.mockResolvedValue({
        active: 5,
        stopped: 2,
        error: 1,
        recovering: 0,
        pending: 1,
      });

      const statistics = await healthCheckService.getHealthStatistics();

      expect(statistics.totalInstances).toBe(9);
      expect(statistics.healthyCount).toBe(5);
      expect(statistics.unhealthyCount).toBe(1);
      expect(statistics.statusBreakdown).toEqual({
        active: 5,
        stopped: 2,
        error: 1,
        recovering: 0,
        pending: 1,
      });
    });
  });

  describe('getHealthHistory', () => {
    it('should return empty array for instance with no history', () => {
      const history = healthCheckService.getHealthHistory('non-existent-instance');
      expect(history).toEqual([]);
    });

    it('should return health history for instance', async () => {
      const instanceId = 'test-instance-1';

      // Mock health check
      const mockHealthStatus: HealthStatus = {
        status: 'healthy',
        reason: 'Container is running and healthy',
        cpuUsage: 50,
        memoryUsage: 60,
        uptime: 3600,
        lastCheck: new Date(),
      };
      mockDockerService.healthCheck.mockResolvedValue(mockHealthStatus);

      // Mock container stats
      const mockStats: ContainerStats = {
        id: instanceId,
        name: `opclaw-${instanceId}`,
        cpuPercent: 50,
        memoryUsage: 600 * 1024 * 1024,
        memoryLimit: 1024 * 1024 * 1024,
        memoryPercent: 60,
        networkRX: 0,
        networkTX: 0,
        blockRead: 0,
        blockWrite: 0,
        timestamp: new Date(),
      };
      mockDockerService.getContainerStats.mockResolvedValue(mockStats);

      // Perform health check to populate history (disable HTTP check)
      await healthCheckService.checkInstanceHealth(instanceId, { httpCheckEnabled: false });

      // Get history
      const history = healthCheckService.getHealthHistory(instanceId);

      expect(history.length).toBe(1);
      expect(history[0].healthy).toBe(true);
    });
  });

  describe('clearHealthHistory', () => {
    it('should clear health history for instance', async () => {
      const instanceId = 'test-instance-1';

      // Mock health check
      const mockHealthStatus: HealthStatus = {
        status: 'healthy',
        reason: 'Container is running and healthy',
        cpuUsage: 50,
        memoryUsage: 60,
        uptime: 3600,
        lastCheck: new Date(),
      };
      mockDockerService.healthCheck.mockResolvedValue(mockHealthStatus);

      // Mock container stats
      const mockStats: ContainerStats = {
        id: instanceId,
        name: `opclaw-${instanceId}`,
        cpuPercent: 50,
        memoryUsage: 600 * 1024 * 1024,
        memoryLimit: 1024 * 1024 * 1024,
        memoryPercent: 60,
        networkRX: 0,
        networkTX: 0,
        blockRead: 0,
        blockWrite: 0,
        timestamp: new Date(),
      };
      mockDockerService.getContainerStats.mockResolvedValue(mockStats);

      // Perform health check to populate history (disable HTTP check)
      await healthCheckService.checkInstanceHealth(instanceId, { httpCheckEnabled: false });

      // Verify history exists
      let history = healthCheckService.getHealthHistory(instanceId);
      expect(history.length).toBe(1);

      // Clear history
      healthCheckService.clearHealthHistory(instanceId);

      // Verify history is cleared
      history = healthCheckService.getHealthHistory(instanceId);
      expect(history).toEqual([]);
    });
  });
});
