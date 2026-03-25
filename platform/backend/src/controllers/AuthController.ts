import { Controller, Post, Body } from 'routing-controllers';
import { Service } from 'typedi';
import { OAuthController } from './OAuthController';

/**
 * Auth Controller (Alias for OAuth)
 *
 * Provides /api/auth/* routes as aliases to /api/oauth/* routes.
 * This is necessary because some OAuth providers (like DingTalk)
 * have registered callback URLs with /api/auth/* path.
 *
 * Routes:
 * - POST /api/auth/dingtalk/callback - Handle DingTalk OAuth callback
 * - POST /api/auth/feishu/callback - Handle Feishu OAuth callback
 *
 * @deprecated Use /api/oauth/* routes instead. This controller exists
 * solely for backward compatibility with registered OAuth redirect URIs.
 */
@Service()
@Controller('/auth')
export class AuthController {
  constructor(
    private readonly oauthController: OAuthController
  ) {}

  /**
   * Handle DingTalk OAuth callback
   * POST /api/auth/dingtalk/callback
   *
   * This route is an alias for /api/oauth/dingtalk/callback
   * It exists because the DingTalk app is registered with this callback URL.
   */
  @Post('/dingtalk/callback')
  async handleDingtalkCallback(@Body() body: any) {
    return this.oauthController.handleDingtalkCallback(body);
  }

  /**
   * Handle Feishu OAuth callback
   * POST /api/auth/feishu/callback
   *
   * This route is an alias for /api/oauth/feishu/callback
   */
  @Post('/feishu/callback')
  async handleFeishuCallback(@Body() body: any) {
    return this.oauthController.handleFeishuCallback(body);
  }

  /**
   * Handle generic OAuth callback
   * POST /api/auth/callback
   *
   * This route is an alias for /api/oauth/callback
   */
  @Post('/callback')
  async handleCallback(@Body() body: any) {
    return this.oauthController.handleCallback(body);
  }
}
