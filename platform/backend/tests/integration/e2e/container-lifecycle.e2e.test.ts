/**
 * Container Lifecycle E2E Tests
 *
 * Tests the complete Docker container lifecycle from creation to removal.
 * These tests verify container management, state transitions, and resource cleanup.
 *
 * Test Flow:
 * 1. Create container with preset
 * 2. Verify container exists in Docker
 * 3. Start container
 * 4. Verify container is running
 * 5. Get container stats
 * 6. Stop container
 * 7. Verify container is stopped
 * 8. Remove container
 * 9. Verify container is removed
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { AppDataSource } from '../../../src/config/database';
import { InstanceService } from '../../../src/services/InstanceService';
import { DockerService } from '../../../src/services/DockerService';
import { InstanceRepository } from '../../../src/repositories/InstanceRepository';
import { ApiKeyService } from '../../../src/services/ApiKeyService';
import { ErrorService } from '../../../src/services/ErrorService';
import { User } from '../../../src/entities/User.entity';
import Docker from 'dockerode';
import { DatabaseHelper } from '../helpers/database.helper';
import { DockerHelper } from '../helpers/docker.helper';
import { TestFixtures } from '../helpers/fixtures';

describe('Container Lifecycle E2E Tests', () => {
  // Services
  let instanceService: InstanceService;
  let dockerService: DockerService;

  // Repositories
  let instanceRepository: InstanceRepository;

  // Docker
  let docker: Docker;

  // Test data
  let testUser: User;

  beforeAll(async () => {
    // Configure test environment
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-api-key-lifecycle';
    process.env.FEISHU_APP_ID = 'test_feishu_app_id_lifecycle';
    process.env.FEISHU_APP_SECRET = 'test_feishu_app_secret_lifecycle';
    process.env.FEISHU_REDIRECT_URI = 'http://localhost:5173/oauth/callback';

    // Initialize database
    await DatabaseHelper.connect();

    // Initialize Docker
    await DockerHelper.connect();
    docker = DockerHelper.getDocker();

    // Verify Docker image exists
    const imageExists = await DockerHelper.verifyImage('openclaw/agent:latest');
    if (!imageExists) {
      throw new Error('Required image openclaw/agent:latest not found. Run TASK-040 first.');
    }

    // Create repositories and services
    instanceRepository = new InstanceRepository(AppDataSource.getRepository(Instance));
    const errorService = new ErrorService();
    dockerService = new DockerService();

    const apiKeyService = new ApiKeyService(
      AppDataSource.getRepository(ApiKey),
      instanceRepository,
      errorService
    );

    instanceService = new InstanceService(
      instanceRepository,
      dockerService,
      apiKeyService,
      errorService
    );

    console.log('✓ Container lifecycle E2E test environment initialized');
  });

  afterAll(async () => {
    await DatabaseHelper.clean();
    await DatabaseHelper.disconnect();
    await DockerHelper.removeAllTestContainers();
    await DockerHelper.cleanupAll();
  });

  beforeEach(async () => {
    await DatabaseHelper.clean();
    testUser = await DatabaseHelper.createTestUser();
  });

  afterEach(async () => {
    await DockerHelper.removeAllTestContainers();
    await DatabaseHelper.clean();
  });

  describe('Container Creation', () => {
    it('should create container with correct configuration', async () => {
      console.log('\n=== Container Creation ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Verify container exists
      const containerExists = await DockerHelper.containerExists(instance.docker_container_id!);
      expect(containerExists).toBe(true);
      console.log('✓ Container created in Docker');

      // Verify container configuration
      const container = docker.getContainer(instance.docker_container_id!);
      const info = await container.inspect();

      // Verify container is running
      expect(info.State.Running).toBe(true);
      console.log('✓ Container is running');

      // Verify container name
      expect(info.Name).toBe(`/opclaw-${instance.instance_id}`);
      console.log(`✓ Container name: ${info.Name}`);

      // Verify image
      expect(info.Config.Image).toContain('openclaw');
      console.log(`✓ Container image: ${info.Config.Image}`);

      // Verify environment variables
      const envVars = info.Config.Env || [];
      expect(envVars).toContain(`INSTANCE_ID=${instance.instance_id}`);
      expect(envVars).toContain(`DEEPSEEK_API_KEY=${process.env.DEEPSEEK_API_KEY}`);
      console.log('✓ Environment variables set correctly');

      // Verify resource limits
      expect(info.HostConfig.Memory).toBeGreaterThan(0);
      expect(info.HostConfig.NanoCpus).toBeGreaterThan(0);
      console.log(`✓ Memory limit: ${Math.round(info.HostConfig.Memory / 1024 / 1024)}MB`);

      // Verify restart policy
      expect(info.HostConfig.RestartPolicy?.Name).toBe('unless-stopped');
      console.log(`✓ Restart policy: ${info.HostConfig.RestartPolicy.Name}`);

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });

    it('should create container with correct network configuration', async () => {
      console.log('\n=== Container Network Configuration ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'team',
      });

      const container = docker.getContainer(instance.docker_container_id!);
      const info = await container.inspect();

      // Verify network attachment
      const networks = Object.keys(info.NetworkSettings.Networks);
      expect(networks.length).toBeGreaterThan(0);
      console.log(`✓ Container attached to ${networks.length} network(s)`);

      // Verify opclaw-network exists
      const hasOpclawNetwork = networks.some((n: string) => n.includes('opclaw-network'));
      expect(hasOpclawNetwork).toBe(true);
      console.log('✓ Container attached to opclaw-network');

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });

    it('should create container with volume mounts', async () => {
      console.log('\n=== Container Volume Configuration ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'enterprise',
      });

      const container = docker.getContainer(instance.docker_container_id!);
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
      console.log('✓ Data volume mounted');

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });
  });

  describe('Container State Transitions', () => {
    it('should transition from created to running', async () => {
      console.log('\n=== State Transition: Created → Running ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Verify initial state
      const status = await dockerService.getContainerStatus(instance.instance_id);
      expect(status.state).toBe('running');
      console.log('✓ Container state: running');

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });

    it('should transition from running to stopped', async () => {
      console.log('\n=== State Transition: Running → Stopped ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Verify running state
      let status = await dockerService.getContainerStatus(instance.instance_id);
      expect(status.isRunning).toBe(true);
      console.log('✓ Container is running');

      // Stop container
      await instanceService.stopInstance(instance.instance_id);

      // Verify stopped state
      status = await dockerService.getContainerStatus(instance.instance_id);
      expect(status.isRunning).toBe(false);
      expect(status.state).toMatch(/exited|paused/);
      console.log('✓ Container is stopped');

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });

    it('should transition from stopped to running', async () => {
      console.log('\n=== State Transition: Stopped → Running ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Stop container
      await instanceService.stopInstance(instance.instance_id);
      let status = await dockerService.getContainerStatus(instance.instance_id);
      expect(status.isRunning).toBe(false);
      console.log('✓ Container stopped');

      // Start container
      await instanceService.startInstance(instance.instance_id);

      // Verify running state
      status = await dockerService.getContainerStatus(instance.instance_id);
      expect(status.isRunning).toBe(true);
      expect(status.state).toBe('running');
      console.log('✓ Container restarted');

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });

    it('should handle restart operation', async () => {
      console.log('\n=== Container Restart ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Get initial start time
      const initialStatus = await dockerService.getContainerStatus(instance.instance_id);
      const initialStartTime = initialStatus.started;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Restart container
      await dockerService.restartContainer(instance.instance_id);

      // Wait for container to be fully restarted
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify container is running
      const status = await dockerService.getContainerStatus(instance.instance_id);
      expect(status.isRunning).toBe(true);
      console.log('✓ Container restarted');

      // Verify start time changed
      expect(status.started).not.toEqual(initialStartTime);
      console.log('✓ Start time updated');

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });
  });

  describe('Container Stats and Monitoring', () => {
    it('should collect container resource statistics', async () => {
      console.log('\n=== Container Statistics ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Wait for container to generate stats
      await new Promise(resolve => setTimeout(resolve, 2000));

      const stats = await dockerService.getContainerStats(instance.instance_id);

      // Verify stats structure
      expect(stats.id).toBeDefined();
      expect(stats.name).toBeDefined();
      expect(stats.cpuPercent).toBeGreaterThanOrEqual(0);
      expect(stats.cpuPercent).toBeLessThanOrEqual(100);
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.memoryLimit).toBeGreaterThan(0);
      expect(stats.memoryPercent).toBeGreaterThanOrEqual(0);
      expect(stats.memoryPercent).toBeLessThanOrEqual(100);
      expect(stats.timestamp).toBeInstanceOf(Date);

      console.log('✓ Container stats collected');
      console.log(`  CPU: ${stats.cpuPercent.toFixed(2)}%`);
      console.log(`  Memory: ${Math.round(stats.memoryUsage / 1024 / 1024)}MB / ${Math.round(stats.memoryLimit / 1024 / 1024)}MB`);
      console.log(`  Memory %: ${stats.memoryPercent.toFixed(2)}%`);

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });

    it('should verify memory limits are enforced', async () => {
      console.log('\n=== Memory Limit Enforcement ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Wait for container to stabilize
      await new Promise(resolve => setTimeout(resolve, 3000));

      const stats = await dockerService.getContainerStats(instance.instance_id);

      // Memory usage should be less than limit
      expect(stats.memoryUsage).toBeLessThan(stats.memoryLimit);
      console.log('✓ Memory usage within limits');

      // Memory usage should be reasonable for idle container
      const memoryUsageMB = stats.memoryUsage / (1024 * 1024);
      expect(memoryUsageMB).toBeLessThan(1536); // 1.5GB
      console.log(`✓ Memory usage ${memoryUsageMB.toFixed(2)}MB is reasonable`);

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });

    it('should perform health check on container', async () => {
      console.log('\n=== Container Health Check ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Wait for container to be fully started
      await new Promise(resolve => setTimeout(resolve, 2000));

      const health = await dockerService.healthCheck(instance.instance_id);

      // Verify health status
      expect(health.status).toBeDefined();
      expect(health.lastCheck).toBeInstanceOf(Date);

      if (health.status === 'healthy') {
        expect(health.cpuUsage).toBeDefined();
        expect(health.memoryUsage).toBeDefined();
        expect(health.uptime).toBeGreaterThan(0);
        console.log('✓ Container is healthy');
        console.log(`  CPU: ${health.cpuUsage?.toFixed(2)}%, Memory: ${health.memoryUsage?.toFixed(2)}%, Uptime: ${health.uptime}s`);
      } else {
        console.log(`✓ Container health: ${health.status} (${health.reason})`);
      }

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });
  });

  describe('Container Logs', () => {
    it('should retrieve container logs', async () => {
      console.log('\n=== Container Logs ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Wait for container to generate logs
      await new Promise(resolve => setTimeout(resolve, 2000));

      const logs = await dockerService.getLogs(instance.instance_id, { tail: 50 });

      // Verify logs structure
      expect(logs).toBeInstanceOf(Array);
      expect(logs.length).toBeGreaterThanOrEqual(0);

      // Verify log entry structure
      logs.forEach(log => {
        expect(log.message).toBeDefined();
        expect(log.timestamp).toBeInstanceOf(Date);
        expect(log.containerId).toBe(instance.instance_id);
        expect(log.containerName).toBe(`opclaw-${instance.instance_id}`);
      });

      console.log(`✓ Retrieved ${logs.length} log entries`);

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });

    it('should respect log options', async () => {
      console.log('\n=== Log Options ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Wait for container to generate logs
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get limited logs
      const logs = await dockerService.getLogs(instance.instance_id, { tail: 10 });
      expect(logs.length).toBeLessThanOrEqual(10);
      console.log(`✓ Retrieved ${logs.length} log entries (limited to 10)`);

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });
  });

  describe('Container Removal', () => {
    it('should remove container gracefully', async () => {
      console.log('\n=== Container Graceful Removal ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      const containerId = instance.docker_container_id!;

      // Verify container exists
      let containerExists = await DockerHelper.containerExists(containerId);
      expect(containerExists).toBe(true);
      console.log('✓ Container exists before removal');

      // Remove container
      await instanceService.deleteInstance(instance.instance_id);

      // Verify container removed
      containerExists = await DockerHelper.containerExists(containerId);
      expect(containerExists).toBe(false);
      console.log('✓ Container removed');
    });

    it('should force remove running container', async () => {
      console.log('\n=== Container Force Removal ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      const containerId = instance.docker_container_id!;

      // Verify container is running
      const container = docker.getContainer(containerId);
      const info = await container.inspect();
      expect(info.State.Running).toBe(true);
      console.log('✓ Container is running');

      // Force remove without stopping
      await instanceService.deleteInstance(instance.instance_id, true);

      // Verify container removed
      const containerExists = await DockerHelper.containerExists(containerId);
      expect(containerExists).toBe(false);
      console.log('✓ Running container force removed');
    });

    it('should remove container volumes', async () => {
      console.log('\n=== Container Volume Removal ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'enterprise',
      });

      const containerId = instance.docker_container_id!;

      // Get volume name before deletion
      const container = docker.getContainer(containerId);
      const info = await container.inspect();
      const volumeName = info.Mounts?.[0]?.Name;

      expect(volumeName).toBeDefined();
      console.log(`✓ Volume exists: ${volumeName}`);

      // Delete instance (should remove volumes)
      await instanceService.deleteInstance(instance.instance_id);

      // Verify volume is removed
      const volumes = await docker.listVolumes();
      const volumeExists = volumes.Volumes?.some((v: any) => v.Name === volumeName);
      expect(volumeExists).toBe(false);
      console.log('✓ Volume removed');
    });
  });

  describe('Container Lifecycle Performance', () => {
    it('should create container within acceptable time', async () => {
      console.log('\n=== Performance: Container Creation ===');

      const startTime = Date.now();
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });
      const duration = Date.now() - startTime;

      console.log(`✓ Container created in ${duration}ms`);

      // Verify within benchmark
      expect(duration).toBeLessThan(TestFixtures.PERFORMANCE_BENCHMARKS.containerCreation.warning);
      console.log('✓ Creation time within acceptable range');

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });

    it('should start container quickly', async () => {
      console.log('\n=== Performance: Container Start ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Stop container
      await instanceService.stopInstance(instance.instance_id);

      // Start container and measure time
      const startTime = Date.now();
      await instanceService.startInstance(instance.instance_id);
      const duration = Date.now() - startTime;

      console.log(`✓ Container started in ${duration}ms`);

      // Verify within benchmark
      expect(duration).toBeLessThan(TestFixtures.PERFORMANCE_BENCHMARKS.containerStart.warning);
      console.log('✓ Start time within acceptable range');

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });

    it('should stop container quickly', async () => {
      console.log('\n=== Performance: Container Stop ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Stop container and measure time
      const startTime = Date.now();
      await instanceService.stopInstance(instance.instance_id);
      const duration = Date.now() - startTime;

      console.log(`✓ Container stopped in ${duration}ms`);

      // Verify within benchmark
      expect(duration).toBeLessThan(TestFixtures.PERFORMANCE_BENCHMARKS.containerStop.warning);
      console.log('✓ Stop time within acceptable range');

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });

    it('should remove container quickly', async () => {
      console.log('\n=== Performance: Container Removal ===');

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Remove container and measure time
      const startTime = Date.now();
      await instanceService.deleteInstance(instance.instance_id);
      const duration = Date.now() - startTime;

      console.log(`✓ Container removed in ${duration}ms`);

      // Verify within benchmark
      expect(duration).toBeLessThan(TestFixtures.PERFORMANCE_BENCHMARKS.containerRemove.warning);
      console.log('✓ Removal time within acceptable range');
    });
  });
});
