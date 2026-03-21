/**
 * Feishu OAuth Provider
 *
 * Implements OAuth 2.0 flow for Feishu (飞书) platform.
 * Provides authorization, token exchange, and user info retrieval.
 *
 * Documentation: https://open.feishu.cn/document/common-capabilities/sso/api/get-user-info
 *
 * @module auth/providers/FeishuOAuthProvider
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type { IOAuthProvider } from '../interfaces/IOAuthProvider';
import type {
  UserProfile,
  TokenResponse
} from '../interfaces/OAuthTypes';
import {
  OAuthPlatform,
  OAuthError,
  OAuthErrorType
} from '../interfaces/OAuthTypes';
import { BaseOAuthProvider } from '../BaseOAuthProvider';
import { logger } from '../../config/logger';

/**
 * Feishu OAuth configuration interface
 */
interface FeishuOAuthConfig {
  appId: string;
  appSecret: string;
  encryptKey: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  redirectUri: string;
  apiBaseUrl: string;
}

/**
 * Feishu token request interface
 */
interface FeishuTokenRequest {
  grant_type: 'authorization_code';
  app_id: string;
  app_secret: string;
  code: string;
}

/**
 * Feishu token response interface
 */
interface FeishuTokenResponse {
  code: number;
  msg: string;
  data?: {
    access_token: string;
    token_type?: string;
    expires_in: number;
    refresh_token?: string;
    // Feishu returns user info directly in token response
    open_id: string;
    union_id?: string;
    name: string;
    en_name?: string;
    email?: string;
    avatar_url?: string;
  };
}

/**
 * Feishu user info interface
 */
interface FeishuUserInfo {
  open_id: string;
  union_id?: string;
  name: string;
  en_name?: string;
  email?: string;
  avatar_url?: string;
}

/**
 * Default Feishu OAuth configuration
 */
const DEFAULT_FEISHU_CONFIG: FeishuOAuthConfig = {
  appId: '',
  appSecret: '',
  encryptKey: '',
  authorizeUrl: 'https://open.feishu.cn/open-apis/authen/v1/authorize',
  tokenUrl: 'https://open.feishu.cn/open-apis/authen/v1/access_token',
  userInfoUrl: 'https://open.feishu.cn/open-apis/authen/v1/user_info',
  redirectUri: '',
  apiBaseUrl: 'https://open.feishu.cn'
};

/**
 * Feishu OAuth Provider Implementation
 *
 * Implements the complete OAuth 2.0 flow for Feishu platform.
 *
 * Key Features:
 * - Authorization URL generation with state parameter
 * - Authorization code to access token exchange
 * - User info retrieval with standardized profile
 * - Token validation and refresh
 * - Comprehensive error handling
 * - Sensitive data sanitization in logs
 *
 * @class
 * @extends BaseOAuthProvider
 * @implements IOAuthProvider
 */
export class FeishuOAuthProvider extends BaseOAuthProvider implements IOAuthProvider {
  private readonly axiosInstance: AxiosInstance;
  private readonly config: FeishuOAuthConfig;
  private readonly PLATFORM = OAuthPlatform.FEISHU;

  /**
   * Error code mapping for Feishu API
   */
  private static readonly ERROR_MAP = new Map<number, OAuthErrorType>([
    [99991663, OAuthErrorType.INVALID_CODE],
    [99991401, OAuthErrorType.EXPIRED_TOKEN],
    [99991402, OAuthErrorType.CONFIG_MISSING],
    [99991400, OAuthErrorType.PLATFORM_ERROR]
  ]);

  /**
   * Create a new FeishuOAuthProvider instance
   *
   * Initializes configuration, HTTP client, and validates setup.
   *
   * @throws {OAuthError} If required configuration is missing
   */
  constructor() {
    super();

    // Load configuration from environment
    this.config = this.loadConfig();

    // Validate configuration
    this.validateConfig();

    // Create Axios instance for HTTP requests
    this.axiosInstance = this.createAxiosInstance();

    // Log initialization (without sensitive data)
    logger.info('[FeishuOAuth] Provider initialized', {
      platform: this.PLATFORM,
      appId: this.config.appId,
      authorizeUrl: this.config.authorizeUrl,
      tokenUrl: this.config.tokenUrl
    });
  }

