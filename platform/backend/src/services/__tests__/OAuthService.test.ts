import { OAuthService } from '../OAuthService';
import { UserRepository } from '../../repositories/UserRepository';
import axios from 'axios';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('axios');
jest.mock('jsonwebtoken');
jest.mock('../../config/logger');

describe('OAuthService', () => {
  let oauthService: OAuthService;
  let mockUserRepository: jest.Mocked<UserRepository>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock UserRepository
    mockUserRepository = {
      findOrCreate: jest.fn(),
      updateLastLogin: jest.fn()
    } as any;

    // Create OAuthService instance
    oauthService = new OAuthService(mockUserRepository);

    // Set up environment variables
    process.env.FEISHU_APP_ID = 'test_app_id';
    process.env.FEISHU_APP_SECRET = 'test_app_secret';
    process.env.FEISHU_REDIRECT_URI = 'http://localhost:5173/oauth/callback';
    process.env.FEISHU_OAUTH_AUTHORIZE_URL = 'https://open.feishu.cn/open-apis/authen/v1/authorize';
    process.env.FEISHU_OAUTH_TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token';
    process.env.FEISHU_USER_INFO_URL = 'https://open.feishu.cn/open-apis/authen/v1/user_info';
    process.env.JWT_SECRET = 'test_jwt_secret';
    process.env.JWT_EXPIRES_IN = '7d';
    process.env.JWT_REFRESH_EXPIRES_IN = '30d';
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct authorization URL with default options', () => {
      const url = oauthService.getAuthorizationUrl();

      expect(url).toContain('https://open.feishu.cn/open-apis/authen/v1/authorize');
      expect(url).toContain('app_id=test_app_id');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Foauth%2Fcallback');
      expect(url).toContain('scope=contact%3Auser.base%3Areadonly');
      expect(url).toContain('state=');
    });

    it('should generate authorization URL with custom redirect URI', () => {
      const customRedirectUri = 'http://custom.example.com/callback';
      const url = oauthService.getAuthorizationUrl({ redirect_uri: customRedirectUri });

      expect(url).toContain('redirect_uri=http%3A%2F%2Fcustom.example.com%2Fcallback');
    });

    it('should generate authorization URL with custom scope', () => {
      const customScope = 'contact:user.base:readonly contact:user.email:readonly';
      const url = oauthService.getAuthorizationUrl({ scope: customScope });

      // URL encoding can use either %20 or + for spaces
      expect(url).toContain('scope=contact%3Auser.base%3Areadonly');
      expect(url).toContain('contact%3Auser.email%3Areadonly');
    });
  });

  describe('handleCallback', () => {
    const mockAuthCode = 'test_auth_code';
    const mockAccessToken = 'test_access_token';
    const mockFeishuUserInfo = {
      user_id: 'test_feishu_user_id',
      name: 'Test User',
      en_name: 'Test User',
      email: 'test@example.com',
      avatar_url: 'https://example.com/avatar.jpg',
      union_id: 'test_union_id',
      open_id: 'test_open_id'
    };
    const mockDbUser = {
      id: 1,
      feishu_user_id: 'test_feishu_user_id',
      feishu_union_id: 'test_union_id',
      name: 'Test User',
      email: 'test@example.com',
      avatar_url: 'https://example.com/avatar.jpg'
    };

    beforeEach(() => {
      // Mock axios.post for token exchange
      (axios.post as jest.Mock).mockResolvedValue({
        data: {
          code: 0,
          access_token: mockAccessToken,
          token_type: 'Bearer',
          expires_in: 7200,
          refresh_token: 'test_refresh_token'
        }
      });

      // Mock axios.get for user info
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          code: 0,
          data: mockFeishuUserInfo
        }
      });

      // Mock UserRepository.findOrCreate
      mockUserRepository.findOrCreate.mockResolvedValue(mockDbUser as any);

      // Mock jwt.sign
      (jwt.sign as jest.Mock).mockReturnValue('mock_jwt_token');
    });

    it('should exchange code for tokens and create user', async () => {
      const result = await oauthService.handleCallback(mockAuthCode);

      // Verify axios.post was called with correct parameters
      expect(axios.post).toHaveBeenCalledWith(
        'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
        {
          grant_type: 'authorization_code',
          client_id: 'test_app_id',
          client_secret: 'test_app_secret',
          code: mockAuthCode
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      // Verify axios.get was called for user info
      expect(axios.get).toHaveBeenCalledWith(
        'https://open.feishu.cn/open-apis/authen/v1/user_info',
        {
          headers: {
            'Authorization': `Bearer ${mockAccessToken}`
          }
        }
      );

      // Verify user repository operations
      expect(mockUserRepository.findOrCreate).toHaveBeenCalledWith({
        feishu_user_id: mockFeishuUserInfo.user_id,
        feishu_union_id: mockFeishuUserInfo.union_id,
        name: mockFeishuUserInfo.name,
        email: mockFeishuUserInfo.email,
        avatar_url: mockFeishuUserInfo.avatar_url
      });
      expect(mockUserRepository.updateLastLogin).toHaveBeenCalledWith(1);

      // Verify response structure
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('expires_in');
      expect(result).toHaveProperty('token_type', 'Bearer');
      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('id', 1);
      expect(result.user).toHaveProperty('feishu_user_id', 'test_feishu_user_id');
      expect(result.user).toHaveProperty('name', 'Test User');
    });

    it('should handle token exchange error', async () => {
      // Mock error response from Feishu
      (axios.post as jest.Mock).mockResolvedValue({
        data: {
          code: 9999,
          msg: 'Invalid authorization code'
        }
      });

      await expect(oauthService.handleCallback(mockAuthCode)).rejects.toThrow();
    });

    it('should handle user info fetch error', async () => {
      // Mock successful token exchange
      (axios.post as jest.Mock).mockResolvedValue({
        data: {
          code: 0,
          access_token: mockAccessToken
        }
      });

      // Mock error response from user info endpoint
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          code: 9999,
          msg: 'Invalid access token'
        }
      });

      await expect(oauthService.handleCallback(mockAuthCode)).rejects.toThrow();
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const mockRefreshToken = 'mock_refresh_token';
      const mockPayload = {
        userId: 1,
        feishuUserId: 'test_feishu_user_id',
        name: 'Test User'
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);
      (jwt.sign as jest.Mock).mockReturnValue('new_access_token');

      const result = await oauthService.refreshToken(mockRefreshToken);

      expect(jwt.verify).toHaveBeenCalledWith(mockRefreshToken, 'test_jwt_secret');
      expect(jwt.sign).toHaveBeenCalled();
      expect(result).toHaveProperty('access_token', 'new_access_token');
    });

    it('should throw error for invalid refresh token', async () => {
      const invalidToken = 'invalid_token';

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(oauthService.refreshToken(invalidToken)).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('verifyToken', () => {
    it('should verify valid JWT token', () => {
      const mockPayload = {
        userId: 1,
        feishuUserId: 'test_feishu_user_id',
        name: 'Test User'
      };

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const result = oauthService.verifyToken('valid_token');

      expect(jwt.verify).toHaveBeenCalledWith('valid_token', 'test_jwt_secret');
      expect(result).toEqual(mockPayload);
    });

    it('should throw error for invalid token', () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => oauthService.verifyToken('invalid_token')).toThrow('Invalid token');
    });

    it('should throw error for expired token', () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Token expired');
      });

      expect(() => oauthService.verifyToken('expired_token')).toThrow();
    });
  });
});
