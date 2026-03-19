import { test, expect } from '@playwright/test';
import { OAuthHelper } from '../helpers/oauth-helper';
import { InstanceHelper } from '../helpers/instance-helper';
import { APIHelper } from '../helpers/api-helper';

/**
 * E2E Tests for Instance Registration and Management
 *
 * These tests verify the complete instance lifecycle including:
 * - Instance creation with template selection
 * - Instance registration and provisioning
 * - Instance configuration and customization
 * - Instance start/stop operations
 * - Instance renewal and lifecycle management
 * - Instance deletion and cleanup
 *
 * Coverage:
 * - Instance creation flow
 * - Template selection (Personal, Team, Enterprise)
 * - Configuration validation
 * - API key allocation
 * - Docker container orchestration
 * - Instance state management
 * - Error handling and recovery
 *
 * @see platform/e2e/README.md for detailed documentation
 */

test.describe('Instance Registration and Management', () => {
  let oauthHelper: OAuthHelper;
  let instanceHelper: InstanceHelper;
  let apiHelper: APIHelper;

  test.beforeEach(async ({ page }) => {
    oauthHelper = new OAuthHelper(page);
    instanceHelper = new InstanceHelper(page);
    apiHelper = new APIHelper(page);

    // Setup authentication
    await oauthHelper.setupMockSession({
      user_id: 'test-user-001',
      access_token: 'mock-access-token-001',
    });

    // Mock API endpoints
    await apiHelper.setupInstanceAPI();
  });

  test.describe('Instance Creation Flow (INSTANCE-001)', () => {
    test('should display instance creation page', async ({ page }) => {
      await test.step('Navigate to instance creation page', async () => {
        await page.goto('/instances/create');
        await expect(page.locator('h1')).toContainText(/创建实例|create instance/i);
      });

      await test.step('Verify template options are displayed', async () => {
        await expect(page.locator('[data-testid="template-personal"]')).toBeVisible();
        await expect(page.locator('[data-testid="template-team"]')).toBeVisible();
        await expect(page.locator('[data-testid="template-enterprise"]')).toBeVisible();
      });

      await test.step('Verify form elements are present', async () => {
        await expect(page.locator('[data-testid="instance-name-input"]')).toBeVisible();
        await expect(page.locator('[data-testid="instance-description-input"]')).toBeVisible();
        await expect(page.locator('[data-testid="submit-button"]')).toBeVisible();
      });
    });

    test('should create instance with personal template', async ({ page }) => {
      await page.goto('/instances/create');

      await test.step('Select personal template', async () => {
        const personalTemplate = page.locator('[data-testid="template-personal"]');
        await personalTemplate.click();
        await expect(personalTemplate).toBeChecked();
      });

      await test.step('Fill instance details', async () => {
        const instanceName = `Personal Instance ${Date.now()}`;
        await page.locator('[data-testid="instance-name-input"]').fill(instanceName);
        await page.locator('[data-testid="instance-description-input"]').fill('Test personal instance');
      });

      await test.step('Submit instance creation', async () => {
        await page.locator('[data-testid="submit-button"]').click();

        // Should redirect to instances list or details
        await page.waitForURL('**/instances**', { timeout: 10000 });
      });
    });

    test('should create instance with team template', async ({ page }) => {
      await page.goto('/instances/create');

      await test.step('Select team template', async () => {
        const teamTemplate = page.locator('[data-testid="template-team"]');
        await teamTemplate.click();
        await expect(teamTemplate).toBeChecked();
      });

      await test.step('Fill instance details', async () => {
        const instanceName = `Team Instance ${Date.now()}`;
        await page.locator('[data-testid="instance-name-input"]').fill(instanceName);
        await page.locator('[data-testid="instance-description-input"]').fill('Test team instance');
      });

      await test.step('Submit instance creation', async () => {
        await page.locator('[data-testid="submit-button"]').click();
        await page.waitForURL('**/instances**', { timeout: 10000 });
      });
    });

    test('should validate instance name', async ({ page }) => {
      await page.goto('/instances/create');

      await test.step('Try empty name', async () => {
        await page.locator('[data-testid="instance-name-input"]').fill('');
        await page.locator('[data-testid="submit-button"]').click();

        const error = await instanceHelper.getFormError();
        expect(error).toMatch(/实例名称不能为空|name is required/i);
      });

      await test.step('Try name too short', async () => {
        await page.locator('[data-testid="instance-name-input"]').fill('AB');
        await page.locator('[data-testid="submit-button"]').click();

        const error = await instanceHelper.getFormError();
        expect(error).toMatch(/实例名称至少|name must be at least/i);
      });

      await test.step('Try name too long', async () => {
        await page.locator('[data-testid="instance-name-input"]').fill('A'.repeat(101));
        await page.locator('[data-testid="submit-button"]').click();

        const error = await instanceHelper.getFormError();
        expect(error).toMatch(/实例名称最多|name must be at most/i);
      });
    });
  });

  test.describe('Instance Registration (INSTANCE-002)', () => {
    test('should register instance with backend API', async ({ page }) => {
      const instanceData = {
        name: 'Test Instance',
        template: 'personal',
        description: 'Test description',
      };

      await page.goto('/instances/create');
      await instanceHelper.fillInstanceForm(instanceData);
      await page.locator('[data-testid="submit-button"]').click();

      await test.step('Verify API call was made', async () => {
        // Wait for navigation
        await page.waitForURL('**/instances**', { timeout: 10000 });

        // Verify instance appears in list
        const instanceExists = await instanceHelper.instanceExistsInList(instanceData.name);
        expect(instanceExists).toBe(true);
      });
    });

    test('should allocate API key for instance', async ({ page }) => {
      await page.goto('/instances/create');

      await test.step('Create instance', async () => {
        const instanceName = `Instance ${Date.now()}`;
        await page.locator('[data-testid="template-personal"]').click();
        await page.locator('[data-testid="instance-name-input"]').fill(instanceName);
        await page.locator('[data-testid="instance-description-input"]').fill('Test instance');
        await page.locator('[data-testid="submit-button"]').click();

        await page.waitForURL('**/instances**', { timeout: 10000 });
      });

      await test.step('Navigate to instance details', async () => {
        const firstInstance = page.locator('[data-testid="instance-card"]').first();
        await firstInstance.click();

        await page.waitForURL('**/instances/**', { timeout: 5000 });
      });

      await test.step('Verify API key is allocated', async () => {
        const apiKeySection = page.locator('[data-testid="api-key-section"]');
        await expect(apiKeySection).toBeVisible();

        const apiKey = await page.locator('[data-testid="api-key-value"]').textContent();
        expect(apiKey).toBeTruthy();
        expect(apiKey?.length).toBeGreaterThan(32); // API key should be long enough
      });
    });

    test('should provision Docker container for instance', async ({ page }) => {
      // Mock Docker container provisioning
      await apiHelper.mockDockerProvisioning({
        container_id: 'container-001',
        status: 'running',
      });

      await page.goto('/instances/create');

      await test.step('Create instance', async () => {
        const instanceName = `Instance ${Date.now()}`;
        await page.locator('[data-testid="template-personal"]').click();
        await page.locator('[data-testid="instance-name-input"]').fill(instanceName);
        await page.locator('[data-testid="submit-button"]').click();

        await page.waitForURL('**/instances**', { timeout: 10000 });
      });

      await test.step('Verify container is provisioned', async () => {
        const firstInstance = page.locator('[data-testid="instance-card"]').first();
        await firstInstance.click();

        // Verify container status
        const containerStatus = await page.locator('[data-testid="container-status"]').textContent();
        expect(containerStatus).toMatch(/运行中|running/i);
      });
    });
  });

  test.describe('Instance Configuration (INSTANCE-003)', () => {
    test('should display instance configuration options', async ({ page }) => {
      // Create an instance first
      const instanceId = await instanceHelper.createInstanceViaAPI({
        name: 'Config Test Instance',
        template: 'personal',
      });

      await page.goto(`/instances/${instanceId}`);

      await test.step('Verify configuration tabs are visible', async () => {
        await expect(page.locator('[data-testid="config-general"]')).toBeVisible();
        await expect(page.locator('[data-testid="config-resources"]')).toBeVisible();
        await expect(page.locator('[data-testid="config-security"]')).toBeVisible();
      });
    });

    test('should update instance configuration', async ({ page }) => {
      const instanceId = await instanceHelper.createInstanceViaAPI({
        name: 'Update Test Instance',
        template: 'personal',
      });

      await page.goto(`/instances/${instanceId}/config`);

      await test.step('Update instance name', async () => {
        await page.locator('[data-testid="config-name-input"]').clear();
        await page.locator('[data-testid="config-name-input"]').fill('Updated Instance Name');
        await page.locator('[data-testid="save-config-button"]').click();

        // Verify success message
        const successMessage = await instanceHelper.getSuccessMessage();
        expect(successMessage).toMatch(/保存成功|saved successfully/i);
      });

      await test.step('Verify configuration is persisted', async () => {
        await page.reload();

        const nameValue = await page.locator('[data-testid="config-name-input"]').inputValue();
        expect(nameValue).toBe('Updated Instance Name');
      });
    });

    test('should validate configuration changes', async ({ page }) => {
      const instanceId = await instanceHelper.createInstanceViaAPI({
        name: 'Validation Test Instance',
        template: 'personal',
      });

      await page.goto(`/instances/${instanceId}/config`);

      await test.step('Try invalid CPU allocation', async () => {
        await page.locator('[data-testid="config-cpu-input"]').fill('999');
        await page.locator('[data-testid="save-config-button"]').click();

        const error = await instanceHelper.getErrorMessage();
        expect(error).toMatch(/CPU.*超出范围|CPU.*exceeds limit/i);
      });

      await test.step('Try invalid memory allocation', async () => {
        await page.locator('[data-testid="config-memory-input"]').fill('-1');
        await page.locator('[data-testid="save-config-button"]').click();

        const error = await instanceHelper.getErrorMessage();
        expect(error).toMatch(/内存.*无效|memory.*invalid/i);
      });
    });
  });

  test.describe('Instance Lifecycle (INSTANCE-004)', () => {
    test('should start instance successfully', async ({ page }) => {
      const instanceId = await instanceHelper.createInstanceViaAPI({
        name: 'Start Test Instance',
        template: 'personal',
        status: 'stopped',
      });

      await page.goto(`/instances/${instanceId}`);

      await test.step('Click start button', async () => {
        const startButton = page.locator('[data-testid="start-button"]');
        await expect(startButton).toBeEnabled();
        await startButton.click();
      });

      await test.step('Verify status changes to starting', async () => {
        const status = await page.locator('[data-testid="instance-status"]').textContent();
        expect(status).toMatch(/启动中|starting/i);
      });

      await test.step('Wait for instance to be running', async () => {
        await page.waitForTimeout(3000);

        const status = await page.locator('[data-testid="instance-status"]').textContent();
        expect(status).toMatch(/运行中|running/i);
      });
    });

    test('should stop instance successfully', async ({ page }) => {
      const instanceId = await instanceHelper.createInstanceViaAPI({
        name: 'Stop Test Instance',
        template: 'personal',
        status: 'running',
      });

      await page.goto(`/instances/${instanceId}`);

      await test.step('Click stop button', async () => {
        const stopButton = page.locator('[data-testid="stop-button"]');
        await expect(stopButton).toBeEnabled();
        await stopButton.click();

        // Confirm stop if confirmation dialog appears
        const confirmButton = page.locator('[data-testid="confirm-stop-button"]');
        const isVisible = await confirmButton.isVisible().catch(() => false);
        if (isVisible) {
          await confirmButton.click();
        }
      });

      await test.step('Verify status changes to stopping', async () => {
        const status = await page.locator('[data-testid="instance-status"]').textContent();
        expect(status).toMatch(/停止中|stopping/i);
      });

      await test.step('Wait for instance to be stopped', async () => {
        await page.waitForTimeout(3000);

        const status = await page.locator('[data-testid="instance-status"]').textContent();
        expect(status).toMatch(/已停止|stopped/i);
      });
    });

    test('should restart instance successfully', async ({ page }) => {
      const instanceId = await instanceHelper.createInstanceViaAPI({
        name: 'Restart Test Instance',
        template: 'personal',
        status: 'running',
      });

      await page.goto(`/instances/${instanceId}`);

      await test.step('Click restart button', async () => {
        const restartButton = page.locator('[data-testid="restart-button"]');
        await restartButton.click();

        // Confirm restart if confirmation dialog appears
        const confirmButton = page.locator('[data-testid="confirm-restart-button"]');
        const isVisible = await confirmButton.isVisible().catch(() => false);
        if (isVisible) {
          await confirmButton.click();
        }
      });

      await test.step('Verify restart flow', async () => {
        // Should go through stopping → starting → running
        await page.waitForTimeout(2000);
        let status = await page.locator('[data-testid="instance-status"]').textContent();
        expect(status).toMatch(/停止中|stopping/i);

        await page.waitForTimeout(3000);
        status = await page.locator('[data-testid="instance-status"]').textContent();
        expect(status).toMatch(/启动中|starting/i);

        await page.waitForTimeout(3000);
        status = await page.locator('[data-testid="instance-status"]').textContent();
        expect(status).toMatch(/运行中|running/i);
      });
    });
  });

  test.describe('Instance Renewal (INSTANCE-005)', () => {
    test('should display renewal options', async ({ page }) => {
      const instanceId = await instanceHelper.createInstanceViaAPI({
        name: 'Renewal Test Instance',
        template: 'personal',
      });

      await page.goto(`/instances/${instanceId}`);

      await test.step('Click renew button', async () => {
        const renewButton = page.locator('[data-testid="renew-button"]');
        await renewButton.click();
      });

      await test.step('Verify renewal modal is displayed', async () => {
        await expect(page.locator('[data-testid="renewal-modal"]')).toBeVisible();
        await expect(page.locator('[data-testid="renew-30-days"]')).toBeVisible();
        await expect(page.locator('[data-testid="renew-90-days"]')).toBeVisible();
        await expect(page.locator('[data-testid="renew-180-days"]')).toBeVisible();
      });

      await test.step('Verify pricing is displayed', async () => {
        const price30 = await page.locator('[data-testid="renew-30-days-price"]').textContent();
        const price90 = await page.locator('[data-testid="renew-90-days-price"]').textContent();
        const price180 = await page.locator('[data-testid="renew-180-days-price"]').textContent();

        expect(price30).toBeTruthy();
        expect(price90).toBeTruthy();
        expect(price180).toBeTruthy();
      });
    });

    test('should renew instance for 30 days', async ({ page }) => {
      const instanceId = await instanceHelper.createInstanceViaAPI({
        name: '30-Day Renewal Test',
        template: 'personal',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
      });

      await page.goto(`/instances/${instanceId}`);

      await test.step('Open renewal modal', async () => {
        await page.locator('[data-testid="renew-button"]').click();
        await expect(page.locator('[data-testid="renewal-modal"]')).toBeVisible();
      });

      await test.step('Select 30-day renewal', async () => {
        await page.locator('[data-testid="renew-30-days"]').click();
        await page.locator('[data-testid="confirm-renewal-button"]').click();
      });

      await test.step('Verify renewal success', async () => {
        const successMessage = await instanceHelper.getSuccessMessage();
        expect(successMessage).toMatch(/续费成功|renewal successful/i);
      });

      await test.step('Verify expiry date is updated', async () => {
        await page.reload();

        const expiryDate = await page.locator('[data-testid="instance-expiry"]').textContent();
        expect(expiryDate).toBeTruthy();
      });
    });

    test('should display renewal history', async ({ page }) => {
      const instanceId = await instanceHelper.createInstanceViaAPI({
        name: 'Renewal History Test',
        template: 'personal',
      });

      await page.goto(`/instances/${instanceId}`);

      await test.step('Navigate to renewal history', async () => {
        await page.locator('[data-testid="renewal-history-tab"]').click();
      });

      await test.step('Verify history is displayed', async () => {
        await expect(page.locator('[data-testid="renewal-history-list"]')).toBeVisible();

        // Should have at least the creation entry
        const historyItems = await page.locator('[data-testid="renewal-history-item"]').count();
        expect(historyItems).toBeGreaterThanOrEqual(1);
      });

      await test.step('Verify history item details', async () => {
        const firstItem = page.locator('[data-testid="renewal-history-item"]').first();

        const date = await firstItem.locator('[data-testid="renewal-date"]').textContent();
        const duration = await firstItem.locator('[data-testid="renewal-duration"]').textContent();
        const amount = await firstItem.locator('[data-testid="renewal-amount"]').textContent();

        expect(date).toBeTruthy();
        expect(duration).toBeTruthy();
        expect(amount).toBeTruthy();
      });
    });
  });

  test.describe('Instance Deletion (INSTANCE-006)', () => {
    test('should delete instance with confirmation', async ({ page }) => {
      const instanceId = await instanceHelper.createInstanceViaAPI({
        name: 'Delete Test Instance',
        template: 'personal',
      });

      await page.goto(`/instances/${instanceId}`);

      await test.step('Click delete button', async () => {
        await page.locator('[data-testid="delete-button"]').click();
      });

      await test.step('Verify confirmation dialog', async () => {
        await expect(page.locator('[data-testid="delete-confirmation-modal"]')).toBeVisible();
        await expect(page.locator('[data-testid="delete-warning-text"]')).toBeVisible();
        await expect(page.locator('[data-testid="confirm-delete-button"]')).toBeVisible();
        await expect(page.locator('[data-testid="cancel-delete-button"]')).toBeVisible();
      });

      await test.step('Confirm deletion', async () => {
        await page.locator('[data-testid="confirm-delete-button"]').click();

        // Should redirect to instances list
        await page.waitForURL('**/instances', { timeout: 10000 });
      });

      await test.step('Verify instance is removed from list', async () => {
        const exists = await instanceHelper.instanceExistsInList('Delete Test Instance');
        expect(exists).toBe(false);
      });
    });

    test('should cancel deletion on cancel', async ({ page }) => {
      const instanceId = await instanceHelper.createInstanceViaAPI({
        name: 'Cancel Delete Test Instance',
        template: 'personal',
      });

      await page.goto(`/instances/${instanceId}`);

      await test.step('Click delete button', async () => {
        await page.locator('[data-testid="delete-button"]').click();
      });

      await test.step('Click cancel', async () => {
        await page.locator('[data-testid="cancel-delete-button"]').click();

        // Modal should close
        await expect(page.locator('[data-testid="delete-confirmation-modal"]')).not.toBeVisible();
      });

      await test.step('Verify instance still exists', async () => {
        // Should still be on instance details page
        expect(page.url()).toContain(instanceId);

        const instanceName = await page.locator('[data-testid="instance-name"]').textContent();
        expect(instanceName).toBe('Cancel Delete Test Instance');
      });
    });
  });

  test.describe('Instance List and Filtering (INSTANCE-007)', () => {
    test('should display all instances', async ({ page }) => {
      // Create multiple instances
      await instanceHelper.createInstanceViaAPI({ name: 'Instance 1', template: 'personal' });
      await instanceHelper.createInstanceViaAPI({ name: 'Instance 2', template: 'team' });
      await instanceHelper.createInstanceViaAPI({ name: 'Instance 3', template: 'enterprise' });

      await page.goto('/instances');

      await test.step('Verify all instances are displayed', async () => {
        const instanceCards = await page.locator('[data-testid="instance-card"]').count();
        expect(instanceCards).toBeGreaterThanOrEqual(3);
      });
    });

    test('should filter instances by status', async ({ page }) => {
      await instanceHelper.createInstanceViaAPI({ name: 'Running Instance', status: 'running' });
      await instanceHelper.createInstanceViaAPI({ name: 'Stopped Instance', status: 'stopped' });

      await page.goto('/instances');

      await test.step('Filter by running status', async () => {
        await page.locator('[data-testid="filter-status-running"]').click();
        await page.waitForTimeout(500);

        const runningCount = await page.locator('[data-testid="instance-card"]').count();
        expect(runningCount).toBeGreaterThan(0);

        // Verify filtered instances show running status
        const firstStatus = await page.locator('[data-testid="instance-status"]').first().textContent();
        expect(firstStatus).toMatch(/运行中|running/i);
      });
    });

    test('should search instances by name', async ({ page }) => {
      await instanceHelper.createInstanceViaAPI({ name: 'Search Test Instance 1' });
      await instanceHelper.createInstanceViaAPI({ name: 'Search Test Instance 2' });
      await instanceHelper.createInstanceViaAPI({ name: 'Other Instance' });

      await page.goto('/instances');

      await test.step('Search for specific instance', async () => {
        await page.locator('[data-testid="search-input"]').fill('Search Test');
        await page.waitForTimeout(500);

        // Should only show matching instances
        const instanceCards = await page.locator('[data-testid="instance-card"]').all();
        for (const card of instanceCards) {
          const name = await card.locator('[data-testid="instance-name"]').textContent();
          expect(name).toContain('Search Test');
        }
      });
    });
  });

  test.describe('Error Handling (INSTANCE-008)', () => {
    test('should handle instance creation failure', async ({ page }) => {
      // Mock API failure
      await page.route('**/api/instances', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Failed to create instance',
          }),
        });
      });

      await page.goto('/instances/create');

      await test.step('Try to create instance', async () => {
        await page.locator('[data-testid="template-personal"]').click();
        await page.locator('[data-testid="instance-name-input"]').fill('Failed Instance');
        await page.locator('[data-testid="submit-button"]').click();
      });

      await test.step('Verify error message is displayed', async () => {
        const error = await instanceHelper.getErrorMessage();
        expect(error).toMatch(/创建失败|failed to create/i);
      });
    });

    test('should handle duplicate instance name', async ({ page }) => {
      const duplicateName = 'Duplicate Instance Name';

      // Create first instance
      await instanceHelper.createInstanceViaAPI({ name: duplicateName });

      // Mock API to return duplicate error
      await page.route('**/api/instances', route => {
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Instance name already exists',
          }),
        });
      });

      await page.goto('/instances/create');

      await test.step('Try to create duplicate', async () => {
        await page.locator('[data-testid="template-personal"]').click();
        await page.locator('[data-testid="instance-name-input"]').fill(duplicateName);
        await page.locator('[data-testid="submit-button"]').click();
      });

      await test.step('Verify duplicate error message', async () => {
        const error = await instanceHelper.getErrorMessage();
        expect(error).toMatch(/名称已存在|already exists/i);
      });
    });

    test('should handle instance start failure', async ({ page }) => {
      const instanceId = await instanceHelper.createInstanceViaAPI({
        name: 'Start Failure Test',
        status: 'stopped',
      });

      // Mock start failure
      await page.route(`**/api/instances/${instanceId}/start`, route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Failed to start instance',
          }),
        });
      });

      await page.goto(`/instances/${instanceId}`);

      await test.step('Try to start instance', async () => {
        await page.locator('[data-testid="start-button"]').click();
        await page.waitForTimeout(2000);
      });

      await test.step('Verify error handling', async () => {
        const error = await instanceHelper.getErrorMessage();
        expect(error).toMatch(/启动失败|failed to start/i);

        // Status should remain stopped
        const status = await page.locator('[data-testid="instance-status"]').textContent();
        expect(status).toMatch(/已停止|stopped/i);
      });
    });
  });
});
