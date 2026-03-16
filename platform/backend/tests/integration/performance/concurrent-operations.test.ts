/**
 * Concurrent Operations Performance Tests
 *
 * Tests system performance under concurrent load, including:
 * - Multiple instance creation
 * - Parallel container operations
 * - Concurrent database operations
 * - Race condition prevention
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { AppDataSource } from '../../../src/config/database';
import { InstanceService } from '../../../src/services/InstanceService';
import { DockerService } from '../../../src/services/DockerService';
import { InstanceRepository } from '../../../src/repositories/InstanceRepository';
import { ApiKeyService } from '../../../src/services/ApiKeyService';
import { ErrorService } from '../../../src/services/ErrorService';
import { User } from '../../../src/entities/User.entity';
import { Instance } from '../../../src/entities/Instance.entity';
import Docker from 'dockerode';
import { DatabaseHelper } from '../helpers/database.helper';
import { DockerHelper } from '../helpers/docker.helper';
import { TestFixtures } from '../helpers/fixtures';

describe('Concurrent Operations Performance Tests', () => {
  // Services
  let instanceService: InstanceService;
  let dockerService: DockerService;

  // Docker
  let docker: Docker;

  // Test data
  let testUser: User;

  beforeAll(async () => {
    // Configure test environment
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-api-key-concurrent';
    process.env.FEISHU_APP_ID = 'test_feishu_app_id_concurrent';
    process.env.FEISHU_APP_SECRET = 'test_feishu_app_secret_concurrent';
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
    const instanceRepository = new InstanceRepository(AppDataSource.getRepository(Instance));
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

    console.log('✓ Concurrent operations test environment initialized');
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

  describe('Concurrent Instance Creation', () => {
    it('should create 3 instances concurrently without race conditions', async () => {
      console.log('\n=== Concurrent Creation: 3 Instances ===');

      const count = TestFixtures.CONCURRENT_TESTS.small.count;

      // Allocate API key
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      await apiKeyService.allocateApiKey(testUser.id);

      const startTime = Date.now();

      // Create instances concurrently
      const createPromises = Array.from({ length: count }, (_, i) =>
        instanceService.createInstance(testUser, {
          template: i % 2 === 0 ? 'personal' : 'team',
        })
      );

      const instances = await Promise.all(createPromises);
      const duration = Date.now() - startTime;

      // Verify all instances created
      expect(instances).toHaveLength(count);
      console.log(`✓ Created ${count} instances concurrently in ${duration}ms`);

      // Verify all instances have unique IDs
      const instanceIds = instances.map(i => i.instance_id);
      const uniqueIds = new Set(instanceIds);
      expect(uniqueIds.size).toBe(count);
      console.log('✓ All instance IDs are unique');

      // Verify all containers are running
      for (const instance of instances) {
        const status = await dockerService.getContainerStatus(instance.instance_id);
        expect(status.isRunning).toBe(true);
      }
      console.log('✓ All containers are running');

      // Verify all instances in database
      const dbInstances = await AppDataSource.getRepository(Instance).find({
        where: { owner_id: testUser.id },
      });
      expect(dbInstances).toHaveLength(count);
      console.log('✓ All instances in database');

      // Cleanup
      for (const instance of instances) {
        await instanceService.deleteInstance(instance.instance_id);
      }
    });

    it('should create 10 instances concurrently', async () => {
      console.log('\n=== Concurrent Creation: 10 Instances ===');

      const count = TestFixtures.CONCURRENT_TESTS.medium.count;

      // Allocate multiple API keys
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      for (let i = 0; i < Math.ceil(count / 3); i++) {
        await apiKeyService.allocateApiKey(testUser.id);
      }

      const startTime = Date.now();

      // Create instances concurrently
      const templates: Array<'personal' | 'team' | 'enterprise'> = ['personal', 'team', 'enterprise'];
      const createPromises = Array.from({ length: count }, (_, i) =>
        instanceService.createInstance(testUser, {
          template: templates[i % templates.length],
        })
      );

      const instances = await Promise.all(createPromises);
      const duration = Date.now() - startTime;

      // Verify all instances created
      expect(instances).toHaveLength(count);
      console.log(`✓ Created ${count} instances concurrently in ${duration}ms`);
      console.log(`  Average: ${Math.round(duration / count)}ms per instance`);

      // Verify all instances are valid
      for (const instance of instances) {
        expect(instance.instance_id).toBeDefined();
        expect(instance.docker_container_id).toBeDefined();
        expect(instance.status).toBe('active');

        const status = await dockerService.getContainerStatus(instance.instance_id);
        expect(status.isRunning).toBe(true);
      }
      console.log('✓ All instances valid and running');

      // Cleanup
      const deletePromises = instances.map(instance =>
        instanceService.deleteInstance(instance.instance_id)
      );
      await Promise.all(deletePromises);
    });

    it('should handle concurrent instance creation failures gracefully', async () => {
      console.log('\n=== Concurrent Creation: With Failures ===');

      // Allocate API key
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      await apiKeyService.allocateApiKey(testUser.id);

      // Create mix of valid and invalid instances
      const createPromises = [
        instanceService.createInstance(testUser, { template: 'personal' }),
        instanceService.createInstance(testUser, { template: 'invalid' as any }).catch(e => ({ error: e })),
        instanceService.createInstance(testUser, { template: 'team' }),
        instanceService.createInstance(testUser, { template: 'invalid' as any }).catch(e => ({ error: e })),
        instanceService.createInstance(testUser, { template: 'enterprise' }),
      ];

      const results = await Promise.all(createPromises);

      // Verify valid instances created
      const validInstances = results.filter(r => !(r as any).error);
      expect(validInstances).toHaveLength(3);
      console.log('✓ Valid instances created despite concurrent failures');

      // Verify errors handled
      const errors = results.filter(r => (r as any).error);
      expect(errors).toHaveLength(2);
      console.log('✓ Invalid instances rejected gracefully');

      // Cleanup
      for (const instance of validInstances as Instance[]) {
        await instanceService.deleteInstance(instance.instance_id);
      }
    });
  });

  describe('Concurrent Container Operations', () => {
    it('should start multiple containers concurrently', async () => {
      console.log('\n=== Concurrent Start: Multiple Containers ===');

      const count = 5;

      // Allocate API key
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      await apiKeyService.allocateApiKey(testUser.id);

      // Create and stop instances
      const instances: Instance[] = [];
      for (let i = 0; i < count; i++) {
        const instance = await instanceService.createInstance(testUser, {
          template: 'personal',
        });
        await instanceService.stopInstance(instance.instance_id);
        instances.push(instance);
      }
      console.log(`✓ Created and stopped ${count} instances`);

      // Start all instances concurrently
      const startTime = Date.now();
      const startPromises = instances.map(instance =>
        instanceService.startInstance(instance.instance_id)
      );
      await Promise.all(startPromises);
      const duration = Date.now() - startTime;

      console.log(`✓ Started ${count} containers concurrently in ${duration}ms`);

      // Verify all containers running
      for (const instance of instances) {
        const status = await dockerService.getContainerStatus(instance.instance_id);
        expect(status.isRunning).toBe(true);
      }
      console.log('✓ All containers running');

      // Cleanup
      for (const instance of instances) {
        await instanceService.deleteInstance(instance.instance_id);
      }
    });

    it('should stop multiple containers concurrently', async () => {
      console.log('\n=== Concurrent Stop: Multiple Containers ===');

      const count = 5;

      // Allocate API key
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      await apiKeyService.allocateApiKey(testUser.id);

      // Create instances
      const instances: Instance[] = [];
      for (let i = 0; i < count; i++) {
        const instance = await instanceService.createInstance(testUser, {
          template: 'personal',
        });
        instances.push(instance);
      }
      console.log(`✓ Created ${count} instances`);

      // Stop all instances concurrently
      const startTime = Date.now();
      const stopPromises = instances.map(instance =>
        instanceService.stopInstance(instance.instance_id)
      );
      await Promise.all(stopPromises);
      const duration = Date.now() - startTime;

      console.log(`✓ Stopped ${count} containers concurrently in ${duration}ms`);

      // Verify all containers stopped
      for (const instance of instances) {
        const status = await dockerService.getContainerStatus(instance.instance_id);
        expect(status.isRunning).toBe(false);
      }
      console.log('✓ All containers stopped');

      // Cleanup
      for (const instance of instances) {
        await instanceService.deleteInstance(instance.instance_id);
      }
    });

    it('should get stats from multiple containers concurrently', async () => {
      console.log('\n=== Concurrent Stats: Multiple Containers ===');

      const count = 5;

      // Allocate API key
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      await apiKeyService.allocateApiKey(testUser.id);

      // Create instances
      const instances: Instance[] = [];
      for (let i = 0; i < count; i++) {
        const instance = await instanceService.createInstance(testUser, {
          template: 'personal',
        });
        instances.push(instance);
      }

      // Wait for containers to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get stats from all containers concurrently
      const startTime = Date.now();
      const statsPromises = instances.map(instance =>
        dockerService.getContainerStats(instance.instance_id)
      );
      const stats = await Promise.all(statsPromises);
      const duration = Date.now() - startTime;

      console.log(`✓ Retrieved stats from ${count} containers in ${duration}ms`);

      // Verify all stats are valid
      expect(stats).toHaveLength(count);
      stats.forEach(stat => {
        expect(stat.cpuPercent).toBeGreaterThanOrEqual(0);
        expect(stat.memoryUsage).toBeGreaterThan(0);
      });
      console.log('✓ All stats valid');

      // Cleanup
      for (const instance of instances) {
        await instanceService.deleteInstance(instance.instance_id);
      }
    });
  });

  describe('Concurrent Database Operations', () => {
    it('should handle concurrent database reads', async () => {
      console.log('\n=== Concurrent Database Reads ===');

      const count = 10;

      // Create instances
      const instances: Instance[] = [];
      for (let i = 0; i < count; i++) {
        const instance = await DatabaseHelper.createTestInstance(testUser, {
          instance_id: TestFixtures.generateUniqueId('test-inst'),
        });
        instances.push(instance);
      }
      console.log(`✓ Created ${count} instances in database`);

      // Read all instances concurrently
      const startTime = Date.now();
      const readPromises = instances.map(instance =>
        DatabaseHelper.findInstanceById(instance.instance_id)
      );
      const results = await Promise.all(readPromises);
      const duration = Date.now() - startTime;

      console.log(`✓ Read ${count} instances concurrently in ${duration}ms`);

      // Verify all reads successful
      expect(results.filter(r => r !== null)).toHaveLength(count);
      console.log('✓ All reads successful');
    });

    it('should handle concurrent database writes', async () => {
      console.log('\n=== Concurrent Database Writes ===');

      const count = 10;

      // Create instances concurrently
      const startTime = Date.now();
      const createPromises = Array.from({ length: count }, () =>
        DatabaseHelper.createTestInstance(testUser, {
          instance_id: TestFixtures.generateUniqueId('test-inst'),
        })
      );
      const instances = await Promise.all(createPromises);
      const duration = Date.now() - startTime;

      console.log(`✓ Wrote ${count} instances concurrently in ${duration}ms`);

      // Verify all instances created
      expect(instances).toHaveLength(count);

      // Verify unique IDs
      const ids = new Set(instances.map(i => i.instance_id));
      expect(ids.size).toBe(count);
      console.log('✓ All instance IDs unique');
    });
  });

  describe('Race Condition Prevention', () => {
    it('should prevent duplicate instance IDs', async () => {
      console.log('\n=== Race Condition: Duplicate IDs ===');

      // Allocate API key
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      await apiKeyService.allocateApiKey(testUser.id);

      // Create instances with same timestamp (potential race condition)
      const fixedTimestamp = Date.now();
      const createPromises = Array.from({ length: 5 }, () =>
        instanceService.createInstance(testUser, { template: 'personal' })
      );

      const instances = await Promise.all(createPromises);

      // Verify all IDs are unique (no race condition)
      const ids = new Set(instances.map(i => i.instance_id));
      expect(ids.size).toBe(5);
      console.log('✓ No duplicate instance IDs (race condition prevented)');

      // Cleanup
      for (const instance of instances) {
        await instanceService.deleteInstance(instance.instance_id);
      }
    });

    it('should prevent API key double allocation', async () => {
      console.log('\n=== Race Condition: API Key Allocation ===');

      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );

      // Allocate multiple API keys concurrently
      const allocatePromises = Array.from({ length: 5 }, () =>
        apiKeyService.allocateApiKey(testUser.id)
      );

      const apiKeys = await Promise.all(allocatePromises);

      // Verify all API keys are unique
      const keys = new Set(apiKeys.map(k => k.key));
      expect(keys.size).toBe(5);
      console.log('✓ No duplicate API keys (race condition prevented)');
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet performance benchmarks for concurrent operations', async () => {
      console.log('\n=== Performance Benchmarks ===');

      const count = 5;

      // Allocate API key
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      await apiKeyService.allocateApiKey(testUser.id);

      // Measure concurrent creation time
      const startTime = Date.now();
      const createPromises = Array.from({ length: count }, (_, i) =>
        instanceService.createInstance(testUser, {
          template: i % 2 === 0 ? 'personal' : 'team',
        })
      );
      const instances = await Promise.all(createPromises);
      const creationDuration = Date.now() - startTime;

      console.log(`✓ Created ${count} instances in ${creationDuration}ms`);
      console.log(`  Average: ${Math.round(creationDuration / count)}ms per instance`);

      // Verify performance is reasonable
      const avgTime = creationDuration / count;
      expect(avgTime).toBeLessThan(TestFixtures.PERFORMANCE_BENCHMARKS.instanceCreation.warning * 2);
      console.log('✓ Performance within acceptable range');

      // Cleanup
      for (const instance of instances) {
        await instanceService.deleteInstance(instance.instance_id);
      }
    });

    it('should scale linearly with concurrent operations', async () => {
      console.log('\n=== Scalability Test ===');

      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );

      // Test with 3 instances
      await apiKeyService.allocateApiKey(testUser.id);
      const start3 = Date.now();
      const instances3 = await Promise.all([
        instanceService.createInstance(testUser, { template: 'personal' }),
        instanceService.createInstance(testUser, { template: 'team' }),
        instanceService.createInstance(testUser, { template: 'enterprise' }),
      ]);
      const duration3 = Date.now() - start3;
      const avg3 = duration3 / 3;

      console.log(`✓ 3 instances: ${duration3}ms (avg: ${avg3}ms)`);

      // Cleanup
      for (const instance of instances3) {
        await instanceService.deleteInstance(instance.instance_id);
      }

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Test with 5 instances
      for (let i = 0; i < 2; i++) {
        await apiKeyService.allocateApiKey(testUser.id);
      }
      const start5 = Date.now();
      const instances5 = await Promise.all([
        instanceService.createInstance(testUser, { template: 'personal' }),
        instanceService.createInstance(testUser, { template: 'team' }),
        instanceService.createInstance(testUser, { template: 'enterprise' }),
        instanceService.createInstance(testUser, { template: 'personal' }),
        instanceService.createInstance(testUser, { template: 'team' }),
      ]);
      const duration5 = Date.now() - start5;
      const avg5 = duration5 / 5;

      console.log(`✓ 5 instances: ${duration5}ms (avg: ${avg5}ms)`);

      // Verify scaling is roughly linear (not exponential)
      const ratio = duration5 / duration3;
      expect(ratio).toBeLessThan(3); // Should be less than 3x time for 2x instances
      console.log(`✓ Scaling ratio: ${ratio.toFixed(2)}x (acceptable)`);

      // Cleanup
      for (const instance of instances5) {
        await instanceService.deleteInstance(instance.instance_id);
      }
    });
  });
});
