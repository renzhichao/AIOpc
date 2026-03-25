/* eslint-disable @typescript-eslint/no-unused-vars */
import { test as base } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { InstancesPage } from './pages/InstancesPage';
import { InstanceDetailsPage } from './pages/InstanceDetailsPage';
import { mockUsers } from './fixtures/test-data';
import { setupApiMocks } from './e2e/helpers/api-mocks';

/**
 * Extended Playwright fixtures
 *
 * This file extends the default Playwright test fixtures with custom page objects
 * and test utilities for the AIOpc platform.
 */

export type PageObjects = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  instancesPage: InstancesPage;
  instanceDetailsPage: InstanceDetailsPage;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedPage: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any;
};

export const test = base.extend<PageObjects>({
  loginPage: async ({ page }, use) => {
    // const loginPage = new LoginPage(page);
  // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(loginPage);
  },

  dashboardPage: async ({ page }, use) => {
    // const dashboardPage = new DashboardPage(page);
  // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(dashboardPage);
  },

  instancesPage: async ({ page }, use) => {
    // const instancesPage = new InstancesPage(page);
  // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(instancesPage);
  },

  instanceDetailsPage: async ({ page }, use) => {
    // const instanceDetailsPage = new InstanceDetailsPage(page);
  // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(instanceDetailsPage);
  },

  authenticatedPage: async ({ page, context }, use) => {
    // CRITICAL: Setup API mocks BEFORE any navigation
    await setupApiMocks(page);

    // Set up authentication BEFORE any navigation using initScript
    // Note: Set multiple keys for compatibility across different services
    await context.addInitScript((user) => {
      // Set for instanceService (access_token)
      localStorage.setItem('access_token', user.accessToken);
      // Set for AuthContext (auth_token)
      localStorage.setItem('auth_token', user.accessToken);
      // Set user data
      localStorage.setItem('user_data', JSON.stringify({
        id: user.id,
        feishu_user_id: user.id,
        name: user.name,
        email: user.email,
      }));
      // Also set auth_user for AuthContext compatibility
      localStorage.setItem('auth_user', JSON.stringify({
        id: user.id,
        feishu_user_id: user.id,
        name: user.name,
        email: user.email,
      }));
    }, mockUsers.authenticatedUser);

    // Navigate to /login first to initialize the app, then to dashboard
    // This ensures React is properly initialized before tests run
    await page.goto('/login', { waitUntil: 'commit' });
    await page.goto('/dashboard', { waitUntil: 'commit' });

    // Wait for dashboard to load
    await page.waitForSelector('[data-testid="dashboard-container"]', { timeout: 10000 });

  // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);

    // Clean up after test
    try {
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    } catch {
      // Ignore errors during cleanup
    }
  },
});

export { expect } from '@playwright/test';
