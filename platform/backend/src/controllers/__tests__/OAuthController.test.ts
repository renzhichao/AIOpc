import 'reflect-metadata';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Container } from 'typedi';
import { OAuthController } from '../OAuthController';
import { OAuthService } from '../services/OAuthService';

// Mock OAuthService
jest.mock('../services/OAuthService');

// Mock logger
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('OAuthController', () => {
  let oauthController: OAuthController;
  let mockOAuthService: jest.Mocked<OAuthService>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Reset container
    Container.reset();

    // Create mock service
    mockOAuthService = {
      getAuthorizationUrl: jest.fn(),
      handleCallback: jest.fn(),
      refreshToken: jest.fn(),
      verifyToken: jest.fn(),
    } as any;

    // Set service in container
    Container.set('OAuthService', mockOAuthService);

    // Create controller instance
    oauthController = new OAuthController(mockOAuthService);
  });

  describe('getAuthorizationUrl', () => {
    it('should return authorization URL successfully', async () => {
      const mockUrl = 'https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=test';
      mockOAuthService.getAuthorizationUrl.mockReturnValue(mockUrl);

      const result = await oauthController.getAuthorizationUrl();

      expect(result).toEqual({ url: mockUrl });
      expect(mockOAuthService.getAuthorizationUrl).toHaveBeenCalledWith({});
    });

    it('should return authorization URL with custom redirect_uri', async () => {
      const mockUrl = 'https://open.feishu.cn/open-apis/authen/v1/authorize?redirect_uri=custom';
      const customRedirectUri = 'https://example.com/callback';
      mockOAuthService.getAuthorizationUrl.mockReturnValue(mockUrl);

      const result = await oauthController.getAuthorizationUrl(customRedirectUri);

      expect(result).toEqual({ url: mockUrl });
      expect(mockOAuthService.getAuthorizationUrl).toHaveBeenCalledWith({
        redirect_uri: customRedirectUri,
      });
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Service unavailable');
      mockOAuthService.getAuthorizationUrl.mockImplementation(() => {
        throw error;
      });

      const result = await oauthController.getAuthorizationUrl();

      expect(result).toEqual({ error: 'Failed to generate authorization URL' });
    });
  });

  describe('handleCallback', () => {
    it('should handle OAuth callback successfully', async () => {
      const mockAuthCode = 'test_auth_code';
      const mockTokens = {
        access_token: 'access_token_123',
        refresh_token: 'refresh_token_123',
        expires_in: 3600,
      };

      mockOAuthService.handleCallback.mockResolvedValue(mockTokens);

      const result = await oauthController.handleCallback({ code: mockAuthCode });

      expect(result).toEqual(mockTokens);
      expect(mockOAuthService.handleCallback).toHaveBeenCalledWith(mockAuthCode);
    });

    it('should return error when auth code is missing', async () => {
      const result = await oauthController.handleCallback({});

      expect(result).toEqual({ error: 'Authorization code is required' });
      expect(mockOAuthService.handleCallback).not.toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', async () => {
      const error = new Error('Invalid authorization code');
      mockOAuthService.handleCallback.mockRejectedValue(error);

      const result = await oauthController.handleCallback({ code: 'invalid_code' });

      expect(result).toEqual({ error: 'OAuth callback failed' });
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const mockRefreshToken = 'refresh_token_123';
      const mockNewTokens = {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expires_in: 3600,
      };

      mockOAuthService.refreshToken.mockResolvedValue(mockNewTokens);

      const result = await oauthController.refreshToken({
        refresh_token: mockRefreshToken,
      });

      expect(result).toEqual(mockNewTokens);
      expect(mockOAuthService.refreshToken).toHaveBeenCalledWith(mockRefreshToken);
    });

    it('should return error when refresh token is missing', async () => {
      const result = await oauthController.refreshToken({});

      expect(result).toEqual({ error: 'Refresh token is required' });
      expect(mockOAuthService.refreshToken).not.toHaveBeenCalled();
    });

    it('should handle refresh errors gracefully', async () => {
      const error = new Error('Invalid refresh token');
      mockOAuthService.refreshToken.mockRejectedValue(error);

      const result = await oauthController.refreshToken({
        refresh_token: 'invalid_token',
      });

      expect(result).toEqual({ error: 'Invalid refresh token' });
    });
  });

  describe('verifyToken', () => {
    it('should verify token successfully', async () => {
      const mockToken = 'valid_token_123';
      const mockPayload = {
        user_id: 'user_123',
        feishu_user_id: 'feishu_123',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      mockOAuthService.verifyToken.mockReturnValue(mockPayload);

      const result = await oauthController.verifyToken({ token: mockToken });

      expect(result).toEqual({
        valid: true,
        payload: mockPayload,
      });
      expect(mockOAuthService.verifyToken).toHaveBeenCalledWith(mockToken);
    });

    it('should return error when token is missing', async () => {
      const result = await oauthController.verifyToken({});

      expect(result).toEqual({ error: 'Token is required' });
      expect(mockOAuthService.verifyToken).not.toHaveBeenCalled();
    });

    it('should handle verification errors gracefully', async () => {
      const error = new Error('Invalid token');
      mockOAuthService.verifyToken.mockImplementation(() => {
        throw error;
      });

      const result = await oauthController.verifyToken({ token: 'invalid_token' });

      expect(result).toEqual({
        valid: false,
        error: 'Invalid token',
      });
    });
  });
});
