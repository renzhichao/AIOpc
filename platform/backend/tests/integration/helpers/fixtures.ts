/**
 * Test Fixtures
 *
 * Provides reusable test data and fixtures for integration tests.
 */

import { User, Instance, ApiKey } from '../../../src/entities';

export interface TestUserData {
  feishu_user_id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface TestInstanceData {
  instance_id: string;
  owner_id: string;
  status: 'pending' | 'active' | 'stopped' | 'error';
  template: 'personal' | 'team' | 'enterprise';
  config: any;
  docker_container_id?: string | null;
  restart_attempts: number;
  health_status: any;
}

export interface TestApiKeyData {
  key: string;
  user_id: string;
  instance_id?: string | null;
  status: 'active' | 'revoked' | 'expired';
  expires_at?: Date;
  last_used_at?: Date | null;
}

export class TestFixtures {
  /**
   * Generate a unique test user data
   */
  static generateTestUser(overrides?: Partial<TestUserData>): TestUserData {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);

    return {
      feishu_user_id: `test-user-${timestamp}-${random}`,
      name: 'Test User',
      email: `test-${timestamp}@example.com`,
      avatar: 'https://example.com/avatar.png',
      ...overrides,
    };
  }

  /**
   * Generate a unique test instance data
   */
  static generateTestInstance(
    userId: string,
    overrides?: Partial<TestInstanceData>
  ): TestInstanceData {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);

