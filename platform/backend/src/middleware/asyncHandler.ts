import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors/AppError';
import { logger } from '../config/logger';

/**
 * Async Handler Wrapper
 *
 * Wraps async route handlers to catch unhandled errors
 * and pass them to Express error handling middleware.
 *
 * @param fn - Async function to wrap
 * @returns Express middleware function
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      logger.error('Async handler error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        body: req.body,
        query: req.query,
        params: req.params
      });
      next(error);
    });
  };
}
