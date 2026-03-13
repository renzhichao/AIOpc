import { Request, Response, NextFunction } from 'express';
import { tenantIsolation } from '../tenantIsolation';

describe('Tenant Isolation Middleware', () => {
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
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass and add user filter when user is authenticated', () => {
    const mockUser = {
      userId: 123,
      feishuUserId: 'feishu_123',
      name: 'Test User',
      email: 'test@example.com',
    };

    mockReq.user = mockUser;

    tenantIsolation(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.userFilter).toBeDefined();
    expect(mockReq.userFilter?.owner_id).toBe(123);
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should fail when user is not authenticated', () => {
    mockReq.user = undefined;

    tenantIsolation(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'UNAUTHORIZED',
        message: '需要登录',
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockReq.userFilter).toBeUndefined();
  });

  it('should correctly set owner_id from different user IDs', () => {
    const userIds = [1, 100, 9999, 12345];

    userIds.forEach((userId) => {
      const testReq = {
        ...mockReq,
        user: {
          userId,
          feishuUserId: `feishu_${userId}`,
          name: `User ${userId}`,
        },
      };
      (testReq as any).userFilter = undefined;

      tenantIsolation(testReq as Request, mockRes as Response, mockNext);

      expect((testReq as any).userFilter?.owner_id).toBe(userId);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  it('should handle users without email', () => {
    mockReq.user = {
      userId: 456,
      feishuUserId: 'feishu_456',
      name: 'User Without Email',
    };

    tenantIsolation(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.userFilter).toBeDefined();
    expect(mockReq.userFilter?.owner_id).toBe(456);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should preserve existing user properties', () => {
    const originalUser = {
      userId: 789,
      feishuUserId: 'feishu_789',
      name: 'Original User',
      email: 'original@example.com',
    };

    mockReq.user = { ...originalUser };

    tenantIsolation(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.user).toEqual(originalUser);
    expect(mockReq.user?.userId).toBe(789);
    expect(mockReq.user?.feishuUserId).toBe('feishu_789');
    expect(mockReq.user?.name).toBe('Original User');
    expect(mockReq.user?.email).toBe('original@example.com');
  });
});
