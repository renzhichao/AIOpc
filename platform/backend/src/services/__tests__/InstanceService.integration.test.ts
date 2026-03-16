/**
 * Integration Tests for InstanceService
 *
 * These tests use a real database and mocked Docker service to test instance creation
 * with preset configurations.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { InstanceService } from '../InstanceService';
import { InstanceRepository } from '../../repositories/InstanceRepository';
import { ApiKeyService } from '../ApiKeyService';
import { DockerService } from '../DockerService';
import { ErrorService } from '../ErrorService';
import { AppDataSource } from '../../config/database';
import { Instance } from '../../entities/Instance.entity';
import { User } from '../../entities/User.entity';
import { ApiKey } from '../../entities/ApiKey.entity';
import { InstanceTemplate } from '../../types/config';

// Mock DockerService
jest.mock('../DockerService');
const MockedDockerService = DockerService as jest.MockedClass<typeof DockerService>;

describe('InstanceService Integration Tests', () => {
  let instanceService: InstanceService;
  let instanceRepository: InstanceRepository;
  let apiKeyService: ApiKeyService;
  let dockerService: jest.Mocked<DockerService>;
  let errorService: ErrorService;
  let testUser: User;

  // Set up environment variables
  const originalEnv = process.env;

  beforeAll(async () => {
    // Configure test environment
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-api-key';
    process.env.FEISHU_APP_ID = 'test_app_id';
    process.env.FEISHU_APP_SECRET = 'test_app_secret';
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

    // Create repositories and services
    instanceRepository = new InstanceRepository(AppDataSource.getRepository(Instance));

    // Create mock Docker service
    const mockDockerService = {
      createContainer: jest.fn().mockResolvedValue('test-container-id-123') as any,
      removeContainer: jest.fn().mockResolvedValue(undefined) as any,
      startContainer: jest.fn().mockResolvedValue(undefined) as any,
      stopContainer: jest.fn().mockResolvedValue(undefined) as any,
      getContainerStats: jest.fn().mockResolvedValue({
        cpu: 10.5,
        memory: 256,
        memoryLimit: 1024,
      }) as any,
    };

    dockerService = mockDockerService as unknown as jest.Mocked<DockerService>;

    // Create ApiKeyService with all dependencies
    apiKeyService = new ApiKeyService(
      AppDataSource.getRepository(ApiKey),
      instanceRepository,
      new ErrorService()
    );

    errorService = new ErrorService();

    // Create service
    instanceService = new InstanceService(
      instanceRepository,
      dockerService,
      apiKeyService,
      errorService
    );

    // Create test user
    const userRepository = AppDataSource.getRepository(User);
    testUser = userRepository.create({
      feishu_user_id: `test-user-${Date.now()}`,
      name: 'Test User',
      email: `test-${Date.now()}@example.com`,
    });
    await userRepository.save(testUser);
  });

  afterAll(async () => {
    // Clean up test data
    const instanceRepo = AppDataSource.getRepository(Instance);
    await instanceRepo.delete({});

    const apiKeyRepo = AppDataSource.getRepository(ApiKey);
    await apiKeyRepo.delete({});

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
    jest.clearAllMocks();

    // Clean up instances and API keys before each test
    const instanceRepo = AppDataSource.getRepository(Instance);
    await instanceRepo.delete({});

    const apiKeyRepo = AppDataSource.getRepository(ApiKey);
    await apiKeyRepo.delete({});
  });

  afterEach(async () => {
    // Clean up instances and API keys after each test
    const instanceRepo = AppDataSource.getRepository(Instance);
    await instanceRepo.delete({});

    const apiKeyRepo = AppDataSource.getRepository(ApiKey);
    await apiKeyRepo.delete({});
  });

  describe('Personal Instance Creation with Preset Configuration', () => {
    it('should create personal instance with correct preset config', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      expect(instance).toBeDefined();
      expect(instance.instance_id).toBeDefined();
      expect(instance.owner_id).toBe(testUser.id);
      expect(instance.template).toBe('personal');
      expect(instance.status).toBe('active');

      // Verify preset configuration
      expect(instance.config).toHaveProperty('llm');
      expect(instance.config).toHaveProperty('skills');
      expect(instance.config).toHaveProperty('tools');
      expect(instance.config).toHaveProperty('system_prompt');
      expect(instance.config).toHaveProperty('limits');

      // Verify personal preset limits
      expect(instance.config.limits.max_messages_per_day).toBe(100);
      expect(instance.config.limits.max_storage_mb).toBe(100);

      // Verify LLM configuration
      expect(instance.config.llm.provider).toBe('deepseek');
      expect(instance.config.llm.model).toBe('deepseek-chat');
      expect(instance.config.llm.temperature).toBe(0.7);
      expect(instance.config.llm.max_tokens).toBe(4000);

      // Verify enabled skills for personal
      const enabledSkills = instance.config.skills.filter((s: any) => s.enabled);
      expect(enabledSkills.length).toBe(3); // general_chat, web_search, knowledge_base
      expect(enabledSkills.find((s: any) => s.name === 'general_chat')).toBeDefined();
      expect(enabledSkills.find((s: any) => s.name === 'email_assistant')).toBeUndefined();

      // Verify enabled tools for personal
      const enabledTools = instance.config.tools.filter((t: any) => t.enabled);
      expect(enabledTools.length).toBe(4); // read, write, web_search, memory
      expect(enabledTools.find((t: any) => t.name === 'exec')).toBeUndefined();

      // Verify Docker container was created with correct config
      expect(dockerService.createContainer).toHaveBeenCalled();
      const createContainerCall = dockerService.createContainer.mock.calls[0];
      const instanceConfig = createContainerCall[1];

      expect(instanceConfig).toHaveProperty('apiKey');
      expect(instanceConfig).toHaveProperty('feishuAppId');
      expect(instanceConfig).toHaveProperty('feishuAppSecret');
      expect(instanceConfig).toHaveProperty('skills');
      expect(instanceConfig).toHaveProperty('tools');
      expect(instanceConfig).toHaveProperty('systemPrompt');
      expect(instanceConfig).toHaveProperty('temperature');
      expect(instanceConfig).toHaveProperty('maxTokens');
      expect(instanceConfig).toHaveProperty('template');
    });

    it('should set default expiration to 30 days for personal instance', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      const now = Date.now();
      const expiresAt = new Date(instance.expires_at!).getTime();
      const expectedMin = now + 30 * 24 * 3600 * 1000;

      expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
    });
  });

  describe('Team Instance Creation with Preset Configuration', () => {
    it('should create team instance with correct preset config', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'team',
      });

      expect(instance.template).toBe('team');
      expect(instance.status).toBe('active');

      // Verify team preset limits
      expect(instance.config.limits.max_messages_per_day).toBe(500);
      expect(instance.config.limits.max_storage_mb).toBe(500);
      expect(instance.config.limits.max_users).toBe(10);

      // Verify LLM configuration for team
      expect(instance.config.llm.max_tokens).toBe(8000);

      // Verify enabled skills for team
      const enabledSkills = instance.config.skills.filter((s: any) => s.enabled);
      expect(enabledSkills.length).toBe(4); // general_chat, web_search, knowledge_base, email_assistant
      expect(enabledSkills.find((s: any) => s.name === 'email_assistant')).toBeDefined();

      // Verify enabled tools for team
      const enabledTools = instance.config.tools.filter((t: any) => t.enabled);
      expect(enabledTools.length).toBe(6); // All tools enabled for team
      expect(enabledTools.find((t: any) => t.name === 'exec')).toBeDefined();
      expect(enabledTools.find((t: any) => t.name === 'web_fetch')).toBeDefined();
    });

    it('should use team-specific system prompt', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'team',
      });

      expect(instance.config.system_prompt).toContain('团队协作AI助手');
      expect(instance.config.system_prompt).toContain('团队协作');
      expect(instance.config.system_prompt).toContain('任务管理');
    });
  });

  describe('Enterprise Instance Creation with Preset Configuration', () => {
    it('should create enterprise instance with correct preset config', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'enterprise',
      });

      expect(instance.template).toBe('enterprise');
      expect(instance.status).toBe('active');

      // Verify enterprise preset limits
      expect(instance.config.limits.max_messages_per_day).toBe(-1); // Unlimited
      expect(instance.config.limits.max_storage_mb).toBe(5120); // 5GB
      expect(instance.config.limits.max_users).toBe(50);

      // Verify LLM configuration for enterprise
      expect(instance.config.llm.max_tokens).toBe(16000);

      // Verify all skills enabled for enterprise
      const enabledSkills = instance.config.skills.filter((s: any) => s.enabled);
      expect(enabledSkills.length).toBe(6); // All skills enabled
      expect(enabledSkills.find((s: any) => s.name === 'code_helper')).toBeDefined();
      expect(enabledSkills.find((s: any) => s.name === 'data_analyst')).toBeDefined();

      // Verify all tools enabled for enterprise
      const enabledTools = instance.config.tools.filter((t: any) => t.enabled);
      expect(enabledTools.length).toBe(6); // All tools enabled
    });

    it('should use enterprise-specific system prompt', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'enterprise',
      });

      expect(instance.config.system_prompt).toContain('企业级AI助手');
      expect(instance.config.system_prompt).toContain('企业协作');
      expect(instance.config.system_prompt).toContain('系统集成');
      expect(instance.config.system_prompt).toContain('数据分析');
    });
  });

  describe('Instance Configuration Injection', () => {
    it('should inject API key into Docker container config', async () => {
      // Create an API key first
      const apiKeyRepo = AppDataSource.getRepository(ApiKey);
      const testApiKey = apiKeyRepo.create({
        provider: 'deepseek',
        encrypted_key: 'encrypted-test-api-key-123',
        status: 'active',
        quota: 1000,
        usage_count: 0,
      });
      await apiKeyRepo.save(testApiKey);

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Verify Docker container was created with API key
      expect(dockerService.createContainer).toHaveBeenCalledWith(
        instance.instance_id,
        expect.objectContaining({
          apiKey: expect.any(String),
        })
      );
    });

    it('should inject Feishu app credentials into Docker container config', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Verify Docker container was created with Feishu credentials
      const createContainerCall = dockerService.createContainer.mock.calls[0];
      const instanceConfig = createContainerCall[1];

      expect(instanceConfig.feishuAppId).toBe('test_app_id');
      expect(instanceConfig.feishuAppSecret).toBe('test_app_secret');
    });

    it('should inject skills list into Docker container config', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      const createContainerCall = dockerService.createContainer.mock.calls[0];
      const instanceConfig = createContainerCall[1];

      expect(instanceConfig.skills).toEqual(expect.arrayContaining(['general_chat', 'web_search', 'knowledge_base']));
    });

    it('should inject tools configuration into Docker container config', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      const createContainerCall = dockerService.createContainer.mock.calls[0];
      const instanceConfig = createContainerCall[1];

      expect(instanceConfig.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'read', layer: 1 }),
          expect.objectContaining({ name: 'write', layer: 1 }),
          expect.objectContaining({ name: 'web_search', layer: 1 }),
          expect.objectContaining({ name: 'memory', layer: 1 }),
        ])
      );
    });

    it('should inject LLM configuration into Docker container config', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      const createContainerCall = dockerService.createContainer.mock.calls[0];
      const instanceConfig = createContainerCall[1];

      expect(instanceConfig.temperature).toBe(0.7);
      expect(instanceConfig.maxTokens).toBe(4000);
      expect(instanceConfig.apiBase).toBe('https://api.deepseek.com');
      expect(instanceConfig.model).toBe('deepseek-chat');
    });
  });

  describe('Instance Lifecycle with Real Database', () => {
    it('should save instance record to database', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      // Verify instance was saved to database
      const instanceRepo = AppDataSource.getRepository(Instance);
      const savedInstance = await instanceRepo.findOne({
        where: { instance_id: instance.instance_id },
      });

      expect(savedInstance).toBeDefined();
      expect(savedInstance!.instance_id).toBe(instance.instance_id);
      expect(savedInstance!.owner_id).toBe(testUser.id);
      expect(savedInstance!.template).toBe('personal');
      expect(savedInstance!.status).toBe('active');
    });

    it('should generate unique instance IDs', async () => {
      const instance1 = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      const instance2 = await instanceService.createInstance(testUser, {
        template: 'team',
      });

      expect(instance1.instance_id).not.toBe(instance2.instance_id);
    });

    it('should update instance status to active after container creation', async () => {
      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
      });

      expect(instance.status).toBe('active');
      expect(instance.docker_container_id).toBeDefined();
    });
  });

  describe('Custom Expiration Date', () => {
    it('should create instance with custom expiration date', async () => {
      const customExpiration = new Date();
      customExpiration.setDate(customExpiration.getDate() + 60); // 60 days from now

      const instance = await instanceService.createInstance(testUser, {
        template: 'personal',
        expiresAt: customExpiration,
      });

      const expiresAt = new Date(instance.expires_at!).getTime();
      const expectedTime = customExpiration.getTime();

      // Allow 1 second tolerance
      expect(Math.abs(expiresAt - expectedTime)).toBeLessThan(1000);
    });
  });

  describe('Error Handling', () => {
    it('should handle Docker container creation failure', async () => {
      // Mock Docker service to throw error
      dockerService.createContainer.mockRejectedValueOnce(new Error('Docker daemon not running'));

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
    });
  });
});
