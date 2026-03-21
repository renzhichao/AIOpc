/**
 * OAuth Types and Enums
 *
 * Defines core data structures for multi-platform OAuth support.
 * This file contains type definitions used across all OAuth providers.
 *
 * @module auth/interfaces/OAuthTypes
 */

/**
 * OAuth Platform Type Enumeration
 *
 * Defines all supported OAuth platforms.
 * New platforms can be added here without modifying existing code.
 *
 * @enum {string}
 */
export enum OAuthPlatform {
  /** 飞书开放平台 */
  FEISHU = 'feishu',

  /** 钉钉开放平台 */
  DINGTALK = 'dingtalk',

  // Future platforms:
  // WEWORK = 'wework',      // 企业微信
  // WECHAT = 'wechat',      // 微信
  // ALIPAY = 'alipay'        // 支付宝
}

/**
 * Standardized User Profile
 *
 * Normalizes user information from different OAuth platforms.
 * Provides a unified interface regardless of the underlying platform.
 *
 * @interface
 */
export interface UserProfile {
  /** Platform identifier (e.g., 'feishu', 'dingtalk') */
  platform: OAuthPlatform;

  /** Unique user identifier within the platform */
  user_id: string;

  /** Cross-application user identifier (if supported by platform) */
  union_id?: string;

  /** User display name */
  name: string;

  /** English name (optional, platform-specific) */
  en_name?: string;

  /** User email address (optional, depends on OAuth scope) */
  email?: string;

  /** Profile avatar URL (optional) */
  avatar_url?: string;

  /** Mobile phone number (optional, platform-specific) */
  mobile?: string;

  /** Platform-specific raw data (preserved for debugging and future extensibility) */
  raw?: Record<string, any>;
}

/**
 * Standardized Token Response
 *
 * Normalizes token responses from different OAuth platforms.
 * All providers must return tokens in this format.
 *
 * @interface
 */
export interface TokenResponse {
  /** Access token for API calls */
  access_token: string;

  /** Token type (typically "Bearer") */
  token_type: string;

  /** Token expiration time in seconds */
  expires_in: number;

  /** Refresh token for obtaining new access tokens (optional) */
  refresh_token?: string;

  /** Platform-specific scope granted */
  scope?: string;

  /** Platform raw response data (preserved for debugging) */
  raw?: Record<string, any>;
}

/**
 * OAuth Error Type Enumeration
 *
 * Defines all possible OAuth error types across platforms.
 * Standardizes error handling for multi-platform support.
 *
 * @enum {string}
 */
export enum OAuthErrorType {
  /** Required configuration is missing */
  CONFIG_MISSING = 'CONFIG_MISSING',

  /** Token exchange failed */
  TOKEN_EXCHANGE_FAILED = 'TOKEN_EXCHANGE_FAILED',

  /** User info retrieval failed */
  USER_INFO_FAILED = 'USER_INFO_FAILED',

  /** Invalid authorization code */
  INVALID_CODE = 'INVALID_CODE',

  /** Token has expired */
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',

  /** Invalid state parameter (CSRF protection) */
  INVALID_STATE = 'INVALID_STATE',

  /** Platform-specific error */
  PLATFORM_ERROR = 'PLATFORM_ERROR',

  /** Redirect URI validation failed */
  INVALID_REDIRECT_URI = 'INVALID_REDIRECT_URI',

  /** Network or connectivity error */
  NETWORK_ERROR = 'NETWORK_ERROR'
}

/**
 * OAuth Error Class
 *
 * Standardized error class for OAuth operations.
 * Provides consistent error handling across all platforms.
 *
 * @class
 * @extends Error
 */
export class OAuthError extends Error {
  /**
   * Creates a new OAuth error instance
   *
   * @param type - Error type from OAuthErrorType enum
   * @param platform - Platform where the error occurred
   * @param message - Human-readable error message
   * @param originalError - Original error object (optional)
   * @param code - Platform-specific error code (optional)
   */
  constructor(
    public readonly type: OAuthErrorType,
    public readonly platform: OAuthPlatform,
    message: string,
    public readonly originalError?: any,
    public readonly code?: string | number
  ) {
    super(message);
    this.name = 'OAuthError';

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OAuthError);
    }
  }

  /**
   * Check if this error is retryable
   *
   * @returns true if the operation can be retried
   */
  isRetryable(): boolean {
    return [
      OAuthErrorType.NETWORK_ERROR,
      OAuthErrorType.PLATFORM_ERROR
    ].includes(this.type);
  }

  /**
   * Get user-friendly error message
   *
   * @returns Message suitable for display to end users
   */
  getUserMessage(): string {
    const userMessages: Record<OAuthErrorType, string> = {
      [OAuthErrorType.CONFIG_MISSING]: '系统配置错误，请联系管理员',
      [OAuthErrorType.TOKEN_EXCHANGE_FAILED]: '授权失败，请重试',
      [OAuthErrorType.USER_INFO_FAILED]: '获取用户信息失败，请重试',
      [OAuthErrorType.INVALID_CODE]: '授权码无效，请重新授权',
      [OAuthErrorType.EXPIRED_TOKEN]: '授权已过期，请重新授权',
      [OAuthErrorType.INVALID_STATE]: '安全验证失败，请重试',
      [OAuthErrorType.PLATFORM_ERROR]: '平台服务暂时不可用，请稍后重试',
      [OAuthErrorType.INVALID_REDIRECT_URI]: '回调地址配置错误',
      [OAuthErrorType.NETWORK_ERROR]: '网络连接失败，请检查网络后重试'
    };

    return userMessages[this.type] || '未知错误，请联系管理员';
  }
}

/**
 * OAuth Error Handler Interface
 *
 * Defines contract for platform-specific error handling.
 * Each provider implements this to map platform errors to standard OAuthError.
 *
 * @interface
 */
export interface IOAuthErrorHandler {
  /**
   * Parse platform-specific error into standard OAuthError
   *
   * @param error - Raw error from platform API
   * @returns Standardized OAuthError
   */
  parseError(error: any): OAuthError;

  /**
   * Get user-friendly message for error type
   *
   * @param errorType - Standardized error type
   * @returns User-readable message
   */
  getUserMessage(errorType: OAuthErrorType): string;

  /**
   * Check if error is retryable
   *
   * @param errorType - Standardized error type
   * @returns true if operation can be retried
   */
  isRetryable(errorType: OAuthErrorType): boolean;
}
