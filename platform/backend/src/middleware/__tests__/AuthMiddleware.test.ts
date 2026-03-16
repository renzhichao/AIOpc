const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

describe('AuthMiddleware (TASK-002)', () => {
  let mockReq;
  let mockRes;
  let mockNext;
  let mockOAuthService;
  let AuthMiddleware;
  let Container;
  let OAuthService;

  beforeEach(() => {
    // Import modules inside beforeEach to avoid initialization issues
    const typedi = require('typedi');
    Container = typedi.Container;

    // Use compiled dist version to avoid TypeScript parsing issues
    const authMiddleware = require('../../../dist/middleware/AuthMiddleware');
    AuthMiddleware = authMiddleware.AuthMiddleware;

    const oauthService = require('../../../dist/services/OAuthService');
    OAuthService = oauthService.OAuthService;

    // Create fresh mocks for each test
    mockReq = {
      headers: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();

    // Create a mock OAuthService instance
    mockOAuthService = {
      verifyToken: jest.fn(),
    };

    // Set the mock in the container
    Container.set(OAuthService, mockOAuthService);
  });

  afterEach(() => {
    // Reset mocks after each test
    jest.clearAllMocks();
    Container.reset();
  });

  it('should extract and validate valid Bearer token', async () => {
    // Arrange
    const mockPayload = {
      userId: 1,
      feishuUserId: 'feishu_123',
      name: 'Test User',
      email: 'test@example.com'
    };

    mockOAuthService.verifyToken.mockReturnValue(mockPayload);
    mockReq.headers = {
      authorization: 'Bearer valid_token_here'
    };

    // Act
    AuthMiddleware(mockReq, mockRes, mockNext);

    // Assert
    expect(mockOAuthService.verifyToken).toHaveBeenCalledWith('valid_token_here');
    expect(mockReq.user).toEqual(mockPayload);
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should return 401 when authorization header is missing', async () => {
    // Arrange
    mockReq.headers = {};

    // Act
    AuthMiddleware(mockReq, mockRes, mockNext);

    // Assert
    expect(mockOAuthService.verifyToken).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header'
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 when token is invalid', async () => {
    // Arrange
    mockReq.headers = {
      authorization: 'Bearer invalid_token'
    };

    mockOAuthService.verifyToken.mockImplementation(() => {
      throw new Error('Invalid token');
    });

    // Act
    AuthMiddleware(mockReq, mockRes, mockNext);

    // Assert
    expect(mockOAuthService.verifyToken).toHaveBeenCalledWith('invalid_token');
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should handle malformed authorization header', async () => {
    // Arrange
    mockReq.headers = {
      authorization: 'InvalidFormat token'
    };

    // Act
    AuthMiddleware(mockReq, mockRes, mockNext);

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should handle Bearer without token', async () => {
    // Arrange
    mockReq.headers = {
      authorization: 'Bearer '
    };

    // Act
    AuthMiddleware(mockReq, mockRes, mockNext);

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should handle token with only whitespace', async () => {
    // Arrange
    mockReq.headers = {
      authorization: 'Bearer   '
    };

    // Act
    AuthMiddleware(mockReq, mockRes, mockNext);

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should reject token without Bearer prefix', async () => {
    // Arrange
    mockReq.headers = {
      authorization: 'valid_token_here'
    };

    // Act
    AuthMiddleware(mockReq, mockRes, mockNext);

    // Assert
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
