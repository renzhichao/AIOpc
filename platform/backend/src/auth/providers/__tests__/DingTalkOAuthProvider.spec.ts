/**
 * DingTalkOAuthProvider Unit Tests
 *
 * Comprehensive test suite for DingTalk OAuth provider implementation.
 * Tests all IOAuthProvider interface methods with Mock API responses.
 *
 * @module auth/providers/__tests__/DingTalkOAuthProvider.spec
 */

import { DingTalkOAuthProvider } from '../DingTalkOAuthProvider';
import { OAuthPlatform, OAuthErrorType } from '../../interfaces/OAuthTypes';
import axios from 'axios';

// Mock axios to prevent real API calls
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock console methods to avoid cluttering test output
const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

describe('DingTalkOAuthProvider', () => {
  let provider: DingTalkOAuthProvider;

  // Mock axios instance
  let mockAxiosInstance: any;

  // Test environment variables
  const testEnv = {
    DINGTALK_APP_KEY: 'ding6fgvcdmcdigtazrm',
    DINGTALK_APP_SECRET: 'wRJsPR2nWnLiuYYhAspWsQX_hPQjyrmLRfbuZbV3LEzGqAAGG9Ca1rXKz27bgiSq',
    DINGTALK_OAUTH_AUTHORIZE_URL: 'https://login.dingtalk.com/oauth2/auth',
    DINGTALK_OAUTH_TOKEN_URL: 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken',
    DINGTALK_OAUTH_USERINFO_URL: 'https://api.dingtalk.com/v1.0/contact/users/me',
    OAUTH_REDIRECT_URI: 'https://ciiber.example.com/api/auth/dingtalk/callback',
    OAUTH_ALLOWED_DOMAINS: 'ciiber.example.com,localhost,127.0.0.1'
  };

  beforeAll(() => {
    // Set up test environment variables
    Object.assign(process.env, testEnv);
  });

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock axios instance
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    };

    // Mock axios.create to return our mock instance
    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    // Create provider instance
    provider = new DingTalkOAuthProvider();
  });

  afterAll(() => {
    // Restore console methods
    consoleInfoSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('getPlatform', () => {
    it('should return DINGTALK platform identifier', () => {
      expect(provider.getPlatform()).toBe(OAuthPlatform.DINGTALK);
    });
  });

  describe('getAuthorizationUrl', () => {
    const validRedirectUri = 'https://ciiber.example.com/api/auth/dingtalk/callback';
    const testState = 'test-state-123';

    it('should generate correct DingTalk authorization URL with state', async () => {
      const url = await provider.getAuthorizationUrl(validRedirectUri, testState);

      expect(url).toContain('https://login.dingtalk.com/oauth2/auth');
      expect(url).toContain(`client_id=${testEnv.DINGTALK_APP_KEY}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(validRedirectUri)}`);
      expect(url).toContain('response_type=code');
      expect(url).toContain(`state=${testState}`);
      expect(url).toContain('prompt=consent');
      expect(url).toContain('scope=');
    });

    it('should generate authorization URL without state', async () => {
      const url = await provider.getAuthorizationUrl(validRedirectUri);

      expect(url).toContain('https://login.dingtalk.com/oauth2/auth');
      expect(url).not.toContain('state=');
    });

    it('should include openid corpid scope by default', async () => {
      const url = await provider.getAuthorizationUrl(validRedirectUri, testState);

      expect(url).toContain('scope=openid');
      expect(url).toContain('corpid');
    });

    it('should throw error for invalid redirect URI (protocol)', async () => {
      const invalidUri = 'ftp://example.com/callback';

      await expect(provider.getAuthorizationUrl(invalidUri)).rejects.toThrow();
    });

    it('should throw error for invalid redirect URI (format)', async () => {
      const invalidUri = 'not-a-valid-url';

      await expect(provider.getAuthorizationUrl(invalidUri)).rejects.toThrow();
    });

    it('should accept localhost redirect URI in development', async () => {
      const localhostUri = 'http://localhost:3000/callback';

      const url = await provider.getAuthorizationUrl(localhostUri, testState);

      expect(url).toContain(`redirect_uri=${encodeURIComponent(localhostUri)}`);
    });

    it('should accept 127.0.0.1 redirect URI in development', async () => {
      const localIpUri = 'http://127.0.0.1:3000/callback';

      const url = await provider.getAuthorizationUrl(localIpUri, testState);

      expect(url).toContain(`redirect_uri=${encodeURIComponent(localIpUri)}`);
    });
  });

  describe('exchangeCodeForToken', () => {
    const mockTokenResponse = {
      data: {
        accessToken: 'test-access-token-1234567890',
        tokenType: 'Bearer',
        expiresIn: 7200,
        refreshToken: 'test-refresh-token-0987654321'
      }
    };

    it('should successfully exchange authorization code for token', async () => {
      mockAxiosInstance.post.mockResolvedValue(mockTokenResponse);

      const tokenResponse = await provider.exchangeCodeForToken('test-auth-code');

      expect(tokenResponse.access_token).toBe('test-access-token-1234567890');
      expect(tokenResponse.token_type).toBe('Bearer');
      expect(tokenResponse.expires_in).toBe(7200);
      expect(tokenResponse.refresh_token).toBe('test-refresh-token-0987654321');
      expect(tokenResponse.raw).toBeDefined();

      // Verify API call was made correctly
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        testEnv.DINGTALK_OAUTH_TOKEN_URL,
        {
          clientId: testEnv.DINGTALK_APP_KEY,
          code: 'test-auth-code',
          grantType: 'authorization_code'
        }
      );
    });

    it('should handle token response without refresh token', async () => {
      const mockResponseWithoutRefresh = {
        data: {
          accessToken: 'test-access-token',
          tokenType: 'Bearer',
          expiresIn: 7200
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponseWithoutRefresh);

      const tokenResponse = await provider.exchangeCodeForToken('test-auth-code');

      expect(tokenResponse.access_token).toBe('test-access-token');
      expect(tokenResponse.refresh_token).toBeUndefined();
    });

    it('should throw error when API response is missing accessToken', async () => {
      const mockInvalidResponse = {
        data: {
          tokenType: 'Bearer',
          expiresIn: 7200
          // Missing accessToken
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockInvalidResponse);

      await expect(provider.exchangeCodeForToken('test-auth-code')).rejects.toThrow();
    });

    it('should handle API error response', async () => {
      const mockErrorResponse = {
        response: {
          data: {
            code: 'invalid_grant',
            message: 'Authorization code is invalid or expired'
          }
        }
      };

      mockAxiosInstance.post.mockRejectedValue(mockErrorResponse);

      await expect(provider.exchangeCodeForToken('invalid-code')).rejects.toThrow();
    });

    it('should handle network timeout error', async () => {
      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout of 10000ms exceeded'
      };

      mockAxiosInstance.post.mockRejectedValue(timeoutError);

      await expect(provider.exchangeCodeForToken('test-code')).rejects.toThrow();
    });

    it('should handle invalid_client error (config error)', async () => {
      const mockErrorResponse = {
        response: {
          data: {
            code: 'invalid_client',
            message: 'AppKey or AppSecret is invalid'
          }
        }
      };

      mockAxiosInstance.post.mockRejectedValue(mockErrorResponse);

      await expect(provider.exchangeCodeForToken('test-code')).rejects.toThrow();
    });
  });

  describe('getUserInfo', () => {
    const mockUserInfoResponse = {
      data: {
        data: {
          unionId: 'test-union-id-123',
          userId: 'test-user-id-456',
          name: '测试用户',
          avatarUrl: 'https://example.com/avatar.jpg',
          stateCode: '1',
          email: 'test@example.com',
          mobile: '13800138000'
        }
      }
    };

    it('should successfully retrieve user information', async () => {
      mockAxiosInstance.get.mockResolvedValue(mockUserInfoResponse);

      const userProfile = await provider.getUserInfo('test-access-token');

      expect(userProfile.platform).toBe(OAuthPlatform.DINGTALK);
      expect(userProfile.user_id).toBe('test-user-id-456');
      expect(userProfile.union_id).toBe('test-union-id-123');
      expect(userProfile.name).toBe('测试用户');
      expect(userProfile.avatar_url).toBe('https://example.com/avatar.jpg');
      expect(userProfile.email).toBe('test@example.com');
      expect(userProfile.mobile).toBe('13800138000');
      expect(userProfile.raw).toBeDefined();

      // Verify API call was made correctly
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        testEnv.DINGTALK_OAUTH_USERINFO_URL,
        {
          headers: {
            'x-acs-dingtalk-access-token': 'test-access-token'
          }
        }
      );
    });

    it('should handle user info without optional fields', async () => {
      const mockMinimalUserInfo = {
        data: {
          data: {
            unionId: 'test-union-id',
            userId: 'test-user-id',
            name: 'Minimal User',
            avatarUrl: 'https://example.com/avatar.jpg',
            stateCode: '1'
            // No email, mobile
          }
        }
      };

      mockAxiosInstance.get.mockResolvedValue(mockMinimalUserInfo);

      const userProfile = await provider.getUserInfo('test-access-token');

      expect(userProfile.user_id).toBe('test-user-id');
      expect(userProfile.name).toBe('Minimal User');
      expect(userProfile.email).toBeUndefined();
      expect(userProfile.mobile).toBeUndefined();
    });

    it('should throw error when response missing required fields', async () => {
      const mockInvalidResponse = {
        data: {
          data: {
            name: 'Test User'
            // Missing unionId and userId
          }
        }
      };

      mockAxiosInstance.get.mockResolvedValue(mockInvalidResponse);

      await expect(provider.getUserInfo('test-token')).rejects.toThrow();
    });

    it('should handle expired token error', async () => {
      const mockErrorResponse = {
        response: {
          data: {
            code: 'invalid_token',
            message: 'Token is expired'
          }
        }
      };

      mockAxiosInstance.get.mockRejectedValue(mockErrorResponse);

      await expect(provider.getUserInfo('expired-token')).rejects.toThrow();
    });

    it('should handle permission_denied error', async () => {
      const mockErrorResponse = {
        response: {
          data: {
            code: 'permission_denied',
            message: 'No permission to access user info'
          }
        }
      };

      mockAxiosInstance.get.mockRejectedValue(mockErrorResponse);

      await expect(provider.getUserInfo('test-token')).rejects.toThrow();
    });
  });

  describe('validateToken', () => {
    it('should return true for valid token', async () => {
      const mockUserInfoResponse = {
        data: {
          data: {
            unionId: 'test-union-id',
            userId: 'test-user-id',
            name: 'Test User',
            avatarUrl: 'https://example.com/avatar.jpg',
            stateCode: '1'
          }
        }
      };

      mockAxiosInstance.get.mockResolvedValue(mockUserInfoResponse);

      const isValid = await provider.validateToken('valid-token');

      expect(isValid).toBe(true);
    });

    it('should return false for expired token', async () => {
      const mockErrorResponse = {
        response: {
          data: {
            code: 'invalid_token',
            message: 'Token is expired'
          }
        }
      };

      mockAxiosInstance.get.mockRejectedValue(mockErrorResponse);

      const isValid = await provider.validateToken('expired-token');

      expect(isValid).toBe(false);
    });

    it('should return false for invalid token', async () => {
      const mockErrorResponse = {
        response: {
          data: {
            code: 'invalid_grant',
            message: 'Invalid token'
          }
        }
      };

      mockAxiosInstance.get.mockRejectedValue(mockErrorResponse);

      const isValid = await provider.validateToken('invalid-token');

      expect(isValid).toBe(false);
    });

    it('should return false on network error', async () => {
      const networkError = {
        code: 'ECONNABORTED',
        message: 'Network timeout'
      };

      mockAxiosInstance.get.mockRejectedValue(networkError);

      const isValid = await provider.validateToken('test-token');

      expect(isValid).toBe(false);
    });
  });

  describe('refreshAccessToken', () => {
    const mockRefreshResponse = {
      data: {
        accessToken: 'new-access-token-1234567890',
        tokenType: 'Bearer',
        expiresIn: 7200
      }
    };

    it('should successfully refresh access token', async () => {
      mockAxiosInstance.post.mockResolvedValue(mockRefreshResponse);

      const newAccessToken = await provider.refreshAccessToken('valid-refresh-token');

      expect(newAccessToken).toBe('new-access-token-1234567890');

      // Verify API call was made correctly
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        testEnv.DINGTALK_OAUTH_TOKEN_URL,
        expect.objectContaining({
          clientId: testEnv.DINGTALK_APP_KEY,
          grantType: 'authorization_code',
          refreshToken: 'valid-refresh-token'
        })
      );
    });

    it('should throw error when refresh token is expired', async () => {
      const mockErrorResponse = {
        response: {
          data: {
            code: 'invalid_token',
            message: 'Refresh token is expired'
          }
        }
      };

      mockAxiosInstance.post.mockRejectedValue(mockErrorResponse);

      await expect(provider.refreshAccessToken('expired-refresh-token')).rejects.toThrow();
    });

    it('should throw error when response missing accessToken', async () => {
      const mockInvalidResponse = {
        data: {
          tokenType: 'Bearer',
          expiresIn: 7200
          // Missing accessToken
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockInvalidResponse);

      await expect(provider.refreshAccessToken('test-refresh-token')).rejects.toThrow();
    });

    it('should handle service_unavailable error', async () => {
      const mockErrorResponse = {
        response: {
          data: {
            code: 'service_unavailable',
            message: 'DingTalk service is temporarily unavailable'
          }
        }
      };

      mockAxiosInstance.post.mockRejectedValue(mockErrorResponse);

      await expect(provider.refreshAccessToken('test-refresh-token')).rejects.toThrow();
    });
  });

  describe('getErrorHandler', () => {
    it('should return DingTalkErrorHandler instance', () => {
      const errorHandler = provider.getErrorHandler();

      expect(errorHandler).toBeDefined();
      expect(errorHandler.constructor.name).toBe('DingTalkErrorHandler');
      expect(errorHandler.parseError).toBeInstanceOf(Function);
      expect(errorHandler.getUserMessage).toBeInstanceOf(Function);
      expect(errorHandler.isRetryable).toBeInstanceOf(Function);
    });
  });

  describe('validateConfig', () => {
    it('should pass validation with all required config', () => {
      expect(() => {
        provider.validateConfig();
      }).not.toThrow();
    });

    it('should throw error when APP_KEY is missing', () => {
      delete process.env.DINGTALK_APP_KEY;

      expect(() => {
        new DingTalkOAuthProvider();
      }).toThrow();

      // Restore environment variable
      process.env.DINGTALK_APP_KEY = testEnv.DINGTALK_APP_KEY;
    });

    it('should throw error when APP_SECRET is missing', () => {
      delete process.env.DINGTALK_APP_SECRET;

      expect(() => {
        new DingTalkOAuthProvider();
      }).toThrow();

      // Restore environment variable
      process.env.DINGTALK_APP_SECRET = testEnv.DINGTALK_APP_SECRET;
    });
  });

  describe('Error Handling Integration', () => {
    it('should map DingTalk error codes to OAuthErrorType correctly', () => {
      const errorHandler = provider.getErrorHandler();

      // Test error code mapping
      const testCases = [
        { code: 'invalid_client', expectedType: OAuthErrorType.CONFIG_MISSING },
        { code: 'invalid_grant', expectedType: OAuthErrorType.INVALID_CODE },
        { code: 'invalid_token', expectedType: OAuthErrorType.EXPIRED_TOKEN },
        { code: 'user_not_found', expectedType: OAuthErrorType.USER_INFO_FAILED },
        { code: 'rate_limit_exceeded', expectedType: OAuthErrorType.PLATFORM_ERROR },
        { code: 'timeout', expectedType: OAuthErrorType.NETWORK_ERROR }
      ];

      testCases.forEach(({ code, expectedType }) => {
        const mockError = {
          response: {
            data: {
              code: code,
              message: 'Test error message'
            }
          }
        };

        const oauthError = errorHandler.parseError(mockError);

        expect(oauthError.type).toBe(expectedType);
        expect(oauthError.platform).toBe(OAuthPlatform.DINGTALK);
        expect(oauthError.code).toBe(code);
      });
    });

    it('should provide user-friendly messages in Chinese', () => {
      const errorHandler = provider.getErrorHandler();

      const testCases = [
        { type: OAuthErrorType.CONFIG_MISSING, expectedMessage: '钉钉应用配置错误' },
        { type: OAuthErrorType.INVALID_CODE, expectedMessage: '授权码无效或已过期' },
        { type: OAuthErrorType.EXPIRED_TOKEN, expectedMessage: '钉钉访问令牌已过期' },
        { type: OAuthErrorType.NETWORK_ERROR, expectedMessage: '网络连接失败' }
      ];

      testCases.forEach(({ type, expectedMessage }) => {
        const message = errorHandler.getUserMessage(type);
        expect(message).toContain(expectedMessage);
      });
    });

    it('should determine retryable errors correctly', () => {
      const errorHandler = provider.getErrorHandler();

      expect(errorHandler.isRetryable(OAuthErrorType.NETWORK_ERROR)).toBe(true);
      expect(errorHandler.isRetryable(OAuthErrorType.PLATFORM_ERROR)).toBe(true);
      expect(errorHandler.isRetryable(OAuthErrorType.INVALID_CODE)).toBe(false);
      expect(errorHandler.isRetryable(OAuthErrorType.CONFIG_MISSING)).toBe(false);
    });
  });

  describe('Sensitive Data Sanitization', () => {
    it('should not log appSecret in initialization', () => {
      // Provider is already initialized in beforeEach
      const logCalls = consoleInfoSpy.mock.calls;
      const logStrings = JSON.stringify(logCalls);

      expect(logStrings).not.toContain(testEnv.DINGTALK_APP_SECRET);
    });
  });
});
