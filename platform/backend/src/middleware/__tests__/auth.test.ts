import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, optionalAuth } from '../auth';

describe('Authentication Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      id: 'test-request-id',
      ip: '127.0.0.1',
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();

    // Set JWT secret for testing
    process.env.JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should pass with valid token', () => {
      const token = jwt.sign(
        {
          userId: 1,
          feishuUserId: 'test_feishu_id',
          name: 'Test User',
          email: 'test@example.com',
        },
        'test-secret'
      );

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user?.userId).toBe(1);
      expect(mockReq.user?.feishuUserId).toBe('test_feishu_id');
      expect(mockReq.user?.name).toBe('Test User');
      expect(mockReq.user?.email).toBe('test@example.com');
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should fail without token', () => {
      mockReq.headers = {};

      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'UNAUTHORIZED',
          message: '未提供认证令牌',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should fail with malformed authorization header', () => {
      mockReq.headers = {
        authorization: 'InvalidFormat token',
      };

      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'UNAUTHORIZED',
          message: '未提供认证令牌',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should fail with invalid token', () => {
      mockReq.headers = {
        authorization: 'Bearer invalid-token',
      };

      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'INVALID_TOKEN',
          message: '无效的令牌',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should fail with expired token', () => {
      const expiredToken = jwt.sign(
        {
          userId: 1,
          feishuUserId: 'test',
          name: 'Test',
        },
        'test-secret',
        { expiresIn: '-1h' }
      );

      mockReq.headers = {
        authorization: `Bearer ${expiredToken}`,
      };

      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: '令牌已过期，请重新登录',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should fail with token signed with wrong secret', () => {
      const token = jwt.sign(
        {
          userId: 1,
          feishuUserId: 'test',
          name: 'Test',
        },
        'wrong-secret'
      );

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle token without email', () => {
      const token = jwt.sign(
        {
          userId: 1,
          feishuUserId: 'test_feishu_id',
          name: 'Test User',
        },
        'test-secret'
      );

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user?.userId).toBe(1);
      expect(mockReq.user?.email).toBeUndefined();
    });
  });

  describe('optionalAuth', () => {
    it('should pass and attach user with valid token', () => {
      const token = jwt.sign(
        {
          userId: 1,
          feishuUserId: 'test',
          name: 'Test User',
          email: 'test@example.com',
        },
        'test-secret'
      );

      mockReq.headers = {
        authorization: `Bearer ${token}`,
      };

      optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user?.userId).toBe(1);
      expect(mockReq.user?.email).toBe('test@example.com');
    });

    it('should pass without token', () => {
      mockReq.headers = {};

      optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeUndefined();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should pass with invalid token and not attach user', () => {
      mockReq.headers = {
        authorization: 'Bearer invalid-token',
      };

      optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeUndefined();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should pass with expired token and not attach user', () => {
      const expiredToken = jwt.sign(
        {
          userId: 1,
          feishuUserId: 'test',
          name: 'Test',
        },
        'test-secret',
        { expiresIn: '-1h' }
      );

      mockReq.headers = {
        authorization: `Bearer ${expiredToken}`,
      };

      optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeUndefined();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});
