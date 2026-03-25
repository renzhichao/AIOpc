/* eslint-disable @typescript-eslint/no-unused-vars */
import { Page, expect } from '@playwright/test';

/**
 * Login Page Object Model
 *
 * Encapsulates all interactions with the login page including QR code generation,
 * OAuth authentication simulation, and token verification.
 */
export class LoginPage {
  readonly page: Page;
  readonly url = '/login';

  // Selectors
  private readonly selectors = {
    container: '[data-testid="login-container"]',
    title: '[data-testid="login-title"]',
    subtitle: '[data-testid="login-subtitle"]',
    description: '[data-testid="login-description"]',
    qrCodeContainer: '[data-testid="qr-container"]',
    qrCode: '[data-testid="qr-code"]',
    qrCodeExpiry: '[data-testid="qr-code-expiry"]',
    loading: '[data-testid="qr-loading"]',
    error: '[data-testid="login-error"]',
  };

  constructor(page: Page) {
    this.page = page;
  }

  // Getters for test locators
  get title() {
    return this.page.locator(this.selectors.title);
  }

  get subtitle() {
    return this.page.locator(this.selectors.subtitle);
  }

  get qrCodeContainer() {
    return this.page.locator(this.selectors.qrCodeContainer);
  }

  /**
   * Navigate to the login page
   */
  async goto() {
    await this.page.goto(this.url);
    await this.waitForLoad();
  }

  /**
   * Wait for the login page to load
   */
  async waitForLoad() {
    await this.page.waitForSelector(this.selectors.container);
  }

  /**
   * Get the QR code URL
   */
  async getQRCodeUrl(): Promise<string | null> {
    const qrCodeElement = await this.page.$(this.selectors.qrCode);
    if (!qrCodeElement) return null;

    // Check if it's an image with src attribute
    const src = await qrCodeElement.getAttribute('src');
    if (src) return src;

    // Check if it's a canvas with data URL
    const dataUrl = await qrCodeElement.evaluate((el) => {
      if (el instanceof HTMLCanvasElement) {
        return el.toDataURL();
      }
      if (el instanceof HTMLImageElement) {
        return el.src;
      }
      if (el instanceof SVGSVGElement) {
        // For SVG QR codes, check if it has content
        return el.outerHTML || 'SVG-QR-CODE';
      }
      return null;
    });

    return dataUrl;
  }

  /**
   * Get the QR code URL (alias for consistency)
   */
  async getQRCodeURL(): Promise<string | null> {
    const qrCodeElement = await this.page.$(this.selectors.qrCode);
    if (!qrCodeElement) return null;

    // Check if it's an image with src attribute
    const src = await qrCodeElement.getAttribute('src');
    if (src) return src;

    // Check if it's a canvas with data URL
    const dataUrl = await qrCodeElement.evaluate((el) => {
      if (el instanceof HTMLCanvasElement) {
        return el.toDataURL();
      }
      if (el instanceof HTMLImageElement) {
        return el.src;
      }
      return null;
    });

    return dataUrl;
  }

  /**
   * Verify that the QR code is displayed
   */
  async verifyQRCodeDisplayed(): Promise<void> {
    const qrCode = await this.page.$(this.selectors.qrCode);
    expect(qrCode).not.toBeNull();

    // Verify QR code has content
    const content = await this.getQRCodeURL();
    expect(content).not.toBeNull();
    expect(content?.length).toBeGreaterThan(0);
  }

  /**
   * Simulate OAuth authentication
   * This mimics what happens when a user scans the QR code with Feishu
   */
  async simulateOAuthAuth(token = 'mock-access-token') {
    // Simulate successful OAuth callback
    await this.page.evaluate((accessToken) => {
      // Set the auth token in localStorage
      localStorage.setItem('auth_token', accessToken);
      localStorage.setItem('auth_user', JSON.stringify({
        id: 'test-user-1',
        name: '开发测试用户',
        email: 'dev@example.com',
      }));
      localStorage.setItem('auth_timestamp', Date.now().toString());
    }, token);

    // Navigate to dashboard to complete the login flow
    await this.page.waitForTimeout(100);
    await this.page.goto('/dashboard');
  }

  /**
   * Check if user is redirected to dashboard after login
   */
  async isOnDashboard(): Promise<boolean> {
    return this.page.url().includes('/dashboard');
  }

  /**
   * Verify login page elements are displayed correctly
   */
  async verifyLoginPage() {
    await expect(this.page.locator(this.selectors.title)).toBeVisible();
    await expect(this.page.locator(this.selectors.description)).toBeVisible();
    await expect(this.page.locator(this.selectors.qrCodeContainer)).toBeVisible();
  }

  /**
   * Get login error message if present
   */
  async getErrorMessage(): Promise<string | null> {
    const errorElement = await this.page.$(this.selectors.error);
    if (!errorElement) return null;
    return await errorElement.textContent();
  }

  /**
   * Wait for QR code to be generated
   */
  async waitForQRCode(timeout = 10000): Promise<void> {
    await this.page.waitForSelector(this.selectors.qrCode, { timeout });
  }

  /**
   * Refresh QR code
   */
  async refreshQRCode() {
    await this.page.reload();
    await this.waitForLoad();
    await this.waitForQRCode();
  }

  /**
   * Check if QR code is loading
   */
  async isQRCodeLoading(): Promise<boolean> {
    const loadingElement = await this.page.$(this.selectors.loading);
    return loadingElement !== null;
  }

  /**
   * Simulate OAuth login with user ID and token
   * This is called by tests to simulate a user scanning the QR code
   */
  async simulateOAuthLogin(userId: string, token: string) {
    await this.page.evaluate(({ uid, accessToken }) => {
      // Set the auth token in localStorage
      localStorage.setItem('auth_token', accessToken);
      localStorage.setItem('access_token', accessToken); // Test expects this key
      localStorage.setItem('user_id', uid); // Test expects this key
      localStorage.setItem('auth_user', JSON.stringify({
        id: uid,
        feishu_user_id: uid,
        name: '开发测试用户',
        email: 'dev@example.com',
      }));
      localStorage.setItem('auth_timestamp', Date.now().toString());
    }, { uid: userId, accessToken: token });

    // Navigate to dashboard to complete the login flow
    await this.page.waitForTimeout(100);
    await this.page.goto('/dashboard');
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.page.evaluate(() => {
      return localStorage.getItem('auth_token');
    });
    return token !== null;
  }

  /**
   * Check if currently on login page
   */
  async isOnLoginPage(): Promise<boolean> {
    return this.page.url().includes('/login');
  }

  /**
   * Get QR code expiry text
   */
  async getQRCodeExpiry(): Promise<string | null> {
    const expiryElement = await this.page.$(this.selectors.qrCodeExpiry);
    if (!expiryElement) return null;
    return await expiryElement.textContent();
  }
}
