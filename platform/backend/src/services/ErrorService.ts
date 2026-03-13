import { Service } from 'typedi';
import { AppError } from '../utils/errors/AppError';
import { ErrorCodes, ErrorCodeKey } from '../utils/errors/ErrorCodes';
import { logger } from '../config/logger';

/**
 * Error Service
 *
 * Provides centralized error creation, logging, and alerting.
 * Helps maintain consistent error handling across the application.
 */
@Service()
export class ErrorService {
  /**
   * Create a typed error from ErrorCodes
   *
   * @param errorKey - Error code key from ErrorCodes
   * @param details - Additional error details
   * @param actions - Suggested actions for resolution
   * @returns AppError instance
   */
  createError(
    errorKey: ErrorCodeKey,
    details?: any,
    actions?: string[]
  ): AppError {
    const errorConfig = ErrorCodes[errorKey];
    return new AppError(
      errorConfig.statusCode,
      errorConfig.code,
      errorConfig.message,
      details,
      errorConfig.userMessage,
      actions
    );
  }

  /**
   * Create a not found error
   *
   * @param resource - Resource type that was not found
   * @param identifier - Resource identifier (optional)
   * @returns AppError instance
   */
  notFound(resource: string, identifier?: string): AppError {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;

    const userMessage = identifier
      ? `找不到标识为 '${identifier}' 的${resource}`
      : `${resource}不存在`;

    return new AppError(
      404,
      'NOT_FOUND',
      message,
      { resource, identifier },
      userMessage
    );
  }

  /**
   * Create a validation error
   *
   * @param field - Field name that failed validation
   * @param message - Validation error message
   * @returns AppError instance
   */
  validation(field: string, message: string): AppError {
    return new AppError(
      400,
      'VALIDATION_ERROR',
      `Validation failed for ${field}: ${message}`,
      { field },
      `${field}验证失败: ${message}`
    );
  }

  /**
   * Create an unauthorized error
   *
   * @param reason - Reason for unauthorized access (optional)
   * @returns AppError instance
   */
  unauthorized(reason?: string): AppError {
    return new AppError(
      401,
      'UNAUTHORIZED',
      reason || 'Unauthorized access',
      { reason },
      '您需要先登录才能进行此操作'
    );
  }

  /**
   * Create a forbidden error
   *
   * @param action - Action that was forbidden
   * @returns AppError instance
   */
  forbidden(action?: string): AppError {
    const message = action
      ? `Forbidden: ${action}`
      : 'Forbidden';

    return new AppError(
      403,
      'FORBIDDEN',
      message,
      { action },
      '您没有权限执行此操作'
    );
  }

  /**
   * Create a conflict error
   *
   * @param resource - Resource type in conflict
   * @param details - Conflict details
   * @returns AppError instance
   */
  conflict(resource: string, details?: any): AppError {
    return new AppError(
      409,
      'CONFLICT',
      `${resource} conflict`,
      details,
      `资源冲突：${resource}`
    );
  }

  /**
   * Log error with context
   *
   * @param error - Error to log
   * @param context - Additional context information
   */
  logError(error: Error, context?: any): void {
    logger.error('Error logged', {
      error: error.message,
      stack: error.stack,
      context
    });

    // Send alert for critical errors
    if (this.isCriticalError(error)) {
      this.sendAlert(error, context);
    }
  }

  /**
   * Determine if error is critical (requires alerting)
   *
   * @param error - Error to evaluate
   * @returns True if error is critical
   */
  private isCriticalError(error: Error): boolean {
    if (error instanceof AppError) {
      // Server errors (5xx) are critical
      return error.statusCode >= 500;
    }
    // Unknown errors are critical
    return true;
  }

  /**
   * Send alert for critical errors
   *
   * In production, this would integrate with alerting systems
   * like Feishu, email, PagerDuty, etc.
   *
   * @param error - Critical error
   * @param context - Additional context
   */
  private sendAlert(error: Error, context?: any): void {
    // TODO: Integrate with alerting system
    // For now, just log as warning
    logger.warn('Critical error alert', {
      error: error.message,
      stack: error.stack,
      context,
      severity: 'high'
    });
  }
}
