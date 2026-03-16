import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../config/logger';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        feishuUserId: string;
        name: string;
        email?: string;
      };
    }
  }
}

/**
 * Verify JWT token and attach user to request
 * Fails if token is missing or invalid
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: '未提供认证令牌',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: '令牌格式不正确',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Verify token
    const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      feishuUserId: decoded.feishuUserId,
      name: decoded.name,
      email: decoded.email,
    };

    logger.debug('User authenticated', {
      requestId: req.id,
      userId: req.user.userId,
      feishuUserId: req.user.feishuUserId,
    });

    next();
  } catch (error: any) {
    logger.warn('Authentication failed', {
      requestId: req.id,
      error: error.message,
    });

    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        code: 'TOKEN_EXPIRED',
        message: '令牌已过期，请重新登录',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: '无效的令牌',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '认证失败',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Alias for authenticate for backward compatibility
 */
export const authMiddleware = authenticate;

/**
 * Optional authentication - doesn't fail if no token
 * Attaches user info if valid token is present
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);

  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    req.user = {
      userId: decoded.userId,
      feishuUserId: decoded.feishuUserId,
      name: decoded.name,
      email: decoded.email,
    };

    logger.debug('Optional auth succeeded', {
      requestId: req.id,
      userId: req.user.userId,
    });
  } catch (error) {
    // Ignore errors for optional auth
    logger.debug('Optional auth failed (continuing without auth)', {
      requestId: req.id,
      error: (error as Error).message,
    });
  }

  next();
}
