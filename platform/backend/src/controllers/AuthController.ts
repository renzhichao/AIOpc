import { Controller, Get, Post, Body, QueryParam, Res } from 'routing-controllers';
import { Response } from 'express';
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
   * Handle DingTalk OAuth callback (OAuth redirect endpoint)
   *
   * OAuth 2.0 authorization flow redirects user to this endpoint via GET.
   * This endpoint renders an HTML page that processes the callback via POST.
   *
   * GET /api/auth/dingtalk/callback?code=xxx&state=xxx
   *
   * @param code - Authorization code from DingTalk
   * @param state - State parameter for CSRF protection
   * @param res - Express response object
   */
  @Get('/dingtalk/callback')
  async handleDingtalkCallbackGet(
    @QueryParam('code') code: string,
    @QueryParam('state') state: string,
    @Res() res: Response
  ) {
    // Render HTML page that will process the callback
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Processing...</title>
  <style>
    body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { text-align: center; }
    .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p>Processing login...</p>
  </div>
  <script>
    (function() {
      const code = ${JSON.stringify(code || '')};
      const state = ${JSON.stringify(state || '')};

      if (!code) {
        window.location.href = '/login?error=missing_code';
        return;
      }

      // Call backend API via POST
      fetch('/api/auth/dingtalk/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success && data.data && data.data.access_token) {
          // Store token and redirect
          sessionStorage.setItem('access_token', data.data.access_token);
          sessionStorage.setItem('user', JSON.stringify(data.data.user));
          const redirect = data.data.redirect_to || '/chat';
          window.location.href = redirect;
        } else {
          window.location.href = '/login?error=' + (data.message || 'login_failed');
        }
      })
      .catch(error => {
        console.error('Callback processing failed:', error);
        window.location.href = '/login?error=callback_failed';
      });
    })();
  </script>
</body>
</html>
    `;

    res.send(html);
  }

  /**
   * Handle DingTalk OAuth callback (POST endpoint for frontend)
   *
   * POST /api/auth/dingtalk/callback
   *
   * This route is an alias for /api/oauth/dingtalk/callback
   * It exists because the DingTalk app is registered with this callback URL.
   */
  @Post('/dingtalk/callback')
  async handleDingtalkCallbackPost(@Body() body: any) {
    return this.oauthController.handleDingtalkCallback(body);
  }

  /**
   * Handle Feishu OAuth callback (OAuth redirect endpoint)
   *
   * OAuth 2.0 authorization flow redirects user to this endpoint via GET.
   *
   * GET /api/auth/feishu/callback?code=xxx&state=xxx
   */
  @Get('/feishu/callback')
  async handleFeishuCallbackGet(
    @QueryParam('code') code: string,
    @QueryParam('state') state: string,
    @Res() res: Response
  ) {
    // Render HTML page that will process the callback
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Processing...</title>
  <style>
    body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { text-align: center; }
    .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p>Processing login...</p>
  </div>
  <script>
    (function() {
      const code = ${JSON.stringify(code || '')};
      const state = ${JSON.stringify(state || '')};

      if (!code) {
        window.location.href = '/login?error=missing_code';
        return;
      }

      fetch('/api/auth/feishu/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success && data.data && data.data.access_token) {
          sessionStorage.setItem('access_token', data.data.access_token);
          sessionStorage.setItem('user', JSON.stringify(data.data.user));
          const redirect = data.data.redirect_to || '/chat';
          window.location.href = redirect;
        } else {
          window.location.href = '/login?error=' + (data.message || 'login_failed');
        }
      })
      .catch(error => {
        console.error('Callback processing failed:', error);
        window.location.href = '/login?error=callback_failed';
      });
    })();
  </script>
</body>
</html>
    `;

    res.send(html);
  }

  /**
   * Handle Feishu OAuth callback (POST endpoint for frontend)
   *
   * POST /api/auth/feishu/callback
   *
   * This route is an alias for /api/oauth/feishu/callback
   */
  @Post('/feishu/callback')
  async handleFeishuCallbackPost(@Body() body: any) {
    return this.oauthController.handleFeishuCallback(body);
  }

  /**
   * Handle generic OAuth callback (OAuth redirect endpoint)
   *
   * GET /api/auth/callback?code=xxx&state=xxx
   */
  @Get('/callback')
  async handleCallbackGet(
    @QueryParam('code') code: string,
    @QueryParam('state') state: string,
    @Res() res: Response
  ) {
    // Render HTML page that will process the callback
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Processing...</title>
  <style>
    body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { text-align: center; }
    .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p>Processing login...</p>
  </div>
  <script>
    (function() {
      const code = ${JSON.stringify(code || '')};
      const state = ${JSON.stringify(state || '')};

      if (!code) {
        window.location.href = '/login?error=missing_code';
        return;
      }

      fetch('/api/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success && data.data && data.data.access_token) {
          sessionStorage.setItem('access_token', data.data.access_token);
          sessionStorage.setItem('user', JSON.stringify(data.data.user));
          const redirect = data.data.redirect_to || '/chat';
          window.location.href = redirect;
        } else {
          window.location.href = '/login?error=' + (data.message || 'login_failed');
        }
      })
      .catch(error => {
        console.error('Callback processing failed:', error);
        window.location.href = '/login?error=callback_failed';
      });
    })();
  </script>
</body>
</html>
    `;

    res.send(html);
  }

  /**
   * Handle generic OAuth callback (POST endpoint for frontend)
   *
   * POST /api/auth/callback
   *
   * This route is an alias for /api/oauth/callback
   */
  @Post('/callback')
  async handleCallbackPost(@Body() body: any) {
    return this.oauthController.handleCallback(body);
  }
}
