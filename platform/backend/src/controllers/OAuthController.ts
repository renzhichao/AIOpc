import { Controller, Post, Get, Body, QueryParam, Req, Res, HttpError, Param } from 'routing-controllers';
import { Service } from 'typedi';
import { OAuthService, OAuthPlatformInfo } from '../services/OAuthService';
import { logger } from '../config/logger';
import { AppError, ErrorCodes } from '../utils/errors';
import { LogSanitizer } from '../utils/LogSanitizer';
import { OAuthPlatform } from '../auth/interfaces/OAuthTypes';

/**
 * OAuth 2.0 Controller
 *
 * Handles OAuth 2.0 authorization flow for multiple platforms (Feishu, DingTalk).
 * All endpoints follow RESTful conventions and standardized response formats.
 *
 * Multi-Platform Routes:
 * - GET  /api/oauth/platforms - Get enabled OAuth platforms
 * - GET  /api/oauth/authorize/:platform - Generate authorization URL for specific platform
 * - POST /api/oauth/callback/:platform - Handle OAuth callback for specific platform
 *
 * Platform-Specific Routes (Backward Compatibility):
 * - POST /api/oauth/feishu/callback - Handle Feishu OAuth callback
 * - POST /api/oauth/dingtalk/callback - Handle DingTalk OAuth callback
 *
 * Legacy Routes (Backward Compatibility - defaults to Feishu):
 * - GET  /api/oauth/authorize - Generate Feishu authorization URL
 * - POST /api/oauth/callback - Handle Feishu OAuth callback
 * - POST /api/oauth/refresh - Refresh access token
 * - POST /api/oauth/verify - Verify token validity
 */
@Service()
@Controller('/oauth')
export class OAuthController {
  constructor(
    private readonly oauthService: OAuthService
  ) {}

  /**
   * Get enabled OAuth platforms
   * GET /api/oauth/platforms
   *
   * Returns all configured and enabled OAuth platforms.
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "platforms": [
   *       { "platform": "feishu", "enabled": true, "isDefault": true },
   *       { "platform": "dingtalk", "enabled": true, "isDefault": false }
   *     ]
   *   }
   * }
   */
  @Get('/platforms')
  async getPlatforms() {
    try {
      const platforms = await this.oauthService.getEnabledPlatforms();

      return {
        success: true,
        data: {
          platforms
        }
      };
    } catch (error) {
      LogSanitizer.log('error', 'Failed to get platforms', error);

      throw new AppError(
        500,
        'PLATFORMS_FETCH_FAILED',
        'Failed to fetch available platforms'
      );
    }
  }

  /**
   * Generate authorization URL for specific platform
   * GET /api/oauth/authorize/:platform
   *
   * Query Parameters:
   * - redirect_uri: Optional custom redirect URI
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "url": "https://open.feishu.cn/open-apis/authen/v1/authorize?...",
   *     "platform": "feishu"
   *   }
   * }
   */
  @Get('/authorize/:platform')
  async getAuthorizationUrlForPlatform(
    @Param('platform') platform: string,
    @QueryParam('redirect_uri') redirectUri?: string
  ) {
    try {
      // Validate platform parameter
      const targetPlatform = this.validatePlatform(platform);

      // Validate redirect URI if provided
      if (redirectUri && !this.isValidRedirectUri(redirectUri)) {
        throw new AppError(
          400,
          'INVALID_REDIRECT_URI',
          'Invalid redirect URI format'
        );
      }

      const url = await this.oauthService.getAuthorizationUrl(
        targetPlatform,
        { redirect_uri: redirectUri }
      );

      return {
        success: true,
        data: {
          url,
          platform: targetPlatform
        }
      };
    } catch (error) {
      LogSanitizer.log('error', 'Failed to generate authorization URL', error);

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
   * Handle OAuth callback for specific platform
   * POST /api/oauth/callback/:platform
   *
   * Request Body:
   * {
   *   "code": "authorization_code_from_platform"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "access_token": "jwt_access_token",
   *     "refresh_token": "jwt_refresh_token",
   *     "expires_in": 604800,
   *     "user": { ... }
   *   }
   * }
   */
  @Post('/callback/:platform')
  async handleCallbackForPlatform(
    @Param('platform') platform: string,
    @Body() body: any
  ) {
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
      // Validate platform parameter
      const targetPlatform = this.validatePlatform(platform);

      const tokens = await this.oauthService.handleCallback(authCode, targetPlatform);

      return {
        success: true,
        data: tokens,
        message: 'Authentication successful'
      };
    } catch (error) {
      LogSanitizer.log('error', 'OAuth callback failed', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        401,
        'OAUTH_CALLBACK_FAILED',
        `Failed to process ${platform} OAuth callback`
      );
    }
  }

