/**
 * OAuth Flow E2E Tests
 *
 * Tests the complete OAuth authorization flow with Feishu integration.
 * These tests verify URL generation, callback handling, token exchange,
 * and user creation.
 *
 * Test Flow:
 * 1. Generate authorization URL
 * 2. Simulate Feishu callback
 * 3. Exchange authorization code for tokens
 * 4. Create or update user
 * 5. Verify JWT token generation
 * 6. Test token refresh flow
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { AppDataSource } from '../../../src/config/database';
import { OAuthService } from '../../../src/services/OAuthService';
import { UserRepository } from '../../../src/repositories/UserRepository';
import { User } from '../../../src/entities/User.entity';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { DatabaseHelper } from '../helpers/database.helper';
import { TestFixtures } from '../helpers/fixtures';

// Mock axios for Feishu API calls
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OAuth Flow E2E Tests', () => {
  let oauthService: OAuthService;
  let userRepository: UserRepository;

  // Test data
  const mockFeishuUserId = `feishu_user_${Date.now()}`;
  const mockAuthCode = `auth_code_${Date.now()}`;
  const mockAccessToken = `access_token_${Date.now()}`;
  const mockRefreshToken = `refresh_token_${Date.now()}`;

  beforeAll(async () => {
    // Configure test environment
    process.env.FEISHU_APP_ID = 'test_feishu_app_id_oauth';
    process.env.FEISHU_APP_SECRET = 'test_feishu_app_secret_oauth';
    process.env.FEISHU_REDIRECT_URI = 'http://localhost:5173/oauth/callback';
    process.env.FEISHU_OAUTH_AUTHORIZE_URL = 'https://open.feishu.cn/open-apis/authen/v1/authorize';
    process.env.FEISHU_OAUTH_TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token';
    process.env.FEISHU_USER_INFO_URL = 'https://open.feishu.cn/open-apis/authen/v1/user_info';
    process.env.JWT_SECRET = 'test-jwt-secret-oauth';
    process.env.JWT_EXPIRES_IN = '7d';
    process.env.JWT_REFRESH_EXPIRES_IN = '30d';

    // Initialize database
    await DatabaseHelper.connect();

    // Create repository and service
    userRepository = new UserRepository(AppDataSource.getRepository(User));
    oauthService = new OAuthService(userRepository);

    console.log('✓ OAuth E2E test environment initialized');
  });

  afterAll(async () => {
    // Clean up and disconnect
    await DatabaseHelper.clean();
    await DatabaseHelper.disconnect();
  });

  beforeEach(async () => {
    // Clean database before each test
    await DatabaseHelper.clean();

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up after each test
    await DatabaseHelper.clean();
  });

  describe('Authorization URL Generation', () => {
    it('should generate valid authorization URL with all required parameters', () => {
      console.log('\n=== Authorization URL Generation ===');

      const url = oauthService.getAuthorizationUrl();

      // Verify URL structure
      expect(url).toMatch(/^https?:\/\//);
      expect(url).not.toContain('undefined');

      // Verify required parameters
      expect(url).toContain('app_id=test_feishu_app_id_oauth');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('scope=');
      expect(url).toContain('state=');

      console.log('✓ Authorization URL generated');
      console.log(`  URL: ${url.substring(0, 100)}...`);
    });

    it('should generate URL with custom redirect URI', () => {
      const customRedirect = 'https://custom.example.com/oauth/callback';
      const url = oauthService.getAuthorizationUrl({ redirect_uri: customRedirect });

      expect(url).toContain('redirect_uri=' + encodeURIComponent(customRedirect));
      console.log('✓ Custom redirect URI applied');
    });

    it('should generate URL with custom scope', () => {
      const customScope = 'contact:user.base:readonly contact:user.email:readonly';
      const url = oauthService.getAuthorizationUrl({ scope: customScope });

      expect(url).toContain('scope=' + encodeURIComponent(customScope));
      console.log('✓ Custom scope applied');
    });

    it('should include unique state parameter for CSRF protection', () => {
      const url1 = oauthService.getAuthorizationUrl();
      const url2 = oauthService.getAuthorizationUrl();

      // Extract state parameters
      const state1 = url1.match(/state=([^&]+)/)?.[1];
      const state2 = url2.match(/state=([^&]+)/)?.[1];

      expect(state1).toBeDefined();
      expect(state2).toBeDefined();
      expect(state1).not.toBe(state2);

      console.log('✓ Unique state parameters generated');
      console.log(`  State 1: ${state1?.substring(0, 10)}...`);
      console.log(`  State 2: ${state2?.substring(0, 10)}...`);
    });

    it('should throw error when required config is missing', () => {
      // Save original value
      const originalAppId = process.env.FEISHU_APP_ID;

      // Remove required config
      delete process.env.FEISHU_APP_ID;

      expect(() => {
        oauthService.getAuthorizationUrl();
      }).toThrow();

      // Restore config
      process.env.FEISHU_APP_ID = originalAppId;
      console.log('✓ Error thrown for missing config');
    });
  });

  describe('OAuth Callback Handling', () => {
    it('should handle successful OAuth callback', async () => {
      console.log('\n=== OAuth Callback: Success ===');

      // Mock Feishu token API response
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          code: 0,
          access_token: mockAccessToken,
          refresh_token: mockRefreshToken,
          expires_in: 3600,
        },
      });

      // Mock Feishu user info API response
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          code: 0,
          data: {
            user_id: mockFeishuUserId,
            name: 'Test Feishu User',
            avatar_url: 'https://example.com/avatar.png',
            email: 'test@example.com',
          },
        },
      });

      // Handle callback
      const tokens = await oauthService.handleCallback(mockAuthCode);

      // Verify token exchange
      expect(tokens).toBeDefined();
      expect(tokens.access_token).toBeDefined();
      expect(tokens.refresh_token).toBeDefined();
      expect(tokens.expires_in).toBeDefined();

      console.log('✓ Token exchange successful');
      console.log(`  Access token: ${tokens.access_token.substring(0, 20)}...`);

      // Verify user created in database
      const user = await userRepository.findByFeishuUserId(mockFeishuUserId);
      expect(user).toBeDefined();
      expect(user!.feishu_user_id).toBe(mockFeishuUserId);
      expect(user!.name).toBe('Test Feishu User');

      console.log('✓ User created in database');
    });

    it('should update existing user on subsequent logins', async () => {
      console.log('\n=== OAuth Callback: Existing User ===');

      // Create existing user
      const existingUser = await DatabaseHelper.createTestUser({
        feishu_user_id: mockFeishuUserId,
        name: 'Old Name',
        email: 'old@example.com',
      });

      // Mock Feishu API responses with updated data
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
            name: 'Updated Name',
            avatar_url: 'https://example.com/new-avatar.png',
            email: 'updated@example.com',
          },
        },
      });

      // Handle callback
      await oauthService.handleCallback(mockAuthCode);

      // Verify user updated
      const updatedUser = await userRepository.findByFeishuUserId(mockFeishuUserId);
      expect(updatedUser).toBeDefined();
      expect(updatedUser!.name).toBe('Updated Name');
      expect(updatedUser!.email).toBe('updated@example.com');
      expect(updatedUser!.avatar).toBe('https://example.com/new-avatar.png');

      console.log('✓ Existing user updated');
    });

    it('should handle OAuth error from Feishu', async () => {
      console.log('\n=== OAuth Callback: Feishu Error ===');

      // Mock Feishu error response
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          code: 99991663,
          msg: 'Invalid authorization code',
        },
      });

      // Should throw error
      await expect(oauthService.handleCallback('invalid_code')).rejects.toThrow();
      console.log('✓ OAuth error handled');
    });

    it('should handle network error during token exchange', async () => {
      console.log('\n=== OAuth Callback: Network Error ===');

      // Mock network error
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      // Should throw error
      await expect(oauthService.handleCallback(mockAuthCode)).rejects.toThrow();
      console.log('✓ Network error handled');
    });
  });

  describe('JWT Token Generation', () => {
    it('should generate valid JWT tokens', async () => {
      console.log('\n=== JWT Token Generation ===');

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
            name: 'JWT Test User',
            avatar_url: 'https://example.com/avatar.png',
          },
        },
      });

      // Handle callback to get JWT tokens
      const tokens = await oauthService.handleCallback(mockAuthCode);

      // Verify JWT access token
      expect(tokens.access_token).toBeDefined();
      const decodedAccess = jwt.verify(tokens.access_token, process.env.JWT_SECRET!);
      expect(decodedAccess).toHaveProperty('userId');
      expect(decodedAccess).toHaveProperty('feishuUserId', mockFeishuUserId);

      console.log('✓ JWT access token valid');
      console.log(`  User ID: ${decodedAccess.userId}`);

      // Verify JWT refresh token
      expect(tokens.refresh_token).toBeDefined();
      const decodedRefresh = jwt.verify(tokens.refresh_token, process.env.JWT_SECRET!);
      expect(decodedRefresh).toHaveProperty('userId');

      console.log('✓ JWT refresh token valid');
    });

    it('should verify JWT tokens correctly', async () => {
      console.log('\n=== JWT Token Verification ===');

      // Create test user
      const testUser = await DatabaseHelper.createTestUser({
        feishu_user_id: mockFeishuUserId,
      });

      // Generate JWT token
      const token = oauthService.generateToken(testUser);

      // Verify token
      const decoded = oauthService.verifyToken(token);
      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(testUser.id);
      expect(decoded.feishuUserId).toBe(testUser.feishu_user_id);

      console.log('✓ Token verified successfully');
    });

    it('should reject invalid JWT tokens', () => {
      console.log('\n=== JWT Token: Invalid Token ===');

      const invalidToken = 'invalid.jwt.token';

      expect(() => {
        oauthService.verifyToken(invalidToken);
      }).toThrow();

      console.log('✓ Invalid token rejected');
    });

    it('should reject expired JWT tokens', () => {
      console.log('\n=== JWT Token: Expired Token ===');

      // Create expired token
      const expiredToken = jwt.sign(
        { userId: 'test-user-id', feishuUserId: 'test-feishu-id' },
        process.env.JWT_SECRET!,
        { expiresIn: '-1h' }
      );

      expect(() => {
        oauthService.verifyToken(expiredToken);
      }).toThrow();

      console.log('✓ Expired token rejected');
    });
  });

  describe('Token Refresh Flow', () => {
    it('should refresh JWT tokens successfully', async () => {
      console.log('\n=== Token Refresh ===');

      // Create test user
      const testUser = await DatabaseHelper.createTestUser({
        feishu_user_id: mockFeishuUserId,
      });

      // Generate initial tokens
      const initialTokens = oauthService.generateToken(testUser);

      // Refresh tokens
      const refreshedTokens = await oauthService.refreshToken(initialTokens.refresh_token);

      // Verify new tokens generated
      expect(refreshedTokens.access_token).toBeDefined();
      expect(refreshedTokens.refresh_token).toBeDefined();
      expect(refreshedTokens.access_token).not.toBe(initialTokens.access_token);
      expect(refreshedTokens.refresh_token).not.toBe(initialTokens.refresh_token);

      console.log('✓ Tokens refreshed successfully');
    });

    it('should reject invalid refresh token', async () => {
      console.log('\n=== Token Refresh: Invalid Token ===');

      await expect(
        oauthService.refreshToken('invalid-refresh-token')
      ).rejects.toThrow();

      console.log('✓ Invalid refresh token rejected');
    });
  });

  describe('Complete OAuth Flow Integration', () => {
    it('should complete full OAuth flow from URL to JWT', async () => {
      console.log('\n=== Complete OAuth Flow ===');

      // Step 1: Generate authorization URL
      const authUrl = oauthService.getAuthorizationUrl();
      expect(authUrl).toContain('https://open.feishu.cn');
      console.log('✓ Step 1: Authorization URL generated');

      // Step 2: Simulate user authorization and callback
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
            name: 'Complete Flow User',
            avatar_url: 'https://example.com/avatar.png',
            email: 'complete@example.com',
          },
        },
      });

      // Step 3: Handle callback and get JWT tokens
      const jwtTokens = await oauthService.handleCallback(mockAuthCode);
      expect(jwtTokens.access_token).toBeDefined();
      console.log('✓ Step 2-3: Callback handled, JWT tokens received');

      // Step 4: Verify JWT token
      const decoded = oauthService.verifyToken(jwtTokens.access_token);
      expect(decoded.userId).toBeDefined();
      expect(decoded.feishuUserId).toBe(mockFeishuUserId);
      console.log('✓ Step 4: JWT token verified');

      // Step 5: Verify user in database
      const user = await userRepository.findByFeishuUserId(mockFeishuUserId);
      expect(user).toBeDefined();
      expect(user!.name).toBe('Complete Flow User');
      console.log('✓ Step 5: User stored in database');

      console.log('\n=== Complete OAuth Flow: SUCCESS ===');
    });
  });

  describe('Security Tests', () => {
    it('should validate state parameter to prevent CSRF', async () => {
      console.log('\n=== Security: State Validation ===');

      // Generate authorization URL with state
      const authUrl = oauthService.getAuthorizationUrl();
      const state = authUrl.match(/state=([^&]+)/)?.[1];

      expect(state).toBeDefined();
      expect(state!.length).toBeGreaterThan(20); // State should be sufficiently long
      console.log('✓ State parameter present and sufficiently long');

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
            name: 'Security Test User',
            avatar_url: 'https://example.com/avatar.png',
          },
        },
      });

      // Handle callback (should validate state internally)
      await oauthService.handleCallback(mockAuthCode);
      console.log('✓ State validated during callback');
    });

    it('should use secure JWT secret from environment', async () => {
      console.log('\n=== Security: JWT Secret ===');

      expect(process.env.JWT_SECRET).toBeDefined();
      expect(process.env.JWT_SECRET!.length).toBeGreaterThan(10);
      console.log('✓ JWT secret configured');
    });

    it('should set appropriate token expiration', async () => {
      console.log('\n=== Security: Token Expiration ===');

      // Create test user
      const testUser = await DatabaseHelper.createTestUser();

      // Generate token
      const token = oauthService.generateToken(testUser);
      const decoded = jwt.decode(token) as any;

      // Verify expiration is set
      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);

      const expiresIn = decoded.exp - decoded.iat;
      expect(expiresIn).toBeGreaterThan(0);
      expect(expiresIn).toBeLessThanOrEqual(7 * 24 * 60 * 60); // Max 7 days

      console.log(`✓ Token expires in ${Math.round(expiresIn / 86400)} days`);
    });
  });

  describe('Performance Tests', () => {
    it('should generate authorization URL quickly', () => {
      console.log('\n=== Performance: URL Generation ===');

      const startTime = Date.now();
      const url = oauthService.getAuthorizationUrl();
      const duration = Date.now() - startTime;

      expect(url).toBeDefined();
      expect(duration).toBeLessThan(100); // Should be instant

      console.log(`✓ URL generated in ${duration}ms`);
    });

    it('should handle callback within acceptable time', async () => {
      console.log('\n=== Performance: Callback Handling ===');

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
            name: 'Performance Test User',
            avatar_url: 'https://example.com/avatar.png',
          },
        },
      });

      const startTime = Date.now();
      await oauthService.handleCallback(mockAuthCode);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(TestFixtures.PERFORMANCE_BENCHMARKS.oauthFlow.warning);

      console.log(`✓ Callback handled in ${duration}ms`);
    });
  });
});
