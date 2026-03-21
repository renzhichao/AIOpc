/**
 * ProviderFactory Unit Tests
 *
 * Tests the OAuth provider factory functionality including:
 * - Provider registration
 * - Provider retrieval
 * - Platform availability checking
 * - Batch registration
 * - Error handling
 *
 * @module auth/ProviderFactory.spec
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ProviderFactory } from './ProviderFactory';
import { IOAuthProvider } from './interfaces/IOAuthProvider';
import { OAuthPlatform, OAuthError, OAuthErrorType } from './interfaces/OAuthTypes';

/**
 * Mock OAuth Provider for testing
 */
class MockOAuthProvider implements IOAuthProvider {
  constructor(private platform: OAuthPlatform) {}

  getPlatformType(): OAuthPlatform {
    return this.platform;
  }

  async getAuthorizationUrl(redirectUri: string, state?: string): Promise<string> {
    return `https://${this.platform}.example.com/oauth?redirect_uri=${redirectUri}&state=${state}`;
  }

  async exchangeCodeForToken(code: string): Promise<any> {
    return { access_token: 'mock_token', platform: this.platform };
  }

  async getUserInfo(accessToken: string): Promise<any> {
    return { user_id: 'mock_user_id', platform: this.platform };
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    return 'new_mock_token';
  }

  async validateToken(accessToken: string): Promise<boolean> {
    return true;
  }

  getErrorHandler(): any {
    return {
      parseError: (error: any) => error,
      getUserMessage: (type: any) => 'Mock error message',
      isRetryable: (type: any) => false
    };
  }
}

