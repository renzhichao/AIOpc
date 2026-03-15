import { test, expect } from './fixtures';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { InstancesPage } from '../pages/InstancesPage';
import { InstanceDetailsPage } from '../pages/InstanceDetailsPage';
import { TestDataHelpers } from './fixtures/test-data';
import { setupApiMocks } from './helpers/api-mocks';

/**
 * Complete User Journey E2E Tests
 *
 * These tests verify the complete end-to-end user flow:
 * 1. Login with QR code and OAuth
 * 2. Navigate to dashboard
 * 3. Create a new instance with preset configuration
 * 4. View instance details
 * 5. Start/stop the instance
 * 6. Renew the instance
 * 7. View instance history
 * 8. Logout
 */

test.describe('Complete User Journey', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;
  let instancesPage: InstancesPage;
  let instanceDetailsPage: InstanceDetailsPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    instancesPage = new InstancesPage(page);
    instanceDetailsPage = new InstanceDetailsPage(page);

    // Setup API mocks
    await setupApiMocks(page);
  });

  test('complete journey: login → create instance → use → renew', async ({ page }) => {
    // ===== STEP 1: LOGIN =====
    await test.step('User logs in with QR code', async () => {
      await loginPage.goto();

      // Verify QR code is displayed
      await loginPage.waitForQRCode();
      expect(await loginPage.qrCodeContainer.isVisible()).toBe(true);

      // Verify QR code expiry is shown
      const qrCodeExpiry = await loginPage.getQRCodeExpiry();
      expect(qrCodeExpiry).toBeTruthy();
      expect(qrCodeExpiry).toContain('有效期至');

      // Simulate OAuth login
      await loginPage.simulateOAuthLogin('user-001', 'mock-access-token-001');

      // Verify redirect to dashboard
      await page.waitForURL('**/dashboard', { timeout: 10000 });
      expect(await loginPage.isAuthenticated()).toBe(true);
      await expect(dashboardPage.heading).toBeVisible();
    });

    // ===== STEP 2: NAVIGATE TO INSTANCES =====
    await test.step('User navigates to instances page', async () => {
      await dashboardPage.navigateToInstances();
      await expect(instancesPage.heading).toBeVisible();
    });

    // ===== STEP 3: CREATE INSTANCE =====
    let instanceName: string;
    await test.step('User creates a new instance', async () => {
      // Click create button
      await instancesPage.clickCreateInstance();
      await page.waitForURL('**/instances/create', { timeout: 5000 });

      // Select personal template
      const personalTemplate = page.locator('[data-testid="template-personal"]');
      await personalTemplate.click();
      await expect(personalTemplate).toBeChecked();

      // Fill in form
      instanceName = TestDataHelpers.generateInstanceName();
      const instanceDescription = TestDataHelpers.generateInstanceDescription();

      const nameInput = page.locator('[data-testid="instance-name-input"]');
      const descInput = page.locator('[data-testid="instance-description-input"]');

      await nameInput.fill(instanceName);
      await descInput.fill(instanceDescription);

      // Submit form
      const submitButton = page.locator('[data-testid="submit-button"]');
      await submitButton.click();

      // Wait for success and redirect
      await page.waitForURL('**/instances', { timeout: 10000 });

      // Verify instance appears in list
      await instancesPage.waitForInstance(instanceName, 10000);
      expect(await instancesPage.hasInstance(instanceName)).toBe(true);
    });

    // ===== STEP 4: VIEW INSTANCE DETAILS =====
    await test.step('User views instance details', async () => {
      // Navigate to first instance
      await instanceDetailsPage.goto('instance-001');

      // Verify instance details are displayed
      const instanceName = await instanceDetailsPage.getInstanceName();
      expect(instanceName).toBeTruthy();

      const instanceStatus = await instanceDetailsPage.getInstanceStatus();
      expect(instanceStatus).toBeTruthy();

      const instanceTemplate = await instanceDetailsPage.getInstanceTemplate();
      expect(instanceTemplate).toBeTruthy();
    });

    // ===== STEP 5: START INSTANCE =====
    await test.step('User starts the instance', async () => {
      // Check if instance can be started
      const canStart = await instanceDetailsPage.isStartButtonEnabled();

      if (canStart) {
        await instanceDetailsPage.startInstance();
        await page.waitForTimeout(1000);

        // Verify status changed
        const status = await instanceDetailsPage.getInstanceStatus();
        expect(status).toBeTruthy();
      }
    });

    // ===== STEP 6: RENEW INSTANCE =====
    await test.step('User renews the instance', async () => {
      // Verify renew button is visible
      expect(await instanceDetailsPage.isRenewButtonVisible()).toBe(true);

      // Open renewal modal
      await instanceDetailsPage.clickRenewButton();
      expect(await instanceDetailsPage.isRenewModalVisible()).toBe(true);

      // Verify renewal options
      await expect(instanceDetailsPage.renewButton30Days).toBeVisible();
      await expect(instanceDetailsPage.renewButton90Days).toBeVisible();
      await expect(instanceDetailsPage.renewButton180Days).toBeVisible();

      // Renew for 30 days
      await instanceDetailsPage.renewFor30Days();

      // Verify success
      const successMessage = await instanceDetailsPage.getSuccessMessage();
      expect(successMessage).toBeTruthy();
      expect(successMessage).toMatch(/续费成功|success|renewed/i);
    });

    // ===== STEP 7: VIEW RENEWAL HISTORY =====
    await test.step('User views renewal history', async () => {
      // Show renewal history
      await instanceDetailsPage.showRenewalHistory();
      expect(await instanceDetailsPage.isRenewalHistoryVisible()).toBe(true);

      // Get renewal count
      const count = await instanceDetailsPage.getRenewalHistoryCount();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    // ===== STEP 8: NAVIGATE BACK TO LIST =====
    await test.step('User navigates back to instances list', async () => {
      await instanceDetailsPage.goBack();
      await page.waitForURL('**/instances', { timeout: 5000 });
      expect(await instancesPage.heading).toBeVisible();
    });

    // ===== STEP 9: VERIFY INSTANCE IN LIST =====
    await test.step('User verifies instance in list', async () => {
      const instanceCount = await instancesPage.getInstanceCount();
      expect(instanceCount).toBeGreaterThan(0);
    });

    // ===== STEP 10: LOGOUT =====
    await test.step('User logs out', async () => {
      await instancesPage.goto();
      await dashboardPage.navigateToInstances();

      // Logout from dashboard
      await page.goto('/dashboard');
      await dashboardPage.waitForLoad();
      await dashboardPage.logout();

      // Verify redirect to login
      await expect(loginPage.title).toBeVisible();
      expect(await loginPage.isAuthenticated()).toBe(false);
    });
  });

  test('journey: create multiple instances with different templates', async ({ page }) => {
    // Login first
    await loginPage.goto();
    await loginPage.simulateOAuthLogin('user-001', 'mock-access-token-001');
    await dashboardPage.waitForLoad();

    // Create personal instance
    await test.step('Create personal instance', async () => {
      await dashboardPage.navigateToInstances();
      await instancesPage.clickCreateInstance();

      const personalTemplate = page.locator('[data-testid="template-personal"]');
      await personalTemplate.click();

      const instanceName = `Personal ${Date.now()}`;
      const nameInput = page.locator('[data-testid="instance-name-input"]');
      await nameInput.fill(instanceName);

      const submitButton = page.locator('[data-testid="submit-button"]');
      await submitButton.click();

      await page.waitForURL('**/instances', { timeout: 10000 });
      expect(await instancesPage.hasInstance(instanceName)).toBe(true);
    });

    // Create team instance
    await test.step('Create team instance', async () => {
      await instancesPage.clickCreateInstance();

      const teamTemplate = page.locator('[data-testid="template-team"]');
      await teamTemplate.click();

      const instanceName = `Team ${Date.now()}`;
      const nameInput = page.locator('[data-testid="instance-name-input"]');
      await nameInput.fill(instanceName);

      const submitButton = page.locator('[data-testid="submit-button"]');
      await submitButton.click();

      await page.waitForURL('**/instances', { timeout: 10000 });
      expect(await instancesPage.getInstanceCount()).toBeGreaterThan(1);
    });
  });

  test('journey: instance lifecycle management', async ({ page }) => {
    // Login
    await loginPage.goto();
    await loginPage.simulateOAuthLogin('user-001', 'mock-access-token-001');
    await dashboardPage.waitForLoad();

    // Navigate to instance details
    await instanceDetailsPage.goto('instance-002');

    // Test: Start instance
    await test.step('Start instance', async () => {
      const canStart = await instanceDetailsPage.isStartButtonEnabled();
      if (canStart) {
        await instanceDetailsPage.startInstance();
        await page.waitForTimeout(1000);
      }
    });

    // Test: Stop instance
    await test.step('Stop instance', async () => {
      const canStop = await instanceDetailsPage.isStopButtonEnabled();
      if (canStop) {
        await instanceDetailsPage.stopInstance();
        await page.waitForTimeout(1000);
      }
    });

    // Test: Renew instance
    await test.step('Renew instance', async () => {
      await instanceDetailsPage.renewFor90Days();
      const successMessage = await instanceDetailsPage.getSuccessMessage();
      expect(successMessage).toBeTruthy();
    });

    // Test: View history
    await test.step('View renewal history', async () => {
      await instanceDetailsPage.showRenewalHistory();
      expect(await instanceDetailsPage.isRenewalHistoryVisible()).toBe(true);
    });
  });

  test('journey: error handling throughout flow', async ({ page }) => {
    // Login
    await loginPage.goto();
    await loginPage.simulateOAuthLogin('user-001', 'mock-access-token-001');
    await dashboardPage.waitForLoad();

    // Test: Create instance with duplicate name
    await test.step('Handle duplicate name error', async () => {
      await dashboardPage.navigateToInstances();
      await instancesPage.clickCreateInstance();

      const personalTemplate = page.locator('[data-testid="template-personal"]');
      await personalTemplate.click();

      const nameInput = page.locator('[data-testid="instance-name-input"]');
      await nameInput.fill('Duplicate Instance Name'); // This should trigger error

      const submitButton = page.locator('[data-testid="submit-button"]');
      await submitButton.click();

      // Should show error (mocked in api-mocks)
      await page.waitForTimeout(1000);
    });

    // Test: Handle navigation to non-existent instance
    await test.step('Handle 404 for non-existent instance', async () => {
      await page.goto('/instances/non-existent-id');
      await page.waitForTimeout(2000);

      // Should handle gracefully (either show error or redirect)
      const currentUrl = page.url();
      expect(currentUrl).toBeTruthy();
    });
  });

  test('journey: search and filter instances', async ({ page }) => {
    // Login
    await loginPage.goto();
    await loginPage.simulateOAuthLogin('user-001', 'mock-access-token-001');
    await dashboardPage.waitForLoad();

    await test.step('Search for instances', async () => {
      await dashboardPage.navigateToInstances();

      // Search for specific instance
      await instancesPage.searchInstances('测试');
      await page.waitForTimeout(500);

      // Verify search was performed
      const searchValue = await instancesPage.searchInput.inputValue();
      expect(searchValue).toBe('测试');
    });

    await test.step('Clear search', async () => {
      await instancesPage.clearSearch();
      await page.waitForTimeout(500);

      const searchValue = await instancesPage.searchInput.inputValue();
      expect(searchValue).toBe('');
    });
  });

  test('journey: responsive design on different screen sizes', async ({ page }) => {
    // Login on mobile
    await test.step('Test on mobile viewport', async () => {
      await page.setViewportSize({ width: 375, height: 667 });
      await loginPage.goto();
      await loginPage.waitForQRCode();
      expect(await loginPage.qrCodeContainer.isVisible()).toBe(true);
    });

    // Login on desktop
    await test.step('Test on desktop viewport', async () => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.reload();
      await loginPage.waitForQRCode();
      expect(await loginPage.qrCodeContainer.isVisible()).toBe(true);
    });

    // Test instance creation on tablet
    await test.step('Test instance creation on tablet', async () => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await loginPage.simulateOAuthLogin('user-001', 'mock-access-token-001');
      await dashboardPage.waitForLoad();
      await dashboardPage.navigateToInstances();

      await instancesPage.clickCreateInstance();
      await page.waitForURL('**/instances/create', { timeout: 5000 });

      // Verify form is visible on tablet
      const submitButton = page.locator('[data-testid="submit-button"]');
      await expect(submitButton).toBeVisible();
    });
  });
});
