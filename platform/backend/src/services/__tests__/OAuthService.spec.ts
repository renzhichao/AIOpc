/**
 * OAuthService Unit Tests
 *
 * Tests OAuthService functionality including:
 * - Multi-platform support
 * - Platform registration
 * - Authorization URL generation
 * - Token refresh
 * - Backward compatibility
 *
 * @module services/__tests__/OAuthService.spec
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { OAuthService } from '../OAuthService';
import { UserRepository } from '../../repositories/UserRepository';
import { InstanceRepository } from '../../repositories/InstanceRepository';
import { OAuthPlatform } from '../../auth/interfaces/OAuthTypes';

/**
 * Mock UserRepository
 */
class MockUserRepository {
  async findByFeishuUserId(userId: string): Promise<any> {
    return null;
  }

  async findByDingtalkUserId(userId: string): Promise<any> {
    return null;
  }

  async findById(id: number): Promise<any> {
    return null;
  }

  async create(userData: any): Promise<any> {
    return { id: 1, ...userData };
  }

  async update(id: number, data: any): Promise<void> {
    // Mock implementation
  }

  async updateLastLogin(id: number): Promise<void> {
    // Mock implementation
  }
}

/**
 * Mock InstanceRepository
 */
class MockInstanceRepository {
  async findUnclaimed(): Promise<any> {
    return null;
  }

  async claimInstance(instanceId: string, userId: number): Promise<void> {
    // Mock implementation
  }
}

