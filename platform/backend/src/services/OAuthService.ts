import { Service } from 'typedi';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../repositories/UserRepository';
import { logger } from '../config/logger';
import type { StringValue } from 'ms';
import {
  FeishuAuthUrlOptions,
  FeishuTokenResponse,
  FeishuUserInfo,
  JwtPayload,
  OAuthTokenResponse
} from '../types/oauth.types';

/**
 * OAuth 2.0 服务
 * 处理飞书授权流程、Token 管理和用户认证
 */
@Service()
export class OAuthService {
  constructor(
    private readonly userRepository: UserRepository
  ) {}

  /**
   * 生成飞书授权 URL
   * @param options 授权 URL 选项
   * @returns 飞书授权 URL
   */
  getAuthorizationUrl(options: FeishuAuthUrlOptions = {}): string {
    const {
      state = this.generateState(),
      redirect_uri = process.env.FEISHU_REDIRECT_URI,
      scope = 'contact:user.base:readonly'
    } = options;

    const params = new URLSearchParams({
      app_id: process.env.FEISHU_APP_ID!,
      redirect_uri: redirect_uri!,
      scope: scope,
      state: state
    });

    const url = `${process.env.FEISHU_OAUTH_AUTHORIZE_URL}?${params}`;

    logger.info('Generated Feishu authorization URL', { state });
    return url;
  }

  /**
   * 处理 OAuth 回调并交换授权码获取 Token
   * @param authCode 授权码
   * @returns OAuth Token 响应
   */
  async handleCallback(authCode: string): Promise<OAuthTokenResponse> {
    try {
      // 1. 使用授权码换取访问令牌
      const tokenResponse = await this.exchangeCodeForToken(authCode);

      // 2. 从飞书获取用户信息
      const userInfo = await this.getUserInfo(tokenResponse.access_token);

      // 3. 在数据库中查找或创建用户
      const user = await this.userRepository.findOrCreate({
        feishu_user_id: userInfo.user_id,
        feishu_union_id: userInfo.union_id,
        name: userInfo.name,
        email: userInfo.email || undefined,
        avatar_url: userInfo.avatar_url
      });

      // 4. 更新最后登录时间
      await this.userRepository.updateLastLogin(user.id);

      // 5. 生成 JWT Token
      const jwtPayload: JwtPayload = {
        userId: user.id,
        feishuUserId: user.feishu_user_id,
        feishuUnionId: user.feishu_union_id || undefined,
        name: user.name,
        email: user.email || undefined
      };

      const accessToken = this.generateJWTToken(jwtPayload);
      const refreshToken = this.generateRefreshToken(jwtPayload);

      logger.info('OAuth callback successful', { userId: user.id });

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: parseInt(process.env.JWT_EXPIRES_IN || '604800'), // 7 天
        token_type: 'Bearer',
        user: {
          id: user.id,
          feishu_user_id: user.feishu_user_id,
          name: user.name,
          email: user.email
        }
      };
    } catch (error) {
      logger.error('OAuth callback failed', error);
      throw new Error('OAuth callback failed');
    }
  }

  /**
   * 刷新 JWT Token
   * @param refreshToken 刷新令牌
   * @returns 新的访问令牌
   */
  async refreshToken(refreshToken: string): Promise<{ access_token: string }> {
    try {
      const payload = jwt.verify(
        refreshToken,
        process.env.JWT_SECRET!
      ) as JwtPayload;

      // 生成新的访问令牌
      const newAccessToken = this.generateJWTToken({
        userId: payload.userId,
        feishuUserId: payload.feishuUserId,
        feishuUnionId: payload.feishuUnionId,
        name: payload.name,
        email: payload.email
      });

      logger.info('Token refresh successful', { userId: payload.userId });

      return { access_token: newAccessToken };
    } catch (error) {
      logger.error('Token refresh failed', error);
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * 验证 JWT Token
   * @param token JWT Token
   * @returns Token 载荷
   */
  verifyToken(token: string): JwtPayload {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      return payload;
    } catch (error) {
      logger.error('Token verification failed', error);
      throw new Error('Invalid token');
    }
  }

  /**
   * 使用授权码换取访问令牌（私有方法）
   * @param authCode 授权码
   * @returns 飞书 Token 响应
   */
  private async exchangeCodeForToken(authCode: string): Promise<FeishuTokenResponse> {
    try {
      const response = await axios.post<FeishuTokenResponse>(
        process.env.FEISHU_OAUTH_TOKEN_URL!,
        {
          grant_type: 'authorization_code',
          client_id: process.env.FEISHU_APP_ID,
          client_secret: process.env.FEISHU_APP_SECRET,
          code: authCode
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.code !== 0) {
        throw new Error(`Feishu API error: ${response.data.msg}`);
      }

      return response.data;
    } catch (error) {
      logger.error('Failed to exchange code for token', error);
      throw new Error('Failed to exchange authorization code');
    }
  }

  /**
   * 从飞书获取用户信息（私有方法）
   * @param accessToken 访问令牌
   * @returns 飞书用户信息
   */
  private async getUserInfo(accessToken: string): Promise<FeishuUserInfo> {
    try {
      const response = await axios.get<{ code: number; data: FeishuUserInfo }>(
        process.env.FEISHU_USER_INFO_URL!,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (response.data.code !== 0) {
        throw new Error(`Feishu API error: ${response.data.code}`);
      }

      return response.data.data;
    } catch (error) {
      logger.error('Failed to get user info', error);
      throw new Error('Failed to fetch user information');
    }
  }

  /**
   * 生成 JWT 访问令牌（私有方法）
   * @param payload Token 载荷
   * @returns JWT Token
   */
  private generateJWTToken(payload: JwtPayload): string {
    const tokenExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
    return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: tokenExpiresIn as StringValue | number });
  }

  /**
   * 生成 JWT 刷新令牌（私有方法）
   * @param payload Token 载荷
   * @returns JWT Token
   */
  private generateRefreshToken(payload: JwtPayload): string {
    const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
    return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: refreshExpiresIn as StringValue | number });
  }

  /**
   * 生成随机状态参数（私有方法）
   * @returns 随机字符串
   */
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }
}
