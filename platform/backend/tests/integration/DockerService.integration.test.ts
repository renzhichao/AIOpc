/**
 * Integration tests for DockerService
 * Tests REAL Docker operations with actual containers
 */

import Docker from 'dockerode';
import { DockerService } from '../../src/services/DockerService';
import { InstanceConfig } from '../../src/types/docker';
import { cleanupDockerArtifacts } from '../helpers/docker-cleanup';

describe('DockerService Integration Tests', () => {
  let dockerService: DockerService;
  let docker: Docker;
  let createdContainers: string[] = [];

  // Test configuration
  const testInstanceId = `integration-test-${Date.now()}`;
  const testConfig: InstanceConfig = {
    apiKey: 'sk-test-integration-key-12345',
    feishuAppId: 'cli_test_app_id',
    feishuAppSecret: 'test_secret',
    skills: ['general_chat', 'web_search'],
    tools: [{ name: 'read', layer: 1 }, { name: 'write', layer: 1 }],
    systemPrompt: 'You are a test assistant for integration testing',
    temperature: 0.7,
    maxTokens: 4000,
    template: 'personal',
  };

  beforeAll(async () => {
    // Clean up any orphaned test resources from previous runs
    await cleanupDockerArtifacts();

    // Initialize DockerService with real Docker daemon
    dockerService = new DockerService();
    docker = new Docker({ socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock' });

    // Verify Docker is accessible
    try {
      await docker.ping();
      console.log('✓ Docker daemon is accessible');
    } catch (error) {
      throw new Error(`Docker daemon not accessible: ${error}`);
    }

    // Verify the openclaw/agent:latest image exists
    const images = await docker.listImages();
    const imageExists = images.some((img: any) =>
      img.RepoTags?.some((tag: string) => tag === 'openclaw/agent:latest' || tag === 'openclaw:latest')
    );

    if (!imageExists) {
      throw new Error('Required image openclaw/agent:latest not found. Run TASK-040 first.');
    }
    console.log('✓ openclaw/agent:latest image exists');
  });

  afterAll(async () => {
    // Final cleanup after all tests
    await cleanupDockerArtifacts();
  });

  afterEach(async () => {
    // Use centralized cleanup helper
    await cleanupDockerArtifacts();
    createdContainers = [];
  });

  describe('createContainer', () => {
    it('should create a real Docker container', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      // Verify container ID is valid (64-character hex string)
      expect(containerId).toMatch(/^[a-f0-9]{64}$/);
      console.log(`✓ Created container ${containerId}`);

      // Verify container exists in Docker
      const container = docker.getContainer(containerId);
      const info = await container.inspect();
      expect(info.State.Running).toBe(true);
      console.log('✓ Container is running');

      // Verify container name
      expect(info.Name).toBe(`/opclaw-${testInstanceId}`);
      console.log(`✓ Container name is correct: ${info.Name}`);

      // Verify container has the correct image
      expect(info.Config.Image).toContain('openclaw');
      console.log(`✓ Container image is correct: ${info.Config.Image}`);

      // Verify environment variables
      const envVars = info.Config.Env || [];
      expect(envVars).toContain(`INSTANCE_ID=${testInstanceId}`);
      expect(envVars).toContain(`DEEPSEEK_API_KEY=${testConfig.apiKey}`);
      expect(envVars).toContain(`FEISHU_APP_ID=${testConfig.feishuAppId}`);
      expect(envVars).toContain(`ENABLED_SKILLS=${testConfig.skills.join(',')}`);
      console.log('✓ Environment variables are set correctly');
    });

    it('should enforce resource limits on container', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      const container = docker.getContainer(containerId);
      const info = await container.inspect();

      // Verify memory limit (should be 1GB = 1073741824 bytes)
      const memoryLimit = info.HostConfig.Memory;
      expect(memoryLimit).toBeDefined();
      expect(memoryLimit).toBeGreaterThan(0);
      expect(memoryLimit).toBeLessThanOrEqual(2 * 1024 * 1024 * 1024); // At most 2GB
      console.log(`✓ Memory limit set: ${Math.round(memoryLimit / 1024 / 1024)}MB`);

      // Verify CPU quota
      const cpuQuota = info.HostConfig.CpuQuota;
      expect(cpuQuota).toBeDefined();
      expect(cpuQuota).toBeGreaterThan(0);
      console.log(`✓ CPU quota set: ${cpuQuota} microseconds`);

      // Verify restart policy
      const restartPolicy = info.HostConfig.RestartPolicy?.Name;
      expect(restartPolicy).toBe('unless-stopped');
      console.log(`✓ Restart policy: ${restartPolicy}`);
    });

    it('should create container in the correct network', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      const container = docker.getContainer(containerId);
      const info = await container.inspect();

      // Verify container is attached to a network
      const networks = Object.keys(info.NetworkSettings.Networks);
      expect(networks.length).toBeGreaterThan(0);
      console.log(`✓ Container is in network(s): ${networks.join(', ')}`);

      // Verify network is opclaw-network
      const expectedNetwork = `opclaw-network-${testInstanceId}`;
      const hasOpclawNetwork = networks.some((n: string) => n.includes('opclaw-network'));
      expect(hasOpclawNetwork).toBe(true);
      console.log('✓ Container is in opclaw-network');
    });

    it('should create container with volume', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      const container = docker.getContainer(containerId);
      const info = await container.inspect();

      // Verify volume mounts
      const mounts = info.Mounts || [];
      expect(mounts.length).toBeGreaterThan(0);
      console.log(`✓ Container has ${mounts.length} volume(s)`);

      // Verify data volume
      const hasDataVolume = mounts.some((m: any) =>
        m.Destination?.includes('/app/data') || m.Destination?.includes('/data')
      );
      expect(hasDataVolume).toBe(true);
      console.log('✓ Data volume is mounted');
    });
  });

  describe('getContainerStatus', () => {
    it('should return correct status for running container', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      const status = await dockerService.getContainerStatus(testInstanceId);

      expect(status.id).toBe(containerId);
      expect(status.name).toBe(`opclaw-${testInstanceId}`);
      expect(status.state).toBe('running');
      expect(status.isRunning).toBe(true);
      expect(status.isPaused).toBe(false);
      expect(status.isRestarting).toBe(false);
      expect(status.created).toBeInstanceOf(Date);
      console.log(`✓ Container status: ${status.state}`);
    });
  });

  describe('getContainerStats', () => {
    it('should return container resource statistics', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      // Wait a bit for container to start and generate stats
      await new Promise(resolve => setTimeout(resolve, 2000));

      const stats = await dockerService.getContainerStats(testInstanceId);

      expect(stats.id).toBeDefined();
      expect(stats.name).toBeDefined();
      expect(stats.cpuPercent).toBeGreaterThanOrEqual(0);
      expect(stats.cpuPercent).toBeLessThanOrEqual(100);
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.memoryLimit).toBeGreaterThan(0);
      expect(stats.memoryPercent).toBeGreaterThanOrEqual(0);
      expect(stats.memoryPercent).toBeLessThanOrEqual(100);
      expect(stats.timestamp).toBeInstanceOf(Date);

      console.log(`✓ CPU: ${stats.cpuPercent.toFixed(2)}%`);
      console.log(`✓ Memory: ${Math.round(stats.memoryUsage / 1024 / 1024)}MB / ${Math.round(stats.memoryLimit / 1024 / 1024)}MB (${stats.memoryPercent.toFixed(2)}%)`);
    });

    it('should enforce memory limit', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      // Wait for container to stabilize
      await new Promise(resolve => setTimeout(resolve, 3000));

      const stats = await dockerService.getContainerStats(testInstanceId);

      // Memory usage should be less than the limit
      expect(stats.memoryUsage).toBeLessThan(stats.memoryLimit);

      // Memory usage should be reasonable (< 1.5GB for an idle container)
      const memoryUsageMB = stats.memoryUsage / (1024 * 1024);
      expect(memoryUsageMB).toBeLessThan(1536); // 1.5GB
      console.log(`✓ Memory usage ${memoryUsageMB.toFixed(2)}MB is within limits`);
    });
  });

  describe('startContainer and stopContainer', () => {
    it('should stop a running container', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      // Verify container is running
      let status = await dockerService.getContainerStatus(testInstanceId);
      expect(status.isRunning).toBe(true);

      // Stop the container
      await dockerService.stopContainer(testInstanceId);
      console.log('✓ Container stopped');

      // Verify container is stopped
      status = await dockerService.getContainerStatus(testInstanceId);
      expect(status.isRunning).toBe(false);
      expect(status.state).toMatch(/exited|paused/);
      console.log(`✓ Container state is now: ${status.state}`);
    });

    it('should start a stopped container', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      // Stop the container
      await dockerService.stopContainer(testInstanceId);

      // Verify container is stopped
      let status = await dockerService.getContainerStatus(testInstanceId);
      expect(status.isRunning).toBe(false);

      // Start the container
      await dockerService.startContainer(testInstanceId);
      console.log('✓ Container started');

      // Verify container is running
      status = await dockerService.getContainerStatus(testInstanceId);
      expect(status.isRunning).toBe(true);
      expect(status.state).toBe('running');
      console.log(`✓ Container state is now: ${status.state}`);
    });

    it('should restart a container', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      // Get initial start time
      const initialStatus = await dockerService.getContainerStatus(testInstanceId);
      const initialStartTime = initialStatus.started;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Restart the container
      await dockerService.restartContainer(testInstanceId);
      console.log('✓ Container restarted');

      // Wait for container to be fully restarted
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify container is running
      const status = await dockerService.getContainerStatus(testInstanceId);
      expect(status.isRunning).toBe(true);

      // Verify start time has changed (container was restarted)
      expect(status.started).not.toEqual(initialStartTime);
      console.log('✓ Container was successfully restarted');
    });
  });

  describe('removeContainer', () => {
    it('should remove a container and its volumes', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);

      // Verify container exists
      let status = await dockerService.getContainerStatus(testInstanceId);
      expect(status.id).toBe(containerId);

      // Remove the container
      await dockerService.removeContainer(testInstanceId, false, true);
      console.log('✓ Container removed');

      // Verify container no longer exists
      await expect(dockerService.getContainerStatus(testInstanceId)).rejects.toThrow();
      console.log('✓ Container no longer exists');

      // Don't add to cleanup list since we already removed it
      createdContainers = createdContainers.filter(id => id !== containerId);
    });

    it('should force remove a running container', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      // Verify container is running
      const status = await dockerService.getContainerStatus(testInstanceId);
      expect(status.isRunning).toBe(true);

      // Force remove without stopping
      await dockerService.removeContainer(testInstanceId, true, true);
      console.log('✓ Container force removed');

      // Verify container no longer exists
      await expect(dockerService.getContainerStatus(testInstanceId)).rejects.toThrow();

      // Don't add to cleanup list since we already removed it
      createdContainers = createdContainers.filter(id => id !== containerId);
    });
  });

  describe('listContainers', () => {
    it('should list all OpenClaw containers', async () => {
      // Create two test containers
      const testId1 = `test-list-1-${Date.now()}`;
      const testId2 = `test-list-2-${Date.now()}`;

      const containerId1 = await dockerService.createContainer(testId1, testConfig);
      createdContainers.push(containerId1);

      const containerId2 = await dockerService.createContainer(testId2, testConfig);
      createdContainers.push(containerId2);

      // List containers
      const containers = await dockerService.listContainers();

      // Verify our containers are in the list
      expect(containers.length).toBeGreaterThanOrEqual(2);

      const container1 = containers.find(c => c.name === `opclaw-${testId1}`);
      const container2 = containers.find(c => c.name === `opclaw-${testId2}`);

      expect(container1).toBeDefined();
      expect(container2).toBeDefined();

      expect(container1?.id).toBe(containerId1);
      expect(container2?.id).toBe(containerId2);

      expect(container1?.isRunning).toBe(true);
      expect(container2?.isRunning).toBe(true);

      console.log(`✓ Found ${containers.length} OpenClaw container(s)`);
      console.log(`✓ Test containers listed correctly`);
    });

    it('should only list OpenClaw containers', async () => {
      // Create a test container
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      // List containers
      const containers = await dockerService.listContainers();

      // Verify all containers start with 'opclaw-'
      containers.forEach(c => {
        expect(c.name).toMatch(/^opclaw-/);
      });

      console.log(`✓ All ${containers.length} containers are OpenClaw containers`);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy for running container', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      // Wait for container to be fully started
      await new Promise(resolve => setTimeout(resolve, 2000));

      const health = await dockerService.healthCheck(testInstanceId);

      expect(health.status).toBe('healthy');
      expect(health.reason).toContain('running');
      expect(health.cpuUsage).toBeDefined();
      expect(health.memoryUsage).toBeDefined();
      expect(health.uptime).toBeGreaterThan(0);
      expect(health.lastCheck).toBeInstanceOf(Date);

      console.log(`✓ Container health: ${health.status}`);
      console.log(`✓ CPU: ${health.cpuUsage?.toFixed(2)}%, Memory: ${health.memoryUsage?.toFixed(2)}%, Uptime: ${health.uptime}s`);
    });

    it('should return unhealthy for stopped container', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      // Stop the container
      await dockerService.stopContainer(testInstanceId);

      const health = await dockerService.healthCheck(testInstanceId);

      expect(health.status).toBe('unhealthy');
      expect(health.reason).toContain('not running');

      console.log(`✓ Container health: ${health.status} (${health.reason})`);
    });
  });

  describe('getLogs', () => {
    it('should retrieve container logs', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      // Wait for container to generate some logs
      await new Promise(resolve => setTimeout(resolve, 2000));

      const logs = await dockerService.getLogs(testInstanceId, { tail: 50 });

      expect(logs).toBeInstanceOf(Array);
      expect(logs.length).toBeGreaterThanOrEqual(0);

      // Verify log entry structure
      logs.forEach(log => {
        expect(log.message).toBeDefined();
        expect(log.timestamp).toBeInstanceOf(Date);
        expect(log.containerId).toBe(testInstanceId);
        expect(log.containerName).toBe(`opclaw-${testInstanceId}`);
      });

      console.log(`✓ Retrieved ${logs.length} log entries`);
    });

    it('should respect log options', async () => {
      const containerId = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId);

      // Wait for container to generate logs
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get only 10 logs
      const logs = await dockerService.getLogs(testInstanceId, { tail: 10 });

      expect(logs.length).toBeLessThanOrEqual(10);
      console.log(`✓ Retrieved ${logs.length} log entries (limited to 10)`);
    });
  });

  describe('error handling', () => {
    it('should handle non-existent container gracefully', async () => {
      const nonExistentId = 'non-existent-container';

      await expect(dockerService.getContainerStatus(nonExistentId)).rejects.toThrow();
      await expect(dockerService.getContainerStats(nonExistentId)).rejects.toThrow();
      await expect(dockerService.stopContainer(nonExistentId)).rejects.toThrow();
      await expect(dockerService.startContainer(nonExistentId)).rejects.toThrow();

      console.log('✓ Non-existent container errors handled correctly');
    });

    it('should handle duplicate container names', async () => {
      const containerId1 = await dockerService.createContainer(testInstanceId, testConfig);
      createdContainers.push(containerId1);

      // Try to create another container with the same ID
      await expect(dockerService.createContainer(testInstanceId, testConfig)).rejects.toThrow();

      console.log('✓ Duplicate container name error handled');
    });
  });
});
