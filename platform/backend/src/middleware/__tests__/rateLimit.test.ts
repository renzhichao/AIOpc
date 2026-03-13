import { Request, Response, NextFunction } from 'express';
import { rateLimit, resetRateLimit, getRateLimitStatus } from '../rateLimit';

describe('Rate Limiting Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      id: 'test-request-id',
      ip: '127.0.0.1',
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    // Reset rate limit state between tests
    resetRateLimit('127.0.0.1');
    resetRateLimit('192.168.1.1');
    jest.clearAllMocks();
  });

  describe('rateLimit', () => {
    it('should allow requests within limit', () => {
      const middleware = rateLimit({
        windowMs: 60000,
        maxRequests: 10,
      });

      // Make 5 requests (within limit)
      for (let i = 0; i < 5; i++) {
        middleware(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();

        // Reset mock for next request
        mockNext = jest.fn();
      }
    });

    it('should block requests exceeding limit', () => {
      const middleware = rateLimit({
        windowMs: 60000,
        maxRequests: 3,
      });

      // Make 3 requests (at limit)
      for (let i = 0; i < 3; i++) {
        middleware(mockReq as Request, mockRes as Response, mockNext);
        mockNext = jest.fn();
      }

      // 4th request should be blocked
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
          message: '请求过于频繁，请稍后再试',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should set rate limit headers', () => {
      const middleware = rateLimit({
        windowMs: 60000,
        maxRequests: 100,
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    it('should track rate limit per IP', () => {
      const middleware = rateLimit({
        windowMs: 60000,
        maxRequests: 2,
      });

      // First IP makes 2 requests
      const req1 = { ...mockReq, ip: '192.168.1.1' };
      middleware(req1 as Request, mockRes as Response, mockNext);
      middleware(req1 as Request, mockRes as Response, mockNext);

      // Second IP makes 2 requests
      const req2 = { ...mockReq, ip: '192.168.1.2' };
      mockNext = jest.fn();
      middleware(req2 as Request, mockRes as Response, mockNext);
      mockNext = jest.fn();
      middleware(req2 as Request, mockRes as Response, mockNext);

      // First IP should still be blocked
      mockRes.status = jest.fn().mockReturnThis();
      mockNext = jest.fn();
      middleware(req1 as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
    });

    it('should use default options if not provided', () => {
      const middleware = rateLimit();

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    });

    it('should allow custom window and max requests', () => {
      const middleware = rateLimit({
        windowMs: 30000, // 30 seconds
        maxRequests: 5,
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
    });

    it('should provide retry after timestamp when rate limited', () => {
      const middleware = rateLimit({
        windowMs: 60000,
        maxRequests: 1,
      });

      // First request passes
      middleware(mockReq as Request, mockRes as Response, mockNext);
      mockNext = jest.fn();

      // Second request is blocked
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          retryAfter: expect.any(Number),
        })
      );
    });

    it('should handle zero max requests', () => {
      const middleware = rateLimit({
        windowMs: 60000,
        maxRequests: 0,
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for specific IP', () => {
      const middleware = rateLimit({
        windowMs: 60000,
        maxRequests: 2,
      });

      // Exhaust rate limit
      middleware(mockReq as Request, mockRes as Response, mockNext);
      mockNext = jest.fn();
      middleware(mockReq as Request, mockRes as Response, mockNext);
      mockNext = jest.fn();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);

      // Reset rate limit
      resetRateLimit('127.0.0.1');

      // Request should now pass
      mockRes.status = jest.fn().mockReturnThis();
      mockNext = jest.fn();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalledWith(429);
    });

    it('should handle resetting non-existent IP', () => {
      expect(() => {
        resetRateLimit('non-existent-ip');
      }).not.toThrow();
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return rate limit status for IP', () => {
      const middleware = rateLimit({
        windowMs: 60000,
        maxRequests: 10,
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);

      const status = getRateLimitStatus('127.0.0.1');

      expect(status).toBeDefined();
      expect(status?.count).toBe(1);
      expect(status?.resetTime).toBeGreaterThan(Date.now());
    });

    it('should return undefined for non-existent IP', () => {
      const status = getRateLimitStatus('non-existent-ip');

      expect(status).toBeUndefined();
    });

    it('should update count for each request', () => {
      const middleware = rateLimit({
        windowMs: 60000,
        maxRequests: 10,
      });

      middleware(mockReq as Request, mockRes as Response, mockNext);
      let status = getRateLimitStatus('127.0.0.1');
      expect(status?.count).toBe(1);

      middleware(mockReq as Request, mockRes as Response, mockNext);
      status = getRateLimitStatus('127.0.0.1');
      expect(status?.count).toBe(2);
    });
  });
});
