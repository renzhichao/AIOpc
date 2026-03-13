import { Request, Response, NextFunction } from 'express';
import { requestLogger, errorLogger } from '../logging';

describe('Logging Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      id: 'test-request-id',
      method: 'GET',
      path: '/api/test',
      query: { param1: 'value1' },
      ip: '127.0.0.1',
      get: jest.fn(),
    };
    mockRes = {
      statusCode: 200,
      on: jest.fn(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestLogger', () => {
    it('should log request and call next', () => {
      requestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should register finish event listener', () => {
      requestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should handle different HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      methods.forEach((method) => {
        const testReq = { ...mockReq, method };
        mockNext = jest.fn();

        requestLogger(testReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
      });
    });

    it('should handle different paths', () => {
      const paths = ['/api/test', '/health', '/api/v1/users', '/'];

      paths.forEach((path) => {
        const testReq = { ...mockReq, path };
        mockNext = jest.fn();

        requestLogger(testReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
      });
    });

    it('should handle requests with query parameters', () => {
      mockReq.query = { search: 'test', page: '1' };

      requestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle requests without query parameters', () => {
      mockReq.query = {};

      requestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should get user agent from request', () => {
      const mockGet = mockReq.get as jest.Mock;
      mockGet.mockReturnValue('Mozilla/5.0');

      requestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(mockGet).toHaveBeenCalledWith('user-agent');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle missing user agent', () => {
      const mockGet = mockReq.get as jest.Mock;
      mockGet.mockReturnValue(undefined);

      requestLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(mockGet).toHaveBeenCalledWith('user-agent');
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('errorLogger', () => {
    it('should log error and call next with error', () => {
      const mockError = new Error('Test error');
      mockError.stack = 'Error: Test error\n    at test.js:10:15';

      errorLogger(mockError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
    });

    it('should log error with all request context', () => {
      const mockError = new Error('Test error');
      mockReq.body = { key: 'value' };
      mockReq.query = { param: 'test' };

      errorLogger(mockError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
    });

    it('should handle errors without stack trace', () => {
      const mockError = new Error('Test error');
      delete (mockError as any).stack;

      errorLogger(mockError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
    });

    it('should handle different error types', () => {
      const errors = [
        new Error('Standard error'),
        new TypeError('Type error'),
        new RangeError('Range error'),
        new SyntaxError('Syntax error'),
      ];

      errors.forEach((error) => {
        mockNext = jest.fn();

        errorLogger(error, mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith(error);
      });
    });

    it('should preserve request properties', () => {
      const mockError = new Error('Test error');
      const testReq = { ...mockReq, method: 'POST', path: '/api/create' };
      testReq.body = { data: 'test' };
      testReq.query = { id: '123' };

      errorLogger(mockError, testReq as Request, mockRes as Response, mockNext);

      expect(testReq.method).toBe('POST');
      expect(testReq.path).toBe('/api/create');
      expect(testReq.body).toEqual({ data: 'test' });
      expect(testReq.query).toEqual({ id: '123' });
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });
  });
});
