import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../asyncHandler';
import { AppError } from '../../utils/errors/AppError';

describe('asyncHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      path: '/test',
      method: 'GET',
      body: {},
      query: {},
      params: {}
    };
    mockRes = {};
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call next with error when async function throws', async () => {
    const error = new Error('Test error');
    const asyncFn = jest.fn().mockRejectedValue(error);

    const handler = asyncHandler(asyncFn);

    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(error);
    expect(asyncFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
  });

  it('should call next with AppError when async function throws AppError', async () => {
    const error = new AppError(500, 'TEST_ERROR', 'Test error');
    const asyncFn = jest.fn().mockRejectedValue(error);

    const handler = asyncHandler(asyncFn);

    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(error);
  });

  it('should resolve when async function succeeds', async () => {
    const asyncFn = jest.fn().mockResolvedValue('success');

    const handler = asyncHandler(asyncFn);

    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(asyncFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should include request context in error logging', async () => {
    mockReq = {
      ...mockReq,
      path: '/api/test',
      method: 'POST',
      body: { test: 'data' },
      query: { filter: 'active' },
      params: { id: '123' }
    };

    const error = new Error('Test error');
    const asyncFn = jest.fn().mockRejectedValue(error);

    const handler = asyncHandler(asyncFn);

    await handler(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(error);
    expect(asyncFn).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/test',
        method: 'POST',
        body: { test: 'data' },
        query: { filter: 'active' },
        params: { id: '123' }
      }),
      mockRes,
      mockNext
    );
  });
});
