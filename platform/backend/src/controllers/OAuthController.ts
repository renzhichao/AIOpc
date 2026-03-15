import { Controller, Post, Get, Body, QueryParam, Req, Res } from 'routing-controllers';
import { Service } from 'typedi';
import { OAuthService } from '../services/OAuthService';
import { logger } from '../config/logger';

/**
 * OAuth 2.0 控制器
 * 处理 OAuth 授权流程相关的 HTTP 请求
 */
@Service()
@Controller('/oauth')
export class OAuthController {
  constructor(
    private readonly oauthService: OAuthService
  ) {}

  /**
   * 获取授权 URL
   * GET /api/oauth/authorize
   */
  @Get('/authorize')
  async getAuthorizationUrl(@QueryParam('redirect_uri') redirectUri?: string) {
    try {
      const url = this.oauthService.getAuthorizationUrl({ redirect_uri: redirectUri });
      return { url };
    } catch (error) {
      logger.error('Failed to generate authorization URL', error);
      return { error: 'Failed to generate authorization URL' };
    }
  }

  /**
   * 处理 OAuth 回调
   * POST /api/oauth/callback
   */
  @Post('/callback')
  async handleCallback(@Body() body: any) {
    const authCode = body.code;

    if (!authCode) {
      return { error: 'Authorization code is required' };
    }

    try {
      const tokens = await this.oauthService.handleCallback(authCode);
      return tokens;
    } catch (error) {
      logger.error('OAuth callback failed', error);
      return { error: 'OAuth callback failed' };
    }
  }

  /**
   * 刷新访问令牌
   * POST /api/oauth/refresh
   */
  @Post('/refresh')
  async refreshToken(@Body() body: any) {
    const refreshToken = body.refresh_token;

    if (!refreshToken) {
      return { error: 'Refresh token is required' };
    }

    try {
      const tokens = await this.oauthService.refreshToken(refreshToken);
      return tokens;
    } catch (error) {
      logger.error('Token refresh failed', error);
      return { error: 'Invalid refresh token' };
    }
  }

  /**
   * 验证令牌（用于调试）
   * POST /api/oauth/verify
   */
  @Post('/verify')
  async verifyToken(@Body() body: any) {
    const token = body.token;

    if (!token) {
      return { error: 'Token is required' };
    }

    try {
      const payload = this.oauthService.verifyToken(token);
      return { valid: true, payload };
    } catch (error) {
      logger.error('Token verification failed', error);
      return { valid: false, error: 'Invalid token' };
    }
  }
}
