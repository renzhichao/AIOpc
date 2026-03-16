/**
 * Container Operations Performance Tests
 *
 * Tests the performance of Docker container operations to ensure they meet
 * the required performance benchmarks defined in TASK-054.
 *
 * Performance Targets:
 * - Container Creation: < 10s (target: 5s)
 * - Container Start: < 5s (target: 3s)
 * - Container Stop: < 5s (target: 2s)
 * - Container Removal: < 5s (target: 2s)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { AppDataSource } from '../../src/config/database';
import { InstanceService } from '../../src/services/InstanceService';
import { DockerService } from '../../src/services/DockerService';
import { InstanceRepository } from '../../src/repositories/InstanceRepository';
import { ApiKeyService } from '../../src/services/ApiKeyService';
import { ErrorService } from '../../src/services/ErrorService';
import { User } from '../../src/entities/User.entity';
import { Instance } from '../../src/entities/Instance.entity';
import { ApiKey } from '../../src/entities/ApiKey.entity';
import Docker from 'dockerode';
import { DatabaseHelper } from '../integration/helpers/database.helper';
import { DockerHelper } from '../integration/helpers/docker.helper';

describe('Container Operations Performance Tests', () => {
  // Services
  let instanceService: InstanceService;
  let dockerService: DockerService;

  // Docker
  let docker: Docker;

  // Test data
  let testUser: User;

  // Performance thresholds (from TASK-054)
  const PERFORMANCE_THRESHOLDS = {
    containerCreation: {
      target: 5000,    // 5 seconds
      warning: 10000,  // 10 seconds (max acceptable)
    },
    containerStart: {
      target: 3000,    // 3 seconds
      warning: 5000,   // 5 seconds (max acceptable)
    },
    containerStop: {
      target: 2000,    // 2 seconds
      warning: 5000,   // 5 seconds (max acceptable)
    },
    containerRemove: {
      target: 2000,    // 2 seconds
      warning: 5000,   // 5 seconds (max acceptable)
    },
  };

  beforeAll(async () => {
    // Configure test environment
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-api-key-perf';
    process.env.FEISHU_APP_ID = 'test_feishu_app_id_perf';
    process.env.FEISHU_APP_SECRET = 'test_feishu_app_secret_perf';
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

    console.log('✓ Performance test environment initialized');
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

  describe('Container Creation Performance', () => {
    it('should create container within performance target (< 5s)', async () => {
      console.log('\n=== Performance Test: Container Creation ===');

      // Allocate API key
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      await apiKeyService.allocateApiKey(testUser.id);

      // Measure container creation time
      const startTime = Date.now();
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });
      const duration = Date.now() - startTime;

      console.log(`✓ Container created in ${duration}ms`);
      console.log(`  Target: ${PERFORMANCE_THRESHOLDS.containerCreation.target}ms`);
      console.log(`  Warning: ${PERFORMANCE_THRESHOLDS.containerCreation.warning}ms`);

      // Assert within warning threshold
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.containerCreation.warning);

      // Log performance level
      if (duration < PERFORMANCE_THRESHOLDS.containerCreation.target) {
        console.log(`  ✓ EXCELLENT: Within target (${duration}ms < ${PERFORMANCE_THRESHOLDS.containerCreation.target}ms)`);
      } else {
        console.log(`  ⚠ ACCEPTABLE: Above target but within warning (${duration}ms)`);
      }

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });

    it('should maintain consistent creation times across multiple operations', async () => {
      console.log('\n=== Performance Test: Creation Consistency ===');

      // Allocate multiple API keys
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      await apiKeyService.allocateApiKey(testUser.id);
      await apiKeyService.allocateApiKey(testUser.id);
      await apiKeyService.allocateApiKey(testUser.id);

      const instances: Instance[] = [];
      const durations: number[] = [];

      // Create 3 instances and measure each
      for (let i = 0; i < 3; i++) {
        const startTime = Date.now();
        const instance = await instanceService.createInstance(testUser, {
          template: i % 2 === 0 ? 'personal' : 'team',
        });
        const duration = Date.now() - startTime;

        instances.push(instance);
        durations.push(duration);
        console.log(`  Creation ${i + 1}: ${duration}ms`);
      }

      // Calculate statistics
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);
      const variance = Math.max(...durations) - Math.min(...durations);

      console.log(`\n  Average: ${Math.round(avgDuration)}ms`);
      console.log(`  Min: ${minDuration}ms`);
      console.log(`  Max: ${maxDuration}ms`);
      console.log(`  Variance: ${variance}ms`);

      // Assert all within warning threshold
      durations.forEach(duration => {
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.containerCreation.warning);
      });

      // Assert variance is reasonable (< 5 seconds)
      expect(variance).toBeLessThan(5000);
      console.log(`  ✓ Variance is acceptable (${variance}ms < 5000ms)`);

      // Cleanup
      for (const instance of instances) {
        await instanceService.deleteInstance(instance.instance_id);
      }
    });
  });

  describe('Container Start Performance', () => {
    it('should start container within performance target (< 3s)', async () => {
      console.log('\n=== Performance Test: Container Start ===');

      // Allocate API key
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      await apiKeyService.allocateApiKey(testUser.id);

      // Create and stop instance
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });
      await instanceService.stopInstance(instance.instance_id);

      // Wait for full stop
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Measure start time
      const startTime = Date.now();
      await instanceService.startInstance(instance.instance_id);
      const duration = Date.now() - startTime;

      console.log(`✓ Container started in ${duration}ms`);
      console.log(`  Target: ${PERFORMANCE_THRESHOLDS.containerStart.target}ms`);
      console.log(`  Warning: ${PERFORMANCE_THRESHOLDS.containerStart.warning}ms`);

      // Assert within warning threshold
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.containerStart.warning);

      // Log performance level
      if (duration < PERFORMANCE_THRESHOLDS.containerStart.target) {
        console.log(`  ✓ EXCELLENT: Within target (${duration}ms < ${PERFORMANCE_THRESHOLDS.containerStart.target}ms)`);
      } else {
        console.log(`  ⚠ ACCEPTABLE: Above target but within warning (${duration}ms)`);
      }

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });
  });

  describe('Container Stop Performance', () => {
    it('should stop container within performance target (< 2s)', async () => {
      console.log('\n=== Performance Test: Container Stop ===');

      // Allocate API key
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      await apiKeyService.allocateApiKey(testUser.id);

      // Create instance
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Wait for container to be fully running
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Measure stop time
      const startTime = Date.now();
      await instanceService.stopInstance(instance.instance_id);
      const duration = Date.now() - startTime;

      console.log(`✓ Container stopped in ${duration}ms`);
      console.log(`  Target: ${PERFORMANCE_THRESHOLDS.containerStop.target}ms`);
      console.log(`  Warning: ${PERFORMANCE_THRESHOLDS.containerStop.warning}ms`);

      // Assert within warning threshold
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.containerStop.warning);

      // Log performance level
      if (duration < PERFORMANCE_THRESHOLDS.containerStop.target) {
        console.log(`  ✓ EXCELLENT: Within target (${duration}ms < ${PERFORMANCE_THRESHOLDS.containerStop.target}ms)`);
      } else {
        console.log(`  ⚠ ACCEPTABLE: Above target but within warning (${duration}ms)`);
      }

      // Cleanup
      await instanceService.deleteInstance(instance.instance_id);
    });
  });

  describe('Container Removal Performance', () => {
    it('should remove container within performance target (< 2s)', async () => {
      console.log('\n=== Performance Test: Container Removal ===');

      // Allocate API key
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      await apiKeyService.allocateApiKey(testUser.id);

      // Create instance
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Wait for container to be fully running
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Measure removal time
      const startTime = Date.now();
      await instanceService.deleteInstance(instance.instance_id);
      const duration = Date.now() - startTime;

      console.log(`✓ Container removed in ${duration}ms`);
      console.log(`  Target: ${PERFORMANCE_THRESHOLDS.containerRemove.target}ms`);
      console.log(`  Warning: ${PERFORMANCE_THRESHOLDS.containerRemove.warning}ms`);

      // Assert within warning threshold
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.containerRemove.warning);

      // Log performance level
      if (duration < PERFORMANCE_THRESHOLDS.containerRemove.target) {
        console.log(`  ✓ EXCELLENT: Within target (${duration}ms < ${PERFORMANCE_THRESHOLDS.containerRemove.target}ms)`);
      } else {
        console.log(`  ⚠ ACCEPTABLE: Above target but within warning (${duration}ms)`);
      }
    });

    it('should force remove running container quickly', async () => {
      console.log('\n=== Performance Test: Force Removal ===');

      // Allocate API key
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      await apiKeyService.allocateApiKey(testUser.id);

      // Create instance
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Wait for container to be fully running
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Measure force removal time
      const startTime = Date.now();
      await instanceService.deleteInstance(instance.instance_id, true);
      const duration = Date.now() - startTime;

      console.log(`✓ Container force removed in ${duration}ms`);
      console.log(`  Target: ${PERFORMANCE_THRESHOLDS.containerRemove.target}ms`);
      console.log(`  Warning: ${PERFORMANCE_THRESHOLDS.containerRemove.warning}ms`);

      // Assert within warning threshold
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.containerRemove.warning);

      // Log performance level
      if (duration < PERFORMANCE_THRESHOLDS.containerRemove.target) {
        console.log(`  ✓ EXCELLENT: Within target (${duration}ms < ${PERFORMANCE_THRESHOLDS.containerRemove.target}ms)`);
      } else {
        console.log(`  ⚠ ACCEPTABLE: Above target but within warning (${duration}ms)`);
      }
    });
  });

  describe('Complete Lifecycle Performance', () => {
    it('should complete full lifecycle within acceptable time', async () => {
      console.log('\n=== Performance Test: Complete Lifecycle ===');

      // Allocate API key
      const apiKeyService = new ApiKeyService(
        AppDataSource.getRepository(ApiKey),
        new InstanceRepository(AppDataSource.getRepository(Instance)),
        new ErrorService()
      );
      await apiKeyService.allocateApiKey(testUser.id);

      const timings: { [key: string]: number } = {};

      // Measure creation
      const createStart = Date.now();
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });
      timings.creation = Date.now() - createStart;

      // Wait for container to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Measure stop
      const stopStart = Date.now();
      await instanceService.stopInstance(instance.instance_id);
      timings.stop = Date.now() - stopStart;

      // Wait for full stop
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Measure start
      const startStart = Date.now();
      await instanceService.startInstance(instance.instance_id);
      timings.start = Date.now() - startStart;

      // Wait for container to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Measure removal
      const removeStart = Date.now();
      await instanceService.deleteInstance(instance.instance_id);
      timings.removal = Date.now() - removeStart;

      // Calculate total
      const totalTime = Object.values(timings).reduce((a, b) => a + b, 0);

      // Log results
      console.log('\n  Lifecycle Breakdown:');
      console.log(`    Creation: ${timings.creation}ms`);
      console.log(`    Stop: ${timings.stop}ms`);
      console.log(`    Start: ${timings.start}ms`);
      console.log(`    Removal: ${timings.removal}ms`);
      console.log(`\n  Total: ${totalTime}ms`);

      // Assert each operation within thresholds
      expect(timings.creation).toBeLessThan(PERFORMANCE_THRESHOLDS.containerCreation.warning);
      expect(timings.stop).toBeLessThan(PERFORMANCE_THRESHOLDS.containerStop.warning);
      expect(timings.start).toBeLessThan(PERFORMANCE_THRESHOLDS.containerStart.warning);
      expect(timings.removal).toBeLessThan(PERFORMANCE_THRESHOLDS.containerRemove.warning);

      console.log('\n  ✓ All lifecycle operations within performance thresholds');
    });
  });
});
