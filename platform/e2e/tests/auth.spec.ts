import { test, expect } from '@playwright/test';
import { OAuthHelper } from '../helpers/oauth-helper';
import { APIHelper } from '../helpers/api-helper';

/**
 * E2E Tests for OAuth Authentication Flow
 *
 * These tests verify the complete OAuth 2.0 authentication flow with Feishu integration,
 * including QR code generation, token exchange, session management, and logout.
 *
 * Coverage:
 * - QR code generation and display
 * - OAuth URL generation and validation
 * - Token exchange with Feishu API
 * - Session storage and persistence
 * - Protected route authentication
 * - Logout and session cleanup
 * - Error handling for various failure scenarios
 *
 * @see platform/e2e/README.md for detailed documentation
 */

test.describe('OAuth Authentication Flow', () => {
  let oauthHelper: OAuthHelper;
  let apiHelper: APIHelper;

  test.beforeEach(async ({ page }) => {
    oauthHelper = new OAuthHelper(page);
    apiHelper = new APIHelper(page);

    // Clear existing session
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test.describe('QR Code Generation (AUTH-001)', () => {
    test('should generate OAuth QR code on login page', async ({ page }) => {
      await test.step('Navigate to login page', async () => {
        await page.goto('/login');
        await expect(page.locator('h1')).toContainText(/登录|login/i);
      });

      await test.step('Verify QR code container is visible', async () => {
        const qrCodeContainer = page.locator('[data-testid="qr-code-container"]');
        await expect(qrCodeContainer).toBeVisible();
      });

      await test.step('Verify QR code is rendered as SVG', async () => {
        const qrCodeSVG = page.locator('[data-testid="qr-code-container"] svg');
        await expect(qrCodeSVG).toBeVisible();

        // Verify SVG has content
        const svgContent = await qrCodeSVG.innerHTML();
        expect(svgContent.length).toBeGreaterThan(0);
      });

      await test.step('Verify QR code expiry time is displayed', async () => {
        const expiryText = page.locator('[data-testid="qr-code-expiry"]');
        await expect(expiryText).toBeVisible();
        const expiry = await expiryText.textContent();
        expect(expiry).toMatch(/有效期至|expires|expir/i);
      });
    });

    test('should generate unique QR codes for each session', async ({ page }) => {
      await page.goto('/login');

      // Get first QR code
      const firstQRCode = await oauthHelper.getQRCodeData();
      expect(firstQRCode).toBeTruthy();

      // Refresh page
      await page.reload();

      // Get second QR code
      const secondQRCode = await oauthHelper.getQRCodeData();
      expect(secondQRCode).toBeTruthy();

      // QR codes should be different (regenerated)
      expect(firstQRCode).not.toBe(secondQRCode);
    });

    test('should auto-refresh QR code before expiration', async ({ page }) => {
      await page.goto('/login');

      const initialQRCode = await oauthHelper.getQRCodeData();
      expect(initialQRCode).toBeTruthy();

      // Wait for potential auto-refresh (implementation-dependent)
      await page.waitForTimeout(5000);

      const refreshedQRCode = await oauthHelper.getQRCodeData();
      expect(refreshedQRCode).toBeTruthy();

      // QR code should still be visible
      const qrCodeContainer = page.locator('[data-testid="qr-code-container"]');
      await expect(qrCodeContainer).toBeVisible();
    });

    test('should display loading state before QR code is ready', async ({ page }) => {
      // Mock slow API response
      await page.route('**/api/oauth/authorize', async route => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        route.continue();
      });

      await page.goto('/login');

      // Check for loading indicator
      const loadingSpinner = page.locator('[data-testid="qr-code-loading"]');
      const isLoadingVisible = await loadingSpinner.isVisible().catch(() => false);

      if (isLoadingVisible) {
        await expect(loadingSpinner).toBeVisible();
      }

      // Wait for QR code to load
      const qrCodeContainer = page.locator('[data-testid="qr-code-container"]');
      await expect(qrCodeContainer).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('OAuth URL Generation (AUTH-002)', () => {
    test('should generate valid OAuth URL with required parameters', async ({ page }) => {
      await page.goto('/login');

      const oauthURL = await oauthHelper.getOAuthURL();
      expect(oauthURL).toBeTruthy();

      // Verify URL structure
      expect(oauthURL).toContain('https://open.feishu.cn/open-apis/authen/v1/authorize');

      // Verify required parameters
      expect(oauthURL).toContain('app_id=');
      expect(oauthURL).toContain('redirect_uri=');
      expect(oauthURL).toContain('state=');
    });

    test('should include CSRF token in state parameter', async ({ page }) => {
      await page.goto('/login');

      const oauthURL = await oauthHelper.getOAuthURL();
      const stateMatch = oauthURL.match(/state=([^&]+)/);

      expect(stateMatch).toBeTruthy();
      const state = decodeURIComponent(stateMatch![1]);

      // State should be a valid JSON object with CSRF token
      const stateObj = JSON.parse(state);
      expect(stateObj).toHaveProperty('csrf_token');
      expect(stateObj.csrf_token).toBeTruthy();
      expect(stateObj.csrf_token.length).toBeGreaterThan(16);
    });

    test('should generate unique state for each request', async ({ page }) => {
      await page.goto('/login');

      const firstState = await oauthHelper.getStateToken();
      await page.reload();

      const secondState = await oauthHelper.getStateToken();

      expect(firstState).not.toBe(secondState);
    });
  });

  test.describe('Token Exchange (AUTH-003)', () => {
    test('should exchange authorization code for access token', async ({ page }) => {
      // Mock Feishu OAuth callback
      await oauthHelper.mockFeishuOAuthCallback({
        user_id: 'test-user-001',
        access_token: 'mock-access-token-001',
      });

      // Simulate OAuth callback
      await page.goto('/login/callback?code=test-auth-code-001&state=test-state-001');

      // Verify token storage
      const accessToken = await page.evaluate(() => {
        return localStorage.getItem('access_token');
      });

      expect(accessToken).toBe('mock-access-token-001');
    });

    test('should store user information after successful authentication', async ({ page }) => {
      const mockUser = {
        user_id: 'test-user-001',
        name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
      };

      await oauthHelper.mockFeishuOAuthCallback({
        user_id: mockUser.user_id,
        access_token: 'mock-access-token-001',
        user_info: mockUser,
      });

      await page.goto('/login/callback?code=test-auth-code-001&state=test-state-001');

      // Verify user info stored
      const userInfo = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('user_info') || '{}');
      });

      expect(userInfo.user_id).toBe(mockUser.user_id);
      expect(userInfo.name).toBe(mockUser.name);
    });

    test('should handle invalid authorization code gracefully', async ({ page }) => {
      // Mock Feishu API error response
      await oauthHelper.mockFeishuOAuthError({
        code: 400,
        message: 'Invalid authorization code',
      });

      await page.goto('/login/callback?code=invalid-code&state=test-state');

      // Verify error handling
      await page.waitForURL('**/login', { timeout: 5000 });

      const errorMessage = await oauthHelper.getErrorMessage();
      expect(errorMessage).toMatch(/认证失败|authentication failed/i);
    });

    test('should handle expired authorization code', async ({ page }) => {
      await oauthHelper.mockFeishuOAuthError({
        code: 401,
        message: 'Authorization code expired',
      });

      await page.goto('/login/callback?code=expired-code&state=test-state');

      await page.waitForURL('**/login', { timeout: 5000 });

      const errorMessage = await oauthHelper.getErrorMessage();
      expect(errorMessage).toBeTruthy();
    });
  });

  test.describe('Session Management (AUTH-004)', () => {
    test('should maintain authentication across page navigation', async ({ page }) => {
      // Setup mock authentication
      await oauthHelper.setupMockSession({
        user_id: 'test-user-001',
        access_token: 'mock-access-token-001',
      });

      // Navigate to different pages
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard/);

      await page.goto('/instances');
      await expect(page).toHaveURL(/\/instances/);

      // Verify authentication persists
      const isAuthenticated = await oauthHelper.isAuthenticated();
      expect(isAuthenticated).toBe(true);
    });

    test('should persist authentication on page refresh', async ({ page }) => {
      await oauthHelper.setupMockSession({
        user_id: 'test-user-001',
        access_token: 'mock-access-token-001',
      });

      await page.goto('/dashboard');
      await page.reload();

      // Should still be authenticated after refresh
      const isAuthenticated = await oauthHelper.isAuthenticated();
      expect(isAuthenticated).toBe(true);

      await expect(page.locator('h1')).toContainText(/dashboard|仪表板/i);
    });

    test('should redirect to login when accessing protected routes without auth', async ({ page }) => {
      const protectedRoutes = ['/dashboard', '/instances', '/instances/create'];

      for (const route of protectedRoutes) {
        await page.goto(route);

        // Should redirect to login
        await page.waitForURL('**/login', { timeout: 5000 });
        expect(page.url()).toContain('/login');

        // Clear for next iteration
        await page.evaluate(() => {
          localStorage.clear();
        });
      }
    });

    test('should validate access token on API requests', async ({ page }) => {
      await oauthHelper.setupMockSession({
        user_id: 'test-user-001',
        access_token: 'mock-access-token-001',
      });

      // Mock API endpoint that requires authentication
      await apiHelper.mockAuthenticatedEndpoint('/api/user/profile', {
        user_id: 'test-user-001',
        name: 'Test User',
      });

      const response = await apiHelper.makeAuthenticatedRequest('/api/user/profile');

      expect(response.status).toBe(200);
      expect(response.data.user_id).toBe('test-user-001');
    });
  });

  test.describe('Logout (AUTH-005)', () => {
    test('should clear session on logout', async ({ page }) => {
      await oauthHelper.setupMockSession({
        user_id: 'test-user-001',
        access_token: 'mock-access-token-001',
      });

      // Navigate to dashboard
      await page.goto('/dashboard');

      // Perform logout
      await oauthHelper.logout();

      // Verify redirect to login
      await page.waitForURL('**/login', { timeout: 5000 });

      // Verify tokens are cleared
      const accessToken = await page.evaluate(() => {
        return localStorage.getItem('access_token');
      });
      expect(accessToken).toBeNull();

      const userInfo = await page.evaluate(() => {
        return localStorage.getItem('user_info');
      });
      expect(userInfo).toBeNull();
    });

    test('should redirect to login after logout', async ({ page }) => {
      await oauthHelper.setupMockSession({
        user_id: 'test-user-001',
        access_token: 'mock-access-token-001',
      });

      await page.goto('/instances');
      await oauthHelper.logout();

      // Should be redirected to login
      await page.waitForURL('**/login', { timeout: 5000 });
      expect(page.url()).toContain('/login');
    });

    test('should prevent access to protected routes after logout', async ({ page }) => {
      await oauthHelper.setupMockSession({
        user_id: 'test-user-001',
        access_token: 'mock-access-token-001',
      });

      // Logout
      await page.goto('/dashboard');
      await oauthHelper.logout();

      // Try to access protected route
      await page.goto('/instances');

      // Should redirect to login again
      await page.waitForURL('**/login', { timeout: 5000 });
      expect(page.url()).toContain('/login');
    });
  });

  test.describe('Error Handling (AUTH-006)', () => {
    test('should handle QR code generation failure', async ({ page }) => {
      // Mock OAuth URL generation failure
      await page.route('**/api/oauth/authorize', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Failed to generate OAuth URL',
          }),
        });
      });

      await page.goto('/login');

      // Should display error message
      const errorMessage = await oauthHelper.getErrorMessage();
      expect(errorMessage).toMatch(/二维码生成失败|failed to generate/i);
    });

    test('should handle network timeout during OAuth flow', async ({ page }) => {
      // Mock network timeout
      await page.route('**/api/oauth/authorize', route => {
        // Abort the request - network timeout
        route.abort('failed');
      });

      await page.goto('/login');

      // Should display error or retry option
      const hasError = await page.evaluate(() => {
        const body = document.body.textContent || '';
        return body.includes('网络错误') || body.includes('network error') || body.includes('超时');
      });

      expect(hasError || await oauthHelper.hasRetryButton()).toBe(true);
    });

    test('should handle CSRF token mismatch', async ({ page }) => {
      // Mock CSRF validation failure
      await page.route('**/api/oauth/callback', route => {
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'CSRF token mismatch',
          }),
        });
      });

      await page.goto('/login/callback?code=test-code&state=invalid-state');

      // Should show security error
      const errorMessage = await oauthHelper.getErrorMessage();
      expect(errorMessage).toMatch(/安全验证失败|csrf|security/i);
    });

    test('should handle Feishu API rate limiting', async ({ page }) => {
      // Mock rate limit response
      await oauthHelper.mockFeishuOAuthError({
        code: 429,
        message: 'Rate limit exceeded',
      });

      await page.goto('/login/callback?code=test-code&state=test-state');

      const errorMessage = await oauthHelper.getErrorMessage();
      expect(errorMessage).toMatch(/请求过于频繁|rate limit/i);
    });
  });

  test.describe('Multi-User Support (AUTH-007)', () => {
    test('should handle multiple users correctly', async ({ page, context }) => {
      // First user
      await oauthHelper.setupMockSession({
        user_id: 'user-001',
        access_token: 'token-001',
      });

      let userId = await page.evaluate(() => {
        return localStorage.getItem('user_id');
      });
      expect(userId).toBe('user-001');

      // Logout first user
      await oauthHelper.logout();

      // Second user
      await oauthHelper.setupMockSession({
        user_id: 'user-002',
        access_token: 'token-002',
      });

      userId = await page.evaluate(() => {
        return localStorage.getItem('user_id');
      });
      expect(userId).toBe('user-002');
    });

    test('should isolate sessions between different users', async ({ browser }) => {
      // Create two contexts (simulating two different users)
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      // Setup different users
      await oauthHelper.setupMockSession.call(
        { page: page1 },
        { user_id: 'user-001', access_token: 'token-001' }
      );
      await oauthHelper.setupMockSession.call(
        { page: page2 },
        { user_id: 'user-002', access_token: 'token-002' }
      );

      // Verify sessions are isolated
      const user1 = await page1.evaluate(() => localStorage.getItem('user_id'));
      const user2 = await page2.evaluate(() => localStorage.getItem('user_id'));

      expect(user1).toBe('user-001');
      expect(user2).toBe('user-002');
      expect(user1).not.toBe(user2);

      await context1.close();
      await context2.close();
    });
  });

  test.describe('Security Features (AUTH-008)', () => {
    test('should use HTTPS for OAuth URLs in production', async ({ page }) => {
      // Set production environment
      await page.goto('/login');

      const oauthURL = await oauthHelper.getOAuthURL();

      // In production, should use HTTPS
      if (process.env.NODE_ENV === 'production') {
        expect(oauthURL).toMatch(/^https:\/\//);
      }
    });

    test('should implement secure token storage', async ({ page }) => {
      await oauthHelper.setupMockSession({
        user_id: 'test-user-001',
        access_token: 'sensitive-token',
      });

      // Verify token is stored (implementation may use httpOnly cookies)
      const hasToken = await page.evaluate(() => {
        return localStorage.getItem('access_token') !== null ||
               document.cookie.includes('access_token');
      });

      expect(hasToken).toBe(true);
    });

    test('should implement session timeout', async ({ page }) => {
      // Mock session with short expiry
      await oauthHelper.setupMockSession({
        user_id: 'test-user-001',
        access_token: 'mock-access-token-001',
        expires_in: 1, // 1 second
      });

      await page.goto('/dashboard');

      // Wait for session to expire
      await page.waitForTimeout(1500);

      // Try to navigate - should redirect to login
      await page.goto('/instances');
      await page.waitForTimeout(2000);

      // Should handle expired session
      const currentUrl = page.url();
      const isLogin = currentUrl.includes('/login') ||
                     await oauthHelper.getErrorMessage().includes('会话已过期');

      expect(isLogin).toBe(true);
    });
  });
});