  /**
   * Get the platform identifier
   *
   * @returns Platform identifier ('feishu')
   */
  getPlatformType(): OAuthPlatform {
    return this.PLATFORM;
  }

  // Alias for compatibility with BaseOAuthProvider
  getPlatform(): OAuthPlatform {
    return this.PLATFORM;
  }

  /**
   * Generate Feishu OAuth authorization URL
   *
   * Creates the complete URL for redirecting users to Feishu's authorization page.
   * Includes all required query parameters.
   *
   * Implements both IOAuthProvider and BaseOAuthProvider interfaces.
   *
   * @param redirectUri - The URI where Feishu should redirect after authorization
   * @param state - Opaque state parameter for CSRF protection
   * @returns Complete authorization URL ready for user redirect
   * @throws {OAuthError} If configuration is missing or redirectUri is invalid
   */
  async getAuthorizationUrl(redirectUri: string, state?: string): Promise<string> {
    // Validate redirect URI
    if (!this.isValidRedirectUri(redirectUri)) {
      throw new OAuthError(
        OAuthErrorType.INVALID_REDIRECT_URI,
        this.PLATFORM,
        `Invalid redirect URI: ${this.sanitizeUrlForLogging(redirectUri)}`
      );
    }

    // Build query parameters
    const params = new URLSearchParams({
      app_id: this.config.appId,
      redirect_uri: redirectUri,
      scope: 'contact:user.base:readonly',
      state: state || this.generateState()
    });

    // Build complete URL
    const url = `${this.config.authorizeUrl}?${params.toString()}`;

    logger.info('[FeishuOAuth] Generated authorization URL', {
      state: state ? '***' : 'none',
      redirectUri: this.sanitizeUrlForLogging(redirectUri)
    });

    return url;
  }

  /**
   * Exchange authorization code for user info
   *
   * Combined method that exchanges code for token and retrieves user info.
   * Feishu returns user info directly in the token response.
   * Required by BaseOAuthProvider abstract class.
   *
   * @param code - Authorization code from OAuth callback
   * @returns Standardized user profile
   */
  async exchangeCodeForUserInfo(code: string): Promise<UserProfile> {
    const tokenResponse = await this.exchangeCodeForToken(code);

    // Feishu returns user info directly in token response
    if (!tokenResponse.raw?.open_id) {
      throw new OAuthError(
        OAuthErrorType.USER_INFO_FAILED,
        this.PLATFORM,
        'Token response missing user information'
      );
    }

    return this.mapToUserProfile(tokenResponse.raw as any);
  }

