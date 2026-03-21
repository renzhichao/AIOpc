import { logger } from '../config/logger';

/**
 * 敏感信息脱敏工具类
 *
 * 功能：
 * - Config对象脱敏（appKey只显示前8位，appSecret完全隐藏）
 * - Token对象脱敏（accessToken、refreshToken完全隐藏）
 * - Code对象脱敏（authorization code只显示长度）
 * - Error对象脱敏（不泄露内部配置细节）
 *
 * 使用场景：
 * - OAuthProvider所有日志调用
 * - OAuthController错误响应
 * - 所有需要记录敏感信息的场景
 */
export class LogSanitizer {
  private static readonly MASK = '***';
  private static readonly APPKEY_PREFIX_LENGTH = 8;

  /**
   * 脱敏Config对象
   * @param config OAuth配置对象
   * @returns 脱敏后的Config对象
   *
   * @example
   * sanitizeConfig({
   *   appKey: 'ding6fgvcdmcdigtazrm',
   *   appSecret: 'wRJsPR2nWnLiuYYhAspWsQX_hPQjyrmLRfbuZbV3LEzGqAAGG9Ca1rXKz27bgiSq'
   * })
   * // Returns: { appKey: 'ding6fgv***', appSecret: '***' }
   */
  static sanitizeConfig(config: {
    appKey?: string;
    appSecret?: string;
    appId?: string;
    [key: string]: any;
  }): Record<string, any> {
    const sanitized: Record<string, any> = { ...config };

    // 脱敏appKey/appId（只显示前8位）
    if (sanitized.appKey && typeof sanitized.appKey === 'string') {
      sanitized.appKey =
        sanitized.appKey.length > this.APPKEY_PREFIX_LENGTH
          ? `${sanitized.appKey.substring(0, this.APPKEY_PREFIX_LENGTH)}${this.MASK}`
          : `${sanitized.appKey.substring(0, 4)}${this.MASK}`;
    }

    if (sanitized.appId && typeof sanitized.appId === 'string') {
      sanitized.appId =
        sanitized.appId.length > this.APPKEY_PREFIX_LENGTH
          ? `${sanitized.appId.substring(0, this.APPKEY_PREFIX_LENGTH)}${this.MASK}`
          : `${sanitized.appId.substring(0, 4)}${this.MASK}`;
    }

    // 完全隐藏appSecret
    if (sanitized.appSecret) {
      sanitized.appSecret = this.MASK;
    }

    // 隐藏其他可能的敏感字段
    const sensitiveKeys = ['clientSecret', 'secret', 'password', 'token'];
    for (const key of sensitiveKeys) {
      if (sanitized[key]) {
        sanitized[key] = this.MASK;
      }
    }

    return sanitized;
  }

  /**
   * 脱敏Token对象
   * @param token Token对象
   * @returns 脱敏后的Token对象
   *
   * @example
   * sanitizeToken({
   *   accessToken: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
   *   refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
   *   tokenType: 'Bearer'
   * })
   * // Returns: { accessToken: '***', refreshToken: '***', tokenType: 'Bearer' }
   */
  static sanitizeToken(token: {
    accessToken?: string;
    access_token?: string;
    refreshToken?: string;
    refresh_token?: string;
    token?: string;
    [key: string]: any;
  }): Record<string, any> {
    const sanitized: Record<string, any> = { ...token };

    // 完全隐藏所有类型的token
    const tokenKeys = ['accessToken', 'access_token', 'refreshToken', 'refresh_token', 'token', 'authorization'];
    for (const key of tokenKeys) {
      if (sanitized[key]) {
        sanitized[key] = this.MASK;
      }
    }

    return sanitized;
  }

  /**
   * 脱敏Authorization Code
   * @param code 授权码
   * @returns 脱敏后的code（只显示长度）
   *
   * @example
   * sanitizeCode('ding6fgvcdmcdigtazrm')
   * // Returns: '[code length: 20]'
   */
  static sanitizeCode(code?: string): string {
    if (code === undefined || code === null) {
      return '[code: empty or undefined]';
    }
    if (code === '') {
      return '[code length: 0]';
    }
    return `[code length: ${code.length}]`;
  }

  /**
   * 脱敏State参数
   * @param state State参数
   * @returns 脱敏后的state（只显示长度）
   *
   * @example
   * sanitizeState('abc123def456')
   * // Returns: '[state length: 12]'
   */
  static sanitizeState(state?: string): string {
    if (state === undefined || state === null) {
      return '[state: empty or undefined]';
    }
    if (state === '') {
      return '[state length: 0]';
    }
    return `[state length: ${state.length}]`;
  }

  /**
   * 脱敏用户ID（open_id, union_id, user_id等）
   * @param userId 用户ID
   * @returns 脱敏后的用户ID（只显示前8位和后4位）
   *
   * @example
   * sanitizeUserId('ou_1234567890abcdef')
   * // Returns: 'ou_12345***cdef'
   */
  static sanitizeUserId(userId?: string): string {
    if (!userId) {
      return '[userId: empty]';
    }

    if (userId.length <= 12) {
      return `${userId.substring(0, 4)}${this.MASK}`;
    }

    // 对于非常长的userId，取前8位和后4位
    const prefix = userId.substring(0, 8);
    const suffix = userId.substring(userId.length - 4);
    return `${prefix}${this.MASK}${suffix}`;
  }

