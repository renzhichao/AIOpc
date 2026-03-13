import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

interface RateLimitCounter {
  count: number;
  resetTime: number;
}

// Simple in-memory rate limiter
// In production, consider using Redis for distributed rate limiting
const requestCounts = new Map<string, RateLimitCounter>();

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

/**
 * Rate limiting middleware to prevent API abuse
 * Uses in-memory storage (consider Redis for production distributed systems)
 *
 * @param options - Rate limit configuration
 * @param options.windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @param options.maxRequests - Maximum requests per window (default: 100)
 */
export function rateLimit(options: Partial<RateLimitOptions> = {}) {
  const { windowMs = 60000, maxRequests = 100 } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || 'unknown';
    const now = Date.now();

    // Clean up expired entries periodically (every 100 requests)
    if (requestCounts.size % 100 === 0) {
      for (const [k, v] of requestCounts.entries()) {
        if (v.resetTime < now) {
          requestCounts.delete(k);
        }
      }
    }

    // Get or create counter
    let counter = requestCounts.get(key);

    if (!counter || counter.resetTime < now) {
      counter = {
        count: 0,
        resetTime: now + windowMs,
      };
      requestCounts.set(key, counter);
    }

    // Check if limit exceeded
    counter.count++;

    if (counter.count > maxRequests) {
      logger.warn('Rate limit exceeded', {
        requestId: req.id,
        ip: req.ip,
        count: counter.count,
        max: maxRequests,
      });

      res.status(429).json({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message: '请求过于频繁，请稍后再试',
        timestamp: new Date().toISOString(),
        retryAfter: Math.ceil((counter.resetTime - now) / 1000),
      });
      return;
    }

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - counter.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(counter.resetTime).toISOString());

    logger.debug('Rate limit check passed', {
      requestId: req.id,
      ip: req.ip,
      count: counter.count,
      remaining: maxRequests - counter.count,
    });

    next();
  };
}

/**
 * Reset rate limit for a specific IP (useful for testing or admin actions)
 *
 * @param ip - IP address to reset
 */
export function resetRateLimit(ip: string): void {
  requestCounts.delete(ip);
  logger.info('Rate limit reset', { ip });
}

/**
 * Get current rate limit status for an IP
 *
 * @param ip - IP address to check
 * @returns Rate limit counter or undefined if not found
 */
export function getRateLimitStatus(ip: string): RateLimitCounter | undefined {
  return requestCounts.get(ip);
}
