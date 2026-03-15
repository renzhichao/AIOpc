import { test, expect } from '../../fixtures';
import { InstancesPage } from '../../pages/InstancesPage';
import { InstanceDetailsPage } from '../../pages/InstanceDetailsPage';
import { LoginPage } from '../../pages/LoginPage';
import { mockInstances } from '../../fixtures/test-data';

/**
 * E2E Tests for Instance Management Flow
 *
 * These tests verify instance management operations including:
 * - Viewing instance details
 * - Starting instances
 * - Stopping instances
 * - Deleting instances
 * - Status changes
 * - Error handling
 */

test.describe('Instance Management Flow', () => {
  let loginPage: LoginPage;
  let instancesPage: InstancesPage;
  let instanceDetailsPage: InstanceDetailsPage;

  test.beforeEach(async ({ authenticatedPage }) => {
    loginPage = new LoginPage(authenticatedPage);
    instancesPage = new InstancesPage(authenticatedPage);
    instanceDetailsPage = new InstanceDetailsPage(authenticatedPage);

    // Start from instances page
    await instancesPage.goto();
  });

  test('should display list of instances', async ({ authenticatedPage }) => {
    // Verify instances list is visible
    await expect(instancesPage.heading).toBeVisible();
    await expect(instancesPage.instanceList).toBeVisible();

    // Get instance count (should be at least 0)
    const count = await instancesPage.getInstanceCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should navigate to instance details page', async ({ authenticatedPage }) => {
    // Assuming there's at least one instance
    const count = await instancesPage.getInstanceCount();
    if (count > 0) {
      // Click first instance
      await instancesPage.clickInstance(0);

      // Verify navigation to details page
      await authenticatedPage.waitForURL('**/instances/**', { timeout: 5000 });
      const currentUrl = authenticatedPage.url();
      expect(currentUrl).toContain('/instances/');

      // Verify details page heading
      await expect(instanceDetailsPage.heading).toBeVisible();
    }
  });

  test('should display instance details correctly', async ({ authenticatedPage }) => {
    const testInstance = mockInstances[0];

    // Navigate to instance details
    await instanceDetailsPage.goto(testInstance.id);

    // Verify instance information
    const name = await instanceDetailsPage.getInstanceName();
    const description = await instanceDetailsPage.getInstanceDescription();
    const template = await instanceDetailsPage.getInstanceTemplate();
    const status = await instanceDetailsPage.getInstanceStatus();

    expect(name).toBe(testInstance.name);
    expect(description).toBe(testInstance.description);
    expect(['personal', 'team']).toContain(template);
    expect(['running', 'stopped', 'pending']).toContain(status.toLowerCase());
  });

  test('should start a stopped instance', async ({ authenticatedPage }) => {
    const stoppedInstance = mockInstances.find((i) => i.status === 'stopped');
    if (!stoppedInstance) {
      test.skip();
      return;
    }

    // Navigate to instance details
    await instanceDetailsPage.goto(stoppedInstance.id);

    // Verify initial status is stopped
    expect(await instanceDetailsPage.isStopped()).toBe(true);

    // Verify start button is enabled
    expect(await instanceDetailsPage.isStartButtonEnabled()).toBe(true);

    // Start the instance
    await instanceDetailsPage.startInstance();

    // Wait for status change to running
    await instanceDetailsPage.waitForStatusChange('running');

    // Verify status changed to running
    expect(await instanceDetailsPage.isRunning()).toBe(true);
  });

  test('should stop a running instance', async ({ authenticatedPage }) => {
    const runningInstance = mockInstances.find((i) => i.status === 'running');
    if (!runningInstance) {
      test.skip();
      return;
    }

    // Navigate to instance details
    await instanceDetailsPage.goto(runningInstance.id);

    // Verify initial status is running
    expect(await instanceDetailsPage.isRunning()).toBe(true);

    // Verify stop button is enabled
    expect(await instanceDetailsPage.isStopButtonEnabled()).toBe(true);

    // Stop the instance
    await instanceDetailsPage.stopInstance();

    // Wait for status change to stopped
    await instanceDetailsPage.waitForStatusChange('stopped');

    // Verify status changed to stopped
    expect(await instanceDetailsPage.isStopped()).toBe(true);
  });

  test('should delete an instance with confirmation', async ({ authenticatedPage }) => {
    // This test would create a temporary instance first, then delete it
    // For now, we'll test the UI flow

    // Navigate to a test instance
    const testInstance = mockInstances[0];
    await instanceDetailsPage.goto(testInstance.id);

    // Click delete button
    await instanceDetailsPage.deleteButton.click();

    // Verify confirmation dialog appears
    await expect(instanceDetailsPage.confirmDeleteButton).toBeVisible({ timeout: 5000 });
    await expect(instanceDetailsPage.cancelButton).toBeVisible();

    // Confirm deletion
    await instanceDetailsPage.confirmDeleteButton.click();

    // Wait for redirect back to instances list
    await authenticatedPage.waitForURL('**/instances', { timeout: 10000 });

    // Verify instance is no longer in list
    await instancesPage.goto();
    expect(await instancesPage.hasInstance(testInstance.name)).toBe(false);
  });

  test('should cancel instance deletion', async ({ authenticatedPage }) => {
    const testInstance = mockInstances[0];

    // Navigate to instance details
    await instanceDetailsPage.goto(testInstance.id);

    // Click delete button
    await instanceDetailsPage.deleteButton.click();

    // Verify confirmation dialog appears
    await expect(instanceDetailsPage.confirmDeleteButton).toBeVisible({ timeout: 5000 });

    // Cancel deletion
    await instanceDetailsPage.cancelButton.click();

    // Verify confirmation dialog is closed
    await expect(instanceDetailsPage.confirmDeleteButton).not.toBeVisible();

    // Verify we're still on details page
    await expect(instanceDetailsPage.heading).toBeVisible();

    // Verify instance still exists
    await instancesPage.goto();
    expect(await instancesPage.hasInstance(testInstance.name)).toBe(true);
  });

  test('should navigate back to instances list', async ({ authenticatedPage }) => {
    const testInstance = mockInstances[0];

    // Navigate to instance details
    await instanceDetailsPage.goto(testInstance.id);

    // Click back button
    await instanceDetailsPage.goBack();

    // Verify navigation back to instances list
    await authenticatedPage.waitForURL('**/instances', { timeout: 5000 });
    await expect(instancesPage.heading).toBeVisible();
  });

  test('should display correct status badges', async ({ authenticatedPage }) => {
    const testInstance = mockInstances[0];

    // Navigate to instance details
    await instanceDetailsPage.goto(testInstance.id);

    const status = await instanceDetailsPage.getInstanceStatus();
    const statusElement = authenticatedPage.locator('[data-testid="instance-status"]');

    // Verify status badge has correct styling class
    if (status.toLowerCase().includes('running') || status.includes('运行中')) {
      await expect(statusElement).toHaveClass(/success|running|green/);
    } else if (status.toLowerCase().includes('stopped') || status.includes('已停止')) {
      await expect(statusElement).toHaveClass(/stopped|gray|neutral/);
    } else if (status.toLowerCase().includes('pending') || status.includes('等待中')) {
      await expect(statusElement).toHaveClass(/pending|warning|yellow/);
    }
  });

  test('should disable action buttons based on instance state', async ({ authenticatedPage }) => {
    const runningInstance = mockInstances.find((i) => i.status === 'running');
    if (!runningInstance) {
      test.skip();
      return;
    }

    // Navigate to running instance details
    await instanceDetailsPage.goto(runningInstance.id);

    // For running instance, stop should be enabled, start should be disabled
    expect(await instanceDetailsPage.isStopButtonEnabled()).toBe(true);
    expect(await instanceDetailsPage.isStartButtonEnabled()).toBe(false);
  });

  test('should handle start operation errors gracefully', async ({ authenticatedPage }) => {
    const stoppedInstance = mockInstances.find((i) => i.status === 'stopped');
    if (!stoppedInstance) {
      test.skip();
      return;
    }

    // Navigate to instance details
    await instanceDetailsPage.goto(stoppedInstance.id);

    // Mock a failed start operation by intercepting API
    await authenticatedPage.route('**/api/instances/**/start', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Failed to start instance' }),
      });
    });

    // Attempt to start instance
    await instanceDetailsPage.startInstance();

    // Verify error message is displayed
    const errorMessage = await instanceDetailsPage.getErrorMessage();
    expect(errorMessage).toBeTruthy();
    expect(errorMessage).toContain(/error|failed|失败/i);
  });

  test('should refresh instance list', async ({ authenticatedPage }) => {
    // Get initial instance count
    await instancesPage.goto();
    const initialCount = await instancesPage.getInstanceCount();

    // Refresh list
    await instancesPage.refresh();

    // Verify list is still loaded
    await expect(instancesPage.heading).toBeVisible();
    await expect(instancesPage.instanceList).toBeVisible();

    // Count should be the same or updated
    const newCount = await instancesPage.getInstanceCount();
    expect(newCount).toBeGreaterThanOrEqual(0);
  });

  test('should search instances by name', async ({ authenticatedPage }) => {
    await instancesPage.goto();

    // Search for a specific instance
    const searchQuery = 'Personal';
    await instancesPage.searchInstances(searchQuery);

    // Wait for results
    await authenticatedPage.waitForTimeout(1000);

    // Verify search results
    const instanceCount = await instancesPage.getInstanceCount();

    // Clear search
    await instancesPage.clearSearch();
    await authenticatedPage.waitForTimeout(1000);

    // Verify all instances are shown again
    const allInstancesCount = await instancesPage.getInstanceCount();
    expect(allInstancesCount).toBeGreaterThanOrEqual(instanceCount);
  });

  test('should display empty state when no instances exist', async ({ authenticatedPage }) => {
    // Mock empty response
    await authenticatedPage.route('**/api/instances', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ instances: [] }),
      });
    });

    await instancesPage.goto();
    await instancesPage.waitForLoad();

    // Verify empty state is shown
    expect(await instancesPage.isEmptyStateVisible()).toBe(true);

    // Verify create button is still visible
    await expect(instancesPage.createButton).toBeVisible();
  });

  test('should handle concurrent instance operations', async ({ authenticatedPage }) => {
    const runningInstance = mockInstances.find((i) => i.status === 'running');
    if (!runningInstance) {
      test.skip();
      return;
    }

    // Navigate to instance details
    await instanceDetailsPage.goto(runningInstance.id);

    // Try to start while already running (should fail gracefully)
    await instanceDetailsPage.startInstance();

    // Verify appropriate error or warning
    const errorMessage = await instanceDetailsPage.getErrorMessage();
    expect(errorMessage || (await instanceDetailsPage.isStartButtonEnabled()) === false).toBe(
      true
    );
  });
});
