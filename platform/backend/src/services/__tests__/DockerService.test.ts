/**
 * Unit tests for DockerService
 */

// Mock Dockerode BEFORE importing
const mockDockerodeMethods = {
  createContainer: jest.fn(),
  getContainer: jest.fn(),
  getVolume: jest.fn(),
  getNetwork: jest.fn(),
  listContainers: jest.fn(),
  listImages: jest.fn(),
  listVolumes: jest.fn(),
  listNetworks: jest.fn(),
  createVolume: jest.fn(),
  createNetwork: jest.fn(),
  pull: jest.fn(),
  modem: {
    followProgress: jest.fn(),
  },
};

jest.mock('dockerode', () => {
  return jest.fn(() => mockDockerodeMethods);
});

import Docker from 'dockerode';
import { DockerService } from '../DockerService';
import { InstanceConfig, HealthStatus } from '../../types/docker';
import { AppError } from '../../utils/errors/AppError';

describe('DockerService', () => {
  let dockerService: any;
  let mockContainer: any;
  let mockVolume: any;
  let mockNetwork: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock container
    mockContainer = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      restart: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      inspect: jest.fn(),
      stats: jest.fn(),
      logs: jest.fn(),
    };

    // Create mock volume
    mockVolume = {
      remove: jest.fn().mockResolvedValue(undefined),
    };

    // Create mock network
    mockNetwork = {
      remove: jest.fn().mockResolvedValue(undefined),
    };

    // Setup dockerode mock
    Object.assign(mockDockerodeMethods, {
      createContainer: jest.fn().mockResolvedValue(mockContainer),
      getContainer: jest.fn().mockReturnValue(mockContainer),
      getVolume: jest.fn().mockReturnValue(mockVolume),
      getNetwork: jest.fn().mockReturnValue(mockNetwork),
      listContainers: jest.fn(),
      listImages: jest.fn(),
      listVolumes: jest.fn(),
      listNetworks: jest.fn(),
      createVolume: jest.fn().mockResolvedValue(mockVolume),
      createNetwork: jest.fn().mockResolvedValue(mockNetwork),
      pull: jest.fn(),
    });

    dockerService = new DockerService();
  });

  describe('createContainer', () => {
    const instanceId = 'test-instance-001';
    const config: InstanceConfig = {
      apiKey: 'sk-test-key-12345',
      feishuAppId: 'app-test-id',
      feishuAppSecret: 'secret-test',
      skills: ['general_chat', 'web_search'],
      systemPrompt: 'You are a helpful assistant',
      temperature: 0.7,
      maxTokens: 4000,
      template: 'personal',
    };

    it('should create a container successfully', async () => {
      // Mock listImages to return empty (image not exists)
      mockDockerodeMethods.listImages.mockResolvedValue([]);
      mockDockerodeMethods.listNetworks.mockResolvedValue([]);
      mockDockerodeMethods.listVolumes.mockResolvedValue({ Volumes: [] });

      // Mock pull to succeed
      mockDockerodeMethods.pull.mockImplementation(((image: any, callback: any) => {
        callback(null, {} as any);
        return undefined;
      }) as any);

      mockDockerodeMethods.modem.followProgress.mockImplementation(((stream: any, callback: any) => {
        callback(null);
      }) as any);

      await expect(dockerService.createContainer(instanceId, config)).resolves.toBe(
        mockContainer.id
      );

      expect(mockDockerodeMethods.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'opclaw-test-instance-001',
          Image: 'openclaw:latest',
          Env: expect.arrayContaining([
            'INSTANCE_ID=test-instance-001',
            'DEEPSEEK_API_KEY=sk-test-key-12345',
            'FEISHU_APP_ID=app-test-id',
            'ENABLED_SKILLS=general_chat,web_search',
          ]),
          HostConfig: expect.objectContaining({
            Memory: 1 * 1024 * 1024 * 1024, // 1GB
            NanoCpus: 500000, // 0.5 core
          }),
        })
      );

      expect(mockContainer.start).toHaveBeenCalled();
    });

    it('should use existing image if already pulled', async () => {
      mockDockerodeMethods.listImages.mockResolvedValue([
        {
          RepoTags: ['openclaw:latest'],
        } as any,
      ]);
      mockDockerodeMethods.listNetworks.mockResolvedValue([]);
      mockDockerodeMethods.listVolumes.mockResolvedValue({ Volumes: [] });

      await expect(dockerService.createContainer(instanceId, config)).resolves.toBe(
        mockContainer.id
      );

      expect(mockDockerodeMethods.pull).not.toHaveBeenCalled();
    });

    it('should throw AppError on failure', async () => {
      mockDockerodeMethods.listImages.mockResolvedValue([]);
      mockDockerodeMethods.listNetworks.mockResolvedValue([]);
      mockDockerodeMethods.listVolumes.mockResolvedValue({ Volumes: [] });

      mockDockerodeMethods.pull.mockImplementation(((image: any, callback: any) => {
        callback(new Error('Pull failed'), {} as any);
        return undefined;
      }) as any);

      await expect(dockerService.createContainer(instanceId, config)).rejects.toThrow(
        AppError
      );

      try {
        await dockerService.createContainer(instanceId, config);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('DOCKER_CREATE_FAILED');
      }
    });
  });

  describe('startContainer', () => {
    const instanceId = 'test-instance-001';

    it('should start a stopped container', async () => {
      await expect(dockerService.startContainer(instanceId)).resolves.not.toThrow();

      expect(mockDockerodeMethods.getContainer).toHaveBeenCalledWith('opclaw-test-instance-001');
      expect(mockContainer.start).toHaveBeenCalled();
    });

    it('should throw AppError on failure', async () => {
      mockContainer.start.mockRejectedValue(new Error('Start failed'));

      await expect(dockerService.startContainer(instanceId)).rejects.toThrow(AppError);

      try {
        await dockerService.startContainer(instanceId);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('DOCKER_START_FAILED');
      }
    });
  });

  describe('stopContainer', () => {
    const instanceId = 'test-instance-001';

    it('should stop a running container', async () => {
      await expect(dockerService.stopContainer(instanceId)).resolves.not.toThrow();

      expect(mockDockerodeMethods.getContainer).toHaveBeenCalledWith('opclaw-test-instance-001');
      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
    });

    it('should use custom timeout', async () => {
      await expect(dockerService.stopContainer(instanceId, 30)).resolves.not.toThrow();

      expect(mockContainer.stop).toHaveBeenCalledWith({ t: 30 });
    });

    it('should throw AppError on failure', async () => {
      mockContainer.stop.mockRejectedValue(new Error('Stop failed'));

      await expect(dockerService.stopContainer(instanceId)).rejects.toThrow(AppError);

      try {
        await dockerService.stopContainer(instanceId);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('DOCKER_STOP_FAILED');
      }
    });
  });

  describe('restartContainer', () => {
    const instanceId = 'test-instance-001';

    it('should restart a container', async () => {
      await expect(dockerService.restartContainer(instanceId)).resolves.not.toThrow();

      expect(mockDockerodeMethods.getContainer).toHaveBeenCalledWith('opclaw-test-instance-001');
      expect(mockContainer.restart).toHaveBeenCalledWith({ t: 10 });
    });

    it('should use custom timeout', async () => {
      await expect(dockerService.restartContainer(instanceId, 30)).resolves.not.toThrow();

      expect(mockContainer.restart).toHaveBeenCalledWith({ t: 30 });
    });

    it('should throw AppError on failure', async () => {
      mockContainer.restart.mockRejectedValue(new Error('Restart failed'));

      await expect(dockerService.restartContainer(instanceId)).rejects.toThrow(AppError);

      try {
        await dockerService.restartContainer(instanceId);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('DOCKER_RESTART_FAILED');
      }
    });
  });

  describe('removeContainer', () => {
    const instanceId = 'test-instance-001';

    it('should remove a container with volumes', async () => {
      // Mock container is running
      mockContainer.inspect.mockResolvedValue({
        State: { Running: true },
      });

      // Mock getContainerStatus to return running container
      dockerService.getContainerStatus = jest.fn().mockResolvedValue({
        id: 'container-123',
        name: 'opclaw-test-instance-001',
        state: 'running',
        status: 'running',
        isRunning: true,
        isPaused: false,
        isRestarting: false,
        created: new Date(),
        started: new Date(),
      });

      await expect(
        dockerService.removeContainer(instanceId, false, true)
      ).resolves.not.toThrow();

      expect(mockContainer.stop).toHaveBeenCalled();
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: false, v: true });
      expect(mockVolume.remove).toHaveBeenCalled();
      expect(mockNetwork.remove).toHaveBeenCalled();
    });

    it('should force remove without stopping', async () => {
      await expect(
        dockerService.removeContainer(instanceId, true, false)
      ).resolves.not.toThrow();

      expect(mockContainer.stop).not.toHaveBeenCalled();
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true, v: false });
      expect(mockVolume.remove).not.toHaveBeenCalled();
    });

    it('should throw AppError on failure', async () => {
      mockContainer.remove.mockRejectedValue(new Error('Remove failed'));

      await expect(dockerService.removeContainer(instanceId)).rejects.toThrow(AppError);

      try {
        await dockerService.removeContainer(instanceId);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('DOCKER_REMOVE_FAILED');
      }
    });
  });

  describe('getContainerStatus', () => {
    const instanceId = 'test-instance-001';

    it('should return container status when running', async () => {
      mockContainer.inspect.mockResolvedValue({
        Id: 'container-id-123',
        Name: '/opclaw-test-instance-001',
        Created: '2026-03-13T00:00:00.000Z',
        State: {
          Running: true,
          Paused: false,
          Restarting: false,
          Status: 'running',
          StartedAt: '2026-03-13T01:00:00.000Z',
        },
      });

      const status = await dockerService.getContainerStatus(instanceId);

      expect(status).toEqual({
        id: 'container-id-123',
        name: 'opclaw-test-instance-001',
        state: 'running',
        status: 'running',
        isRunning: true,
        isPaused: false,
        isRestarting: false,
        created: new Date('2026-03-13T00:00:00.000Z'),
        started: new Date('2026-03-13T01:00:00.000Z'),
      });
    });

    it('should return status for stopped container', async () => {
      mockContainer.inspect.mockResolvedValue({
        Id: 'container-id-123',
        Name: '/opclaw-test-instance-001',
        Created: '2026-03-13T00:00:00.000Z',
        State: {
          Running: false,
          Paused: false,
          Restarting: false,
          Dead: false,
          Status: 'exited',
        },
      });

      const status = await dockerService.getContainerStatus(instanceId);

      expect(status.state).toBe('exited');
      expect(status.isRunning).toBe(false);
    });

    it('should throw AppError on failure', async () => {
      mockContainer.inspect.mockRejectedValue(new Error('Inspect failed'));

      await expect(dockerService.getContainerStatus(instanceId)).rejects.toThrow(AppError);

      try {
        await dockerService.getContainerStatus(instanceId);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('DOCKER_INSPECT_FAILED');
      }
    });
  });

  describe('getContainerStats', () => {
    const instanceId = 'test-instance-001';

    it('should return container stats', async () => {
      const mockStats = {
        id: 'container-id-123',
        name: 'opclaw-test-instance-001',
        read: '2026-03-13T00:00:00.000Z',
        cpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000,
          online_cpus: 2,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 500000 },
          system_cpu_usage: 1000000,
        },
        memory_stats: {
          usage: 512 * 1024 * 1024, // 512MB
          limit: 1024 * 1024 * 1024, // 1GB
        },
        networks: {
          eth0: { rx_bytes: 1000, tx_bytes: 2000 },
        },
        blkio_stats: {
          io_service_bytes_recursive: [
            { op: 'Read', value: 3000 },
            { op: 'Write', value: 4000 },
          ],
        },
      };

      mockContainer.stats.mockResolvedValue(mockStats);

      const stats = await dockerService.getContainerStats(instanceId);

      expect(stats).toMatchObject({
        id: 'container-id-123',
        name: 'opclaw-test-instance-001',
        cpuPercent: expect.any(Number),
        memoryUsage: 512 * 1024 * 1024,
        memoryLimit: 1024 * 1024 * 1024,
        memoryPercent: expect.any(Number),
        networkRX: 1000,
        networkTX: 2000,
        blockRead: 3000,
        blockWrite: 4000,
      });

      // Verify CPU calculation
      expect(stats.cpuPercent).toBeGreaterThan(0);
      expect(stats.cpuPercent).toBeLessThanOrEqual(100);

      // Verify memory percentage
      expect(stats.memoryPercent).toBeCloseTo(50, 1); // ~50%
    });

    it('should handle missing network stats', async () => {
      const mockStats = {
        cpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000,
          online_cpus: 2,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 500000 },
          system_cpu_usage: 1000000,
        },
        memory_stats: {
          usage: 512 * 1024 * 1024,
          limit: 1024 * 1024 * 1024,
        },
      };

      mockContainer.stats.mockResolvedValue(mockStats);

      const stats = await dockerService.getContainerStats(instanceId);

      expect(stats.networkRX).toBe(0);
      expect(stats.networkTX).toBe(0);
    });

    it('should throw AppError on failure', async () => {
      mockContainer.stats.mockRejectedValue(new Error('Stats failed'));

      await expect(dockerService.getContainerStats(instanceId)).rejects.toThrow(AppError);

      try {
        await dockerService.getContainerStats(instanceId);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('DOCKER_STATS_FAILED');
      }
    });
  });

  describe('healthCheck', () => {
    const instanceId = 'test-instance-001';

    it('should return healthy status for running container', async () => {
      mockContainer.inspect.mockResolvedValue({
        State: {
          Running: true,
          Paused: false,
          Restarting: false,
          Dead: false,
          OOMKilled: false,
          Status: 'running',
          StartedAt: '2026-03-13T00:00:00.000Z',
          Health: { Status: 'healthy' },
        },
      });

      // Mock stats
      mockContainer.stats.mockResolvedValue({
        cpu_stats: {
          cpu_usage: { total_usage: 1000000 },
          system_cpu_usage: 2000000,
          online_cpus: 2,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 500000 },
          system_cpu_usage: 1000000,
        },
        memory_stats: {
          usage: 512 * 1024 * 1024,
          limit: 1024 * 1024 * 1024,
        },
      });

      const health = await dockerService.healthCheck(instanceId);

      expect(health.status).toBe('healthy');
      expect(health.reason).toBe('Container is running and healthy');
      expect(health.cpuUsage).toBeDefined();
      expect(health.memoryUsage).toBeDefined();
      expect(health.uptime).toBeDefined();
      expect(health.lastCheck).toBeInstanceOf(Date);
    });

    it('should return unhealthy status for stopped container', async () => {
      mockContainer.inspect.mockResolvedValue({
        State: {
          Running: false,
          Status: 'exited',
        },
      });

      const health = await dockerService.healthCheck(instanceId);

      expect(health.status).toBe('unhealthy');
      expect(health.reason).toContain('not running');
    });

    it('should return unhealthy status for OOM killed container', async () => {
      mockContainer.inspect.mockResolvedValue({
        State: {
          Running: true,
          OOMKilled: true,
        },
      });

      const health = await dockerService.healthCheck(instanceId);

      expect(health.status).toBe('unhealthy');
      expect(health.reason).toContain('OOM killed');
    });

    it('should return unhealthy status for restarting container', async () => {
      mockContainer.inspect.mockResolvedValue({
        State: {
          Running: true,
          Restarting: true,
        },
      });

      const health = await dockerService.healthCheck(instanceId);

      expect(health.status).toBe('unhealthy');
      expect(health.reason).toContain('restarting');
    });

    it('should return unknown status on error', async () => {
      mockContainer.inspect.mockRejectedValue(new Error('Inspect failed'));

      const health = await dockerService.healthCheck(instanceId);

      expect(health.status).toBe('unknown');
      expect(health.reason).toContain('Failed to check health');
    });
  });

  describe('getLogs', () => {
    const instanceId = 'test-instance-001';

    it('should return container logs', async () => {
      const logData =
        '2026-03-13T00:00:00.000Z First log\n2026-03-13T00:01:00.000Z Second log\n';
      mockContainer.logs.mockResolvedValue(Buffer.from(logData));

      const logs = await dockerService.getLogs(instanceId);

      expect(logs).toHaveLength(2);
      expect(logs[0]).toMatchObject({
        message: 'First log',
        containerId: instanceId,
        containerName: 'opclaw-test-instance-001',
      });
      expect(logs[1]).toMatchObject({
        message: 'Second log',
      });
    });

    it('should use custom log options', async () => {
      mockContainer.logs.mockResolvedValue(Buffer.from('test log'));

      await dockerService.getLogs(instanceId, {
        tail: 50,
        timestamps: false,
      });

      expect(mockContainer.logs).toHaveBeenCalledWith({
        stdout: true,
        stderr: true,
        tail: 50,
        follow: false,
        timestamps: false,
        since: undefined,
      });
    });

    it('should throw AppError on failure', async () => {
      mockContainer.logs.mockRejectedValue(new Error('Logs failed'));

      await expect(dockerService.getLogs(instanceId)).rejects.toThrow(AppError);

      try {
        await dockerService.getLogs(instanceId);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('DOCKER_LOGS_FAILED');
      }
    });
  });

  describe('listContainers', () => {
    it('should return all OpenClaw containers', async () => {
      mockDockerodeMethods.listContainers.mockResolvedValue([
        {
          Id: 'container-1',
          Names: ['/opclaw-instance-001'],
          State: 'running',
          Status: 'Up 1 hour',
          Created: 1678720000,
        },
        {
          Id: 'container-2',
          Names: ['/opclaw-instance-002'],
          State: 'exited',
          Status: 'Exited (0) 2 hours ago',
          Created: 1678710000,
        },
        {
          Id: 'container-3',
          Names: ['/other-container'],
          State: 'running',
          Status: 'Up 30 minutes',
          Created: 1678730000,
        },
      ] as any);

      const containers = await dockerService.listContainers();

      expect(containers).toHaveLength(2);
      expect(containers[0].name).toBe('opclaw-instance-001');
      expect(containers[1].name).toBe('opclaw-instance-002');
      expect(containers.every((c: any) => c.name.startsWith('opclaw-'))).toBe(true);
    });

    it('should throw AppError on failure', async () => {
      mockDockerodeMethods.listContainers.mockRejectedValue(new Error('List failed'));

      await expect(dockerService.listContainers()).rejects.toThrow(AppError);

      try {
        await dockerService.listContainers();
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('DOCKER_LIST_FAILED');
      }
    });
  });
});
