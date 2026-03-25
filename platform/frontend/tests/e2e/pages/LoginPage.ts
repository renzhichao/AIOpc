 
import { Page, expect } from '@playwright/test';

/**
 * Page Object Model for Login Page
 *
 * Encapsulates interactions with the login/authentication page
 */
export class LoginPage {
  readonly page: Page;
  readonly url = '/login';

  // Page elements
  readonly title;
  readonly subtitle;
  readonly qrCodeContainer;
  readonly qrCodeImage;
  readonly loadingSpinner;
  readonly errorMessage;
  readonly refreshButton;

  constructor(page: Page) {
    this.page = page;

    // Initialize locators based on actual UI elements
    this.title = page.getByRole('heading', { name: /OpenClaw/i });
    this.subtitle = page.getByText(/扫码即用 AI 智能体平台/i);
    this.qrCodeContainer = page.locator('.bg-white.p-6.rounded-lg');
    this.qrCodeImage = page.locator('svg'); // QRCodeSVG renders as SVG
    this.loadingSpinner = page.locator('.animate-spin');
    this.errorMessage = page.locator('.bg-red-50');
    this.refreshButton = page.getByRole('button', { name: /刷新二维码/i });
  }

  /**
   * Navigate to the login page
   */
  async goto() {
    await this.page.goto(this.url);
    await this.waitForLoad();
  }

  /**
   * Wait for page to fully load
   */
  async waitForLoad() {
    await this.page.waitForLoadState('networkidle');
    await expect(this.title).toBeVisible();
  }

  /**
   * Wait for QR code to be displayed
   */
  async waitForQRCode() {
    await expect(this.qrCodeContainer).toBeVisible({ timeout: 10000 });
    await expect(this.qrCodeImage).toBeVisible();
  }

  /**
   * Get the QR code source URL
   */
  async getQRCodeUrl(): Promise<string> {
    await this.waitForQRCode();
    // QRCodeSVG doesn't have src, it renders directly
    return this.qrCodeContainer.textContent() || '';
  }

  /**
   * Get the QR code expiration text
   */
  async getQRCodeExpiry(): Promise<string> {
    await this.waitForQRCode();
    // Look for expiration text in the QR code container
    const expiryElement = this.page.locator('[data-testid="qr-code-expiry"]');
    if (await expiryElement.isVisible()) {
      return (await expiryElement.textContent()) || '';
    }
    // Fallback: search in container text
    const containerText = await this.qrCodeContainer.textContent();
    return containerText || '';
  }

  /**
   * Simulate Feishu OAuth login flow
   * This mocks the actual QR code scanning process
   */
  async simulateOAuthLogin(userId: string = 'user-001', accessToken: string = 'mock-access-token-001') {
    // Wait for QR code to be generated
    await this.waitForQRCode();

    // Simulate OAuth callback by setting localStorage
    await this.page.evaluate(
      ({ userId, token }) => {
        localStorage.setItem('access_token', token);
        localStorage.setItem('user_id', userId);
      },
      { userId, accessToken }
    );

    // Navigate to dashboard to simulate redirect after OAuth
    await this.page.goto('/dashboard');
  }

  /**
   * Check if user is redirected to login page
   */
  async isOnLoginPage(): Promise<boolean> {
    const currentUrl = this.page.url();
    return currentUrl.includes('/login');
  }

  /**
   * Get error message if present
   */
  async getErrorMessage(): Promise<string | null> {
    if (await this.errorMessage.isVisible()) {
      return await this.errorMessage.textContent();
    }
    return null;
  }

  /**
   * Wait for redirect to dashboard
   */
  async waitForRedirect() {
    await this.page.waitForURL('**/dashboard', { timeout: 15000 });
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.page.evaluate(() => {
      return localStorage.getItem('access_token');
    });
    return token !== null;
  }

  /**
   * Logout user
   */
  async logout() {
    await this.page.evaluate(() => {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_id');
    });
    await this.page.goto('/login');
  }
}
