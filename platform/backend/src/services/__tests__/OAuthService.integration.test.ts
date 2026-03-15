/**
 * Integration Tests for OAuthService
 *
 * These tests use a real database and mocked Feishu API to test OAuth flow.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { OAuthService } from '../OAuthService';
import { UserRepository } from '../../repositories/UserRepository';
import { AppDataSource } from '../../config/database';
import { User } from '../../entities/User.entity';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OAuthService Integration Tests', () => {
  let oauthService: OAuthService;
  let userRepository: UserRepository;

  // Set up environment variables
  const originalEnv = process.env;

  beforeAll(async () => {
    // Configure test environment
    process.env.FEISHU_APP_ID = 'test_app_id';
    process.env.FEISHU_APP_SECRET = 'test_app_secret';
    process.env.FEISHU_REDIRECT_URI = 'http://localhost:5173/oauth/callback';
    process.env.FEISHU_OAUTH_AUTHORIZE_URL = 'https://open.feishu.cn/open-apis/authen/v1/authorize';
    process.env.FEISHU_OAUTH_TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v3/oidc/access_token';
    process.env.FEISHU_USER_INFO_URL = 'https://open.feishu.cn/open-apis/authen/v1/user_info';
    process.env.JWT_SECRET = 'test-jwt-secret-key';
    process.env.JWT_EXPIRES_IN = '604800'; // 7 days
    process.env.JWT_REFRESH_EXPIRES_IN = '2592000'; // 30 days
    process.env.DB_HOST = process.env.DB_HOST || 'localhost';
    process.env.DB_PORT = process.env.DB_PORT || '5432';
    process.env.DB_USERNAME = process.env.DB_USERNAME || 'opclaw';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'opclaw';
    process.env.DB_NAME = process.env.DB_NAME || 'opclaw';

    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Create repository
    userRepository = new UserRepository(AppDataSource.getRepository(User));

    // Create service
    oauthService = new OAuthService(userRepository);
  });

  afterAll(async () => {
    // Clean up test data
    const userRepo = AppDataSource.getRepository(User);
    await userRepo.delete({});

    // Close database connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }

    // Restore environment
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up users after each test
    const userRepo = AppDataSource.getRepository(User);
    await userRepo.delete({});
  });

  describe('OAuth URL Generation', () => {
    it('should generate authorization URL with default parameters', () => {
      const url = oauthService.getAuthorizationUrl();

      expect(url).toContain('https://open.feishu.cn/open-apis/authen/v1/authorize');
      expect(url).toContain('app_id=test_app_id');
      expect(url).toContain('redirect_uri=http://localhost:5173/oauth/callback');
      expect(url).toContain('scope=contact:user.base:readonly');
      expect(url).toContain('state=');
    });

    it('should generate authorization URL with custom parameters', () => {
      const customState = 'custom-state-123';
      const customRedirect = 'http://custom.example.com/callback';
      const customScope = 'contact:user.base:readonly contact:user.email:readonly';

      const url = oauthService.getAuthorizationUrl({
        state: customState,
        redirect_uri: customRedirect,
        scope: customScope,
      });

      expect(url).toContain(`state=${customState}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(customRedirect)}`);
      expect(url).toContain(`scope=${encodeURIComponent(customScope)}`);
    });

    it('should generate unique state for each call', () => {
      const url1 = oauthService.getAuthorizationUrl();
      const url2 = oauthService.getAuthorizationUrl();

      const state1 = url1.match(/state=([^&]+)/)?.[1];
      const state2 = url2.match(/state=([^&]+)/)?.[1];

      expect(state1).toBeDefined();
      expect(state2).toBeDefined();
      expect(state1).not.toBe(state2);
    });
  });

  describe('OAuth Callback Handling with Mocked Feishu API', () => {
    const mockFeishuResponse = {
      code: 0,
      app_access_token: 'mock_app_access_token',
      refresh_token: 'mock_refresh_token',
      access_token: 'mock_access_token',
      expires_in: 7200,
    };

    const mockFeishuUserInfo = {
      user_id: 'feishu_user_123',
      union_id: 'feishu_union_456',
      name: 'Test Feishu User',
      email: 'test@feishu.com',
      avatar_url: 'https://avatar.example.com/avatar.jpg',
    };

    it('should handle OAuth callback successfully', async () => {
      // Mock Feishu API responses
      mockedAxios.post.mockResolvedValue({
        data: mockFeishuResponse,
      });

      mockedAxios.get.mockResolvedValue({
        data: {
          code: 0,
          data: mockFeishuUserInfo,
        },
      });

      const authCode = 'test_auth_code_123';
      const result = await oauthService.handleCallback(authCode);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('expires_in');
      expect(result).toHaveProperty('token_type');
      expect(result).toHaveProperty('user');

      expect(result.token_type).toBe('Bearer');
      expect(result.user).toHaveProperty('id');
      expect(result.user).toHaveProperty('feishu_user_id');
      expect(result.user).toHaveProperty('name');
      expect(result.user.feishu_user_id).toBe('feishu_user_123');
      expect(result.user.name).toBe('Test Feishu User');

      // Verify user was created in database
      const userRepo = AppDataSource.getRepository(User);
      const savedUser = await userRepo.findOne({
        where: { feishu_user_id: 'feishu_user_123' },
      });

      expect(savedUser).toBeDefined();
      expect(savedUser!.name).toBe('Test Feishu User');
      expect(savedUser!.email).toBe('test@feishu.com');
    });

    it('should update existing user on subsequent OAuth callbacks', async () => {
      // Create existing user
      const userRepo = AppDataSource.getRepository(User);
      const existingUser = userRepo.create({
        feishu_user_id: 'feishu_user_123',
        name: 'Old Name',
        email: 'old@email.com',
      });
      await userRepo.save(existingUser);

      // Mock Feishu API responses with updated info
      mockedAxios.post.mockResolvedValue({
        data: mockFeishuResponse,
      });

      mockedAxios.get.mockResolvedValue({
        data: {
          code: 0,
          data: {
            ...mockFeishuUserInfo,
            name: 'Updated Name',
            email: 'updated@email.com',
          },
        },
      });

      const authCode = 'test_auth_code_123';
      const result = await oauthService.handleCallback(authCode);

      expect(result.user.id).toBe(existingUser.id);
      expect(result.user.name).toBe('Updated Name');

      // Verify user was updated in database
      const updatedUser = await userRepo.findOne({
        where: { feishu_user_id: 'feishu_user_123' },
      });

      expect(updatedUser!.name).toBe('Updated Name');
      expect(updatedUser!.email).toBe('updated@email.com');
    });

    it('should update last_login time on successful OAuth', async () => {
      // Mock Feishu API responses
      mockedAxios.post.mockResolvedValue({
        data: mockFeishuResponse,
      });

      mockedAxios.get.mockResolvedValue({
        data: {
          code: 0,
          data: mockFeishuUserInfo,
        },
      });

      const authCode = 'test_auth_code_123';
      const beforeTime = new Date();

      await oauthService.handleCallback(authCode);

      // Verify last_login was updated
      const userRepo = AppDataSource.getRepository(User);
      const savedUser = await userRepo.findOne({
        where: { feishu_user_id: 'feishu_user_123' },
      });

      expect(savedUser!.last_login_at).toBeDefined();
      expect(savedUser!.last_login_at!.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    });

    it('should handle Feishu API error response', async () => {
      // Mock Feishu API error
      mockedAxios.post.mockResolvedValue({
        data: {
          code: 9999,
          msg: 'Invalid authorization code',
        },
      });

      const authCode = 'invalid_auth_code';

      await expect(oauthService.handleCallback(authCode)).rejects.toThrow('OAuth callback failed');
    });

    it('should handle network error', async () => {
      // Mock network error
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      const authCode = 'test_auth_code_123';

      await expect(oauthService.handleCallback(authCode)).rejects.toThrow('OAuth callback failed');
    });

    it('should handle user info API error', async () => {
      // Mock token exchange success
      mockedAxios.post.mockResolvedValue({
        data: mockFeishuResponse,
      });

      // Mock user info API error
      mockedAxios.get.mockResolvedValue({
        data: {
          code: 9999,
          msg: 'Invalid access token',
        },
      });

      const authCode = 'test_auth_code_123';

      await expect(oauthService.handleCallback(authCode)).rejects.toThrow('OAuth callback failed');
    });
  });

  describe('JWT Token Generation with Real Database', () => {
    const mockFeishuResponse = {
      code: 0,
      app_access_token: 'mock_app_access_token',
      refresh_token: 'mock_refresh_token',
      access_token: 'mock_access_token',
      expires_in: 7200,
    };

    const mockFeishuUserInfo = {
      user_id: 'feishu_user_jwt',
      union_id: 'feishu_union_jwt',
      name: 'JWT Test User',
      email: 'jwt@test.com',
    };

    it('should generate valid JWT access token', async () => {
      // Mock Feishu API responses
      mockedAxios.post.mockResolvedValue({
        data: mockFeishuResponse,
      });

      mockedAxios.get.mockResolvedValue({
        data: {
          code: 0,
          data: mockFeishuUserInfo,
        },
      });

      const authCode = 'test_auth_code_jwt';
      const result = await oauthService.handleCallback(authCode);

      expect(result.access_token).toBeDefined();
      expect(result.access_token.length).toBeGreaterThan(0);

      // Verify token can be decoded
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(result.access_token, process.env.JWT_SECRET!);

      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('feishuUserId');
      expect(decoded).toHaveProperty('name');
      expect(decoded).toHaveProperty('email');
      expect(decoded.feishuUserId).toBe('feishu_user_jwt');
      expect(decoded.name).toBe('JWT Test User');
    });

    it('should generate valid JWT refresh token', async () => {
      // Mock Feishu API responses
      mockedAxios.post.mockResolvedValue({
        data: mockFeishuResponse,
      });

      mockedAxios.get.mockResolvedValue({
        data: {
          code: 0,
          data: mockFeishuUserInfo,
        },
      });

      const authCode = 'test_auth_code_jwt';
      const result = await oauthService.handleCallback(authCode);

      expect(result.refresh_token).toBeDefined();
      expect(result.refresh_token.length).toBeGreaterThan(0);

      // Verify refresh token can be decoded
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(result.refresh_token, process.env.JWT_SECRET!);

      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('feishuUserId');
    });

    it('should set correct token expiration time', async () => {
      // Mock Feishu API responses
      mockedAxios.post.mockResolvedValue({
        data: mockFeishuResponse,
      });

      mockedAxios.get.mockResolvedValue({
        data: {
          code: 0,
          data: mockFeishuUserInfo,
        },
      });

      const authCode = 'test_auth_code_jwt';
      const result = await oauthService.handleCallback(authCode);

      expect(result.expires_in).toBe(604800); // 7 days
    });
  });

  describe('Token Refresh with Real Database', () => {
    it('should refresh access token with valid refresh token', async () => {
      // Create a test user
      const userRepo = AppDataSource.getRepository(User);
      const testUser = userRepo.create({
        feishu_user_id: 'refresh_test_user',
        name: 'Refresh Test User',
        email: 'refresh@test.com',
      });
      await userRepo.save(testUser);

      // Generate a refresh token
      const jwt = require('jsonwebtoken');
      const refreshPayload = {
        userId: testUser.id,
        feishuUserId: testUser.feishu_user_id,
        name: testUser.name,
        email: testUser.email,
      };
      const refreshToken = jwt.sign(refreshPayload, process.env.JWT_SECRET!, {
        expiresIn: '30d',
      });

      // Refresh token
      const result = await oauthService.refreshToken(refreshToken);

      expect(result).toHaveProperty('access_token');
      expect(result.access_token).toBeDefined();
      expect(result.access_token.length).toBeGreaterThan(0);

      // Verify new token is valid
      const decoded = jwt.verify(result.access_token, process.env.JWT_SECRET!);
      expect(decoded.userId).toBe(testUser.id);
    });

    it('should reject invalid refresh token', async () => {
      const invalidRefreshToken = 'invalid.refresh.token';

      await expect(oauthService.refreshToken(invalidRefreshToken)).rejects.toThrow(
        'Invalid refresh token'
      );
    });

    it('should reject expired refresh token', async () => {
      // Create an expired refresh token
      const jwt = require('jsonwebtoken');
      const expiredPayload = {
        userId: 999,
        feishuUserId: 'expired_user',
        name: 'Expired User',
      };
      const expiredToken = jwt.sign(expiredPayload, process.env.JWT_SECRET!, {
        expiresIn: '-1h', // Expired 1 hour ago
      });

      await expect(oauthService.refreshToken(expiredToken)).rejects.toThrow(
        'Invalid refresh token'
      );
    });
  });

  describe('Token Verification', () => {
    it('should verify valid access token', async () => {
      // Create a test user
      const userRepo = AppDataSource.getRepository(User);
      const testUser = userRepo.create({
        feishu_user_id: 'verify_test_user',
        name: 'Verify Test User',
        email: 'verify@test.com',
      });
      await userRepo.save(testUser);

      // Generate a valid token
      const jwt = require('jsonwebtoken');
      const payload = {
        userId: testUser.id,
        feishuUserId: testUser.feishu_user_id,
        name: testUser.name,
        email: testUser.email,
      };
      const validToken = jwt.sign(payload, process.env.JWT_SECRET!, {
        expiresIn: '7d',
      });

      // Verify token
      const decoded = oauthService.verifyToken(validToken);

      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('feishuUserId');
      expect(decoded).toHaveProperty('name');
      expect(decoded).toHaveProperty('email');
      expect(decoded.userId).toBe(testUser.id);
      expect(decoded.feishuUserId).toBe(testUser.feishu_user_id);
    });

    it('should reject invalid access token', () => {
      const invalidToken = 'invalid.access.token';

      expect(() => oauthService.verifyToken(invalidToken)).toThrow('Invalid token');
    });

    it('should reject expired access token', () => {
      const jwt = require('jsonwebtoken');
      const expiredPayload = {
        userId: 999,
        feishuUserId: 'expired_user',
        name: 'Expired User',
      };
      const expiredToken = jwt.sign(expiredPayload, process.env.JWT_SECRET!, {
        expiresIn: '-1h', // Expired 1 hour ago
      });

      expect(() => oauthService.verifyToken(expiredToken)).toThrow('Invalid token');
    });
  });

  describe('State Validation', () => {
    it('should generate cryptographically random state', () => {
      const states = new Set();

      for (let i = 0; i < 100; i++) {
        const url = oauthService.getAuthorizationUrl();
        const state = url.match(/state=([^&]+)/)?.[1];
        states.add(state);
      }

      // All 100 states should be unique
      expect(states.size).toBe(100);
    });

    it('should generate state with sufficient length', () => {
      const url = oauthService.getAuthorizationUrl();
      const state = url.match(/state=([^&]+)/)?.[1];

      expect(state).toBeDefined();
      expect(state!.length).toBeGreaterThan(10); // Should be reasonably long
    });
  });
});
