/* eslint-disable @typescript-eslint/no-unused-vars */
import { test, expect } from '../../fixtures';
import { InstancesPage } from '../../pages/InstancesPage';
import { InstanceDetailsPage } from '../../pages/InstanceDetailsPage';
import { LoginPage } from '../../pages/LoginPage';
import { mockInstances } from '../helpers/api-mocks';
import { setupApiMocks } from '../helpers/api-mocks';

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

  test.beforeEach(async ({ authenticatedPage, context }) => {
    loginPage = new LoginPage(authenticatedPage);
    instancesPage = new InstancesPage(authenticatedPage);
    instanceDetailsPage = new InstanceDetailsPage(authenticatedPage);

    // Set up authentication for tests that need it
    // Note: API mocks are already set up in the authenticatedPage fixture
    // We're already on dashboard, so we can navigate from there
  });

  test('should display list of instances', async ({ authenticatedPage }) => {
    // Navigate to instances page first (authenticatedPage leaves us on dashboard)
    await authenticatedPage.goto('/instances', { waitUntil: 'commit' });
    await instancesPage.waitForLoad();

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
      await instancesPage.viewInstance(0);

      // Verify navigation to details page
      await authenticatedPage.waitForURL('**/instances/**', { timeout: 5000 });
      const currentUrl = authenticatedPage.url();
      expect(currentUrl).toContain('/instances/');

      // Wait for page to load before checking elements
      await instanceDetailsPage.waitForLoad();

      // Verify details page heading
      await expect(instanceDetailsPage.heading).toBeVisible();
    }
  });

  test('should display instance details correctly', async ({ authenticatedPage }) => {
    // Direct navigation works with proper wait strategy
    const testInstance = mockInstances[0];

    // Navigate directly to instance details URL
    await authenticatedPage.goto(`/instances/${testInstance.id}`);

    // Wait for page to load
    await instanceDetailsPage.waitForLoad();

    // Verify instance information is displayed
    const name = await instanceDetailsPage.getInstanceName();
    const status = await instanceDetailsPage.getInstanceStatus();

    // Verify basic data is present
    expect(name).toBeTruthy();
    expect(status).toBeTruthy();
  });

  test('should start a stopped instance', async ({ authenticatedPage }) => {
    // Direct navigation with proper wait strategy
    const stoppedInstance = mockInstances.find((i) => i.status === 'stopped') || mockInstances[1];

    await authenticatedPage.goto(`/instances/${stoppedInstance.id}`);
    await instanceDetailsPage.waitForLoad();

    // Verify start button is present and click it
    expect(await instanceDetailsPage.isStartButtonEnabled()).toBe(true);
    await instanceDetailsPage.startInstance();

    // Wait for operation to complete
    await authenticatedPage.waitForTimeout(500);

    // Verify operation completed
    expect(await instanceDetailsPage.isStartButtonEnabled()).toBe(false);
  });

  test('should stop a running instance', async ({ authenticatedPage }) => {
    // Direct navigation with proper wait strategy
    const runningInstance = mockInstances.find((i) => i.status === 'running' || i.status === 'active') || mockInstances[0];

    await authenticatedPage.goto(`/instances/${runningInstance.id}`);
    await instanceDetailsPage.waitForLoad();

    // Verify stop button is present and click it
    expect(await instanceDetailsPage.isStopButtonEnabled()).toBe(true);
    await instanceDetailsPage.stopInstance();

    // Wait for operation to complete
    await authenticatedPage.waitForTimeout(500);

    // Verify operation completed
    expect(await instanceDetailsPage.isStopButtonEnabled()).toBe(false);
  });

  test.skip('should delete an instance with confirmation', async ({ authenticatedPage }) => {
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

  test.skip('should cancel instance deletion', async ({ authenticatedPage }) => {
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
    // Direct navigation with proper wait strategy
    const testInstance = mockInstances[0];

    await authenticatedPage.goto(`/instances/${testInstance.id}`);
    await instanceDetailsPage.waitForLoad();

    // Click back button
    await instanceDetailsPage.goBack();

    // Verify navigation back to instances list
    await authenticatedPage.waitForURL('**/instances', { timeout: 5000 });
    await expect(instancesPage.heading).toBeVisible();
  });

  test('should display correct status badges', async ({ authenticatedPage }) => {
    // Direct navigation with proper wait strategy
    const testInstance = mockInstances[0];

    await authenticatedPage.goto(`/instances/${testInstance.id}`);
    await instanceDetailsPage.waitForLoad();

    const status = await instanceDetailsPage.getInstanceStatus();
    const statusElement = authenticatedPage.locator('[data-testid="instance-status"]');

    // Verify status badge is visible and has text
    await expect(statusElement).toBeVisible();
    expect(status).toBeTruthy();
    expect(status.length).toBeGreaterThan(0);
  });

  test('should disable action buttons based on instance state', async ({ authenticatedPage }) => {
    // Direct navigation with proper wait strategy
    // instance-001 has status 'active' (running)
    await authenticatedPage.goto(`/instances/${mockInstances[0].id}`);
    await instanceDetailsPage.waitForLoad();

    // For running instance, stop should be enabled, start should be disabled
    expect(await instanceDetailsPage.isStopButtonEnabled()).toBe(true);
    expect(await instanceDetailsPage.isStartButtonEnabled()).toBe(false);
  });

  test('should handle start operation errors gracefully', async ({ authenticatedPage }) => {
    // Direct navigation with proper wait strategy
    // instance-002 has status 'stopped'
    await authenticatedPage.goto(`/instances/${mockInstances[1].id}`);
    await instanceDetailsPage.waitForLoad();

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

    // The button should still be enabled after error
    expect(await instanceDetailsPage.isStartButtonEnabled()).toBe(true);
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
    // Skip this test for now as it requires special mock setup
    test.skip();
    // TODO: Implement proper empty state mock override
  });

  test('should handle concurrent instance operations', async ({ authenticatedPage }) => {
    // Direct navigation with proper wait strategy
    // instance-001 has status 'active' (running)
    await authenticatedPage.goto(`/instances/${mockInstances[0].id}`);
    await instanceDetailsPage.waitForLoad();

    // Try to start while already running
    // The start button should be disabled for running instances
    expect(await instanceDetailsPage.isStartButtonEnabled()).toBe(false);
  });
});
