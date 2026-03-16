/**
 * Integration Tests for InstanceService with REAL Docker Operations
 *
 * These tests verify that InstanceService properly integrates with DockerService
 * to manage the complete instance lifecycle with actual Docker containers.
 *
 * Tests follow TDD principles:
 * - RED: Write failing tests first
 * - GREEN: Make them pass with real implementation
 * - REFACTOR: Clean up and optimize
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { InstanceService } from '../../src/services/InstanceService';
import { InstanceRepository } from '../../src/repositories/InstanceRepository';
import { ApiKeyService } from '../../src/services/ApiKeyService';
import { DockerService } from '../../src/services/DockerService';
import { ErrorService } from '../../src/services/ErrorService';
import { AppDataSource } from '../../src/config/database';
import { Instance } from '../../src/entities/Instance.entity';
import { User } from '../../src/entities/User.entity';
import { ApiKey } from '../../src/entities/ApiKey.entity';
import Docker from 'dockerode';

describe('InstanceService Integration Tests - Real Docker Operations', () => {
  let instanceService: InstanceService;
  let instanceRepository: InstanceRepository;
  let apiKeyService: ApiKeyService;
  let dockerService: DockerService;
  let errorService: ErrorService;
  let docker: Docker;
  let testUser: User;

  // Track created containers for cleanup
  let createdContainerIds: string[] = [];
  let createdInstanceIds: string[] = [];

  // Set up environment variables
  const originalEnv = process.env;

  beforeAll(async () => {
    // Configure test environment
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-api-key-integration';
    process.env.FEISHU_APP_ID = 'test_app_id_integration';
    process.env.FEISHU_APP_SECRET = 'test_app_secret_integration';
    process.env.FEISHU_REDIRECT_URI = 'http://localhost:5173/oauth/callback';
    process.env.DB_HOST = process.env.DB_HOST || 'localhost';
    process.env.DB_PORT = process.env.DB_PORT || '5432';
    process.env.DB_USERNAME = process.env.DB_USERNAME || 'opclaw';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'opclaw';
    process.env.DB_NAME = process.env.DB_NAME || 'opclaw';

    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Initialize Docker service and verify Docker daemon is accessible
    dockerService = new DockerService();
    docker = new Docker({ socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock' });

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
      throw new Error('Required image openclaw/agent:latest not found. Run TASK-040 first to build the image.');
    }
    console.log('✓ openclaw/agent:latest image exists');

    // Create repositories and services
    instanceRepository = new InstanceRepository(AppDataSource.getRepository(Instance));
    errorService = new ErrorService();

    // Create ApiKeyService with all dependencies
    apiKeyService = new ApiKeyService(
      AppDataSource.getRepository(ApiKey),
      instanceRepository,
      errorService
    );

    // Create InstanceService with REAL DockerService
    instanceService = new InstanceService(
      instanceRepository,
      dockerService,
      apiKeyService,
      errorService
    );

    // Create test user
    const userRepository = AppDataSource.getRepository(User);
    testUser = userRepository.create({
      feishu_user_id: `test-user-integration-${Date.now()}`,
      name: 'Integration Test User',
      email: `integration-test-${Date.now()}@example.com`,
    });
    await userRepository.save(testUser);
    console.log(`✓ Created test user: ${testUser.id}`);
  });

  afterAll(async () => {
    // Clean up all created instances from database
    const instanceRepo = AppDataSource.getRepository(Instance);
    for (const instanceId of createdInstanceIds) {
      await instanceRepo.delete({ instance_id: instanceId });
    }

    // Clean up API keys
    const apiKeyRepo = AppDataSource.getRepository(ApiKey);
    await apiKeyRepo.delete({});

    // Clean up test user
    if (testUser) {
      const userRepository = AppDataSource.getRepository(User);
      await userRepository.delete(testUser.id);
    }

    // Close database connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }

    // Restore environment
    process.env = originalEnv;
  });

  beforeEach(async () => {
    // Clean up instances and API keys before each test
    const instanceRepo = AppDataSource.getRepository(Instance);
    await instanceRepo.delete({});

    const apiKeyRepo = AppDataSource.getRepository(ApiKey);
    await apiKeyRepo.delete({});

    createdContainerIds = [];
    createdInstanceIds = [];
  });

  afterEach(async () => {
    // Clean up containers after each test
    for (const containerId of createdContainerIds) {
      try {
        const container = docker.getContainer(containerId);
        await container.remove({ force: true, v: true });
        console.log(`✓ Cleaned up container ${containerId}`);
      } catch (error) {
        console.warn(`Failed to cleanup container ${containerId}:`, error);
      }
    }

    // Clean up any leftover test containers
    try {
      const containers = await docker.listContainers({ all: true });
      for (const c of containers) {
        if (c.Names.some((n: string) => n.includes('inst-'))) {
          try {
            const container = docker.getContainer(c.Id);
            await container.remove({ force: true, v: true });
            console.log(`✓ Cleaned up leftover container ${c.Id}`);
          } catch (error) {
            console.warn(`Failed to cleanup leftover container:`, error);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup leftover containers:', error);
    }

    // Clean up instances from database
    const instanceRepo = AppDataSource.getRepository(Instance);
    await instanceRepo.delete({});

    const apiKeyRepo = AppDataSource.getRepository(ApiKey);
    await apiKeyRepo.delete({});
  });

  describe('createInstance() - Real Docker Container Creation', () => {
    it('should create a real Docker container when creating an instance', async () => {
      // Create instance
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Track for cleanup
      createdInstanceIds.push(instance.instance_id);
      createdContainerIds.push(instance.docker_container_id!);

      // Verify instance record
      expect(instance).toBeDefined();
      expect(instance.instance_id).toBeDefined();
      expect(instance.owner_id).toBe(testUser.id);
      expect(instance.template).toBe('personal');
      expect(instance.status).toBe('active');
      expect(instance.docker_container_id).toBeDefined();

      // Verify container exists in Docker
      const container = docker.getContainer(instance.docker_container_id!);
      const info = await container.inspect();

      expect(info.State.Running).toBe(true);
      expect(info.Name).toBe(`/opclaw-${instance.instance_id}`);
      console.log(`✓ Created real container: ${instance.docker_container_id}`);
    });

    it('should apply preset configuration to container environment variables', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      createdInstanceIds.push(instance.instance_id);
      createdContainerIds.push(instance.docker_container_id!);

      // Verify container environment
      const container = docker.getContainer(instance.docker_container_id!);
      const info = await container.inspect();

      const envVars = info.Config.Env || [];

      // Verify LLM configuration
      expect(envVars).toContain(`DEEPSEEK_API_KEY=${process.env.DEEPSEEK_API_KEY}`);
      expect(envVars).toContain(`DEEPSEEK_MODEL=deepseek-chat`);
      expect(envVars).toContain(`TEMPERATURE=0.7`);
      expect(envVars).toContain(`MAX_TOKENS=4000`);

      // Verify Feishu configuration
      expect(envVars).toContain(`FEISHU_APP_ID=${process.env.FEISHU_APP_ID}`);

      // Verify skills configuration
      expect(envVars).toContain(`ENABLED_SKILLS=general_chat,web_search,knowledge_base`);

      console.log('✓ Preset configuration applied to container environment');
    });

    it('should create different configurations for different templates', async () => {
      const personalInstance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });
      createdInstanceIds.push(personalInstance.instance_id);
      createdContainerIds.push(personalInstance.docker_container_id!);

      const teamInstance = await instanceService.createInstance(testUser, {
        template: 'team',
      });
      createdInstanceIds.push(teamInstance.instance_id);
      createdContainerIds.push(teamInstance.docker_container_id!);

      // Get container environments
      const personalContainer = docker.getContainer(personalInstance.docker_container_id!);
      const personalEnv = (await personalContainer.inspect()).Config.Env || [];

      const teamContainer = docker.getContainer(teamInstance.docker_container_id!);
      const teamEnv = (await teamContainer.inspect()).Config.Env || [];

      // Verify different skills
      const personalSkills = personalEnv.find(e => e.startsWith('ENABLED_SKILLS='));
      const teamSkills = teamEnv.find(e => e.startsWith('ENABLED_SKILLS='));

      expect(personalSkills).toBeDefined();
      expect(teamSkills).toBeDefined();

      // Personal should have 3 skills, team should have 4
      expect(personalSkills?.split('=')[1].split(',').length).toBe(3);
      expect(teamSkills?.split('=')[1].split(',').length).toBe(4);

      console.log('✓ Different templates have different configurations');
    });

    it('should create container with correct resource limits', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      createdInstanceIds.push(instance.instance_id);
      createdContainerIds.push(instance.docker_container_id!);

      // Verify resource limits
      const container = docker.getContainer(instance.docker_container_id!);
      const info = await container.inspect();

      // Memory limit (should be 1GB)
      const memoryLimit = info.HostConfig.Memory;
      expect(memoryLimit).toBeDefined();
      expect(memoryLimit).toBeGreaterThan(0);
      expect(memoryLimit).toBeLessThanOrEqual(2 * 1024 * 1024 * 1024);

      // CPU quota
      const cpuQuota = info.HostConfig.NanoCpus;
      expect(cpuQuota).toBeDefined();
      expect(cpuQuota).toBeGreaterThan(0);

      console.log(`✓ Resource limits applied: Memory=${Math.round(memoryLimit! / 1024 / 1024)}MB, CPU=${cpuQuota}`);
    });

    it('should synchronize container status to database', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      createdInstanceIds.push(instance.instance_id);
      createdContainerIds.push(instance.docker_container_id!);

      // Verify database record
      const instanceRepo = AppDataSource.getRepository(Instance);
      const dbInstance = await instanceRepo.findOne({
        where: { instance_id: instance.instance_id },
      });

      expect(dbInstance).toBeDefined();
      expect(dbInstance!.status).toBe('active');
      expect(dbInstance!.docker_container_id).toBe(instance.docker_container_id);
      expect(dbInstance!.template).toBe('personal');
      expect(dbInstance!.config).toBeDefined();

      console.log('✓ Container status synchronized to database');
    });

    it('should handle instance creation failure gracefully', async () => {
      // Mock DockerService to fail
      const originalCreateContainer = dockerService.createContainer;
      dockerService.createContainer = jest.fn().mockRejectedValue(new Error('Docker daemon error'));

      // Attempt to create instance
      await expect(
        instanceService.createInstance(testUser, {
          template: 'personal',
        })
      ).rejects.toThrow();

      // Verify no instance was created in database
      const instanceRepo = AppDataSource.getRepository(Instance);
      const instances = await instanceRepo.find({
        where: { owner_id: testUser.id },
      });

      expect(instances).toHaveLength(0);

      // Restore original method
      dockerService.createContainer = originalCreateContainer;

      console.log('✓ Instance creation failure handled gracefully');
    });
  });

  describe('startInstance() - Start Real Container', () => {
    it('should start a stopped container', async () => {
      // Create and then stop an instance
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      createdInstanceIds.push(instance.instance_id);
      createdContainerIds.push(instance.docker_container_id!);

      // Stop the instance
      await instanceService.stopInstance(instance.instance_id);

      // Verify container is stopped
      let containerStatus = await dockerService.getContainerStatus(instance.instance_id);
      expect(containerStatus.isRunning).toBe(false);

      // Start the instance
      const startedInstance = await instanceService.startInstance(instance.instance_id);

      // Verify container is running
      containerStatus = await dockerService.getContainerStatus(instance.instance_id);
      expect(containerStatus.isRunning).toBe(true);

      // Verify database status
      expect(startedInstance.status).toBe('active');

      console.log('✓ Container started successfully');
    });

    it('should update database status when starting instance', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      createdInstanceIds.push(instance.instance_id);
      createdContainerIds.push(instance.docker_container_id!);

      // Stop the instance
      await instanceService.stopInstance(instance.instance_id);

      // Start the instance
      const startedInstance = await instanceService.startInstance(instance.instance_id);

      // Verify database status
      const instanceRepo = AppDataSource.getRepository(Instance);
      const dbInstance = await instanceRepo.findOne({
        where: { instance_id: instance.instance_id },
      });

      expect(dbInstance!.status).toBe('active');
      expect(startedInstance.status).toBe('active');

      console.log('✓ Database status updated on start');
    });

    it('should reset restart attempts when starting instance', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      createdInstanceIds.push(instance.instance_id);
      createdContainerIds.push(instance.docker_container_id!);

      // Increment restart attempts
      await instanceRepository.incrementRestartAttempts(instance.instance_id);

      // Stop and start the instance
      await instanceService.stopInstance(instance.instance_id);
      await instanceService.startInstance(instance.instance_id);

      // Verify restart attempts reset
      const updatedInstance = await instanceService.getInstanceById(instance.instance_id);
      expect(updatedInstance.restart_attempts).toBe(0);

      console.log('✓ Restart attempts reset on start');
    });

    it('should validate state transition before starting', async () => {
      // Create instance
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      createdInstanceIds.push(instance.instance_id);
      createdContainerIds.push(instance.docker_container_id!);

      // Try to start already running instance (should fail validation)
      await expect(
        instanceService.startInstance(instance.instance_id)
      ).rejects.toThrow();

      console.log('✓ State transition validation works');
    });
  });

  describe('stopInstance() - Stop Real Container', () => {
    it('should stop a running container', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      createdInstanceIds.push(instance.instance_id);
      createdContainerIds.push(instance.docker_container_id!);

      // Verify container is running
      let containerStatus = await dockerService.getContainerStatus(instance.instance_id);
      expect(containerStatus.isRunning).toBe(true);

      // Stop the instance
      const stoppedInstance = await instanceService.stopInstance(instance.instance_id);

      // Verify container is stopped
      containerStatus = await dockerService.getContainerStatus(instance.instance_id);
      expect(containerStatus.isRunning).toBe(false);

      // Verify database status
      expect(stoppedInstance.status).toBe('stopped');

      console.log('✓ Container stopped successfully');
    });

    it('should update database status when stopping instance', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      createdInstanceIds.push(instance.instance_id);
      createdContainerIds.push(instance.docker_container_id!);

      // Stop the instance
      const stoppedInstance = await instanceService.stopInstance(instance.instance_id);

      // Verify database status
      const instanceRepo = AppDataSource.getRepository(Instance);
      const dbInstance = await instanceRepo.findOne({
        where: { instance_id: instance.instance_id },
      });

      expect(dbInstance!.status).toBe('stopped');
      expect(stoppedInstance.status).toBe('stopped');

      console.log('✓ Database status updated on stop');
    });

    it('should respect timeout when stopping container', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      createdInstanceIds.push(instance.instance_id);
      createdContainerIds.push(instance.docker_container_id!);

      // Stop with custom timeout
      const stopStartTime = Date.now();
      await instanceService.stopInstance(instance.instance_id, 5);
      const stopDuration = Date.now() - stopStartTime;

      // Should complete within reasonable time
      expect(stopDuration).toBeLessThan(10000);

      console.log(`✓ Container stopped in ${stopDuration}ms with timeout`);
    });
  });

  describe('deleteInstance() - Delete Real Container', () => {
    it('should delete container and remove from database', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      const instanceId = instance.instance_id;
      const containerId = instance.docker_container_id!;

      // Verify container exists
      const container = docker.getContainer(containerId);
      await container.inspect();
      console.log(`✓ Container exists before deletion: ${containerId}`);

      // Delete the instance
      await instanceService.deleteInstance(instanceId);

      // Verify container no longer exists
      await expect(container.inspect()).rejects.toThrow();
      console.log('✓ Container removed');

      // Verify database record deleted
      const instanceRepo = AppDataSource.getRepository(Instance);
      const dbInstance = await instanceRepo.findOne({
        where: { instance_id: instanceId },
      });

      expect(dbInstance).toBeNull();
      console.log('✓ Database record removed');

      // Don't add to cleanup lists since we already deleted everything
      createdContainerIds = createdContainerIds.filter(id => id !== containerId);
      createdInstanceIds = createdInstanceIds.filter(id => id !== instanceId);
    });

    it('should release API key when deleting instance', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      const instanceId = instance.instance_id;
      const containerId = instance.docker_container_id!;

      // Get API key before deletion
      const apiKeyRepo = AppDataSource.getRepository(ApiKey);
      const apiKeysBefore = await apiKeyRepo.find({
        where: { instance_id: instanceId },
      });

      expect(apiKeysBefore.length).toBe(1);

      // Delete the instance
      await instanceService.deleteInstance(instanceId);

      // Verify API key is released
      const apiKeysAfter = await apiKeyRepo.find({
        where: { instance_id: instanceId },
      });

      expect(apiKeysAfter.length).toBe(0);

      // Don't add to cleanup lists
      createdContainerIds = createdContainerIds.filter(id => id !== containerId);
      createdInstanceIds = createdInstanceIds.filter(id => id !== instanceId);

      console.log('✓ API key released');
    });

    it('should remove volumes when deleting instance', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      const instanceId = instance.instance_id;
      const containerId = instance.docker_container_id!;

      // Get volume name before deletion
      const container = docker.getContainer(containerId);
      const info = await container.inspect();
      const volumeName = info.Mounts?.[0]?.Name;

      expect(volumeName).toBeDefined();
      console.log(`✓ Volume exists before deletion: ${volumeName}`);

      // Delete the instance
      await instanceService.deleteInstance(instanceId);

      // Verify volume is removed
      const volumes = await docker.listVolumes();
      const volumeExists = volumes.Volumes?.some((v: any) => v.Name === volumeName);

      expect(volumeExists).toBe(false);
      console.log('✓ Volume removed');

      // Don't add to cleanup lists
      createdContainerIds = createdContainerIds.filter(id => id !== containerId);
      createdInstanceIds = createdInstanceIds.filter(id => id !== instanceId);
    });

    it('should force delete running container', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      const instanceId = instance.instance_id;
      const containerId = instance.docker_container_id!;

      // Verify container is running
      const container = docker.getContainer(containerId);
      const info = await container.inspect();
      expect(info.State.Running).toBe(true);

      // Force delete without stopping
      await instanceService.deleteInstance(instanceId, true);

      // Verify container is removed
      await expect(container.inspect()).rejects.toThrow();

      // Don't add to cleanup lists
      createdContainerIds = createdContainerIds.filter(id => id !== containerId);
      createdInstanceIds = createdInstanceIds.filter(id => id !== instanceId);

      console.log('✓ Force deleted running container');
    });
  });

  describe('Complete Instance Lifecycle', () => {
    it('should complete full lifecycle: create → start → stop → delete', async () => {
      // 1. Create instance
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      const instanceId = instance.instance_id;
      const containerId = instance.docker_container_id!;

      createdInstanceIds.push(instanceId);
      createdContainerIds.push(containerId);

      expect(instance.status).toBe('active');

      // Verify container is running
      let containerStatus = await dockerService.getContainerStatus(instanceId);
      expect(containerStatus.isRunning).toBe(true);
      console.log('✓ Step 1: Instance created and container running');

      // 2. Stop instance
      const stoppedInstance = await instanceService.stopInstance(instanceId);
      expect(stoppedInstance.status).toBe('stopped');

      containerStatus = await dockerService.getContainerStatus(instanceId);
      expect(containerStatus.isRunning).toBe(false);
      console.log('✓ Step 2: Instance stopped');

      // 3. Start instance
      const startedInstance = await instanceService.startInstance(instanceId);
      expect(startedInstance.status).toBe('active');

      containerStatus = await dockerService.getContainerStatus(instanceId);
      expect(containerStatus.isRunning).toBe(true);
      console.log('✓ Step 3: Instance restarted');

      // 4. Delete instance
      await instanceService.deleteInstance(instanceId);

      // Verify container removed
      const container = docker.getContainer(containerId);
      await expect(container.inspect()).rejects.toThrow();

      // Verify database record removed
      const instanceRepo = AppDataSource.getRepository(Instance);
      const dbInstance = await instanceRepo.findOne({
        where: { instance_id: instanceId },
      });

      expect(dbInstance).toBeNull();
      console.log('✓ Step 4: Instance deleted');

      // Don't add to cleanup lists
      createdContainerIds = [];
      createdInstanceIds = [];
    });

    it('should handle multiple instances concurrently', async () => {
      // Create multiple instances
      const instance1 = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      const instance2 = await instanceService.createInstance(testUser, {
        template: 'team',
      });

      const instance3 = await instanceService.createInstance(testUser, {
        template: 'enterprise',
      });

      createdInstanceIds.push(instance1.instance_id, instance2.instance_id, instance3.instance_id);
      createdContainerIds.push(
        instance1.docker_container_id!,
        instance2.docker_container_id!,
        instance3.docker_container_id!
      );

      // Verify all containers are running
      const status1 = await dockerService.getContainerStatus(instance1.instance_id);
      const status2 = await dockerService.getContainerStatus(instance2.instance_id);
      const status3 = await dockerService.getContainerStatus(instance3.instance_id);

      expect(status1.isRunning).toBe(true);
      expect(status2.isRunning).toBe(true);
      expect(status3.isRunning).toBe(true);

      // Verify all instances in database
      const instanceRepo = AppDataSource.getRepository(Instance);
      const instances = await instanceRepo.find({
        where: { owner_id: testUser.id },
      });

      expect(instances).toHaveLength(3);

      console.log('✓ All 3 instances created and running');
    });
  });

  describe('Container Status Synchronization', () => {
    it('should sync container status to database', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      createdInstanceIds.push(instance.instance_id);
      createdContainerIds.push(instance.docker_container_id!);

      // Get instance status (should sync from container)
      const instanceState = await instanceService.getInstanceStatus(instance.instance_id);

      expect(instanceState.status).toBe('active');
      expect(instanceState.containerId).toBe(instance.docker_container_id);
      expect(instanceState.instanceId).toBe(instance.instance_id);

      console.log('✓ Container status synchronized');
    });

    it('should get container health status', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      createdInstanceIds.push(instance.instance_id);
      createdContainerIds.push(instance.docker_container_id!);

      // Wait for container to be fully started
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get health status
      const health = await instanceService.getInstanceHealth(instance.instance_id);

      expect(health.status).toBeDefined();
      expect(health.lastCheck).toBeInstanceOf(Date);

      console.log(`✓ Health status: ${health.status}`);
    });

    it('should get instance statistics', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      createdInstanceIds.push(instance.instance_id);
      createdContainerIds.push(instance.docker_container_id!);

      // Wait for container to generate stats
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get instance stats
      const stats = await instanceService.getInstanceStats(instance.instance_id);

      expect(stats.status).toBeDefined();
      expect(stats.restartAttempts).toBeDefined();
      expect(stats.healthStatus).toBeDefined();

      console.log(`✓ Instance stats: status=${stats.status}, restarts=${stats.restartAttempts}`);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle non-existent instance gracefully', async () => {
      await expect(
        instanceService.getInstanceById('non-existent-instance')
      ).rejects.toThrow();

      console.log('✓ Non-existent instance error handled');
    });

    it('should handle starting non-existent container', async () => {
      // Create instance record without container
      const instanceRepo = AppDataSource.getRepository(Instance);
      const instance = instanceRepo.create({
        instance_id: 'no-container-instance',
        owner_id: testUser.id,
        status: 'stopped',
        template: 'personal',
        config: {},
        restart_attempts: 0,
        health_status: {},
      });
      await instanceRepo.save(instance);

      // Try to start (should fail)
      await expect(
        instanceService.startInstance('no-container-instance')
      ).rejects.toThrow();

      console.log('✓ Starting non-existent container handled');
    });

    it('should handle stopping non-existent container', async () => {
      // Create instance record without container
      const instanceRepo = AppDataSource.getRepository(Instance);
      const instance = instanceRepo.create({
        instance_id: 'no-container-instance-2',
        owner_id: testUser.id,
        status: 'active',
        template: 'personal',
        config: {},
        restart_attempts: 0,
        health_status: {},
      });
      await instanceRepo.save(instance);

      // Try to stop (should fail)
      await expect(
        instanceService.stopInstance('no-container-instance-2')
      ).rejects.toThrow();

      console.log('✓ Stopping non-existent container handled');
    });
  });
});
