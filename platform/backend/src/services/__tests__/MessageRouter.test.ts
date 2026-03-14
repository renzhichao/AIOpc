/**
 * Message Router Service Tests
 *
 * Tests for message routing between Feishu and OpenClaw instances
 */

import { MessageRouter } from '../MessageRouter';
import { UserRepository } from '../../repositories/UserRepository';
import { InstanceRepository } from '../../repositories/InstanceRepository';
import { DockerService } from '../DockerService';
import { ErrorService } from '../ErrorService';
import { redis } from '../../config/redis';
import { User } from '../../entities/User.entity';
import { Instance } from '../../entities/Instance.entity';
import { MessageRouteRequest } from '../../types/message-router.types';
import { AppError } from '../../utils/errors/AppError';
import axios from 'axios';

// Mock dependencies
jest.mock('../../config/redis');
jest.mock('../DockerService');
jest.mock('../../repositories/UserRepository');
jest.mock('../../repositories/InstanceRepository');
jest.mock('../ErrorService');

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MessageRouter', () => {
  let messageRouter: MessageRouter;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockInstanceRepository: jest.Mocked<InstanceRepository>;
  let mockDockerService: jest.Mocked<DockerService>;
  let mockErrorService: jest.Mocked<ErrorService>;

  const mockUser: User = {
    id: 1,
    feishu_user_id: 'test_feishu_user_id',
    name: 'Test User',
    email: 'test@example.com',
    created_at: new Date(),
  } as User;

  const mockInstance: Instance = {
    id: 1,
    instance_id: 'test-instance-id',
    owner_id: 1,
    status: 'active',
    template: 'personal',
    name: 'Test Instance',
    docker_container_id: 'container-123',
    config: {},
    restart_attempts: 0,
    health_status: {},
    created_at: new Date(),
    updated_at: new Date(),
  } as Instance;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockUserRepository = {
      findByFeishuUserId: jest.fn(),
    } as any;

    mockInstanceRepository = {
      findByOwnerId: jest.fn(),
      findByInstanceId: jest.fn(),
    } as any;

    mockDockerService = {
      getContainerStatus: jest.fn(),
    } as any;

    mockErrorService = {
      createError: jest.fn().mockImplementation((code, details) => {
        return new AppError(500, code, `Error: ${code}`, details);
      }),
    } as any;

    // Mock redis
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue('OK');

    // Create MessageRouter instance
    messageRouter = new MessageRouter(
      mockUserRepository,
      mockInstanceRepository,
      mockDockerService,
      mockErrorService
    );
  });

  describe('routeMessage', () => {
    const mockRequest: MessageRouteRequest = {
      feishuUserId: 'test_feishu_user_id',
      messageId: 'msg-123',
      content: 'Hello, AI!',
      msgType: 'text',
      timestamp: '2026-03-13T10:00:00Z',
    };

    it('should successfully route message to instance', async () => {
      // Setup mocks
      mockUserRepository.findByFeishuUserId.mockResolvedValue(mockUser);
      mockInstanceRepository.findByOwnerId.mockResolvedValue([mockInstance]);
      mockDockerService.getContainerStatus.mockResolvedValue({
        isRunning: true,
      } as any);

      // Mock Docker container
      const mockContainer = {
        inspect: jest.fn().mockResolvedValue({
          NetworkSettings: {
            IPAddress: '172.17.0.2',
            Networks: {
              bridge: {
                IPAddress: '172.17.0.2',
              },
            },
          },
        }),
      };
      (messageRouter as any).docker.docker = {
        getContainer: jest.fn().mockReturnValue(mockContainer),
      };

      // Mock axios POST for instance API
      mockedAxios.post.mockResolvedValue({
        data: {
          content: 'Hello! How can I help you?',
          msgType: 'text',
        },
      });

      // Mock axios POST for Feishu API
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          code: 0,
          tenant_access_token: 'test-token',
        },
      });

      // Execute
      const response = await messageRouter.routeMessage(mockRequest);

      // Verify
      expect(response.success).toBe(true);
      expect(response.content).toBe('Hello! How can I help you?');
      expect(mockUserRepository.findByFeishuUserId).toHaveBeenCalledWith('test_feishu_user_id');
      expect(mockInstanceRepository.findByOwnerId).toHaveBeenCalledWith(1);
    });

    it('should throw error when user not found', async () => {
      // Setup mocks
      mockUserRepository.findByFeishuUserId.mockResolvedValue(null);

      // Execute & Verify
      await expect(messageRouter.routeMessage(mockRequest)).rejects.toThrow();
      expect(mockUserRepository.findByFeishuUserId).toHaveBeenCalledWith('test_feishu_user_id');
    });

    it('should throw error when no active instance found', async () => {
      // Setup mocks
      mockUserRepository.findByFeishuUserId.mockResolvedValue(mockUser);
      mockInstanceRepository.findByOwnerId.mockResolvedValue([]);

      // Execute & Verify
      await expect(messageRouter.routeMessage(mockRequest)).rejects.toThrow();
      expect(mockInstanceRepository.findByOwnerId).toHaveBeenCalledWith(1);
    });

    it('should throw error when instance is not running', async () => {
      // Setup mocks
      mockUserRepository.findByFeishuUserId.mockResolvedValue(mockUser);
      mockInstanceRepository.findByOwnerId.mockResolvedValue([mockInstance]);
      mockDockerService.getContainerStatus.mockResolvedValue({
        isRunning: false,
        state: 'exited',
      } as any);

      // Execute & Verify
      await expect(messageRouter.routeMessage(mockRequest)).rejects.toThrow();
    });
  });

  describe('getRoutingEntry', () => {
    it('should return routing entry from cache', async () => {
      const mockEntry = {
        feishuUserId: 'test_user',
        instanceId: 'inst-123',
        messageCount: 5,
        lastMessageAt: new Date(),
      };

      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockEntry));

      const entry = await messageRouter.getRoutingEntry('test_user');

      expect(entry).toEqual(mockEntry);
      expect(redis.get).toHaveBeenCalledWith('message:route:test_user');
    });

    it('should return null when entry not found', async () => {
      (redis.get as jest.Mock).mockResolvedValue(null);

      const entry = await messageRouter.getRoutingEntry('test_user');

      expect(entry).toBeNull();
    });

    it('should handle redis errors gracefully', async () => {
      (redis.get as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const entry = await messageRouter.getRoutingEntry('test_user');

      expect(entry).toBeNull();
    });
  });

  describe('getMessageLog', () => {
    it('should return message log from cache', async () => {
      const mockLog = {
        id: 'log-123',
        messageId: 'msg-123',
        instanceId: 'inst-123',
        feishuUserId: 'test_user',
        content: 'Test message',
        processingTime: 1000,
        success: true,
        timestamp: new Date(),
      };

      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(mockLog));

      const log = await messageRouter.getMessageLog('log-123');

      expect(log).toEqual(mockLog);
      expect(redis.get).toHaveBeenCalledWith('message:log:log-123');
    });

    it('should return null when log not found', async () => {
      (redis.get as jest.Mock).mockResolvedValue(null);

      const log = await messageRouter.getMessageLog('log-123');

      expect(log).toBeNull();
    });
  });

  describe('routing table management', () => {
    it('should update routing table with new entry', async () => {
      (redis.get as jest.Mock).mockResolvedValue(null);
      (redis.set as jest.Mock).mockResolvedValue('OK');

      // Access private method through type assertion
      await (messageRouter as any).updateRoutingTable('test_user', 'inst-123');

      expect(redis.set).toHaveBeenCalledWith(
        'message:route:test_user',
        expect.stringContaining('"feishuUserId":"test_user"'),
        'EX',
        3600
      );
    });

    it('should increment message count for existing entry', async () => {
      const existingEntry = {
        feishuUserId: 'test_user',
        instanceId: 'inst-123',
        messageCount: 3,
        lastMessageAt: new Date(),
      };

      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(existingEntry));
      (redis.set as jest.Mock).mockResolvedValue('OK');

      await (messageRouter as any).updateRoutingTable('test_user', 'inst-123');

      expect(redis.set).toHaveBeenCalledWith(
        'message:route:test_user',
        expect.stringContaining('"messageCount":4'),
        'EX',
        3600
      );
    });
  });

  describe('error handling', () => {
    const mockRequest: MessageRouteRequest = {
      feishuUserId: 'test_feishu_user_id',
      messageId: 'msg-123',
      content: 'Hello, AI!',
      msgType: 'text',
      timestamp: '2026-03-13T10:00:00Z',
    };

    it('should handle instance timeout error', async () => {
      mockUserRepository.findByFeishuUserId.mockResolvedValue(mockUser);
      mockInstanceRepository.findByOwnerId.mockResolvedValue([mockInstance]);
      mockDockerService.getContainerStatus.mockResolvedValue({
        isRunning: true,
      } as any);

      const mockContainer = {
        inspect: jest.fn().mockResolvedValue({
          NetworkSettings: {
            IPAddress: '172.17.0.2',
          },
        }),
      };
      (messageRouter as any).docker.docker = {
        getContainer: jest.fn().mockReturnValue(mockContainer),
      };

      // Mock axios timeout
      mockedAxios.post.mockRejectedValue(new Error('timeout of 30000ms exceeded'));

      // Mock Feishu token and error message sending
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          code: 0,
          tenant_access_token: 'test-token',
        },
      });

      await expect(messageRouter.routeMessage(mockRequest)).rejects.toThrow();
    });

    it('should handle instance unreachable error', async () => {
      mockUserRepository.findByFeishuUserId.mockResolvedValue(mockUser);
      mockInstanceRepository.findByOwnerId.mockResolvedValue([mockInstance]);
      mockDockerService.getContainerStatus.mockResolvedValue({
        isRunning: true,
      } as any);

      const mockContainer = {
        inspect: jest.fn().mockResolvedValue({
          NetworkSettings: {
            IPAddress: '172.17.0.2',
          },
        }),
      };
      (messageRouter as any).docker.docker = {
        getContainer: jest.fn().mockReturnValue(mockContainer),
      };

      // Mock axios connection refused
      const connectionError = new Error('connect ECONNREFUSED');
      (connectionError as any).code = 'ECONNREFUSED';
      mockedAxios.post.mockRejectedValue(connectionError);

      // Mock Feishu token and error message sending
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          code: 0,
          tenant_access_token: 'test-token',
        },
      });

      await expect(messageRouter.routeMessage(mockRequest)).rejects.toThrow();
    });
  });

  describe('message logging', () => {
    it('should log message successfully', async () => {
      const mockLog = {
        id: 'log-123',
        messageId: 'msg-123',
        instanceId: 'inst-123',
        feishuUserId: 'test_user',
        content: 'Test message',
        response: 'Test response',
        processingTime: 1000,
        success: true,
        timestamp: new Date(),
      };

      (redis.set as jest.Mock).mockResolvedValue('OK');

      await (messageRouter as any).logMessage(mockLog);

      expect(redis.set).toHaveBeenCalledWith(
        'message:log:log-123',
        JSON.stringify(mockLog),
        'EX',
        86400
      );
    });

    it('should handle logging errors gracefully', async () => {
      const mockLog = {
        id: 'log-123',
        messageId: 'msg-123',
        instanceId: 'inst-123',
        feishuUserId: 'test_user',
        content: 'Test message',
        processingTime: 1000,
        success: false,
        error: 'Test error',
        timestamp: new Date(),
      };

      (redis.set as jest.Mock).mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect((messageRouter as any).logMessage(mockLog)).resolves.not.toThrow();
    });
  });
});