    return {
      instance_id: `test-inst-${timestamp}-${random}`,
      owner_id: userId,
      status: 'active',
      template: 'personal',
      config: {
        apiKey: 'test-api-key',
        feishuAppId: 'test-feishu-app-id',
        feishuAppSecret: 'test-feishu-app-secret',
        skills: ['general_chat', 'web_search'],
        tools: [{ name: 'read', layer: 1 }, { name: 'write', layer: 1 }],
        systemPrompt: 'You are a helpful assistant',
        temperature: 0.7,
        maxTokens: 4000,
      },
      docker_container_id: null,
      restart_attempts: 0,
      health_status: {},
      ...overrides,
    };
  }

  /**
   * Generate a unique test API key data
   */
  static generateTestApiKey(
    userId: string,
    overrides?: Partial<TestApiKeyData>
  ): TestApiKeyData {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);

    return {
      key: `sk-test-${timestamp}-${random}`,
      user_id: userId,
      instance_id: null,
      status: 'active',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      last_used_at: null,
      ...overrides,
    };
  }

  /**
   * Generate multiple test users
   */
  static generateTestUsers(count: number): TestUserData[] {
    const users: TestUserData[] = [];

    for (let i = 0; i < count; i++) {
      users.push(
        this.generateTestUser({
          name: `Test User ${i + 1}`,
          email: `test-user-${i + 1}-${Date.now()}@example.com`,
        })
      );
    }

    return users;
  }

  /**
   * Generate multiple test instances for a user
   */
  static generateTestInstances(
    userId: string,
    count: number,
    template: 'personal' | 'team' | 'enterprise' = 'personal'
  ): TestInstanceData[] {
    const instances: TestInstanceData[] = [];

    for (let i = 0; i < count; i++) {
      instances.push(
        this.generateTestInstance(userId, {
          template,
        })
      );
    }

    return instances;
  }

  /**
   * Valid preset configurations
   */
  static readonly PRESETS = {
    personal: {
      name: 'Personal Assistant',
      description: 'AI assistant for personal productivity',
      config: {
        llm: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          temperature: 0.7,
          maxTokens: 4000,
        },
        skills: ['general_chat', 'web_search', 'knowledge_base'],
        tools: [
          { name: 'read', layer: 1 },
          { name: 'write', layer: 1 },
          { name: 'web_search', layer: 1 },
        ],
        systemPrompt: 'You are a helpful personal assistant.',
      },
      resources: {
        memory: '1g',
        cpu: '0.5',
      },
    },
    team: {
      name: 'Team Collaboration',
      description: 'AI assistant for team collaboration',
      config: {
        llm: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          temperature: 0.7,
          maxTokens: 4000,
        },
        skills: ['general_chat', 'web_search', 'knowledge_base', 'data_analysis'],
        tools: [
          { name: 'read', layer: 1 },
          { name: 'write', layer: 1 },
          { name: 'web_search', layer: 1 },
          { name: 'web_fetch', layer: 2 },
        ],
        systemPrompt: 'You are a helpful team collaboration assistant.',
      },
      resources: {
        memory: '2g',
        cpu: '1.0',
      },
    },
    enterprise: {
      name: 'Enterprise Suite',
      description: 'Full-featured AI assistant for enterprise',
      config: {
        llm: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          temperature: 0.7,
          maxTokens: 4000,
        },
        skills: [
          'general_chat',
          'web_search',
          'knowledge_base',
          'data_analysis',
          'code_execution',
        ],
        tools: [
          { name: 'read', layer: 1 },
          { name: 'write', layer: 1 },
          { name: 'web_search', layer: 1 },
          { name: 'web_fetch', layer: 2 },
          { name: 'exec', layer: 2 },
        ],
        systemPrompt: 'You are a powerful enterprise AI assistant.',
      },
      resources: {
        memory: '4g',
        cpu: '2.0',
      },
    },
  };

  /**
   * Valid OAuth credentials
   */
  static readonly OAUTH_CREDENTIALS = {
    valid: {
      app_id: 'test_feishu_app_id',
      app_secret: 'test_feishu_app_secret',
      redirect_uri: 'http://localhost:5173/oauth/callback',
    },
    invalid: {
      app_id: 'invalid_app_id',
      app_secret: 'invalid_app_secret',
      redirect_uri: 'http://invalid.url/callback',
    },
  };

  /**
   * Valid API keys
   */
  static readonly API_KEYS = {
    valid: 'sk-test-valid-key-12345',
    expired: 'sk-test-expired-key-67890',
    revoked: 'sk-test-revoked-key-abcde',
    invalid: 'invalid-key-format',
  };

  /**
   * Valid instance IDs
   */
  static readonly INSTANCE_IDS = {
    valid: 'test-instance-valid',
    invalid: 'non-existent-instance',
    noContainer: 'test-instance-no-container',
  };

  /**
   * Valid container configurations
   */
  static readonly CONTAINER_CONFIGS = {
    minimal: {
      image: 'openclaw/agent:latest',
      env: {
        DEEPSEEK_API_KEY: 'test-key',
        INSTANCE_ID: 'test-instance',
      },
      resources: {
        memory: 512 * 1024 * 1024, // 512MB
        cpu: 0.25,
      },
    },
    standard: {
      image: 'openclaw/agent:latest',
      env: {
        DEEPSEEK_API_KEY: 'test-key',
        INSTANCE_ID: 'test-instance',
        ENABLED_SKILLS: 'general_chat,web_search',
      },
      resources: {
        memory: 1024 * 1024 * 1024, // 1GB
        cpu: 0.5,
      },
    },
    large: {
      image: 'openclaw/agent:latest',
      env: {
        DEEPSEEK_API_KEY: 'test-key',
        INSTANCE_ID: 'test-instance',
        ENABLED_SKILLS: 'general_chat,web_search,knowledge_base,data_analysis',
      },
      resources: {
        memory: 2048 * 1024 * 1024, // 2GB
        cpu: 1.0,
      },
    },
  };

  /**
   * Error scenarios
   */
  static readonly ERROR_SCENARIOS = {
    dockerDaemonDown: {
      message: 'Docker daemon is not accessible',
      code: 'DOCKER_UNAVAILABLE',
    },
    imageNotFound: {
      message: 'Image not found',
      code: 'IMAGE_NOT_FOUND',
    },
    containerNotFound: {
      message: 'Container not found',
      code: 'CONTAINER_NOT_FOUND',
    },
    insufficientResources: {
      message: 'Insufficient system resources',
      code: 'INSUFFICIENT_RESOURCES',
    },
    databaseError: {
      message: 'Database operation failed',
      code: 'DATABASE_ERROR',
    },
  };

  /**
   * Performance benchmarks
   */
  static readonly PERFORMANCE_BENCHMARKS = {
    containerCreation: {
      target: 5000, // 5 seconds
      warning: 10000, // 10 seconds
    },
    containerStart: {
      target: 3000, // 3 seconds
      warning: 5000, // 5 seconds
    },
    containerStop: {
      target: 2000, // 2 seconds
      warning: 4000, // 4 seconds
    },
    containerRemove: {
      target: 2000, // 2 seconds
      warning: 4000, // 4 seconds
    },
    oauthFlow: {
      target: 2000, // 2 seconds
      warning: 5000, // 5 seconds
    },
    instanceCreation: {
      target: 8000, // 8 seconds (including container creation)
      warning: 15000, // 15 seconds
    },
  };

  /**
   * Concurrent test configurations
   */
  static readonly CONCURRENT_TESTS = {
    small: {
      count: 3,
      description: 'Small concurrent load',
    },
    medium: {
      count: 10,
      description: 'Medium concurrent load',
    },
    large: {
      count: 20,
      description: 'Large concurrent load',
    },
    stress: {
      count: 50,
      description: 'Stress test load',
    },
  };

  /**
   * Get a random preset
   */
  static getRandomPreset(): keyof typeof TestFixtures.PRESETS {
    const presets = Object.keys(TestFixtures.PRESETS) as Array<
      keyof typeof TestFixtures.PRESETS
    >;
    return presets[Math.floor(Math.random() * presets.length)];
  }

  /**
   * Get a preset by name
   */
  static getPreset(
    name: 'personal' | 'team' | 'enterprise'
  ): typeof TestFixtures.PRESETS[keyof typeof TestFixtures.PRESETS] {
    return TestFixtures.PRESETS[name];
  }

  /**
   * Generate a unique timestamp-based ID
   */
  static generateUniqueId(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Wait for a condition to be true
   */
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout = 5000,
    interval = 100
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Retry a function with exponential backoff
   */
  static async retry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    baseDelay = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxAttempts) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}
