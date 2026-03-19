import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Testing Configuration for AIOpc Platform
 *
 * This configuration sets up comprehensive end-to-end testing for the AIOpc cloud SaaS platform.
 * Tests cover OAuth authentication, instance registration, and WebSocket connections.
 *
 * @see platform/e2e/README.md for detailed documentation
 */
export default defineConfig({
  testDir: './tests',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only for flaky tests */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI to ensure resource stability */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter configuration for test results */
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results/test-results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  /* Shared settings for all tests */
  use: {
    /* Base URL for the platform backend API */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure for debugging */
    screenshot: 'only-on-failure',

    /* Video recording on failure */
    video: 'retain-on-failure',

    /* Action timeout */
    actionTimeout: 10000,

    /* Navigation timeout */
    navigationTimeout: 30000,

    /* Extra HTTP headers for authentication */
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },

    /* Ignore HTTPS errors for local development */
    ignoreHTTPSErrors: !process.env.CI,
  },

  /* Configure projects for different browsers and viewports */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'cd ../backend && npm run start:dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },

  /* Global setup and teardown */
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  /* Test timeout */
  timeout: 60000,

  /* Expect timeout */
  expect: {
    timeout: 10000,
  },
});
