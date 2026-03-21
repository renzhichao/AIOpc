/**
 * IOAuthProvider Interface
 *
 * Defines the contract that all OAuth providers must implement.
 * This interface enables pluggable OAuth platform support while maintaining
 * consistent behavior across different platforms (Feishu, DingTalk, etc.).
 *
 * @module auth/interfaces/IOAuthProvider
 */

import type {
  OAuthPlatform,
  UserProfile,
  TokenResponse,
  IOAuthErrorHandler
} from './OAuthTypes';

/**
 * OAuth Provider Interface
 *
 * All OAuth platform implementations (Feishu, DingTalk, etc.) must implement
 * this interface. This ensures consistent API surface and enables easy
 * addition of new platforms through dependency injection.
 *
 * @interface
 */
export interface IOAuthProvider {
  /**
   * Get the platform identifier
   *
   * Returns the unique identifier for this OAuth platform.
   * Used for routing, logging, and data storage.
   *
   * @returns Platform identifier (e.g., 'feishu', 'dingtalk')
   *
   * @example
   * ```typescript
   * const platform = provider.getPlatformType();
   * console.log(platform); // 'feishu'
   * ```
   */
  getPlatformType(): OAuthPlatform;

  /**
   * Generate OAuth authorization URL
   *
   * Creates the complete URL that users should be redirected to for OAuth authorization.
   * Includes all required query parameters (app_id, redirect_uri, scope, state).
   *
   * @param redirectUri - The URI where the platform should redirect after authorization
   * @param state - Opaque state parameter for CSRF protection (recommended)
   * @returns Complete authorization URL ready for user redirect
   *
   * @throws {OAuthError} If configuration is missing or invalid
   *
   * @example
   * ```typescript
   * const url = await provider.getAuthorizationUrl(
   *   'https://myapp.com/oauth/callback',
   *   'random-state-123'
   * );
   * // Returns: 'https://open.feishu.cn/authen/v1/authorize?app_id=xxx&redirect_uri=...'
   * ```
   */
  getAuthorizationUrl(redirectUri: string, state?: string): Promise<string> | string;

  /**
   * Exchange authorization code for access token
   *
   * After user approves authorization, the platform redirects back with
   * an authorization code. This method exchanges that code for an access token.
   *
   * @param code - Authorization code received from OAuth callback
   * @returns Token response containing access_token, refresh_token, expiry, etc.
   *
   * @throws {OAuthError} With type TOKEN_EXCHANGE_FAILED if exchange fails
   * @throws {OAuthError} With type INVALID_CODE if code is invalid or expired
   *
   * @example
   * ```typescript
   * try {
   *   const token = await provider.exchangeCodeForToken('auth_code_123');
   *   console.log(token.access_token); // 'eyJhbGciOiJIUzI1NiIs...'
   * } catch (error) {
   *   if (error instanceof OAuthError) {
   *     console.error('Token exchange failed:', error.getUserMessage());
   *   }
   * }
   * ```
   */
  exchangeCodeForToken(code: string): Promise<TokenResponse>;

  /**
   * Get user information using access token
   *
   * Retrieves user profile information from the OAuth platform using
   * the provided access token. Returns standardized UserProfile format.
   *
   * @param accessToken - Valid access token from token exchange
   * @returns Standardized user profile with id, name, email, avatar, etc.
   *
   * @throws {OAuthError} With type USER_INFO_FAILED if retrieval fails
   * @throws {OAuthError} With type EXPIRED_TOKEN if access token is expired
   *
   * @example
   * ```typescript
   * const user = await provider.getUserInfo(accessToken);
   * console.log(user.name);         // '张三'
   * console.log(user.email);        // 'zhangsan@example.com'
   * console.log(user.avatar_url);   // 'https://avatar.example.com/...'
   * ```
   */
  getUserInfo(accessToken: string): Promise<UserProfile>;

  /**
   * Refresh access token using refresh token
   *
   * Obtains a new access token using the refresh token without requiring
   * user interaction. Not all platforms support refresh tokens.
   *
   * @param refreshToken - Refresh token from initial token response
   * @returns New access token
   *
   * @throws {OAuthError} With type PLATFORM_ERROR if refresh fails
   * @throws {OAuthError} With type EXPIRED_TOKEN if refresh token is expired
   *
   * @example
   * ```typescript
   * try {
   *   const newAccessToken = await provider.refreshAccessToken(refreshToken);
   *   console.log('New token:', newAccessToken);
   * } catch (error) {
   *   // Refresh token expired, need user to re-authorize
   *   console.error('Please re-authorize');
   * }
   * ```
   */
  refreshAccessToken(refreshToken: string): Promise<string>;

  /**
   * Validate access token validity
   *
   * Checks if the provided access token is still valid and can be used
   * for API calls. Typically makes a lightweight API call to verify.
   *
   * @param accessToken - Access token to validate
   * @returns true if token is valid, false otherwise
   *
   * @example
   * ```typescript
   * const isValid = await provider.validateToken(accessToken);
   * if (!isValid) {
   *   console.log('Token expired, need to refresh');
   * }
   * ```
   */
  validateToken(accessToken: string): Promise<boolean>;

  /**
   * Get platform-specific error handler
   *
   * Returns the error handler instance for this platform.
   * The handler maps platform-specific errors to standard OAuthError types.
   *
   * @returns Error handler implementation for this platform
   *
   * @example
   * ```typescript
   * const errorHandler = provider.getErrorHandler();
   * const oauthError = errorHandler.parseError(platformError);
   * console.log(oauthError.getUserMessage());
   * ```
   */
  getErrorHandler(): IOAuthErrorHandler;
}

/**
 * OAuth Configuration Interface
 *
 * Defines the standardized configuration structure for OAuth providers.
 * All providers should use this configuration format for consistency.
 *
 * @interface
 */
export interface IOAuthConfig {
  /** Application ID / Client ID */
  appId: string;

  /** Application Secret / Client Secret */
  appSecret: string;

  /** OAuth callback redirect URI */
  redirectUri: string;

  /** Base URL for OAuth API endpoints */
  apiBaseUrl: string;

  /** OAuth scope(s) to request (optional) */
  scope?: string[];

  /** Platform-specific configuration (optional) */
  platformSpecific?: Record<string, any>;
}

/**
 * Provider Factory Interface
 *
 * Defines contract for creating and managing OAuth provider instances.
 * Enables dynamic provider registration and retrieval.
 *
 * @interface
 */
export interface IOAuthProviderFactory {
  /**
   * Get provider instance for specified platform
   *
   * @param platform - Platform identifier
   * @returns Provider instance for the platform
   * @throws {OAuthError} If platform is not supported
   */
  getProvider(platform: OAuthPlatform): IOAuthProvider;

  /**
   * Register a new provider instance
   *
   * @param platform - Platform identifier
   * @param provider - Provider instance
   */
  registerProvider(platform: OAuthPlatform, provider: IOAuthProvider): void;

  /**
   * Get list of available platforms
   *
   * @returns Array of platform identifiers
   */
  getAvailablePlatforms(): OAuthPlatform[];

  /**
   * Check if platform is available
   *
   * @param platform - Platform identifier
   * @returns true if platform is registered and available
   */
  hasPlatform(platform: OAuthPlatform): boolean;
}
