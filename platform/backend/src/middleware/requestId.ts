import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger';

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

/**
 * Generate unique request ID for each incoming request
 * Uses X-Request-ID header if provided, otherwise generates UUID
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = req.headers['x-request-id'] as string || uuidv4();

  req.id = id;
  res.setHeader('X-Request-ID', id);

  logger.debug('Request started', {
    requestId: id,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  // Log request completion
  res.on('finish', () => {
    logger.debug('Request completed', {
      requestId: id,
      statusCode: res.statusCode,
      method: req.method,
      path: req.path,
    });
  });

  next();
}
