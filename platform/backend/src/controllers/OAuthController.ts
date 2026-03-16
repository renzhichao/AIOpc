import { Controller, Post, Get, Body, QueryParam, Req, Res, HttpError } from 'routing-controllers';
import { Service } from 'typedi';
import { OAuthService } from '../services/OAuthService';
import { logger } from '../config/logger';
import { AppError, ErrorCodes } from '../utils/errors';

/**
 * OAuth 2.0 Controller
 *
 * Handles OAuth 2.0 authorization flow for Feishu integration.
 * All endpoints follow RESTful conventions and standardized response formats.
 *
 * Routes:
 * - GET  /api/v1/oauth/authorize - Generate authorization URL
 * - POST /api/v1/oauth/callback - Handle OAuth callback
 * - POST /api/v1/oauth/refresh - Refresh access token
 * - POST /api/v1/oauth/verify - Verify token validity
 */
@Service()
@Controller('/oauth')
export class OAuthController {
  constructor(
    private readonly oauthService: OAuthService
  ) {}

  /**
   * Get OAuth authorization URL
   * GET /api/v1/oauth/authorize
   *
   * Generates the Feishu OAuth authorization URL for user login.
   *
   * Query Parameters:
   * - redirect_uri: Optional custom redirect URI
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "url": "https://open.feishu.cn/open-apis/authen/v1/authorize?..."
   *   }
   * }
   */
  @Get('/authorize')
  async getAuthorizationUrl(@QueryParam('redirect_uri') redirectUri?: string) {
    try {
      // Validate redirect URI if provided
      if (redirectUri && !this.isValidRedirectUri(redirectUri)) {
        throw new AppError(
          400,
          'INVALID_REDIRECT_URI',
          'Invalid redirect URI format'
        );
      }

      const url = this.oauthService.getAuthorizationUrl({ redirect_uri: redirectUri });

      return { url };
    } catch (error) {
      logger.error('Failed to generate authorization URL', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        500,
        'AUTH_URL_GENERATION_FAILED',
        'Failed to generate authorization URL'
      );
    }
  }

  /**
   * Handle OAuth callback
   * POST /api/v1/oauth/callback
   *
   * Processes the OAuth callback from Feishu and exchanges authorization code for tokens.
   *
   * Request Body:
   * {
   *   "code": "authorization_code_from_feishu"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "access_token": "jwt_access_token",
   *     "refresh_token": "jwt_refresh_token",
   *     "expires_in": 3600,
   *     "user": { ... }
   *   }
   * }
   */
  @Post('/callback')
  async handleCallback(@Body() body: any) {
    const authCode = body.code;

    // Validate required fields
    if (!authCode) {
      throw new AppError(
        400,
        'MISSING_AUTH_CODE',
        'Authorization code is required'
      );
    }

    try {
      const tokens = await this.oauthService.handleCallback(authCode);

      return {
        success: true,
        data: tokens,
        message: 'Authentication successful'
      };
    } catch (error) {
      logger.error('OAuth callback failed', error);

      throw new AppError(
        401,
        'OAUTH_CALLBACK_FAILED',
        'Failed to process OAuth callback'
      );
    }
  }

  /**
   * Refresh access token
   * POST /api/v1/oauth/refresh
   *
   * Refreshes an expired access token using a valid refresh token.
   *
   * Request Body:
   * {
   *   "refresh_token": "jwt_refresh_token"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "access_token": "new_jwt_access_token",
   *     "refresh_token": "new_jwt_refresh_token",
   *     "expires_in": 3600
   *   }
   * }
   */
  @Post('/refresh')
  async refreshToken(@Body() body: any) {
    const refreshToken = body.refresh_token;

    // Validate required fields
    if (!refreshToken) {
      throw new AppError(
        400,
        'MISSING_REFRESH_TOKEN',
        'Refresh token is required'
      );
    }

    try {
      const tokens = await this.oauthService.refreshToken(refreshToken);

      return {
        success: true,
        data: tokens,
        message: 'Token refreshed successfully'
      };
    } catch (error) {
      logger.error('Token refresh failed', error);

      throw new AppError(
        401,
        'INVALID_REFRESH_TOKEN',
        'Invalid or expired refresh token'
      );
    }
  }

  /**
   * Verify token
   * POST /api/v1/oauth/verify
   *
   * Verifies a JWT token and returns its payload.
   * Useful for debugging and token validation.
   *
   * Request Body:
   * {
   *   "token": "jwt_token_to_verify"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "valid": true,
   *     "payload": { ... }
   *   }
   * }
   */
  @Post('/verify')
  async verifyToken(@Body() body: any) {
    const token = body.token;

    // Validate required fields
    if (!token) {
      throw new AppError(
        400,
        'MISSING_TOKEN',
        'Token is required'
      );
    }

    try {
      const payload = this.oauthService.verifyToken(token);

      return {
        success: true,
        data: {
          valid: true,
          payload
        }
      };
    } catch (error) {
      logger.error('Token verification failed', error);

      return {
        success: true,
        data: {
          valid: false,
          error: 'Invalid or expired token'
        }
      };
    }
  }

  /**
   * Validate redirect URI format
   * Private helper method
   */
  private isValidRedirectUri(uri: string): boolean {
    try {
      const url = new URL(uri);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
