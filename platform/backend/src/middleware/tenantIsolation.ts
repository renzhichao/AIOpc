import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

declare global {
  namespace Express {
    interface Request {
      userFilter?: {
        owner_id: number;
      };
    }
  }
}

/**
 * Ensure user can only access their own resources
 * This middleware adds filters to repository queries for tenant isolation
 * Must be used after authenticate middleware
 */
export function tenantIsolation(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: '需要登录',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Attach user filter to request for use in controllers
  req.userFilter = {
    owner_id: req.user.userId,
  };

  logger.debug('Tenant isolation applied', {
    requestId: req.id,
    userId: req.user.userId,
  });

  next();
}
