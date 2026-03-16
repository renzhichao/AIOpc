/**
 * Complete User Journey E2E Test
 *
 * Comprehensive end-to-end test covering the complete user journey
 * from registration through instance creation, usage, and deletion.
 *
 * This test demonstrates the full system functionality and validates
 * all major components working together.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { AppDataSource } from '../../../src/config/database';
import { InstanceService } from '../../../src/services/InstanceService';
import { ApiKeyService } from '../../../src/services/ApiKeyService';
import { OAuthService } from '../../../src/services/OAuthService';
import { UserRepository } from '../../../src/repositories/UserRepository';
import { ApiKeyRepository } from '../../../src/repositories/ApiKeyRepository';
import { InstanceRepository } from '../../../src/repositories/InstanceRepository';
import { ErrorService } from '../../../src/services/ErrorService';
import { DockerService } from '../../../src/services/DockerService';
import { DatabaseHelper } from '../../integration/helpers/database.helper';
import { E2EOrchestrator } from '../orchestrator';
import { E2EAssertions } from '../assertions';
import { E2EReporter } from '../reporter';
import axios from 'axios';

// Mock axios for Feishu API calls
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Complete User Journey E2E Test', () => {
  let orchestrator: E2EOrchestrator;
  let instanceService: InstanceService;
  let apiKeyService: ApiKeyService;
  let oauthService: OAuthService;
  let dockerService: DockerService;
  let errorService: ErrorService;
  let userRepository: UserRepository;
  let instanceRepository: InstanceRepository;
  let apiKeyRepository: ApiKeyRepository;

  // Test data
  const mockFeishuUserId = `e2e_feishu_user_${Date.now()}`;
  const mockAuthCode = `e2e_auth_code_${Date.now()}`;
  const mockAccessToken = `e2e_access_token_${Date.now()}`;
  const mockRefreshToken = `e2e_refresh_token_${Date.now()}`;

  beforeAll(async () => {
    // Initialize orchestrator
    orchestrator = E2EOrchestrator.getInstance();
    await orchestrator.setup();

    // Initialize assertions
    await E2EAssertions.initialize();

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
  });

  afterAll(async () => {
    // Generate final report
    const report = await orchestrator.teardown();

    // Generate reports in all formats
    E2EReporter.generateReport(report, {
      format: 'all',
      includeStackTrace: true,
      includePerformanceMetrics: true,
      includeCoverage: true,
    });

    // Generate JUnit report for CI/CD
    E2EReporter.generateJUnitReport(report, 'test-reports/e2e');
  });

  it('should complete full user journey: OAuth → Create Instance → Use → Stop → Delete', async () => {
    await orchestrator.executeScenario(
      'Complete User Journey',
      async () => {
        // Step 1: OAuth Authorization URL Generation
        console.log('\n--- Step 1: OAuth Authorization URL Generation ---');
        const authUrl = oauthService.getAuthorizationUrl();
        expect(authUrl).toContain('https://open.feishu.cn');
        expect(authUrl).toContain('app_id=');
        expect(authUrl).not.toContain('undefined');
        console.log('✓ Authorization URL generated successfully');

        // Step 2: OAuth Callback and User Creation
        console.log('\n--- Step 2: OAuth Callback and User Creation ---');

        // Mock Feishu API responses
        mockedAxios.post.mockResolvedValueOnce({
          data: {
            code: 0,
            access_token: mockAccessToken,
            refresh_token: mockRefreshToken,
            expires_in: 3600,
          },
        });

        mockedAxios.get.mockResolvedValueOnce({
          data: {
            code: 0,
            data: {
              user_id: mockFeishuUserId,
              name: 'E2E Test User',
              avatar_url: 'https://example.com/avatar.png',
              email: 'e2e-test@example.com',
            },
          },
        });

        // Handle OAuth callback
        const tokens = await oauthService.handleCallback(mockAuthCode);
        expect(tokens.access_token).toBeDefined();
        expect(tokens.refresh_token).toBeDefined();
        console.log('✓ OAuth callback handled successfully');

        // Verify user created in database
        const user = await userRepository.findByFeishuUserId(mockFeishuUserId);
        expect(user).toBeDefined();
        expect(user!.name).toBe('E2E Test User');
        console.log('✓ User created in database');

        // Step 3: API Key Allocation
        console.log('\n--- Step 3: API Key Allocation ---');
        const apiKey = await apiKeyService.allocateApiKey(user!.id);
        expect(apiKey).toBeDefined();
        expect(apiKey.key).toMatch(/^sk-/);
        expect(apiKey.status).toBe('active');
        console.log(`✓ API key allocated: ${apiKey.key}`);

        // Assert API key allocated
        await E2EAssertions.assertApiKeyAllocated(user!.id);

        // Step 4: Instance Creation (Personal Template)
        console.log('\n--- Step 4: Instance Creation (Personal) ---');
        const instance = await instanceService.createInstance(user!, {
          template: 'personal',
        });

        expect(instance).toBeDefined();
        expect(instance.instance_id).toBeDefined();
        expect(instance.status).toBe('active');
        expect(instance.template).toBe('personal');
        expect(instance.docker_container_id).toBeDefined();
        console.log(`✓ Instance created: ${instance.instance_id}`);

        // Assert instance exists
        await E2EAssertions.assertInstanceExists(instance.instance_id);
        await E2EAssertions.assertInstanceStatus(instance.instance_id, 'active');
        await E2EAssertions.assertInstanceTemplate(instance.instance_id, 'personal');

        // Assert container running
        await E2EAssertions.assertContainerRunning(instance.instance_id);

        // Assert container configuration
        await E2EAssertions.assertContainerConfig(instance.docker_container_id!, {
          image: 'openclaw',
          envVars: {
            INSTANCE_ID: instance.instance_id,
            DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY!,
          },
          restartPolicy: 'unless-stopped',
        });

        // Step 5: Instance Usage (Collect Metrics)
        console.log('\n--- Step 5: Instance Usage (Collect Metrics) ---');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for container to stabilize

        const stats = await dockerService.getContainerStats(instance.instance_id);
        expect(stats.id).toBeDefined();
        expect(stats.memoryUsage).toBeGreaterThan(0);
        console.log(`✓ Container stats collected: CPU=${stats.cpuPercent.toFixed(2)}%, Memory=${Math.round(stats.memoryUsage / 1024 / 1024)}MB`);

        const health = await dockerService.healthCheck(instance.instance_id);
        expect(health.status).toBeDefined();
        console.log(`✓ Container health: ${health.status}`);

        // Assert metrics collected
        await E2EAssertions.assertMetricsCollected(instance.instance_id);

        // Assert resource usage within limits
        await E2EAssertions.assertResourceUsage(instance.instance_id, {
          maxCpuPercent: 100,
          maxMemoryPercent: 90,
        });

        // Step 6: Instance Stop
        console.log('\n--- Step 6: Instance Stop ---');
        const stoppedInstance = await instanceService.stopInstance(instance.instance_id);
        expect(stoppedInstance.status).toBe('stopped');
        console.log('✓ Instance stopped');

        // Assert container stopped
        await E2EAssertions.assertContainerStopped(instance.instance_id);
        await E2EAssertions.assertInstanceStatus(instance.instance_id, 'stopped');

        // Step 7: Instance Restart (Optional Flexibility Test)
        console.log('\n--- Step 7: Instance Restart ---');
        const startedInstance = await instanceService.startInstance(instance.instance_id);
        expect(startedInstance.status).toBe('active');
        console.log('✓ Instance restarted');

        // Assert container running again
        await E2EAssertions.assertContainerRunning(instance.instance_id);
        await E2EAssertions.assertInstanceStatus(instance.instance_id, 'active');

        // Step 8: Instance Deletion
        console.log('\n--- Step 8: Instance Deletion ---');
        await instanceService.deleteInstance(instance.instance_id);
        console.log('✓ Instance deleted');

        // Assert container removed
        await E2EAssertions.assertContainerNotExists(instance.docker_container_id!);
        await E2EAssertions.assertInstanceNotExists(instance.instance_id);

        // Assert API key released
        await E2EAssertions.assertApiKeyReleased(user!.id);

        console.log('\n=== Complete User Journey: SUCCESS ===');
      },
      {
        category: 'user-journey',
        template: 'personal',
        feishuUserId: mockFeishuUserId,
      }
    );
  });

  it('should complete user journey with team template', async () => {
    await orchestrator.executeScenario(
      'Team Template User Journey',
      async () => {
        // Create user
        const user = await DatabaseHelper.createTestUser({
          feishu_user_id: `team_user_${Date.now()}`,
        });

        // Allocate API key
        await apiKeyService.allocateApiKey(user.id);

        // Create team instance
        const instance = await instanceService.createInstance(user, {
          template: 'team',
        });

        expect(instance.template).toBe('team');
        expect(instance.status).toBe('active');

        // Verify team-specific skills
        await E2EAssertions.assertContainerConfig(instance.docker_container_id!, {
          envVars: {
            ENABLED_SKILLS: expect.stringContaining('data_analysis'),
          },
        });

        // Cleanup
        await instanceService.deleteInstance(instance.instance_id);
      },
      {
        category: 'user-journey',
        template: 'team',
      }
    );
  });

  it('should complete user journey with enterprise template', async () => {
    await orchestrator.executeScenario(
      'Enterprise Template User Journey',
      async () => {
        // Create user
        const user = await DatabaseHelper.createTestUser({
          feishu_user_id: `enterprise_user_${Date.now()}`,
        });

        // Allocate API key
        await apiKeyService.allocateApiKey(user.id);

        // Create enterprise instance
        const instance = await instanceService.createInstance(user, {
          template: 'enterprise',
        });

        expect(instance.template).toBe('enterprise');
        expect(instance.status).toBe('active');

        // Verify enterprise-specific configuration
        await E2EAssertions.assertContainerConfig(instance.docker_container_id!, {
          envVars: {
            ENABLED_SKILLS: expect.stringContaining('code_execution'),
          },
        });

        // Verify higher resource limits
        const container = orchestrator.getDocker().getContainer(instance.docker_container_id!);
        const info = await container.inspect();
        expect(info.HostConfig.Memory).toBeGreaterThan(1024 * 1024 * 1024); // > 1GB

        // Cleanup
        await instanceService.deleteInstance(instance.instance_id);
      },
      {
        category: 'user-journey',
        template: 'enterprise',
      }
    );
  });

  it('should handle multiple instances for same user', async () => {
    await orchestrator.executeScenario(
      'Multi-Instance User Journey',
      async () => {
        // Create user
        const user = await DatabaseHelper.createTestUser({
          feishu_user_id: `multi_instance_user_${Date.now()}`,
        });

        // Allocate API key
        await apiKeyService.allocateApiKey(user.id);

        // Create multiple instances
        const instances = [];
        const templates: Array<'personal' | 'team' | 'enterprise'> = ['personal', 'team', 'enterprise'];

        for (const template of templates) {
          const instance = await instanceService.createInstance(user, { template });
          instances.push(instance);
          console.log(`✓ Created ${template} instance: ${instance.instance_id}`);
        }

        // Verify all instances running
        for (const instance of instances) {
          await E2EAssertions.assertContainerRunning(instance.instance_id);
          await E2EAssertions.assertInstanceStatus(instance.instance_id, 'active');
        }

        // Verify instance count
        await E2EAssertions.assertUserInstanceCount(user.id, 3);

        // Stop all instances
        for (const instance of instances) {
          await instanceService.stopInstance(instance.instance_id);
        }

        // Verify all stopped
        for (const instance of instances) {
          await E2EAssertions.assertContainerStopped(instance.instance_id);
        }

        // Delete all instances
        for (const instance of instances) {
          await instanceService.deleteInstance(instance.instance_id);
        }

        // Verify all removed
        for (const instance of instances) {
          await E2EAssertions.assertContainerNotExists(instance.docker_container_id!);
          await E2EAssertions.assertInstanceNotExists(instance.instance_id);
        }

        console.log('✓ Multi-instance journey completed');
      },
      {
        category: 'multi-instance',
        instanceCount: 3,
      }
    );
  });

  it('should handle error scenarios gracefully', async () => {
    await orchestrator.executeScenario(
      'Error Recovery User Journey',
      async () => {
        // Create user
        const user = await DatabaseHelper.createTestUser({
          feishu_user_id: `error_recovery_user_${Date.now()}`,
        });

        // Allocate API key
        await apiKeyService.allocateApiKey(user.id);

        // Try to create instance with invalid template (should fail)
        await expect(
          instanceService.createInstance(user, {
            template: 'invalid' as any,
          })
        ).rejects.toThrow();

        // Verify no partial instance created
        await E2EAssertions.assertUserInstanceCount(user.id, 0);

        // Create valid instance
        const instance = await instanceService.createInstance(user, {
          template: 'personal',
        });

        // Manually remove container (simulate orphan)
        await dockerService.removeContainer(instance.instance_id, false, true);

        // Delete should handle missing container gracefully
        await instanceService.deleteInstance(instance.instance_id);

        // Verify database record removed
        await E2EAssertions.assertInstanceNotExists(instance.instance_id);

        console.log('✓ Error recovery journey completed');
      },
      {
        category: 'error-recovery',
      }
    );
  });
});