describe('ProviderFactory', () => {
  let factory: ProviderFactory;
  let feishuProvider: MockOAuthProvider;
  let dingtalkProvider: MockOAuthProvider;

  beforeEach(() => {
    factory = new ProviderFactory();
    feishuProvider = new MockOAuthProvider(OAuthPlatform.FEISHU);
    dingtalkProvider = new MockOAuthProvider(OAuthPlatform.DINGTALK);
  });

  afterEach(() => {
    factory.clearProviders();
  });

  describe('Provider Registration', () => {
    it('should register a provider successfully', () => {
      factory.registerProvider(OAuthPlatform.FEISHU, feishuProvider);

      expect(factory.hasPlatform(OAuthPlatform.FEISHU)).toBe(true);
      expect(factory.getProviderCount()).toBe(1);
    });

    it('should register multiple providers', () => {
      factory.registerProvider(OAuthPlatform.FEISHU, feishuProvider);
      factory.registerProvider(OAuthPlatform.DINGTALK, dingtalkProvider);

      expect(factory.hasPlatform(OAuthPlatform.FEISHU)).toBe(true);
      expect(factory.hasPlatform(OAuthPlatform.DINGTALK)).toBe(true);
      expect(factory.getProviderCount()).toBe(2);
    });

    it('should replace existing provider when registering same platform', () => {
      const provider1 = new MockOAuthProvider(OAuthPlatform.FEISHU);
      const provider2 = new MockOAuthProvider(OAuthPlatform.FEISHU);

      factory.registerProvider(OAuthPlatform.FEISHU, provider1);
      factory.registerProvider(OAuthPlatform.FEISHU, provider2);

      expect(factory.getProviderCount()).toBe(1);
      expect(factory.getProvider(OAuthPlatform.FEISHU)).toBe(provider2);
    });

    it('should throw error when registering null provider', () => {
      expect(() => {
        factory.registerProvider(OAuthPlatform.FEISHU, null as any);
      }).toThrow(OAuthError);
    });

    it('should throw error when registering undefined provider', () => {
      expect(() => {
        factory.registerProvider(OAuthPlatform.FEISHU, undefined as any);
      }).toThrow(OAuthError);
    });

    it('should throw error when registering provider without getPlatformType method', () => {
      const invalidProvider = {} as any;

      expect(() => {
        factory.registerProvider(OAuthPlatform.FEISHU, invalidProvider);
      }).toThrow(OAuthError);
    });
  });

  describe('Provider Retrieval', () => {
    beforeEach(() => {
      factory.registerProvider(OAuthPlatform.FEISHU, feishuProvider);
      factory.registerProvider(OAuthPlatform.DINGTALK, dingtalkProvider);
    });

    it('should retrieve registered provider', () => {
      const provider = factory.getProvider(OAuthPlatform.FEISHU);

      expect(provider).toBe(feishuProvider);
      expect(provider.getPlatformType()).toBe(OAuthPlatform.FEISHU);
    });

    it('should throw error when retrieving unregistered platform', () => {
      expect(() => {
        factory.getProvider(OAuthPlatform.FEISHU); // Already registered
      }).not.toThrow();

      expect(() => {
        factory.getProvider('weixin' as OAuthPlatform);
      }).toThrow(OAuthError);
    });

    it('should include available platforms in error message', () => {
      try {
        factory.getProvider('weixin' as OAuthPlatform);
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(OAuthError);
        const oauthError = error as OAuthError;
        expect(oauthError.message).toContain('feishu');
        expect(oauthError.message).toContain('dingtalk');
      }
    });
  });

  describe('Platform Availability', () => {
    beforeEach(() => {
      factory.registerProvider(OAuthPlatform.FEISHU, feishuProvider);
    });

    it('should return true for registered platform', () => {
      expect(factory.hasPlatform(OAuthPlatform.FEISHU)).toBe(true);
    });

    it('should return false for unregistered platform', () => {
      expect(factory.hasPlatform(OAuthPlatform.DINGTALK)).toBe(false);
    });

    it('should return empty array when no platforms registered', () => {
      const emptyFactory = new ProviderFactory();
      expect(emptyFactory.getAvailablePlatforms()).toEqual([]);
    });

    it('should return list of available platforms', () => {
      factory.registerProvider(OAuthPlatform.DINGTALK, dingtalkProvider);

      const platforms = factory.getAvailablePlatforms();

      expect(platforms).toContain(OAuthPlatform.FEISHU);
      expect(platforms).toContain(OAuthPlatform.DINGTALK);
      expect(platforms.length).toBe(2);
    });
  });

  describe('Batch Registration', () => {
    it('should register multiple providers at once', () => {
      const providers = new Map<OAuthPlatform, IOAuthProvider>([
        [OAuthPlatform.FEISHU, feishuProvider],
        [OAuthPlatform.DINGTALK, dingtalkProvider]
      ]);

      factory.registerProviders(providers);

      expect(factory.getProviderCount()).toBe(2);
      expect(factory.hasPlatform(OAuthPlatform.FEISHU)).toBe(true);
      expect(factory.hasPlatform(OAuthPlatform.DINGTALK)).toBe(true);
    });

    it('should continue registration when one provider fails', () => {
      const providers = new Map<OAuthPlatform, IOAuthProvider>([
        [OAuthPlatform.FEISHU, feishuProvider],
        [OAuthPlatform.DINGTALK, null as any], // Invalid provider
      ]);

      expect(() => {
        factory.registerProviders(providers);
      }).not.toThrow();

      expect(factory.getProviderCount()).toBe(1);
      expect(factory.hasPlatform(OAuthPlatform.FEISHU)).toBe(true);
    });
  });

  describe('Provider Information', () => {
    beforeEach(() => {
      factory.registerProvider(OAuthPlatform.FEISHU, feishuProvider);
      factory.registerProvider(OAuthPlatform.DINGTALK, dingtalkProvider);
    });

    it('should return provider information', () => {
      const info = factory.getProvidersInfo();

      expect(info).toHaveLength(2);
      expect(info[0]).toEqual({
        platform: OAuthPlatform.FEISHU,
        className: 'MockOAuthProvider'
      });
      expect(info[1]).toEqual({
        platform: OAuthPlatform.DINGTALK,
        className: 'MockOAuthProvider'
      });
    });

    it('should return correct provider count', () => {
      expect(factory.getProviderCount()).toBe(2);
    });
  });

  describe('Clear Providers', () => {
    beforeEach(() => {
      factory.registerProvider(OAuthPlatform.FEISHU, feishuProvider);
      factory.registerProvider(OAuthPlatform.DINGTALK, dingtalkProvider);
    });

    it('should clear all registered providers', () => {
      expect(factory.getProviderCount()).toBe(2);

      factory.clearProviders();

      expect(factory.getProviderCount()).toBe(0);
      expect(factory.hasPlatform(OAuthPlatform.FEISHU)).toBe(false);
      expect(factory.hasPlatform(OAuthPlatform.DINGTALK)).toBe(false);
    });
  });

  describe('Interface Compliance', () => {
    it('should implement IOAuthProviderFactory interface', () => {
      expect(factory.getProvider).toBeDefined();
      expect(factory.registerProvider).toBeDefined();
      expect(factory.getAvailablePlatforms).toBeDefined();
      expect(factory.hasPlatform).toBe(true);
    });
  });
});
