import { Request, Response, NextFunction } from 'express';
import { requestId } from '../requestId';

describe('Request ID Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      method: 'GET',
      path: '/test',
      ip: '127.0.0.1',
    };
    mockRes = {
      setHeader: jest.fn(),
      on: jest.fn(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate request ID if not provided', () => {
    requestId(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.id).toBeDefined();
    expect(mockReq.id).toMatch(/^[a-f0-9-]{36}$/); // UUID format
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-ID', mockReq.id);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should use provided request ID from header', () => {
    const customRequestId = 'custom-request-id-123';
    mockReq.headers = {
      'x-request-id': customRequestId,
    };

    requestId(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.id).toBe(customRequestId);
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-ID', customRequestId);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should call next', () => {
    requestId(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should register finish event listener', () => {
    requestId(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('should handle different request methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

    methods.forEach((method) => {
      const testReq = { ...mockReq, method };
      testReq.id = undefined as any;

      requestId(testReq as Request, mockRes as Response, mockNext);

      expect(testReq.id).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  it('should handle different paths', () => {
    const paths = ['/api/test', '/health', '/api/v1/users', '/'];

    paths.forEach((path) => {
      const testReq = { ...mockReq, path };
      testReq.id = undefined as any;

      requestId(testReq as Request, mockRes as Response, mockNext);

      expect(testReq.id).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  it('should handle empty string request ID header', () => {
    mockReq.headers = {
      'x-request-id': '',
    };

    requestId(mockReq as Request, mockRes as Response, mockNext);

    // Empty string is falsy, so it should generate a new UUID
    expect(mockReq.id).toBeDefined();
    expect(mockReq.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle X-Request-ID header with different casing', () => {
    const customId = 'test-id-123';
    // Note: Express lowercases all headers automatically
    mockReq.headers = {
      'x-request-id': customId,
    };

    requestId(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.id).toBe(customId);
  });
});
