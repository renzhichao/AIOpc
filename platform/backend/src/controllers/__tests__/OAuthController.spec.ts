import 'reflect-metadata';
import { OAuthController } from '../OAuthController';
import { OAuthService } from '../../services/OAuthService';
import { AppError } from '../../utils/errors';
import { OAuthPlatform } from '../../auth/interfaces/OAuthTypes';

// Mock OAuthService
jest.mock('../../services/OAuthService');

// Mock logger
jest.mock('../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock LogSanitizer
jest.mock('../../utils/LogSanitizer', () => ({
  LogSanitizer: {
    log: jest.fn()
  }
}));

describe('OAuthController', () => {
  let controller: OAuthController;
  let mockOAuthService: jest.Mocked<OAuthService>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock OAuthService
    mockOAuthService = new OAuthService({} as any, {} as any) as jest.Mocked<OAuthService>;

    // Create controller instance with mocked service
    controller = new OAuthController(mockOAuthService);
  });

  describe('GET /oauth/platforms', () => {
    it('should return enabled platforms successfully', async () => {
      // Arrange
      const mockPlatforms = [
        { platform: OAuthPlatform.FEISHU, enabled: true, isDefault: true },
        { platform: OAuthPlatform.DINGTALK, enabled: true, isDefault: false }
      ];

      mockOAuthService.getEnabledPlatforms.mockResolvedValue(mockPlatforms);

      // Act
      const result = await controller.getPlatforms();

      // Assert
      expect(mockOAuthService.getEnabledPlatforms).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        data: {
          platforms: mockPlatforms
        }
      });
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      const error = new Error('Service unavailable');
      mockOAuthService.getEnabledPlatforms.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.getPlatforms()).rejects.toThrow(AppError);
      await expect(controller.getPlatforms()).rejects.toMatchObject({
        statusCode: 500,
        code: 'PLATFORMS_FETCH_FAILED'
      });
    });
  });

  describe('GET /oauth/authorize/:platform', () => {
    it('should generate Feishu authorization URL successfully', async () => {
      // Arrange
      const mockUrl = 'https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=123&redirect_uri=http://localhost';
      mockOAuthService.getAuthorizationUrl.mockResolvedValue(mockUrl);

      // Act
      const result = await controller.getAuthorizationUrlForPlatform('feishu', 'http://localhost:3000/callback');

      // Assert
      expect(mockOAuthService.getAuthorizationUrl).toHaveBeenCalledWith(
        OAuthPlatform.FEISHU,
        { redirect_uri: 'http://localhost:3000/callback' }
      );
      expect(result).toEqual({
        success: true,
        data: {
          url: mockUrl,
          platform: OAuthPlatform.FEISHU
        }
      });
    });

    it('should generate DingTalk authorization URL successfully', async () => {
      // Arrange
      const mockUrl = 'https://login.dingtalk.com/oauth2/auth?client_id=123&redirect_uri=http://localhost';
      mockOAuthService.getAuthorizationUrl.mockResolvedValue(mockUrl);

      // Act
      const result = await controller.getAuthorizationUrlForPlatform('dingtalk', 'http://localhost:3000/callback');

      // Assert
      expect(mockOAuthService.getAuthorizationUrl).toHaveBeenCalledWith(
        OAuthPlatform.DINGTALK,
        { redirect_uri: 'http://localhost:3000/callback' }
      );
      expect(result).toEqual({
        success: true,
        data: {
          url: mockUrl,
          platform: OAuthPlatform.DINGTALK
        }
      });
    });

    it('should handle case-insensitive platform parameter', async () => {
      // Arrange
      const mockUrl = 'https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=123';
      mockOAuthService.getAuthorizationUrl.mockResolvedValue(mockUrl);

      // Act
      const result = await controller.getAuthorizationUrlForPlatform('FEISHU', 'http://localhost:3000/callback');

      // Assert
      expect(mockOAuthService.getAuthorizationUrl).toHaveBeenCalledWith(
        OAuthPlatform.FEISHU,
        { redirect_uri: 'http://localhost:3000/callback' }
      );
      expect(result.success).toBe(true);
    });

    it('should reject invalid platform', async () => {
      // Act & Assert
      await expect(controller.getAuthorizationUrlForPlatform('invalid', 'http://localhost:3000/callback'))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_PLATFORM'
        });
    });

    it('should reject invalid redirect URI', async () => {
      // Act & Assert
      await expect(controller.getAuthorizationUrlForPlatform('feishu', 'not-a-valid-uri'))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_REDIRECT_URI'
        });
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      const error = new Error('Failed to generate URL');
      mockOAuthService.getAuthorizationUrl.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.getAuthorizationUrlForPlatform('feishu', 'http://localhost:3000/callback'))
        .rejects.toThrow(AppError);
    });
  });

  describe('POST /oauth/callback/:platform', () => {
    const mockAuthCode = 'test_auth_code_123';
    const mockTokenResponse = {
      access_token: 'jwt_access_token',
      refresh_token: 'jwt_refresh_token',
      expires_in: 604800,
      token_type: 'Bearer',
      user: {
        id: 1,
        feishu_user_id: 'ou_123',
        name: 'Test User',
        email: 'test@example.com'
      },
      has_instance: true,
      instance_id: 'inst_123',
      redirect_to: '/chat'
    };

    it('should handle Feishu callback successfully', async () => {
      // Arrange
      mockOAuthService.handleCallback.mockResolvedValue(mockTokenResponse);

      // Act
      const result = await controller.handleCallbackForPlatform('feishu', { code: mockAuthCode });

      // Assert
      expect(mockOAuthService.handleCallback).toHaveBeenCalledWith(
        mockAuthCode,
        OAuthPlatform.FEISHU
      );
      expect(result).toEqual({
        success: true,
        data: mockTokenResponse,
        message: 'Authentication successful'
      });
    });

    it('should handle DingTalk callback successfully', async () => {
      // Arrange
      const dingTalkTokenResponse = {
        ...mockTokenResponse,
        user: {
          id: 2,
          feishu_user_id: '', // DingTalk users don't have feishu_user_id
          name: 'DingTalk User',
          email: 'dingtalk@example.com'
        }
      };
      mockOAuthService.handleCallback.mockResolvedValue(dingTalkTokenResponse);

      // Act
      const result = await controller.handleCallbackForPlatform('dingtalk', { code: mockAuthCode });

      // Assert
      expect(mockOAuthService.handleCallback).toHaveBeenCalledWith(
        mockAuthCode,
        OAuthPlatform.DINGTALK
      );
      expect(result.success).toBe(true);
    });

    it('should reject missing authorization code', async () => {
      // Act & Assert
      await expect(controller.handleCallbackForPlatform('feishu', {}))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'MISSING_AUTH_CODE'
        });
    });

    it('should reject invalid platform', async () => {
      // Act & Assert
      await expect(controller.handleCallbackForPlatform('invalid', { code: mockAuthCode }))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_PLATFORM'
        });
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      const error = new Error('OAuth callback failed');
      mockOAuthService.handleCallback.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.handleCallbackForPlatform('feishu', { code: mockAuthCode }))
        .rejects.toMatchObject({
          statusCode: 401,
          code: 'OAUTH_CALLBACK_FAILED'
        });
    });
  });

  describe('POST /oauth/feishu/callback (Backward Compatibility)', () => {
    it('should redirect to platform-specific callback handler', async () => {
      // Arrange
      const mockTokenResponse = {
        access_token: 'jwt_token',
        refresh_token: 'refresh_token',
        expires_in: 604800,
        token_type: 'Bearer',
        user: { id: 1, feishu_user_id: 'ou_123', name: 'Test' },
        has_instance: false,
        instance_id: null,
        redirect_to: '/no-instance'
      };
      mockOAuthService.handleCallback.mockResolvedValue(mockTokenResponse);

      // Act
      const result = await controller.handleFeishuCallback({ code: 'test_code' });

      // Assert
      expect(mockOAuthService.handleCallback).toHaveBeenCalledWith('test_code', OAuthPlatform.FEISHU);
      expect(result.success).toBe(true);
    });
  });

  describe('POST /oauth/dingtalk/callback (Backward Compatibility)', () => {
    it('should redirect to platform-specific callback handler', async () => {
      // Arrange
      const mockTokenResponse = {
        access_token: 'jwt_token',
        refresh_token: 'refresh_token',
        expires_in: 604800,
        token_type: 'Bearer',
        user: { id: 2, feishu_user_id: '', name: 'DingTalk User' },
        has_instance: false,
        instance_id: null,
        redirect_to: '/no-instance'
      };
      mockOAuthService.handleCallback.mockResolvedValue(mockTokenResponse);

      // Act
      const result = await controller.handleDingtalkCallback({ code: 'test_code' });

      // Assert
      expect(mockOAuthService.handleCallback).toHaveBeenCalledWith('test_code', OAuthPlatform.DINGTALK);
      expect(result.success).toBe(true);
    });
  });

  describe('GET /oauth/authorize (Legacy - defaults to Feishu)', () => {
    it('should generate Feishu authorization URL by default', async () => {
      // Arrange
      const mockUrl = 'https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=123';
      mockOAuthService.getAuthorizationUrl.mockResolvedValue(mockUrl);

      // Act
      const result = await controller.getAuthorizationUrl('http://localhost:3000/callback');

      // Assert
      expect(mockOAuthService.getAuthorizationUrl).toHaveBeenCalledWith(
        undefined,
        { redirect_uri: 'http://localhost:3000/callback' }
      );
      expect(result).toEqual({
        success: true,
        data: {
          url: mockUrl,
          platform: 'feishu'
        }
      });
    });
  });

  describe('POST /oauth/callback (Legacy - defaults to Feishu)', () => {
    it('should handle Feishu callback by default', async () => {
      // Arrange
      const mockTokenResponse = {
        access_token: 'jwt_token',
        refresh_token: 'refresh_token',
        expires_in: 604800,
        token_type: 'Bearer',
        user: { id: 1, feishu_user_id: 'ou_123', name: 'Test' },
        has_instance: false,
        instance_id: null,
        redirect_to: '/no-instance'
      };
      mockOAuthService.handleCallback.mockResolvedValue(mockTokenResponse);

      // Act
      const result = await controller.handleCallback({ code: 'test_code' });

      // Assert
      expect(mockOAuthService.handleCallback).toHaveBeenCalledWith('test_code', undefined);
      expect(result.success).toBe(true);
    });
  });

  describe('POST /oauth/refresh', () => {
    it('should refresh access token successfully', async () => {
      // Arrange
      const mockTokens = { access_token: 'new_jwt_token' };
      mockOAuthService.refreshToken.mockResolvedValue(mockTokens);

      // Act
      const result = await controller.refreshToken({ refresh_token: 'valid_refresh_token' });

      // Assert
      expect(mockOAuthService.refreshToken).toHaveBeenCalledWith('valid_refresh_token');
      expect(result).toEqual({
        success: true,
        data: mockTokens,
        message: 'Token refreshed successfully'
      });
    });

    it('should reject missing refresh token', async () => {
      // Act & Assert
      await expect(controller.refreshToken({}))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'MISSING_REFRESH_TOKEN'
        });
    });

    it('should handle invalid refresh token', async () => {
      // Arrange
      const error = new Error('Invalid refresh token');
      mockOAuthService.refreshToken.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.refreshToken({ refresh_token: 'invalid_token' }))
        .rejects.toMatchObject({
          statusCode: 401,
          code: 'INVALID_REFRESH_TOKEN'
        });
    });
  });

  describe('POST /oauth/verify', () => {
    const mockPayload = {
      userId: 1,
      feishuUserId: 'ou_123',
      name: 'Test User',
      email: 'test@example.com',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    it('should verify valid token successfully', async () => {
      // Arrange
      mockOAuthService.verifyToken.mockReturnValue(mockPayload as any);

      // Act
      const result = await controller.verifyToken({ token: 'valid_jwt_token' });

      // Assert
      expect(mockOAuthService.verifyToken).toHaveBeenCalledWith('valid_jwt_token');
      expect(result).toEqual({
        success: true,
        data: {
          valid: true,
          payload: mockPayload
        }
      });
    });

    it('should handle invalid token gracefully', async () => {
      // Arrange
      mockOAuthService.verifyToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act
      const result = await controller.verifyToken({ token: 'invalid_token' });

      // Assert
      expect(result).toEqual({
        success: true,
        data: {
          valid: false,
          error: 'Invalid or expired token'
        }
      });
    });

    it('should reject missing token', async () => {
      // Act & Assert
      await expect(controller.verifyToken({}))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'MISSING_TOKEN'
        });
    });
  });

  describe('Platform Validation (Private Method)', () => {
    // Note: We can't directly test private methods, but we've already tested
    // the behavior through the public endpoints that use validatePlatform()
    // This is a design choice to maintain encapsulation

    it('should validate feishu platform case-insensitively through endpoint', async () => {
      // Arrange
      mockOAuthService.getAuthorizationUrl.mockResolvedValue('https://feishu.com/auth');

      // Act
      const result1 = await controller.getAuthorizationUrlForPlatform('feishu', 'http://localhost');
      const result2 = await controller.getAuthorizationUrlForPlatform('FEISHU', 'http://localhost');
      const result3 = await controller.getAuthorizationUrlForPlatform('Feishu', 'http://localhost');

      // Assert
      expect(result1.data.platform).toBe(OAuthPlatform.FEISHU);
      expect(result2.data.platform).toBe(OAuthPlatform.FEISHU);
      expect(result3.data.platform).toBe(OAuthPlatform.FEISHU);
    });

    it('should validate dingtalk platform case-insensitively through endpoint', async () => {
      // Arrange
      mockOAuthService.getAuthorizationUrl.mockResolvedValue('https://dingtalk.com/auth');

      // Act
      const result1 = await controller.getAuthorizationUrlForPlatform('dingtalk', 'http://localhost');
      const result2 = await controller.getAuthorizationUrlForPlatform('DINGTALK', 'http://localhost');
      const result3 = await controller.getAuthorizationUrlForPlatform('DingTalk', 'http://localhost');

      // Assert
      expect(result1.data.platform).toBe(OAuthPlatform.DINGTALK);
      expect(result2.data.platform).toBe(OAuthPlatform.DINGTALK);
      expect(result3.data.platform).toBe(OAuthPlatform.DINGTALK);
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle AppError from service without re-wrapping', async () => {
      // Arrange
      const appError = new AppError(400, 'CUSTOM_ERROR', 'Custom error message');
      mockOAuthService.getAuthorizationUrl.mockRejectedValue(appError);

      // Act & Assert
      await expect(controller.getAuthorizationUrlForPlatform('feishu', 'http://localhost'))
        .rejects.toEqual(appError);
    });

    it('should wrap non-AppError errors', async () => {
      // Arrange
      const genericError = new Error('Generic error');
      mockOAuthService.getAuthorizationUrl.mockRejectedValue(genericError);

      // Act & Assert
      await expect(controller.getAuthorizationUrlForPlatform('feishu', 'http://localhost'))
        .rejects.toMatchObject({
          code: 'AUTH_URL_GENERATION_FAILED'
        });
    });
  });

  describe('Unified Response Format', () => {
    it('should maintain consistent response format across all endpoints', async () => {
      // Arrange
      mockOAuthService.getEnabledPlatforms.mockResolvedValue([
        { platform: OAuthPlatform.FEISHU, enabled: true, isDefault: true }
      ]);
      mockOAuthService.getAuthorizationUrl.mockResolvedValue('https://auth.url');
      mockOAuthService.handleCallback.mockResolvedValue({
        access_token: 'token',
        refresh_token: 'refresh',
        expires_in: 604800,
        token_type: 'Bearer',
        user: { id: 1, feishu_user_id: 'ou_123', name: 'Test' },
        has_instance: false,
        instance_id: null,
        redirect_to: '/no-instance'
      });

      // Act & Assert
      const platformsResult = await controller.getPlatforms();
      expect(platformsResult).toHaveProperty('success');
      expect(platformsResult).toHaveProperty('data');

      const authUrlResult = await controller.getAuthorizationUrlForPlatform('feishu', 'http://localhost');
      expect(authUrlResult).toHaveProperty('success');
      expect(authUrlResult).toHaveProperty('data');

      const callbackResult = await controller.handleCallbackForPlatform('feishu', { code: 'test' });
      expect(callbackResult).toHaveProperty('success');
      expect(callbackResult).toHaveProperty('data');
      expect(callbackResult).toHaveProperty('message');
    });
  });
});