  /**
   * Exchange authorization code for access token
   *
   * After user approves authorization, Feishu redirects back with
   * an authorization code. This method exchanges that code for an access token.
   *
   * Note: Feishu's token endpoint returns user info directly in the response,
   * so we extract and return it in the raw field.
   *
   * @param code - Authorization code received from OAuth callback
   * @returns Token response containing access_token and user info in raw field
   * @throws {OAuthError} With type TOKEN_EXCHANGE_FAILED if exchange fails
   * @throws {OAuthError} With type INVALID_CODE if code is invalid or expired
   */
  async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    try {
      // Build request body
      const requestBody: FeishuTokenRequest = {
        grant_type: 'authorization_code',
        app_id: this.config.appId,
        app_secret: this.config.appSecret,
        code: code
      };

      logger.info('[FeishuOAuth] Exchanging code for token', {
        codeLength: code.length,
        code: code.substring(0, 4) + '***' // Only show first 4 chars
      });

      // Make POST request to Feishu token endpoint
      const response = await this.axiosInstance.post<FeishuTokenResponse>(
        this.config.tokenUrl,
        requestBody
      );

      // Extract response data
      const responseData = response.data;

      // Check for Feishu API error
      if (responseData.code !== 0) {
        throw this.mapPlatformError(responseData);
      }

      // Validate response contains user data
      if (!responseData.data || !responseData.data.access_token) {
        throw new OAuthError(
          OAuthErrorType.TOKEN_EXCHANGE_FAILED,
          this.PLATFORM,
          'Token response missing access_token'
        );
      }

      // Build standardized token response
      const tokenResponse: TokenResponse = {
        access_token: responseData.data.access_token,
        token_type: responseData.data.token_type || 'Bearer',
        expires_in: responseData.data.expires_in,
        refresh_token: responseData.data.refresh_token,
        raw: responseData.data // Feishu returns user info here
      };

      logger.info('[FeishuOAuth] Token exchange successful', {
        tokenType: tokenResponse.token_type,
        expiresIn: tokenResponse.expires_in,
        hasRefreshToken: !!tokenResponse.refresh_token,
        hasUserInfo: !!responseData.data.open_id
      });

      return tokenResponse;
    } catch (error) {
      // Handle error
      if (error instanceof OAuthError) {
        logger.error('[FeishuOAuth] Token exchange failed', {
          errorType: error.type,
          message: error.message
        });
        throw error;
      }

      // Unknown error
      logger.error('[FeishuOAuth] Token exchange failed with unknown error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new OAuthError(
        OAuthErrorType.TOKEN_EXCHANGE_FAILED,
        this.PLATFORM,
        'Failed to exchange authorization code',
        error
      );
    }
  }

  /**
   * Get user information using access token
   *
   * Retrieves user profile from Feishu API using provided access token.
   * Returns standardized UserProfile format.
   *
   * Note: In Feishu's case, user info is already returned in the token response,
   * so this method makes a separate API call to the user info endpoint.
   *
   * @param accessToken - Valid access token from token exchange
   * @returns Standardized user profile with id, name, email, avatar, etc.
   * @throws {OAuthError} With type USER_INFO_FAILED if retrieval fails
   * @throws {OAuthError} With type EXPIRED_TOKEN if access token is expired
   */
  async getUserInfo(accessToken: string): Promise<UserProfile> {
    try {
      logger.info('[FeishuOAuth] Fetching user info', {
        tokenLength: accessToken.length,
        token: accessToken.substring(0, 4) + '***' // Only show first 4 chars
      });

      // Make GET request to Feishu user info endpoint
      const response = await this.axiosInstance.get<{ data: FeishuUserInfo }>(
        this.config.userInfoUrl || DEFAULT_FEISHU_CONFIG.userInfoUrl!,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      // Extract user data from response
      const feishuUserInfo = response.data.data;

      // Validate response
      if (!feishuUserInfo || !feishuUserInfo.open_id) {
        throw new OAuthError(
          OAuthErrorType.USER_INFO_FAILED,
          this.PLATFORM,
          'User info response missing required fields'
        );
      }

      // Build standardized user profile
      const userProfile = this.mapToUserProfile(feishuUserInfo);

      logger.info('[FeishuOAuth] User info retrieved successfully', {
        userId: userProfile.user_id,
        unionId: userProfile.union_id,
        name: userProfile.name
      });

      return userProfile;
    } catch (error) {
      // Handle error
      if (error instanceof OAuthError) {
        logger.error('[FeishuOAuth] User info retrieval failed', {
          errorType: error.type,
          message: error.message
        });
        throw error;
      }

      // Unknown error
      logger.error('[FeishuOAuth] User info retrieval failed with unknown error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new OAuthError(
        OAuthErrorType.USER_INFO_FAILED,
        this.PLATFORM,
        'Failed to fetch user information',
        error
      );
    }
  }

  /**
   * Validate access token validity
   *
   * Checks if the provided access token is still valid and can be used
   * for API calls. Makes a lightweight API call to verify.
   *
   * @param accessToken - Access token to validate
   * @returns true if token is valid, false otherwise
   */
  async validateToken(accessToken: string): Promise<boolean> {
    try {
      // Attempt to fetch user info as a validation check
      await this.getUserInfo(accessToken);
      return true;
    } catch (error) {
      // If error is expired token, return false
      if (error instanceof OAuthError && error.type === OAuthErrorType.EXPIRED_TOKEN) {
        return false;
      }
      // Other errors (network, etc.) don't necessarily mean token is invalid
      return false;
    }
  }

  /**
   * Refresh access token using refresh token
   *
   * Obtains a new access token using the refresh token without requiring
   * user interaction.
   *
   * @param refreshToken - Refresh token from initial token response
   * @returns New access token
   * @throws {OAuthError} With type PLATFORM_ERROR if refresh fails
   * @throws {OAuthError} With type EXPIRED_TOKEN if refresh token is expired
   */
  async refreshAccessToken(refreshToken: string): Promise<string> {
    try {
      logger.info('[FeishuOAuth] Refreshing access token', {
        tokenLength: refreshToken.length,
        token: refreshToken.substring(0, 4) + '***' // Only show first 4 chars
      });

      // Feishu uses same endpoint for refresh with different grant_type
      const response = await this.axiosInstance.post<any>(
        'https://open.feishu.cn/open-apis/authen/v1/refresh_access_token',
        {
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }
      );

      if (response.data.code !== 0) {
        throw this.mapPlatformError(response.data);
      }

      const newAccessToken = response.data.data.access_token;

      logger.info('[FeishuOAuth] Token refresh successful');

      return newAccessToken;
    } catch (error) {
      if (error instanceof OAuthError) {
        logger.error('[FeishuOAuth] Token refresh failed', {
          errorType: error.type,
          message: error.message
        });
        throw error;
      }

      logger.error('[FeishuOAuth] Token refresh failed with unknown error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new OAuthError(
        OAuthErrorType.PLATFORM_ERROR,
        this.PLATFORM,
        'Failed to refresh access token',
        error
      );
    }
  }

  /**
   * Get platform-specific error handler
   *
   * @returns Error handler implementation for Feishu platform
   */
  getErrorHandler(): any {
    return {
      parseError: (error: any) => this.parseError(error),
      getUserMessage: (errorType: OAuthErrorType) => {
        const userMessages: Record<OAuthErrorType, string> = {
          [OAuthErrorType.CONFIG_MISSING]: '飞书配置缺失，请联系管理员',
          [OAuthErrorType.TOKEN_EXCHANGE_FAILED]: '飞书授权失败，请重试',
          [OAuthErrorType.USER_INFO_FAILED]: '获取飞书用户信息失败',
          [OAuthErrorType.INVALID_CODE]: '授权码无效',
          [OAuthErrorType.EXPIRED_TOKEN]: '授权已过期',
          [OAuthErrorType.INVALID_STATE]: '安全验证失败',
          [OAuthErrorType.PLATFORM_ERROR]: '飞书服务暂时不可用',
          [OAuthErrorType.INVALID_REDIRECT_URI]: '回调地址配置错误',
          [OAuthErrorType.NETWORK_ERROR]: '网络连接失败'
        };
        return userMessages[errorType] || '未知错误';
      },
      isRetryable: (errorType: OAuthErrorType) => {
        return [
          OAuthErrorType.NETWORK_ERROR,
          OAuthErrorType.PLATFORM_ERROR
        ].includes(errorType);
      }
    };
  }

  /**
   * Validate configuration completeness
   *
   * Ensures all required configuration fields are present.
   *
   * @throws {OAuthError} If required configuration is missing
   */
  validateConfig(): void {
    const requiredFields: (keyof FeishuOAuthConfig)[] = [
      'appId',
      'appSecret',
      'authorizeUrl',
      'tokenUrl',
      'redirectUri'
    ];

    const missing = requiredFields.filter((field) => !this.config[field]);

    if (missing.length > 0) {
      throw new OAuthError(
        OAuthErrorType.CONFIG_MISSING,
        this.PLATFORM,
        `Missing Feishu configuration: ${missing.join(', ')}`
      );
    }
  }

  /**
   * Load configuration from environment variables
   *
   * Reads Feishu OAuth configuration from environment variables.
   * Uses defaults where applicable.
   *
   * @private
   * @returns Feishu OAuth configuration
   */
  private loadConfig(): FeishuOAuthConfig {
    return {
      appId: process.env.FEISHU_APP_ID || '',
      appSecret: process.env.FEISHU_APP_SECRET || '',
      encryptKey: process.env.FEISHU_ENCRYPT_KEY || '',
      authorizeUrl: process.env.FEISHU_OAUTH_AUTHORIZE_URL || DEFAULT_FEISHU_CONFIG.authorizeUrl,
      tokenUrl: process.env.FEISHU_OAUTH_TOKEN_URL || DEFAULT_FEISHU_CONFIG.tokenUrl,
      userInfoUrl: process.env.FEISHU_USER_INFO_URL || DEFAULT_FEISHU_CONFIG.userInfoUrl,
      redirectUri: process.env.FEISHU_REDIRECT_URI || process.env.OAUTH_REDIRECT_URI || '',
      apiBaseUrl: process.env.FEISHU_API_BASE_URL || DEFAULT_FEISHU_CONFIG.apiBaseUrl
    };
  }

  /**
   * Create configured Axios instance for HTTP requests
   *
   * @private
   * @returns Configured Axios instance
   */
  private createAxiosInstance(): AxiosInstance {
    const instance = axios.create({
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add request interceptor for logging
    instance.interceptors.request.use(
      (config) => {
        logger.debug('[FeishuOAuth] API request', {
          method: config.method?.toUpperCase(),
          url: config.url || ''
        });
        return config;
      },
      (error) => {
        logger.error('[FeishuOAuth] Request interceptor error', {
          message: error.message
        });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for unified error handling
    instance.interceptors.response.use(
      (response) => {
        logger.debug('[FeishuOAuth] API response', {
          status: response.status,
          url: response.config.url || ''
        });
        return response;
      },
      (error: AxiosError) => {
        logger.error('[FeishuOAuth] API request failed', {
          url: error.config?.url || '',
          status: error.response?.status,
          message: error.message
        });
        return Promise.reject(error);
      }
    );

    return instance;
  }

  /**
   * Map Feishu user data to standardized UserProfile
   *
   * @private
   * @param data - Feishu user info response
   * @returns Standardized user profile
   */
  private mapToUserProfile(data: FeishuUserInfo): UserProfile {
    return {
      platform: this.PLATFORM,
      user_id: data.open_id,
      union_id: data.union_id,
      name: data.name,
      en_name: data.en_name,
      email: data.email,
      avatar_url: data.avatar_url,
      raw: { ...data } // Preserve raw response for debugging
    };
  }

  /**
   * Map Feishu API error to standard OAuthError
   *
   * @private
   * @param response - Feishu API error response
   * @returns Standardized OAuthError
   */
  private mapPlatformError(response: { code: number; msg: string }): OAuthError {
    const errorType = FeishuOAuthProvider.ERROR_MAP.get(response.code) ||
                     OAuthErrorType.PLATFORM_ERROR;

    return new OAuthError(
      errorType,
      this.PLATFORM,
      `Feishu API error: ${response.msg}`,
      { code: response.code, msg: response.msg }
    );
  }

  /**
   * Parse error into standard OAuthError
   *
   * @private
   * @param error - Raw error
   * @returns Standardized OAuthError
   */
  private parseError(error: any): OAuthError {
    if (error instanceof OAuthError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      return new OAuthError(
        OAuthErrorType.NETWORK_ERROR,
        this.PLATFORM,
        'Network request failed',
        error
      );
    }

    return new OAuthError(
      OAuthErrorType.PLATFORM_ERROR,
      this.PLATFORM,
      error?.message || 'Unknown error',
      error
    );
  }

  /**
   * Generate random state parameter
   *
   * @private
   * @returns Random state string
   */
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Sanitize URL for safe logging
   *
   * Removes sensitive query parameters from URL before logging.
   *
   * @private
   * @param url - URL to sanitize
   * @returns Sanitized URL safe for logging
   */
  private sanitizeUrlForLogging(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove all query parameters
      urlObj.search = '';
      return urlObj.toString();
    } catch {
      // If parsing fails, return only protocol and host if possible
      const match = url.match(/^(https?:\/\/[^\/]+)/);
      return match ? match[1] : '[sanitized url]';
    }
  }
}
