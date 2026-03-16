/**
 * Complete User Journey E2E Tests
 *
 * Tests the complete user journey from registration through instance creation,
 * usage, and deletion. These tests use real Docker containers and database.
 *
 * Test Flow:
 * 1. User registers via OAuth (simulated)
 * 2. User receives API key
 * 3. User creates instance (selects preset)
 * 4. Instance starts and container is running
 * 5. User interacts with instance
 * 6. User stops instance
 * 7. User deletes instance
 * 8. Container and resources are cleaned up
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { AppDataSource } from '../../../src/config/database';
import { InstanceService } from '../../../src/services/InstanceService';
import { ApiKeyService } from '../../../src/services/ApiKeyService';
import { OAuthService } from '../../../src/services/OAuthService';
import { InstanceRepository } from '../../../src/repositories/InstanceRepository';
import { UserRepository } from '../../../src/repositories/UserRepository';
import { ApiKeyRepository } from '../../../src/repositories/ApiKeyRepository';
import { DockerService } from '../../../src/services/DockerService';
import { ErrorService } from '../../../src/services/ErrorService';
import { User } from '../../../src/entities/User.entity';
import { Instance } from '../../../src/entities/Instance.entity';
import { ApiKey } from '../../../src/entities/ApiKey.entity';
import Docker from 'dockerode';
import { DatabaseHelper } from '../helpers/database.helper';
import { DockerHelper } from '../helpers/docker.helper';
import { TestFixtures } from '../helpers/fixtures';

describe('Complete User Journey E2E Tests', () => {
  // Services
  let instanceService: InstanceService;
  let apiKeyService: ApiKeyService;
  let oauthService: OAuthService;
  let dockerService: DockerService;
  let errorService: ErrorService;

  // Repositories
  let instanceRepository: InstanceRepository;
  let userRepository: UserRepository;
  let apiKeyRepository: ApiKeyRepository;

  // Docker
  let docker: Docker;

  // Test data
  let testUser: User;
  let testInstance: Instance;
  let testApiKey: ApiKey;

  beforeAll(async () => {
    // Configure test environment
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-api-key-e2e';
    process.env.FEISHU_APP_ID = 'test_feishu_app_id_e2e';
    process.env.FEISHU_APP_SECRET = 'test_feishu_app_secret_e2e';
    process.env.FEISHU_REDIRECT_URI = 'http://localhost:5173/oauth/callback';
    process.env.JWT_SECRET = 'test-jwt-secret-e2e';
    process.env.JWT_EXPIRES_IN = '7d';
    process.env.DB_HOST = process.env.DB_HOST || 'localhost';
    process.env.DB_PORT = process.env.DB_PORT || '5432';
    process.env.DB_USERNAME = process.env.DB_USERNAME || 'opclaw';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'opclaw';
    process.env.DB_NAME = process.env.DB_NAME || 'opclaw';

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

    // Create repositories
    userRepository = new UserRepository(AppDataSource.getRepository(User));
    instanceRepository = new InstanceRepository(AppDataSource.getRepository(Instance));
    apiKeyRepository = new ApiKeyRepository(AppDataSource.getRepository(ApiKey));
    errorService = new ErrorService();

    // Create services
    dockerService = new DockerService();
    apiKeyService = new ApiKeyService(
      AppDataSource.getRepository(ApiKey),
      instanceRepository,
      errorService
    );
    oauthService = new OAuthService(userRepository);
    instanceService = new InstanceService(
      instanceRepository,
      dockerService,
      apiKeyService,
      errorService
    );

    console.log('✓ E2E test environment initialized');
  });

  afterAll(async () => {
    // Clean up all test data
    await DatabaseHelper.clean();
    await DatabaseHelper.disconnect();
    await DockerHelper.removeAllTestContainers();
    await DockerHelper.cleanupAll();
  });

  beforeEach(async () => {
    // Clean database before each test
    await DatabaseHelper.clean();

    // Create test user
    testUser = await DatabaseHelper.createTestUser();
  });

  afterEach(async () => {
    // Clean up Docker containers
    await DockerHelper.removeAllTestContainers();

    // Clean database
    await DatabaseHelper.clean();
  });

  describe('Complete User Journey: Register → Create → Start → Use → Stop → Delete', () => {
    it('should complete full user journey with personal instance', async () => {
      // Step 1: User registers (simulated OAuth)
      console.log('\n=== Step 1: User Registration ===');
      const authUrl = oauthService.getAuthorizationUrl();
      expect(authUrl).toContain('https://open.feishu.cn/open-apis/authen/v1/authorize');
      expect(authUrl).toContain('app_id=');
      expect(authUrl).not.toContain('undefined');
      console.log('✓ Authorization URL generated');

      // Simulate successful OAuth callback (user is created)
      const userData = TestFixtures.generateTestUser({
        feishu_user_id: testUser.feishu_user_id,
      });
      const registeredUser = await userRepository.findOrCreate(userData.feishu_user_id, userData);
      expect(registeredUser).toBeDefined();
      expect(registeredUser.feishu_user_id).toBe(userData.feishu_user_id);
      console.log('✓ User registered via OAuth');

      // Step 2: User receives API key
      console.log('\n=== Step 2: API Key Allocation ===');
      testApiKey = await apiKeyService.allocateApiKey(registeredUser.id);
      expect(testApiKey).toBeDefined();
      expect(testApiKey.key).toMatch(/^sk-/);
      expect(testApiKey.user_id).toBe(registeredUser.id);
      expect(testApiKey.status).toBe('active');
      console.log(`✓ API key allocated: ${testApiKey.key}`);

      // Verify API key in database
      const apiKeyRecord = await apiKeyRepository.findByKey(testApiKey.key);
      expect(apiKeyRecord).toBeDefined();
      expect(apiKeyRecord!.key).toBe(testApiKey.key);
      console.log('✓ API key stored in database');

      // Step 3: User creates instance (selects personal preset)
      console.log('\n=== Step 3: Instance Creation ===');
      const creationStartTime = Date.now();
      testInstance = await instanceService.createInstance(registeredUser, {
        template: 'personal',
      });
      const creationTime = Date.now() - creationStartTime;

      expect(testInstance).toBeDefined();
      expect(testInstance.instance_id).toBeDefined();
      expect(testInstance.owner_id).toBe(registeredUser.id);
      expect(testInstance.template).toBe('personal');
      expect(testInstance.status).toBe('active');
      expect(testInstance.docker_container_id).toBeDefined();
      console.log(`✓ Instance created in ${creationTime}ms: ${testInstance.instance_id}`);

      // Verify creation time is within acceptable range
      expect(creationTime).toBeLessThan(TestFixtures.PERFORMANCE_BENCHMARKS.instanceCreation.warning);
      console.log('✓ Creation time within acceptable range');

      // Verify instance in database
      const dbInstance = await DatabaseHelper.findInstanceById(testInstance.instance_id);
      expect(dbInstance).toBeDefined();
      expect(dbInstance!.status).toBe('active');
      console.log('✓ Instance stored in database');

      // Step 4: Verify container is running
      console.log('\n=== Step 4: Container Running ===');
      const containerStatus = await dockerService.getContainerStatus(testInstance.instance_id);
      expect(containerStatus.isRunning).toBe(true);
      expect(containerStatus.name).toBe(`opclaw-${testInstance.instance_id}`);
      console.log(`✓ Container running: ${containerStatus.name}`);

      // Verify container exists in Docker
      const containerExists = await DockerHelper.containerExists(testInstance.docker_container_id!);
      expect(containerExists).toBe(true);
      console.log('✓ Container exists in Docker');

      // Verify container configuration
      const container = docker.getContainer(testInstance.docker_container_id!);
      const containerInfo = await container.inspect();
      expect(containerInfo.State.Running).toBe(true);
      expect(containerInfo.Config.Env).toContain(`INSTANCE_ID=${testInstance.instance_id}`);
      console.log('✓ Container configuration correct');

      // Step 5: User interacts with instance (simulate usage)
      console.log('\n=== Step 5: Instance Usage ===');
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for container to stabilize

      const stats = await dockerService.getContainerStats(testInstance.instance_id);
      expect(stats.id).toBeDefined();
      expect(stats.memoryUsage).toBeGreaterThan(0);
      console.log(`✓ Container stats collected: CPU=${stats.cpuPercent.toFixed(2)}%, Memory=${Math.round(stats.memoryUsage / 1024 / 1024)}MB`);

      // Verify health check
      const health = await dockerService.healthCheck(testInstance.instance_id);
      expect(health.status).toBe('healthy');
      console.log(`✓ Container health: ${health.status}`);

      // Step 6: User stops instance
      console.log('\n=== Step 6: Instance Stopped ===');
      const stopStartTime = Date.now();
      const stoppedInstance = await instanceService.stopInstance(testInstance.instance_id);
      const stopTime = Date.now() - stopStartTime;

      expect(stoppedInstance.status).toBe('stopped');
      console.log(`✓ Instance stopped in ${stopTime}ms`);

      // Verify stop time is within acceptable range
      expect(stopTime).toBeLessThan(TestFixtures.PERFORMANCE_BENCHMARKS.containerStop.warning);
      console.log('✓ Stop time within acceptable range');

      // Verify container is stopped
      const stoppedStatus = await dockerService.getContainerStatus(testInstance.instance_id);
      expect(stoppedStatus.isRunning).toBe(false);
      console.log('✓ Container stopped');

      // Verify database status updated
      const stoppedDbInstance = await DatabaseHelper.findInstanceById(testInstance.instance_id);
      expect(stoppedDbInstance!.status).toBe('stopped');
      console.log('✓ Database status updated');

      // Step 7: User restarts instance (optional, demonstrates flexibility)
      console.log('\n=== Step 7: Instance Restarted ===');
      const startedInstance = await instanceService.startInstance(testInstance.instance_id);
      expect(startedInstance.status).toBe('active');
      console.log('✓ Instance restarted');

      const runningStatus = await dockerService.getContainerStatus(testInstance.instance_id);
      expect(runningStatus.isRunning).toBe(true);
      console.log('✓ Container running again');

      // Step 8: User deletes instance
      console.log('\n=== Step 8: Instance Deletion ===');
      const deleteStartTime = Date.now();
      await instanceService.deleteInstance(testInstance.instance_id);
      const deleteTime = Date.now() - deleteStartTime;

      console.log(`✓ Instance deleted in ${deleteTime}ms`);

      // Verify deletion time is within acceptable range
      expect(deleteTime).toBeLessThan(TestFixtures.PERFORMANCE_BENCHMARKS.containerRemove.warning);
      console.log('✓ Deletion time within acceptable range');

      // Verify container removed
      const containerStillExists = await DockerHelper.containerExists(testInstance.docker_container_id!);
      expect(containerStillExists).toBe(false);
      console.log('✓ Container removed from Docker');

      // Verify database record deleted
      const deletedDbInstance = await DatabaseHelper.findInstanceById(testInstance.instance_id);
      expect(deletedDbInstance).toBeNull();
      console.log('✓ Database record removed');

      // Verify API key released
      const releasedApiKey = await apiKeyRepository.findByKey(testApiKey.key);
      expect(releasedApiKey).toBeNull();
      console.log('✓ API key released');

      console.log('\n=== Complete User Journey: SUCCESS ===');
    });

    it('should complete user journey with team instance', async () => {
      // Complete journey with team template
      const teamInstance = await instanceService.createInstance(testUser, {
        template: 'team',
      });

      expect(teamInstance.template).toBe('team');
      expect(teamInstance.status).toBe('active');

      // Verify team-specific configuration
      const container = docker.getContainer(teamInstance.docker_container_id!);
      const containerInfo = await container.inspect();
      const skillsEnv = containerInfo.Config.Env?.find(e => e.startsWith('ENABLED_SKILLS='));
      expect(skillsEnv).toBeDefined();

      const skills = skillsEnv!.split('=')[1].split(',');
      expect(skills.length).toBe(4); // Team has 4 skills
      console.log('✓ Team instance has correct skills');

      // Cleanup
      await instanceService.deleteInstance(teamInstance.instance_id);
    });

    it('should complete user journey with enterprise instance', async () => {
      // Complete journey with enterprise template
      const enterpriseInstance = await instanceService.createInstance(testUser, {
        template: 'enterprise',
      });

      expect(enterpriseInstance.template).toBe('enterprise');
      expect(enterpriseInstance.status).toBe('active');

      // Verify enterprise-specific configuration
      const container = docker.getContainer(enterpriseInstance.docker_container_id!);
      const containerInfo = await container.inspect();
      const skillsEnv = containerInfo.Config.Env?.find(e => e.startsWith('ENABLED_SKILLS='));
      expect(skillsEnv).toBeDefined();

      const skills = skillsEnv!.split('=')[1].split(',');
      expect(skills.length).toBe(5); // Enterprise has 5 skills
      console.log('✓ Enterprise instance has correct skills');

      // Verify resource limits
      const memoryLimit = containerInfo.HostConfig.Memory;
      expect(memoryLimit).toBeGreaterThan(1024 * 1024 * 1024); // More than 1GB
      console.log(`✓ Enterprise instance has ${Math.round(memoryLimit! / 1024 / 1024)}MB memory`);

      // Cleanup
      await instanceService.deleteInstance(enterpriseInstance.instance_id);
    });
  });

  describe('Multi-Instance User Journey', () => {
    it('should allow user to create and manage multiple instances', async () => {
      console.log('\n=== Multi-Instance Journey ===');

      // Allocate API key
      testApiKey = await apiKeyService.allocateApiKey(testUser.id);

      // Create multiple instances
      const instances: Instance[] = [];
      const templates: Array<'personal' | 'team' | 'enterprise'> = ['personal', 'team', 'enterprise'];

      for (const template of templates) {
        const instance = await instanceService.createInstance(testUser, { template });
        instances.push(instance);
        console.log(`✓ Created ${template} instance: ${instance.instance_id}`);
      }

      // Verify all instances are running
      for (const instance of instances) {
        const status = await dockerService.getContainerStatus(instance.instance_id);
        expect(status.isRunning).toBe(true);
        console.log(`✓ Instance ${instance.instance_id} is running`);
      }

      // Verify all instances in database
      const userInstanceCount = await DatabaseHelper.countUserInstances(testUser.id);
      expect(userInstanceCount).toBe(3);
      console.log(`✓ User has ${userInstanceCount} instances in database`);

      // Stop all instances
      for (const instance of instances) {
        await instanceService.stopInstance(instance.instance_id);
        const status = await dockerService.getContainerStatus(instance.instance_id);
        expect(status.isRunning).toBe(false);
      }
      console.log('✓ All instances stopped');

      // Start all instances
      for (const instance of instances) {
        await instanceService.startInstance(instance.instance_id);
        const status = await dockerService.getContainerStatus(instance.instance_id);
        expect(status.isRunning).toBe(true);
      }
      console.log('✓ All instances restarted');

      // Delete all instances
      for (const instance of instances) {
        await instanceService.deleteInstance(instance.instance_id);
        const exists = await DatabaseHelper.findInstanceById(instance.instance_id);
        expect(exists).toBeNull();
      }
      console.log('✓ All instances deleted');

      // Verify no instances remain
      const finalCount = await DatabaseHelper.countUserInstances(testUser.id);
      expect(finalCount).toBe(0);
      console.log('✓ All instances cleaned up');
    });

    it('should handle instance isolation correctly', async () => {
      console.log('\n=== Instance Isolation Test ===');

      // Create two instances for the same user
      testApiKey = await apiKeyService.allocateApiKey(testUser.id);

      const instance1 = await instanceService.createInstance(testUser, { template: 'personal' });
      const instance2 = await instanceService.createInstance(testUser, { template: 'team' });

      // Verify they have different container IDs
      expect(instance1.docker_container_id).not.toBe(instance2.docker_container_id);
      console.log('✓ Instances have different containers');

      // Verify they have different instance IDs
      expect(instance1.instance_id).not.toBe(instance2.instance_id);
      console.log('✓ Instances have different IDs');

      // Verify both are running independently
      const status1 = await dockerService.getContainerStatus(instance1.instance_id);
      const status2 = await dockerService.getContainerStatus(instance2.instance_id);
      expect(status1.isRunning).toBe(true);
      expect(status2.isRunning).toBe(true);
      console.log('✓ Both instances running independently');

      // Stop one instance - other should remain running
      await instanceService.stopInstance(instance1.instance_id);
      const stoppedStatus1 = await dockerService.getContainerStatus(instance1.instance_id);
      const runningStatus2 = await dockerService.getContainerStatus(instance2.instance_id);
      expect(stoppedStatus1.isRunning).toBe(false);
      expect(runningStatus2.isRunning).toBe(true);
      console.log('✓ Instance isolation maintained');

      // Cleanup
      await instanceService.deleteInstance(instance1.instance_id);
      await instanceService.deleteInstance(instance2.instance_id);
    });
  });

  describe('Error Recovery in User Journey', () => {
    it('should handle and recover from container creation failure', async () => {
      console.log('\n=== Error Recovery: Container Creation ===');

      // Try to create instance with invalid template (should fail gracefully)
      await expect(
        instanceService.createInstance(testUser, {
          template: 'invalid' as any,
        })
      ).rejects.toThrow();
      console.log('✓ Invalid template rejected');

      // Verify no partial instance was created
      const instances = await DatabaseHelper.countUserInstances(testUser.id);
      expect(instances).toBe(0);
      console.log('✓ No partial instance created');
    });

    it('should handle instance deletion when container already removed', async () => {
      console.log('\n=== Error Recovery: Orphaned Instance Record ===');

      testApiKey = await apiKeyService.allocateApiKey(testUser.id);
      const instance = await instanceService.createInstance(testUser, { template: 'personal' });

      // Manually remove container
      await dockerService.removeContainer(instance.instance_id, false, true);

      // Delete instance should handle missing container gracefully
      await instanceService.deleteInstance(instance.instance_id);
      console.log('✓ Instance deletion handled missing container');

      // Verify database record removed
      const exists = await DatabaseHelper.findInstanceById(instance.instance_id);
      expect(exists).toBeNull();
      console.log('✓ Database record cleaned up');
    });
  });
});
