/**
 * Unit Tests for InstanceService
 *
 * Tests instance lifecycle management, state transitions,
 * and integration with Docker and API Key services.
 */

import { InstanceService } from '../InstanceService';
import { InstanceRepository } from '../../repositories/InstanceRepository';
import { DockerService } from '../DockerService';
import { ApiKeyService } from '../ApiKeyService';
import { ErrorService } from '../ErrorService';
import { Instance } from '../../entities/Instance.entity';
import { User } from '../../entities/User.entity';
import { AppError } from '../../utils/errors/AppError';
import { InstanceConfig } from '../../types/docker';

// Mock dependencies
jest.mock('../../repositories/InstanceRepository');
jest.mock('../DockerService');
jest.mock('../ApiKeyService');
jest.mock('../ErrorService');
jest.mock('../../config/logger');

describe('InstanceService', () => {
  let instanceService: InstanceService;
  let mockInstanceRepository: jest.Mocked<InstanceRepository>;
  let mockDockerService: jest.Mocked<DockerService>;
  let mockApiKeyService: jest.Mocked<ApiKeyService>;
  let mockErrorService: jest.Mocked<ErrorService>;

  const mockUser: User = {
    id: 1,
    feishu_user_id: 'feishu_123',
    feishu_union_id: 'union_123',
    name: 'Test User',
    email: 'test@example.com',
    avatar_url: 'https://example.com/avatar.jpg',
    created_at: new Date(),
    last_login_at: new Date()
  };

  const mockInstance: Instance = {
    id: 1,
    instance_id: 'inst-abc123',
    status: 'active',
    template: 'personal',
    config: {},
    created_at: new Date(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    owner_id: mockUser.id,
    owner: mockUser,
    claimed_at: new Date(),
    docker_container_id: 'container-xyz789',
    restart_attempts: 0,
    health_status: {}
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockInstanceRepository = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findById: jest.fn(),
      findByInstanceId: jest.fn(),
      findByOwnerId: jest.fn(),
      findByStatus: jest.fn(),
      findActiveInstances: jest.fn(),
      findPendingInstances: jest.fn(),
      findErrorInstances: jest.fn(),
      updateStatus: jest.fn(),
      updateHealthStatus: jest.fn(),
      claimInstance: jest.fn(),
      releaseInstance: jest.fn(),
      updateDockerContainerId: jest.fn(),
      incrementRestartAttempts: jest.fn(),
      resetRestartAttempts: jest.fn(),
      findExpiredInstances: jest.fn(),
      countByStatus: jest.fn(),
      countByUser: jest.fn(),
      findRecoverableInstances: jest.fn()
    } as any;

    mockDockerService = {
      createContainer: jest.fn(),
      startContainer: jest.fn(),
      stopContainer: jest.fn(),
      restartContainer: jest.fn(),
      removeContainer: jest.fn(),
      getContainerStatus: jest.fn(),
      getContainerStats: jest.fn(),
      healthCheck: jest.fn(),
      getLogs: jest.fn(),
      listContainers: jest.fn()
    } as any;

    mockApiKeyService = {
      assignKey: jest.fn(),
      releaseKey: jest.fn(),
      addApiKey: jest.fn(),
      getUsageStats: jest.fn(),
      getNearQuotaLimit: jest.fn(),
      deactivateKey: jest.fn(),
      activateKey: jest.fn(),
      rotateKeys: jest.fn(),
      getProviderStats: jest.fn(),
      getKeyForInstance: jest.fn(),
      validateKey: jest.fn(),
      getKeysWithUsage: jest.fn()
    } as any;

    mockErrorService = {
      createError: jest.fn().mockImplementation((code, details) => {
        const errorMessages: Record<string, string> = {
          INSTANCE_CREATE_FAILED: 'Failed to create instance',
          INSTANCE_START_FAILED: 'Failed to start instance',
          INSTANCE_STOP_FAILED: 'Failed to stop instance',
          INSTANCE_RESTART_FAILED: 'Failed to restart instance',
          INSTANCE_DELETE_FAILED: 'Failed to delete instance',
          INSTANCE_NOT_FOUND: 'Instance not found',
          INSTANCE_STATUS_FAILED: 'Failed to get instance status',
          INSTANCE_ALREADY_CLAIMED: 'Instance already claimed',
          INSTANCE_RELEASE_FAILED: 'Failed to release instance',
          INVALID_STATE_TRANSITION: 'Invalid state transition'
        };

        const error = new AppError(
          500,
          code,
          errorMessages[code] || 'Unknown error',
          details
        );
        return error;
      }),
      logError: jest.fn()
    } as any;

    // Create service instance with mocked dependencies
    instanceService = new InstanceService(
      mockInstanceRepository,
      mockDockerService,
      mockApiKeyService,
      mockErrorService
    );
  });

  describe('createInstance', () => {
    it('should create a new instance successfully', async () => {
      // Arrange
      const options = {
        template: 'personal' as const,
        config: { temperature: 0.8 }
      };

      mockInstanceRepository.create.mockResolvedValue(mockInstance);
      mockApiKeyService.assignKey.mockResolvedValue('test-api-key');
      mockDockerService.createContainer.mockResolvedValue('container-xyz789');
      mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);

      // Act
      const result = await instanceService.createInstance(mockUser, options);

      // Assert
      expect(mockInstanceRepository.create).toHaveBeenCalledWith({
        instance_id: expect.any(String),
        owner_id: mockUser.id,
        status: 'pending',
        template: 'personal',
        config: { temperature: 0.8 },
        expires_at: expect.any(Date),
        restart_attempts: 0,
        health_status: {}
      });

      expect(mockApiKeyService.assignKey).toHaveBeenCalledWith(expect.any(String));
      expect(mockDockerService.createContainer).toHaveBeenCalled();
      expect(mockInstanceRepository.update).toHaveBeenCalled();

      expect(result).toEqual(mockInstance);
    });

    it('should use default expiration when not provided', async () => {
      // Arrange
      const options = {
        template: 'personal' as const
      };

      mockInstanceRepository.create.mockResolvedValue(mockInstance);
      mockApiKeyService.assignKey.mockResolvedValue('test-api-key');
      mockDockerService.createContainer.mockResolvedValue('container-xyz789');
      mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);

      // Act
      await instanceService.createInstance(mockUser, options);

      // Assert
      const createCall = mockInstanceRepository.create.mock.calls[0][0];
      expect(createCall.expires_at).toBeInstanceOf(Date);

      const now = new Date();
      const expiresAt = createCall.expires_at as Date;
      const daysDiff = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      // Should be approximately 30 days (allow 1 day variance)
      expect(daysDiff).toBeGreaterThanOrEqual(29);
      expect(daysDiff).toBeLessThanOrEqual(31);
    });

    it('should use correct default skills for each template', async () => {
      // Arrange
      const templates = [
        { template: 'personal' as const, expectedSkills: ['chat', 'code', 'write'] },
        { template: 'team' as const, expectedSkills: ['chat', 'code', 'write', 'analyze', 'collaborate'] },
        { template: 'enterprise' as const, expectedSkills: ['chat', 'code', 'write', 'analyze', 'collaborate', 'integrate', 'automate'] }
      ];

      for (const { template, expectedSkills } of templates) {
        mockInstanceRepository.create.mockResolvedValue(mockInstance);
        mockApiKeyService.assignKey.mockResolvedValue('test-api-key');
        mockDockerService.createContainer.mockResolvedValue('container-xyz789');
        mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);

        // Act
        await instanceService.createInstance(mockUser, { template });

        // Assert
        const updateCall = mockInstanceRepository.update.mock.calls[mockInstanceRepository.update.mock.calls.length - 1];
        const config = updateCall[1].config as InstanceConfig;
        expect(config.skills).toEqual(expectedSkills);
      }
    });

    it('should throw error when creation fails', async () => {
      // Arrange
      const options = {
        template: 'personal' as const
      };

      mockInstanceRepository.create.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(instanceService.createInstance(mockUser, options))
        .rejects.toThrow();

      expect(mockErrorService.createError).toHaveBeenCalledWith(
        'INSTANCE_CREATE_FAILED',
        expect.objectContaining({
          userId: mockUser.id,
          template: 'personal'
        })
      );
    });
  });

  describe('startInstance', () => {
    it('should start a stopped instance successfully', async () => {
      // Arrange
      const stoppedInstance = { ...mockInstance, status: 'stopped' };
      mockInstanceRepository.findByInstanceId.mockResolvedValue(stoppedInstance);
      mockInstanceRepository.findByInstanceId.mockResolvedValue(stoppedInstance);
      mockDockerService.startContainer.mockResolvedValue(undefined);

      // Act
      const result = await instanceService.startInstance(mockInstance.instance_id);

      // Assert
      expect(mockDockerService.startContainer).toHaveBeenCalledWith(mockInstance.instance_id);
      expect(mockInstanceRepository.updateStatus).toHaveBeenCalledWith(
        mockInstance.instance_id,
        'active'
      );
      expect(mockInstanceRepository.resetRestartAttempts).toHaveBeenCalledWith(mockInstance.instance_id);
      expect(result).toEqual(stoppedInstance);
    });

    it('should validate state transition from stopped to active', async () => {
      // Arrange
      const stoppedInstance = { ...mockInstance, status: 'stopped' };
      mockInstanceRepository.findByInstanceId.mockResolvedValue(stoppedInstance);
      mockDockerService.startContainer.mockResolvedValue(undefined);

      // Act
      await instanceService.startInstance(mockInstance.instance_id);

      // Assert - should not throw error
      expect(mockDockerService.startContainer).toHaveBeenCalled();
    });

    it('should throw error for invalid state transition', async () => {
      // Arrange
      const activeInstance = { ...mockInstance, status: 'active' };
      mockInstanceRepository.findByInstanceId.mockResolvedValue(activeInstance);

      // Act & Assert
      await expect(instanceService.startInstance(mockInstance.instance_id))
        .rejects.toThrow();

      expect(mockErrorService.createError).toHaveBeenCalledWith(
        'INVALID_STATE_TRANSITION',
        expect.objectContaining({
          currentStatus: 'active',
          newStatus: 'active'
        })
      );
    });

    it('should throw error when instance not found', async () => {
      // Arrange
      mockInstanceRepository.findByInstanceId.mockResolvedValue(null);

      // Act & Assert
      await expect(instanceService.startInstance('non-existent'))
        .rejects.toThrow();

      expect(mockErrorService.createError).toHaveBeenCalledWith(
        'INSTANCE_NOT_FOUND',
        { instanceId: 'non-existent' }
      );
    });
  });

  describe('stopInstance', () => {
    it('should stop an active instance successfully', async () => {
      // Arrange
      mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);
      mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);
      mockDockerService.stopContainer.mockResolvedValue(undefined);

      // Act
      const result = await instanceService.stopInstance(mockInstance.instance_id, 10);

      // Assert
      expect(mockDockerService.stopContainer).toHaveBeenCalledWith(mockInstance.instance_id, 10);
      expect(mockInstanceRepository.updateStatus).toHaveBeenCalledWith(
        mockInstance.instance_id,
        'stopped'
      );
      expect(result).toEqual(mockInstance);
    });

    it('should use default timeout when not provided', async () => {
      // Arrange
      mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);
      mockDockerService.stopContainer.mockResolvedValue(undefined);

      // Act
      await instanceService.stopInstance(mockInstance.instance_id);

      // Assert
      expect(mockDockerService.stopContainer).toHaveBeenCalledWith(mockInstance.instance_id, 10);
    });
  });

  describe('restartInstance', () => {
    it('should restart an active instance successfully', async () => {
      // Arrange
      mockInstanceRepository.findByInstanceId
        .mockResolvedValueOnce(mockInstance) // First call for validation
        .mockResolvedValueOnce(mockInstance); // Second call for return
      mockDockerService.restartContainer.mockResolvedValue(undefined);

      // Act
      const result = await instanceService.restartInstance(mockInstance.instance_id, 10);

      // Assert
      expect(mockDockerService.restartContainer).toHaveBeenCalledWith(mockInstance.instance_id, 10);
      expect(mockInstanceRepository.updateStatus).toHaveBeenCalledWith(
        mockInstance.instance_id,
        'active'
      );
      expect(mockInstanceRepository.incrementRestartAttempts).toHaveBeenCalledWith(
        mockInstance.instance_id
      );
      expect(result).toEqual(mockInstance);
    });
  });

  describe('deleteInstance', () => {
    it('should delete an instance successfully', async () => {
      // Arrange
      mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);
      mockInstanceRepository.delete.mockResolvedValue(undefined);

      // Act
      await instanceService.deleteInstance(mockInstance.instance_id, false);

      // Assert
      expect(mockApiKeyService.releaseKey).toHaveBeenCalledWith(mockInstance.instance_id);
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith(
        mockInstance.instance_id,
        false,
        true
      );
      expect(mockInstanceRepository.delete).toHaveBeenCalledWith(mockInstance.id);
    });

    it('should force delete when requested', async () => {
      // Arrange
      mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);
      mockInstanceRepository.delete.mockResolvedValue(undefined);

      // Act
      await instanceService.deleteInstance(mockInstance.instance_id, true);

      // Assert
      expect(mockDockerService.removeContainer).toHaveBeenCalledWith(
        mockInstance.instance_id,
        true,
        true
      );
    });
  });

  describe('getInstanceById', () => {
    it('should return instance when found', async () => {
      // Arrange
      mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);

      // Act
      const result = await instanceService.getInstanceById(mockInstance.instance_id);

      // Assert
      expect(result).toEqual(mockInstance);
      expect(mockInstanceRepository.findByInstanceId).toHaveBeenCalledWith(mockInstance.instance_id);
    });

    it('should throw error when instance not found', async () => {
      // Arrange
      mockInstanceRepository.findByInstanceId.mockResolvedValue(null);

      // Act & Assert
      await expect(instanceService.getInstanceById('non-existent'))
        .rejects.toThrow();

      expect(mockErrorService.createError).toHaveBeenCalledWith(
        'INSTANCE_NOT_FOUND',
        { instanceId: 'non-existent' }
      );
    });
  });

  describe('getInstanceStatus', () => {
    it('should return instance status successfully', async () => {
      // Arrange
      mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);
      mockDockerService.getContainerStatus.mockResolvedValue({
        id: 'container-xyz789',
        name: 'opclaw-inst-abc123',
        state: 'running',
        status: 'Up 2 hours',
        isRunning: true,
        isPaused: false,
        isRestarting: false,
        created: new Date(),
        started: new Date()
      });

      // Act
      const result = await instanceService.getInstanceStatus(mockInstance.instance_id);

      // Assert
      expect(result).toEqual({
        instanceId: mockInstance.instance_id,
        status: 'active',
        containerId: 'container-xyz789',
        ownerId: mockInstance.owner_id,
        createdAt: mockInstance.created_at,
        expiresAt: mockInstance.expires_at,
        healthStatus: mockInstance.health_status,
        restartAttempts: mockInstance.restart_attempts
      });
    });

    it('should handle Docker service errors gracefully', async () => {
      // Arrange
      mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);
      mockDockerService.getContainerStatus.mockRejectedValue(new Error('Docker error'));

      // Act
      const result = await instanceService.getInstanceStatus(mockInstance.instance_id);

      // Assert
      expect(result.containerId).toBe('container-xyz789'); // From instance record
      expect(result.instanceId).toBe(mockInstance.instance_id);
    });
  });

  describe('getInstanceHealth', () => {
    it('should return health status successfully', async () => {
      // Arrange
      const expectedHealth = {
        status: 'healthy' as const,
        reason: 'Container is running and healthy',
        cpuUsage: 5.5,
        memoryUsage: 45.2,
        uptime: 7200,
        lastCheck: new Date()
      };

      mockDockerService.healthCheck.mockResolvedValue(expectedHealth);
      mockInstanceRepository.updateHealthStatus.mockResolvedValue(undefined);

      // Act
      const result = await instanceService.getInstanceHealth(mockInstance.instance_id);

      // Assert
      expect(result).toEqual(expectedHealth);
      expect(mockDockerService.healthCheck).toHaveBeenCalledWith(mockInstance.instance_id);
      expect(mockInstanceRepository.updateHealthStatus).toHaveBeenCalledWith(
        mockInstance.instance_id,
        expectedHealth
      );
    });

    it('should return unknown status on error', async () => {
      // Arrange
      mockDockerService.healthCheck.mockRejectedValue(new Error('Health check failed'));

      // Act
      const result = await instanceService.getInstanceHealth(mockInstance.instance_id);

      // Assert
      expect(result).toEqual({
        status: 'unknown',
        reason: 'Failed to check health',
        lastCheck: expect.any(Date)
      });
    });
  });

  describe('listUserInstances', () => {
    it('should return user instances', async () => {
      // Arrange
      const userInstances = [mockInstance];
      mockInstanceRepository.findByOwnerId.mockResolvedValue(userInstances);

      // Act
      const result = await instanceService.listUserInstances(mockUser.id);

      // Assert
      expect(result).toEqual(userInstances);
      expect(mockInstanceRepository.findByOwnerId).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('getInstanceStats', () => {
    it('should return instance statistics', async () => {
      // Arrange
      const statusCounts = {
        active: 5,
        stopped: 3,
        pending: 1,
        error: 2,
        recovering: 0
      };
      mockInstanceRepository.countByStatus.mockResolvedValue(statusCounts);

      // Act
      const result = await instanceService.getInstanceStats();

      // Assert
      expect(result).toEqual({
        total: 11,
        active: 5,
        stopped: 3,
        pending: 1,
        error: 2,
        recovering: 0
      });
    });

    it('should handle empty status counts', async () => {
      // Arrange
      mockInstanceRepository.countByStatus.mockResolvedValue({});

      // Act
      const result = await instanceService.getInstanceStats();

      // Assert
      expect(result).toEqual({
        total: 0,
        active: 0,
        stopped: 0,
        pending: 0,
        error: 0,
        recovering: 0
      });
    });
  });

  describe('claimInstance', () => {
    it('should claim an unclaimed instance successfully', async () => {
      // Arrange
      const unclaimedInstance = { ...mockInstance, owner_id: null as any };
      mockInstanceRepository.findByInstanceId
        .mockResolvedValueOnce(unclaimedInstance as any) // First call - check if claimed
        .mockResolvedValueOnce(mockInstance); // Second call - return updated instance
      mockInstanceRepository.claimInstance.mockResolvedValue(undefined);

      // Act
      const result = await instanceService.claimInstance(mockInstance.instance_id, mockUser.id);

      // Assert
      expect(mockInstanceRepository.claimInstance).toHaveBeenCalledWith(
        mockInstance.instance_id,
        mockUser.id
      );
      expect(result).toEqual(mockInstance);
    });

    it('should throw error when instance already claimed', async () => {
      // Arrange
      mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);

      // Act & Assert
      await expect(instanceService.claimInstance(mockInstance.instance_id, mockUser.id))
        .rejects.toThrow();

      expect(mockErrorService.createError).toHaveBeenCalledWith(
        'INSTANCE_ALREADY_CLAIMED',
        {
          instanceId: mockInstance.instance_id,
          ownerId: mockInstance.owner_id
        }
      );
    });
  });

  describe('releaseInstance', () => {
    it('should release an instance successfully', async () => {
      // Arrange
      mockInstanceRepository.releaseInstance.mockResolvedValue(undefined);

      // Act
      await instanceService.releaseInstance(mockInstance.instance_id);

      // Assert
      expect(mockInstanceRepository.releaseInstance).toHaveBeenCalledWith(mockInstance.instance_id);
    });

    it('should throw error on release failure', async () => {
      // Arrange
      mockInstanceRepository.releaseInstance.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(instanceService.releaseInstance(mockInstance.instance_id))
        .rejects.toThrow();

      expect(mockErrorService.createError).toHaveBeenCalledWith(
        'INSTANCE_RELEASE_FAILED',
        expect.objectContaining({
          instanceId: mockInstance.instance_id
        })
      );
    });
  });

  describe('State Transition Validation', () => {
    it('should allow transition from pending to active via startInstance', async () => {
      // Arrange
      const instance = { ...mockInstance, status: 'pending' };
      mockInstanceRepository.findByInstanceId.mockResolvedValue(instance);
      mockDockerService.startContainer.mockResolvedValue(undefined);

      // Act & Assert - should not throw error
      await expect(instanceService.startInstance(instance.instance_id)).resolves.not.toThrow();
    });

    it('should allow transition from stopped to active via startInstance', async () => {
      // Arrange
      const instance = { ...mockInstance, status: 'stopped' };
      mockInstanceRepository.findByInstanceId.mockResolvedValue(instance);
      mockDockerService.startContainer.mockResolvedValue(undefined);

      // Act & Assert - should not throw error
      await expect(instanceService.startInstance(instance.instance_id)).resolves.not.toThrow();
    });

    it('should allow transition from active to stopped via stopInstance', async () => {
      // Arrange
      const instance = { ...mockInstance, status: 'active' };
      mockInstanceRepository.findByInstanceId.mockResolvedValue(instance);
      mockDockerService.stopContainer.mockResolvedValue(undefined);

      // Act & Assert - should not throw error
      await expect(instanceService.stopInstance(instance.instance_id)).resolves.not.toThrow();
    });

    it('should allow transition from active to active via restartInstance', async () => {
      // Arrange
      const instance = { ...mockInstance, status: 'active' };
      mockInstanceRepository.findByInstanceId.mockResolvedValue(instance);
      mockDockerService.restartContainer.mockResolvedValue(undefined);

      // Act & Assert - should not throw error
      await expect(instanceService.restartInstance(instance.instance_id)).resolves.not.toThrow();
    });

    it('should reject invalid transition from pending to stopped', async () => {
      // Arrange
      const instance = { ...mockInstance, status: 'pending' };
      mockInstanceRepository.findByInstanceId.mockResolvedValue(instance);

      // Act & Assert
      await expect(instanceService.stopInstance(instance.instance_id)).rejects.toThrow();
      expect(mockErrorService.createError).toHaveBeenCalledWith(
        'INVALID_STATE_TRANSITION',
        expect.objectContaining({
          currentStatus: 'pending',
          newStatus: 'stopped'
        })
      );
    });

    it('should reject invalid transition from stopped to stopped', async () => {
      // Arrange
      const instance = { ...mockInstance, status: 'stopped' };
      mockInstanceRepository.findByInstanceId.mockResolvedValue(instance);

      // Act & Assert
      await expect(instanceService.stopInstance(instance.instance_id)).rejects.toThrow();
      expect(mockErrorService.createError).toHaveBeenCalledWith(
        'INVALID_STATE_TRANSITION',
        expect.objectContaining({
          currentStatus: 'stopped',
          newStatus: 'stopped'
        })
      );
    });
  });

  describe('Instance ID Generation', () => {
    it('should generate unique instance IDs', async () => {
      // Arrange
      const instanceIds = new Set<string>();
      const options = { template: 'personal' as const };

      mockInstanceRepository.create.mockImplementation((data) => {
        instanceIds.add(data.instance_id!);
        return Promise.resolve(mockInstance);
      });
      mockApiKeyService.assignKey.mockResolvedValue('test-api-key');
      mockDockerService.createContainer.mockResolvedValue('container-xyz789');
      mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);

      // Act - Create 100 instances
      for (let i = 0; i < 100; i++) {
        await instanceService.createInstance(mockUser, options);
      }

      // Assert
      expect(instanceIds.size).toBe(100); // All IDs should be unique

      // Check ID format
      for (const id of instanceIds) {
        expect(id).toMatch(/^inst-[a-z0-9]+-[a-z0-9]+$/);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle Docker service errors during creation', async () => {
      // Arrange
      const options = { template: 'personal' as const };
      mockInstanceRepository.create.mockResolvedValue(mockInstance);
      mockApiKeyService.assignKey.mockResolvedValue('test-api-key');
      mockDockerService.createContainer.mockRejectedValue(new Error('Docker daemon not available'));

      // Act & Assert
      await expect(instanceService.createInstance(mockUser, options))
        .rejects.toThrow();

      expect(mockErrorService.createError).toHaveBeenCalledWith(
        'INSTANCE_CREATE_FAILED',
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });

    it('should handle API key service errors during creation', async () => {
      // Arrange
      const options = { template: 'personal' as const };
      mockInstanceRepository.create.mockResolvedValue(mockInstance);
      mockApiKeyService.assignKey.mockRejectedValue(new Error('No API keys available'));

      // Act & Assert
      await expect(instanceService.createInstance(mockUser, options))
        .rejects.toThrow();
    });
  });

  describe('Template Configuration', () => {
    it('should apply correct system prompts for each template', async () => {
      // Arrange
      const templates = [
        {
          template: 'personal' as const,
          expectedPrompt: 'You are a helpful AI assistant for personal productivity.'
        },
        {
          template: 'team' as const,
          expectedPrompt: 'You are a helpful AI assistant for team collaboration and productivity.'
        },
        {
          template: 'enterprise' as const,
          expectedPrompt: 'You are a helpful AI assistant for enterprise operations and automation.'
        }
      ];

      for (const { template, expectedPrompt } of templates) {
        mockInstanceRepository.create.mockResolvedValue(mockInstance);
        mockApiKeyService.assignKey.mockResolvedValue('test-api-key');
        mockDockerService.createContainer.mockResolvedValue('container-xyz789');
        mockInstanceRepository.findByInstanceId.mockResolvedValue(mockInstance);

        // Act
        await instanceService.createInstance(mockUser, { template });

        // Assert
        const updateCall = mockInstanceRepository.update.mock.calls[mockInstanceRepository.update.mock.calls.length - 1];
        const config = updateCall[1].config as InstanceConfig;
        expect(config.systemPrompt).toBe(expectedPrompt);
      }
    });
  });
});