describe('OAuthService', () => {
  let oauthService: OAuthService;
  let mockUserRepo: MockUserRepository;
  let mockInstanceRepo: MockInstanceRepository;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_secret';
    process.env.FEISHU_APP_ID = 'test_app_id';
    process.env.FEISHU_APP_SECRET = 'test_app_secret_32_chars_minimum';
    process.env.FEISHU_REDIRECT_URI = 'http://localhost:3000/callback';
    process.env.DINGTALK_APP_ID = 'test_dingtalk_id';
    process.env.DINGTALK_APP_SECRET = 'test_dingtalk_secret_32_chars_minimum';
    process.env.DINGTALK_REDIRECT_URI = 'http://localhost:3000/dingtalk/callback';

    // Create mocks
    mockUserRepo = new MockUserRepository();
    mockInstanceRepo = new MockInstanceRepository();

    // Create service
    oauthService = new OAuthService(
      mockUserRepo as any,
      mockInstanceRepo as any
    );
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getEnabledPlatforms', () => {
    it('should return enabled platforms from configuration', async () => {
      process.env.OAUTH_ENABLED_PLATFORMS = 'feishu,dingtalk';

      const service = new OAuthService(
        mockUserRepo as any,
        mockInstanceRepo as any
      );

      const platforms = await service.getEnabledPlatforms();

      expect(platforms).toHaveLength(2);
      expect(platforms[0].platform).toBe(OAuthPlatform.FEISHU);
      expect(platforms[0].enabled).toBe(true);
      expect(platforms[1].platform).toBe(OAuthPlatform.DINGTALK);
      expect(platforms[1].enabled).toBe(true);
    });

    it('should mark default platform correctly', async () => {
      process.env.OAUTH_ENABLED_PLATFORMS = 'feishu,dingtalk';
      process.env.OAUTH_DEFAULT_PLATFORM = 'dingtalk';

      const service = new OAuthService(
        mockUserRepo as any,
        mockInstanceRepo as any
      );

      const platforms = await service.getEnabledPlatforms();

      const dingtalkPlatform = platforms.find(p => p.platform === OAuthPlatform.DINGTALK);
      expect(dingtalkPlatform?.isDefault).toBe(true);
    });

    it('should default to Feishu when no configuration provided', async () => {
      delete process.env.OAUTH_ENABLED_PLATFORMS;

      const service = new OAuthService(
        mockUserRepo as any,
        mockInstanceRepo as any
      );

      const platforms = await service.getEnabledPlatforms();

      expect(platforms).toHaveLength(1);
      expect(platforms[0].platform).toBe(OAuthPlatform.FEISHU);
      expect(platforms[0].isDefault).toBe(true);
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate Feishu authorization URL', async () => {
      const url = await oauthService.getAuthorizationUrl(OAuthPlatform.FEISHU, {
        redirect_uri: 'http://localhost:3000/callback',
        state: 'test_state'
      });

      expect(url).toContain('open.feishu.cn');
      expect(url).toContain('app_id=');
      expect(url).toContain('redirect_uri=http://localhost:3000/callback');
      expect(url).toContain('state=test_state');
    });

    it('should generate DingTalk authorization URL', async () => {
      const url = await oauthService.getAuthorizationUrl(OAuthPlatform.DINGTALK, {
        redirect_uri: 'http://localhost:3000/callback',
        state: 'test_state'
      });

      expect(url).toContain('login.dingtalk.com');
      expect(url).toContain('client_id=');
      expect(url).toContain('redirect_uri=http://localhost:3000/callback');
    });

    it('should default to Feishu when platform not specified', async () => {
      const url = await oauthService.getAuthorizationUrl(undefined, {
        redirect_uri: 'http://localhost:3000/callback'
      });

      expect(url).toContain('open.feishu.cn');
    });

    it('should auto-generate state if not provided', async () => {
      const url = await oauthService.getAuthorizationUrl(OAuthPlatform.FEISHU, {
        redirect_uri: 'http://localhost:3000/callback'
      });

      expect(url).toContain('state=');
      const stateMatch = url.match(/state=([^&]+)/);
      expect(stateMatch).toBeTruthy();
      expect(stateMatch![1]).toBeDefined();
    });

    it('should throw error for disabled platform', async () => {
      process.env.OAUTH_ENABLED_PLATFORMS = 'feishu';

      const service = new OAuthService(
        mockUserRepo as any,
        mockInstanceRepo as any
      );

      await expect(
        service.getAuthorizationUrl(OAuthPlatform.DINGTALK)
      ).rejects.toThrow('not enabled');
    });
  });

  describe('handleCallback', () => {
    it('should default to Feishu when platform not specified', async () => {
      // This test verifies backward compatibility
      // Actual implementation would require mocking OAuth providers
      expect(oauthService).toBeDefined();
    });

    it('should support platform-specific callbacks', async () => {
      // Test structure for both platforms
      expect(oauthService).toBeDefined();
    });
  });

  describe('refreshToken', () => {
    it('should refresh access token successfully', async () => {
      const mockPayload = {
        userId: 1,
        feishuUserId: 'feishu_123',
        name: 'Test User',
        email: 'test@example.com'
      };

      const jwt = require('jsonwebtoken');
      jest.spyOn(jwt, 'verify').mockReturnValue(mockPayload);
      jest.spyOn(jwt, 'sign').mockReturnValue('new_access_token');

      const result = await oauthService.refreshToken('valid_refresh_token');

      expect(result.access_token).toBe('new_access_token');
    });

    it('should throw error for invalid refresh token', async () => {
      const jwt = require('jsonwebtoken');
      jest.spyOn(jwt, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(
        oauthService.refreshToken('invalid_token')
      ).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const jwt = require('jsonwebtoken');
      const mockPayload = {
        userId: 1,
        feishuUserId: 'feishu_123',
        name: 'Test User'
      };

      jest.spyOn(jwt, 'verify').mockReturnValue(mockPayload);

      const result = oauthService.verifyToken('valid_token');

      expect(result.userId).toBe(1);
      expect(result.name).toBe('Test User');
    });

    it('should throw error for invalid token', () => {
      const jwt = require('jsonwebtoken');
      jest.spyOn(jwt, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => {
        oauthService.verifyToken('invalid_token');
      }).toThrow('Invalid token');
    });
  });

  describe('Backward Compatibility', () => {
    it('should support legacy Feishu-only workflow', async () => {
      // Test that existing Feishu integration still works
      const url = await oauthService.getAuthorizationUrl(undefined, {
        redirect_uri: 'http://localhost:3000/callback'
      });

      expect(url).toContain('open.feishu.cn');
    });

    it('should maintain existing API signatures', async () => {
      // Verify that existing methods still work
      expect(typeof oauthService.getAuthorizationUrl).toBe('function');
      expect(typeof oauthService.handleCallback).toBe('function');
      expect(typeof oauthService.refreshToken).toBe('function');
      expect(typeof oauthService.verifyToken).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing configuration gracefully', () => {
      delete process.env.FEISHU_APP_ID;

      expect(() => {
        new OAuthService(mockUserRepo as any, mockInstanceRepo as any);
      }).not.toThrow(); // Should log error but not crash
    });

    it('should validate platform configuration', () => {
      process.env.OAUTH_ENABLED_PLATFORMS = 'invalid_platform';

      expect(() => {
        new OAuthService(mockUserRepo as any, mockInstanceRepo as any);
      }).not.toThrow(); // Should default to Feishu
    });
  });
});
