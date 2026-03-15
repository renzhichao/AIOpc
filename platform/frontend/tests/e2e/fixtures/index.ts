import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { InstancesPage } from '../pages/InstancesPage';
import { InstanceDetailsPage } from '../pages/InstanceDetailsPage';
import { mockUsers, mockInstances } from './test-data';

/**
 * Extended test fixtures with custom page objects
 *
 * This extends Playwright's base test with our page objects and test utilities
 */
export const test = base.extend<{
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  instancesPage: InstancesPage;
  instanceDetailsPage: InstanceDetailsPage;
  authenticatedPage: ReturnType<typeof base['page']>;
}>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  instancesPage: async ({ page }, use) => {
    await use(new InstancesPage(page));
  },

  instanceDetailsPage: async ({ page }, use) => {
    await use(new InstanceDetailsPage(page));
  },

  authenticatedPage: async ({ page }, use) => {
    // Auto-authenticate for tests that need a logged-in user
    const user = mockUsers[0];
    await page.goto('/login');

    // Simulate OAuth login flow
    await page.evaluate((token) => {
      localStorage.setItem('access_token', token);
      localStorage.setItem('user_id', 'user-001');
    }, user.accessToken);

    await use(page);
  },
});

/**
 * Expect utility with custom matchers
 */
export const expect = test.expect;

/**
 * Common test utilities
 */
export const TestUtils = {
  /**
   * Wait for API response
   */
  async waitForResponse(page: ReturnType<typeof base['page']], urlPattern: string | RegExp) {
    return page.waitForResponse((response) => {
      return typeof urlPattern === 'string'
        ? response.url().includes(urlPattern)
        : urlPattern.test(response.url());
    });
  },

  /**
   * Clear authentication
   */
  async clearAuth(page: ReturnType<typeof base['page']>) {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  },

  /**
   * Mock authenticated user
   */
  async mockAuth(page: ReturnType<typeof base['page']>, userId: string = 'user-001') {
    const user = mockUsers.find((u) => u.id === userId);
    if (!user) throw new Error(`User ${userId} not found`);

    await page.evaluate((data) => {
      localStorage.setItem('access_token', data.token);
      localStorage.setItem('user_id', data.userId);
    }, { token: user.accessToken, userId: user.id });
  },

  /**
   * Take screenshot on failure
   */
  async captureFailure(page: ReturnType<typeof base['page']>, name: string) {
    await page.screenshot({ path: `test-results/failures/${name}.png`, fullPage: true });
  },
};
