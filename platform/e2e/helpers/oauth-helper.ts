import { Page } from '@playwright/test';

/**
 * OAuth Helper Class
 *
 * Provides helper methods for OAuth authentication testing including:
 * - QR code generation and validation
 * - OAuth URL generation
 * - Token exchange simulation
 * - Session management
 * - Mock Feishu API callbacks
 */
export class OAuthHelper {
  constructor(private page: Page) {}

  /**
   * Get the OAuth QR code data from the login page
   */
  async getQRCodeData(): Promise<string | null> {
    const qrCodeContainer = this.page.locator('[data-testid="qr-code-container"]');
    const isVisible = await qrCodeContainer.isVisible();

    if (!isVisible) {
      return null;
    }

    // Get QR code data (might be in data attribute or SVG content)
    const qrData = await qrCodeContainer.getAttribute('data-qrcode');
    if (qrData) {
      return qrData;
    }

    // Try to get SVG content
    const svgContent = await qrCodeContainer.locator('svg').innerHTML();
    return svgContent || null;
  }

  /**
   * Get the OAuth URL from the QR code or API response
   */
  async getOAuthURL(): Promise<string> {
    const response = await this.page.evaluate(() => {
      return (window as any).testOAuthURL || '';
    });

    if (response) {
      return response;
    }

    // Fallback: check network requests
    return new Promise((resolve) => {
      this.page.on('request', request => {
        if (request.url().includes('/api/oauth/authorize')) {
          resolve(request.url());
        }
      });

      // Trigger OAuth URL generation
      this.page.goto('/login');

      // Timeout after 5 seconds
      setTimeout(() => resolve(''), 5000);
    });
  }

  /**
   * Get the state token from OAuth URL
   */
  async getStateToken(): Promise<string> {
    const oauthURL = await this.getOAuthURL();
    const stateMatch = oauthURL.match(/state=([^&]+)/);

    if (stateMatch) {
      const state = decodeURIComponent(stateMatch[1]);
      try {
        const stateObj = JSON.parse(state);
        return stateObj.csrf_token || state;
      } catch {
        return state;
      }
    }

    return '';
  }

  /**
   * Setup mock session for testing
   */
  async setupMockSession(options: {
    user_id: string;
    access_token: string;
    expires_in?: number;
    user_info?: any;
  }): Promise<void> {
    await this.page.goto('/login');

    await this.page.evaluate((params) => {
      localStorage.setItem('access_token', params.access_token);
      localStorage.setItem('user_id', params.user_id);

      if (params.user_info) {
        localStorage.setItem('user_info', JSON.stringify(params.user_info));
      }

      if (params.expires_in) {
        const expiresAt = Date.now() + params.expires_in * 1000;
        localStorage.setItem('expires_at', expiresAt.toString());
      }
    }, options);
  }

  /**
   * Mock Feishu OAuth callback
   */
  async mockFeishuOAuthCallback(options: {
    user_id: string;
    access_token: string;
    user_info?: any;
  }): Promise<void> {
    await this.page.route('**/api/oauth/callback', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: options.access_token,
          user_id: options.user_id,
          user_info: options.user_info || {
            user_id: options.user_id,
            name: 'Test User',
            avatar_url: 'https://example.com/avatar.jpg',
          },
        }),
      });
    });
  }

  /**
   * Mock Feishu OAuth error
   */
  async mockFeishuOAuthError(error: {
    code: number;
    message: string;
  }): Promise<void> {
    await this.page.route('**/api/oauth/callback', async route => {
      await route.fulfill({
        status: error.code,
        contentType: 'application/json',
        body: JSON.stringify({
          error: error.message,
        }),
      });
    });
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const accessToken = await this.page.evaluate(() => {
      return localStorage.getItem('access_token');
    });

    return accessToken !== null;
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    await this.page.locator('[data-testid="logout-button"]').click();
  }

  /**
   * Get error message from page
   */
  async getErrorMessage(): Promise<string> {
    const errorElement = this.page.locator('[data-testid="error-message"]');
    const isVisible = await errorElement.isVisible().catch(() => false);

    if (isVisible) {
      return await errorElement.textContent() || '';
    }

    // Try to find error in page content
    const hasError = await this.page.evaluate(() => {
      const body = document.body.textContent || '';
      return body.includes('错误') || body.includes('error') || body.includes('失败');
    });

    return hasError ? 'Error detected on page' : '';
  }

  /**
   * Check if page has retry button
   */
  async hasRetryButton(): Promise<boolean> {
    const retryButton = this.page.locator('[data-testid="retry-button"]');
    return await retryButton.isVisible().catch(() => false);
  }
}
