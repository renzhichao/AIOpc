/**
 * DingTalk OAuth Provider
 *
 * Implements OAuth 2.0 flow for DingTalk (钉钉) platform.
 * Provides authorization, token exchange, user info retrieval, and token refresh.
 *
 * Documentation: https://open.dingtalk.com/document/orgapp-server/obtain-user-token
 *
 * @module auth/providers/DingTalkOAuthProvider
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
import {
  DingTalkOAuthConfig,
  DingTalkTokenRequest,
  DingTalkTokenResponse,
  DingTalkUserInfo,
  DEFAULT_DINGTALK_CONFIG
} from './DingTalkOAuthConfig';
import { DingTalkErrorHandler } from './DingTalkErrorHandler';
import { BaseOAuthProvider } from '../BaseOAuthProvider';

/**
 * DingTalk OAuth Provider Implementation
 *
 * Implements the complete OAuth 2.0 flow for DingTalk platform.
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
export class DingTalkOAuthProvider extends BaseOAuthProvider implements IOAuthProvider {
  private readonly axiosInstance: AxiosInstance;
  private readonly config: DingTalkOAuthConfig;
  private readonly errorHandler: DingTalkErrorHandler;
  private readonly PLATFORM = OAuthPlatform.DINGTALK;

  /**
   * Create a new DingTalkOAuthProvider instance
   *
   * Initializes configuration, HTTP client, and error handler.
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

    // Initialize error handler
    this.errorHandler = new DingTalkErrorHandler();

    // Log initialization (without sensitive data)
    console.info('[DingTalkOAuth] Provider initialized', {
      platform: this.PLATFORM,
      appKey: this.config.appKey.substring(0, 8) + '...', // Only show first 8 chars
      authorizeUrl: this.config.authorizeUrl,
      tokenUrl: this.config.tokenUrl,
      userInfoUrl: this.config.userInfoUrl
    });
  }

  /**
   * Get the platform identifier
   *
   * @returns Platform identifier ('dingtalk')
   */
  getPlatformType(): OAuthPlatform {
    return this.PLATFORM;
  }

  // Alias for compatibility with BaseOAuthProvider
  getPlatform(): OAuthPlatform {
    return this.PLATFORM;
  }

  /**
   * Generate DingTalk OAuth authorization URL
   *
   * Creates the complete URL for redirecting users to DingTalk's authorization page.
   * Includes all required query parameters.
   *
   * Implements both IOAuthProvider and BaseOAuthProvider interfaces.
   *
   * @param redirectUri - The URI where DingTalk should redirect after authorization
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
      redirect_uri: redirectUri,
      response_type: 'code',
      client_id: this.config.appKey,
      scope: (this.config.scope || DEFAULT_DINGTALK_CONFIG.scope || []).join(' '),
      prompt: 'consent' // Always show consent page for better security
    });

    // Add state parameter if provided
    if (state) {
      params.append('state', state);
    }

    // Build complete URL
    const url = `${this.config.authorizeUrl}?${params.toString()}`;

    console.info('[DingTalkOAuth] Generated authorization URL', {
      state: state ? '***' : 'none',
      redirectUri: this.sanitizeUrlForLogging(redirectUri)
    });

    return url;
  }

  /**
   * Exchange authorization code for user info
   *
   * Combined method that exchanges code for token and retrieves user info.
   * Required by BaseOAuthProvider abstract class.
   *
   * @param code - Authorization code from OAuth callback
   * @returns Standardized user profile
   */
  async exchangeCodeForUserInfo(code: string): Promise<UserProfile> {
    const tokenResponse = await this.exchangeCodeForToken(code);
    return this.getUserInfo(tokenResponse.access_token);
  }

  /**
   * Exchange authorization code for access token
   *
   * After user approves authorization, DingTalk redirects back with
   * an authorization code. This method exchanges that code for an access token.
   *
   * @param code - Authorization code received from OAuth callback
   * @returns Token response containing access_token, refresh_token, expiry, etc.
   * @throws {OAuthError} With type TOKEN_EXCHANGE_FAILED if exchange fails
   * @throws {OAuthError} With type INVALID_CODE if code is invalid or expired
   */
  async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    try {
      // Build request body according to DingTalk API specification
      const requestBody: DingTalkTokenRequest = {
        appId: this.config.appKey,
        appSecret: this.config.appSecret,
        code: code
      };

      console.info('[DingTalkOAuth] Exchanging code for token', {
        codeLength: code.length,
        code: code.substring(0, 4) + '***', // Only show first 4 chars
        appId: this.config.appKey.substring(0, 8) + '***'
      });

      // Make POST request to DingTalk token endpoint
      const response = await this.axiosInstance.post<any>(
        this.config.tokenUrl,
        requestBody
      );

      // Extract token data from response
      const tokenData = response.data as DingTalkTokenResponse;

      // Validate response
      if (!tokenData.accessToken) {
        throw new OAuthError(
          OAuthErrorType.TOKEN_EXCHANGE_FAILED,
          this.PLATFORM,
          'Token response missing accessToken'
        );
      }

      // Build standardized token response
      const tokenResponse: TokenResponse = {
        access_token: tokenData.accessToken,
        token_type: tokenData.tokenType || 'Bearer',
        expires_in: tokenData.expiresIn,
        refresh_token: tokenData.refreshToken,
        raw: { ...tokenData } // Preserve raw response for debugging
      };

      console.info('[DingTalkOAuth] Token exchange successful', {
        tokenType: tokenResponse.token_type,
        expiresIn: tokenResponse.expires_in,
        hasRefreshToken: !!tokenResponse.refresh_token
      });

      return tokenResponse;
    } catch (error) {
      // Handle error through error handler
      const oauthError = this.errorHandler.parseError(error);

      console.error('[DingTalkOAuth] Token exchange failed', {
        errorType: oauthError.type,
        message: oauthError.message
      });

      throw oauthError;
    }
  }

  /**
   * Get user information using access token
   *
   * Retrieves user profile from DingTalk API using provided access token.
   * Returns standardized UserProfile format.
   *
   * @param accessToken - Valid access token from token exchange
   * @returns Standardized user profile with id, name, email, avatar, etc.
   * @throws {OAuthError} With type USER_INFO_FAILED if retrieval fails
   * @throws {OAuthError} With type EXPIRED_TOKEN if access token is expired
   */
  async getUserInfo(accessToken: string): Promise<UserProfile> {
    try {
      console.info('[DingTalkOAuth] Fetching user info', {
        tokenLength: accessToken.length,
        token: accessToken.substring(0, 4) + '***' // Only show first 4 chars
      });

      // Make GET request to DingTalk user info endpoint
      const response = await this.axiosInstance.get<{ data: DingTalkUserInfo }>(
        this.config.userInfoUrl,
        {
          headers: {
            'x-acs-dingtalk-access-token': accessToken
          }
        }
      );

      // Extract user data from response
      const dingTalkUserInfo = response.data.data;

      // Validate response
      if (!dingTalkUserInfo || !dingTalkUserInfo.unionId || !dingTalkUserInfo.userId) {
        throw new OAuthError(
          OAuthErrorType.USER_INFO_FAILED,
          this.PLATFORM,
          'User info response missing required fields'
        );
      }

      // Build standardized user profile
      const userProfile: UserProfile = {
        platform: this.PLATFORM,
        user_id: dingTalkUserInfo.userId,
        union_id: dingTalkUserInfo.unionId,
        name: dingTalkUserInfo.name,
        email: dingTalkUserInfo.email,
        avatar_url: dingTalkUserInfo.avatarUrl,
        mobile: dingTalkUserInfo.mobile,
        raw: { ...dingTalkUserInfo } // Preserve raw response for debugging
      };

      console.info('[DingTalkOAuth] User info retrieved successfully', {
        userId: userProfile.user_id,
        unionId: userProfile.union_id,
        name: userProfile.name
      });

      return userProfile;
    } catch (error) {
      // Handle error through error handler
      const oauthError = this.errorHandler.parseError(error);

      console.error('[DingTalkOAuth] User info retrieval failed', {
        errorType: oauthError.type,
        message: oauthError.message
      });

      throw oauthError;
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
   * NOTE: DingTalk may not always provide refresh tokens. This implementation
   * handles both cases.
   *
   * @param refreshToken - Refresh token from initial token response
   * @returns New access token
   * @throws {OAuthError} With type PLATFORM_ERROR if refresh fails
   * @throws {OAuthError} With type EXPIRED_TOKEN if refresh token is expired
   */
  async refreshAccessToken(_refreshToken: string): Promise<string> {
    // DingTalk OAuth does not support token refresh
    // Users need to re-scan QR code to get a new access token
    throw new OAuthError(
      OAuthErrorType.PLATFORM_ERROR,
      this.PLATFORM,
      'DingTalk does not support token refresh. Please re-authorize using QR code.'
    );
  }

  /**
   * Get platform-specific error handler
   *
   * @returns Error handler implementation for DingTalk platform
   */
  getErrorHandler(): DingTalkErrorHandler {
    return this.errorHandler;
  }

  /**
   * Validate configuration completeness
   *
   * Ensures all required configuration fields are present.
   *
   * @throws {OAuthError} If required configuration is missing
   */
  validateConfig(): void {
    const requiredFields: (keyof DingTalkOAuthConfig)[] = [
      'appKey',
      'appSecret',
      'authorizeUrl',
      'tokenUrl',
      'userInfoUrl'
    ];

    const missing = requiredFields.filter((field) => !this.config[field]);

    if (missing.length > 0) {
      throw new OAuthError(
        OAuthErrorType.CONFIG_MISSING,
        this.PLATFORM,
        `Missing DingTalk configuration: ${missing.join(', ')}`
      );
    }
  }

  /**
   * Load configuration from environment variables
   *
   * Reads DingTalk OAuth configuration from environment variables.
   * Uses defaults where applicable.
   *
   * @private
   * @returns DingTalk OAuth configuration
   */
  private loadConfig(): DingTalkOAuthConfig {
    return {
      appKey: process.env.DINGTALK_APP_KEY || process.env.DINGTALK_APP_ID || '',
      appSecret: process.env.DINGTALK_APP_SECRET || '',
      corpId: process.env.DINGTALK_CORP_ID,
      authorizeUrl: process.env.DINGTALK_OAUTH_AUTHORIZE_URL || DEFAULT_DINGTALK_CONFIG.authorizeUrl!,
      tokenUrl: process.env.DINGTALK_OAUTH_TOKEN_URL || DEFAULT_DINGTALK_CONFIG.tokenUrl!,
      userInfoUrl: process.env.DINGTALK_OAUTH_USERINFO_URL || DEFAULT_DINGTALK_CONFIG.userInfoUrl!,
      redirectUri: process.env.DINGTALK_REDIRECT_URI || process.env.OAUTH_REDIRECT_URI || '',
      scope: process.env.DINGTALK_OAUTH_SCOPE?.split(',') || DEFAULT_DINGTALK_CONFIG.scope
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
        console.debug('[DingTalkOAuth] API request', {
          method: config.method?.toUpperCase(),
          url: config.url || ''
        });
        return config;
      },
      (error) => {
        console.error('[DingTalkOAuth] Request interceptor error', {
          message: error.message
        });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for unified error handling
    instance.interceptors.response.use(
      (response) => {
        console.debug('[DingTalkOAuth] API response', {
          status: response.status,
          url: response.config.url || ''
        });
        return response;
      },
      (error: AxiosError) => {
        console.error('[DingTalkOAuth] API request failed', {
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
      const match = url.match(/^(https?:\/\/[^/]+)/);
      return match ? match[1] : '[sanitized url]';
    }
  }
}
