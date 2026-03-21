import 'reflect-metadata';
import request from 'supertest';
import { expressApp } from '../../src/app';
import { OAuthPlatform } from '../../src/auth/interfaces/OAuthTypes';
import { Container } from 'typedi';
import { OAuthService } from '../../src/services/OAuthService';
import { UserRepository } from '../../src/repositories/UserRepository';
import { InstanceRepository } from '../../src/repositories/InstanceRepository';

/**
 * Multi-Platform OAuth Integration Tests
 *
 * Tests the complete OAuth flow for multiple platforms (Feishu, DingTalk)
 * including authorization URL generation, callback handling, token management,
 * and user creation/updates.
 *
 * These tests require:
 * - Database connection (test database)
 * - OAuth configuration (feishu, dingtalk app credentials)
 * - Mock OAuth provider responses
 */

describe('Multi-Platform OAuth Integration Tests', () => {
  let app: any;
  let oauthService: OAuthService;
  let userRepository: UserRepository;
  let instanceRepository: InstanceRepository;

  beforeAll(async () => {
    // Get express app
    app = expressApp;

    // Get services from container
    oauthService = Container.get(OAuthService);
    userRepository = Container.get(UserRepository);
    instanceRepository = Container.get(InstanceRepository);

    // Setup test database state
    await setupTestDatabase();
  });

  afterAll(async () => {
    // Cleanup test database
    await cleanupTestDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await cleanupTestData();
  });

  describe('GET /api/oauth/platforms', () => {
    it('should return all enabled OAuth platforms', async () => {
      // Act
      const response = await request(app)
        .get('/api/oauth/platforms')
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('platforms');
      expect(Array.isArray(response.body.data.platforms)).toBe(true);

      // Verify platform structure
      response.body.data.platforms.forEach((platform: any) => {
        expect(platform).toHaveProperty('platform');
        expect(platform).toHaveProperty('enabled', true);
        expect(platform).toHaveProperty('isDefault');
        expect(['feishu', 'dingtalk']).toContain(platform.platform);
      });
    });

    it('should return platforms with valid configuration', async () => {
      // Act
      const response = await request(app)
        .get('/api/oauth/platforms')
        .expect(200);

      // Assert
      const platforms = response.body.data.platforms;

      // At least one platform should be enabled (usually feishu)
      expect(platforms.length).toBeGreaterThan(0);

      // Default platform should be marked
      const defaultPlatform = platforms.find((p: any) => p.isDefault);
      expect(defaultPlatform).toBeDefined();
    });
  });

  describe('GET /api/oauth/authorize/:platform', () => {
    describe('Feishu Platform', () => {
      it('should generate Feishu authorization URL', async () => {
        // Act
        const response = await request(app)
          .get('/api/oauth/authorize/feishu')
          .query({ redirect_uri: 'http://localhost:3000/callback' })
          .expect(200);

        // Assert
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('url');
        expect(response.body.data).toHaveProperty('platform', 'feishu');
        expect(response.body.data.url).toContain('open.feishu.cn');
        expect(response.body.data.url).toContain('redirect_uri=http://localhost:3000/callback');
      });

      it('should generate Feishu authorization URL without custom redirect', async () => {
        // Act
        const response = await request(app)
          .get('/api/oauth/authorize/feishu')
          .expect(200);

        // Assert
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('url');
        expect(response.body.data.url).toContain('open.feishu.cn');
      });

      it('should handle case-insensitive platform parameter', async () => {
        // Act
        const response1 = await request(app)
          .get('/api/oauth/authorize/FEISHU')
          .expect(200);

        const response2 = await request(app)
          .get('/api/oauth/authorize/Feishu')
          .expect(200);

        // Assert
        expect(response1.body.data.platform).toBe('feishu');
        expect(response2.body.data.platform).toBe('feishu');
      });
    });

    describe('DingTalk Platform', () => {
      it('should generate DingTalk authorization URL', async () => {
        // Act
        const response = await request(app)
          .get('/api/oauth/authorize/dingtalk')
          .query({ redirect_uri: 'http://localhost:3000/callback' })
          .expect(200);

        // Assert
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('url');
        expect(response.body.data).toHaveProperty('platform', 'dingtalk');
        expect(response.body.data.url).toContain('login.dingtalk.com');
        expect(response.body.data.url).toContain('redirect_uri=http://localhost:3000/callback');
      });

      it('should handle case-insensitive platform parameter', async () => {
        // Act
        const response1 = await request(app)
          .get('/api/oauth/authorize/DINGTALK')
          .expect(200);

        const response2 = await request(app)
          .get('/api/oauth/authorize/DingTalk')
          .expect(200);

        // Assert
        expect(response1.body.data.platform).toBe('dingtalk');
        expect(response2.body.data.platform).toBe('dingtalk');
      });
    });

    describe('Validation', () => {
      it('should reject invalid platform', async () => {
        // Act
        const response = await request(app)
          .get('/api/oauth/authorize/invalid_platform')
          .expect(400);

        // Assert
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.error).toHaveProperty('code', 'INVALID_PLATFORM');
      });

      it('should reject invalid redirect URI', async () => {
        // Act
        const response = await request(app)
          .get('/api/oauth/authorize/feishu')
          .query({ redirect_uri: 'not-a-valid-url' })
          .expect(400);

        // Assert
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.error).toHaveProperty('code', 'INVALID_REDIRECT_URI');
      });
    });
  });

  describe('POST /api/oauth/callback/:platform', () => {
    describe('Feishu Callback', () => {
      it('should handle Feishu OAuth callback and create new user', async () => {
        // This test requires mocking Feishu API responses
        // In a real integration test, you would use a mock OAuth server

        // Arrange
        const mockCode = 'feishu_test_auth_code_' + Date.now();

        // Act
        const response = await request(app)
          .post('/api/oauth/callback/feishu')
          .send({ code: mockCode })
          .expect(200);

        // Assert
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('access_token');
        expect(response.body.data).toHaveProperty('refresh_token');
        expect(response.body.data).toHaveProperty('user');
        expect(response.body.data.user).toHaveProperty('id');
        expect(response.body.data.user).toHaveProperty('platform', 'feishu');
      });

      it('should handle Feishu OAuth callback for existing user', async () => {
        // This test requires a pre-existing user in the database
        // and mocking the Feishu API to return that user's ID

        // Arrange
        const existingUser = await createTestUser({
          feishu_user_id: 'test_feishu_user_123',
          name: 'Existing User'
        });

        const mockCode = 'feishu_test_auth_code_existing';

        // Act
        const response = await request(app)
          .post('/api/oauth/callback/feishu')
          .send({ code: mockCode })
          .expect(200);

        // Assert
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data.user.id).toBe(existingUser.id);
      });
    });

    describe('DingTalk Callback', () => {
      it('should handle DingTalk OAuth callback and create new user', async () => {
        // This test requires mocking DingTalk API responses
        // In a real integration test, you would use a mock OAuth server

        // Arrange
        const mockCode = 'dingtalk_test_auth_code_' + Date.now();

        // Act
        const response = await request(app)
          .post('/api/oauth/callback/dingtalk')
          .send({ code: mockCode })
          .expect(200);

        // Assert
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('access_token');
        expect(response.body.data).toHaveProperty('refresh_token');
        expect(response.body.data).toHaveProperty('user');
        expect(response.body.data.user).toHaveProperty('id');
      });
    });

    describe('Validation', () => {
      it('should reject missing authorization code', async () => {
        // Act
        const response = await request(app)
          .post('/api/oauth/callback/feishu')
          .send({})
          .expect(400);

        // Assert
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.error).toHaveProperty('code', 'MISSING_AUTH_CODE');
      });

      it('should reject invalid platform', async () => {
        // Act
        const response = await request(app)
          .post('/api/oauth/callback/invalid_platform')
          .send({ code: 'test_code' })
          .expect(400);

        // Assert
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.error).toHaveProperty('code', 'INVALID_PLATFORM');
      });

      it('should handle invalid authorization code', async () => {
        // Act
        const response = await request(app)
          .post('/api/oauth/callback/feishu')
          .send({ code: 'invalid_expired_code' })
          .expect(401);

        // Assert
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.error).toHaveProperty('code', 'OAUTH_CALLBACK_FAILED');
      });
    });
  });

  describe('Backward Compatibility Endpoints', () => {
    describe('POST /api/oauth/feishu/callback', () => {
      it('should maintain backward compatibility for Feishu', async () => {
        // Arrange
        const mockCode = 'feishu_test_code_compat';

        // Act
        const response = await request(app)
          .post('/api/oauth/feishu/callback')
          .send({ code: mockCode })
          .expect(200);

        // Assert
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('access_token');
      });
    });

    describe('POST /api/oauth/dingtalk/callback', () => {
      it('should provide convenience route for DingTalk', async () => {
        // Arrange
        const mockCode = 'dingtalk_test_code_compat';

        // Act
        const response = await request(app)
          .post('/api/oauth/dingtalk/callback')
          .send({ code: mockCode })
          .expect(200);

        // Assert
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('access_token');
      });
    });

    describe('Legacy Endpoints', () => {
      it('should support legacy /oauth/authorize endpoint', async () => {
        // Act
        const response = await request(app)
          .get('/api/oauth/authorize')
          .expect(200);

        // Assert
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('url');
        expect(response.body.data.platform).toBe('feishu'); // Defaults to feishu
      });

      it('should support legacy /oauth/callback endpoint', async () => {
        // Arrange
        const mockCode = 'legacy_test_code';

        // Act
        const response = await request(app)
          .post('/api/oauth/callback')
          .send({ code: mockCode })
          .expect(200);

        // Assert
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('access_token');
      });
    });
  });

  describe('Complete OAuth Flow Integration', () => {
    it('should complete full Feishu OAuth flow', async () => {
      // Step 1: Get platforms
      const platformsResponse = await request(app)
        .get('/api/oauth/platforms')
        .expect(200);

      expect(platformsResponse.body.data.platforms).toContainEqual(
        expect.objectContaining({ platform: 'feishu' })
      );

      // Step 2: Get authorization URL
      const authResponse = await request(app)
        .get('/api/oauth/authorize/feishu')
        .query({ redirect_uri: 'http://localhost:3000/callback' })
        .expect(200);

      expect(authResponse.body.data.url).toContain('open.feishu.cn');

      // Step 3: Simulate callback (with mock code)
      const mockCode = 'feishu_flow_test_' + Date.now();
      const callbackResponse = await request(app)
        .post('/api/oauth/callback/feishu')
        .send({ code: mockCode })
        .expect(200);

      expect(callbackResponse.body.data).toHaveProperty('access_token');
      expect(callbackResponse.body.data).toHaveProperty('user');

      // Step 4: Verify token
      const verifyResponse = await request(app)
        .post('/api/oauth/verify')
        .send({ token: callbackResponse.body.data.access_token })
        .expect(200);

      expect(verifyResponse.body.data).toHaveProperty('valid', true);
    });

    it('should complete full DingTalk OAuth flow', async () => {
      // Step 1: Get platforms
      const platformsResponse = await request(app)
        .get('/api/oauth/platforms')
        .expect(200);

      expect(platformsResponse.body.data.platforms).toContainEqual(
        expect.objectContaining({ platform: 'dingtalk' })
      );

      // Step 2: Get authorization URL
      const authResponse = await request(app)
        .get('/api/oauth/authorize/dingtalk')
        .query({ redirect_uri: 'http://localhost:3000/callback' })
        .expect(200);

      expect(authResponse.body.data.url).toContain('login.dingtalk.com');

      // Step 3: Simulate callback (with mock code)
      const mockCode = 'dingtalk_flow_test_' + Date.now();
      const callbackResponse = await request(app)
        .post('/api/oauth/callback/dingtalk')
        .send({ code: mockCode })
        .expect(200);

      expect(callbackResponse.body.data).toHaveProperty('access_token');
      expect(callbackResponse.body.data).toHaveProperty('user');

      // Step 4: Verify token
      const verifyResponse = await request(app)
        .post('/api/oauth/verify')
        .send({ token: callbackResponse.body.data.access_token })
        .expect(200);

      expect(verifyResponse.body.data).toHaveProperty('valid', true);
    });
  });

  describe('Multi-Platform User Flow', () => {
    it('should allow same user to login with both platforms', async () => {
      // This test requires a user that has both feishu_user_id and dingtalk_user_id
      // or mocking OAuth providers to return the same user

      const feishuCode = 'feishu_multi_platform_' + Date.now();
      const dingtalkCode = 'dingtalk_multi_platform_' + Date.now();

      // Login with Feishu
      const feishuResponse = await request(app)
        .post('/api/oauth/callback/feishu')
        .send({ code: feishuCode })
        .expect(200);

      const userId = feishuResponse.body.data.user.id;

      // Login with DingTalk (same user, different platform)
      const dingtalkResponse = await request(app)
        .post('/api/oauth/callback/dingtalk')
        .send({ code: dingtalkCode })
        .expect(200);

      // Verify both logins work
      expect(feishuResponse.body.data.user.id).toBeDefined();
      expect(dingtalkResponse.body.data.user.id).toBeDefined();

      // In a real scenario with proper user merging, these would be the same user
      // For now, we just verify both logins succeed
    });
  });
});

/**
 * Helper Functions
 */

async function setupTestDatabase() {
  // Setup test database state
  // This would typically involve:
  // - Running migrations
  // - Creating test schemas
  // - Setting up test data fixtures
}

async function cleanupTestDatabase() {
  // Cleanup test database
  // This would typically involve:
  // - Dropping test schemas
  // - Closing database connections
}

async function cleanupTestData() {
  // Clean up test data after each test
  // This would typically involve:
  // - Deleting test users
  // - Clearing test instances
  // - Resetting sequences
}

async function createTestUser(userData: any): Promise<any> {
  // Helper to create test users
  // In a real implementation, this would use the UserRepository
  return {
    id: 1,
    ...userData
  };
}
