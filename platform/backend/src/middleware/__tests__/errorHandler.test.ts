import { Request, Response, NextFunction } from 'express';
import { errorHandler, notFoundHandler } from '../errorHandler';
import { AppError } from '../../utils/errors/AppError';

describe('errorHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      get: jest.fn()
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('AppError handling', () => {
    it('should handle AppError with correct status code', () => {
      const error = new AppError(
        404,
        'NOT_FOUND',
        'Resource not found',
        { resource: 'User' },
        '用户不存在'
      );

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'NOT_FOUND',
          message: '用户不存在',
          details: { resource: 'User' }
        })
      );
    });

    it('should include timestamp in response', () => {
      const error = new AppError(500, 'INTERNAL_ERROR', 'Internal error');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String)
        })
      );
    });

    it('should handle AppError without userMessage', () => {
      const error = new AppError(400, 'VALIDATION_ERROR', 'Validation failed');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Validation failed'
        })
      );
    });

    it('should include actions if provided', () => {
      const error = new AppError(
        400,
        'VALIDATION_ERROR',
        'Validation failed',
        undefined,
        '验证失败',
        ['检查输入', '重新提交']
      );

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          actions: ['检查输入', '重新提交']
        })
      );
    });

    it('should handle different error codes', () => {
      const errors = [
        new AppError(401, 'UNAUTHORIZED', 'Unauthorized'),
        new AppError(403, 'FORBIDDEN', 'Forbidden'),
        new AppError(404, 'NOT_FOUND', 'Not found'),
        new AppError(500, 'INTERNAL_ERROR', 'Internal error')
      ];

      errors.forEach(error => {
        errorHandler(
          error,
          mockReq as Request,
          mockRes as Response,
          mockNext
        );

        expect(mockRes.status).toHaveBeenCalledWith(error.statusCode);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            code: error.code
          })
        );
      });
    });
  });

  describe('Generic Error handling', () => {
    it('should handle generic Error with 500 status', () => {
      const error = new Error('Generic error');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误，请稍后重试'
        })
      );
    });

    it('should use error statusCode if available', () => {
      const error = new Error('Not found');
      (error as any).statusCode = 404;
      (error as any).code = 'NOT_FOUND';

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'NOT_FOUND'
        })
      );
    });

    it('should include error details in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Development error');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          details: {
            error: 'Development error',
            stack: expect.any(String)
          }
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should not include error details in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Production error');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      const response = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(response.details).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Request context', () => {
    it('should include request context in error logging', () => {
      const error = new AppError(500, 'TEST_ERROR', 'Test error');
      mockReq = {
        ...mockReq,
        path: '/api/test',
        method: 'POST',
        ip: '192.168.1.1',
        get: jest.fn().mockReturnValue('TestAgent/1.0')
      };

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockReq.get).toHaveBeenCalledWith('user-agent');
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});

describe('notFoundHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      path: '/undefined-route',
      method: 'GET'
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 404 for undefined routes', () => {
    notFoundHandler(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'NOT_FOUND'
      })
    );
  });

  it('should include route information in message', () => {
    mockReq = {
      ...mockReq,
      path: '/api/users/123',
      method: 'DELETE'
    };

    notFoundHandler(mockReq as Request, mockRes as Response);

    const response = (mockRes.json as jest.Mock).mock.calls[0][0];
    expect(response.message).toContain('DELETE');
    expect(response.message).toContain('/api/users/123');
  });

  it('should include timestamp', () => {
    notFoundHandler(mockReq as Request, mockRes as Response);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: expect.any(String)
      })
    );
  });
});
