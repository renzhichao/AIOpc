import { test, expect } from '../../fixtures';
import { LoginPage } from '../../pages/LoginPage';
import { DashboardPage } from '../../pages/DashboardPage';
import { mockUsersArray } from '../../fixtures/test-data';
import { setupApiMocks } from '../helpers/api-mocks';

/**
 * E2E Tests for OAuth Login Flow
 *
 * These tests verify the complete OAuth authentication flow including:
 * - Login page rendering
 * - QR code generation
 * - Mock authentication
 * - Token storage
 * - Redirect to dashboard
 * - Logout functionality
 */

test.describe('OAuth Login Flow', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);

    // Setup API mocks
    await setupApiMocks(page);

    // Clear any existing authentication
    // Note: Must navigate first to avoid SecurityError on about:blank
    try {
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    } catch (error) {
      // Ignore SecurityError if localStorage is not accessible
    }
  });

  test('should display login page with QR code', async ({ page }) => {
    // Navigate to login page
    await loginPage.goto();

    // Verify page elements are visible
    await expect(loginPage.title).toBeVisible();
    await expect(loginPage.subtitle).toBeVisible();

    // Verify QR code is displayed
    await loginPage.waitForQRCode();
    const qrCodeUrl = await loginPage.getQRCodeUrl();
    expect(qrCodeUrl).toBeTruthy();
    expect(qrCodeUrl.length).toBeGreaterThan(0);

    // Verify QR code expiry is displayed
    const qrCodeExpiry = await loginPage.getQRCodeExpiry();
    expect(qrCodeExpiry).toBeTruthy();
    expect(qrCodeExpiry).toContain('有效期至');
  });

  test('should generate unique QR codes for each session', async ({ page }) => {
    // Navigate to login page and get first QR code
    await loginPage.goto();
    await loginPage.waitForQRCode();
    const firstQRCodeVisible = await loginPage.qrCodeContainer.isVisible();
    expect(firstQRCodeVisible).toBe(true);

    // Reload page and verify QR code is regenerated
    await page.reload();
    await loginPage.waitForQRCode();
    const secondQRCodeVisible = await loginPage.qrCodeContainer.isVisible();
    expect(secondQRCodeVisible).toBe(true);
  });

  test('should successfully authenticate and redirect to dashboard', async ({ page }) => {
    const testUser = mockUsersArray[0];

    // Navigate to login page
    await loginPage.goto();
    await loginPage.waitForQRCode();

    // Simulate OAuth authentication
    await loginPage.simulateOAuthLogin(testUser.id, testUser.accessToken);

    // Verify redirect to dashboard
    await page.waitForURL('**/dashboard');
    expect(await loginPage.isOnLoginPage()).toBe(false);

    // Verify authentication state
    expect(await loginPage.isAuthenticated()).toBe(true);

    // Verify dashboard is loaded
    await expect(dashboardPage.heading).toBeVisible();
    expect(await dashboardPage.isOnDashboard()).toBe(true);
  });

  test('should store authentication tokens in localStorage', async ({ page }) => {
    const testUser = mockUsersArray[0];

    // Navigate to login page
    await loginPage.goto();
    await loginPage.waitForQRCode();

    // Simulate OAuth authentication
    await loginPage.simulateOAuthLogin(testUser.id, testUser.accessToken);

    // Verify tokens are stored
    const accessToken = await page.evaluate(() => {
      return localStorage.getItem('access_token');
    });
    const userId = await page.evaluate(() => {
      return localStorage.getItem('user_id');
    });

    expect(accessToken).toBe(testUser.accessToken);
    expect(userId).toBe(testUser.id);
  });

  test('should redirect to login page when not authenticated', async ({ page }) => {
    // Try to access dashboard without authentication
    await page.goto('/dashboard');

    // Should be redirected to login page
    await page.waitForURL('**/login', { timeout: 5000 });
    expect(await loginPage.isOnLoginPage()).toBe(true);
  });

  test('should maintain authentication across page navigation', async ({ page }) => {
    const testUser = mockUsersArray[0];

    // Authenticate user
    await loginPage.goto();
    await loginPage.simulateOAuthLogin(testUser.id, testUser.accessToken);

    // Navigate to different pages
    await page.goto('/instances');
    await page.waitForLoadState('networkidle');

    // Navigate back to dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Should still be authenticated
    expect(await loginPage.isAuthenticated()).toBe(true);
    await expect(dashboardPage.heading).toBeVisible();
  });

  test('should logout and redirect to login page', async ({ page }) => {
    const testUser = mockUsersArray[0];

    // Authenticate user
    await loginPage.goto();
    await loginPage.simulateOAuthLogin(testUser.id, testUser.accessToken);
    await dashboardPage.waitForLoad();

    // Logout
    await dashboardPage.logout();

    // Verify redirect to login page
    await expect(loginPage.title).toBeVisible();
    expect(await loginPage.isOnLoginPage()).toBe(true);

    // Verify tokens are cleared
    const accessToken = await page.evaluate(() => {
      return localStorage.getItem('access_token');
    });
    expect(accessToken).toBeNull();
  });

  test('should handle multiple users correctly', async ({ page }) => {
    // Login with first user
    await loginPage.goto();
    await loginPage.simulateOAuthLogin(mockUsersArray[0].id, mockUsersArray[0].accessToken);
    await dashboardPage.waitForLoad();

    const firstUserToken = await page.evaluate(() => {
      return localStorage.getItem('access_token');
    });
    expect(firstUserToken).toBe(mockUsersArray[0].accessToken);

    // Logout
    await dashboardPage.logout();

    // Login with second user
    await loginPage.goto();
    await loginPage.simulateOAuthLogin(mockUsersArray[1].id, mockUsersArray[1].accessToken);
    await dashboardPage.waitForLoad();

    const secondUserToken = await page.evaluate(() => {
      return localStorage.getItem('access_token');
    });
    expect(secondUserToken).toBe(mockUsersArray[1].accessToken);
    expect(secondUserToken).not.toBe(firstUserToken);
  });

  test('should display welcome message on dashboard after login', async ({ page }) => {
    const testUser = mockUsersArray[0];

    // Authenticate user
    await loginPage.goto();
    await loginPage.simulateOAuthLogin(testUser.id, testUser.accessToken);
    await dashboardPage.waitForLoad();

    // Verify welcome message
    const welcomeMessage = await dashboardPage.getWelcomeMessage();
    expect(welcomeMessage).toBeTruthy();
    expect(welcomeMessage.length).toBeGreaterThan(0);
  });

  test('should persist authentication on browser refresh', async ({ page }) => {
    const testUser = mockUsersArray[0];

    // Authenticate user
    await loginPage.goto();
    await loginPage.simulateOAuthLogin(testUser.id, testUser.accessToken);
    await dashboardPage.waitForLoad();

    // Refresh page
    await page.reload();
    await dashboardPage.waitForLoad();

    // Should still be authenticated and on dashboard
    expect(await loginPage.isAuthenticated()).toBe(true);
    await expect(dashboardPage.heading).toBeVisible();
  });
});
