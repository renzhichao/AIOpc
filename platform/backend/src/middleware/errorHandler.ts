import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors/AppError';
import { logger } from '../config/logger';

/**
 * Global Error Handler Middleware
 *
 * Catches all errors thrown in the application and formats
 * them into a consistent API response format.
 *
 * Error Response Format:
 * {
 *   success: false,
 *   code: 'ERROR_CODE',
 *   message: 'User-friendly message',
 *   details: {}, // optional
 *   actions: [], // optional
 *   timestamp: '2024-01-01T00:00:00.000Z'
 * }
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error with context
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: req.body,
    query: req.query,
    params: req.params
  });

  // Handle operational errors (AppError)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.userMessage || err.message,
      details: err.details,
      actions: err.actions,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Handle unexpected errors
  const statusCode = (err as any).statusCode || 500;
  const code = (err as any).code || 'INTERNAL_ERROR';

  // In development, include error details
  const isDevelopment = process.env.NODE_ENV !== 'production';

  res.status(statusCode).json({
    success: false,
    code: code,
    message: '服务器内部错误，请稍后重试',
    ...(isDevelopment && {
      details: {
        error: err.message,
        stack: err.stack
      }
    }),
    timestamp: new Date().toISOString()
  });
}

/**
 * Not Found Handler
 *
 * Handles requests to undefined routes
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: `路由 ${req.method} ${req.path} 不存在`,
    timestamp: new Date().toISOString()
  });
}