  /**
   * Handle Feishu OAuth callback (Backward Compatibility)
   * POST /api/oauth/feishu/callback
   *
   * This endpoint maintains backward compatibility with existing Feishu integrations.
   * Internally redirects to /api/oauth/callback/feishu
   */
  @Post('/feishu/callback')
  async handleFeishuCallback(@Body() body: any) {
    return this.handleCallbackForPlatform('feishu', body);
  }

  /**
   * Handle DingTalk OAuth callback (Backward Compatibility)
   * POST /api/oauth/dingtalk/callback
   *
   * This endpoint provides a convenient route for DingTalk OAuth callbacks.
   * Internally redirects to /api/oauth/callback/dingtalk
   */
  @Post('/dingtalk/callback')
  async handleDingtalkCallback(@Body() body: any) {
    return this.handleCallbackForPlatform('dingtalk', body);
  }

  /**
   * Get OAuth authorization URL (Legacy - defaults to Feishu)
   * GET /api/oauth/authorize
   *
   * @deprecated Use /api/oauth/authorize/:platform instead
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

      const url = this.oauthService.getAuthorizationUrl(undefined, { redirect_uri: redirectUri });

      return {
        success: true,
        data: {
          url,
          platform: 'feishu'
        }
      };
    } catch (error) {
      LogSanitizer.log('error', 'Failed to generate authorization URL', error);

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
   * Handle OAuth callback (Legacy - defaults to Feishu)
   * POST /api/oauth/callback
   *
   * @deprecated Use /api/oauth/callback/:platform instead
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
      const tokens = await this.oauthService.handleCallback(authCode, undefined);

      return {
        success: true,
        data: tokens,
        message: 'Authentication successful'
      };
    } catch (error) {
      LogSanitizer.log('error', 'OAuth callback failed', error);

      throw new AppError(
        401,
        'OAUTH_CALLBACK_FAILED',
        'Failed to process OAuth callback'
      );
    }
  }

  /**
   * Refresh access token
   * POST /api/oauth/refresh
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
      LogSanitizer.log('error', 'Token refresh failed', error);

      throw new AppError(
        401,
        'INVALID_REFRESH_TOKEN',
        'Invalid or expired refresh token'
      );
    }
  }

  /**
   * Verify token
   * POST /api/oauth/verify
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
      LogSanitizer.log('error', 'Token verification failed', error);

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
   * Validate platform parameter
   * Ensures the platform is supported and enabled
   *
   * @param platform - Platform string from route parameter
   * @returns Validated OAuthPlatform enum
   * @throws {AppError} If platform is invalid or not enabled
   * @private
   */
  private validatePlatform(platform: string): OAuthPlatform {
    // Case-insensitive platform validation
    const normalizedPlatform = platform.toLowerCase();

    // Check if it's a valid OAuth platform
    if (normalizedPlatform !== 'feishu' && normalizedPlatform !== 'dingtalk') {
      throw new AppError(
        400,
        'INVALID_PLATFORM',
        `Invalid OAuth platform: ${platform}. Supported platforms: feishu, dingtalk`
      );
    }

    // Map to OAuthPlatform enum
    const targetPlatform = normalizedPlatform === 'feishu'
      ? OAuthPlatform.FEISHU
      : OAuthPlatform.DINGTALK;

    return targetPlatform;
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