  /**
   * 脱敏Error对象（不泄露内部配置细节）
   * @param error 错误对象
   * @returns 脱敏后的错误信息
   *
   * @example
   * sanitizeError(new Error('Failed with appSecret: wRJsPR2...'))
   * // Returns: { message: 'Failed with appSecret: ***', stack: '...' }
   */
  static sanitizeError(error: any): Record<string, any> {
    const sanitized: Record<string, any> = {};

    // 脱敏错误消息中的敏感信息
    if (error.message) {
      sanitized.message = this.sanitizeErrorMessage(error.message);
    }

    // 保留错误堆栈（用于调试，但脱敏敏感信息）
    if (error.stack) {
      sanitized.stack = this.sanitizeErrorMessage(error.stack);
    }

    // 保留安全字段
    const safeFields = ['code', 'statusCode', 'status', 'httpStatus'];
    for (const field of safeFields) {
      if (error[field] !== undefined) {
        sanitized[field] = error[field];
      }
    }

    return sanitized;
  }

  /**
   * 脱敏错误消息中的敏感信息（私有方法）
   * @param message 错误消息
   * @returns 脱敏后的消息
   */
  private static sanitizeErrorMessage(message: string): string {
    let sanitized = message;

    // 脱敏appSecret/app_key等敏感模式
    const sensitivePatterns = [
      /appSecret['":\s]*['"]?([a-zA-Z0-9_-]+)/gi,
      /app_key['":\s]*['"]?([a-zA-Z0-9_-]+)/gi,
      /appKey['":\s]*['"]?([a-zA-Z0-9_-]+)/gi,
      /clientSecret['":\s]*['"]?([a-zA-Z0-9_-]+)/gi,
      /accessToken['":\s]*['"]?([a-zA-Z0-9_.-]+)/gi,
      /refreshToken['":\s]*['"]?([a-zA-Z0-9_.-]+)/gi,
      /Bearer\s+([a-zA-Z0-9_.-]+)/gi
    ];

    for (const pattern of sensitivePatterns) {
      sanitized = sanitized.replace(pattern, (match, capture) => {
        // 保留字段名，替换值为***
        return match.replace(capture, this.MASK);
      });
    }

    return sanitized;
  }

  /**
   * 脱敏任意对象（递归处理）
   * @param obj 任意对象
   * @returns 脱敏后的对象
   *
   * @example
   * sanitizeObject({
   *   user: { open_id: 'ou_123', name: 'Test' },
   *   config: { appSecret: 'secret123' }
   * })
   * // Returns: {
   * //   user: { open_id: 'ou_1***23', name: 'Test' },
   * //   config: { appSecret: '***' }
   * // }
   */
  static sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      // 跳过undefined/null
      if (value === undefined || value === null) {
        sanitized[key] = value;
        continue;
      }

      // 递归处理嵌套对象
      if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);
        continue;
      }

      // 处理字符串类型的敏感字段
      if (typeof value === 'string') {
        // 检测敏感字段名
        const lowerKey = key.toLowerCase();

        // Token相关
        if (lowerKey.includes('token') || lowerKey.includes('authorization') || lowerKey === 'code') {
          if (lowerKey === 'code') {
            sanitized[key] = this.sanitizeCode(value);
          } else {
            sanitized[key] = this.MASK;
          }
          continue;
        }

        // Secret/Password相关
        if (lowerKey.includes('secret') || lowerKey.includes('password')) {
          sanitized[key] = this.MASK;
          continue;
        }

        // 用户ID相关（部分脱敏）
        if (lowerKey.includes('user_id') || lowerKey.includes('openid') || lowerKey === 'open_id' || lowerKey === 'union_id') {
          sanitized[key] = this.sanitizeUserId(value);
          continue;
        }

        // AppKey/AppID相关（前8位）
        if (lowerKey === 'appkey' || lowerKey === 'appid' || lowerKey === 'app_id') {
          sanitized[key] =
            value.length > this.APPKEY_PREFIX_LENGTH
              ? `${value.substring(0, this.APPKEY_PREFIX_LENGTH)}${this.MASK}`
              : `${value.substring(0, 4)}${this.MASK}`;
          continue;
        }
      }

      // 其他字段保持原样
      sanitized[key] = value;
    }

    return sanitized;
  }

  /**
   * 记录敏感信息的安全日志方法
   * @param level 日志级别
   * @param message 日志消息
   * @param data 日志数据（会被脱敏）
   *
   * @example
   * LogSanitizer.log('info', 'OAuth config loaded', {
   *   appKey: 'ding6fgvcdmcdigtazrm',
   *   appSecret: 'wRJsPR2n...'
   * })
   * // Logs: { appKey: 'ding6fgv***', appSecret: '***' }
   */
  static log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any): void {
    const sanitizedData = data ? this.sanitizeObject(data) : undefined;

    switch (level) {
      case 'info':
        logger.info(message, sanitizedData);
        break;
      case 'warn':
        logger.warn(message, sanitizedData);
        break;
      case 'error':
        logger.error(message, sanitizedData);
        break;
      case 'debug':
        logger.debug(message, sanitizedData);
        break;
    }
  }
}
