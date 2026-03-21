/**
 * DingTalk OAuth Error Handler
 *
 * Maps DingTalk platform-specific errors to standard OAuthError types.
 * Provides user-friendly error messages and determines retryability.
 *
 * @module auth/providers/DingTalkErrorHandler
 */

import {
  OAuthError,
  OAuthErrorType,
  IOAuthErrorHandler,
  OAuthPlatform
} from '../interfaces/OAuthTypes';
import type { DingTalkErrorResponse } from './DingTalkOAuthConfig';

/**
 * DingTalk Error Code Mapping
 *
 * Maps DingTalk error codes to standard OAuthErrorType enums.
 * Documentation: https://open.dingtalk.com/document/orgapp-server/obtain-user-token
 */
const DINGTALK_ERROR_MAP: Record<string, OAuthErrorType> = {
  // Configuration errors
  'invalid_client': OAuthErrorType.CONFIG_MISSING,
  'unauthorized_client': OAuthErrorType.CONFIG_MISSING,

  // Token exchange errors
  'invalid_grant': OAuthErrorType.INVALID_CODE,
  'invalid_request': OAuthErrorType.TOKEN_EXCHANGE_FAILED,

  // Token validation errors
  'invalid_token': OAuthErrorType.EXPIRED_TOKEN,
  'expired_token': OAuthErrorType.EXPIRED_TOKEN,

  // User info errors
  'user_not_found': OAuthErrorType.USER_INFO_FAILED,
  'permission_denied': OAuthErrorType.USER_INFO_FAILED,

  // Network/platform errors
  'rate_limit_exceeded': OAuthErrorType.PLATFORM_ERROR,
  'service_unavailable': OAuthErrorType.PLATFORM_ERROR,
  'timeout': OAuthErrorType.NETWORK_ERROR
};

/**
 * DingTalk Error Handler Implementation
 *
 * Implements IOAuthErrorHandler interface for DingTalk platform.
 *
 * @class
 */
export class DingTalkErrorHandler implements IOAuthErrorHandler {
  /**
   * Parse DingTalk API error into standard OAuthError
   *
   * @param error - Raw error from DingTalk API or HTTP client
   * @returns Standardized OAuthError
   */
  parseError(error: any): OAuthError {
    // Extract DingTalk error response
    const dingTalkError = this.extractDingTalkError(error);

    // Map DingTalk error code to OAuthErrorType
    const errorType = this.mapErrorType(dingTalkError?.code);

    // Generate user-friendly message
    const message = this.getUserMessageWithContext(errorType, dingTalkError);

    // Create OAuthError instance
    return new OAuthError(
      errorType,
      OAuthPlatform.DINGTALK,
      message,
      error,
      dingTalkError?.code
    );
  }

  /**
   * Get user-friendly message for error type
   *
   * @param errorType - Standardized error type
   * @returns User-readable message in Chinese
   */
  getUserMessage(errorType: OAuthErrorType): string {
    const dingTalkMessages: Record<OAuthErrorType, string> = {
      [OAuthErrorType.CONFIG_MISSING]: '钉钉应用配置错误，请联系管理员检查AppKey和AppSecret',
      [OAuthErrorType.TOKEN_EXCHANGE_FAILED]: '钉钉授权失败，请重试',
      [OAuthErrorType.USER_INFO_FAILED]: '获取钉钉用户信息失败，请重试',
      [OAuthErrorType.INVALID_CODE]: '授权码无效或已过期，请重新授权',
      [OAuthErrorType.EXPIRED_TOKEN]: '钉钉访问令牌已过期，请重新授权',
      [OAuthErrorType.INVALID_STATE]: '安全验证失败，请重试',
      [OAuthErrorType.PLATFORM_ERROR]: '钉钉服务暂时不可用，请稍后重试',
      [OAuthErrorType.INVALID_REDIRECT_URI]: '回调地址配置错误',
      [OAuthErrorType.NETWORK_ERROR]: '网络连接失败，请检查网络后重试'
    };

    return dingTalkMessages[errorType] || '钉钉登录失败，请联系管理员';
  }

  /**
   * Get user-friendly message with DingTalk-specific context
   *
   * @private
   * @param errorType - Standardized error type
   * @param dingTalkError - DingTalk error response (optional)
   * @returns User-readable message
   */
  private getUserMessageWithContext(
    errorType: OAuthErrorType,
    dingTalkError?: DingTalkErrorResponse | null
  ): string {
    // Get base message
    let message = this.getUserMessage(errorType);

    // Append DingTalk-specific message if available
    if (dingTalkError?.message && dingTalkError.message !== 'Unknown error') {
      message += `（${dingTalkError.message}）`;
    }

    return message;
  }

  /**
   * Check if error is retryable
   *
   * @param errorType - Standardized error type
   * @returns true if operation can be retried
   */
  isRetryable(errorType: OAuthErrorType): boolean {
    const retryableTypes = [
      OAuthErrorType.NETWORK_ERROR,
      OAuthErrorType.PLATFORM_ERROR
    ];

    return retryableTypes.includes(errorType);
  }

  /**
   * Extract DingTalk error response from raw error
   *
   * Handles different error formats:
   * - DingTalk API response: { code: 'xxx', message: 'yyy' }
   * - Axios error: error.response.data
   * - Network error: error.code
   *
   * @private
   * @param error - Raw error object
   * @returns DingTalk error response or null
   */
  private extractDingTalkError(error: any): DingTalkErrorResponse | null {
    // Case 1: DingTalk API response error
    if (error.code && typeof error.code === 'string') {
      return error as DingTalkErrorResponse;
    }

    // Case 2: Axios HTTP error with response
    if (error.response?.data) {
      const responseData = error.response.data;

      // DingTalk API error format
      if (responseData.code) {
        return {
          code: responseData.code,
          message: responseData.message || 'Unknown error',
          requestId: responseData.requestId
        };
      }
    }

    // Case 3: Network error (Axios)
    if (error.code) {
      // Map common Axios error codes to DingTalk error codes
      const networkErrorMap: Record<string, string> = {
        'ECONNABORTED': 'timeout',
        'ETIMEDOUT': 'timeout',
        'ECONNRESET': 'network_error',
        'ENOTFOUND': 'network_error',
        'ECONNREFUSED': 'service_unavailable'
      };

      const dingTalkCode = networkErrorMap[error.code] || 'network_error';

      return {
        code: dingTalkCode,
        message: error.message || 'Network error'
      };
    }

    // Case 4: Generic error without specific structure
    if (error instanceof Error) {
      return {
        code: 'unknown_error',
        message: error.message || 'Unknown error occurred'
      };
    }

    return null;
  }

  /**
   * Map DingTalk error code to OAuthErrorType
   *
   * @private
   * @param dingTalkCode - DingTalk error code
   * @returns Standardized OAuthErrorType
   */
  private mapErrorType(dingTalkCode: string | undefined): OAuthErrorType {
    if (!dingTalkCode) {
      return OAuthErrorType.PLATFORM_ERROR;
    }

    // Use predefined error map
    return DINGTALK_ERROR_MAP[dingTalkCode] || OAuthErrorType.PLATFORM_ERROR;
  }
}
